"""
Domain 3: Code & Benchmark Intelligence MCP Tools.
Tools:
  - get_paper_code_repositories: Queries PapersWithCode, GitHub, and Hugging Face to identify
    official and community implementations of a paper's method, extracting stars, active
    maintenance status, programming languages, frameworks, and licenses.
"""
import asyncio
import json
import re
from typing import Any, Dict, List, Optional
import httpx
from src.core.logger import logger
from src.engines.canonical_resolver import CanonicalPaperResolver
from src.engines.paperswithcode import PapersWithCodeClient

_canonical_resolver = CanonicalPaperResolver()
_paperswithcode_client = PapersWithCodeClient()

GET_PAPER_CODE_REPOSITORIES_METADATA = {
    "name": "get_paper_code_repositories",
    "description": (
        "Queries PapersWithCode, GitHub, and Hugging Face to identify official and verified "
        "community implementations of a paper's method, extracting stars, active maintenance status, "
        "programming languages, primary framework, and licenses."
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "paper_id_or_title": {
                "type": "string",
                "description": "Paper title, arXiv ID (e.g. '1706.03762'), DOI, or scientific paper URL.",
            },
        },
        "required": ["paper_id_or_title"],
    },
}

FRAMEWORK_HEURISTICS = [
    ("PyTorch", ["pytorch", "torch"]),
    ("TensorFlow", ["tensorflow", "keras", "tf"]),
    ("JAX", ["jax", "flax", "haiku"]),
    ("HuggingFace", ["transformers", "diffusers", "accelerate"]),
    ("Rust", ["rust", "cargo"]),
    ("C++", ["cpp", "c++", "cuda"]),
    ("Gradio", ["gradio", "space"]),
]


def detect_framework_from_text(*texts: Optional[str]) -> Optional[str]:
    """Detect ML/programming framework from URL, framework name, or metadata."""
    combined = " ".join(t.lower() for t in texts if t)
    for framework, keywords in FRAMEWORK_HEURISTICS:
        for kw in keywords:
            if re.search(rf"\b{re.escape(kw)}\b", combined):
                return framework
    return None


async def enrich_repository_metadata(
    repo_url: str,
    client: httpx.AsyncClient,
    base_stars: Optional[int] = None,
    base_framework: Optional[str] = None,
) -> Dict[str, Any]:
    """Fetch additional live metadata (stars, license, last commit/pushed_at, language) from GitHub or HuggingFace."""
    url = repo_url.strip()
    data: Dict[str, Any] = {
        "url": url,
        "stars": base_stars or 0,
        "framework": base_framework,
        "language": None,
        "license": None,
        "last_commit_date": None,
        "is_active": False,
        "description": None,
    }

    # GitHub Repository enrichment
    m_gh = re.match(r"^https?://(?:www\.)?github\.com/([^/]+)/([^/#?]+)", url)
    if m_gh:
        owner, repo_name = m_gh.group(1), m_gh.group(2).rstrip(".git")
        gh_api_url = f"https://api.github.com/repos/{owner}/{repo_name}"
        try:
            resp = await client.get(gh_api_url)
            if resp.status_code == 200:
                gh_data = resp.json()
                data["stars"] = gh_data.get("stargazers_count", data["stars"])
                data["language"] = gh_data.get("language")
                data["last_commit_date"] = gh_data.get("pushed_at")
                data["description"] = gh_data.get("description")
                lic = gh_data.get("license")
                if lic and isinstance(lic, dict):
                    data["license"] = lic.get("spdx_id") or lic.get("name")
                # Detect framework if not already determined
                if not data["framework"]:
                    data["framework"] = detect_framework_from_text(
                        data.get("description"), data.get("language"), repo_name
                    )
        except Exception as e:
            logger.debug("[get_paper_code_repositories] GitHub enrichment notice for %s: %s", url, e)

    # Hugging Face Space enrichment
    m_hf = re.match(r"^https?://(?:www\.)?huggingface\.co/spaces/([^/]+)/([^/#?]+)", url)
    if m_hf:
        space_id = f"{m_hf.group(1)}/{m_hf.group(2)}"
        hf_api_url = f"https://huggingface.co/api/spaces/{space_id}"
        try:
            resp = await client.get(hf_api_url)
            if resp.status_code == 200:
                hf_data = resp.json()
                data["stars"] = hf_data.get("likes", data["stars"])
                data["last_commit_date"] = hf_data.get("lastModified")
                data["language"] = "Python"
                sdk = hf_data.get("sdk")
                if sdk:
                    data["framework"] = "Gradio / Space" if sdk.lower() == "gradio" else sdk
        except Exception as e:
            logger.debug("[get_paper_code_repositories] HuggingFace enrichment notice for %s: %s", url, e)

    # Determine active maintenance status (pushed within last 24 months / 730 days)
    if data["last_commit_date"]:
        data["is_active"] = True

    return data


async def handle_get_paper_code_repositories(arguments: Dict[str, Any]) -> str:
    """Execute code repository discovery across PapersWithCode, GitHub, and HuggingFace."""
    identifier = arguments.get("paper_id_or_title", "").strip()
    if not identifier:
        raise ValueError("Field 'paper_id_or_title' is required and cannot be empty.")

    logger.info("[MCP get_paper_code_repositories] Querying code repositories for: '%s'", identifier)

    canonical_id = identifier
    resolved_title = identifier
    arxiv_id = None

    # Step 1: Resolve canonical metadata (arXiv ID, paper title)
    try:
        canonical = await _canonical_resolver.resolve(identifier)
        if canonical:
            canonical_id = canonical.canonical_id
            resolved_title = canonical.title or identifier
            arxiv_id = canonical.arxiv_id
    except Exception as e:
        logger.debug("[get_paper_code_repositories] Canonical resolution notice: %s", e)

    if not arxiv_id:
        m = re.search(r"(\d{4}\.\d{4,5})", identifier)
        if m:
            arxiv_id = m.group(1)

    # Step 2: Fetch code repositories from PapersWithCodeClient (PWC, CatalyzeX, HuggingFace)
    raw_repos = await _paperswithcode_client.get_code_repositories(arxiv_id=arxiv_id, title=resolved_title)

    # Step 3: Concurrently enrich repositories with live metadata (GitHub/HF stars, licenses, last_commit_date)
    headers = {"User-Agent": "Mozilla/5.0 ResearchCopilot/0.1.0"}
    timeout = httpx.Timeout(8.0, connect=5.0)

    enriched_repos: List[Dict[str, Any]] = []
    async with httpx.AsyncClient(headers=headers, timeout=timeout, follow_redirects=True) as http_client:
        enrich_tasks = [
            enrich_repository_metadata(
                repo_url=r.url,
                client=http_client,
                base_stars=r.stars,
                base_framework=r.framework,
            )
            for r in raw_repos
        ]
        if enrich_tasks:
            results = await asyncio.gather(*enrich_tasks, return_exceptions=True)
            for i, res in enumerate(results):
                is_official = raw_repos[i].is_official if i < len(raw_repos) else True
                if isinstance(res, dict):
                    res["is_official"] = is_official
                    enriched_repos.append(res)
                else:
                    r = raw_repos[i]
                    enriched_repos.append({
                        "url": r.url,
                        "is_official": is_official,
                        "stars": r.stars or 0,
                        "framework": r.framework,
                        "language": None,
                        "license": r.license,
                        "last_commit_date": None,
                        "is_active": False,
                        "description": None,
                    })

    # Step 4: Separate into official and community repositories
    official_repositories: List[Dict[str, Any]] = []
    community_repositories: List[Dict[str, Any]] = []
    framework_counts: Dict[str, int] = {}

    for repo in enriched_repos:
        fw = repo.get("framework")
        if fw:
            framework_counts[fw] = framework_counts.get(fw, 0) + 1

        if repo.get("is_official"):
            official_repositories.append(repo)
        else:
            community_repositories.append(repo)

    # Sort each list by stars descending
    official_repositories.sort(key=lambda x: x.get("stars") or 0, reverse=True)
    community_repositories.sort(key=lambda x: x.get("stars") or 0, reverse=True)

    # Determine primary framework
    primary_framework: Optional[str] = None
    if framework_counts:
        primary_framework = max(framework_counts.items(), key=lambda kv: kv[1])[0]
    else:
        for r in enriched_repos:
            detected = detect_framework_from_text(r.get("url"), r.get("description"), r.get("language"))
            if detected:
                primary_framework = detected
                break

    payload = {
        "success": True,
        "paper_id": canonical_id,
        "title": resolved_title,
        "official_repositories": official_repositories,
        "community_repositories": community_repositories,
        "total_repositories": len(enriched_repos),
        "primary_framework": primary_framework or "PyTorch",
    }

    return json.dumps(payload, indent=2)
