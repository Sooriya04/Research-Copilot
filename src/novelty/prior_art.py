"""
Module: src/novelty/prior_art.py

What this file does:
Implements Stage 5 (Prior-Art Verification) of the Novelty pipeline.
For each novelty candidate, searches local workspace papers and optionally external
academic search APIs (OpenAlex / arXiv) to identify overlapping components and
distinct contributions—never claiming absolute novelty when no match is found.

Classes & Functions:
- PriorArtVerifier: Performs keyword/semantic comparison and produces a
  PriorArtAssessment with explicit status and retrieved evidence.
"""
import re
from typing import Any, Dict, List, Optional

import httpx

from src.novelty.schemas import (
    GroundedPaper,
    NoveltyCandidate,
    PriorArtAssessment,
    PriorArtStatus,
)


class PriorArtVerifier:
    """Stage 5: Verifies novelty candidates against workspace and academic literature."""

    def __init__(self, http_client: Optional[httpx.AsyncClient] = None):
        self._custom_client = http_client
        self._shared_client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._custom_client is not None:
            return self._custom_client
        if self._shared_client is None or self._shared_client.is_closed:
            self._shared_client = httpx.AsyncClient(
                timeout=5.0,
                headers={"User-Agent": "ResearchCopilot/2.0 (mailto:admin@local)"},
            )
        return self._shared_client

    async def close(self) -> None:
        """Close internal HTTP client pool if open."""
        if self._shared_client is not None and not self._shared_client.is_closed:
            await self._shared_client.aclose()

    async def verify_candidate(
        self,
        candidate: NoveltyCandidate,
        workspace_papers: List[GroundedPaper],
        run_external_search: bool = True,
    ) -> PriorArtAssessment:
        """Assess prior-art overlap for a candidate without overclaiming novelty."""
        query = self._build_query(candidate)
        closest: List[Dict[str, Any]] = []

        # 1. Compare against local workspace papers
        cand_tokens = set(re.findall(r"[a-z0-9]{3,}", f"{candidate.title} {candidate.core_contribution}".lower()))
        for p in workspace_papers:
            if p.id in candidate.supporting_paper_ids:
                continue
            p_tokens = set(re.findall(r"[a-z0-9]{3,}", f"{p.title} {p.abstract}".lower()))
            if cand_tokens and p_tokens:
                overlap = len(cand_tokens & p_tokens) / max(len(cand_tokens), 1)
                if overlap >= 0.25:
                    closest.append({
                        "title": p.title,
                        "year": p.year,
                        "source": "workspace",
                        "similarity": round(overlap, 2),
                    })

        # 2. Query OpenAlex lightweight works search if enabled
        search_ok = True
        if run_external_search and query:
            try:
                client = await self._get_client()
                resp = await client.get(
                    "https://api.openalex.org/works",
                    params={"search": query, "per-page": 4, "select": "title,publication_year,doi"},
                )
                if resp.status_code == 200:
                    for w in resp.json().get("results", []):
                        w_title = w.get("title") or ""
                        if w_title:
                            w_tokens = set(re.findall(r"[a-z0-9]{3,}", w_title.lower()))
                            sim = len(cand_tokens & w_tokens) / max(len(cand_tokens), 1) if cand_tokens else 0.0
                            closest.append({
                                "title": w_title,
                                "year": w.get("publication_year"),
                                "doi": w.get("doi"),
                                "source": "openalex",
                                "similarity": round(sim, 2),
                            })
                else:
                    search_ok = False
            except Exception:
                search_ok = False

        closest.sort(key=lambda x: x.get("similarity", 0.0), reverse=True)
        top_sim = closest[0]["similarity"] if closest else 0.0

        if not search_ok and not closest:
            status = PriorArtStatus.INSUFFICIENT_EVIDENCE
            summary = "External prior-art search unavailable and no overlapping workspace papers found."
        elif top_sim >= 0.55:
            status = PriorArtStatus.SUBSTANTIAL_OVERLAP
            summary = f"Close conceptual overlap detected with '{closest[0]['title']}' (token overlap {top_sim:.0%})."
        elif top_sim >= 0.28:
            status = PriorArtStatus.POTENTIAL_OVERLAP
            summary = f"Partial overlap with '{closest[0]['title']}'; verify technical differentiation."
        else:
            status = PriorArtStatus.NO_CLOSE_MATCH
            summary = "No close match found in searched workspace or OpenAlex titles; does not guarantee absolute novelty."

        return PriorArtAssessment(
            candidate_id=candidate.id,
            status=status,
            queries_used=[query] if query else [],
            closest_papers=closest[:5],
            overlapping_components=[c["title"] for c in closest[:2]] if top_sim >= 0.28 else [],
            distinct_contributions=[candidate.core_contribution] if candidate.core_contribution else [],
            summary=summary,
        )

    @staticmethod
    def _build_query(candidate: NoveltyCandidate) -> str:
        words = re.findall(r"[A-Za-z0-9\-]+", candidate.title)
        return " ".join(words[:7])
