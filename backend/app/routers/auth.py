from fastapi import APIRouter, HTTPException, Depends, status
import json
from datetime import datetime
from app.schemas import LoginRequest, TokenResponse, UserSchema, ForgotPinRequest
from app.security import verify_pin, get_pin_hash, create_access_token, get_current_user
from app.database import db

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate User with Username and PIN",
    description="Authenticates a user against their stored hashed PIN in the database. Returns a JWT access token and user profile."
)
async def login(req: LoginRequest):
    if not req.username or not req.pin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username and PIN are required")

    user = await db.user.find_unique(where={"username": req.username.strip()})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or PIN")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is inactive or disabled. Contact administrator.")

    # Strictly verify the entered PIN against the hashed credential in the database
    if not verify_pin(req.pin.strip(), user.pin_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or PIN")

    # If the user's PIN in DB is not yet a secure PBKDF2 hash, upgrade it immediately
    if not user.pin_hash.startswith("$pbkdf2"):
        await db.user.update(
            where={"id": user.id},
            data={"pin_hash": get_pin_hash(req.pin.strip())}
        )

    token = create_access_token({"sub": user.username, "role": user.role})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        username=user.username,
        role=user.role,
        full_name=user.full_name,
        sub_text=user.sub_text,
        auto_lock_minutes=user.auto_lock_minutes
    )

@router.post(
    "/forgot-pin",
    summary="Submit Forgot PIN Reset Request",
    description="Submits a PIN reset request to Store Administrators when a cashier or staff member forgets their PIN."
)
async def forgot_pin(req: ForgotPinRequest):
    username = req.username.strip()
    if not username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username is required")

    user = await db.user.find_unique(where={"username": username})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User account '{username}' was not found.")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"User account '{username}' is disabled.")

    # Check for existing pending request
    existing_request = await db.pinresetrequest.find_first(
        where={"username": username, "status": "PENDING"}
    )
    if existing_request:
        if req.reason:
            await db.pinresetrequest.update(
                where={"id": existing_request.id},
                data={"reason": req.reason.strip(), "requested_at": datetime.now()}
            )
        req_id = existing_request.id
    else:
        created = await db.pinresetrequest.create(data={
            "username": username,
            "status": "PENDING",
            "reason": req.reason.strip() if req.reason else "Forgot 4-digit PIN"
        })
        req_id = created.id

    # Create audit log
    await db.auditlog.create(data={
        "username": username,
        "action": f"Submitted Forgot PIN Request",
        "details_json": json.dumps({"reason": req.reason or "Forgot 4-digit PIN", "request_id": req_id})
    })

    return {
        "message": f"PIN reset request submitted successfully for '{username}'. Please ask an Administrator / Manager to reset your PIN in the Admin area.",
        "request_id": req_id,
        "username": username,
        "status": "PENDING"
    }

@router.get(
    "/me",
    response_model=UserSchema,
    summary="Get Active Authenticated User Profile",
    description="Returns full account details and configured auto-lock settings for the currently authenticated bearer token user."
)
async def get_me(user = Depends(get_current_user)):
    return UserSchema(
        id=user.id,
        username=user.username,
        role=user.role,
        full_name=user.full_name,
        sub_text=user.sub_text,
        auto_lock_minutes=user.auto_lock_minutes,
        is_active=user.is_active
    )
