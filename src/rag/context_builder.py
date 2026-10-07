import re
from typing import Any, Dict, List, Optional
from src.providers.base import ChatMessage


class ContextBuilder:
    """Builds structured, grounded prompt context from retrieved paper chunks."""

    SYSTEM_TEMPLATE = """You are Research Copilot RAG Assistant, a precision scientific reasoning engineer.
You are assisting a researcher studying the paper: "{paper_title}".

STRICT GUIDELINES:
1. Answer the question using ONLY the retrieved paper sources below.
2. Do NOT invent, assume, or hallucinate facts not present in the sources.
3. If the answer is NOT present or cannot be determined from the provided sources, state clearly: "I couldn't find enough information about this in the paper."
4. Always cite the exact source and page for your statements using compact citation tags like [p.{page}] or [p.{page} · {section}].
5. Clearly distinguish between direct statements in the paper and reasonable analytical conclusions."""

    def build_context(
        self,
        question: str,
        retrieved_chunks: List[Dict[str, Any]],
        paper_title: Optional[str] = None,
    ) -> List[ChatMessage]:
        title = paper_title or "Research Paper"
        sys_msg = self.SYSTEM_TEMPLATE.format(paper_title=title, page="X", section="Section")

        if not retrieved_chunks:
            user_prompt = (
                f"Question: {question}\n\n"
                f"[No relevant context was found in the paper for this query.]"
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
            f"Retrieved Paper Evidence:\n"
            f"{formatted_sources}\n\n"
            f"Please provide an accurate, grounded answer with [p.X] citations."
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
