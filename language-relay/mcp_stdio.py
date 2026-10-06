"""Official MCP stdio adapter to the already running local relay."""
import argparse
import json
from urllib.parse import urlparse

import httpx

from app.config import Config
from app.errors import RelayError
from app.mcp_tools import make_mcp_server
from app.services.tool_access import ToolAccess


def local_url(value):
    try:
        parsed = urlparse(value)
        if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"} or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"} or not parsed.port:
            raise ValueError
        return value.rstrip("/")
    except (ValueError, TypeError, AttributeError):
        raise RelayError("tool_server_unreachable", "stdio客户端只能连接本机HTTP地址，请使用运行中继器显示的地址。", 503) from None


def discover(config):
    try:
        record = json.loads((config.data_dir / "active-server.json").read_text(encoding="utf-8"))
        port = record["port"]
        if type(port) is not int or not 1 <= port <= 65535:
            raise ValueError
        return f"http://127.0.0.1:{port}"
    except (OSError, ValueError, KeyError, TypeError):
        raise RelayError("tool_server_unreachable", "尚未找到运行中的中继器，请先双击启动中继器.bat。", 503) from None


def make_proxy(config, url=None):
    access = ToolAccess(config)

    async def invoke(operation, arguments):
        target = local_url(url or discover(config))
        try:
            async with httpx.AsyncClient(trust_env=False, timeout=10, follow_redirects=False) as client:
                response = await client.post(target + "/api/tools/invoke", json={"operation": operation, "arguments": arguments},
                                             headers={"X-Relay-Client": "local", "X-Relay-Tool-Transport": "stdio", "Authorization": "Bearer " + access.token()})
                data = response.json()
            if response.status_code >= 400:
                detail = data.get("detail", {})
                # Forward only application-produced safe errors, never a raw body.
                code = detail.get("code") if isinstance(detail, dict) else None
                from diagnose import LOCAL_CODES
                recognized = code in LOCAL_CODES
                if not recognized:
                    code = "tool_server_unreachable"
                failure = RelayError(code, detail.get("message", "本机工具请求失败。") if recognized else "本机工具请求失败。", response.status_code,
                                     retryable=detail.get("retryable") is True if recognized else False)
                if code == "tool_result_invalid":
                    from app.services.planning_service import ISSUE_HINTS
                    issues = detail.get("issues", [])
                    failure.tool_issues = [i for i in issues if isinstance(i, str) and (i in ISSUE_HINTS or i == "reply_schema")] if isinstance(issues, list) else ["reply_schema"]
                    retries = detail.get("remaining_retries")
                    failure.remaining_retries = retries if type(retries) is int and 0 <= retries <= 2 else 0
                raise failure
            if not isinstance(data, dict):
                raise ValueError
            return data
        except RelayError:
            raise
        except (httpx.HTTPError, ValueError):
            raise RelayError("tool_server_unreachable", "无法连接本机中继器。请启动服务后重试，或复制工具自检报告。", 503) from None
    return make_mcp_server(invoke)


def main():
    parser = argparse.ArgumentParser(description="中继器 MCP stdio 工具；无需模型 API Key。")
    parser.add_argument("--url", help="可选的本机中继器HTTP地址；默认自动发现启动器的实际端口。")
    args = parser.parse_args()
    if args.url:
        local_url(args.url)
    make_proxy(Config.from_env(), args.url).run("stdio")


if __name__ == "__main__":
    main()
