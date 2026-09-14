from fastapi import APIRouter, HTTPException, Depends, status
from app.schemas import LoginRequest, TokenResponse, UserSchema
from app.security import verify_pin, create_access_token, get_current_user
from app.database import db

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    user = await db.user.find_unique(where={"username": req.username})
    if not user or not user.is_active:
        # Fallback demo sign-in for prototype if DB not yet populated
        if req.username in ["priya.k", "owner.arjun"]:
            full_name = "Arjun M." if req.role == "admin" else "Priya K."
            sub_text = "Admin · Store Manager" if req.role == "admin" else "Cashier · Counter 1"
            token = create_access_token({"sub": req.username, "role": req.role})
            return TokenResponse(
                access_token=token,
                username=req.username,
                role=req.role,
                full_name=full_name,
                sub_text=sub_text
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or PIN")
    
    if not verify_pin(req.pin, user.pin_hash):
        # Demo bypass: allow any 4-digit PIN in prototype as stated on login screen
        if len(req.pin) != 4:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid PIN")
            
    token = create_access_token({"sub": user.username, "role": user.role})
    return TokenResponse(
        access_token=token,
        username=user.username,
        role=user.role,
        full_name=user.full_name,
        sub_text=user.sub_text
    )

@router.get("/me", response_model=UserSchema)
async def get_me(user = Depends(get_current_user)):
    return UserSchema(
        id=user.id,
        username=user.username,
        role=user.role,
        full_name=user.full_name,
        sub_text=user.sub_text,
        is_active=user.is_active
    )
