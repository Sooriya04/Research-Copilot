"""
Ollama & Gemini Query Expansion Server
Port: 8100

Provides a /expand endpoint to generate optimized search variations of a query.
Prefers Gemini (2.5 Flash) via API if GEMINI_API_KEY is found, falling back 
to local phi4-mini via Ollama.
"""

import json
import logging
import os
import urllib.request
import urllib.error
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="[ROUTER] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Research Copilot - Query Expansion Router", version="1.0.0")

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
OLLAMA_MODEL = "phi4-mini:latest"

# ---------------------------------------------------------------------------
# Load .env file manually to avoid external dependencies
# ---------------------------------------------------------------------------
def load_env():
    # Looking for .env at the project root (two levels up from services/query_optimizer)
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
    if os.path.exists(env_path):
        try:
            with open(env_path, "r") as f:
                for line in f:
                    line = line.strip()
                    if "=" in line and not line.startswith("#"):
                        key, val = line.split("=", 1)
                        os.environ[key.strip()] = val.strip().strip('"').strip("'")
            logger.info(f"Loaded .env file environment variables from: {env_path}")
        except Exception as e:
            logger.error(f"Failed to load .env file: {e}")
    else:
        logger.warning(f"No .env file found at: {env_path}")

load_env()

# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------
class ExpandRequest(BaseModel):
    query: str

class ExpandResponse(BaseModel):
    queries: list[str]
    method: str
    original_query: str

# ---------------------------------------------------------------------------
# LLM Providers Logic
# ---------------------------------------------------------------------------
def expand_query_gemini(query: str, api_key: str) -> list[str]:
    """Expand query using Gemini API."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    prompt = (
        f"Analyze this research query: '{query}'. "
        "Generate exactly 3 diverse, highly optimized search queries/variations of this topic. "
        "Focus on synonyms, subtopics, and relevant keywords that will maximize paper/code retrieval. "
        "Return the output strictly in the following JSON format: {\"queries\": [\"query1\", \"query2\", \"query3\"]}"
    )
    
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }).encode("utf-8")
    
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    
    with urllib.request.urlopen(req, timeout=12) as response:
        res = json.loads(response.read().decode("utf-8"))
        text = res["candidates"][0]["content"]["parts"][0]["text"]
        data = json.loads(text.strip())
        return data["queries"]

def expand_query_ollama(query: str) -> list[str]:
    """Expand query using local Ollama model."""
    prompt = (
        f"Analyze this research query: '{query}'. "
        "Generate exactly 3 diverse, highly optimized search queries/variations of this topic. "
        "Focus on synonyms, subtopics, and relevant keywords that will maximize paper/code retrieval. "
        "Return the output strictly in the following JSON format: {\"queries\": [\"query1\", \"query2\", \"query3\"]}"
    )
    
    payload = json.dumps({
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "format": "json"
    }).encode("utf-8")
    
    req = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    
    with urllib.request.urlopen(req, timeout=30) as response:
        res = json.loads(response.read().decode("utf-8"))
        text = res["response"]
        data = json.loads(text.strip())
        return data["queries"]

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.post("/expand", response_model=ExpandResponse)
async def expand_query(req: ExpandRequest):
    """
    Expansion endpoint. Generates 3 query variations using Gemini (primary) 
    or local Ollama phi4-mini (fallback).
    """
    query = req.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    gemini_key = os.environ.get("GEMINI_API_KEY")
    
    # 1. Try Gemini
    if gemini_key:
        try:
            logger.info("Attempting query expansion via Gemini...")
            queries = expand_query_gemini(query, gemini_key)
            logger.info(f"Gemini expanded queries: {queries}")
            return ExpandResponse(queries=queries, method="gemini", original_query=query)
        except Exception as e:
            logger.warning(f"Gemini expansion failed, falling back to Ollama: {e}")

    # 2. Fall back to Ollama
    try:
        logger.info(f"Attempting query expansion via Ollama ({OLLAMA_MODEL})...")
        queries = expand_query_ollama(query)
        logger.info(f"Ollama expanded queries: {queries}")
        return ExpandResponse(queries=queries, method="ollama", original_query=query)
    except Exception as e:
        logger.error(f"Ollama expansion also failed: {e}")
        # Final emergency fallback: return the original query only
        return ExpandResponse(queries=[query], method="fallback-none", original_query=query)

@app.get("/health")
async def health():
    gemini_key = os.environ.get("GEMINI_API_KEY")
    method = "gemini_preferred" if gemini_key else "ollama_only"
    return {"status": "ok", "method": method}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8100, log_level="info")
