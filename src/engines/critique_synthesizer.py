"""
Critique and Synthesis Engine for Research Copilot / PaperRank.
Implements evidence-grounded per-paper critiques, cross-paper synthesis,
multi-tier LLM resilience (Frontier -> Local Ollama -> Deterministic Heuristic),
and persistent SQLite caching.
"""

import hashlib
import json
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple
import aiosqlite
from pydantic import BaseModel, Field

from src.core.config import settings
from src.core.logger import logger
from src.core.schemas import Paper, PaperSection
from src.providers.base import BaseLLMProvider, ChatMessage
from src.providers.factory import get_llm_provider
from src.providers.llm import LocalOllamaProvider

CRITIQUE_PROMPT_VERSION = "v1.0"
SYNTHESIS_PROMPT_VERSION = "v1.0"


class PaperCritiqueSchema(BaseModel):
    """Schema-enforced per-paper critique result."""
    critique_strengths: List[str] = Field(default_factory=list)
    critique_concerns: List[str] = Field(default_factory=list)
    critique_questions: List[str] = Field(default_factory=list)
    evidence_sufficiency: str = "sufficient"  # sufficient | partial | insufficient
    confidence: float = 1.0
    notes: Optional[str] = None
    is_heuristic: bool = False
    engine: str = "llm"
    model: str = "frontier"


class SynthesisSchema(BaseModel):
    """Schema-enforced cross-paper synthesis output."""
    executive_overview: str
    consensus_and_foundations: str
    contradictions_and_debates: str
    recommended_reading_order: List[Dict[str, Any]] = Field(default_factory=list)
    markdown: str
    is_heuristic: bool = False
    engine: str = "llm"
    model: str = "frontier"


def extract_json_from_llm_text(text: str) -> Optional[Dict[str, Any]]:
    """Robustly extract a JSON dictionary from potentially noisy LLM output."""
    if not text:
        return None
    cleaned = text.strip()
    # Strip markdown fences
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    # Regex block search fallback
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        try:
            data = json.loads(match.group(0))
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return None


class CritiqueSynthesizer:
    """Modular research critique and synthesis engine with multi-tier LLM fallback and SQLite caching."""

    def __init__(
        self,
        provider: Optional[BaseLLMProvider] = None,
        db_path: Optional[str] = None,
        timeout: float = 25.0,
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
                logger.warning("[CritiqueSynthesizer] Cache table init warning: %s", e)

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
            logger.debug("[CritiqueSynthesizer] Cache read note: %s", e)
        return None

    async def _save_cached_result(
        self,
        cache_key: str,
        operation_type: str,
        input_hash: str,
        result_data: Dict[str, Any],
        model_info: str,
    ) -> None:
        """Store validated successful result in SQLite cache."""
        await self._ensure_cache_table()
        try:
            result_json = json.dumps(result_data, ensure_ascii=False)
            async with aiosqlite.connect(self.db_path, timeout=5.0) as db:
                await db.execute(
                    """
                    INSERT INTO critique_synthesis_cache (cache_key, operation_type, input_hash, result_json, model_info, updated_at)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(cache_key) DO UPDATE SET
                        result_json = excluded.result_json,
                        model_info = excluded.model_info,
                        updated_at = CURRENT_TIMESTAMP;
                    """,
                    (cache_key, operation_type, input_hash, result_json, model_info),
                )
                await db.commit()
        except Exception as e:
            logger.warning("[CritiqueSynthesizer] Failed to cache result: %s", e)

    def _build_cache_key(
        self,
        operation_type: str,
        prompt_version: str,
        model_name: str,
        stable_input_id: str,
        evidence_content: str,
    ) -> Tuple[str, str]:
        """Compute stable SHA-256 cache key and input hash."""
        evidence_digest = hashlib.sha256(evidence_content.encode("utf-8")).hexdigest()[:16]
        input_hash = hashlib.sha256(f"{stable_input_id}:{evidence_digest}".encode("utf-8")).hexdigest()
        cache_key = hashlib.sha256(
            f"{operation_type}:{prompt_version}:{model_name}:{input_hash}".encode("utf-8")
        ).hexdigest()
        return cache_key, input_hash

    async def _resolve_provider(self) -> Tuple[Optional[BaseLLMProvider], str, str]:
        """
        Resolve LLM provider following the resilience priority:
        1. Frontier Provider (Gemini Flash-Lite / DeepSeek / OpenRouter / Groq)
        2. Local Ollama (phi4-mini)
        3. None (Heuristic fallback)
        """
        if self._custom_provider:
            return self._custom_provider, getattr(self._custom_provider, "provider_name", "custom"), getattr(self._custom_provider, "model", "default")

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
            logger.debug("[CritiqueSynthesizer] Frontier credential check: %s", ex)

        # Tier 2: Check Local Ollama
        try:
            ollama_url = getattr(settings, "ollama_base_url", "http://localhost:11434")
            ollama_model = getattr(settings, "ollama_model", "phi4-mini")
            ollama_prov = LocalOllamaProvider(model=ollama_model, base_url=ollama_url)
            # Fast check
            conn_test = await ollama_prov.test_connection()
            if conn_test.get("success"):
                return ollama_prov, "ollama", ollama_model
        except Exception as ex:
            logger.debug("[CritiqueSynthesizer] Local Ollama probe note: %s", ex)

        # Tier 3: Heuristic
        return None, "heuristic", "deterministic-rules"

    # =========================================================================
    # Operation A: Per-Paper Critique
    # =========================================================================

    def _build_paper_evidence_summary(self, paper: Paper, sections: Optional[List[PaperSection]] = None) -> str:
        """Construct compact, evidence-grounded summary of paper contents for critique."""
        lines = [
            f"TITLE: {paper.title}",
            f"AUTHORS: {', '.join(a.name for a in paper.authors[:6]) if paper.authors else 'Unknown'}",
            f"YEAR: {paper.year or 'N/A'}",
            f"IDENTIFIERS: DOI={paper.doi or 'N/A'} | arXiv={paper.arxiv_id or 'N/A'} | PMCID={paper.pmcid or 'N/A'}",
            f"CITATIONS: {paper.citation_count}",
            f"\nABSTRACT:\n{paper.abstract or 'No abstract provided.'}\n",
        ]

        if paper.checklist:
            rub = paper.checklist
            lines.append("CHECKLIST & EMPIRICAL RIGOR ASSESSMENT:")
            lines.append(f"- Ablation Studies Present: {rub.has_ablation}")
            lines.append(f"- Empirical Baselines Compared: {rub.has_baselines}")
            lines.append(f"- Standard Benchmarks Evaluated: {rub.has_benchmarks}")
            lines.append(f"- Uncertainty / Error Bars Quantified: {rub.has_uncertainty_quant}")
            lines.append(f"- Open Code Repository: {rub.has_code_repo} (URL: {rub.code_url or 'None'})")
            lines.append(f"- Dataset Links Provided: {rub.has_dataset_link}")
            lines.append(f"- Compute Budget Disclosed: {rub.has_compute_budget} (Details: {rub.compute_details or 'None'})")
            lines.append(f"- Explicit Limitations Discussed: {rub.has_limitations}\n")

        secs_to_use = sections or paper.sections or []
        if secs_to_use:
            lines.append("AVAILABLE FULL-TEXT SECTION EXCERPTS:")
            for s in secs_to_use[:6]:
                clean_sec_type = (s.section_type or "section").upper()
                words = (s.content or "").split()[:250]
                lines.append(f"[{clean_sec_type} - {s.title}]: {' '.join(words)}")

        return "\n".join(lines)

    async def critique_paper(
        self,
        paper: Paper,
        sections: Optional[List[PaperSection]] = None,
        force_refresh: bool = False,
    ) -> PaperCritiqueSchema:
        """Generate schema-validated, evidence-grounded critique for a single paper."""
        evidence_text = self._build_paper_evidence_summary(paper, sections)
        stable_id = paper.doi or paper.arxiv_id or paper.openalex_id or paper.id or paper.title

        provider, engine_tier, model_name = await self._resolve_provider()
        cache_key, input_hash = self._build_cache_key(
            operation_type="critique",
            prompt_version=CRITIQUE_PROMPT_VERSION,
            model_name=model_name,
            stable_input_id=stable_id,
            evidence_content=evidence_text,
        )

        if not force_refresh:
            cached = await self._get_cached_result(cache_key)
            if cached:
                logger.info("[CritiqueSynthesizer] Cache HIT for paper critique '%s'", paper.title[:40])
                res = PaperCritiqueSchema(**cached)
                paper.critique_strengths = res.critique_strengths
                paper.critique_concerns = res.critique_concerns
                paper.critique_questions = res.critique_questions
                return res

        # Run multi-tier LLM resolution
        critique_result: Optional[PaperCritiqueSchema] = None

        if provider is not None:
            critique_result = await self._run_llm_critique(provider, paper, evidence_text, engine_tier, model_name)

        # Fallback to local Ollama if primary frontier failed
        if critique_result is None and engine_tier == "frontier":
            try:
                logger.info("[CritiqueSynthesizer] Frontier critique failed; trying local Ollama fallback.")
                ollama_url = getattr(settings, "ollama_base_url", "http://localhost:11434")
                ollama_model = getattr(settings, "ollama_model", "phi4-mini")
                ollama_prov = LocalOllamaProvider(model=ollama_model, base_url=ollama_url)
                critique_result = await self._run_llm_critique(ollama_prov, paper, evidence_text, "ollama", ollama_model)
            except Exception as e:
                logger.debug("[CritiqueSynthesizer] Ollama critique fallback error: %s", e)

        # Fallback to deterministic heuristic if all LLM tiers failed or unavailable
        if critique_result is None:
            logger.info("[CritiqueSynthesizer] Running deterministic heuristic critique for '%s'", paper.title[:40])
            critique_result = self._heuristic_critique(paper, sections)

        # Save to SQLite cache if valid
        await self._save_cached_result(
            cache_key=cache_key,
            operation_type="critique",
            input_hash=input_hash,
            result_data=critique_result.model_dump(),
            model_info=f"{critique_result.engine}:{critique_result.model}",
        )

        # Populate paper model
        paper.critique_strengths = critique_result.critique_strengths
        paper.critique_concerns = critique_result.critique_concerns
        paper.critique_questions = critique_result.critique_questions

        return critique_result

    async def _run_llm_critique(
        self,
        provider: BaseLLMProvider,
        paper: Paper,
        evidence_text: str,
        engine_name: str,
        model_name: str,
    ) -> Optional[PaperCritiqueSchema]:
        """Execute LLM critique prompt with JSON schema validation."""
        system_prompt = (
            "You are a rigorous AI Research Peer Reviewer and Scientific Reproduction Engineer.\n"
            "Analyze the provided research paper evidence package and generate a structured critique.\n"
            "STRICT RULES:\n"
            "1. Ground every claim directly in the provided evidence. Never invent empirical numbers, baseline models, or results.\n"
            "2. Distinguish verified facts, plausible limitations, and unknown information.\n"
            "3. If evidence on a specific aspect (e.g. compute budget or limitations) is absent, explicitly state that evidence is insufficient.\n"
            "4. You must output valid JSON matching this schema:\n"
            "{\n"
            '  "critique_strengths": ["Clear evidence-backed methodological, architectural, or empirical strength 1", "..."],\n'
            '  "critique_concerns": ["Evidence-backed limitation, missing baseline, compute opacity, or generalization concern 1", "..."],\n'
            '  "critique_questions": ["Specific technical question for the authors or reproduction engineer 1", "..."],\n'
            '  "evidence_sufficiency": "sufficient" | "partial" | "insufficient",\n'
            '  "confidence": 0.9,\n'
            '  "notes": "Brief context on evaluation grounding"\n'
            "}"
        )

        messages = [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=f"Critique this paper based strictly on the evidence below:\n\n{evidence_text}"),
        ]

        try:
            kwargs: Dict[str, Any] = {"temperature": 0.1}
            if isinstance(provider, LocalOllamaProvider):
                kwargs["json_mode"] = True

            raw_reply = await provider.complete(messages, **kwargs)
            parsed = extract_json_from_llm_text(raw_reply)
            if not parsed or not isinstance(parsed, dict):
                return None

            strengths = [str(s).strip() for s in parsed.get("critique_strengths", []) if str(s).strip()]
            concerns = [str(c).strip() for c in parsed.get("critique_concerns", []) if str(c).strip()]
            questions = [str(q).strip() for q in parsed.get("critique_questions", []) if str(q).strip()]

            if not strengths and not concerns:
                return None

            return PaperCritiqueSchema(
                critique_strengths=strengths,
                critique_concerns=concerns,
                critique_questions=questions,
                evidence_sufficiency=parsed.get("evidence_sufficiency", "partial"),
                confidence=float(parsed.get("confidence", 0.85)),
                notes=parsed.get("notes"),
                is_heuristic=False,
                engine=engine_name,
                model=model_name,
            )
        except Exception as e:
            logger.warning("[CritiqueSynthesizer] LLM critique failed (%s/%s): %s", engine_name, model_name, e)
            return None

    def _heuristic_critique(
        self,
        paper: Paper,
        sections: Optional[List[PaperSection]] = None,
    ) -> PaperCritiqueSchema:
        """Deterministic rule-based critique when no LLM is available, grounded in metadata & rubrics."""
        strengths: List[str] = []
        concerns: List[str] = []
        questions: List[str] = []

        rub = paper.checklist

        # 1. Strengths heuristics
        if rub and rub.has_code_repo and rub.code_url:
            strengths.append(f"Provides open-source codebase for empirical verification at {rub.code_url}.")
        elif rub and rub.has_code_repo:
            strengths.append("Discloses link to public code repository for reproduction.")

        if rub and rub.has_ablation:
            strengths.append("Includes ablation studies isolating individual architectural components and hyperparameter sensitivities.")

        if rub and rub.has_uncertainty_quant:
            strengths.append("Reports statistical variance, standard deviation error bars, or multi-seed trials.")

        if rub and rub.has_baselines:
            strengths.append("Evaluates proposed approach against competitive published baselines.")

        if paper.citation_count and paper.citation_count > 50:
            strengths.append(f"Demonstrated high scientific impact with {paper.citation_count} field citations.")

        if not strengths:
            strengths.append(f"Proposes focused formulation: '{paper.title}' with empirical evaluation.")

        # 2. Concerns heuristics
        if rub and not rub.has_code_repo:
            concerns.append("Lacks public repository link in extracted text; empirical reproduction requires reimplementation.")

        if rub and not rub.has_uncertainty_quant:
            concerns.append("Missing statistical significance testing or error bars across random initialization seeds.")

        if rub and not rub.has_compute_budget:
            concerns.append("Hardware setup, GPU/TPU hours, and total compute budget are undisclosed or opaque.")

        if rub and not rub.has_ablation:
            concerns.append("Lacks explicit ablation studies demonstrating necessity of individual algorithmic contributions.")

        if rub and not rub.has_limitations:
            concerns.append("Did not identify explicit failure modes, edge cases, or dataset shift constraints in extracted sections.")

        if not concerns:
            concerns.append("Available full-text evidence is partial; deeper evaluation requires inspecting all supplementary materials.")

        # 3. Questions heuristics
        questions.append("Under what distribution shifts or out-of-domain benchmarks does the proposed architecture degrade?")
        questions.append("What are the exact hardware and memory requirements for pretraining and fine-tuning baselines?")
        if rub and not rub.has_code_repo:
            questions.append("Will pre-trained weights and environment configuration files (Dockerfile/conda) be made publicly available?")
        else:
            questions.append("Can the reported empirical gains be reproduced under identical random seed splits without hyperparameter tuning?")

        prefix_notice = "[Rule-Based Heuristic Analysis - Offline Fallback]"
        return PaperCritiqueSchema(
            critique_strengths=[f"{prefix_notice} {s}" if i == 0 else s for i, s in enumerate(strengths)],
            critique_concerns=concerns,
            critique_questions=questions,
            evidence_sufficiency="partial" if sections else "insufficient",
            confidence=0.7,
            notes="Evaluated using deterministic rule heuristics grounded in rubric checks.",
            is_heuristic=True,
            engine="heuristic",
            model="deterministic-rules",
        )

    async def critique_papers(
        self,
        papers: List[Paper],
        top_n: int = 3,
        force_refresh: bool = False,
    ) -> List[Paper]:
        """Critique top N ranked papers and populate critique fields in place."""
        if not papers or top_n <= 0:
            return papers

        count = min(top_n, len(papers))
        logger.info("[CritiqueSynthesizer] Generating critiques for top %d papers.", count)
        for p in papers[:count]:
            await self.critique_paper(p, force_refresh=force_refresh)
        return papers

    # =========================================================================
    # Operation B: Cross-Paper Synthesis
    # =========================================================================

    def _build_synthesis_evidence_summary(self, query: str, papers: List[Paper]) -> str:
        """Construct multi-paper summary for comparative synthesis."""
        lines = [
            f"TARGET RESEARCH QUERY: '{query}'",
            f"TOTAL PAPERS ANALYZED: {len(papers)}\n",
            "CANDIDATE PAPERS:",
        ]

        for idx, p in enumerate(papers, 1):
            lines.append(
                f"\n--- PAPER {idx}: {p.title} ---\n"
                f"ID: {p.id} | Year: {p.year or 'N/A'} | Citations: {p.citation_count} | DOI: {p.doi or 'N/A'}\n"
                f"Abstract: {p.abstract[:500] if p.abstract else 'N/A'}"
            )
            if p.checklist:
                lines.append(
                    f"Rigor: Code={p.checklist.has_code_repo}, Ablations={p.checklist.has_ablation}, "
                    f"Baselines={p.checklist.has_baselines}, Uncertainty={p.checklist.has_uncertainty_quant}"
                )
            if p.critique_strengths:
                lines.append(f"Identified Strengths: {'; '.join(p.critique_strengths[:2])}")
            if p.critique_concerns:
                lines.append(f"Identified Concerns: {'; '.join(p.critique_concerns[:2])}")

        return "\n".join(lines)

    async def synthesize_papers(
        self,
        query: str,
        papers: List[Paper],
        force_refresh: bool = False,
    ) -> str:
        """
        Produce structured cross-paper synthesis markdown covering:
        - Executive Overview
        - Consensus & Common Foundations
        - Contradictions & Open Debates
        - Recommended Reading Order
        """
        if not papers:
            return f"# Research Synthesis: {query}\n\nNo candidate papers found to synthesize."

        evidence_text = self._build_synthesis_evidence_summary(query, papers)
        paper_ids = [p.id for p in papers]
        stable_id = f"synthesis:{query}:{':'.join(sorted(paper_ids[:15]))}"

        provider, engine_tier, model_name = await self._resolve_provider()
        cache_key, input_hash = self._build_cache_key(
            operation_type="synthesis",
            prompt_version=SYNTHESIS_PROMPT_VERSION,
            model_name=model_name,
            stable_input_id=stable_id,
            evidence_content=evidence_text,
        )

        if not force_refresh:
            cached = await self._get_cached_result(cache_key)
            if cached and isinstance(cached, dict) and cached.get("markdown"):
                logger.info("[CritiqueSynthesizer] Cache HIT for topic synthesis '%s'", query[:40])
                return cached["markdown"]

        synthesis_result: Optional[SynthesisSchema] = None

        if provider is not None:
            synthesis_result = await self._run_llm_synthesis(provider, query, papers, evidence_text, engine_tier, model_name)

        if synthesis_result is None and engine_tier == "frontier":
            try:
                logger.info("[CritiqueSynthesizer] Frontier synthesis failed; trying local Ollama fallback.")
                ollama_url = getattr(settings, "ollama_base_url", "http://localhost:11434")
                ollama_model = getattr(settings, "ollama_model", "phi4-mini")
                ollama_prov = LocalOllamaProvider(model=ollama_model, base_url=ollama_url)
                synthesis_result = await self._run_llm_synthesis(ollama_prov, query, papers, evidence_text, "ollama", ollama_model)
            except Exception as e:
                logger.debug("[CritiqueSynthesizer] Ollama synthesis fallback error: %s", e)

        if synthesis_result is None:
            logger.info("[CritiqueSynthesizer] Running deterministic heuristic synthesis for '%s'", query[:40])
            synthesis_result = self._heuristic_synthesis(query, papers)

        # Cache valid synthesis markdown
        await self._save_cached_result(
            cache_key=cache_key,
            operation_type="synthesis",
            input_hash=input_hash,
            result_data=synthesis_result.model_dump(),
            model_info=f"{synthesis_result.engine}:{synthesis_result.model}",
        )

        return synthesis_result.markdown

    async def _run_llm_synthesis(
        self,
        provider: BaseLLMProvider,
        query: str,
        papers: List[Paper],
        evidence_text: str,
        engine_name: str,
        model_name: str,
    ) -> Optional[SynthesisSchema]:
        """Execute cross-paper synthesis with JSON schema enforcement and formatted Markdown output."""
        system_prompt = (
            "You are an expert AI Research Director synthesizing a literature cluster.\n"
            "Generate a structured scientific synthesis comparing the evaluated papers.\n"
            "STRICT RULES:\n"
            "1. Ground all comparisons in the provided evidence. Cite papers using their titles, years, and IDs/DOIs.\n"
            "2. Distinguish actual empirical contradictions from differences in datasets, tasks, or evaluation protocols.\n"
            "3. Provide a transparent, pedagogically sound recommended reading order (from foundational theory to recent adaptations).\n"
            "4. You must output valid JSON matching this schema:\n"
            "{\n"
            '  "executive_overview": "Concise high-level synthesis of paradigm shifts and problem landscape.",\n'
            '  "consensus_and_foundations": "Key methodologies, shared assumptions, and benchmarks the papers agree upon.",\n'
            '  "contradictions_and_debates": "Open disputes, trade-offs (e.g. efficiency vs accuracy), or conflicting findings.",\n'
            '  "recommended_reading_order": [\n'
            '     {"rank": 1, "paper_id": "...", "title": "...", "rationale": "Why read this first"}\n'
            "  ],\n"
            '  "markdown": "Complete, beautifully formatted GitHub Markdown report presenting the executive overview, consensus, debates, and reading order."\n'
            "}"
        )

        messages = [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=f"Synthesize these research papers for topic '{query}':\n\n{evidence_text}"),
        ]

        try:
            kwargs: Dict[str, Any] = {"temperature": 0.15}
            if isinstance(provider, LocalOllamaProvider):
                kwargs["json_mode"] = True

            raw_reply = await provider.complete(messages, **kwargs)
            parsed = extract_json_from_llm_text(raw_reply)
            if not parsed or not isinstance(parsed, dict):
                return None

            md_content = parsed.get("markdown")
            if not md_content or len(md_content.strip()) < 50:
                # Format fallback markdown from JSON fields
                md_content = self._format_markdown_from_fields(
                    query=query,
                    overview=parsed.get("executive_overview", ""),
                    consensus=parsed.get("consensus_and_foundations", ""),
                    debates=parsed.get("contradictions_and_debates", ""),
                    reading_order=parsed.get("recommended_reading_order", []),
                    engine=engine_name,
                    model=model_name,
                )

            return SynthesisSchema(
                executive_overview=parsed.get("executive_overview", ""),
                consensus_and_foundations=parsed.get("consensus_and_foundations", ""),
                contradictions_and_debates=parsed.get("contradictions_and_debates", ""),
                recommended_reading_order=parsed.get("recommended_reading_order", []),
                markdown=md_content,
                is_heuristic=False,
                engine=engine_name,
                model=model_name,
            )
        except Exception as e:
            logger.warning("[CritiqueSynthesizer] LLM synthesis failed (%s/%s): %s", engine_name, model_name, e)
            return None

    def _format_markdown_from_fields(
        self,
        query: str,
        overview: str,
        consensus: str,
        debates: str,
        reading_order: List[Dict[str, Any]],
        engine: str,
        model: str,
    ) -> str:
        """Helper to build consistent publication-grade markdown synthesis."""
        md = [
            f"# Scientific Literature Synthesis: {query.title()}",
            f"> **Generated via:** `{engine}:{model}` | Grounded in retrieved evidence\n",
            "## 1. Executive Overview",
            overview or "Evaluates state-of-the-art methodology, benchmark progression, and architectural trade-offs.",
            "\n## 2. Consensus & Common Foundations",
            consensus or "Papers establish shared empirical baselines and benchmark validation protocols.",
            "\n## 3. Contradictions & Open Debates",
            debates or "Differing performance trade-offs under constrained computational resources and dataset scale.",
            "\n## 4. Recommended Reading Order",
        ]

        if reading_order:
            for item in reading_order:
                rank = item.get("rank", "-")
                title = item.get("title", "Paper")
                rationale = item.get("rationale", "")
                pid = item.get("paper_id", "")
                md.append(f"{rank}. **{title}** (`{pid}`)\n   - *Rationale*: {rationale}")
        else:
            md.append("1. Foundational baseline papers establishing core architectural formulations.\n2. Modern state-of-the-art adaptations.")

        return "\n".join(md)

    def _heuristic_synthesis(self, query: str, papers: List[Paper]) -> SynthesisSchema:
        """Deterministic heuristic synthesis when all LLM tiers are unavailable."""
        sorted_by_year = sorted(papers, key=lambda p: (p.year or 2000, p.citation_count or 0))
        sorted_by_impact = sorted(papers, key=lambda p: p.citation_count or 0, reverse=True)

        earliest = sorted_by_year[0] if sorted_by_year else None
        latest = sorted_by_year[-1] if sorted_by_year else None
        top_cited = sorted_by_impact[0] if sorted_by_impact else None

        overview = (
            f"Rule-based literature survey analyzing {len(papers)} candidate papers for '{query}'. "
            f"Spans publication years {earliest.year if earliest else 'N/A'} through {latest.year if latest else 'N/A'}. "
            f"The most heavily cited anchor is '{top_cited.title if top_cited else 'N/A'}' with {top_cited.citation_count if top_cited else 0} citations."
        )

        consensus = (
            "Across the candidate papers, empirical verification relies on standardized benchmark splits and comparative baseline evaluation. "
            f"{sum(1 for p in papers if p.checklist and p.checklist.has_code_repo)} of {len(papers)} papers link open-source code repositories."
        )

        debates = (
            "Empirical results reflect variance across compute budgets, token horizons, and dataset domains. "
            "Differences in reported performance should be evaluated against differences in parameter scales and training regimes rather than fundamental algorithmic conflicts."
        )

        reading_order = []
        for idx, p in enumerate(sorted_by_year, 1):
            reading_order.append({
                "rank": idx,
                "paper_id": p.id,
                "title": p.title,
                "rationale": f"Published in {p.year or 'N/A'} with {p.citation_count or 0} citations; establishes contextual lineage.",
            })

        md_lines = [
            f"# Scientific Literature Synthesis: {query.title()}",
            "> [!NOTE]",
            "> **Rule-Based Heuristic Fallback**: Generated deterministically without active LLM provider.",
            "\n## 1. Executive Overview",
            overview,
            "\n## 2. Consensus & Common Foundations",
            consensus,
            "\n## 3. Contradictions & Open Debates",
            debates,
            "\n## 4. Recommended Reading Order",
        ]

        for item in reading_order:
            md_lines.append(f"{item['rank']}. **{item['title']}** (`{item['paper_id']}`)\n   - *Rationale*: {item['rationale']}")

        return SynthesisSchema(
            executive_overview=overview,
            consensus_and_foundations=consensus,
            contradictions_and_debates=debates,
            recommended_reading_order=reading_order,
            markdown="\n".join(md_lines),
            is_heuristic=True,
            engine="heuristic",
            model="deterministic-rules",
        )
