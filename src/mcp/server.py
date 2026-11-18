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
)


def create_mcp_server() -> MCPProtocolHandler:
    """Create and configure MCP protocol dispatcher with registered tools."""
    server = MCPProtocolHandler()

    # Register Domain 1 Tools
    server.register_tool(SEARCH_LITERATURE_METADATA, handle_search_literature)
    server.register_tool(RESOLVE_PAPER_METADATA, handle_resolve_paper)
    server.register_tool(GET_PAPER_CITATIONS_METADATA, handle_get_paper_citations)

    # Register Domain 2 Tools
    server.register_tool(READ_PAPER_FULL_METADATA, handle_read_paper_full)
    server.register_tool(SUMMARIZE_PAPER_METADATA, handle_summarize_paper)

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
