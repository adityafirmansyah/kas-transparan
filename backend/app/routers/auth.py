"""Auth router: login issues a JWT scoped to a user+komunitas."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_access_token, verify_password
from app.models.models import User
from app.schemas.schemas import LoginRequest, TokenResponse

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
    return TokenResponse(access_token=token, role=user.role.value, komunitas_id=user.komunitas_id)
