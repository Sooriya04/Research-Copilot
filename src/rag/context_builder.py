import re
from typing import Any, Dict, List, Optional
from src.providers.base import ChatMessage


class ContextBuilder:
    """Builds structured, grounded prompt context from retrieved paper chunks and external web sources."""

    SYSTEM_TEMPLATE = """You are Research Copilot RAG Assistant, a precision scientific reasoning engineer.
You are assisting a researcher studying the paper: "{paper_title}".

STRICT GUIDELINES:
1. Ground your answer in the provided paper sources and external web sources below.
2. For claims from the paper, cite the exact page/section using compact tags like [p.{page}] or [p.{page} · {section}].
3. For claims from external web sources, cite the web source using [Web: {domain}] or [Web Source {index}].
4. Clearly distinguish between what the original paper established versus what newer external research introduces. Never make external web information appear as if it came from the paper.
5. If reliable evidence is absent from both the paper and external web results, state clearly: "I couldn't find enough information about this in the paper or external sources."
6. Do NOT invent, assume, or hallucinate facts or citations."""

    def build_context(
        self,
        question: str,
        retrieved_chunks: List[Dict[str, Any]],
        paper_title: Optional[str] = None,
        graph_evidence: Optional[Dict[str, Any]] = None,
        web_sources: Optional[List[Any]] = None,
    ) -> List[ChatMessage]:
        title = paper_title or "Research Paper"
        sys_msg = self.SYSTEM_TEMPLATE.format(paper_title=title, page="X", section="Section", domain="domain", index="N")

        # 1. Knowledge Graph Evidence Section
        graph_section = ""
        if graph_evidence and graph_evidence.get("relationships"):
            rel_lines = ["--- KNOWLEDGE GRAPH EVIDENCE ---"]
            for r in graph_evidence["relationships"][:8]:
                src = r.get("source_name") or r.get("source")
                tgt = r.get("target_name") or r.get("target")
                rel = r.get("label") or r.get("relationship")
                page = r.get("page", 1)
                c_id = r.get("source_chunk_id", "")
                chunk_str = f", chunk {c_id}" if c_id else ""
                rel_lines.append(f"• {src} --[{rel}]--> {tgt} [p.{page}{chunk_str}]")
            graph_section = "\n".join(rel_lines) + "\n\n"

        # 2. External Web Research Section
        web_section = ""
        if web_sources:
            web_blocks = ["--- EXTERNAL WEB RESEARCH (From Searqon) ---"]
            for idx, ws in enumerate(web_sources, 1):
                title_ws = getattr(ws, "title", None) or (ws.get("title") if isinstance(ws, dict) else "Web Source")
                url_ws = getattr(ws, "url", None) or (ws.get("url") if isinstance(ws, dict) else "")
                domain_ws = getattr(ws, "domain", None) or (ws.get("domain") if isinstance(ws, dict) else "")
                snippet_ws = getattr(ws, "snippet", None) or (ws.get("snippet") if isinstance(ws, dict) else "")
                pub_ws = getattr(ws, "published_at", None) or (ws.get("published_at") if isinstance(ws, dict) else "")
                pub_str = f" · Published: {pub_ws}" if pub_ws else ""
                web_blocks.append(
                    f"WEB SOURCE {idx}: [{title_ws}] ({domain_ws}{pub_str})\n"
                    f"URL: {url_ws}\n"
                    f"Snippet: {snippet_ws}\n"
                )
            web_section = "\n".join(web_blocks) + "\n\n"

        if not retrieved_chunks and not graph_section and not web_section:
            user_prompt = (
                f"Question: {question}\n\n"
                f"[No relevant context was found in the paper or external web research for this query.]"
            )
            return [
                ChatMessage(role="system", content=sys_msg),
                ChatMessage(role="user", content=user_prompt),
            ]

        context_blocks = []
        for i, c in enumerate(retrieved_chunks, 1):
            block = (
                f"--- SOURCE {i} ---\n"
                f"Page: {c.get('page_number')}\n"
                f"Section: {c.get('section', 'General')}\n"
                f"Chunk ID: {c.get('chunk_id')}\n"
                f"Content:\n{c.get('content')}\n"
            )
            context_blocks.append(block)

        formatted_sources = "\n".join(context_blocks)
        user_prompt = (
            f"Question: {question}\n\n"
            f"{graph_section}"
            f"{web_section}"
            f"Retrieved Paper Evidence:\n"
            f"{formatted_sources}\n\n"
            f"Please provide an accurate, grounded answer distinguishing paper findings [p.X] from external web findings [Web: domain]."
        )

        return [
            ChatMessage(role="system", content=sys_msg),
            ChatMessage(role="user", content=user_prompt),
        ]

    def extract_structured_citations(
        self,
        llm_response: str,
        retrieved_chunks: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Map text citations in the response back to exact verified retrieved chunks."""
        cited_pages = set()
        # Find [p.X], [p. X], [Page X], [page X]
        page_matches = re.findall(r"\[p\.?\s*(\d+)|\bpage\s*(\d+)", llm_response, re.IGNORECASE)
        for m in page_matches:
            p_str = m[0] or m[1]
            if p_str:
                try:
                    cited_pages.add(int(p_str))
                except ValueError:
                    pass

        structured_citations: List[Dict[str, Any]] = []
        seen_chunks = set()

        # 1. Match chunks that correspond to explicitly cited pages
        for c in retrieved_chunks:
            c_page = c.get("page_number")
            c_id = c.get("chunk_id")
            if c_page in cited_pages and c_id not in seen_chunks:
                seen_chunks.add(c_id)
                structured_citations.append({
                    "chunk_id": c_id,
                    "page": c_page,
                    "section": c.get("section", "General"),
                    "score": c.get("score", 0.0),
                    "excerpt": c.get("content", "")[:200],
                })

        # 2. If no explicit [p.X] citations were picked up but we have high-relevance chunks, include top chunks
        if not structured_citations and retrieved_chunks:
            for c in retrieved_chunks[:3]:
                c_id = c.get("chunk_id")
                if c_id not in seen_chunks:
                    seen_chunks.add(c_id)
                    structured_citations.append({
                        "chunk_id": c_id,
                        "page": c.get("page_number"),
                        "section": c.get("section", "General"),
                        "score": c.get("score", 0.0),
                        "excerpt": c.get("content", "")[:200],
                    })

        return structured_citations

    def extract_structured_web_citations(
        self,
        llm_response: str,
        web_sources: List[Any],
    ) -> List[Dict[str, Any]]:
        """Identify referenced web sources from the LLM answer and map to structured web citations."""
        if not web_sources:
            return []

        normalized = []
        for ws in web_sources:
            if hasattr(ws, "__dict__") and not isinstance(ws, dict):
                normalized.append({
                    "title": ws.title,
                    "url": ws.url,
                    "domain": ws.domain,
                    "source": ws.source,
                    "snippet": ws.snippet,
                    "published_at": ws.published_at,
                })
            elif isinstance(ws, dict):
                normalized.append(dict(ws))

        referenced = []
        resp_lower = llm_response.lower()

        for ws in normalized:
            domain = (ws.get("domain") or "").lower()
            title = (ws.get("title") or "").lower()
            if domain and (domain in resp_lower or any(part in resp_lower for part in domain.split(".") if len(part) > 4)):
                referenced.append(ws)
            elif title and len(title) > 6 and title[:20] in resp_lower:
                referenced.append(ws)

        # If LLM referenced web or recent work generally, include top sources
        if not referenced and any(marker in resp_lower for marker in ["[web", "web source", "recent", "subsequent", "newer", "arxiv"]):
            referenced = normalized[:3]
        elif not referenced and normalized:
            referenced = normalized[:2]

        return referenced
