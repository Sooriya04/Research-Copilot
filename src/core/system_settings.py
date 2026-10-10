"""
System Settings Helper - Persistent storage and synchronization of system,
academic, embedding, and infrastructure settings in SQLite.
"""
from typing import Optional, Dict, Any, List
import json
from sqlalchemy import select, delete
from src.core.database import get_db_session
from src.core.models import SystemSettingModel
from src.core.config import settings
from src.core.logger import logger

SYSTEM_SETTING_SPECS: Dict[str, Dict[str, Any]] = {
    # Academic & Research APIs
    "semantic_scholar_api_key": {
        "category": "academic",
        "type": "string",
        "sensitive": True,
        "default": None,
        "label": "Semantic Scholar API Key",
        "description": "API key for rate-limit exempt access to Semantic Scholar literature graph.",
        "placeholder": "s2k-...",
    },
    "openalex_email": {
        "category": "academic",
        "type": "string",
        "sensitive": False,
        "default": "researcher@example.com",
        "label": "OpenAlex Polite Email",
        "description": "Contact email included in OpenAlex requests to join the fast polite pool.",
        "placeholder": "researcher@example.com",
    },
    "openalex_api_key": {
        "category": "academic",
        "type": "string",
        "sensitive": True,
        "default": None,
        "label": "OpenAlex Premium API Key",
        "description": "Optional OpenAlex API key for dedicated high-throughput concurrency.",
        "placeholder": "b4z...",
    },
    "arxiv_base_url": {
        "category": "academic",
        "type": "string",
        "sensitive": False,
        "default": "https://export.arxiv.org/api/query",
        "label": "arXiv Endpoint URL",
        "description": "Base query URL for arXiv OAI-PMH & Atom literature search API.",
        "placeholder": "https://export.arxiv.org/api/query",
    },
    "crossref_base_url": {
        "category": "academic",
        "type": "string",
        "sensitive": False,
        "default": "https://api.crossref.org",
        "label": "CrossRef Endpoint URL",
        "description": "Base REST URL for CrossRef DOI bibliographic metadata lookups.",
        "placeholder": "https://api.crossref.org",
    },
    "europepmc_base_url": {
        "category": "academic",
        "type": "string",
        "sensitive": False,
        "default": "https://www.ebi.ac.uk/europepmc/webservices/rest",
        "label": "Europe PMC Endpoint URL",
        "description": "Base REST URL for biomedical and life sciences preprint lookups.",
        "placeholder": "https://www.ebi.ac.uk/europepmc/webservices/rest",
    },

    # Embeddings & Vector RAG Pipeline
    "embedding_provider": {
        "category": "rag",
        "type": "string",
        "sensitive": False,
        "default": "ollama",
        "label": "Embedding Provider",
        "description": "Backend engine used to generate dense semantic vector representations.",
        "options": ["ollama", "gemini", "huggingface", "openai"],
    },
    "embedding_model": {
        "category": "rag",
        "type": "string",
        "sensitive": False,
        "default": "nomic-embed-text",
        "label": "Embedding Model Name",
        "description": "Specific embedding checkpoint name (e.g. nomic-embed-text, text-embedding-3-small).",
        "placeholder": "nomic-embed-text",
    },
    "embedding_dim": {
        "category": "rag",
        "type": "int",
        "sensitive": False,
        "default": 768,
        "label": "Embedding Vector Dimension",
        "description": "Dimension of generated embeddings (e.g. 768 for nomic-embed-text, 1536 for OpenAI).",
        "placeholder": "768",
    },
    "rag_top_k": {
        "category": "rag",
        "type": "int",
        "sensitive": False,
        "default": 5,
        "label": "RAG Top-K Chunks",
        "description": "Maximum number of most-relevant semantic text passages retrieved per query.",
        "placeholder": "5",
    },
    "rag_chunk_size": {
        "category": "rag",
        "type": "int",
        "sensitive": False,
        "default": 800,
        "label": "Text Chunk Size (chars)",
        "description": "Character length of individual document chunks indexed into the vector store.",
        "placeholder": "800",
    },
    "rag_chunk_overlap": {
        "category": "rag",
        "type": "int",
        "sensitive": False,
        "default": 150,
        "label": "Chunk Overlap (chars)",
        "description": "Character overlap between adjacent chunks to preserve cross-boundary context.",
        "placeholder": "150",
    },

    # Infrastructure & Cache
    "redis_enabled": {
        "category": "infrastructure",
        "type": "bool",
        "sensitive": False,
        "default": True,
        "label": "Enable Redis Active Paper Cache",
        "description": "Store active parsed paper graphs and AST chunks in Redis for sub-millisecond retrieval.",
    },
    "redis_url": {
        "category": "infrastructure",
        "type": "string",
        "sensitive": False,
        "default": "redis://localhost:6379",
        "label": "Redis Connection URL",
        "description": "Redis connection URI (supports redis:// and rediss:// protocols).",
        "placeholder": "redis://localhost:6379",
    },
    "redis_active_paper_ttl": {
        "category": "infrastructure",
        "type": "int",
        "sensitive": False,
        "default": 3600,
        "label": "Active Paper TTL (seconds)",
        "description": "Time-to-live for paper cache entries before background eviction (3600s = 1 hour).",
        "placeholder": "3600",
    },
    "web_search_enabled": {
        "category": "infrastructure",
        "type": "bool",
        "sensitive": False,
        "default": True,
        "label": "Enable External Web Search",
        "description": "Permit live web retrieval via Searqon for external code repos and benchmarks.",
    },
    "searqon_base_url": {
        "category": "infrastructure",
        "type": "string",
        "sensitive": False,
        "default": "http://localhost:7493",
        "label": "Searqon Service URL",
        "description": "Base HTTP endpoint for the local Searqon autonomous web search crawler.",
        "placeholder": "http://localhost:7493",
    },
    "searqon_timeout": {
        "category": "infrastructure",
        "type": "float",
        "sensitive": False,
        "default": 10.0,
        "label": "Searqon Request Timeout (s)",
        "description": "Maximum seconds to wait for Searqon web scraping responses.",
        "placeholder": "10.0",
    },
    "web_search_top_k": {
        "category": "infrastructure",
        "type": "int",
        "sensitive": False,
        "default": 5,
        "label": "Web Search Top Results",
        "description": "Number of external search citations ingested per query.",
        "placeholder": "5",
    },
    "web_search_cache_ttl": {
        "category": "infrastructure",
        "type": "int",
        "sensitive": False,
        "default": 900,
        "label": "Search Cache TTL (seconds)",
        "description": "Cache validity for live web search queries (900s = 15 minutes).",
        "placeholder": "900",
    },

    # Reasoning & LLM Defaults
    "default_llm_provider": {
        "category": "reasoning",
        "type": "string",
        "sensitive": False,
        "default": "ollama",
        "label": "Global Default LLM Provider",
        "description": "Default engine invoked for paper synthesis, novelty analysis, and autonomous planning.",
        "options": ["ollama", "gemini", "groq", "openrouter", "openai", "nvidia", "deepseek"],
    },
    "max_loop_iterations": {
        "category": "reasoning",
        "type": "int",
        "sensitive": False,
        "default": 10,
        "label": "Max Multi-Agent Loop Iterations",
        "description": "Safety threshold preventing unbounded recursive reasoning during deep research runs.",
        "placeholder": "10",
    },
    "default_rank_limit": {
        "category": "reasoning",
        "type": "int",
        "sensitive": False,
        "default": 25,
        "label": "Default Ranking Limit",
        "description": "Number of candidate literature papers scored during cross-encoder ranking passes.",
        "placeholder": "25",
    },
}

CATEGORIES = [
    {
        "id": "models",
        "title": "AI Models & Providers",
        "subtitle": "Configure LLM inference backends, API credentials, and default checkpoints",
        "icon": "Cpu",
    },
    {
        "id": "academic",
        "title": "Academic & Research APIs",
        "subtitle": "Literature graph endpoints, Semantic Scholar credentials, and OpenAlex email",
        "icon": "BookOpen",
    },
    {
        "id": "rag",
        "title": "Embeddings & Vector RAG",
        "subtitle": "Dense embeddings, chunk sizes, overlap parameters, and semantic retrieval",
        "icon": "Layers",
    },
    {
        "id": "infrastructure",
        "title": "Cache & Infrastructure",
        "subtitle": "Redis active paper cache, Searqon web research service, and network timeouts",
        "icon": "Server",
    },
    {
        "id": "reasoning",
        "title": "Reasoning & Agent Limits",
        "subtitle": "Default reasoning provider, multi-agent loop thresholds, and rank limits",
        "icon": "Brain",
    },
]


def mask_sensitive_value(val: Optional[str]) -> Optional[str]:
    """Mask sensitive API keys for safe UI presentation."""
    if not val:
        return None
    val_str = str(val).strip()
    if len(val_str) <= 8:
        return "***"
    return f"{val_str[:4]}...{val_str[-4:]}"


def parse_typed_value(raw_val: Any, val_type: str) -> Any:
    """Coerce string value from SQLite into appropriate Python type."""
    if raw_val is None:
        return None
    if val_type == "bool":
        if isinstance(raw_val, bool):
            return raw_val
        s = str(raw_val).strip().lower()
        return s in ("1", "true", "yes", "on", "t")
    elif val_type == "int":
        try:
            return int(raw_val)
        except (ValueError, TypeError):
            return 0
    elif val_type == "float":
        try:
            return float(raw_val)
        except (ValueError, TypeError):
            return 0.0
    return str(raw_val).strip()


async def load_system_settings_into_config() -> int:
    """
    Load all SQLite-persisted system settings into runtime settings instance.
    Called on application startup.
    """
    loaded = 0
    try:
        async with get_db_session() as session:
            result = await session.execute(select(SystemSettingModel))
            rows = result.scalars().all()
            for row in rows:
                if row.key in SYSTEM_SETTING_SPECS:
                    spec = SYSTEM_SETTING_SPECS[row.key]
                    typed_val = parse_typed_value(row.value, spec["type"])
                    setattr(settings, row.key, typed_val)
                    loaded += 1
            if loaded:
                logger.info("Loaded %d system settings from SQLite into runtime config.", loaded)
    except Exception as e:
        logger.warning("[SystemSettings] Failed loading settings from SQLite: %s", e)
    return loaded


async def get_all_system_settings() -> Dict[str, Any]:
    """
    Return all system settings grouped by category, merging SQLite records with current runtime config.
    """
    sqlite_map: Dict[str, SystemSettingModel] = {}
    try:
        async with get_db_session() as session:
            result = await session.execute(select(SystemSettingModel))
            rows = result.scalars().all()
            sqlite_map = {row.key: row for row in rows}
    except Exception as e:
        logger.warning("[SystemSettings] Error querying SQLite: %s", e)

    items: List[Dict[str, Any]] = []
    for key, spec in SYSTEM_SETTING_SPECS.items():
        current_runtime_val = getattr(settings, key, spec["default"])
        db_row = sqlite_map.get(key)
        is_stored_in_db = db_row is not None and db_row.value is not None

        # Effective raw value
        raw_val = db_row.value if is_stored_in_db else current_runtime_val
        typed_val = parse_typed_value(raw_val, spec["type"])

        # Display value
        display_val = typed_val
        masked_val = None
        has_value = bool(typed_val is not None and str(typed_val).strip() != "")

        if spec.get("sensitive"):
            masked_val = mask_sensitive_value(typed_val) if has_value else None
            display_val = None  # don't send raw sensitive key to UI in get

        items.append({
            "key": key,
            "category": spec["category"],
            "type": spec["type"],
            "label": spec["label"],
            "description": spec["description"],
            "placeholder": spec.get("placeholder", ""),
            "options": spec.get("options"),
            "sensitive": spec.get("sensitive", False),
            "value": display_val,
            "masked_value": masked_val,
            "has_value": has_value,
            "stored_in_db": is_stored_in_db,
            "default_value": spec["default"],
        })

    return {
        "categories": CATEGORIES,
        "settings": items,
    }


async def save_system_settings(updates: Dict[str, Any]) -> Dict[str, Any]:
    """
    Save or update a batch of system settings into SQLite and update runtime config.
    """
    saved_count = 0
    async with get_db_session() as session:
        for key, raw_val in updates.items():
            if key not in SYSTEM_SETTING_SPECS:
                continue

            spec = SYSTEM_SETTING_SPECS[key]
            # Coerce value
            if raw_val is None or (isinstance(raw_val, str) and raw_val.strip() == ""):
                # If sensitive and empty or masked, skip deleting unless explicitly requested
                if spec.get("sensitive") and (raw_val == "" or (isinstance(raw_val, str) and "..." in raw_val)):
                    continue
                db_val = None
            elif spec["type"] == "bool":
                db_val = "true" if bool(raw_val) else "false"
            else:
                db_val = str(raw_val).strip()

            # Upsert into SQLite
            result = await session.execute(
                select(SystemSettingModel).where(SystemSettingModel.key == key)
            )
            row = result.scalar_one_or_none()

            if db_val is None:
                if row:
                    await session.delete(row)
                typed_val = spec["default"]
            else:
                typed_val = parse_typed_value(db_val, spec["type"])
                if row:
                    row.value = db_val
                    row.category = spec["category"]
                else:
                    new_row = SystemSettingModel(
                        key=key,
                        value=db_val,
                        category=spec["category"],
                    )
                    session.add(new_row)

            # Update live runtime config
            try:
                setattr(settings, key, typed_val)
            except Exception as e:
                logger.warning("[SystemSettings] Could not update runtime setting %s: %s", key, e)

            saved_count += 1

        await session.commit()

    logger.info("Saved %d system settings into SQLite and updated runtime config.", saved_count)
    return {"ok": True, "saved_count": saved_count}
