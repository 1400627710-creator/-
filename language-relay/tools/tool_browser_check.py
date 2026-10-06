"""Real Chromium QA for the tool mode UI; explicit synthetic host responses."""
import argparse
import json
import socket
import sys
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit

import httpx
import uvicorn
from playwright.sync_api import expect, sync_playwright

PROJECT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))
from app.config import Config  # noqa: E402
from app.main import create_app  # noqa: E402
from tests.fakes import full_reply, questions_reply  # noqa: E402


def main(output):
    output.mkdir(parents=True, exist_ok=True)
    checks, errors, external = [], [], []
    with tempfile.TemporaryDirectory(prefix="relay-tool-browser-") as folder:
        server = uvicorn.Server(uvicorn.Config(create_app(Config(data_dir=Path(folder), api_key="")), log_level="error"))
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            sock.listen()
            port = sock.getsockname()[1]
            base = f"http://127.0.0.1:{port}"
            thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
            thread.start()
            for _ in range(100):
                if server.started:
                    break
                time.sleep(.05)
            try:
                with httpx.Client(base_url=base, trust_env=False, timeout=12, headers={"X-Relay-Client": "local"}) as web:
                    with sync_playwright() as p:
                        browser = p.chromium.launch()
                        context = browser.new_context(permissions=["clipboard-read", "clipboard-write"])
                        page = context.new_page()
                        page.on("pageerror", lambda err: errors.append(str(err)))
                        page.on("request", lambda req: external.append(req.url) if urlsplit(req.url).hostname not in {"127.0.0.1", "localhost"} else None)
                        page.goto(base, wait_until="networkidle")
                        fcp = page.evaluate("performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint').startTime")
                        assert fcp <= 1000
                        page.click("#open-tools")
                        expect(page.locator("#tool-fields")).to_be_visible()
                        expect(page.locator("#api-fields")).not_to_be_visible()
                        expect(page.locator("#model-input")).not_to_be_visible()
                        checks.append("工具模式入口、中文说明和字段切换")
                        page.fill("#tool-tunnel-id", "invalid-id")
                        page.click("#save-settings")
                        expect(page.locator("#settings-error")).to_be_visible()
                        assert web.get("/api/settings").json()["provider"] == "api"
                        checks.append("错误 Tunnel ID 明确提示，不破坏已保存配置")
                        page.fill("#tool-tunnel-id", "")
                        page.click("#check-tools")
                        expect(page.locator("#tool-connection-result")).to_contain_text("均通过", timeout=15000)
                        expect(page.locator("#tool-step-call")).to_contain_text("尚未收到")
                        assert not web.get("/api/tools/status").json()["tool_call_observed"]
                        checks.append("网页一键真实协议自检，不误报 ChatGPT 已连接")
                        page.click("#copy-tool-config")
                        expect(page.locator("#toast")).to_contain_text("已复制本机 MCP")
                        config = json.loads(page.evaluate("navigator.clipboard.readText()"))
                        assert config["mcpServers"]["language-relay"]["args"][0].endswith("mcp_stdio.py")
                        assert "token" not in json.dumps(config)
                        checks.append("一键复制可用 stdio 配置，不含连接口令或模型密钥")
                        page.click("#copy-tool-error")
                        expect(page.locator("#toast")).to_contain_text("已复制工具报错")
                        report = json.loads(page.evaluate("navigator.clipboard.readText()"))
                        assert report["error_code"] == "tool_host_not_connected"
                        checks.append("未接通工具时一键复制准确错误码和安全报告")
                        page.click("#save-settings")
                        expect(page.locator("#settings-dialog")).not_to_be_visible()
                        assert web.get("/api/settings").json()["provider"] == "tool"
                        page.fill("#idea-input", "我想做卡牌游戏")
                        page.click("#send-message")
                        expect(page.locator("#tool-task-notice")).to_be_visible()
                        expect(page.locator("#output-state")).to_have_text("等待 ChatGPT 工具")
                        expect(page.locator(".history-input")).to_have_count(1)
                        page.reload(wait_until="networkidle")
                        expect(page.locator("#tool-task-notice")).to_be_visible()
                        expect(page.locator("#idea-input")).to_have_value("")
                        checks.append("没有模型 Key 仍可排队，刷新保留想法与等待状态")
                        page.click("#copy-tool-continuation")
                        expect(page.locator("#toast")).to_contain_text("接续指令")
                        assert "继续处理会话" in page.evaluate("navigator.clipboard.readText()")
                        task = web.get("/api/tools/tasks").json()[0]
                        token = web.post("/api/tools/access-token").json()["token"]
                        def submit(task, reply):
                            response = web.post("/api/tools/invoke", json={"operation": "submit", "arguments": {"task_id": task["task_id"], "reply": reply}},
                                                headers={"Authorization": "Bearer " + token})
                            assert response.status_code == 200, response.text
                            return response.json()
                        submit(task, questions_reply())
                        expect(page.locator("#markdown-output")).to_contain_text("## 3. 需要确认的问题", timeout=10000)
                        expect(page.locator("#tool-task-notice")).not_to_be_visible()
                        checks.append("工具问题结果自动同步到页面，只显示第3节")
                        page.click("#generate-defaults")
                        expect(page.locator("#tool-task-notice")).to_be_visible()
                        task = web.get("/api/tools/tasks").json()[0]
                        assert task["use_default_assumptions"]
                        saved = submit(task, full_reply())
                        expect(page.locator("#markdown-output")).to_contain_text("## 7. 自检", timeout=10000)
                        page.click("#copy-markdown")
                        expect(page.locator("#toast")).to_contain_text("已复制")
                        assert page.evaluate("navigator.clipboard.readText()") == saved["output_markdown"]
                        with page.expect_download() as download:
                            page.click("#export-markdown")
                        assert Path(download.value.path()).read_bytes() == saved["output_markdown"].encode()
                        checks.append("默认假设生成七节，复制与导出字节一致")
                        page.fill("#idea-input", "改为双人本机玩法")
                        page.click("#send-message")
                        expect(page.locator("#tool-task-notice")).to_be_visible()
                        page.click("#cancel-tool-task")
                        expect(page.locator("#tool-task-notice")).not_to_be_visible()
                        expect(page.locator(".history-input")).to_have_count(2)
                        checks.append("取消新工具任务保留原输入及已生成历史")
                        page.click("#open-tools")
                        page.fill("#tool-tunnel-id", "tunnel_browser_test")
                        page.click("#save-settings")
                        page.reload(wait_until="networkidle")
                        page.click("#open-tools")
                        expect(page.locator("#tool-tunnel-id")).to_have_value("tunnel_browser_test")
                        expect(page.locator("#tool-step-call")).to_contain_text("已收到")
                        checks.append("Tunnel ID 刷新持久化；实际调用记录与身份验证区分")
                        page.click("#copy-tool-error")
                        expect(page.locator("#toast")).to_contain_text("已复制工具报错")
                        assert token not in page.evaluate("navigator.clipboard.readText()")
                        context.grant_permissions([])
                        page.evaluate("Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true})")
                        with page.expect_download() as download:
                            page.click("#copy-tool-error")
                        copied = json.loads(Path(download.value.path()).read_text())
                        assert copied["privacy"]["credentials_exported"] is False
                        checks.append("剪贴板不可用时自动下载同一安全报告")
                        page.click("#close-settings")
                        page.screenshot(path=str(output / "tool-mode.png"), full_page=True)
                        version = browser.version
                        browser.close()
                        assert not errors and not external, (errors, external)
                        report = {"application": "language-relay", "version": "1.3.0", "checks": checks,
                                  "checks_passed": len(checks), "first_contentful_paint_ms": fcp,
                                  "browser": "Chromium " + version, "browser_errors": errors, "external_requests": external,
                                  "model_api_calls": 0, "upstream": "synthetic host replies", "user_chatgpt_plugin_verified": False}
                        (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
                        print(json.dumps(report, ensure_ascii=False, indent=2))
            finally:
                server.should_exit = True
                thread.join(8)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=PROJECT / "test-results" / "tool-browser")
    args = parser.parse_args()
    main(args.output.resolve())
