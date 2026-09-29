import json
import logging
from typing import Any, Dict, List, Optional
from src.core.logger import logger
from src.graph.normalizer import extract_heuristic_entities, normalize_entity
from src.providers.base import ChatMessage
from src.providers.gemini import GeminiFlashLiteProvider

# In-memory extraction cache keyed by stable paper identifier or title hash
_EXTRACTION_CACHE: Dict[str, Dict[str, Any]] = {}


class AbstractEntityExtractor:
    """Lightweight scientific entity extractor operating strictly on Title + Abstract."""

    def __init__(self, provider: Optional[GeminiFlashLiteProvider] = None):
        self.provider = provider or GeminiFlashLiteProvider()

    async def extract_entities(
        self,
        title: str,
        abstract: str,
        identifier: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Extract methods, datasets, tasks, and metrics from Title + Abstract only."""
        cache_key = (identifier or title or "").strip().lower()
        if cache_key and cache_key in _EXTRACTION_CACHE:
            logger.debug("[AbstractExtractor] Cache hit for '%s'", cache_key)
            return _EXTRACTION_CACHE[cache_key]

        combined_text = f"TITLE: {title}\nABSTRACT: {abstract}".strip()
        if not combined_text:
            return {"methods": [], "datasets": [], "tasks": [], "metrics": []}

        # If abstract is empty or very short, use deterministic heuristic extraction directly
        if not abstract or len(abstract.strip()) < 30:
            heuristic_res = extract_heuristic_entities(combined_text)
            if cache_key:
                _EXTRACTION_CACHE[cache_key] = heuristic_res
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
        try:
            raw_res = await self.provider.complete(messages, temperature=0.1)
            clean_str = raw_res.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(clean_str)
        except Exception as e:
            logger.info("[AbstractExtractor] LLM extraction fallback to heuristics: %s", e)
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

        return result
