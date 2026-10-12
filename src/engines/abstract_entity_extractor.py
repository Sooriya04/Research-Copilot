import json
import os
import aiosqlite
from typing import Any, Dict, List, Optional
from src.core.logger import logger
from src.graph.normalizer import extract_heuristic_entities, normalize_entity
from src.providers.base import BaseLLMProvider, ChatMessage
from src.providers.llm import LocalOllamaProvider

# In-memory extraction cache keyed by stable paper identifier or title hash
_EXTRACTION_CACHE: Dict[str, Dict[str, Any]] = {}


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Helper to extract JSON dict from potentially noisy LLM response."""
    if not text:
        return None
    cleaned = text.replace("```json", "").replace("```", "").strip()
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    import re
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(0))
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return None


class AbstractEntityExtractor:
    """Lightweight scientific entity extractor operating strictly on Title + Abstract with SQLite caching."""

    def __init__(self, provider: Optional[BaseLLMProvider] = None, db_path: str = "./data/research_copilot.db"):
        self._provider = provider
        self.db_path = db_path
        self._table_initialized = False

    def _get_provider(self) -> BaseLLMProvider:
        """Resolve LLM provider, defaulting to local Ollama phi4-mini if available."""
        if self._provider:
            return self._provider
        try:
            from src.core.config import settings
            from src.providers.factory import get_llm_provider
            pref = getattr(settings, "default_llm_provider", "ollama") or "ollama"
            return get_llm_provider(pref)
        except Exception:
            return LocalOllamaProvider(model="phi4-mini")

    async def _ensure_db(self) -> None:
        """Create paper_extractions table if not exists."""
        if not self._table_initialized:
            try:
                os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
                async with aiosqlite.connect(self.db_path) as db:
                    await db.execute(
                        """
                        CREATE TABLE IF NOT EXISTS paper_extractions (
                            cache_key TEXT PRIMARY KEY,
                            identifier TEXT,
                            title TEXT,
                            data_json TEXT NOT NULL,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );
                        """
                    )
                    await db.commit()
                self._table_initialized = True
            except Exception as e:
                logger.warning("[AbstractExtractor] Failed initializing SQLite table: %s", e)

    async def extract_entities(
        self,
        title: str,
        abstract: str,
        identifier: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Extract methods, datasets, tasks, and metrics from Title + Abstract only (SQLite-cached)."""
        cache_key = (identifier or title or "").strip().lower()
        if cache_key and cache_key in _EXTRACTION_CACHE:
            logger.debug("[AbstractExtractor] In-memory cache hit for '%s'", cache_key)
            return _EXTRACTION_CACHE[cache_key]

        await self._ensure_db()

        # Check SQLite cache
        if cache_key:
            try:
                async with aiosqlite.connect(self.db_path) as db:
                    async with db.execute(
                        "SELECT data_json FROM paper_extractions WHERE cache_key = ?", (cache_key,)
                    ) as cursor:
                        row = await cursor.fetchone()
                        if row:
                            cached_data = json.loads(row[0])
                            _EXTRACTION_CACHE[cache_key] = cached_data
                            logger.info("[AbstractExtractor] SQLite cache hit for '%s' (0 LLM cost)", cache_key)
                            return cached_data
            except Exception as e:
                logger.debug("[AbstractExtractor] SQLite read check failed: %s", e)

        combined_text = f"TITLE: {title}\nABSTRACT: {abstract}".strip()
        if not combined_text:
            return {"methods": [], "datasets": [], "tasks": [], "metrics": []}

        # If abstract is empty or very short, use deterministic heuristic extraction directly
        if not abstract or len(abstract.strip()) < 30:
            heuristic_res = extract_heuristic_entities(combined_text)
            if cache_key:
                _EXTRACTION_CACHE[cache_key] = heuristic_res
                try:
                    async with aiosqlite.connect(self.db_path) as db:
                        await db.execute(
                            "INSERT OR REPLACE INTO paper_extractions (cache_key, identifier, title, data_json) VALUES (?, ?, ?, ?)",
                            (cache_key, identifier or "", title or "", json.dumps(heuristic_res))
                        )
                        await db.commit()
                except Exception:
                    pass
            return heuristic_res

        system_instruction = (
            "You are an expert AI Research Engineer extracting scientific entities from a paper's Title and Abstract.\n"
            "STRICT RULES:\n"
            "1. ONLY extract entities explicitly mentioned or introduced in the provided text.\n"
            "2. Do NOT invent, assume, or infer datasets, benchmarks, or methods not directly stated.\n"
            "3. If a category is not mentioned, return an empty array.\n"
            "4. Return STRICT JSON matching this schema:\n"
            "{\n"
            '  "methods": ["Canonical Model or Architecture or Method name"],\n'
            '  "datasets": ["Evaluated Dataset or Benchmark name"],\n'
            '  "tasks": ["Scientific Task name e.g. Language Modeling, Fine-Tuning"],\n'
            '  "metrics": [{"name": "Metric name", "value": "Reported score or gain"}]\n'
            "}"
        )

        messages = [
            ChatMessage(role="system", content=system_instruction),
            ChatMessage(
                role="user",
                content=f"Extract entities strictly from this research title and abstract:\n\n{combined_text}"
            )
        ]

        parsed: Dict[str, Any] = {}
        prov = self._get_provider()
        try:
            kwargs: Dict[str, Any] = {"temperature": 0.1}
            if isinstance(prov, LocalOllamaProvider):
                kwargs["json_mode"] = True
            raw_res = await prov.complete(messages, **kwargs)
            res_dict = _extract_json(raw_res)
            if res_dict:
                parsed = res_dict
            else:
                raise ValueError(f"Unparseable JSON: {raw_res[:100]}")
        except Exception as e:
            logger.info("[AbstractExtractor] Primary LLM extraction failed: %s", e)
            # Try local Ollama fallback if primary was not Ollama
            if not isinstance(prov, LocalOllamaProvider):
                try:
                    ollama_prov = LocalOllamaProvider(model="phi4-mini")
                    raw_res = await ollama_prov.complete(messages, temperature=0.1, json_mode=True)
                    res_dict = _extract_json(raw_res)
                    if res_dict:
                        parsed = res_dict
                        logger.info("[AbstractExtractor] Recovered with local Ollama phi4-mini")
                except Exception as ollama_err:
                    logger.debug("[AbstractExtractor] Ollama fallback failed: %s", ollama_err)
            if not parsed:
                parsed = extract_heuristic_entities(combined_text)

        # Normalize and deduplicate entities
        raw_methods = parsed.get("methods", []) if isinstance(parsed, dict) else []
        raw_datasets = parsed.get("datasets", []) if isinstance(parsed, dict) else []
        raw_tasks = parsed.get("tasks", []) if isinstance(parsed, dict) else []
        raw_metrics = parsed.get("metrics", []) if isinstance(parsed, dict) else []

        # Merge with heuristic detections for maximum recall of canonical ML terms
        heuristic_res = extract_heuristic_entities(combined_text)
        all_methods = list(raw_methods) + heuristic_res.get("methods", [])
        all_datasets = list(raw_datasets) + heuristic_res.get("datasets", [])
        all_tasks = list(raw_tasks) + heuristic_res.get("tasks", [])

        normalized_methods = []
        for m in all_methods:
            norm = normalize_entity(str(m))
            if norm and norm not in normalized_methods:
                normalized_methods.append(norm)

        normalized_datasets = []
        for d in all_datasets:
            norm = normalize_entity(str(d))
            if norm and norm not in normalized_datasets:
                normalized_datasets.append(norm)

        normalized_tasks = []
        for t in all_tasks:
            norm = normalize_entity(str(t))
            if norm and norm not in normalized_tasks:
                normalized_tasks.append(norm)

        clean_metrics = []
        if isinstance(raw_metrics, list):
            for met in raw_metrics:
                if isinstance(met, dict) and met.get("name"):
                    clean_metrics.append({
                        "name": str(met["name"]).strip(),
                        "value": str(met.get("value", "")).strip(),
                    })

        result = {
            "methods": normalized_methods,
            "datasets": normalized_datasets,
            "tasks": normalized_tasks,
            "metrics": clean_metrics,
        }

        if cache_key:
            _EXTRACTION_CACHE[cache_key] = result
            try:
                async with aiosqlite.connect(self.db_path) as db:
                    await db.execute(
                        "INSERT OR REPLACE INTO paper_extractions (cache_key, identifier, title, data_json) VALUES (?, ?, ?, ?)",
                        (cache_key, identifier or "", title or "", json.dumps(result))
                    )
                    await db.commit()
            except Exception as e:
                logger.debug("[AbstractExtractor] SQLite write error: %s", e)

        return result
