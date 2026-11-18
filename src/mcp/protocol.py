"""
JSON-RPC 2.0 & Model Context Protocol (MCP) Dispatcher.
Zero external dependencies, standard asyncio, fully compliant with MCP 2024-11-05.
"""
import inspect
import json
import traceback
from typing import Any, Callable, Coroutine, Dict, List, Optional
from src.core.logger import logger

MCP_PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {
    "name": "research-copilot-mcp",
    "version": "1.0.0",
}


class MCPProtocolHandler:
    """Dispatches incoming JSON-RPC 2.0 MCP requests to registered tools."""

    def __init__(self):
        self._tools: Dict[str, Dict[str, Any]] = {}
        self._handlers: Dict[str, Callable[[Dict[str, Any]], Coroutine[Any, Any, str]]] = {}

    def register_tool(
        self,
        metadata: Dict[str, Any],
        handler: Callable[[Dict[str, Any]], Coroutine[Any, Any, str]],
    ) -> None:
        """Register a tool with its MCP metadata and async execution function."""
        name = metadata["name"]
        self._tools[name] = metadata
        self._handlers[name] = handler
        logger.info("[MCP] Registered tool: '%s'", name)

    async def handle_raw_message(self, raw_line: str) -> Optional[str]:
        """Process a raw newline-delimited JSON-RPC string, returning response string or None."""
        line = raw_line.strip()
        if not line:
            return None

        try:
            req = json.loads(line)
        except Exception as e:
            return self._format_error(None, -32700, f"Parse error: {e}")

        if not isinstance(req, dict):
            return self._format_error(None, -32600, "Invalid Request: expected JSON object")

        msg_id = req.get("id")
        method = req.get("method")
        params = req.get("params", {})

        # Handle notifications (no id)
        if msg_id is None:
            if method == "notifications/initialized":
                logger.info("[MCP] Client initialized successfully.")
            return None

        # Route standard MCP JSON-RPC methods
        if method == "initialize":
            return self._handle_initialize(msg_id)
        elif method == "ping":
            return self._handle_ping(msg_id)
        elif method == "tools/list":
            return self._handle_tools_list(msg_id)
        elif method == "tools/call":
            return await self._handle_tools_call(msg_id, params)
        else:
            return self._format_error(msg_id, -32601, f"Method not found: '{method}'")

    def _handle_initialize(self, msg_id: Any) -> str:
        res = {
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "capabilities": {
                "tools": {},
            },
            "serverInfo": SERVER_INFO,
        }
        return self._format_result(msg_id, res)

    def _handle_ping(self, msg_id: Any) -> str:
        return self._format_result(msg_id, {})

    def _handle_tools_list(self, msg_id: Any) -> str:
        tools_list = []
        for name, meta in self._tools.items():
            tools_list.append({
                "name": name,
                "description": meta.get("description", ""),
                "inputSchema": meta.get("inputSchema", {"type": "object", "properties": {}}),
            })
        return self._format_result(msg_id, {"tools": tools_list})

    async def _handle_tools_call(self, msg_id: Any, params: Dict[str, Any]) -> str:
        tool_name = params.get("name")
        arguments = params.get("arguments", {})

        if not tool_name or tool_name not in self._handlers:
            return self._format_result(msg_id, {
                "isError": True,
                "content": [{"type": "text", "text": f"Error: Tool '{tool_name}' not found."}],
            })

        handler = self._handlers[tool_name]
        try:
            output = await handler(arguments)
            if not isinstance(output, str):
                output = json.dumps(output, default=str)
            return self._format_result(msg_id, {
                "content": [{"type": "text", "text": output}],
            })
        except Exception as e:
            logger.error("[MCP] Execution error in tool '%s': %s", tool_name, e, exc_info=True)
            return self._format_result(msg_id, {
                "isError": True,
                "content": [{"type": "text", "text": f"Error executing '{tool_name}': {str(e)}"}],
            })

    def _format_result(self, msg_id: Any, result: Any) -> str:
        return json.dumps({
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": result,
        })

    def _format_error(self, msg_id: Any, code: int, message: str) -> str:
        return json.dumps({
            "jsonrpc": "2.0",
            "id": msg_id,
            "error": {
                "code": code,
                "message": message,
            },
        })
