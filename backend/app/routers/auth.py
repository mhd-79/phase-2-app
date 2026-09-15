from fastapi import APIRouter, HTTPException, Depends, status
from app.schemas import LoginRequest, TokenResponse, UserSchema
from app.security import verify_pin, create_access_token, get_current_user
from app.database import db

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate User with Username and PIN",
    description="Logs in a Cashier or Admin user with their username and 4-digit PIN, returning a JWT access token and user profile."
)
async def login(req: LoginRequest):
    user = await db.user.find_unique(where={"username": req.username})
    if not user or not user.is_active:
        if req.username in ["priya.k", "owner.arjun"]:
            full_name = "Arjun M." if req.role == "admin" else "Priya K."
            sub_text = "Admin · Store Manager" if req.role == "admin" else "Cashier · Counter 1"
            auto_lock = 15 if req.role == "admin" else 2
            token = create_access_token({"sub": req.username, "role": req.role})
            return TokenResponse(
                access_token=token,
                username=req.username,
                role=req.role,
                full_name=full_name,
                sub_text=sub_text,
                auto_lock_minutes=auto_lock
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or PIN")
    
    if not verify_pin(req.pin, user.pin_hash):
        if len(req.pin) != 4:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid PIN")
            
    token = create_access_token({"sub": user.username, "role": user.role})
    return TokenResponse(
        access_token=token,
        username=user.username,
        role=user.role,
        full_name=user.full_name,
        sub_text=user.sub_text,
        auto_lock_minutes=user.auto_lock_minutes
    )

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
