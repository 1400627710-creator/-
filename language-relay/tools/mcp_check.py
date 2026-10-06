"""Real SDK/HTTP/stdio integration acceptance without model API calls.

Default payloads are explicit synthetic fixtures. --reply-file may provide a
host-written structured reply. Neither proves a user's ChatGPT plugin is installed.
"""
import argparse
import asyncio
import json
import os
import socket
import sys
import tempfile
import threading
import time
from pathlib import Path

import httpx
import httpx2
import uvicorn
from mcp import Client, StdioServerParameters
from mcp.client.streamable_http import streamable_http_client

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))

from app.config import Config  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services.tool_access import ToolAccess  # noqa: E402
from tests.fakes import full_reply, questions_reply  # noqa: E402
from tool_check import EXPECTED_TOOLS  # noqa: E402


def main(reply_file=None, output=None):
    payload = json.loads(Path(reply_file).read_text(encoding="utf-8")) if reply_file else full_reply()
    checks = []
    with tempfile.TemporaryDirectory(prefix="relay-tool-") as folder:
        config = Config(data_dir=Path(folder), api_key="")
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        sock.listen()
        port = sock.getsockname()[1]
        url = f"http://127.0.0.1:{port}"
        server = uvicorn.Server(uvicorn.Config(create_app(config), log_level="error"))
        thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
        thread.start()
        for _ in range(100):
            if server.started:
                break
            time.sleep(.05)
        if not server.started:
            raise RuntimeError("Local acceptance server failed to start")
        try:
            with httpx.Client(base_url=url, trust_env=False, headers={"X-Relay-Client": "local"}, timeout=12) as web:
                result = web.post("/api/tools/check").json()
                assert result["ok"], result
                assert not web.get("/api/tools/status").json()["tool_call_observed"]
                checks.append("真实 MCP 协议自检通过且不伪造宿主调用")
                assert web.post("/mcp", json={}).status_code == 401
                checks.append("HTTP MCP 未带口令拒绝访问")
            token = ToolAccess(config).token()

            async def workflow():
                async with httpx2.AsyncClient(headers={"Authorization": "Bearer " + token}, trust_env=False) as http:
                    async with Client(streamable_http_client(url + "/mcp", http_client=http)) as host:
                        catalog = (await host.list_tools()).tools
                        assert {tool.name for tool in catalog} == EXPECTED_TOOLS
                        assert all(tool.output_schema for tool in catalog)
                        checks.append("官方 SDK 发现 9 个工具和输入输出结构")
                        first = (await host.call_tool("relay_start", {"request_key": "live-card-001", "idea": "我想做卡牌游戏"})).structured_content
                        assert first["queued_for_tool"]
                        context = (await host.call_tool("relay_context", {"task_id": first["task_id"]})).structured_content
                        assert context["response_schema"]["$defs"]["Report"]
                        assert not context["trusted_mode"]["use_default_assumptions"]
                        saved = (await host.call_tool("relay_submit", {"task_id": first["task_id"], "reply": questions_reply()})).structured_content
                        assert saved["need_more_info"] and saved["output_markdown"].startswith("## 3. ")
                        assert sum(line.startswith("## ") for line in saved["output_markdown"].splitlines()) == 1
                        checks.append("真实 HTTP 工具完成初始想法→仅第3节问题")
                        task = (await host.call_tool("relay_start", {"request_key": "live-card-002", "session_id": first["session_id"], "idea": "使用默认假设，我需要结果"})).structured_content
                        ctx = (await host.call_tool("relay_context", {"task_id": task["task_id"]})).structured_content
                        assert ctx["trusted_mode"]["use_default_assumptions"]
                        wrong = await host.call_tool("relay_submit", {"task_id": task["task_id"], "reply": questions_reply()})
                        assert wrong.is_error
                        assert "tool_result_invalid" in wrong.content[0].text
                        checks.append("默认假设禁止只问问题，返回安全校验码与修正预算")
                        completed = (await host.call_tool("relay_submit", {"task_id": task["task_id"], "reply": payload})).structured_content
                        assert completed["ok"], completed
                        assert sum(line.startswith("## ") for line in completed["output_markdown"].splitlines()) == 7
                        assert "**假设**" in completed["output_markdown"]
                        repeated = (await host.call_tool("relay_submit", {"task_id": task["task_id"], "reply": payload})).structured_content
                        assert repeated["message_id"] == completed["message_id"]
                        checks.append("七节、假设、规划校验通过；重复提交不重复保存")
                env = {**os.environ, "RELAY_DATA_DIR": str(config.data_dir), "PYTHONUTF8": "1"}
                parameters = StdioServerParameters(command=sys.executable, args=[str(PROJECT / "mcp_stdio.py"), "--url", url], env=env, cwd=str(PROJECT))
                async with Client(parameters) as stdio:
                    assert {t.name for t in (await stdio.list_tools()).tools} == EXPECTED_TOOLS
                    restored = (await stdio.call_tool("relay_result", {"task_id": task["task_id"]})).structured_content
                    assert restored["output_markdown"] == completed["output_markdown"]
                    diagnostic = (await stdio.call_tool("relay_diagnostics")).structured_content
                    assert token not in json.dumps(diagnostic) and "我想做卡牌游戏" not in json.dumps(diagnostic)
                    checks.append("真实 stdio 子进程读取同一结果与脱敏报告")
                return task, completed
            task, completed = asyncio.run(workflow())
            with httpx.Client(base_url=url, trust_env=False) as web:
                assert web.get(f"/api/sessions/{task['session_id']}/export").content == completed["output_markdown"].encode()
                assert web.get("/api/tools/status").json()["tool_call_observed"]
                checks.append("网页会话可读取工具结果，导出与原始 Markdown 完全一致")
            report = {"application": "language-relay", "version": "1.3.0", "checks": checks,
                      "checks_passed": len(checks), "python_version": sys.version.split()[0],
                      "payload_source": "provided_host_reply" if reply_file else "synthetic_fixture",
                      "model_api_calls": 0, "user_chatgpt_plugin_verified": False}
            if output:
                Path(output).parent.mkdir(parents=True, exist_ok=True)
                Path(output).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            print(json.dumps(report, ensure_ascii=False, indent=2))
        finally:
            server.should_exit = True
            thread.join(timeout=8)
            sock.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="真实本机 MCP HTTP/stdio 集成验收；不调用模型 API。")
    parser.add_argument("--reply-file")
    parser.add_argument("--output")
    args = parser.parse_args()
    main(args.reply_file, args.output)
