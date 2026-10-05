"""OKUTO IQ chatbot: routing, grounding, Ollama handling and access control. No database or Ollama needed."""
import asyncio
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from app import ai_chatbot as bot
from app import insights_engine as eng
from app.config import settings
from test_ai_insights_module import _dataset

run = asyncio.run


# ---- routing ---------------------------------------------------------------------------------------------------
@pytest.mark.parametrize("question,expected", [
    ("How are sales this week?", "sales"),
    ("which items are low on stock?", "stock"),
    ("how much should I reorder?", "restock"),
    ("which vendor is cheapest", "vendor_prices"),
    ("forecast for next 7 days", "forecast"),
    ("what is trending and what is slow moving", "trending"),
    ("any discount recommendations for near expiry items", "discounts"),
    ("how are my repeat customers", "customers"),
    ("give me an overall summary", "summary"),
])
def test_detect_topics(question, expected):
    assert expected in bot.detect_topics(question)


def test_detect_topics_is_capped_and_unrelated_text_matches_nothing():
    assert len(bot.detect_topics("sales stock vendor forecast discount trend customer summary")) <= bot.MAX_TOPICS
    assert bot.detect_topics("tell me a joke") == []


@pytest.mark.parametrize("question,days", [
    ("sales today", 7), ("weekly performance", 7), ("monthly performance", 30),
    ("revenue for the last 45 days", 45), ("last 3 days sales", 7), ("last 500 days", 90), ("how are sales", 30),
])
def test_detect_days(question, days):
    assert bot.detect_days(question) == days


# ---- grounding: context comes from the real engine output --------------------------------------------------------
def test_gather_uses_engine_results():
    ds = _dataset()
    ctx, sources = run(bot.gather(["stock", "restock"], "what should I reorder", 30, ds, None))
    assert sources == ["Low-stock & reorder list", "Restock recommendations"]
    fast = next(i for i in ctx["low_stock_reorder_list"]["items"] if i["sku"] == "FAST")
    engine_fast = next(i for i in eng.low_stock_reorder_list(ds)["items"] if i["sku"] == "FAST")
    assert fast["suggested_qty"] == engine_fast["suggested_qty"]
    assert ctx["restock_recommendations"]["items"][0]["recommended_qty"] > 0


def test_gather_sales_has_daily_and_weekly_views():
    ctx, _ = run(bot.gather(["sales"], "sales this month", 30, _dataset(), None))
    s = ctx["sales_and_revenue"]
    assert len(s["daily_last_14"]) == 14 and s["weekly_totals"]
    assert sum(w["revenue"] for w in s["weekly_totals"]) == pytest.approx(s["kpis"]["revenue"], rel=0.01)


def test_product_lookup_by_name_and_sku():
    ds = _dataset()
    ctx, _ = run(bot.gather(["stock"], "how is FAST doing", 30, ds, None))
    p = ctx["product_details"][0]
    assert p["sku"] == "FAST" and p["stock"] == 10 and p["units_sold_30d"] == pytest.approx(ds.units("FAST", 30), abs=0.01)
    assert "product_details" not in run(bot.gather(["stock"], "nothing specific here", 30, ds, None))[0]


def test_empty_database_is_reported_not_invented():
    empty = eng.Dataset(today=_dataset().today, history_days=120, items={}, vendors={}, lines=[], bills=[], tenders=[], returns=[],
                        pos=[], grns=[], preturns=[], batches=[], discounts=[])
    ctx, _ = run(bot.gather(["sales", "summary"], "how are sales", 30, empty, None))
    assert ctx["sales_and_revenue"]["status"] == "insufficient_data"
    assert "No sales" in bot.fallback_answer(ctx) or "No items" in bot.fallback_answer(ctx)


def test_context_json_respects_budget_and_is_valid_json():
    ds = _dataset()
    ctx, _ = run(bot.gather(list(bot.TOPIC_ORDER[:4]), "everything", 30, ds, None))
    text = bot.build_context_json(ctx)
    assert len(text) <= bot.CONTEXT_CHAR_BUDGET
    json.loads(text)


def test_fallback_answer_contains_real_figures():
    ds = _dataset()
    ctx, _ = run(bot.gather(["summary"], "overall summary", 30, ds, None))
    text = bot.fallback_answer(ctx)
    assert eng.business_summary(ds, 30)["headline"] in text and "Inventory health" in text


def test_prompt_forbids_invention_and_includes_data():
    msgs = bot.build_messages("hi?", [{"role": "user", "content": "a"}] * 10, '{"x":1}', "2026-09-30")
    assert msgs[0]["role"] == "system" and '{"x":1}' in msgs[0]["content"] and "Never invent" in msgs[0]["content"]
    assert len(msgs) == 1 + bot.MAX_HISTORY + 1 and msgs[-1]["content"] == "hi?"


# ---- Ollama client -----------------------------------------------------------------------------------------------
def _mock_ollama(monkeypatch, handler):
    real = httpx.AsyncClient
    monkeypatch.setattr(bot.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))


def test_ollama_chat_success(monkeypatch):
    seen = {}

    def handler(request):
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"message": {"role": "assistant", "content": " Sales are up. "}})
    _mock_ollama(monkeypatch, handler)
    assert run(bot.ollama_chat([{"role": "user", "content": "q"}])) == "Sales are up."
    assert seen["body"]["model"] == settings.OLLAMA_MODEL and seen["body"]["stream"] is False


@pytest.mark.parametrize("status,code", [(404, "model_missing"), (500, "error")])
def test_ollama_chat_errors(monkeypatch, status, code):
    _mock_ollama(monkeypatch, lambda r: httpx.Response(status, json={}))
    with pytest.raises(bot.OllamaUnavailable) as e:
        run(bot.ollama_chat([{"role": "user", "content": "q"}]))
    assert e.value.code == code


def test_ollama_chat_unreachable(monkeypatch):
    def handler(request):
        raise httpx.ConnectError("refused")
    _mock_ollama(monkeypatch, handler)
    with pytest.raises(bot.OllamaUnavailable) as e:
        run(bot.ollama_chat([{"role": "user", "content": "q"}]))
    assert e.value.code == "unreachable"


# ---- API + access control ----------------------------------------------------------------------------------------
@pytest.fixture
def client(monkeypatch):
    from app.main import app
    from app.routers import ai_chatbot as router_mod
    from app.security import get_current_user

    state = SimpleNamespace(user=SimpleNamespace(username="a", role="admin", phase_access=2))
    app.dependency_overrides[get_current_user] = lambda: state.user

    async def fake_dataset():
        return _dataset()
    monkeypatch.setattr(router_mod, "load_dataset", fake_dataset)
    monkeypatch.setattr(router_mod, "get_db", lambda: None)

    # in-memory stand-in for the OkutoIqSubscription row (active for 10 days by default)
    store = SimpleNamespace(row=SimpleNamespace(status="active", started_at=datetime.now(timezone.utc),
                                                expires_at=datetime.now(timezone.utc) + timedelta(days=10), activated_by="a"),
                            audit=[])

    async def load():
        return store.row

    async def save(data):
        base = store.row or SimpleNamespace(status="inactive", started_at=None, expires_at=None, activated_by=None)
        store.row = SimpleNamespace(**{**vars(base), **data})
        return store.row

    async def audit(username, action, details):
        store.audit.append(action)
    monkeypatch.setattr(router_mod, "_load_subscription", load)
    monkeypatch.setattr(router_mod, "_save_subscription", save)
    monkeypatch.setattr(router_mod, "_audit", audit)
    c = TestClient(app)                      # no `with`: the lifespan (database connect / seed) is not needed here
    c.state = state
    c.sub = store
    c.headers.update({"Authorization": "Bearer test"})
    yield c
    app.dependency_overrides.clear()


def test_chat_answers_with_llm(client, monkeypatch):
    async def fake_chat(messages):
        assert "DATA (JSON)" in messages[0]["content"] and "FAST" in messages[0]["content"]
        return "Reorder FAST now."
    monkeypatch.setattr(bot, "ollama_chat", fake_chat)
    r = client.post("/api/v1/ai-chatbot/chat", json={"message": "what should I reorder?"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["answer"] == "Reorder FAST now." and body["llm_used"] is True and body["sources"]


def test_chat_falls_back_to_real_figures_when_ollama_is_down(client, monkeypatch):
    async def down(messages):
        raise bot.OllamaUnavailable("Ollama is not running.", "unreachable")
    monkeypatch.setattr(bot, "ollama_chat", down)
    body = client.post("/api/v1/ai-chatbot/chat", json={"message": "overall summary"}).json()
    assert body["llm_used"] is False and "Ollama" in body["warning"] and "Inventory health" in body["answer"]


def test_greeting_needs_no_data_or_llm(client):
    body = client.post("/api/v1/ai-chatbot/chat", json={"message": "hello"}).json()
    assert "OKUTO IQ" in body["answer"] and body["llm_used"] is False


def test_follow_up_inherits_previous_topic(client, monkeypatch):
    async def fake_chat(messages):
        return "ok"
    monkeypatch.setattr(bot, "ollama_chat", fake_chat)
    body = client.post("/api/v1/ai-chatbot/chat", json={
        "message": "and for the last 14 days?",
        "history": [{"role": "user", "content": "sales"}, {"role": "assistant", "content": "..."}]}).json()
    assert body["topics"] == ["sales"]


def test_only_phase2_admins_get_in(client):
    client.state.user = SimpleNamespace(username="c", role="cashier", phase_access=2)
    assert client.get("/api/v1/ai-chatbot/status").status_code == 403
    assert client.post("/api/v1/ai-chatbot/chat", json={"message": "sales"}).status_code == 403
    client.state.user = SimpleNamespace(username="p1", role="admin", phase_access=1)
    assert client.get("/api/v1/ai-chatbot/status").status_code == 403
    assert client.post("/api/v1/ai-chatbot/chat", json={"message": "sales"}).status_code == 403


def test_disabled_module_is_inert(client, monkeypatch):
    monkeypatch.setattr(settings, "AI_CHATBOT_ENABLED", False)
    assert client.get("/api/v1/ai-chatbot/status").json() == {"enabled": False}
    assert client.post("/api/v1/ai-chatbot/chat", json={"message": "sales"}).status_code == 404


def test_blank_and_oversized_messages_rejected(client):
    assert client.post("/api/v1/ai-chatbot/chat", json={"message": "   "}).status_code == 422
    assert client.post("/api/v1/ai-chatbot/chat", json={"message": "x" * 5000}).status_code == 422


# ---- OKUTO IQ subscription (add-on) ------------------------------------------------------------------------------
NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)


def _row(status="active", days=10):
    return SimpleNamespace(status=status, started_at=NOW - timedelta(days=20), expires_at=NOW + timedelta(days=days))


def test_subscription_state_rules():
    assert bot.subscription_state(None, NOW) == "none"
    assert bot.subscription_state(_row("inactive"), NOW) == "none"
    assert bot.subscription_state(_row(days=1), NOW) == "active"
    assert bot.subscription_state(_row(days=0), NOW) == "expired"           # expires exactly now
    assert bot.subscription_state(_row(days=-3), NOW) == "expired"
    naive = SimpleNamespace(status="active", started_at=None, expires_at=datetime(2026, 10, 9))
    assert bot.subscription_state(naive, NOW) == "active"                   # naive DB timestamps are treated as UTC


def test_subscription_view_days_left_and_removed_state():
    v = bot.subscription_view(_row(days=10), NOW, 30)
    assert v["state"] == "active" and v["days_left"] == 10 and v["period_days"] == 30
    gone = bot.subscription_view(_row("inactive"), NOW, 30)
    assert gone == {"state": "none", "started_at": None, "expires_at": None, "days_left": None, "period_days": 30}
    exp = bot.subscription_view(_row(days=-2), NOW, 30)
    assert exp["state"] == "expired" and exp["days_left"] is None and exp["expires_at"]


def test_chat_blocked_without_or_after_subscription(client):
    client.sub.row = None
    r = client.post("/api/v1/ai-chatbot/chat", json={"message": "sales"})
    assert r.status_code == 402 and "subscribe" in r.json()["detail"].lower()
    client.sub.row = SimpleNamespace(status="active", started_at=None, expires_at=datetime.now(timezone.utc) - timedelta(days=1))
    r = client.post("/api/v1/ai-chatbot/chat", json={"message": "sales"})
    assert r.status_code == 402 and "expired" in r.json()["detail"].lower()
    st = client.get("/api/v1/ai-chatbot/status").json()                   # the button still gets what it needs to stay visible
    assert st["enabled"] is True and st["subscription"]["state"] == "expired"


def test_activate_then_renew_extends_from_current_expiry(client):
    client.sub.row = None
    v = client.post("/api/v1/ai-chatbot/subscription").json()
    assert v["state"] == "active" and 29 <= v["days_left"] <= 30
    first_expiry = datetime.fromisoformat(v["expires_at"])
    v2 = client.post("/api/v1/ai-chatbot/subscription").json()
    assert datetime.fromisoformat(v2["expires_at"]) - first_expiry == timedelta(days=settings.OKUTO_IQ_PERIOD_DAYS)
    assert client.sub.audit == ["OKUTO_IQ_ACTIVATED", "OKUTO_IQ_RENEWED"]


def test_renew_after_expiry_starts_from_now(client):
    client.sub.row = SimpleNamespace(status="active", started_at=None, expires_at=datetime.now(timezone.utc) - timedelta(days=40))
    v = client.post("/api/v1/ai-chatbot/subscription").json()
    assert v["state"] == "active" and 29 <= v["days_left"] <= 30


def test_remove_clears_only_the_subscription(client, monkeypatch):
    assert client.delete("/api/v1/ai-chatbot/subscription").json()["state"] == "none"
    assert (client.sub.row.status, client.sub.row.expires_at) == ("inactive", None)
    assert client.sub.audit == ["OKUTO_IQ_REMOVED"]
    assert client.post("/api/v1/ai-chatbot/chat", json={"message": "sales"}).status_code == 402
    assert client.delete("/api/v1/ai-chatbot/subscription").status_code == 200   # removing twice is harmless
    assert client.post("/api/v1/ai-chatbot/subscription").json()["state"] == "active"   # and it can be plugged in again


def test_subscription_endpoints_are_phase2_admin_only(client):
    for user in (SimpleNamespace(username="c", role="cashier", phase_access=2), SimpleNamespace(username="p1", role="admin", phase_access=1)):
        client.state.user = user
        assert client.get("/api/v1/ai-chatbot/subscription").status_code == 403
        assert client.post("/api/v1/ai-chatbot/subscription").status_code == 403
        assert client.delete("/api/v1/ai-chatbot/subscription").status_code == 403


def test_subscription_endpoints_inert_when_module_disabled(client, monkeypatch):
    monkeypatch.setattr(settings, "AI_CHATBOT_ENABLED", False)
    assert client.get("/api/v1/ai-chatbot/subscription").status_code == 404
    assert client.post("/api/v1/ai-chatbot/subscription").status_code == 404
    assert client.delete("/api/v1/ai-chatbot/subscription").status_code == 404
