"""Usage recording middleware for tracking API requests.

Records all API requests to the Usage table for analytics and billing.
Supports both API key-based requests and session-based requests (chat UI).
"""

import time
from fastapi import Request
from ..models import Usage
from ..config import get_settings


async def record_usage(
    request: Request,
    response,
    start_ns: int,
    model_name: str,
    task: str,
    key_id: int | None = None,
    user_id: int | None = None,
    org_id: int | None = None,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    total_tokens: int | None = None,
    req_id: str | None = None,
    status_code: int | None = None,
    end_ns: int | None = None,
):
    """Record a usage entry for an API request.
    
    Args:
        request: FastAPI request object
        response: Response object (for status code)
        start_ns: Request start time in nanoseconds
        model_name: Name of the model used
        task: Task type (e.g., 'chat', 'completions', 'embeddings', 'chat_ui')
        key_id: API key ID if request was authenticated via API key
        user_id: User ID if request was authenticated via session (e.g., chat UI)
        org_id: Organization ID if available
        prompt_tokens: Number of prompt tokens
        completion_tokens: Number of completion tokens
        total_tokens: Total tokens (prompt + completion)
        req_id: Request ID for tracing
    """
    # Lazy import to avoid circular import at module init time
    try:
        from ..main import SessionLocal  # type: ignore
    except Exception:
        SessionLocal = None  # type: ignore
    if SessionLocal is None:
        return
    try:
        elapsed_ms = int(((end_ns or time.time_ns()) - start_ns) / 1_000_000)
    except Exception:
        elapsed_ms = 0
    try:
        async with SessionLocal() as session:
            rec = Usage(
                org_id=org_id,
                user_id=user_id,
                key_id=key_id,
                model_name=model_name,
                task=task,
                prompt_tokens=int(prompt_tokens or 0),
                completion_tokens=int(completion_tokens or 0),
                total_tokens=int(total_tokens or 0),
                latency_ms=elapsed_ms,
                status_code=int(status_code if status_code is not None else getattr(response, "status_code", 0)),
                req_id=(req_id or request.headers.get("x-request-id", "")),
            )
            session.add(rec)
            await session.commit()
    except Exception:
        # best effort only
        pass


async def get_user_id_from_session(request: Request) -> int | None:
    """Extract user ID from session cookie for usage tracking.
    
    Used by chat UI to associate usage with the logged-in user.
    Returns None if no valid session or user not found.
    """
    try:
        from ..main import SessionLocal  # type: ignore
        from ..models import User
        from sqlalchemy import select
    except Exception:
        return None
    
    if SessionLocal is None:
        return None
    
    username = request.cookies.get("cortex_session")
    if not username:
        return None
    
    try:
        async with SessionLocal() as session:
            result = await session.execute(
                select(User.id).where(User.username == username)
            )
            user_id = result.scalar_one_or_none()
            return user_id
    except Exception:
        return None

