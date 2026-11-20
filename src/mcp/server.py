"""
Model Context Protocol (MCP) Standard I/O Server.
Listens on sys.stdin for JSON-RPC 2.0 requests, dispatches to registered tools,
and writes newline-delimited responses to sys.stdout.
"""
import asyncio
import sys
from src.core.logger import logger
from src.mcp.protocol import MCPProtocolHandler
from src.mcp.tools.literature import (
    SEARCH_LITERATURE_METADATA,
    handle_search_literature,
    RESOLVE_PAPER_METADATA,
    handle_resolve_paper,
    GET_PAPER_CITATIONS_METADATA,
    handle_get_paper_citations,
)
from src.mcp.tools.paper_reader import (
    READ_PAPER_FULL_METADATA,
    handle_read_paper_full,
    SUMMARIZE_PAPER_METADATA,
    handle_summarize_paper,
    EXTRACT_PAPER_ASSETS_METADATA,
    handle_extract_paper_assets,
    VERIFY_PAPER_CLAIM_METADATA,
    handle_verify_paper_claim,
    PAPER_GROUNDED_QA_METADATA,
    handle_paper_grounded_qa,
)
from src.mcp.tools.code_benchmarks import (
    GET_PAPER_CODE_REPOSITORIES_METADATA,
    handle_get_paper_code_repositories,
)
from src.mcp.tools.novelty_studio import (
    EXTRACT_RESEARCH_GAPS_METADATA,
    handle_extract_research_gaps,
    GENERATE_NOVEL_HYPOTHESES_METADATA,
    handle_generate_novel_hypotheses,
    SYNTHESIZE_CRITIQUE_METADATA,
    handle_synthesize_critique,
)
from src.mcp.tools.knowledge_graph import (
    QUERY_KNOWLEDGE_GRAPH_METADATA,
    handle_query_knowledge_graph,
    COMPARE_PAPERS_MATRIX_METADATA,
    handle_compare_papers_matrix,
)
from src.mcp.tools.reproduction import (
    GENERATE_REPRODUCTION_PLAN_METADATA,
    handle_generate_reproduction_plan,
    AUDIT_REPRODUCIBILITY_METADATA,
    handle_audit_reproducibility,
)



def create_mcp_server() -> MCPProtocolHandler:
    """Create and configure MCP protocol dispatcher with registered tools."""
    server = MCPProtocolHandler()

    # Register Domain 1 Tools: Literature Discovery
    server.register_tool(SEARCH_LITERATURE_METADATA, handle_search_literature)
    server.register_tool(RESOLVE_PAPER_METADATA, handle_resolve_paper)
    server.register_tool(GET_PAPER_CITATIONS_METADATA, handle_get_paper_citations)

    # Register Domain 2 Tools: Paper Intelligence & Evidence
    server.register_tool(READ_PAPER_FULL_METADATA, handle_read_paper_full)
    server.register_tool(SUMMARIZE_PAPER_METADATA, handle_summarize_paper)
    server.register_tool(EXTRACT_PAPER_ASSETS_METADATA, handle_extract_paper_assets)
    server.register_tool(VERIFY_PAPER_CLAIM_METADATA, handle_verify_paper_claim)
    server.register_tool(PAPER_GROUNDED_QA_METADATA, handle_paper_grounded_qa)

    # Register Domain 3 Tools: Code & Benchmarks
    server.register_tool(GET_PAPER_CODE_REPOSITORIES_METADATA, handle_get_paper_code_repositories)

    # Register Domain 4 Tools: Gap Analysis & Novelty Studio
    server.register_tool(EXTRACT_RESEARCH_GAPS_METADATA, handle_extract_research_gaps)
    server.register_tool(GENERATE_NOVEL_HYPOTHESES_METADATA, handle_generate_novel_hypotheses)
    server.register_tool(SYNTHESIZE_CRITIQUE_METADATA, handle_synthesize_critique)

    # Register Domain 5 Tools: Reproduction & Experiment Planning
    server.register_tool(GENERATE_REPRODUCTION_PLAN_METADATA, handle_generate_reproduction_plan)
    server.register_tool(AUDIT_REPRODUCIBILITY_METADATA, handle_audit_reproducibility)

    # Register Domain 6 Tools: Knowledge Graph & Synthesis
    server.register_tool(QUERY_KNOWLEDGE_GRAPH_METADATA, handle_query_knowledge_graph)
    server.register_tool(COMPARE_PAPERS_MATRIX_METADATA, handle_compare_papers_matrix)

    return server


async def run_stdio_server() -> None:
    """Run MCP server over standard I/O."""
    server = create_mcp_server()
    logger.info("[MCP Server] Initialized and listening on stdio...")

    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    while True:
        try:
            line_bytes = await reader.readline()
            if not line_bytes:
                break
            line_str = line_bytes.decode("utf-8", errors="ignore")
            response = await server.handle_raw_message(line_str)
            if response is not None:
                sys.stdout.write(response + "\n")
                sys.stdout.flush()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("[MCP Server] Unexpected loop error: %s", e, exc_info=True)


if __name__ == "__main__":
    try:
        asyncio.run(run_stdio_server())
    except (KeyboardInterrupt, SystemExit):
        pass
