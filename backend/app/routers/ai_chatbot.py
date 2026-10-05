"""
OKUTO IQ chatbot API (Phase 2 admin) — /api/v1/ai-chatbot/*.

A thin conversational layer: it routes the question to the existing AI Insights engine, loads the live PostgreSQL
dataset through the AI Insights router's own loader, and lets a local Ollama model explain the results.
Plug-in/plug-out: set AI_CHATBOT_ENABLED=false and /chat answers 404 while /status reports enabled=false.
"""
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app import ai_chatbot as bot
from app.config import settings
from app.database import get_db
from app.routers.ai_insights_module import _SCHEMA_HINT, load_dataset
from app.security import require_admin

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/ai-chatbot", tags=["AI Chatbot"], dependencies=[Depends(require_admin)])


# --------------------------------------------------------------------------- subscription (add-on)
SUB_ID = "okuto_iq"


async def _load_subscription():
    """The single OkutoIqSubscription row (or None). Isolated so tests can replace it."""
    db = get_db()
    if not db.is_connected():
        raise HTTPException(status_code=503, detail="Database unavailable — cannot check the OKUTO IQ subscription.")
    try:
        return await db.okutoiqsubscription.find_unique(where={"id": SUB_ID})
    except Exception as exc:                                  # noqa: BLE001 - usually a Prisma client / table that is out of date
        logger.exception("OKUTO IQ: could not read the subscription")
        raise HTTPException(status_code=503, detail=f"Could not read the OKUTO IQ subscription ({type(exc).__name__}). {_SCHEMA_HINT}")


async def _save_subscription(data: dict):
    db = get_db()
    try:
        return await db.okutoiqsubscription.upsert(where={"id": SUB_ID}, data={"create": {"id": SUB_ID, **data}, "update": data})
    except Exception as exc:                                  # noqa: BLE001
        logger.exception("OKUTO IQ: could not save the subscription")
        raise HTTPException(status_code=503, detail=f"Could not save the OKUTO IQ subscription ({type(exc).__name__}). {_SCHEMA_HINT}")


async def _audit(username: str, action: str, details: dict):
    """Best effort: an audit-log problem must never block the admin (e.g. a token user without a User row)."""
    try:
        await get_db().auditlog.create(data={"username": username, "action": action, "details_json": json.dumps(details)})
    except Exception:                                         # noqa: BLE001
        logger.warning("OKUTO IQ: audit log entry %s was not written", action)


async def _subscription_view() -> dict:
    return bot.subscription_view(await _load_subscription(), datetime.now(timezone.utc), settings.OKUTO_IQ_PERIOD_DAYS)


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=bot.MAX_MESSAGE_CHARS)
    history: List[ChatTurn] = Field(default_factory=list, max_length=40)


@router.get("/status")
async def chatbot_status():
    if not settings.AI_CHATBOT_ENABLED:
        return {"enabled": False}
    return {"enabled": True, "subscription": await _subscription_view(), **await bot.ollama_status()}


@router.get("/subscription")
async def get_subscription():
    if not settings.AI_CHATBOT_ENABLED:
        raise HTTPException(status_code=404, detail="The AI chatbot is disabled.")
    return await _subscription_view()


@router.post("/subscription")
async def activate_subscription(user=Depends(require_admin)):
    """Activate or renew OKUTO IQ for one period. (No payment step yet: this is where one would plug in.)"""
    if not settings.AI_CHATBOT_ENABLED:
        raise HTTPException(status_code=404, detail="The AI chatbot is disabled.")
    row = await _load_subscription()
    now = datetime.now(timezone.utc)
    active = bot.subscription_state(row, now) == "active"
    start = (row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=timezone.utc)) if active else now
    expires = start + timedelta(days=settings.OKUTO_IQ_PERIOD_DAYS)
    await _save_subscription({"status": "active", "started_at": row.started_at if active else now, "expires_at": expires,
                              "activated_by": user.username})
    await _audit(user.username, "OKUTO_IQ_RENEWED" if active else "OKUTO_IQ_ACTIVATED",
                 {"expires_at": expires.isoformat(), "period_days": settings.OKUTO_IQ_PERIOD_DAYS})
    return await _subscription_view()


@router.delete("/subscription")
async def remove_subscription(user=Depends(require_admin)):
    """Plug OKUTO IQ out. Only the subscription row is reset; no other feature or business data is touched."""
    if not settings.AI_CHATBOT_ENABLED:
        raise HTTPException(status_code=404, detail="The AI chatbot is disabled.")
    if await _load_subscription() is not None:
        await _save_subscription({"status": "inactive", "started_at": None, "expires_at": None, "activated_by": None})
        await _audit(user.username, "OKUTO_IQ_REMOVED", {})
    return await _subscription_view()


@router.post("/chat")
async def chat(req: ChatRequest):
    if not settings.AI_CHATBOT_ENABLED:
        raise HTTPException(status_code=404, detail="The AI chatbot is disabled.")
    sub = await _subscription_view()
    if sub["state"] != "active":
        raise HTTPException(status_code=402, detail=(
            "Your OKUTO IQ subscription has expired. Please renew it to keep using the assistant." if sub["state"] == "expired"
            else "OKUTO IQ is an add-on. Please subscribe to start using the assistant."))
    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail="Please type a question.")
    history = [{"role": h.role, "content": h.content.strip()} for h in req.history if h.content.strip()]

    topics = bot.detect_topics(message)
    if not topics and bot._GREETING.match(message):
        return {"answer": bot.GREETING_REPLY, "sources": [], "links": [], "topics": [], "llm_used": False,
                "model": settings.OLLAMA_MODEL, "as_of": None, "warning": None}

    if not topics:      # a follow-up such as "and last month?" inherits the topic of the previous question
        for h in reversed(history):
            if h["role"] == "user":
                topics = bot.detect_topics(h["content"])
                break
    if not topics:
        topics = ["summary"]
    days = bot.detect_days(message)

    ds = await load_dataset()      # live PostgreSQL via the AI Insights loader (503 with a reason if unavailable)
    ctx, sources = await bot.gather(topics, message, days, ds, get_db())

    messages = bot.build_messages(message, history, bot.build_context_json(ctx), ds.today.isoformat())
    try:
        answer = await bot.ollama_chat(messages)
        llm_used, warning = True, None
    except bot.OllamaUnavailable as exc:
        logger.warning("OKUTO IQ: local LLM unavailable (%s): %s", exc.code, exc.reason)
        answer = bot.fallback_answer(ctx)
        llm_used = False
        warning = (f"{exc.reason} Showing the figures from AI Insights without the AI explanation. "
                   f"Start Ollama and make sure the model is installed (ollama pull {settings.OLLAMA_MODEL}).")
    return {"answer": answer, "sources": sources, "links": bot.build_links(topics, sources), "topics": topics, "llm_used": llm_used,
            "model": settings.OLLAMA_MODEL, "as_of": ds.today.isoformat(), "warning": warning}
