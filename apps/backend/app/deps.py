from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.security import read_session_token

SESSION_COOKIE = "session"


def current_user(
    session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    db: Session = Depends(get_db),
) -> User:
    user_id = read_session_token(session) if session else None
    user = db.get(User, user_id) if user_id else None
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in")
    return user


def require_owner(user: User = Depends(current_user)) -> User:
    if user.role != "OWNER":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Owner access required")
    return user
