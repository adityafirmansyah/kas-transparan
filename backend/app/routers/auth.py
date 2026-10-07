"""Auth router: login issues a JWT scoped to a user+komunitas."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.models.models import User
from app.schemas.schemas import (
    ChangePasswordRequest,
    ChangePasswordResponse,
    LoginRequest,
    TokenResponse,
    UserOut,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Username atau password salah"
        )

    token = create_access_token(
        {"sub": user.id, "role": user.role.value, "komunitas_id": user.komunitas_id}
    )
    return TokenResponse(
        access_token=token,
        role=user.role.value,
        komunitas_id=user.komunitas_id,
        user_id=user.id,
        username=user.username,
    )


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return user


@router.post("/change-password", response_model=ChangePasswordResponse)
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Password saat ini salah")

    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password baru minimal 6 karakter")

    if verify_password(payload.new_password, user.hashed_password):
        raise HTTPException(
            status_code=400, detail="Password baru tidak boleh sama dengan password saat ini"
        )

    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return ChangePasswordResponse()
