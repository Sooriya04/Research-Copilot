import json
from typing import List
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse
from src.providers.base import ChatMessage
from src.providers.factory import get_llm_provider

router = APIRouter(prefix="/api/v1/chat", tags=["Workbench Chat & Streaming"])

@router.post("/stream")
async def chat_stream_endpoint(messages: List[ChatMessage], model: str = "anthropic/claude-3.5-sonnet"):
    """Stream LLM responses using Server-Sent Events (SSE)."""
    provider = get_llm_provider()
    
    async def event_generator():
        async for delta in provider.stream_chat(messages, model=model):
            yield {
                "event": "delta",
                "data": json.dumps({"content": delta})
            }
        yield {
            "event": "done",
            "data": json.dumps({"status": "completed"})
        }

    return EventSourceResponse(event_generator())
