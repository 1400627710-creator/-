"""Run a real browser against a temporary app with a fake GPT transport.

No API key or OpenAI request is used. Optional screenshots/report are written to
--output. The fake transport is available only in this test process.
"""

import argparse
import asyncio
import json
import socket
import sys
import tempfile
import time
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, urlencode, urlsplit

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import httpx2  # noqa: E402
import uvicorn  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from openai import AuthenticationError, PermissionDeniedError  # noqa: E402
from playwright.sync_api import expect, sync_playwright  # noqa: E402

from app.config import Config  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services.chatgpt_auth import SCOPES, TOKEN  # noqa: E402
from tests.fakes import full_reply, questions_reply  # noqa: E402
from tests.test_diagnostics import DeniedServer, assert_private  # noqa: E402


class BrowserTransport:
    def __init__(self):
        self.calls = 0
        self.internal_failure_seen = False
        self.planning_failures_remaining = 2
        self.plan_probe_error = None

    async def request(self, **kwargs):
        self.calls += 1
        if kwargs["api_key"] == "sk-invalid-browser":
            response = httpx2.Response(
                401, request=httpx2.Request("POST", "https://api.openai.com/v1/chat/completions")
            )
            raise AuthenticationError("private provider details", response=response, body={})
        data = json.loads(kwargs["messages"][2]["content"])
        if "模拟规划错误" in data["user_messages"][-1] and self.planning_failures_remaining:
            self.planning_failures_remaining -= 1
            bad = full_reply()
            bad["report"]["planning"]["tasks"][0]["depends_on"] = ["T1"]
            return json.dumps(bad, ensure_ascii=False)
        if "模拟内部错误" in data["user_messages"][-1] and not self.internal_failure_seen:
            self.internal_failure_seen = True
            raise RuntimeError("private provider details")
        if "模拟格式错误" in data["user_messages"][-1]:
            return "invalid response"
        if "模拟慢回复" in data["user_messages"][-1]:
            await asyncio.sleep(0.45)
        forced = "必须使用默认假设" in kwargs["messages"][1]["content"]
        answered = "平台是本机浏览器" in data["user_messages"][-1]
        return json.dumps(full_reply() if forced or answered else questions_reply(), ensure_ascii=False)

    async def probe(self, **kwargs):
        if kwargs["settings"].provider == "chatgpt" and self.plan_probe_error:
            body = {"error": {"code": self.plan_probe_error, "message": "private provider details"}}
            response = httpx2.Response(403, request=httpx2.Request("POST", "https://api.openai.com/v1/responses"), json=body, headers={"x-request-id": "req_0123456789abcdef"})
            raise PermissionDeniedError("private provider details", response=response, body=body)
        if kwargs["api_key"] == "sk-invalid-browser":
            response = httpx2.Response(
                401, request=httpx2.Request("POST", "https://api.openai.com/v1/chat/completions")
            )
            raise AuthenticationError("private provider details", response=response, body={})


def check_browser(base_url: str, output: Path, transport: BrowserTransport, oauth_server):
    checks = []
    errors = []
    external_requests = []
    response_timings = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
        context.grant_permissions(["clipboard-read", "clipboard-write"], origin=base_url)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "console",
            lambda message: (
                errors.append(message.text)
                if message.type == "error" and "Failed to load resource" not in message.text
                else None
            ),
        )
        page.on(
            "request",
            lambda request: (
                external_requests.append(request.url)
                if urlsplit(request.url).netloc != urlsplit(base_url).netloc
                else None
            ),
        )
        page.goto(base_url, wait_until="networkidle")
        expect(page.locator("#connection-banner")).to_be_visible()
        expect(page.locator("#copy-markdown")).to_be_disabled()
        page.click("#generate-defaults")
        expect(page.locator("#toast")).to_contain_text("请先写下")
        expect(page.locator("#toast")).not_to_be_visible(timeout=4000)
        page.screenshot(path=str(output / "welcome.png"), full_page=True)
        paints = page.evaluate("performance.getEntriesByType('paint').map(p=>({name:p.name,ms:p.startTime}))")
        fcp = next((p["ms"] for p in paints if p["name"] == "first-contentful-paint"), None)
        assert fcp is not None and fcp <= 1000, paints
        checks.append("首屏实际绘制 ≤1 秒；空想法不会生成")

        page.fill("#idea-input", "我还没发送的卡牌游戏想法")
        page.reload(wait_until="networkidle")
        expect(page.locator("#idea-input")).to_have_value("我还没发送的卡牌游戏想法")
        expect(page.locator("#draft-status")).to_contain_text("草稿已保存在本机")
        expect(page.locator(".session-item")).to_have_count(0)
        checks.append("新想法草稿刷新恢复，未发送时不创建会话或请求 GPT")

        page.fill("#idea-input", "我想做卡牌游戏")
        page.click("#send-message")
        expect(page.locator("#error-text")).to_contain_text("尚未配置")
        expect(page.locator(".history-input")).to_have_count(1)
        page.reload(wait_until="networkidle")
        expect(page.locator("#idea-input")).to_have_value("")
        expect(page.locator("#error-settings")).to_be_visible()
        expect(page.locator(".history-input")).to_have_count(1)
        page.click("#error-settings")
        expect(page.locator("#settings-dialog")).to_be_visible()
        page.fill("#api-key", "sk-中文测试")
        page.click("#save-settings")
        expect(page.locator("#settings-error")).to_contain_text("API Key 格式不正确")
        expect(page.locator("#settings-dialog")).to_be_visible()
        assert not context.request.get(f"{base_url}/api/settings").json()["openai_api_key_set"]
        checks.append("非 ASCII 密钥在页面提示纠正，未保存错误配置")

        page.fill("#api-key", "sk-invalid-browser")
        page.click("#save-settings")
        expect(page.locator("#settings-dialog")).not_to_be_visible()
        calls_before = transport.calls
        page.click("#retry-request")
        expect(page.locator("#error-text")).to_contain_text("API Key 无效")
        expect(page.locator("#send-message")).to_be_enabled()
        assert transport.calls - calls_before == 1
        assert "private provider details" not in page.content()
        page.reload(wait_until="networkidle")
        expect(page.locator("#error-settings")).to_be_visible()
        expect(page.locator(".history-input")).to_have_count(1)
        page.click("#error-settings")
        page.fill("#api-key", "sk-browser-test")
        page.click("#save-settings")
        expect(page.locator("#settings-dialog")).not_to_be_visible()
        expect(page.locator("#connection-banner")).not_to_be_visible()
        assert page.locator("#api-key").input_value() == ""
        assert "sk-browser-test" not in page.content()
        checks.append("缺少密钥提示、设置保存、密钥清空不回显")
        checks.append("无效密钥刷新后仍可打开设置，修正后重试沿用原输入")

        page.click("#retry-request")
        expect(page.locator("#markdown-output")).to_contain_text("## 3. 需要确认的问题")
        expect(page.locator("#send-message")).to_be_enabled()
        assert "## 1. " not in page.locator("#markdown-output").text_content()
        expect(page.locator(".history-input")).to_have_count(1)
        checks.append("信息不足只显示第 3 节；重试不重复保存用户输入")

        first_session = page.locator(".session-item.selected").get_attribute("data-session-id")
        page.fill("#idea-input", "这段是尚未发送的补充回答")
        page.click("#new-session")
        expect(page.locator("#idea-input")).to_have_value("")
        second_session = page.locator(".session-item.selected").get_attribute("data-session-id")
        page.fill("#idea-input", "另一个项目的草稿")
        page.click(f'[data-session-id="{first_session}"]')
        expect(page.locator("#idea-input")).to_have_value("这段是尚未发送的补充回答")
        page.reload(wait_until="networkidle")
        expect(page.locator("#idea-input")).to_have_value("这段是尚未发送的补充回答")
        page.click(f'[data-session-id="{second_session}"]')
        expect(page.locator("#idea-input")).to_have_value("另一个项目的草稿")
        page.click("#delete-session")
        page.click("#confirm-action")
        expect(page.locator("#action-dialog")).not_to_be_visible()
        page.click(f'[data-session-id="{first_session}"]')
        expect(page.locator("#idea-input")).to_have_value("这段是尚未发送的补充回答")
        page.fill("#idea-input", "")
        checks.append("草稿按会话隔离，切换和刷新可恢复，删除清除该会话草稿")

        start = time.monotonic()
        page.click("#generate-defaults")
        expect(page.locator("#markdown-output")).to_contain_text("## 7. 自检")
        expect(page.locator("#send-message")).to_be_enabled()
        response_timings.append(time.monotonic() - start)
        markdown = page.locator("#markdown-output").text_content()
        assert sum(line.startswith("## ") for line in markdown.splitlines()) == 7
        checks.append("默认假设按钮直接生成完整 7 节")

        page.click("#copy-markdown")
        expect(page.locator("#toast")).to_contain_text("已复制")
        assert page.evaluate("navigator.clipboard.readText()") == markdown
        page.click("#copy-instructions")
        instruction = page.evaluate("navigator.clipboard.readText()")
        assert instruction.startswith("## 6. 给编程 AI 的指令\n")
        assert "## 7. 自检" not in instruction
        for title in (
            "角色",
            "目标",
            "上下文",
            "技术栈",
            "功能清单",
            "文件结构",
            "接口定义",
            "验收标准",
            "输出格式",
            "分步任务",
        ):
            assert f"### {title}\n" in instruction
        checks.append("全文复制逐字一致；第 6 节独立复制包含十项内容")

        for title in (
            "架构取舍",
            "数据流与失败路径",
            "数据模型与状态约束",
            "输入与校验",
            "成功返回",
            "错误与状态",
            "权限边界",
            "重复调用与副作用",
            "成功示例",
            "失败示例",
            "风险与应对",
            "待执行验证",
        ):
            assert title in instruction
        spec = markdown.split("## 4. 需求规格\n", 1)[1].split("## 5. 技术方案", 1)[0].strip()
        assert spec in instruction
        checks.append("单独复制第 6 节包含架构、数据、完整接口、风险与验证；需求和第 4 节一致")
        assert "| R1 | M1, M2 | I1, I2 | T1, T2 | C1, C2 |" in markdown
        assert "结构校验不能证明技术选择正确" in markdown
        checks.append("页面显示需求映射表，明确区分结构检查与尚待执行的项目测试")

        with page.expect_download() as event:
            page.click("#export-markdown")
        download = event.value
        downloaded = output / download.suggested_filename
        download.save_as(str(downloaded))
        assert downloaded.read_bytes() == markdown.encode("utf-8")
        checks.append("下载 .md 与页面原文逐字节一致")

        users_before = page.locator(".history-input").count()
        calls_before = transport.calls
        page.fill("#idea-input", "模拟规划错误：继续完善卡牌游戏方案，我需要结果")
        page.click("#send-message")
        expect(page.locator("#send-message")).to_be_enabled()
        expect(page.locator("#markdown-output")).to_contain_text("程序已执行的结构检查")
        assert transport.calls - calls_before == 3
        expect(page.locator(".history-input")).to_have_count(users_before + 1)
        expect(page.locator("#error-box")).not_to_be_visible()
        assert page.locator("#markdown-output").text_content() == markdown
        checks.append("循环任务规划两次失败后自动修复，只保存一条输入并发布合格结果")

        page.reload(wait_until="networkidle")
        expect(page.locator("#markdown-output")).to_contain_text("## 7. 自检")
        assert page.locator("#markdown-output").text_content() == markdown
        page.get_by_role("button", name="查看这组问题 →").click()
        older = page.locator("#markdown-output").text_content()
        with page.expect_download() as event:
            page.click("#export-markdown")
        old_file = output / event.value.suggested_filename
        event.value.save_as(str(old_file))
        assert old_file.read_bytes() == older.encode("utf-8")
        page.get_by_role("button", name="查看这份开发指令 →").last.click()
        checks.append("刷新恢复历史；选择旧问题后导出对应版本")

        page.click("#rename-session")
        page.fill("#rename-input", "卡牌原型 · 开发指令")
        page.click("#confirm-action")
        expect(page.locator("#action-dialog")).not_to_be_visible()
        expect(page.locator("#session-title")).to_have_text("卡牌原型 · 开发指令")
        expect(page.locator(".session-item.selected .session-title")).to_have_text("卡牌原型 · 开发指令")
        expect(page.locator("#toast")).not_to_be_visible(timeout=4000)
        page.screenshot(path=str(output / "generated.png"), full_page=True)
        page.click("#theme-toggle")
        assert page.locator("html").get_attribute("data-theme") == "dark"
        page.screenshot(path=str(output / "dark.png"), full_page=True)
        page.reload(wait_until="networkidle")
        assert page.locator("html").get_attribute("data-theme") == "dark"
        checks.append("会话重命名同步到历史；深色模式刷新保留")

        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.click("#menu-toggle")
        expect(page.locator("#sidebar")).to_be_visible()
        page.locator(".session-item").click()
        expect(page.locator("#sidebar")).not_to_be_visible()
        page.click("#theme-toggle", force=True) if page.locator("#theme-toggle").is_visible() else None
        page.screenshot(path=str(output / "mobile.png"), full_page=True)
        checks.append("390px 移动布局无水平溢出；会话菜单可打开与收起")

        page.set_viewport_size({"width": 1440, "height": 1000})
        page.fill("#idea-input", "不使用默认假设，先确认信息")
        page.click("#send-message")
        expect(page.locator("#markdown-output")).to_contain_text("## 3. 需要确认的问题")
        expect(page.locator("#mode-status")).to_contain_text("当前先确认信息")
        expect(page.locator("#send-message")).to_be_enabled()
        page.fill("#idea-input", "界面按钮文案是“使用默认假设，我需要结果”")
        page.click("#send-message")
        expect(page.locator("#send-message")).to_be_enabled()
        assert "## 1. " not in page.locator("#markdown-output").text_content()
        expect(page.locator("#mode-status")).to_contain_text("当前先确认信息")
        checks.append("否定表达退出默认模式，引用按钮文案不触发，当前模式可见")

        page.fill(
            "#idea-input", "平台是本机浏览器。玩法是单人抽牌和出牌。第一版实现回合循环、胜负判定和重开。"
        )
        page.click("#send-message")
        expect(page.locator("#markdown-output")).to_contain_text("## 7. 自检")
        expect(page.locator("#mode-status")).to_contain_text("当前先确认信息")
        expect(page.locator("#send-message")).to_be_enabled()
        checks.append("补充回答后可生成完整指令，保持确认模式（模拟信息充分响应）")

        users_before = page.locator(".history-input").count()
        page.fill("#idea-input", "模拟慢回复：把卡牌数量改为 10 张")
        page.click("#send-message")
        page.wait_for_function(
            "async () => { const id=localStorage.getItem('relay-session'); "
            "if(!id) return false; const data=await (await fetch('/api/sessions/'+id)).json(); "
            "return data.session.status === 'processing'; }",
            polling=30,
        )
        page.reload(wait_until="domcontentloaded")
        expect(page.locator("#send-message")).to_be_enabled(timeout=10000)
        expect(page.locator(".history-input")).to_have_count(users_before + 1)
        expect(page.locator("#idea-input")).to_have_value("")
        expect(page.locator("#markdown-output")).to_contain_text("## 3. 需要确认的问题")
        assert not page.locator("#error-box").is_visible()
        expect(page.locator("#request-status")).not_to_be_visible()
        expect(page.locator("#send-message")).to_be_enabled()
        checks.append("生成中刷新后接续结果；已保存输入不恢复为草稿或重复发送")

        users_before = page.locator(".history-input").count()
        lost_response = {}

        def lose_response(route):
            lost_response["request_seen"] = True
            response = route.fetch()
            lost_response["server_status"] = response.status
            lost_response["saved_user_id"] = response.json()["user_message"]["id"]
            route.abort("failed")

        page.route("**/api/sessions/*/messages", lose_response, times=1)
        page.fill("#idea-input", "网络恢复后想增加 1 张卡牌")
        page.click("#send-message")
        try:
            # Chromium may keep an aborted connection pending until the app's
            # 33-second client deadline; verify recovery within that deadline.
            expect(page.locator("#error-box")).to_be_visible(timeout=35000)
        except AssertionError:
            print(
                json.dumps(
                    {
                        "lost_response": lost_response,
                        "input_value": page.locator("#idea-input").input_value(),
                        "input_disabled": page.locator("#idea-input").is_disabled(),
                        "status_visible": page.locator("#request-status").is_visible(),
                        "user_messages": page.locator(".history-input").count(),
                        "user_messages_before": users_before,
                    },
                    ensure_ascii=False,
                )
            )
            page.screenshot(path=str(output / "failed-response-loss.png"), full_page=True)
            raise
        expect(page.locator("#send-message")).to_be_enabled()
        assert lost_response["request_seen"] and lost_response["server_status"] == 200, lost_response
        # A connection failure can also block the immediate recovery GET.
        # Keep an unconfirmed draft until reconnecting and reading SQLite.
        page.reload(wait_until="networkidle")
        expect(page.locator("#idea-input")).to_have_value("")
        expect(page.locator(".history-input")).to_have_count(users_before + 1)
        checks.append("服务端保存后响应丢失，恢复历史并清除草稿，刷新不会重复输入")

        users_before = page.locator(".history-input").count()
        page.fill("#idea-input", "模拟内部错误：我想增加卡牌图鉴")
        page.click("#send-message")
        expect(page.locator("#error-text")).to_contain_text("OpenAI 调用处理失败")
        expect(page.locator("#send-message")).to_be_enabled()
        expect(page.locator(".history-input")).to_have_count(users_before + 1)
        assert "private provider details" not in page.content()
        page.reload(wait_until="networkidle")
        expect(page.locator("#retry-request")).to_be_visible()
        page.click("#retry-request")
        expect(page.locator("#markdown-output")).to_contain_text("## 3. 需要确认的问题")
        expect(page.locator("#send-message")).to_be_enabled()
        expect(page.locator(".history-input")).to_have_count(users_before + 1)
        expect(page.locator("#error-box")).not_to_be_visible()
        checks.append("内部异常保存中文错误，刷新后可重试，无秘密泄露或重复输入")

        users_before = page.locator(".history-input").count()
        page.fill("#idea-input", "模拟格式错误：我还想增加双人对战")
        calls_before = transport.calls
        page.locator("#idea-input").press("Control+Enter")
        expect(page.locator("#error-text")).to_contain_text("自动重试 2 次")
        expect(page.locator("#send-message")).to_be_enabled()
        assert transport.calls - calls_before == 3
        page.reload(wait_until="networkidle")
        expect(page.locator("#error-text")).to_contain_text("自动重试 2 次")
        expect(page.locator(".history-input")).to_have_count(users_before + 1)
        expect(page.locator("#idea-input")).to_have_value("")
        checks.append("Ctrl+Enter 发送；格式失败三次尝试；错误与输入刷新后保留")

        page.click("#delete-session")
        expect(page.locator("#action-description")).to_contain_text("无法撤销")
        page.click("#confirm-action")
        expect(page.locator("#action-dialog")).not_to_be_visible()
        expect(page.locator("#output-empty")).to_be_visible()
        expect(page.locator(".session-item")).to_have_count(0)
        checks.append("删除会话清空输入、结果和历史")
        page.click("#open-settings")
        page.locator("#key-file").set_input_files(
            {
                "name": "private-key.env",
                "mimeType": "text/plain",
                "buffer": b'OPENAI_API_KEY="sk-imported-browser"\n',
            }
        )
        expect(page.locator("#connection-result")).to_contain_text("连接检测通过")
        assert page.locator("#api-key").input_value() == ""
        assert "sk-imported-browser" not in page.locator("body").inner_text()
        checks.append("密钥文件一步导入并检测，页面不回显秘密")
        page.fill("#api-key", "sk-invalid-browser")
        page.click("#import-key-text")
        expect(page.locator("#connection-result")).to_contain_text("API Key 无效")
        checks.append("导入后的无效密钥显示明确原因且可再次更换")
        context.request.put(
            base_url + "/api/settings", data={"openai_api_key": ""}, headers={"X-Relay-Client": "local"}
        )
        page.select_option("#provider-input", "chatgpt")
        expect(page.locator("#api-fields")).not_to_be_visible()

        login_flow = {"mode": "waiting", "states": [], "callback": ""}

        def official_login(route):
            params = parse_qs(urlsplit(route.request.url).query)
            if params.get("prompt") == ["consent"]:
                login_flow["reconsent_observed"] = True
            oauth_server.nonce = params["nonce"][0]
            login_flow["states"].append(params["state"][0])
            callback_params = {
                "state": params["state"][0],
                "code": "browser-login-code",
                "client_id": "oaiapp_test",
            }
            if login_flow["mode"] == "declined":
                callback_params = {"state": params["state"][0], "error": "access_denied"}
            login_flow["callback"] = base_url + "/auth/callback?" + urlencode(callback_params)
            if login_flow["mode"] == "waiting":
                route.fulfill(
                    status=200,
                    content_type="text/html",
                    body="<html><body>Official consent is simulated locally for testing.</body></html>",
                )
            else:
                route.fulfill(status=302, headers={"location": login_flow["callback"]}, body="")

        context.route("https://auth.openai.com/api/accounts/authorize?**", official_login)
        with page.expect_popup() as popup_info:
            page.click("#chatgpt-login")
        popup = popup_info.value
        popup.wait_for_url("https://auth.openai.com/**")
        expect(page.locator("#connection-result")).to_contain_text("等待官方授权")
        page.reload(wait_until="networkidle")
        page.click("#open-settings")
        expect(page.locator("#provider-input")).to_have_value("chatgpt")
        expect(page.locator("#connection-result")).to_contain_text("等待官方授权")
        checks.append("官方授权等待期间刷新，连接方式与自动状态检查恢复")
        with page.expect_popup() as second_popup_info:
            page.click("#chatgpt-login")
        second_popup = second_popup_info.value
        second_popup.wait_for_url("https://auth.openai.com/**")
        second_popup.wait_for_load_state("domcontentloaded")
        assert len(login_flow["states"]) == 2 and login_flow["states"][0] == login_flow["states"][1]
        second_popup.close()
        checks.append("重复打开官方授权页沿用原请求，第一次登录回调仍有效")

        failed_status = {"remaining": 1}

        def transient_status_error(route):
            if failed_status["remaining"]:
                failed_status["remaining"] -= 1
                route.abort("failed")
            else:
                route.continue_()

        page.route("**/api/auth/chatgpt/status", transient_status_error)
        expect(page.locator("#connection-result")).to_contain_text("自动重新检查", timeout=5000)
        popup.goto(login_flow["callback"], wait_until="networkidle")
        expect(page.locator("#plan-welcome")).to_be_visible(timeout=10000)
        page.unroute("**/api/auth/chatgpt/status", transient_status_error)
        checks.append("状态接口短暂失败后自动恢复轮询并接收授权结果")
        page.click("#plan-understood")
        expect(page.locator("#chatgpt-account")).to_contain_text("已授权")
        expect(page.locator("#chatgpt-model")).to_have_value("gpt-6.1-sol")
        assert not context.request.get(base_url + "/api/settings").json()["openai_api_key_set"]
        expect(page.locator("#plan-usage")).to_be_visible()
        page.screenshot(path=str(output / "chatgpt-connected.png"), full_page=True)
        popup.close()
        checks.append("官方登录回调、身份签名验证、账户模型列表与计划提示通过（模拟官方服务）")
        page.click("#test-connection")
        expect(page.locator("#connection-result")).to_contain_text("连接检测通过")
        page.click("#cancel-settings")
        page.click("#new-session")
        page.fill("#idea-input", "我想做卡牌游戏")
        page.click("#generate-defaults")
        expect(page.locator("#markdown-output")).to_contain_text("## 7. 自检")
        checks.append("没有 API Key 时使用 ChatGPT 授权生成完整七节（模拟模型）")
        page.click("#open-settings")
        page.click("#chatgpt-logout")
        expect(page.locator("#connection-result")).to_contain_text("已断开 ChatGPT")
        status = context.request.get(base_url + "/api/auth/chatgpt/status").json()
        assert not status["connected"] and "access_token" not in status and "refresh_token" not in status
        checks.append("断开 ChatGPT 清除本地令牌，状态接口不暴露凭据")
        page.select_option("#provider-input", "chatgpt")

        login_flow["mode"] = "identity_only"
        oauth_server.scopes = "openid profile email"
        with page.expect_popup() as identity_popup_info:
            page.click("#chatgpt-login")
        identity_popup = identity_popup_info.value
        expect(page.locator("#chatgpt-account")).to_contain_text("已登录", timeout=10000)
        expect(page.locator("#chatgpt-account")).to_contain_text("尚未授权")
        identity_popup.close()
        page.reload(wait_until="networkidle")
        page.click("#open-settings")
        expect(page.locator("#chatgpt-account")).to_contain_text("已登录")
        expect(page.locator("#connection-result")).to_contain_text("没有授权使用 ChatGPT 计划")
        page.click("#check-chatgpt-login")
        expect(page.locator("#connection-result")).to_contain_text("没有授权使用 ChatGPT 计划")
        page.screenshot(path=str(output / "login-authorization-required.png"), full_page=True)
        checks.append("账号已登录但模型未授权时明确区分，刷新与检查按钮保留原因")
        expect(page.locator("#reauthorize-chatgpt")).to_be_visible()
        oauth_server.scopes = SCOPES
        login_flow["mode"] = "authorized"
        with page.expect_popup() as consent_popup_info:
            page.click("#reauthorize-chatgpt")
        consent_popup = consent_popup_info.value
        expect(page.locator("#login-step-plan")).to_contain_text("已授权", timeout=10000)
        expect(page.locator("#login-step-model")).to_contain_text("待检测")
        expect(page.locator("#reauthorize-chatgpt")).not_to_be_visible()
        consent_popup.close()
        assert login_flow.get("reconsent_observed") is True
        checks.append("专用授权按钮从已登录但未授权恢复，模型连接继续单独检测")
        for provider_code, expected_message in [("private_unknown_code", "尚未说明"), ("subscription_sharing_user_not_eligible", "目前不能")]:
            transport.plan_probe_error = provider_code
            page.click("#test-connection")
            expect(page.locator("#connection-result")).to_contain_text(expected_message)
            expect(page.locator("#login-step-identity")).to_contain_text("已登录")
            expect(page.locator("#login-step-model")).to_contain_text("失败")
            page.reload(wait_until="networkidle")
            page.click("#open-settings")
            expect(page.locator("#connection-result")).to_contain_text(expected_message)
            status = context.request.get(base_url + "/api/auth/chatgpt/status").json()
            assert status["signed_in"] and status["plan_enabled"] and not status["connection_check"]["ok"]
            expect(page.locator("#use-api-key")).to_be_visible()
            assert "private provider details" not in page.content()
        page.screenshot(path=str(output / "model-permission-failure.png"), full_page=True)
        checks.append("模型拒绝单独显示，未知 403 不误判资格，明确资格拒绝刷新后仍保留身份和原因")
        expect(page.locator("#login-error-code")).to_contain_text("chatgpt_not_eligible")
        calls_before_feedback = len(oauth_server.calls)
        page.click("#copy-login-error")
        expect(page.locator("#connection-result")).to_contain_text("已复制报错反馈")
        copied_failure = json.loads(page.evaluate("navigator.clipboard.readText()"))
        assert copied_failure["feedback"]["problem_stage"] == "model_inference"
        assert copied_failure["feedback"]["error_code"] == "chatgpt_not_eligible"
        assert not copied_failure["network"]["requested"]
        assert len(oauth_server.calls) == calls_before_feedback
        assert_private(copied_failure)
        checks.append("登录区域一键复制真实错误码、中文阶段与安全报告，无额外网络或模型调用")
        page.evaluate("() => { window.savedClipboardWrite = navigator.clipboard.writeText; navigator.clipboard.writeText = () => Promise.reject(new Error('clipboard blocked')); }")
        with page.expect_download() as feedback_download:
            page.click("#copy-login-error")
        fallback_file = output / "diagnostic-clipboard-fallback.json"
        feedback_download.value.save_as(str(fallback_file))
        assert json.loads(fallback_file.read_text())["feedback"]["error_code"] == "chatgpt_not_eligible"
        expect(page.locator("#connection-result")).to_contain_text("不允许自动复制")
        page.evaluate("navigator.clipboard.writeText = window.savedClipboardWrite; delete window.savedClipboardWrite")
        checks.append("浏览器拒绝复制时自动下载同一脱敏JSON，可直接发送反馈")
        page.click("#use-api-key")
        expect(page.locator("#provider-input")).to_have_value("api")
        assert context.request.get(base_url + "/api/settings").json()["provider"] == "chatgpt"
        page.select_option("#provider-input", "chatgpt")
        transport.plan_probe_error = None
        page.click("#test-connection")
        expect(page.locator("#connection-result")).to_contain_text("连接检测通过")
        expect(page.locator("#login-step-model")).to_contain_text("通过")
        checks.append("成功重测更新第三步；用户主动选择密钥时才展示密钥设置，检测失败不会自动更换计费")
        page.click("#chatgpt-logout")
        expect(page.locator("#connection-result")).to_contain_text("已断开 ChatGPT")
        page.select_option("#provider-input", "chatgpt")
        login_flow["mode"] = "declined"
        with page.expect_popup() as declined_popup_info:
            page.click("#chatgpt-login")
        declined_popup = declined_popup_info.value
        expect(page.locator("#connection-result")).to_contain_text("没有完成 ChatGPT 授权", timeout=10000)
        declined_popup.close()
        page.reload(wait_until="networkidle")
        page.click("#open-settings")
        expect(page.locator("#connection-result")).to_contain_text("没有完成 ChatGPT 授权")
        checks.append("官方授权失败原因在回到页面与刷新后均可见")
        login_flow["mode"] = "waiting"
        with page.expect_popup() as cancelled_popup_info:
            page.click("#chatgpt-login")
        cancelled_popup = cancelled_popup_info.value
        expect(page.locator("#cancel-chatgpt-login")).to_be_visible()
        page.click("#cancel-chatgpt-login")
        expect(page.locator("#connection-result")).to_contain_text("已取消本次登录")
        cancelled_popup.close()
        checks.append("取消等待中的登录后可重新开始，不发布未完成的授权")

        page.uncheck("#diagnostic-network")
        calls_before = len(oauth_server.calls)
        with page.expect_download() as diagnostic_download:
            page.click("#run-diagnostics")
        diagnostic_file = output / "diagnostic-offline.json"
        diagnostic_download.value.save_as(str(diagnostic_file))
        offline_text = diagnostic_file.read_text(encoding="utf-8")
        offline_report = json.loads(offline_text)
        assert not offline_report["network"]["requested"] and not offline_report["network"]["probes"]
        assert len(oauth_server.calls) == calls_before
        assert_private(offline_report, "sk-imported-browser", "sk-invalid-browser")
        expect(page.locator("#diagnostic-summary")).to_be_visible()
        checks.append("页面一键离线自检并下载 JSON，不连接官方接口或导出凭据")
        page.click("#copy-diagnostics")
        expect(page.locator("#toast")).to_contain_text("诊断报告")
        assert page.evaluate("navigator.clipboard.readText()") == offline_text
        assert context.request.get(base_url + "/api/diagnostics/export").json() == offline_report
        checks.append("诊断报告复制、页面内容与再次导出一致")

        oauth_server.endpoint = TOKEN
        oauth_server.provider_code = "invalid_client"
        login_flow["mode"] = "token_denied"
        with page.expect_popup() as denied_popup_info:
            page.click("#chatgpt-login")
        denied_popup = denied_popup_info.value
        expect(page.locator("#connection-result")).to_contain_text("客户端注册或配置", timeout=10000)
        denied_popup.close()
        page.click("#refresh-chatgpt-models")
        expect(page.locator("#connection-result")).to_contain_text("上次授权未完成")
        expect(page.locator("#connection-result")).to_contain_text("客户端注册或配置")
        checks.append("授权交换 403 后刷新模型保留首因，明确说明刷新不能完成授权")
        page.click("#copy-login-error")
        expect(page.locator("#connection-result")).to_contain_text("已复制报错反馈")
        login_failure = json.loads(page.evaluate("navigator.clipboard.readText()"))
        assert login_failure["feedback"]["problem_stage"] == "token_exchange"
        assert login_failure["feedback"]["error_code"] == login_failure["authorization"]["result_code"] == "chatgpt_client_rejected"
        assert login_failure["feedback"]["evidence"]["provider_code"] == "invalid_client"
        assert_private(login_failure)
        checks.append("登录回调交换失败后一键返回原错误码、精确失败阶段与官方请求证据")
        with page.expect_download() as failed_diagnostic_download:
            page.click("#run-diagnostics")
        failed_diagnostic_file = output / "diagnostic-token-denied.json"
        failed_diagnostic_download.value.save_as(str(failed_diagnostic_file))
        failure_report = json.loads(failed_diagnostic_file.read_text(encoding="utf-8"))
        first_failure = failure_report["login_trace"]["first_failure"]
        assert first_failure["stage"] == "token_exchange" and first_failure["http_status"] == 403
        assert first_failure["provider_code"] == "invalid_client"
        assert not failure_report["authorization"]["connected"]
        assert_private(failure_report)
        page.locator("#diagnostic-details").evaluate("node => node.open = true")
        page.screenshot(path=str(output / "diagnostic-root-cause.png"), full_page=True)
        checks.append("授权失败报告准确指出阶段、状态、错误码并保留 HTTP 请求 ID")
        page.reload(wait_until="networkidle")
        page.click("#open-settings")
        expect(page.locator("#connection-result")).to_contain_text("客户端注册或配置")
        assert (
            context.request.get(base_url + "/api/diagnostics/export").json()["login_trace"]["first_failure"]
            == first_failure
        )
        checks.append("授权失败与最近自检报告刷新后保留")

        # Reproduce the old API error followed by the currently selected login.
        headers = {"X-Relay-Client": "local"}
        context.request.put(base_url + "/api/settings", data={"provider": "api", "openai_api_key": ""}, headers=headers)
        failed_sid = context.request.post(base_url + "/api/sessions", data={"title": "诊断优先级回归"}, headers=headers).json()["id"]
        old_failure = context.request.post(base_url + f"/api/sessions/{failed_sid}/messages", data={"content": "我想做卡牌游戏"}, headers=headers)
        assert old_failure.json()["detail"]["code"] == "api_key_missing"
        oauth_server.endpoint = TOKEN
        oauth_server.provider_code = "unsupported_country_region_territory"
        with page.expect_popup() as region_popup_info:
            page.click("#chatgpt-login")
        region_popup = region_popup_info.value
        region_popup.on("pageerror", lambda error: errors.append(str(error)))
        region_popup.wait_for_url(base_url + "/", timeout=10000)
        expect(region_popup.locator("#settings-dialog")).to_be_visible()
        expect(region_popup.locator("#chatgpt-fields")).to_be_visible()
        expect(region_popup.locator("#login-error-code")).to_contain_text("unsupported_country_region_territory")
        expect(region_popup.locator("#login-error-code")).to_contain_text("交换授权码")
        expect(region_popup.locator("#login-step-identity")).to_contain_text("本机授权未完成")
        checks.append("新回调标签页自动显示登录失败位置、官方地区码和真实未授权状态")
        expect(page.locator("#login-error-code")).to_contain_text("chatgpt_region_unsupported", timeout=10000)
        checks.append("原页面自动接续显示同一次地区拒绝，两个标签页状态一致")
        region_popup.click("#cancel-settings")
        expect(region_popup.locator("#login-return-title")).to_contain_text("本次登录未完成")
        expect(region_popup.locator("#login-return-evidence")).to_contain_text("unsupported_country_region_territory")
        assert "code=" not in region_popup.url and "state=" not in region_popup.url
        checks.append("关闭设置后回调结果仍清楚可见，地址栏清除授权参数")
        calls_before = len(oauth_server.calls)
        model_calls_before = transport.calls
        region_popup.click("#copy-login-return")
        expect(region_popup.locator("#toast")).to_contain_text("已复制登录报错")
        regional = json.loads(region_popup.evaluate("navigator.clipboard.readText()"))
        assert regional["feedback"]["problem_stage"] == "token_exchange"
        assert regional["feedback"]["error_code"] == "chatgpt_region_unsupported"
        assert regional["feedback"]["evidence"]["provider_code"] == "unsupported_country_region_territory"
        old = next(f for f in regional["findings"] if f["code"] == "api_key_missing")
        assert old["level"] == "info" and old["context"] == "other_provider"
        assert len(oauth_server.calls) == calls_before and transport.calls == model_calls_before
        assert_private(regional)
        checks.append("回调页一键复制精确地区故障，旧缺 Key 记录仅供参考，自检不调用模型")
        region_popup.reload(wait_until="networkidle")
        region_popup.click("#open-settings")
        expect(region_popup.locator("#login-error-code")).to_contain_text("unsupported_country_region_territory")
        checks.append("地区拒绝和官方错误码刷新后保留")
        region_popup.close()

        oauth_server.endpoint = None
        oauth_server.scopes = SCOPES
        login_flow["mode"] = "connected"
        with page.expect_popup() as recovered_popup_info:
            page.click("#chatgpt-login")
        recovered_popup = recovered_popup_info.value
        expect(page.locator("#chatgpt-account")).to_contain_text("已授权", timeout=10000)
        expect(recovered_popup.locator("#login-return-title")).to_contain_text("账号登录和计划授权已完成", timeout=10000)
        expect(recovered_popup.locator("#login-step-model")).to_contain_text("待检测")
        checks.append("成功回调明确区分账号与计划授权完成、模型调用仍待检测")
        recovered_popup.close()
        page.check("#diagnostic-network")
        model_calls_before = transport.calls
        with page.expect_download() as network_diagnostic_download:
            page.click("#run-diagnostics")
        network_diagnostic_file = output / "diagnostic-network.json"
        network_diagnostic_download.value.save_as(str(network_diagnostic_file))
        network_report = json.loads(network_diagnostic_file.read_text(encoding="utf-8"))
        assert all(probe["outcome"] == "ok" for probe in network_report["network"]["probes"])
        assert network_report["login_trace"]["first_failure"] is None
        assert model_calls_before == transport.calls
        assert_private(network_report)
        checks.append("新登录恢复后自检仅检查公开授权接口和模型列表，不调用模型")
        page.screenshot(path=str(output / "connections.png"), full_page=True)
        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        page.screenshot(path=str(output / "connections-mobile.png"), full_page=True)
        page.click("#cancel-settings")
        page.set_viewport_size({"width": 1440, "height": 1000})
        assert not external_requests, external_requests
        assert not errors, errors
        checks.append("浏览器无外部网络请求、脚本异常或 CSP 错误")
        version = browser.version
        browser.close()

    report = {
        "browser": f"Chromium {version}",
        "first_contentful_paint_ms": fcp,
        "mock_full_generation_seconds": [round(v, 3) for v in response_timings],
        "real_openai_used": False,
        "passed": checks,
        "external_browser_requests": external_requests,
        "browser_errors": errors,
    }
    (output / "browser-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "test-results" / "browser")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    transport = BrowserTransport()
    with tempfile.TemporaryDirectory(prefix="relay-browser-") as directory:
        oauth_server = DeniedServer(
            rsa.generate_private_key(public_exponent=65537, key_size=2048), endpoint=None
        )
        app = create_app(
            Config(data_dir=Path(directory), api_key="", llm_budget_seconds=2),
            transport=transport,
            auth_http_factory=oauth_server.factory,
            connection_transport=transport,
        )
        server = uvicorn.Server(
            uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning", proxy_headers=False)
        )
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            sock.listen(128)
            port = sock.getsockname()[1]
            thread = Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
            thread.start()
            for _ in range(500):
                if server.started:
                    break
                if not thread.is_alive():
                    raise RuntimeError("Test server failed to start")
                time.sleep(0.01)
            else:
                raise RuntimeError("Test server startup timed out")
            try:
                check_browser(f"http://127.0.0.1:{port}", args.output.resolve(), transport, oauth_server)
            finally:
                server.should_exit = True
                thread.join(timeout=5)


if __name__ == "__main__":
    main()
