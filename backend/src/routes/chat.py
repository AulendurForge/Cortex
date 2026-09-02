"""Chat-related API endpoints for the Chat Playground feature.

These endpoints provide model information and constraints for the chat UI,
accessible to any authenticated user (not just admins).
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete

from ..auth import require_user_session
from ..state import MODEL_REGISTRY, HEALTH_STATE
from ..config import get_settings
from ..models import ChatSession, ChatMessage, User

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================================================
# Pydantic Schemas
# ============================================================================

class RunningModelInfo(BaseModel):
    """Minimal model info for chat model selection."""
    served_model_name: str
    task: str
    engine_type: str
    state: str


class ModelConstraints(BaseModel):
    """Model constraints and defaults for chat UI."""
    served_model_name: str
    engine_type: str
    task: str
    # Context limits
    context_size: Optional[int] = None      # llama.cpp context_size
    max_model_len: Optional[int] = None     # vLLM max_model_len
    # Recommended defaults
    max_tokens_default: int = 512
    # Request defaults from model config
    request_defaults: Optional[dict] = None
    # Feature support flags
    supports_streaming: bool = True
    supports_system_prompt: bool = True


# Chat Session Schemas
class ChatMessageSchema(BaseModel):
    """A single chat message."""
    id: Optional[int] = None
    role: str  # 'user', 'assistant', 'system'
    content: str
    metrics: Optional[dict] = None
    timestamp: Optional[int] = None


class ChatSessionSummary(BaseModel):
    """Summary of a chat session for list view."""
    id: str
    title: str
    model_name: str
    engine_type: str
    message_count: int
    created_at: int  # Unix timestamp ms
    updated_at: int


class ChatSessionDetail(BaseModel):
    """Full chat session with messages."""
    id: str
    title: str
    model_name: str
    engine_type: str
    constraints: Optional[dict] = None
    messages: List[ChatMessageSchema]
    created_at: int
    updated_at: int


class CreateSessionRequest(BaseModel):
    """Request to create a new chat session."""
    model_name: str
    engine_type: str = "vllm"
    constraints: Optional[dict] = None


class AddMessageRequest(BaseModel):
    """Request to add a message to a session."""
    role: str
    content: str
    metrics: Optional[dict] = None


# ============================================================================
# Helper Functions
# ============================================================================

def _get_session():
    """Get database session factory, handling circular imports."""
    try:
        from ..main import SessionLocal  # type: ignore
        return SessionLocal
    except Exception:
        return None


def _is_model_healthy(url: str, settings) -> bool:
    """Check if a model endpoint is healthy based on recent health check."""
    import time
    h = HEALTH_STATE.get(url) or {}
    ok = bool(h.get("ok"))
    ts = float(h.get("ts", 0.0))
    return ok and (time.time() - ts <= settings.HEALTH_CHECK_TTL_SEC)


async def _get_user_id(username: str) -> int | None:
    """Get user ID from username."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        logger.error("_get_user_id: SessionLocal is None")
        return None
    try:
        async with SessionLocal() as session:
            result = await session.execute(
                select(User.id).where(User.username == username)
            )
            return result.scalar_one_or_none()
    except Exception as e:
        logger.error(f"_get_user_id failed for {username}: {e}")
        return None


def _generate_title(messages: List[ChatMessageSchema]) -> str:
    """Generate a title from the first user message."""
    for msg in messages:
        if msg.role == "user" and msg.content:
            content = msg.content.strip()
            if len(content) > 40:
                return content[:37] + "..."
            return content or "New Chat"
    return "New Chat"


# ============================================================================
# Endpoints
# ============================================================================

async def _running_models(include_embed: bool = False) -> List[RunningModelInfo]:
    """Models that can serve requests right now.

    The supervisor is the source of truth for managed models (DB state ``running``); static
    upstreams from VLLM_GEN_URLS/VLLM_EMB_URLS have no DB row and are taken from the registry when
    the health poller has seen them recently. Embedding models are excluded from the chat picker
    unless ``include_embed`` is set.
    """
    import time
    from ..models import Model
    from sqlalchemy import select
    settings = get_settings()
    out: List[RunningModelInfo] = []
    seen: set[str] = set()
    SessionLocal = _get_session()
    if SessionLocal is not None:
        async with SessionLocal() as session:
            rows = (await session.execute(select(Model).where(Model.state == "running", Model.archived == False))).scalars().all()  # noqa: E712
        for m in rows:
            if not m.served_model_name:
                continue
            seen.add(m.served_model_name)
            out.append(RunningModelInfo(served_model_name=m.served_model_name, task=m.task or "generate",
                                        engine_type=m.engine_type or "vllm", state="running"))
    for name, meta in (MODEL_REGISTRY or {}).items():
        if name in seen:
            continue
        url = str((meta or {}).get("url") or "")
        h = HEALTH_STATE.get(url) or {}
        if not url or not h.get("ok") or time.time() - float(h.get("ts", 0.0)) > settings.HEALTH_CHECK_TTL_SEC:
            continue
        out.append(RunningModelInfo(served_model_name=name, task=str((meta or {}).get("task") or "generate"),
                                    engine_type=str((meta or {}).get("engine_type") or "vllm"), state="running"))
    if not include_embed:
        out = [m for m in out if not (m.task or "").lower().startswith("embed")]
    return sorted(out, key=lambda m: m.served_model_name.lower())


@router.get("/models/running", response_model=List[RunningModelInfo])
async def list_running_models(include_embed: bool = False, user: dict = Depends(require_user_session)):
    """Models available to chat with (running, non-embedding unless ``include_embed``).
    Accessible by any authenticated user."""
    return await _running_models(include_embed=include_embed)


@router.get("/models/{model_name}/constraints", response_model=ModelConstraints)
async def get_model_constraints(
    model_name: str,
    user: dict = Depends(require_user_session),
    settings=Depends(get_settings)
):
    """Get model constraints and defaults for chat UI.
    
    Returns context limits, recommended max_tokens, and any configured
    request defaults. Used by chat UI to:
    - Show context window usage
    - Validate input length before sending
    - Apply model-specific defaults
    
    Accessible by any authenticated user (not just admins).
    """
    from ..models import Model
    from sqlalchemy import select
    
    running = {m.served_model_name for m in await _running_models(include_embed=True)}
    meta = MODEL_REGISTRY.get(model_name) or {}
    if model_name not in running:
        raise HTTPException(status_code=404, detail=f"Model '{model_name}' is not currently running")
    
    # Get full model info from database
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    
    async with SessionLocal() as session:
        result = await session.execute(
            select(Model).where(Model.served_model_name == model_name)
        )
        model = result.scalar_one_or_none()
        
        if not model:
            # Model is in registry but not in DB - use registry info only
            return ModelConstraints(
                served_model_name=model_name,
                engine_type=str(meta.get("engine_type") or "vllm"),
                task=str(meta.get("task") or "generate"),
                max_tokens_default=512,
                supports_streaming=True,
                supports_system_prompt=True,
            )
        
        # Parse request defaults from model config
        request_defaults = None
        if model.request_defaults_json:
            try:
                request_defaults = json.loads(model.request_defaults_json)
            except json.JSONDecodeError:
                pass
        
        # Determine effective context limit
        context_size = None
        max_model_len = None
        
        if model.engine_type == "llamacpp":
            context_size = model.context_size
        else:
            max_model_len = model.max_model_len
        
        # Calculate recommended max_tokens default
        # Use half of context window or 512, whichever is smaller
        effective_context = context_size or max_model_len or 4096
        max_tokens_default = min(512, effective_context // 2)
        
        return ModelConstraints(
            served_model_name=model_name,
            engine_type=model.engine_type or "vllm",
            task=model.task or "generate",
            context_size=context_size,
            max_model_len=max_model_len,
            max_tokens_default=max_tokens_default,
            request_defaults=request_defaults,
            supports_streaming=True,
            supports_system_prompt=True,
        )


# ============================================================================
# Chat Session Endpoints
# ============================================================================

@router.get("/chat/sessions", response_model=List[ChatSessionSummary])
async def list_chat_sessions(user: dict = Depends(require_user_session)):
    """List all chat sessions for the current user, newest first."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    
    user_id = await _get_user_id(user["username"])
    if user_id is None:
        raise HTTPException(status_code=401, detail="User not found")
    
    async with SessionLocal() as session:
        # Get sessions with message counts
        result = await session.execute(
            select(ChatSession)
            .where(ChatSession.user_id == user_id)
            .order_by(ChatSession.created_at.desc())
        )
        sessions = result.scalars().all()
        from sqlalchemy import func as _func
        counts = dict((await session.execute(
            select(ChatMessage.session_id, _func.count(ChatMessage.id))
            .where(ChatMessage.session_id.in_([s.id for s in sessions] or [""]))
            .group_by(ChatMessage.session_id)
        )).all())
        
        summaries = []
        for s in sessions:
            summaries.append(ChatSessionSummary(
                id=s.id,
                title=s.title,
                model_name=s.model_name,
                engine_type=s.engine_type,
                message_count=int(counts.get(s.id, 0)),
                created_at=int(s.created_at.timestamp() * 1000),
                updated_at=int(s.updated_at.timestamp() * 1000),
            ))
        
        return summaries


@router.post("/chat/sessions", response_model=ChatSessionDetail)
async def create_chat_session(
    req: CreateSessionRequest,
    user: dict = Depends(require_user_session)
):
    """Create a new chat session."""
    logger.info(f"Creating chat session for user {user.get('username')} with model {req.model_name}")
    
    SessionLocal = _get_session()
    if SessionLocal is None:
        logger.error("create_chat_session: SessionLocal is None")
        raise HTTPException(status_code=503, detail="Database not ready")
    
    user_id = await _get_user_id(user["username"])
    if user_id is None:
        logger.error(f"create_chat_session: User not found for username {user.get('username')}")
        raise HTTPException(status_code=401, detail="User not found")
    
    session_id = str(uuid.uuid4())
    now = datetime.utcnow()
    # the engine is a property of the model, not something the client should have to know
    engine_type = req.engine_type
    known = {m.served_model_name: m.engine_type for m in await _running_models(include_embed=True)}
    if req.model_name in known:
        engine_type = known[req.model_name] or engine_type
    req.engine_type = engine_type
    
    try:
        async with SessionLocal() as session:
            new_session = ChatSession(
                id=session_id,
                user_id=user_id,
                title="New Chat",
                model_name=req.model_name,
                engine_type=req.engine_type,
                constraints_json=json.dumps(req.constraints) if req.constraints else None,
                created_at=now,
                updated_at=now,
            )
            session.add(new_session)
            await session.commit()
            
            logger.info(f"Created chat session {session_id} for user {user_id}")
            
            return ChatSessionDetail(
                id=session_id,
                title="New Chat",
                model_name=req.model_name,
                engine_type=req.engine_type,
                constraints=req.constraints,
                messages=[],
                created_at=int(now.timestamp() * 1000),
                updated_at=int(now.timestamp() * 1000),
            )
    except Exception as e:
        logger.error(f"create_chat_session failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create session: {str(e)}")


@router.get("/chat/sessions/{session_id}", response_model=ChatSessionDetail)
async def get_chat_session(
    session_id: str,
    user: dict = Depends(require_user_session)
):
    """Get a chat session with all messages."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    
    user_id = await _get_user_id(user["username"])
    if user_id is None:
        raise HTTPException(status_code=401, detail="User not found")
    
    async with SessionLocal() as session:
        result = await session.execute(
            select(ChatSession).where(
                ChatSession.id == session_id,
                ChatSession.user_id == user_id
            )
        )
        chat_session = result.scalar_one_or_none()
        
        if not chat_session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get messages
        msg_result = await session.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.asc())
        )
        messages = msg_result.scalars().all()
        
        constraints = None
        if chat_session.constraints_json:
            try:
                constraints = json.loads(chat_session.constraints_json)
            except json.JSONDecodeError:
                pass
        
        return ChatSessionDetail(
            id=chat_session.id,
            title=chat_session.title,
            model_name=chat_session.model_name,
            engine_type=chat_session.engine_type,
            constraints=constraints,
            messages=[
                ChatMessageSchema(
                    id=m.id,
                    role=m.role,
                    content=m.content,
                    metrics=json.loads(m.metrics_json) if m.metrics_json else None,
                    timestamp=int(m.created_at.timestamp() * 1000),
                )
                for m in messages
            ],
            created_at=int(chat_session.created_at.timestamp() * 1000),
            updated_at=int(chat_session.updated_at.timestamp() * 1000),
        )


@router.post("/chat/sessions/{session_id}/messages", response_model=ChatMessageSchema)
async def add_chat_message(
    session_id: str,
    req: AddMessageRequest,
    user: dict = Depends(require_user_session)
):
    """Add a message to a chat session."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    
    user_id = await _get_user_id(user["username"])
    if user_id is None:
        raise HTTPException(status_code=401, detail="User not found")
    
    async with SessionLocal() as session:
        # Verify session belongs to user
        result = await session.execute(
            select(ChatSession).where(
                ChatSession.id == session_id,
                ChatSession.user_id == user_id
            )
        )
        chat_session = result.scalar_one_or_none()
        
        if not chat_session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        now = datetime.utcnow()
        
        # Add message
        new_message = ChatMessage(
            session_id=session_id,
            role=req.role,
            content=req.content,
            metrics_json=json.dumps(req.metrics) if req.metrics else None,
            created_at=now,
        )
        session.add(new_message)
        
        # Update session title if this is first user message
        if req.role == "user" and chat_session.title == "New Chat":
            title = req.content.strip()[:40]
            if len(req.content.strip()) > 40:
                title = title[:37] + "..."
            chat_session.title = title or "New Chat"
        
        chat_session.updated_at = now
        await session.commit()
        await session.refresh(new_message)
        
        return ChatMessageSchema(
            id=new_message.id,
            role=new_message.role,
            content=new_message.content,
            metrics=req.metrics,
            timestamp=int(now.timestamp() * 1000),
        )


@router.delete("/chat/sessions/{session_id}")
async def delete_chat_session(
    session_id: str,
    user: dict = Depends(require_user_session)
):
    """Delete a chat session and all its messages."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    
    user_id = await _get_user_id(user["username"])
    if user_id is None:
        raise HTTPException(status_code=401, detail="User not found")
    
    async with SessionLocal() as session:
        # Verify session belongs to user
        result = await session.execute(
            select(ChatSession).where(
                ChatSession.id == session_id,
                ChatSession.user_id == user_id
            )
        )
        chat_session = result.scalar_one_or_none()
        
        if not chat_session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Delete messages first (CASCADE should handle this, but be explicit)
        await session.execute(
            delete(ChatMessage).where(ChatMessage.session_id == session_id)
        )
        
        # Delete session
        await session.execute(
            delete(ChatSession).where(ChatSession.id == session_id)
        )
        
        await session.commit()
        
        return {"status": "deleted"}


@router.delete("/chat/sessions")
async def clear_all_chat_sessions(user: dict = Depends(require_user_session)):
    """Delete all chat sessions for the current user."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    
    user_id = await _get_user_id(user["username"])
    if user_id is None:
        raise HTTPException(status_code=401, detail="User not found")
    
    async with SessionLocal() as session:
        # Get all session IDs for user
        result = await session.execute(
            select(ChatSession.id).where(ChatSession.user_id == user_id)
        )
        session_ids = [r[0] for r in result.fetchall()]
        
        if session_ids:
            # Delete all messages for these sessions
            await session.execute(
                delete(ChatMessage).where(ChatMessage.session_id.in_(session_ids))
            )
            
            # Delete all sessions
            await session.execute(
                delete(ChatSession).where(ChatSession.user_id == user_id)
            )
            
            await session.commit()
        
        return {"status": "cleared", "deleted_count": len(session_ids)}

