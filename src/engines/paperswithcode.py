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

    async def search_tasks(self, query: str, limit: int = 10) -> List[Dict]:
        """Search for ML tasks by name (e.g. 'image classification', 'machine translation')."""
        results = []
        try:
            url = f"{self.BASE_URL}/tasks/"
            params = {"q": query, "page_size": limit}
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=True) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    for item in resp.json().get("results", []):
                        results.append({
                            "id": item.get("id"),
                            "name": item.get("name"),
                            "description": item.get("description", ""),
                            "categories": item.get("categories", []),
                            "url": f"https://paperswithcode.com/task/{item.get('id')}",
                        })
                    logger.info("[PapersWithCode] Found %d tasks for query '%s'", len(results), query)
        except Exception as e:
            logger.error("[PapersWithCode] Task search error: %s", e)
        return results

    async def get_sota_for_task(self, task_id: str, limit: int = 20) -> List[Dict]:
        """Fetch SOTA leaderboard results for a specific task (e.g. 'image-classification').

        Returns ranked list of {model, paper, dataset, metric, value, rank}.
        """
        rows = []
        try:
            url = f"{self.BASE_URL}/tasks/{task_id}/results/"
            params = {"page_size": limit, "ordering": "-metric_value"}
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=True) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    for i, item in enumerate(resp.json().get("results", []), start=1):
                        rows.append({
                            "rank": i,
                            "model": item.get("model_name") or item.get("methodology"),
                            "paper_title": item.get("paper", {}).get("title") if item.get("paper") else None,
                            "paper_url": item.get("paper", {}).get("url") if item.get("paper") else None,
                            "arxiv_id": item.get("paper", {}).get("arxiv_id") if item.get("paper") else None,
                            "dataset": item.get("dataset"),
                            "metric": item.get("metric"),
                            "value": item.get("metric_value"),
                            "evaluated_on": item.get("evaluated_on"),
                        })
                    logger.info("[PapersWithCode] Fetched %d SOTA rows for task '%s'", len(rows), task_id)
                else:
                    logger.warning("[PapersWithCode] SOTA task '%s' returned status %d", task_id, resp.status_code)
        except Exception as e:
            logger.error("[PapersWithCode] SOTA fetch error for task '%s': %s", task_id, e)
        return rows

    async def get_sota_for_dataset(self, dataset_id: str, limit: int = 20) -> List[Dict]:
        """Fetch SOTA leaderboard for a specific dataset (e.g. 'imagenet', 'squad').

        Returns ranked results per metric for that dataset.
        """
        rows = []
        try:
            url = f"{self.BASE_URL}/datasets/{dataset_id}/results/"
            params = {"page_size": limit}
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=True) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    metric_groups: Dict[str, list] = {}
                    for item in resp.json().get("results", []):
                        metric = item.get("metric", "Score")
                        metric_groups.setdefault(metric, []).append(item)

                    rank = 1
                    for metric, items in metric_groups.items():
                        # Sort descending by metric value
                        try:
                            items.sort(key=lambda x: float(x.get("metric_value", 0) or 0), reverse=True)
                        except (ValueError, TypeError):
                            pass
                        for i, item in enumerate(items[:limit], start=1):
                            rows.append({
                                "rank": i,
                                "metric": metric,
                                "model": item.get("model_name") or item.get("methodology"),
                                "paper_title": item.get("paper", {}).get("title") if item.get("paper") else None,
                                "arxiv_id": item.get("paper", {}).get("arxiv_id") if item.get("paper") else None,
                                "value": item.get("metric_value"),
                                "evaluated_on": item.get("evaluated_on"),
                            })
                    logger.info("[PapersWithCode] Fetched SOTA for dataset '%s': %d rows", dataset_id, len(rows))
                else:
                    logger.warning("[PapersWithCode] Dataset '%s' returned status %d", dataset_id, resp.status_code)
        except Exception as e:
            logger.error("[PapersWithCode] SOTA dataset error for '%s': %s", dataset_id, e)
        return rows

    async def search_datasets(self, query: str, limit: int = 10) -> List[Dict]:
        """Search for benchmark datasets by name (e.g. 'ImageNet', 'SQuAD', 'MMLU')."""
        results = []
        try:
            url = f"{self.BASE_URL}/datasets/"
            params = {"q": query, "page_size": limit}
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=True) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    for item in resp.json().get("results", []):
                        results.append({
                            "id": item.get("id"),
                            "name": item.get("name"),
                            "full_name": item.get("full_name"),
                            "description": item.get("description", ""),
                            "url": f"https://paperswithcode.com/dataset/{item.get('id')}",
                        })
                    logger.info("[PapersWithCode] Found %d datasets for query '%s'", len(results), query)
        except Exception as e:
            logger.error("[PapersWithCode] Dataset search error: %s", e)
        return results

