import logging
from fastapi import APIRouter, HTTPException, Depends, status
import json
from datetime import datetime
from typing import Optional
from app.schemas import LoginRequest, TokenResponse, UserSchema, ForgotPinRequest
from app.security import verify_pin, get_pin_hash, create_access_token, get_current_user
from app.database import db, connect_db

logger = logging.getLogger("okuto_billing.auth")

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate User with Username and PIN",
    description="Authenticates a user against their stored hashed PIN in the database. Returns a JWT access token and user profile."
)
async def login(req: LoginRequest):
    # 1. Validate required fields
    if not req.username or not req.pin:
        logger.warning("Login rejected: missing username or PIN")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username and PIN are required"
        )

    username = str(req.username).strip()
    pin = str(req.pin).strip()
    role_requested = str(req.role).strip().lower() if req.role else None

    if not username or not pin:
        logger.warning("Login rejected: empty username or PIN after trimming")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username and PIN cannot be empty"
        )

    # 2. Ensure database is connected with automatic reconnection
    if not db.is_connected():
        try:
            logger.info("Database not connected; connecting prior to login verification...")
            await connect_db()
        except Exception as conn_err:
            logger.error(f"Database connection error during login for user '{username}': {conn_err}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database service temporarily unavailable. Please retry in a moment."
            )

    # 3. Query user account from database
    try:
        user = await db.user.find_unique(where={"username": username})
    except Exception as db_err:
        logger.error(f"Database query error fetching user '{username}': {db_err}", exc_info=True)
        # Attempt reconnection once in case of dropped pooler connection
        try:
            await connect_db()
            user = await db.user.find_unique(where={"username": username})
        except Exception as retry_err:
            logger.error(f"Retry query failed for user '{username}': {retry_err}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database error while verifying user credentials."
            )

    if not user:
        logger.warning(f"Login failed: user '{username}' not found")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or PIN"
        )

    # 4. Check account active status
    if not user.is_active:
        logger.warning(f"Login failed: account '{username}' is disabled")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is inactive or disabled. Contact administrator."
        )

    # 5. Strictly verify the entered PIN against the stored hash
    if not user.pin_hash or not verify_pin(pin, user.pin_hash):
        logger.warning(f"Login failed: invalid PIN for user '{username}'")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or PIN" 
        )

    # 6. Verify role authorization if role is specified
    if role_requested:
        if role_requested not in ["admin", "cashier"]:
            logger.warning(f"Login rejected: unknown role '{role_requested}' for user '{username}'")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid role specified. Supported roles are 'admin' or 'cashier'."
            )
        user_role = (user.role or "").strip().lower()
        # Admin accounts can access both admin and cashier portals; cashier accounts cannot access admin portal
        if role_requested != user_role and not (user_role == "admin" and role_requested == "cashier"):
            logger.warning(f"Login rejected: user '{username}' ({user_role}) unauthorized for role '{role_requested}'")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Unauthorized: Account '{username}' does not have '{role_requested}' privileges"
            )

    # 7. Safe background upgrade of legacy/plain text PIN to PBKDF2 hash
    try:
        if user.pin_hash and not user.pin_hash.startswith("$pbkdf2"):
            await db.user.update(
                where={"id": user.id},
                data={"pin_hash": get_pin_hash(pin)}
            )
            logger.info(f"Successfully upgraded credentials to PBKDF2 for user '{username}'")
    except Exception as upgrade_err:
        logger.warning(f"Non-fatal notice updating PIN hash for user '{username}': {upgrade_err}")

    # 8. Create JWT token and return complete user profile with null-safe fallbacks
    token = create_access_token({"sub": user.username, "role": user.role})
    logger.info(f"Successful login for user '{username}' with role '{user.role}'")

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        username=user.username,
        role=user.role,
        full_name=user.full_name or user.username,
        sub_text=user.sub_text or (f"Staff · {user.role.title()}"),
        auto_lock_minutes=user.auto_lock_minutes if user.auto_lock_minutes is not None else 15
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
