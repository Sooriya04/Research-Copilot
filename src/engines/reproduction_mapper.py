"""
Research Paper Reproduction Map Engine for Research Copilot.
Converts extracted methods, datasets, compute requirements, and code artifacts
into a structured reproduction map, friction assessment, and actionable roadmap.
Implements multi-tier LLM resilience: Frontier -> Local Ollama (phi4-mini) -> Deterministic Heuristics.
"""

import hashlib
import json
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple, Set
import aiosqlite

from src.core.config import settings
from src.core.logger import logger
from src.core.evidence_schemas import (
    CodeAvailability,
    ComputeBudget,
    DatasetChecklist,
    ReproductionStep,
    ReproductionMap,
    PaperEvidencePackage,
    PageIndexedDocument,
)
from src.providers.base import BaseLLMProvider, ChatMessage
from src.providers.factory import get_llm_provider
from src.providers.llm import LocalOllamaProvider

REPRODUCTION_MAP_PROMPT_VERSION = "v1.0"


def extract_json_from_llm_text(text: str) -> Optional[Dict[str, Any]]:
    """Robustly extract a JSON dictionary from potentially noisy LLM output."""
    if not text:
        return None
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        try:
            data = json.loads(match.group(0))
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return None


KNOWN_BENCHMARK_DATASETS: Dict[str, Dict[str, str]] = {
    "imagenet": {
        "name": "ImageNet",
        "access_type": "public",
        "download_url": "https://image-net.org/download.php",
        "preprocessing_notes": "Standard 1,000-class subset (ILSVRC2012) with 1.28M training and 50k validation images normalized with ImageNet mean/std.",
    },
    "imagenet-1k": {
        "name": "ImageNet-1k",
        "access_type": "public",
        "download_url": "https://huggingface.co/datasets/imagenet-1k",
        "preprocessing_notes": "ILSVRC2012 standard 1000-class evaluation split.",
    },
    "cifar-10": {
        "name": "CIFAR-10",
        "access_type": "public",
        "download_url": "https://www.cs.toronto.edu/~kriz/cifar.html",
        "preprocessing_notes": "60,000 32x32 color images across 10 balanced classes (50,000 train, 10,000 test).",
    },
    "cifar-100": {
        "name": "CIFAR-100",
        "access_type": "public",
        "download_url": "https://www.cs.toronto.edu/~kriz/cifar.html",
        "preprocessing_notes": "100 classes grouped into 20 superclasses, 600 images per class.",
    },
    "ms coco": {
        "name": "MS COCO",
        "access_type": "public",
        "download_url": "https://cocodataset.org/",
        "preprocessing_notes": "Object detection, segmentation, and captioning splits (2017 train/val annotations).",
    },
    "coco": {
        "name": "COCO",
        "access_type": "public",
        "download_url": "https://cocodataset.org/",
        "preprocessing_notes": "Common Objects in Context benchmark dataset.",
    },
    "glue": {
        "name": "GLUE",
        "access_type": "public",
        "download_url": "https://huggingface.co/datasets/glue",
        "preprocessing_notes": "General Language Understanding Evaluation benchmark collection of 9 NLU tasks.",
    },
    "superglue": {
        "name": "SuperGLUE",
        "access_type": "public",
        "download_url": "https://huggingface.co/datasets/super_glue",
        "preprocessing_notes": "Advanced multi-task language understanding benchmark suite.",
    },
    "squad": {
        "name": "SQuAD",
        "access_type": "public",
        "download_url": "https://rajpurkar.github.io/SQuAD-explorer/",
        "preprocessing_notes": "Stanford Question Answering Dataset reading comprehension benchmark.",
    },
    "squad 2.0": {
        "name": "SQuAD 2.0",
        "access_type": "public",
        "download_url": "https://rajpurkar.github.io/SQuAD-explorer/",
        "preprocessing_notes": "Reading comprehension containing over 100k questions with unanswerable adversarials.",
    },
    "wmt 2014": {
        "name": "WMT 2014",
        "access_type": "public",
        "download_url": "https://www.statmt.org/wmt14/",
        "preprocessing_notes": "Standard English-German and English-French machine translation benchmark.",
    },
    "wmt14": {
        "name": "WMT14",
        "access_type": "public",
        "download_url": "https://www.statmt.org/wmt14/",
        "preprocessing_notes": "Workshop on Statistical Machine Translation 2014 benchmark.",
    },
    "humaneval": {
        "name": "HumanEval",
        "access_type": "public",
        "download_url": "https://github.com/openai/human-eval",
        "preprocessing_notes": "164 hand-written Python coding challenges with unit test verification.",
    },
    "gsm8k": {
        "name": "GSM8K",
        "access_type": "public",
        "download_url": "https://github.com/openai/grade-school-math",
        "preprocessing_notes": "8,500 diverse grade-school math word problems for multi-step reasoning.",
    },
    "math": {
        "name": "MATH",
        "access_type": "public",
        "download_url": "https://github.com/hendrycks/math",
        "preprocessing_notes": "12,500 competition math problems requiring multi-step step-by-step reasoning.",
    },
    "mmlu": {
        "name": "MMLU",
        "access_type": "public",
        "download_url": "https://github.com/hendrycks/test",
        "preprocessing_notes": "57 subjects spanning humanities, social sciences, STEM, and professional domains.",
    },
    "the pile": {
        "name": "The Pile",
        "access_type": "public",
        "download_url": "https://pile.eleuther.ai/",
        "preprocessing_notes": "825 GiB diverse open-source language modeling dataset.",
    },
    "librispeech": {
        "name": "LibriSpeech",
        "access_type": "public",
        "download_url": "https://www.openslr.org/12",
        "preprocessing_notes": "1,000 hours of 16kHz read English speech derived from audiobooks.",
    },
    "mimic-iii": {
        "name": "MIMIC-III",
        "access_type": "gated",
        "download_url": "https://physionet.org/content/mimiciii/",
        "preprocessing_notes": "Gated clinical database requiring PhysioNet credentialing, CITI human subjects training, and signed DUA.",
    },
    "mimic-iv": {
        "name": "MIMIC-IV",
        "access_type": "gated",
        "download_url": "https://physionet.org/content/mimiciv/",
        "preprocessing_notes": "Gated intensive care clinical database; requires PhysioNet institutional approval.",
    },
    "physionet": {
        "name": "PhysioNet",
        "access_type": "gated",
        "download_url": "https://physionet.org/",
        "preprocessing_notes": "Restricted biomedical dataset requiring credentialed research access.",
    },
    "uk biobank": {
        "name": "UK Biobank",
        "access_type": "gated",
        "download_url": "https://www.ukbiobank.ac.uk/",
        "preprocessing_notes": "Large-scale biomedical repository requiring formal scientific project application and approval.",
    },
}


class ReproductionMapper:
    """
    Research Paper Reproduction Map Engine.
    Converts paper artifacts and evidence into actionable reproduction blueprints
    with multi-tier LLM resilience (Frontier -> Local Ollama -> Deterministic Heuristics).
    """

    def __init__(
        self,
        provider: Optional[BaseLLMProvider] = None,
        db_path: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self._custom_provider = provider
        self.timeout = timeout
        if db_path:
            self.db_path = db_path
        else:
            raw_url = getattr(settings, "database_url", "./data/research_copilot.db")
            clean_path = raw_url.replace("sqlite+aiosqlite:///", "").replace("sqlite:///", "")
            self.db_path = clean_path if clean_path else "./data/research_copilot.db"

        self._table_initialized = False

    async def _ensure_cache_table(self) -> None:
        """Create critique_synthesis_cache table if it does not exist."""
        if not self._table_initialized:
            try:
                db_dir = os.path.dirname(os.path.abspath(self.db_path))
                if db_dir:
                    os.makedirs(db_dir, exist_ok=True)
                async with aiosqlite.connect(self.db_path, timeout=10.0) as db:
                    await db.execute(
                        """
                        CREATE TABLE IF NOT EXISTS critique_synthesis_cache (
                            cache_key TEXT PRIMARY KEY,
                            operation_type TEXT NOT NULL,
                            input_hash TEXT NOT NULL,
                            result_json TEXT NOT NULL,
                            model_info TEXT,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );
                        """
                    )
                    await db.execute(
                        "CREATE INDEX IF NOT EXISTS idx_critique_cache_lookup ON critique_synthesis_cache(operation_type, input_hash);"
                    )
                    await db.commit()
                self._table_initialized = True
            except Exception as e:
                logger.warning("[ReproductionMapper] Cache table init warning: %s", e)

    async def _get_cached_result(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Retrieve cached result from SQLite; returns None on cache miss or DB error."""
        await self._ensure_cache_table()
        try:
            async with aiosqlite.connect(self.db_path, timeout=5.0) as db:
                async with db.execute(
                    "SELECT result_json FROM critique_synthesis_cache WHERE cache_key = ? LIMIT 1;",
                    (cache_key,),
                ) as cursor:
                    row = await cursor.fetchone()
                    if row and row[0]:
                        return json.loads(row[0])
        except Exception as e:
            logger.debug("[ReproductionMapper] Cache read note: %s", e)
        return None

    async def _save_cached_result(
        self,
        cache_key: str,
        input_hash: str,
        result_data: Dict[str, Any],
        model_info: str,
    ) -> None:
        """Store validated successful reproduction map in SQLite cache."""
        await self._ensure_cache_table()
        try:
            result_json = json.dumps(result_data, ensure_ascii=False)
            async with aiosqlite.connect(self.db_path, timeout=5.0) as db:
                await db.execute(
                    """
                    INSERT INTO critique_synthesis_cache (cache_key, operation_type, input_hash, result_json, model_info, updated_at)
                    VALUES (?, 'reproduction_map', ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(cache_key) DO UPDATE SET
                        result_json = excluded.result_json,
                        model_info = excluded.model_info,
                        updated_at = CURRENT_TIMESTAMP;
                    """,
                    (cache_key, input_hash, result_json, model_info),
                )
                await db.commit()
        except Exception as e:
            logger.warning("[ReproductionMapper] Failed to cache reproduction map: %s", e)

    def _build_cache_key(
        self,
        model_name: str,
        stable_input_id: str,
        evidence_content: str,
    ) -> Tuple[str, str]:
        """Compute stable SHA-256 cache key and input hash."""
        evidence_digest = hashlib.sha256(evidence_content.encode("utf-8")).hexdigest()[:16]
        input_hash = hashlib.sha256(f"{stable_input_id}:{evidence_digest}".encode("utf-8")).hexdigest()
        cache_key = hashlib.sha256(
            f"reproduction_map:{REPRODUCTION_MAP_PROMPT_VERSION}:{model_name}:{input_hash}".encode("utf-8")
        ).hexdigest()
        return cache_key, input_hash

    async def _resolve_provider(
        self,
        provider_name_override: Optional[str] = None,
        model_name_override: Optional[str] = None,
    ) -> Tuple[Optional[BaseLLMProvider], str, str]:
        """
        Resolve LLM provider following the resilience priority:
        1. Explicit override or Custom Provider
        2. Frontier Provider (Gemini Flash-Lite / DeepSeek / OpenRouter / Groq / Nvidia)
        3. Local Ollama (phi4-mini)
        4. None (Deterministic heuristic fallback)
        """
        if self._custom_provider:
            return (
                self._custom_provider,
                getattr(self._custom_provider, "provider_name", "custom"),
                getattr(self._custom_provider, "model", "default"),
            )

        # Tier 0: Direct override
        if provider_name_override:
            try:
                prov = get_llm_provider(
                    provider_name=provider_name_override,
                    model=model_name_override or "",
                )
                return prov, provider_name_override, getattr(prov, "model", provider_name_override)
            except Exception as e:
                logger.debug("[ReproductionMapper] Override provider lookup note: %s", e)

        # Tier 1: Check configured frontier provider
        try:
            from src.core.provider_settings import resolve_provider_credentials
            frontier_candidates = ["gemini", "deepseek", "openrouter", "groq", "nvidia"]
            for cand in frontier_candidates:
                creds = await resolve_provider_credentials(cand)
                if creds.get("has_key"):
                    prov = get_llm_provider(
                        provider_name=creds.get("provider_id", cand),
                        model=creds.get("model", ""),
                        api_key=creds.get("api_key", ""),
                        base_url=creds.get("base_url", ""),
                    )
                    return prov, "frontier", creds.get("model") or getattr(prov, "model", cand)
        except Exception as ex:
            logger.debug("[ReproductionMapper] Frontier credential check: %s", ex)

        # Tier 2: Check Local Ollama
        try:
            ollama_url = getattr(settings, "ollama_base_url", "http://localhost:11434")
            ollama_model = getattr(settings, "ollama_model", "phi4-mini")
            ollama_prov = LocalOllamaProvider(model=ollama_model, base_url=ollama_url)
            conn_test = await ollama_prov.test_connection()
            if conn_test.get("success"):
                return ollama_prov, "ollama", ollama_model
        except Exception as ex:
            logger.debug("[ReproductionMapper] Local Ollama probe note: %s", ex)

        # Tier 3: Heuristic
        return None, "heuristic", "deterministic-rules"

    def _build_evidence_summary(
        self,
        paper_id: str,
        title: str,
        abstract: str,
        evidence_pkg: Optional[PaperEvidencePackage] = None,
        full_text: Optional[str] = None,
        doc: Optional[PageIndexedDocument] = None,
        checklist: Optional[Any] = None,
    ) -> str:
        """Assemble structured summary of paper evidence for reproduction analysis."""
        lines = [
            f"PAPER ID: {paper_id}",
            f"TITLE: {title or 'Unknown'}",
            f"ABSTRACT: {abstract or 'No abstract provided.'}\n",
        ]

        if evidence_pkg:
            if evidence_pkg.thesis:
                lines.append(f"CORE THESIS: {evidence_pkg.thesis}")
            if evidence_pkg.research_question:
                lines.append(f"RESEARCH QUESTION: {evidence_pkg.research_question}")
            if evidence_pkg.methods:
                lines.append("EXTRACTED METHODS:")
                for m in evidence_pkg.methods[:8]:
                    lines.append(f"- {m}")
            if evidence_pkg.metrics:
                lines.append("REPORTED METRICS & BENCHMARKS:")
                for met in evidence_pkg.metrics[:8]:
                    lines.append(f"- {met.label}: {met.display_value} ({met.context})")
            if evidence_pkg.limitations:
                lines.append("STATED LIMITATIONS & CONSTRAINTS:")
                for lim in evidence_pkg.limitations[:5]:
                    lines.append(f"- {lim.statement}")
            lines.append("")

        if checklist:
            lines.append("PRE-COMPUTED RIGOR CHECKLIST:")
            for attr in ["has_code_repo", "code_url", "has_compute_budget", "compute_details", "has_dataset_link", "has_benchmarks"]:
                if hasattr(checklist, attr):
                    lines.append(f"- {attr}: {getattr(checklist, attr)}")
            lines.append("")

        if doc and doc.pages:
            lines.append("DOCUMENT EXCERPTS (FIRST & LAST PAGES):")
            sample_pages = doc.pages[:3] + (doc.pages[-2:] if len(doc.pages) > 4 else [])
            for p in sample_pages:
                clean_text = " ".join(p.text.split()[:180])
                lines.append(f"[Page {p.page_number}]: {clean_text}")
        elif full_text:
            lines.append("FULL-TEXT EXTRACT SNIPPET:")
            lines.append(" ".join(full_text.split()[:800]))

        return "\n".join(lines)

    async def generate_map(
        self,
        paper_id: str,
        evidence_pkg: Optional[PaperEvidencePackage] = None,
        doc: Optional[PageIndexedDocument] = None,
        full_text: Optional[str] = None,
        title: Optional[str] = None,
        abstract: Optional[str] = None,
        checklist: Optional[Any] = None,
        force_refresh: bool = False,
        provider_override: Optional[str] = None,
        model_override: Optional[str] = None,
    ) -> ReproductionMap:
        """
        Generate schema-validated ReproductionMap with multi-tier resilience:
        Frontier LLM -> Local Ollama (phi4-mini) -> Deterministic Heuristics.
        Guaranteed to never crash if LLM is unavailable.
        """
        clean_id = paper_id.strip()
        effective_title = title or (evidence_pkg.title if evidence_pkg else clean_id)
        effective_abstract = abstract or (evidence_pkg.plain_summary if evidence_pkg else "")

        evidence_summary = self._build_evidence_summary(
            paper_id=clean_id,
            title=effective_title,
            abstract=effective_abstract,
            evidence_pkg=evidence_pkg,
            full_text=full_text,
            doc=doc,
            checklist=checklist,
        )

        provider, engine_tier, model_name = await self._resolve_provider(
            provider_override, model_override
        )

        cache_key, input_hash = self._build_cache_key(
            model_name=model_name,
            stable_input_id=clean_id,
            evidence_content=evidence_summary,
        )

        # 1. Check persistent SQLite cache if not forcing refresh
        if not force_refresh:
            cached_data = await self._get_cached_result(cache_key)
            if cached_data:
                try:
                    logger.info("[ReproductionMapper] Cache HIT for '%s'", clean_id)
                    return ReproductionMap(**cached_data)
                except Exception as ce:
                    logger.debug("[ReproductionMapper] Cache deserialize note: %s", ce)

        # Build baseline heuristic first to ensure instant fallback or cross-validation
        heuristic_map = self._heuristic_reproduction_map(
            paper_id=clean_id,
            evidence_summary=evidence_summary,
            evidence_pkg=evidence_pkg,
            checklist=checklist,
            doc=doc,
            full_text=full_text,
        )

        # 2. Tier 1: Primary LLM Resolution
        rep_map: Optional[ReproductionMap] = None
        if provider is not None:
            rep_map = await self._run_llm_reproduction_map(
                provider=provider,
                paper_id=clean_id,
                evidence_summary=evidence_summary,
                engine_name=engine_tier,
                model_name=model_name,
                heuristic_baseline=heuristic_map,
            )

        # 3. Tier 2: Ollama fallback if primary frontier LLM failed
        if rep_map is None and engine_tier == "frontier":
            try:
                logger.info("[ReproductionMapper] Frontier LLM failed; attempting Ollama fallback.")
                ollama_url = getattr(settings, "ollama_base_url", "http://localhost:11434")
                ollama_model = getattr(settings, "ollama_model", "phi4-mini")
                ollama_prov = LocalOllamaProvider(model=ollama_model, base_url=ollama_url)
                rep_map = await self._run_llm_reproduction_map(
                    provider=ollama_prov,
                    paper_id=clean_id,
                    evidence_summary=evidence_summary,
                    engine_name="ollama",
                    model_name=ollama_model,
                    heuristic_baseline=heuristic_map,
                )
            except Exception as oe:
                logger.debug("[ReproductionMapper] Ollama fallback note: %s", oe)

        # 4. Tier 3: Deterministic heuristic fallback
        if rep_map is None:
            logger.info("[ReproductionMapper] Using deterministic heuristic reproduction map for '%s'", clean_id)
            rep_map = heuristic_map

        # Save to SQLite cache
        await self._save_cached_result(
            cache_key=cache_key,
            input_hash=input_hash,
            result_data=rep_map.model_dump(),
            model_info=f"{engine_tier}:{model_name}",
        )

        return rep_map

    async def _run_llm_reproduction_map(
        self,
        provider: BaseLLMProvider,
        paper_id: str,
        evidence_summary: str,
        engine_name: str,
        model_name: str,
        heuristic_baseline: Optional[ReproductionMap] = None,
    ) -> Optional[ReproductionMap]:
        """Execute LLM prompt for structured ReproductionMap extraction with JSON validation."""
        system_prompt = (
            "You are a Senior AI Research Reproduction Engineer.\n"
            "Analyze the provided research paper evidence and extract a structured, publication-grade Reproduction Map.\n"
            "STRICT RULES:\n"
            "1. Ground all claims in the provided text. Never hallucinate fake repositories, GPUs, or datasets.\n"
            "2. Output strictly valid JSON conforming to this schema:\n"
            "{\n"
            '  "paper_id": "string",\n'
            '  "reproducibility_score": 75.0,\n'
            '  "code_availability": {\n'
            '    "has_repo": true,\n'
            '    "repo_url": "https://github.com/...",\n'
            '    "framework": "PyTorch",\n'
            '    "has_checkpoints": true,\n'
            '    "dependencies": ["torch", "transformers"],\n'
            '    "license": "Apache-2.0"\n'
            "  },\n"
            '  "compute_budget": {\n'
            '    "hardware_mentioned": true,\n'
            '    "gpu_type": "NVIDIA A100",\n'
            '    "gpu_count": 8,\n'
            '    "estimated_hours": 48.0,\n'
            '    "notes": "Trained on 8x A100 GPUs for ~48 hours."\n'
            "  },\n"
            '  "dataset_checklist": [\n'
            '    {"name": "DatasetName", "access_type": "public", "download_url": "https://...", "preprocessing_notes": "..."}\n'
            "  ],\n"
            '  "steps": [\n'
            '    {"step_number": 1, "phase": "setup", "action": "...", "suggested_command": "...", "verification_criteria": "..."},\n'
            '    {"step_number": 2, "phase": "data_prep", "action": "...", "suggested_command": "...", "verification_criteria": "..."},\n'
            '    {"step_number": 3, "phase": "training", "action": "...", "suggested_command": "...", "verification_criteria": "..."},\n'
            '    {"step_number": 4, "phase": "eval", "action": "...", "suggested_command": "...", "verification_criteria": "..."}\n'
            "  ],\n"
            '  "missing_critical_elements": ["Element 1", "Element 2"],\n'
            '  "friction_summary": "Concise 2-3 sentence reproduction friction summary."\n'
            "}"
        )

        messages = [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=f"Generate reproduction map for paper:\n\n{evidence_summary}"),
        ]

        try:
            kwargs: Dict[str, Any] = {"temperature": 0.1}
            if isinstance(provider, LocalOllamaProvider):
                kwargs["json_mode"] = True

            raw_reply = await provider.complete(messages, **kwargs)
            parsed = extract_json_from_llm_text(raw_reply)
            if not parsed or not isinstance(parsed, dict):
                return None

            # Enforce paper_id consistency
            parsed["paper_id"] = paper_id

            # Cross-merge with heuristic baseline if baseline found a factual repo URL or hardware
            if heuristic_baseline:
                code_dict = parsed.get("code_availability", {})
                if not code_dict.get("repo_url") and heuristic_baseline.code_availability.repo_url:
                    code_dict["has_repo"] = True
                    code_dict["repo_url"] = heuristic_baseline.code_availability.repo_url
                    parsed["code_availability"] = code_dict

                comp_dict = parsed.get("compute_budget", {})
                if not comp_dict.get("gpu_type") and heuristic_baseline.compute_budget.gpu_type:
                    comp_dict["hardware_mentioned"] = True
                    comp_dict["gpu_type"] = heuristic_baseline.compute_budget.gpu_type
                    if heuristic_baseline.compute_budget.gpu_count and not comp_dict.get("gpu_count"):
                        comp_dict["gpu_count"] = heuristic_baseline.compute_budget.gpu_count
                    if heuristic_baseline.compute_budget.estimated_hours and not comp_dict.get("estimated_hours"):
                        comp_dict["estimated_hours"] = heuristic_baseline.compute_budget.estimated_hours
                    parsed["compute_budget"] = comp_dict

                # If LLM omitted datasets but heuristic detected benchmark datasets, merge them
                if not parsed.get("dataset_checklist") and heuristic_baseline.dataset_checklist:
                    parsed["dataset_checklist"] = [d.model_dump() for d in heuristic_baseline.dataset_checklist]

            # Validate against Pydantic schema
            reproduction_map = ReproductionMap(**parsed)
            # Bound score between 0.0 and 100.0
            reproduction_map.reproducibility_score = max(0.0, min(100.0, float(reproduction_map.reproducibility_score)))
            return reproduction_map

        except Exception as e:
            logger.warning("[ReproductionMapper] LLM reproduction mapping failed (%s/%s): %s", engine_name, model_name, e)
            return None

    def _heuristic_reproduction_map(
        self,
        paper_id: str,
        evidence_summary: str,
        evidence_pkg: Optional[PaperEvidencePackage] = None,
        checklist: Optional[Any] = None,
        doc: Optional[PageIndexedDocument] = None,
        full_text: Optional[str] = None,
    ) -> ReproductionMap:
        """
        Deterministic, offline rule-based reproduction mapping.
        Extracts repository links, ML frameworks, accelerator models, compute hours,
        benchmark datasets, and produces actionable reproduction steps with zero LLM dependence.
        """
        # Collect full searchable corpus
        corpus_parts = [evidence_summary]
        if full_text:
            corpus_parts.append(full_text)
        if doc and doc.pages:
            corpus_parts.extend(p.text for p in doc.pages)
        if evidence_pkg:
            corpus_parts.extend(evidence_pkg.methods)
            corpus_parts.extend(f"{m.label} {m.context}" for m in evidence_pkg.metrics)
            corpus_parts.extend(evidence_pkg.findings)
            corpus_parts.extend(l.statement for l in evidence_pkg.limitations)
        corpus = "\n".join(corpus_parts)

        # ---------------------------------------------------------------------
        # 1. Code Availability Extraction
        # ---------------------------------------------------------------------
        has_repo = False
        repo_url = None

        # Check checklist if provided
        if checklist and getattr(checklist, "code_url", None):
            repo_url = getattr(checklist, "code_url")
            has_repo = True
        elif checklist and getattr(checklist, "has_code_repo", False):
            has_repo = True

        # Regex search for GitHub / GitLab / HuggingFace repos
        if not repo_url:
            repo_pattern = re.compile(
                r"(?:https?://)?(?:www\.)?(github\.com|gitlab\.com)/([A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+)",
                re.IGNORECASE,
            )
            for match in repo_pattern.finditer(corpus):
                domain = match.group(1).lower()
                slug = match.group(2).rstrip(".,)>'\";:)]")
                # Filter out system paths
                first_part = slug.split("/")[0].lower()
                if first_part in ["about", "pricing", "features", "topics", "collections", "trending", "explore"]:
                    continue
                repo_url = f"https://{domain}/{slug}"
                has_repo = True
                break

        # Framework detection
        framework: Optional[str] = None
        has_pytorch = bool(re.search(r"\b(pytorch|torch)\b", corpus, re.IGNORECASE))
        has_jax = bool(re.search(r"\b(jax|flax|haiku)\b", corpus, re.IGNORECASE))
        has_tf = bool(re.search(r"\b(tensorflow|keras)\b", corpus, re.IGNORECASE))
        has_transformers = bool(re.search(r"\b(transformers|huggingface)\b", corpus, re.IGNORECASE))

        if has_pytorch and has_transformers:
            framework = "PyTorch / Hugging Face Transformers"
        elif has_pytorch:
            framework = "PyTorch"
        elif has_jax:
            framework = "JAX / Flax"
        elif has_tf:
            framework = "TensorFlow / Keras"
        elif has_transformers:
            framework = "Hugging Face Transformers"

        # Checkpoints detection
        has_checkpoints = bool(
            re.search(
                r"\b(checkpoint|checkpoints|pretrained weights|model weights|release (?:our )?weights|model checkpoint|huggingface\.co/models|weight checkpoints?)\b",
                corpus,
                re.IGNORECASE,
            )
        )

        # Dependencies detection
        dep_candidates = [
            "torch", "torchvision", "torchaudio", "transformers", "accelerate",
            "datasets", "deepspeed", "jax", "flax", "optax", "tensorflow",
            "keras", "scikit-learn", "numpy", "scipy", "pandas", "einops",
            "wandb", "timm", "sentencepiece", "hydra-core", "spacy", "faiss",
        ]
        detected_deps: List[str] = []
        for dep in dep_candidates:
            if re.search(r"\b" + re.escape(dep) + r"\b", corpus, re.IGNORECASE):
                detected_deps.append(dep)

        if not detected_deps:
            if framework and "pytorch" in framework.lower():
                detected_deps = ["torch>=2.0.0", "torchvision", "transformers", "accelerate", "numpy"]
            elif framework and "jax" in framework.lower():
                detected_deps = ["jax", "jaxlib", "flax", "optax", "numpy"]
            elif framework and "tensorflow" in framework.lower():
                detected_deps = ["tensorflow>=2.12.0", "numpy"]
            else:
                detected_deps = ["numpy", "scipy"]

        # License detection
        license_match = re.search(
            r"\b(Apache[\s\-]2\.0|MIT(?:\s+License)?|BSD[\s\-]3[\s\-]Clause|BSD[\s\-]2[\s\-]Clause|BSD|GPLv3|GPLv2|GPL|CC[\s\-]BY[\s\-]4\.0|CC[\s\-]BY)\b",
            corpus,
            re.IGNORECASE,
        )
        detected_license = None
        if license_match:
            raw_lic = license_match.group(1).upper()
            if "APACHE" in raw_lic:
                detected_license = "Apache-2.0"
            elif "MIT" in raw_lic:
                detected_license = "MIT"
            elif "BSD" in raw_lic:
                detected_license = "BSD-3-Clause"
            elif "GPL" in raw_lic:
                detected_license = "GPL-3.0"
            elif "CC-BY" in raw_lic:
                detected_license = "CC-BY-4.0"
            else:
                detected_license = license_match.group(1)

        code_availability = CodeAvailability(
            has_repo=has_repo,
            repo_url=repo_url,
            framework=framework,
            has_checkpoints=has_checkpoints,
            dependencies=detected_deps,
            license=detected_license,
        )

        # ---------------------------------------------------------------------
        # 2. Compute Budget Extraction
        # ---------------------------------------------------------------------
        hardware_mentioned = False
        gpu_type: Optional[str] = None
        gpu_count: Optional[int] = None
        estimated_hours: Optional[float] = None
        compute_notes: Optional[str] = None

        # GPU / TPU model match
        hw_match = re.search(
            r"\b(?:NVIDIA\s+)?(A100|H100|V100|P100|T4|L40S|RTX\s*4090|RTX\s*3090|RTX\s*A6000|A6000|TPU\s*v[2-5][a-z]?|Google TPU)\b",
            corpus,
            re.IGNORECASE,
        )
        if hw_match:
            hardware_mentioned = True
            raw_hw = hw_match.group(1).upper()
            if "A100" in raw_hw:
                gpu_type = "NVIDIA A100"
            elif "H100" in raw_hw:
                gpu_type = "NVIDIA H100"
            elif "V100" in raw_hw:
                gpu_type = "NVIDIA V100"
            elif "P100" in raw_hw:
                gpu_type = "NVIDIA P100"
            elif "T4" in raw_hw:
                gpu_type = "NVIDIA T4"
            elif "4090" in raw_hw:
                gpu_type = "NVIDIA RTX 4090"
            elif "3090" in raw_hw:
                gpu_type = "NVIDIA RTX 3090"
            elif "TPU" in raw_hw:
                gpu_type = raw_hw
            else:
                gpu_type = raw_hw

        # GPU Count match
        count_patterns = [
            r"(\d+)\s*(?:x\s*)?(?:NVIDIA\s+)?(?:A100|H100|V100|P100|T4|RTX\s*4090|RTX\s*3090|GPUs?|TPUs?)",
            r"(?:trained on|using|with|cluster of)\s+(\d+)\s+(?:NVIDIA\s+)?(?:A100|H100|V100|P100|T4|GPUs?|TPUs?)",
            r"(\d+)\s+(?:GPU|TPU)\s+nodes?",
        ]
        for cp in count_patterns:
            cm = re.search(cp, corpus, re.IGNORECASE)
            if cm:
                try:
                    c_val = int(cm.group(1))
                    if 1 <= c_val <= 1024:
                        gpu_count = c_val
                        hardware_mentioned = True
                        break
                except Exception:
                    pass

        # Hours / Duration match
        hours_patterns = [
            (r"(\d+(?:\.\d+)?)\s*(?:GPU\s*hours?|compute\s*hours?|node\s*hours?)", 1.0),
            (r"(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:of training|to train|per epoch)", 1.0),
            (r"(\d+(?:\.\d+)?)\s*days?\s*(?:of training|to train)", 24.0),
        ]
        for hp, multiplier in hours_patterns:
            hm = re.search(hp, corpus, re.IGNORECASE)
            if hm:
                try:
                    val = float(hm.group(1)) * multiplier
                    if 0.1 <= val <= 100000.0:
                        estimated_hours = round(val, 1)
                        break
                except Exception:
                    pass

        if hardware_mentioned:
            parts = []
            if gpu_count and gpu_type:
                parts.append(f"{gpu_count}x {gpu_type}")
            elif gpu_type:
                parts.append(gpu_type)
            elif gpu_count:
                parts.append(f"{gpu_count} accelerators")
            if estimated_hours:
                parts.append(f"approx. {estimated_hours} compute hours")
            compute_notes = "Training executed using " + " across ".join(parts) + "."
        else:
            compute_notes = "Hardware specifications and compute training duration omitted in paper."

        compute_budget = ComputeBudget(
            hardware_mentioned=hardware_mentioned,
            gpu_type=gpu_type,
            gpu_count=gpu_count,
            estimated_hours=estimated_hours,
            notes=compute_notes,
        )

        # ---------------------------------------------------------------------
        # 3. Dataset Checklist Extraction
        # ---------------------------------------------------------------------
        found_datasets: List[DatasetChecklist] = []
        seen_ds_names: Set[str] = set()

        corpus_lower = corpus.lower()
        for key, info in KNOWN_BENCHMARK_DATASETS.items():
            if key in corpus_lower or re.search(r"\b" + re.escape(key) + r"\b", corpus_lower):
                clean_name = info["name"]
                if clean_name.lower() not in seen_ds_names:
                    seen_ds_names.add(clean_name.lower())
                    found_datasets.append(
                        DatasetChecklist(
                            name=clean_name,
                            access_type=info["access_type"],
                            download_url=info["download_url"],
                            preprocessing_notes=info["preprocessing_notes"],
                        )
                    )

        # Regex scan for other datasets mentioned in methods/metrics
        generic_ds_patterns = [
            r"(?:evaluated on|tested on|trained on|benchmark(?:ed)? on)\s+(?:the\s+)?([A-Za-z0-9\-_\s]{3,25}?)(?:\s+(?:dataset|benchmark|corpus|task)|\.|\,)",
            r"(?:dataset|benchmark)s?\s*(?:named|called|including|such as|:)\s*([A-Za-z0-9\-_\s]{3,20})",
        ]
        for gdp in generic_ds_patterns:
            for gm in re.finditer(gdp, corpus, re.IGNORECASE):
                cand = gm.group(1).strip()
                # Exclude stop words and common phrases
                if cand.lower() in ["our", "the", "a", "various", "multiple", "standard", "several", "synthetic"]:
                    continue
                if len(cand) >= 3 and cand.lower() not in seen_ds_names:
                    seen_ds_names.add(cand.lower())
                    is_gated = any(g in cand.lower() for g in ["mimic", "physionet", "uk biobank", "clinical", "hospital"])
                    is_private = any(p in cand.lower() for p in ["proprietary", "internal", "in-house", "private"])
                    acc = "private" if is_private else ("gated" if is_gated else "public")
                    found_datasets.append(
                        DatasetChecklist(
                            name=cand,
                            access_type=acc,
                            download_url=None,
                            preprocessing_notes=f"Detected empirical evaluation target: {cand}.",
                        )
                    )
                if len(found_datasets) >= 6:
                    break

        if not found_datasets:
            found_datasets.append(
                DatasetChecklist(
                    name="Standard Benchmark",
                    access_type="public",
                    download_url=None,
                    preprocessing_notes="Inspect paper methodology for specific dataset download protocols.",
                )
            )

        # ---------------------------------------------------------------------
        # 4. Missing Critical Elements Assessment
        # ---------------------------------------------------------------------
        missing_critical: List[str] = []
        if not code_availability.has_repo:
            missing_critical.append("Open-source code repository URL not disclosed in the publication.")
        if not code_availability.has_checkpoints:
            missing_critical.append("Pretrained model weights or release checkpoints not specified.")
        if not compute_budget.hardware_mentioned:
            missing_critical.append("Hardware specifications (GPU/TPU architecture and accelerator count) omitted.")
        if compute_budget.estimated_hours is None:
            missing_critical.append("Total compute budget / training duration in GPU hours not provided.")
        if any(d.access_type in ["gated", "private"] for d in found_datasets):
            missing_critical.append("Contains gated or proprietary datasets not immediately downloadable for independent replication.")
        if not code_availability.license:
            missing_critical.append("Code repository software license not explicitly designated.")
        missing_critical.append("Exhaustive random seeds, learning rate warmup schedules, or optimizer states not fully enumerated.")

        # ---------------------------------------------------------------------
        # 5. Reproducibility Score Calculation
        # ---------------------------------------------------------------------
        score = 15.0  # baseline
        if code_availability.has_repo:
            score += 30.0
            if code_availability.repo_url:
                score += 5.0
        if code_availability.framework:
            score += 10.0
        if code_availability.has_checkpoints:
            score += 10.0
        if code_availability.license:
            score += 5.0

        if compute_budget.hardware_mentioned:
            score += 10.0
        if compute_budget.gpu_count or compute_budget.estimated_hours:
            score += 10.0

        public_datasets = [d for d in found_datasets if d.access_type == "public"]
        if public_datasets:
            score += 15.0
        if any(d.access_type in ["gated", "private"] for d in found_datasets):
            score -= 15.0

        final_score = round(max(0.0, min(100.0, score)), 1)

        # ---------------------------------------------------------------------
        # 6. Friction Summary Narrative
        # ---------------------------------------------------------------------
        if final_score >= 75.0:
            friction_level = "Low Friction"
            friction_desc = (
                f"Strong reproducibility foundation with verified open-source repository "
                f"({code_availability.repo_url or 'available'}), {framework or 'standard ML'} framework, "
                f"and public benchmark datasets. Compute requirements ({compute_notes}) are reasonable for replication."
            )
        elif final_score >= 45.0:
            friction_level = "Moderate Friction"
            friction_desc = (
                f"Partially reproducible. Methodology and frameworks are identified, but replication requires "
                f"handling missing checkpoints or re-implementing undisclosed training hyperparameters. "
                f"Compute expenditure: {compute_notes}."
            )
        else:
            friction_level = "High Friction"
            friction_desc = (
                f"Difficult to independently replicate without substantial engineering overhead. "
                f"Missing public repository links, undisclosed compute budgets, or gated dataset access "
                f"create significant barriers to verification."
            )

        friction_summary = f"{friction_level}: {friction_desc}"

        # ---------------------------------------------------------------------
        # 7. Actionable Reproduction Steps
        # ---------------------------------------------------------------------
        repo_slug = repo_url.split("/")[-1].replace(".git", "") if repo_url else "repo"
        target_ds_name = found_datasets[0].name if found_datasets else "dataset"

        steps: List[ReproductionStep] = [
            ReproductionStep(
                step_number=1,
                phase="setup",
                action=(
                    f"Clone the {repo_url or 'official'} repository and initialize virtual environment "
                    f"with {framework or 'Python'} dependencies."
                ),
                suggested_command=(
                    f"git clone {repo_url} && cd {repo_slug} && pip install -r requirements.txt"
                    if repo_url
                    else "git clone <repository_url> && cd <repo> && pip install -r requirements.txt"
                ),
                verification_criteria="Environment imports core framework without ModuleNotFoundError and CUDA accelerators are detected.",
            ),
            ReproductionStep(
                step_number=2,
                phase="data_prep",
                action=f"Download and preprocess target evaluation dataset: {target_ds_name}.",
                suggested_command=f"python prepare_data.py --dataset {target_ds_name.lower().replace(' ', '_')}",
                verification_criteria="Dataset splits (train/val/test) are validated with matching sample counts and tokenized schemas.",
            ),
            ReproductionStep(
                step_number=3,
                phase="training",
                action="Initialize model architecture and execute training routine or load published checkpoints.",
                suggested_command=(
                    f"python train.py --config configs/train.yaml --gpus {gpu_count or 1}"
                    if has_repo
                    else "python train.py --config configs/baseline.yaml"
                ),
                verification_criteria="Training loss converges monotonically across epochs with checkpoint weights successfully saved to disk.",
            ),
            ReproductionStep(
                step_number=4,
                phase="eval",
                action=f"Execute evaluation protocol against {target_ds_name} benchmark and compare against reported metrics.",
                suggested_command="python evaluate.py --checkpoint best_checkpoint.pt --split test",
                verification_criteria="Observed benchmark scores align with published metrics within experimental margin of error (±0.5 - 1.0%).",
            ),
        ]

        return ReproductionMap(
            paper_id=paper_id,
            reproducibility_score=final_score,
            code_availability=code_availability,
            compute_budget=compute_budget,
            dataset_checklist=found_datasets,
            steps=steps,
            missing_critical_elements=missing_critical,
            friction_summary=friction_summary,
        )
