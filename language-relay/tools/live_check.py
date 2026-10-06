"""Explicit real-model acceptance test. Requires a key or ChatGPT authorization.

This is NOT collected by pytest. It sends only the two synthetic card-game ideas
below to the local app, which sends them to OpenAI. It deletes its test session.
"""

import argparse
import json
import time
from urllib.parse import urlsplit

import httpx

BASE_URL = "http://127.0.0.1:8000"
REQUIRED = (
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
)


def main(base_url=BASE_URL):
    session_id = None
    with httpx.Client(
        base_url=base_url, timeout=33, headers={"X-Relay-Client": "local"}, trust_env=False
    ) as client:
        settings = client.get("/api/settings")
        settings.raise_for_status()
        values = settings.json()
        if values.get("provider") == "tool":
            raise SystemExit("当前为工具模式。协议验收运行 python tools/mcp_check.py；内容验收在连接了工具的 ChatGPT 对话执行 QUALITY.md 中的案例。")
        if values.get("provider") == "chatgpt":
            status = client.get("/api/auth/chatgpt/status")
            status.raise_for_status()
            if not status.json()["connected"] or not values.get("chatgpt_model"):
                raise SystemExit("请先在应用设置中使用 ChatGPT 登录并选择可用模型。")
        elif not values["openai_api_key_set"]:
            raise SystemExit("请先启动应用，并在页面设置中保存 OpenAI API Key。")
        try:
            response = client.post("/api/sessions", json={"title": "自动验收（临时）"})
            response.raise_for_status()
            session_id = response.json()["id"]
            start = time.monotonic()
            first = client.post(f"/api/sessions/{session_id}/messages", json={"content": "我想做卡牌游戏"})
            first.raise_for_status()
            first_seconds = time.monotonic() - start
            data = first.json()
            assert data["need_more_info"] and 1 <= len(data["questions"]) <= 5
            assert data["output_markdown"].startswith("## 3. 需要确认的问题\n")
            assert "## 4. " not in data["output_markdown"]
            start = time.monotonic()
            second = client.post(
                f"/api/sessions/{session_id}/messages", json={"content": "使用默认假设，我需要结果"}
            )
            second.raise_for_status()
            second_seconds = time.monotonic() - start
            markdown = second.json()["output_markdown"]
            assert not second.json()["need_more_info"]
            assert sum(line.startswith("## ") for line in markdown.splitlines()) == 7
            section = markdown.split("## 6. 给编程 AI 的指令\n")[1].split("## 7. 自检")[0]
            assert all(f"### {title}\n" in section for title in REQUIRED)
            assert "**假设**" in markdown
            exported = client.get(f"/api/sessions/{session_id}/export")
            exported.raise_for_status()
            assert exported.content == markdown.encode("utf-8")
            assert first_seconds <= 30 and second_seconds <= 30
            print(
                json.dumps(
                    {
                        "通过": True,
                        "连接方式": values.get("provider", "api"),
                        "询问耗时秒": round(first_seconds, 3),
                        "完整生成耗时秒": round(second_seconds, 3),
                        "字符数": len(markdown),
                    },
                    ensure_ascii=False,
                )
            )
            print("请另行人工检查内容是否贴合想法、假设是否合理、量化指标是否可测。")
        except httpx.HTTPStatusError as error:
            try:
                message = error.response.json()["detail"]["message"]
            except (ValueError, KeyError, TypeError):
                message = f"本地服务返回 HTTP {error.response.status_code}。"
            raise SystemExit(message) from None
        finally:
            if session_id is not None:
                client.delete(f"/api/sessions/{session_id}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="真实 OpenAI 模型验收，需先配置密钥或 ChatGPT 授权")
    parser.add_argument("--url", default=BASE_URL, help="启动窗口显示的本机网址")
    args = parser.parse_args()
    url = urlsplit(args.url)
    if (
        url.scheme != "http" or url.hostname not in ("127.0.0.1", "localhost", "::1")
        or url.username or url.password or url.path not in ("", "/") or url.query or url.fragment
    ):
        raise SystemExit("验收网址必须是启动窗口显示的本机 HTTP 地址。")
    try:
        main(args.url.rstrip("/"))
    except httpx.RequestError:
        raise SystemExit("无法连接本地服务，请先运行应用，再执行此脚本。") from None
