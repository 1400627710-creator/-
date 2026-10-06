"""Real local MCP initialization/discovery check; never invokes a tool/model."""
import argparse
import asyncio
import json

import httpx2
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

from app.config import Config
from app.errors import RelayError
from app.services.tool_access import ToolAccess
from mcp_stdio import discover, local_url

EXPECTED_TOOLS = {"relay_status", "relay_sessions", "relay_start", "relay_next_task", "relay_context",
                  "relay_submit", "relay_result", "relay_cancel", "relay_diagnostics"}


async def check(config, url=None):
    result = {"ok": False, "code": "tool_server_unreachable", "stage": "tool_connection",
              "message": "无法初始化本机 MCP。请保持启动窗口运行，再复制工具报错。",
              "model_inference_performed": False, "external_host_verified": False}
    try:
        target = local_url(url or discover(config))
        token = ToolAccess(config).token()
        async with asyncio.timeout(8):
            async with httpx2.AsyncClient(trust_env=False, follow_redirects=False, timeout=6,
                                          headers={"Authorization": "Bearer " + token}) as http:
                # Initialize and discover only. Internal self-check must not mark
                # a host tool call as observed or read any private conversation.
                async with Client(streamable_http_client(target + "/mcp", http_client=http)) as client:
                    tools = (await client.list_tools()).tools
                    names = {tool.name for tool in tools}
                    if names != EXPECTED_TOOLS or any(not tool.input_schema for tool in tools):
                        result.update(code="tool_protocol_mismatch", message="MCP 工具目录或结构定义不匹配，请更新完整安装包。")
                    else:
                        result.update(ok=True, code=None, message="本机 MCP 初始化、协议协商和 9 个工具的发现均通过。",
                                      tools_count=len(tools), protocol_version=str(client.protocol_version))
    except RelayError as error:
        result.update(code=error.code, message=error.message)
    except Exception:
        # Transport exception messages can contain headers/URLs. Never export.
        pass
    return result


def main():
    parser = argparse.ArgumentParser(description="中继器 MCP 一键协议自检；不调用模型。")
    parser.add_argument("--url", help="本机中继器地址；默认发现启动器端口。")
    args = parser.parse_args()
    print(json.dumps(asyncio.run(check(Config.from_env(), args.url)), ensure_ascii=False))


if __name__ == "__main__":
    main()
