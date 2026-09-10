import re
from typing import Optional, Tuple
from src.core.canonical_models import AuthorEntity, CanonicalPaper, SourceMetadata
from src.core.logger import logger
from src.engines.access_resolver import AccessResolver

class CanonicalPaperResolver:
    """Resolves any identifier (DOI, arXiv ID, OpenAlex ID, PMID, Title) into a canonical paper representation."""

    def __init__(self):
        self.access_resolver = AccessResolver()

    @staticmethod
    def normalize_identifier(identifier: str) -> Tuple[str, str]:
        """Classify and normalize identifier to (id_type, clean_value)."""
        raw = identifier.strip()
        lower = raw.lower()

        # OpenAlex ID (e.g. W2741809807, https://openalex.org/W...)
        if re.match(r"^[wW]\d+$", raw) or "openalex.org/w" in lower:
            match = re.search(r"[wW]\d+", raw)
            return "openalex", match.group(0).upper() if match else raw

        # DOI (e.g. 10.1038/s41586-021-03819-2, https://doi.org/10....)
        if raw.startswith("10.") or "doi.org/10." in lower:
            match = re.search(r"10\.\d{4,9}/[-._;()/:A-Za-z0-9]+", raw)
            return "doi", match.group(0) if match else raw

        # arXiv ID (e.g. 2309.00667, 1706.03762v5, arxiv:1706.03762)
        if lower.startswith("arxiv:") or "arxiv.org/" in lower or re.match(r"^\d{4}\.\d{4,5}(v\d+)?$", raw):
            clean_str = re.sub(r"^arxiv:\s*", "", raw, flags=re.IGNORECASE)
            clean_str = clean_str.split("/abs/")[-1].split("/pdf/")[-1].replace(".pdf", "")
            match = re.search(r"\d{4}\.\d{4,5}", clean_str)
            return "arxiv", match.group(0) if match else clean_str

        # PMID
        if lower.startswith("pmid:") or re.match(r"^\d{7,9}$", raw):
            return "pmid", re.sub(r"^pmid:\s*", "", raw, flags=re.IGNORECASE).strip()

        return "title", raw

    async def resolve(self, identifier: str) -> Optional[CanonicalPaper]:
        """Resolve identifier across providers and construct unified CanonicalPaper."""
        id_type, clean_id = self.normalize_identifier(identifier)
        logger.info("[CanonicalResolver] Resolving identifier: '%s' (type: %s, clean: %s)", identifier, id_type, clean_id)

        # 1. Query underlying AccessResolver
        res = await self.access_resolver.resolve_identifier(identifier)
        if not res.paper:
            if id_type == "title":
                papers = await self.access_resolver.search_openalex(clean_id, limit=1)
                if papers:
                    res.paper = papers[0]
            elif id_type == "arxiv":
                papers = await self.access_resolver.search_arxiv(clean_id, limit=1)
                if papers:
                    res.paper = papers[0]

        if not res.paper:
            logger.warning("[CanonicalResolver] Could not resolve paper for: '%s'", identifier)
            return None

        p = res.paper
        base_arxiv = re.sub(r"v\d+$", "", p.arxiv_id) if p.arxiv_id else None

        # Determine primary canonical ID: prefer DOI -> arXiv -> OpenAlex -> Hash
        canonical_id = (
            f"doi:{p.doi}" if p.doi
            else (f"arxiv:{base_arxiv}" if base_arxiv
            else (f"openalex:{p.openalex_id}" if p.openalex_id
            else f"paper:{hash(p.title)}"))
        )

        # Canonical Authors
        authors = [
            AuthorEntity(
                name=a.name,
                affiliation=a.affiliation,
                author_id=a.author_id,
                orcid=a.orcid
            )
            for a in p.authors
        ]

        # Canonical Source Metadata
        sources = [
            SourceMetadata(
                source_name=p.primary_source,
                external_id=p.id,
                url=p.url,
                is_primary=True,
                raw_metadata={"citation_count": p.citation_count, "is_oa": p.is_open_access}
            )
        ]

        canonical = CanonicalPaper(
            canonical_id=canonical_id,
            title=p.title,
            abstract=p.abstract,
            authors=authors,
            doi=p.doi,
            arxiv_id=base_arxiv,
            openalex_id=p.openalex_id,
            publication_date=p.publication_date,
            year=p.year,
            venue=None,
            pdf_url=p.pdf_url,
            is_open_access=p.is_open_access,
            citation_count=p.citation_count,
            sources=sources
        )

        return canonical
