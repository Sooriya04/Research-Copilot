import logging
from typing import Any, Dict, List, Optional, Union

from src.core.schemas import PaperIntelligence
from src.graph.schema import (
    ClaimNode,
    DatasetNode,
    LimitationNode,
    MethodNode,
    MetricNode,
    NodeType,
    PaperNode,
    Relation,
    ResearchEdge,
    slugify_id,
)
from src.graph.store import ResearchGraphStore

logger = logging.getLogger(__name__)


class GraphBuilder:
    """Builds Knowledge Graph nodes and semantic edges into ResearchGraphStore from PaperIntelligence."""

    def __init__(self, store: ResearchGraphStore):
        self.store = store

    async def build_from_paper_intelligence(self, paper_intel: Union[PaperIntelligence, Any]) -> None:
        """Parse structured paper intelligence and construct/persist corresponding graph entities."""
        # 1. Extract PaperNode fields
        if hasattr(paper_intel, "id"):
            paper_id = paper_intel.id
        elif hasattr(paper_intel, "canonical_id"):
            paper_id = paper_intel.canonical_id
        elif isinstance(paper_intel, dict):
            paper_id = paper_intel.get("id") or paper_intel.get("canonical_id") or "unknown-paper"
        else:
            paper_id = str(getattr(paper_intel, "id", "unknown-paper"))

        title = getattr(paper_intel, "title", "") if not isinstance(paper_intel, dict) else paper_intel.get("title", "")
        year = getattr(paper_intel, "year", None) if not isinstance(paper_intel, dict) else paper_intel.get("year")
        venue = getattr(paper_intel, "venue", None) if not isinstance(paper_intel, dict) else paper_intel.get("venue")

        raw_authors = getattr(paper_intel, "authors", []) if not isinstance(paper_intel, dict) else paper_intel.get("authors", [])
        authors_list: List[str] = []
        for a in raw_authors:
            if isinstance(a, str):
                authors_list.append(a)
            elif hasattr(a, "name"):
                authors_list.append(a.name)
            elif isinstance(a, dict) and "name" in a:
                authors_list.append(a["name"])
            else:
                authors_list.append(str(a))

        paper_node = PaperNode(
            id=paper_id,
            title=title or "Untitled Paper",
            year=int(year) if year else None,
            venue=venue,
            authors=authors_list,
        )

        # Add PaperNode
        existing_paper = await self.store.get_node(paper_id)
        if not existing_paper:
            await self.store.add_node(paper_node)
            logger.info("Added PaperNode: %s", paper_id)

        # 2. Methods
        methods = getattr(paper_intel, "methods", []) if not isinstance(paper_intel, dict) else paper_intel.get("methods", [])
        for m in methods:
            if isinstance(m, str):
                method_name = m.strip()
                category = "general"
            elif isinstance(m, dict):
                method_name = m.get("name", "").strip() or str(m)
                category = m.get("category", "general")
            elif hasattr(m, "name"):
                method_name = getattr(m, "name", "").strip()
                category = getattr(m, "category", "general")
            else:
                method_name = str(m).strip()
                category = "general"

            if not method_name:
                continue

            method_id = slugify_id(method_name)
            existing_method = await self.store.get_node(method_id)
            if not existing_method:
                method_node = MethodNode(id=method_id, name=method_name, category=category)
                await self.store.add_node(method_node)
                logger.info("Added MethodNode: %s (%s)", method_id, method_name)

            edge = ResearchEdge(source_id=paper_id, target_id=method_id, relation=Relation.USES_METHOD)
            await self.store.add_edge(edge)

        # 3. Datasets
        datasets = getattr(paper_intel, "datasets", []) if not isinstance(paper_intel, dict) else paper_intel.get("datasets", [])
        for d in datasets:
            if isinstance(d, str):
                dataset_name = d.strip()
                domain = "general"
            elif isinstance(d, dict):
                dataset_name = d.get("name", "").strip() or str(d)
                domain = d.get("domain", "general")
            elif hasattr(d, "name"):
                dataset_name = getattr(d, "name", "").strip()
                domain = getattr(d, "domain", "general")
            else:
                dataset_name = str(d).strip()
                domain = "general"

            if not dataset_name:
                continue

            dataset_id = slugify_id(dataset_name)
            existing_dataset = await self.store.get_node(dataset_id)
            if not existing_dataset:
                dataset_node = DatasetNode(id=dataset_id, name=dataset_name, domain=domain)
                await self.store.add_node(dataset_node)
                logger.info("Added DatasetNode: %s (%s)", dataset_id, dataset_name)

            edge = ResearchEdge(source_id=paper_id, target_id=dataset_id, relation=Relation.EVALUATES_ON)
            await self.store.add_edge(edge)

        # 4. Metrics
        raw_metrics = getattr(paper_intel, "metrics", {}) if not isinstance(paper_intel, dict) else paper_intel.get("metrics", {})
        if isinstance(raw_metrics, dict):
            metric_items = list(raw_metrics.items())
            for key, val in metric_items:
                metric_name = str(key).strip()
                if not metric_name:
                    continue
                unit = val.get("unit") if isinstance(val, dict) else None
                metric_id = slugify_id(metric_name)
                existing_metric = await self.store.get_node(metric_id)
                if not existing_metric:
                    metric_node = MetricNode(id=metric_id, name=metric_name, unit=unit)
                    await self.store.add_node(metric_node)
                    logger.info("Added MetricNode: %s", metric_id)

                edge = ResearchEdge(source_id=paper_id, target_id=metric_id, relation=Relation.ACHIEVES)
                await self.store.add_edge(edge)
        elif isinstance(raw_metrics, list):
            for m in raw_metrics:
                if isinstance(m, str):
                    metric_name = m.strip()
                    unit = None
                elif isinstance(m, dict):
                    metric_name = m.get("metric", m.get("name", "")).strip()
                    unit = m.get("unit")
                elif hasattr(m, "metric"):
                    metric_name = getattr(m, "metric", "").strip()
                    unit = getattr(m, "unit", None)
                elif hasattr(m, "name"):
                    metric_name = getattr(m, "name", "").strip()
                    unit = getattr(m, "unit", None)
                else:
                    metric_name = str(m).strip()
                    unit = None

                if not metric_name:
                    continue

                metric_id = slugify_id(metric_name)
                existing_metric = await self.store.get_node(metric_id)
                if not existing_metric:
                    metric_node = MetricNode(id=metric_id, name=metric_name, unit=unit)
                    await self.store.add_node(metric_node)
                    logger.info("Added MetricNode: %s", metric_id)

                edge = ResearchEdge(source_id=paper_id, target_id=metric_id, relation=Relation.ACHIEVES)
                await self.store.add_edge(edge)

        # Also support benchmarks if present
        benchmarks = getattr(paper_intel, "benchmarks", []) if not isinstance(paper_intel, dict) else paper_intel.get("benchmarks", [])
        for bm in benchmarks:
            bm_dataset = getattr(bm, "dataset", None) if not isinstance(bm, dict) else bm.get("dataset")
            bm_metric = getattr(bm, "metric", None) if not isinstance(bm, dict) else bm.get("metric")
            if bm_dataset:
                ds_id = slugify_id(bm_dataset)
                if not await self.store.get_node(ds_id):
                    await self.store.add_node(DatasetNode(id=ds_id, name=bm_dataset, domain="benchmark"))
                await self.store.add_edge(ResearchEdge(source_id=paper_id, target_id=ds_id, relation=Relation.EVALUATES_ON))
            if bm_metric:
                m_id = slugify_id(bm_metric)
                if not await self.store.get_node(m_id):
                    await self.store.add_node(MetricNode(id=m_id, name=bm_metric))
                await self.store.add_edge(ResearchEdge(source_id=paper_id, target_id=m_id, relation=Relation.ACHIEVES))

        # 5. Claims
        claims = getattr(paper_intel, "claims", []) if not isinstance(paper_intel, dict) else paper_intel.get("claims", [])
        for idx, c in enumerate(claims):
            if isinstance(c, str):
                claim_text = c.strip()
                verified = False
                confidence = 0.8
            elif isinstance(c, dict):
                claim_text = c.get("claim", c.get("text", "")).strip()
                v_stat = c.get("verification_status")
                verified = (v_stat == "verified") or c.get("verified", False)
                confidence = float(c.get("confidence", 0.8))
            elif hasattr(c, "claim"):
                claim_text = getattr(c, "claim", "").strip()
                v_stat = getattr(c, "verification_status", None)
                verified = (v_stat == "verified") or getattr(c, "verified", False)
                confidence = float(getattr(c, "confidence", 0.8))
            elif hasattr(c, "text"):
                claim_text = getattr(c, "text", "").strip()
                verified = getattr(c, "verified", False)
                confidence = float(getattr(c, "confidence", 0.8))
            else:
                claim_text = str(c).strip()
                verified = False
                confidence = 0.8

            if not claim_text:
                continue

            slug_snippet = slugify_id(claim_text[:30])
            claim_id = f"claim-{paper_id}-{slug_snippet or idx}"
            
            existing_claim = await self.store.get_node(claim_id)
            if not existing_claim:
                claim_node = ClaimNode(
                    id=claim_id,
                    text=claim_text,
                    verified=bool(verified),
                    paper_id=paper_id,
                    confidence=confidence,
                )
                await self.store.add_node(claim_node)
                logger.info("Added ClaimNode: %s", claim_id)

            edge = ResearchEdge(source_id=paper_id, target_id=claim_id, relation=Relation.HAS_CLAIM)
            await self.store.add_edge(edge)

        # 6. Limitations
        limitations = getattr(paper_intel, "limitations", []) if not isinstance(paper_intel, dict) else paper_intel.get("limitations", [])
        for idx, lim in enumerate(limitations):
            if isinstance(lim, str):
                lim_text = lim.strip()
            elif isinstance(lim, dict):
                lim_text = lim.get("description", lim.get("text", "")).strip()
            elif hasattr(lim, "description"):
                lim_text = getattr(lim, "description", "").strip()
            elif hasattr(lim, "text"):
                lim_text = getattr(lim, "text", "").strip()
            else:
                lim_text = str(lim).strip()

            if not lim_text:
                continue

            slug_snippet = slugify_id(lim_text[:30])
            lim_id = f"lim-{paper_id}-{slug_snippet or idx}"

            existing_lim = await self.store.get_node(lim_id)
            if not existing_lim:
                lim_node = LimitationNode(id=lim_id, text=lim_text, paper_id=paper_id)
                await self.store.add_node(lim_node)
                logger.info("Added LimitationNode: %s", lim_id)

            edge = ResearchEdge(source_id=paper_id, target_id=lim_id, relation=Relation.LIMITED_BY)
            await self.store.add_edge(edge)

        # 7. Cited Papers
        cited_list = (
            getattr(paper_intel, "cited_papers", [])
            or getattr(paper_intel, "referenced_works", [])
            or (paper_intel.get("cited_papers", []) if isinstance(paper_intel, dict) else [])
            or (paper_intel.get("referenced_works", []) if isinstance(paper_intel, dict) else [])
        )
        for cited_id in cited_list:
            cid_str = str(cited_id).strip()
            if not cid_str:
                continue
            edge = ResearchEdge(source_id=paper_id, target_id=cid_str, relation=Relation.CITES)
            await self.store.add_edge(edge)
