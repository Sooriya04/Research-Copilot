import re
import urllib.parse
from typing import Dict, List, Optional
import httpx
from src.core.canonical_models import BenchmarkEvidence, CodeRepository
from src.core.logger import logger

class PapersWithCodeClient:
    """Client for querying Papers With Code API and extracting benchmark tables & official repositories."""

    BASE_URL = "https://paperswithcode.com/api/v1"

    def __init__(self, timeout: float = 15.0):
        self.timeout = timeout
        self.headers = {"User-Agent": "ResearchCopilot/0.1.0"}

    async def get_paper_benchmarks(self, arxiv_id: Optional[str] = None, title: Optional[str] = None) -> List[BenchmarkEvidence]:
        """Fetch benchmark evaluation tables for a given paper."""
        benchmarks: List[BenchmarkEvidence] = []
        clean_arxiv = re.sub(r"v\d+$", "", arxiv_id) if arxiv_id else None

        query = clean_arxiv or title
        if not query:
            return benchmarks

        url = f"{self.BASE_URL}/papers/"
        params = {"arxiv_id": clean_arxiv} if clean_arxiv else {"q": title}

        try:
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=True) as client:
                resp = await client.get(url, params=params)
                if resp.status_code != 200:
                    logger.warning("[PapersWithCode] Paper search returned status %d for query '%s'", resp.status_code, query)
                    return benchmarks

                data = resp.json()
                results = data.get("results", [])
                if not results:
                    return benchmarks

                pwc_paper_id = results[0].get("id")
                paper_title = results[0].get("title", title)

                # Fetch results / evaluation tables
                eval_url = f"{self.BASE_URL}/papers/{pwc_paper_id}/results/"
                eval_resp = await client.get(eval_url)
                if eval_resp.status_code == 200:
                    eval_data = eval_resp.json()
                    for item in eval_data.get("results", []):
                        task = item.get("task", "General ML")
                        dataset = item.get("dataset", "Benchmark Dataset")
                        metric = item.get("metric", "Accuracy / Score")
                        val = str(item.get("value", "N/A"))
                        model_name = item.get("model_name") or results[0].get("title")

                        benchmarks.append(BenchmarkEvidence(
                            source="paperswithcode",
                            task=task,
                            dataset=dataset,
                            metric=metric,
                            value=val,
                            model=model_name,
                            split="test",
                            paper_title=paper_title,
                            repository_url=item.get("repo_url")
                        ))

                logger.info("[PapersWithCode] Extracted %d benchmark records for '%s'", len(benchmarks), query)
        except Exception as e:
            logger.error("[PapersWithCode] Ingestion error: %s", e)

        return benchmarks

    async def get_code_repositories(self, arxiv_id: Optional[str] = None, title: Optional[str] = None) -> List[CodeRepository]:
        """Fetch linked public code repositories for a paper."""
        repos: List[CodeRepository] = []
        clean_arxiv = re.sub(r"v\d+$", "", arxiv_id) if arxiv_id else None
        query = clean_arxiv or title
        if not query:
            return repos

        url = f"{self.BASE_URL}/papers/"
        params = {"arxiv_id": clean_arxiv} if clean_arxiv else {"q": title}

        try:
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=True) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    results = resp.json().get("results", [])
                    if results:
                        pwc_paper_id = results[0].get("id")
                        repo_url = f"{self.BASE_URL}/papers/{pwc_paper_id}/repositories/"
                        repo_resp = await client.get(repo_url)
                        if repo_resp.status_code == 200:
                            for r in repo_resp.json().get("results", []):
                                r_url = r.get("url")
                                if r_url:
                                    repos.append(CodeRepository(
                                        url=r_url,
                                        is_official=r.get("is_official", True),
                                        framework=r.get("framework"),
                                        stars=r.get("stars", 0)
                                    ))
        except Exception as e:
            logger.error("[PapersWithCode] Repository lookup error: %s", e)

        return repos
