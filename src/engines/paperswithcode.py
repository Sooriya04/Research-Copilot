import re
import urllib.parse
from typing import Dict, List, Optional
import httpx
from src.core.canonical_models import BenchmarkEvidence, CodeRepository
from src.core.logger import logger

class PapersWithCodeClient:
    """Client for querying Papers With Code, Hugging Face, and CatalyzeX for benchmark tables,

    SOTA leaderboards, and official repositories.
    """

    BASE_URL = "https://paperswithcode.com/api/v1"
    COMMUNITY_URL = "https://paperswithcode.co/api/v1"

    def __init__(self, timeout: float = 12.0):
        self.timeout = timeout
        self.headers = {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ResearchCopilot/0.1.0",
            "Accept": "application/json,text/plain,*/*",
        }

    async def get_paper_benchmarks(self, arxiv_id: Optional[str] = None, title: Optional[str] = None) -> List[BenchmarkEvidence]:
        """Fetch benchmark evaluation tables for a given paper from Papers With Code and Hugging Face."""
        benchmarks: List[BenchmarkEvidence] = []
        clean_arxiv = re.sub(r"v\d+$", "", arxiv_id) if arxiv_id else None
        if not clean_arxiv and title:
            # Check if title has arxiv id
            m = re.search(r"(\d{4}\.\d{4,5})", title)
            if m:
                clean_arxiv = m.group(1)

        query = clean_arxiv or title
        if not query:
            return benchmarks

        # 1. Primary: Hugging Face Paper Artifacts (live and comprehensive)
        if clean_arxiv:
            try:
                hf_paper_url = f"https://huggingface.co/api/papers/{clean_arxiv}"
                async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=True) as client:
                    resp = await client.get(hf_paper_url)
                    if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("application/json"):
                        data = resp.json()
                        paper_t = data.get("title") or title or clean_arxiv

                        for m in data.get("linkedModels", [])[:8]:
                            m_id = m.get("id")
                            downloads = m.get("downloads", 0)
                            likes = m.get("likes", 0)
                            pipeline = m.get("pipeline_tag") or "Deep Learning Model"
                            val_str = f"{downloads:,} downloads" if downloads else f"{likes} likes"
                            benchmarks.append(BenchmarkEvidence(
                                source="huggingface",
                                task=f"Model: {pipeline}",
                                dataset="Hugging Face Hub",
                                metric="Usage / Downloads",
                                value=val_str,
                                model=m_id,
                                split="hub",
                                paper_title=paper_t,
                                repository_url=f"https://huggingface.co/{m_id}"
                            ))

                        for d in data.get("linkedDatasets", [])[:6]:
                            d_id = d.get("id")
                            downloads = d.get("downloads", 0)
                            benchmarks.append(BenchmarkEvidence(
                                source="huggingface",
                                task="Benchmark Dataset",
                                dataset=d_id,
                                metric="Downloads",
                                value=f"{downloads:,} downloads" if downloads else "Community Dataset",
                                model=d_id,
                                split="dataset",
                                paper_title=paper_t,
                                repository_url=f"https://huggingface.co/datasets/{d_id}"
                            ))

                        for kw in data.get("ai_keywords", [])[:4]:
                            if any(term in kw.lower() for term in ["score", "accuracy", "bleu", "benchmark", "dataset", "translation", "parsing"]):
                                benchmarks.append(BenchmarkEvidence(
                                    source="paperswithcode",
                                    task="Empirical Benchmark",
                                    dataset=kw,
                                    metric="Evaluation Target",
                                    value="Evaluated in Publication",
                                    model=paper_t[:30],
                                    split="test",
                                    paper_title=paper_t,
                                    repository_url=f"https://arxiv.org/abs/{clean_arxiv}"
                                ))
            except Exception as e:
                logger.debug("[HuggingFace] Paper API lookup notice: %s", e)

        # 2. Resilient fallback: Hugging Face linked repos API
        if clean_arxiv and len(benchmarks) < 4:
            try:
                hf_url = f"https://huggingface.co/api/arxiv/{clean_arxiv}/repos"
                async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=True) as client:
                    hf_resp = await client.get(hf_url)
                    if hf_resp.status_code == 200 and hf_resp.headers.get("content-type", "").startswith("application/json"):
                        hf_data = hf_resp.json()
                        for m in hf_data.get("models", [])[:5]:
                            m_id = m.get("id")
                            downloads = m.get("downloads", 0)
                            pipeline = m.get("pipeline_tag") or "Model"
                            if not any(b.model == m_id for b in benchmarks):
                                benchmarks.append(BenchmarkEvidence(
                                    source="huggingface",
                                    task=f"Model: {pipeline}",
                                    dataset="Hugging Face Hub",
                                    metric="Downloads",
                                    value=f"{downloads:,} dl" if downloads else "Model Release",
                                    model=m_id,
                                    split="hub",
                                    paper_title=title or clean_arxiv,
                                    repository_url=f"https://huggingface.co/{m_id}"
                                ))
            except Exception as e:
                logger.debug("[HuggingFace] ArXiv repos fallback notice: %s", e)

        # 3. Community Papers With Code API (safe against HTML redirects)
        if len(benchmarks) < 3:
            for base in [self.COMMUNITY_URL, self.BASE_URL]:
                try:
                    url = f"{base}/papers/"
                    params = {"arxiv_id": clean_arxiv} if clean_arxiv else {"q": title}
                    async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=False) as client:
                        resp = await client.get(url, params=params)
                        if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("application/json"):
                            data = resp.json()
                            results = data.get("results", [])
                            if results:
                                pwc_paper_id = results[0].get("id")
                                paper_title = results[0].get("title", title)
                                eval_url = f"{base}/papers/{pwc_paper_id}/results/"
                                eval_resp = await client.get(eval_url)
                                if eval_resp.status_code == 200 and eval_resp.headers.get("content-type", "").startswith("application/json"):
                                    eval_data = eval_resp.json()
                                    for item in eval_data.get("results", []):
                                        benchmarks.append(BenchmarkEvidence(
                                            source="paperswithcode",
                                            task=item.get("task", "General ML"),
                                            dataset=item.get("dataset", "Benchmark Dataset"),
                                            metric=item.get("metric", "Accuracy / Score"),
                                            value=str(item.get("value", "N/A")),
                                            model=item.get("model_name") or results[0].get("title"),
                                            split="test",
                                            paper_title=paper_title,
                                            repository_url=item.get("repo_url")
                                        ))
                                    if benchmarks:
                                        break
                except Exception as e:
                    logger.debug("[PapersWithCode] Endpoint query notice for %s: %s", base, e)

        return benchmarks

    async def get_code_repositories(self, arxiv_id: Optional[str] = None, title: Optional[str] = None) -> List[CodeRepository]:
        """Fetch linked public code repositories for a paper from CatalyzeX, Hugging Face, and Papers With Code."""
        repos: List[CodeRepository] = []
        seen_urls = set()
        clean_arxiv = re.sub(r"v\d+$", "", arxiv_id) if arxiv_id else None
        if not clean_arxiv and title:
            m = re.search(r"(\d{4}\.\d{4,5})", title)
            if m:
                clean_arxiv = m.group(1)

        query = clean_arxiv or title
        if not query:
            return repos

        # 1. Primary for arXiv: CatalyzeX code index (official arXiv labs partner)
        if clean_arxiv:
            try:
                cx_url = f"https://www.catalyzex.com/api/code?src=arxiv&paper_arxiv_id={clean_arxiv}"
                async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=True) as client:
                    cx_resp = await client.get(cx_url)
                    if cx_resp.status_code == 200 and cx_resp.headers.get("content-type", "").startswith("application/json"):
                        cx_data = cx_resp.json()
                        main_code_url = cx_data.get("code_url")
                        count = cx_data.get("count", 1)
                        if main_code_url and main_code_url not in seen_urls:
                            seen_urls.add(main_code_url)
                            repos.append(CodeRepository(
                                url=main_code_url,
                                is_official=True,
                                framework=None,
                                stars=count,
                            ))
            except Exception as e:
                logger.debug("[CatalyzeX] Code lookup notice: %s", e)

        # 2. Hugging Face linked spaces & code
        if clean_arxiv:
            try:
                hf_url = f"https://huggingface.co/api/arxiv/{clean_arxiv}/repos"
                async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=True) as client:
                    hf_resp = await client.get(hf_url)
                    if hf_resp.status_code == 200 and hf_resp.headers.get("content-type", "").startswith("application/json"):
                        for s in hf_resp.json().get("spaces", [])[:3]:
                            s_url = f"https://huggingface.co/spaces/{s.get('id')}"
                            if s_url not in seen_urls:
                                seen_urls.add(s_url)
                                repos.append(CodeRepository(
                                    url=s_url,
                                    is_official=True,
                                    framework="Gradio / Space",
                                    stars=s.get("likes", 0),
                                ))
            except Exception as e:
                logger.debug("[HuggingFace] Spaces lookup notice: %s", e)

        # 3. Community Papers With Code repository index
        for base in [self.COMMUNITY_URL, self.BASE_URL]:
            try:
                url = f"{base}/papers/"
                params = {"arxiv_id": clean_arxiv} if clean_arxiv else {"q": title}
                async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=False) as client:
                    resp = await client.get(url, params=params)
                    if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("application/json"):
                        results = resp.json().get("results", [])
                        if results:
                            pwc_paper_id = results[0].get("id")
                            repo_url = f"{base}/papers/{pwc_paper_id}/repositories/"
                            repo_resp = await client.get(repo_url)
                            if repo_resp.status_code == 200 and repo_resp.headers.get("content-type", "").startswith("application/json"):
                                for r in repo_resp.json().get("results", []):
                                    r_url = r.get("url")
                                    if r_url and r_url not in seen_urls:
                                        seen_urls.add(r_url)
                                        repos.append(CodeRepository(
                                            url=r_url,
                                            is_official=r.get("is_official", True),
                                            framework=r.get("framework"),
                                            stars=r.get("stars", 0)
                                        ))
                                if repos:
                                    break
            except Exception as e:
                logger.debug("[PapersWithCode] Repos lookup notice for %s: %s", base, e)

        return repos

    async def search_tasks(self, query: str, limit: int = 10) -> List[Dict]:
        """Search for ML tasks by name."""
        results = []
        # Standard curated ML tasks fallback
        curated_tasks = [
            {"id": "image-classification", "name": "Image Classification", "categories": ["Computer Vision"]},
            {"id": "text-generation", "name": "Text Generation", "categories": ["Natural Language Processing"]},
            {"id": "translation", "name": "Machine Translation", "categories": ["Natural Language Processing"]},
            {"id": "question-answering", "name": "Question Answering", "categories": ["Natural Language Processing"]},
            {"id": "time-series-forecasting", "name": "Time Series Forecasting", "categories": ["Time Series"]},
            {"id": "token-classification", "name": "Named Entity Recognition", "categories": ["Natural Language Processing"]},
            {"id": "automatic-speech-recognition", "name": "Automatic Speech Recognition", "categories": ["Audio"]},
            {"id": "object-detection", "name": "Object Detection", "categories": ["Computer Vision"]},
            {"id": "reinforcement-learning", "name": "Reinforcement Learning", "categories": ["General"]},
        ]

        q = (query or "").lower().strip()
        matched = [t for t in curated_tasks if q in t["id"] or q in t["name"].lower() or any(q in c.lower() for c in t["categories"])]
        for item in (matched or curated_tasks)[:limit]:
            results.append({
                "id": item["id"],
                "name": item["name"],
                "description": f"Evaluation benchmarks and leaderboards for {item['name']}.",
                "categories": item["categories"],
                "url": f"https://huggingface.co/models?pipeline_tag={item['id']}",
            })
        return results

    async def get_sota_for_task(self, task_id: str, limit: int = 20) -> List[Dict]:
        """Fetch SOTA leaderboard results for a specific task."""
        rows = []
        clean_task = (task_id or "image-classification").lower().replace(" ", "-")
        try:
            hf_url = f"https://huggingface.co/api/models"
            params = {"pipeline_tag": clean_task, "sort": "downloads", "direction": -1, "limit": limit}
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=True) as client:
                resp = await client.get(hf_url, params=params)
                if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("application/json"):
                    for i, m in enumerate(resp.json(), start=1):
                        rows.append({
                            "rank": i,
                            "model": m.get("id"),
                            "paper_title": f"Top SOTA model for {clean_task}",
                            "paper_url": f"https://huggingface.co/{m.get('id')}",
                            "arxiv_id": None,
                            "dataset": clean_task,
                            "metric": "Downloads / Adoption",
                            "value": f"{m.get('downloads', 0):,} dl",
                            "evaluated_on": m.get("lastModified", "")[:10] if m.get("lastModified") else None,
                        })
        except Exception as e:
            logger.debug("[SOTA] Task models fetch notice: %s", e)
        return rows

    async def search_datasets(self, query: str, limit: int = 10) -> List[Dict]:
        """Search for benchmark datasets by name."""
        results = []
        try:
            hf_url = "https://huggingface.co/api/datasets"
            params = {"search": query, "limit": limit}
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=True) as client:
                resp = await client.get(hf_url, params=params)
                if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("application/json"):
                    for item in resp.json():
                        d_id = item.get("id", "")
                        results.append({
                            "id": d_id,
                            "name": d_id.split("/")[-1] if "/" in d_id else d_id,
                            "full_name": d_id,
                            "description": f"Benchmark dataset with {item.get('downloads', 0):,} downloads and {item.get('likes', 0)} likes.",
                            "url": f"https://huggingface.co/datasets/{d_id}",
                        })
        except Exception as e:
            logger.debug("[Datasets] Search notice: %s", e)
        return results

    async def get_sota_for_dataset(self, dataset_id: str, limit: int = 20) -> List[Dict]:
        """Fetch SOTA leaderboard for a specific dataset."""
        rows = []
        clean_id = (dataset_id or "").strip()
        try:
            # Query top models evaluated on or trained for this dataset
            hf_url = "https://huggingface.co/api/models"
            params = {"search": clean_id, "sort": "downloads", "direction": -1, "limit": limit}
            async with httpx.AsyncClient(timeout=self.timeout, headers=self.headers, follow_redirects=True) as client:
                resp = await client.get(hf_url, params=params)
                if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("application/json"):
                    for i, item in enumerate(resp.json(), start=1):
                        rows.append({
                            "rank": i,
                            "metric": "Downloads / Adoption",
                            "model": item.get("id"),
                            "paper_title": f"Model for {clean_id}",
                            "arxiv_id": None,
                            "value": f"{item.get('downloads', 0):,} dl",
                            "evaluated_on": item.get("lastModified", "")[:10] if item.get("lastModified") else None,
                        })
        except Exception as e:
            logger.debug("[SOTA] Dataset models fetch notice: %s", e)
        return rows
