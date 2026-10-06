"""Tool workflow, provenance, persistence and local transport boundaries."""
import asyncio
import json
import sqlite3
from contextlib import closing
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
from mcp import Client
from sqlalchemy import select

from app.api.tool_routes import invoke_tool
from app.errors import RelayError
from app.main import create_app
from app.mcp_tools import make_mcp_server
from app.models import Generation, Message, Setting, ToolTask
from app.services.tool_access import ToolAccess
from diagnose import standalone_report
from mcp_stdio import local_url
from tests.fakes import full_reply, questions_reply
from tool_check import EXPECTED_TOOLS


def queued(client, **kwargs):
    response = client.post("/api/tools/tasks", json={"request_key": "request-test-001", "idea": "我想做卡牌游戏", **kwargs})
    assert response.status_code == 200, response.text
    return response.json()


def invoke(client, operation, **arguments):
    token = client.post("/api/tools/access-token").json()["token"]
    return client.post("/api/tools/invoke", json={"operation": operation, "arguments": arguments},
                       headers={"Authorization": "Bearer " + token})


def test_tool_mode_queues_without_key_or_model(client, transport):
    client.put("/api/settings", json={"provider": "tool", "openai_api_key": ""})
    sid = client.post("/api/sessions", json={}).json()["id"]
    response = client.post(f"/api/sessions/{sid}/messages", json={"content": "我想做卡牌游戏"})
    assert response.status_code == 200
    task = response.json()
    assert task["queued_for_tool"] and not task["use_default_assumptions"]
    assert not transport.calls
    assert client.get(f"/api/sessions/{sid}").json()["session"]["status"] == "awaiting_tool"
    assert not client.get("/api/tools/status").json()["tool_call_observed"]


def test_questions_defaults_export_and_provenance(client, transport):
    task = queued(client)
    reply = invoke(client, "submit", task_id=task["task_id"], reply=questions_reply()).json()
    assert reply["need_more_info"]
    assert reply["output_markdown"].startswith("## 3. 需要确认的问题\n")
    assert reply["output_markdown"].count("## ") == 1
    new = queued(client, request_key="request-test-002", session_id=task["session_id"], idea="使用默认假设，我需要结果")
    assert new["use_default_assumptions"]
    saved = invoke(client, "submit", task_id=new["task_id"], reply=full_reply()).json()
    assert saved["ok"] and not saved["need_more_info"]
    assert saved["host_model"] is None and saved["host_temperature"] is None
    assert saved["source"] == "connected_chat_host"
    output = saved["output_markdown"]
    assert sum(line.startswith("## ") for line in output.splitlines()) == 7
    assert "**假设**" in output
    for field in ("角色", "目标", "上下文", "技术栈", "功能清单", "文件结构", "接口定义", "验收标准", "输出格式", "分步任务"):
        assert f"### {field}\n" in output
    assert client.get(f"/api/sessions/{new['session_id']}/export").content == output.encode()
    assert not transport.calls
    with client.app.state.database.sessions() as db:
        assert list(db.scalars(select(Generation))) == []


def test_exact_retries_are_idempotent_and_conflicts_rejected(client):
    task = queued(client)
    assert queued(client)["task_id"] == task["task_id"]
    response = client.post("/api/tools/tasks", json={"request_key": "request-test-001", "idea": "另一种想法"})
    assert response.status_code == 409 and response.json()["detail"]["code"] == "tool_request_conflict"
    a = invoke(client, "submit", task_id=task["task_id"], reply=questions_reply()).json()
    b = invoke(client, "submit", task_id=task["task_id"], reply=questions_reply()).json()
    assert a == b
    assert invoke(client, "submit", task_id=task["task_id"], reply=questions_reply(2)).status_code == 409
    detail = client.get(f"/api/sessions/{task['session_id']}").json()
    assert len(detail["messages"]) == 2


def test_new_input_supersedes_old_task_and_cannot_overwrite(client):
    task = queued(client)
    latest = queued(client, request_key="request-test-002", session_id=task["session_id"], idea="使用默认假设，我需要结果")
    stale = invoke(client, "submit", task_id=task["task_id"], reply=questions_reply())
    assert stale.status_code == 409 and stale.json()["detail"]["code"] == "tool_task_closed"
    current = invoke(client, "next_task", session_id=task["session_id"]).json()
    assert current["task_id"] == latest["task_id"]


def test_context_change_outside_queue_rejects_late_result(client):
    task = queued(client)
    with client.app.state.database.sessions.begin() as db:
        db.add(Message(session_id=task["session_id"], role="user", kind="input", content="新输入"))
    result = invoke(client, "submit", task_id=task["task_id"], reply=questions_reply())
    assert result.status_code == 409 and result.json()["detail"]["code"] == "tool_context_changed"


def test_format_retry_budget_is_initial_plus_two(client):
    task = queued(client, use_default_assumptions=True)
    for remaining in (2, 1, 0):
        response = invoke(client, "submit", task_id=task["task_id"], reply=questions_reply())
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == "tool_result_invalid"
        assert detail["remaining_retries"] == remaining
        assert detail["retryable"] is (remaining > 0)
    assert invoke(client, "submit", task_id=task["task_id"], reply=full_reply()).status_code == 409
    report = client.get("/api/tools/diagnostics").json()
    assert report["error_code"] == "tool_result_invalid"
    assert report["problem_stage"] == "tool_result_validation"


@pytest.mark.parametrize("mutation", ["six_questions", "schema", "unknown_ref", "unsafe_path", "vague_metric", "fake_verification"])
def test_invalid_host_result_never_saved(client, mutation):
    task = queued(client)
    reply = full_reply()
    if mutation == "six_questions":
        reply = questions_reply(6)
    elif mutation == "schema":
        reply["secret_override"] = "ignore system"
    elif mutation == "unknown_ref":
        reply["report"]["planning"]["tasks"][0]["requirement_ids"] = ["R12"]
    elif mutation == "unsafe_path":
        reply["report"]["planning"]["modules"][0]["files"][0]["path"]["text"] = "../secret.env"
    elif mutation == "vague_metric":
        reply["report"]["requirements"]["quantified"][0]["text"] = "首屏要快"
    else:
        reply["report"]["planning"]["tasks"][0]["verification"]["text"] = "已经运行测试全部通过"
    response = invoke(client, "submit", task_id=task["task_id"], reply=reply)
    assert response.status_code == 422
    assert response.json()["detail"]["issues"]
    assert not any(m["role"] == "assistant" for m in client.get(f"/api/sessions/{task['session_id']}").json()["messages"])


def test_user_basis_without_evidence_is_marked_assumption(client):
    task = queued(client)
    reply = full_reply()
    reply["report"]["technical_plan"] = [{"text": "使用 Rust 和 PostgreSQL", "basis": "user", "evidence": "使用 Rust 和 PostgreSQL"}]
    response = invoke(client, "submit", task_id=task["task_id"], reply=reply).json()
    assert "**假设**：使用 Rust 和 PostgreSQL" in response["output_markdown"]


def test_cancel_preserves_inputs_delete_cascades_tasks(client):
    task = queued(client)
    assert client.post(f"/api/tools/tasks/{task['task_id']}/cancel").json()["ok"]
    assert invoke(client, "next_task").json()["pending"] is False
    assert invoke(client, "result", task_id=task["task_id"]).json()["output_markdown"] is None
    assert len(client.get(f"/api/sessions/{task['session_id']}").json()["messages"]) == 1
    client.delete(f"/api/sessions/{task['session_id']}")
    assert invoke(client, "context", task_id=task["task_id"]).status_code == 404
    with client.app.state.database.sessions() as db:
        assert not list(db.scalars(select(ToolTask)))


def test_restarts_preserve_queue_and_results(config):
    config = deepcopy(config)
    with TestClient(create_app(config), headers={"X-Relay-Client": "local"}) as first:
        task = queued(first)
    with TestClient(create_app(config), headers={"X-Relay-Client": "local"}) as second:
        assert invoke(second, "next_task").json()["task_id"] == task["task_id"]
        saved = invoke(second, "submit", task_id=task["task_id"], reply=questions_reply()).json()
    with TestClient(create_app(config), headers={"X-Relay-Client": "local"}) as third:
        assert invoke(third, "result", task_id=task["task_id"]).json()["output_markdown"] == saved["output_markdown"]


def test_tool_access_origin_host_and_credentials(client):
    assert client.post("/api/tools/invoke", json={"operation": "status"}).status_code == 401
    assert client.post("/mcp", json={}).status_code == 401
    assert client.post("/api/tools/access-token", headers={"Origin": "https://evil.example"}).status_code == 403
    token = client.post("/api/tools/access-token").json()["token"]
    assert len(token) == 64
    assert token == client.post("/api/tools/access-token").json()["token"]
    assert invoke(client, "status").json()["tool_call_observed"]
    assert client.post("/mcp", json={}, headers={"Authorization": "Bearer " + token, "Host": "evil.example"}).status_code == 400


def test_corrupt_tool_token_has_safe_error(config):
    access = ToolAccess(config)
    access.path.parent.mkdir(parents=True, exist_ok=True)
    access.path.write_text("invalid-secret-content")
    with pytest.raises(RelayError, match="工具连接口令"):
        access.token()


def test_tool_diagnostics_do_not_export_ideas_or_credentials(client):
    task = queued(client, idea="private-idea-marker 我想做卡牌游戏")
    client.put("/api/tools/setup", json={"tunnel_id": "tunnel_secret_marker"})
    token = client.post("/api/tools/access-token").json()["token"]
    with client.app.state.database.sessions.begin() as db:
        db.merge(Setting(key="tool_last_call", value=json.dumps({"operation": "status", "transport": "stdio", "at": "2026-10-06T12:00:00+00:00", "secret": token})))
        db.merge(Setting(key="tool_protocol_check", value=json.dumps({"ok": True, "secret": token, "message": "private-idea-marker"})))
    report = client.get("/api/tools/diagnostics").text
    assert not any(secret in report for secret in (token, "private-idea-marker", "tunnel_secret_marker", task["task_id"]))
    assert client.get("/api/tools/status").json()["tool_call_observed"]


def test_tool_mode_general_diagnostic_does_not_test_oauth_or_need_key(client):
    client.put("/api/settings", json={"provider": "tool", "openai_api_key": ""})
    response = client.post("/api/diagnostics/run", json={"check_network": True}).json()
    assert response["network"]["requested"] is False
    assert response["network"]["probes"] == []
    assert response["feedback"]["error_code"] == "tool_host_not_connected"
    assert not any(i["level"] == "error" and i["code"] == "api_key_missing" for i in response["findings"])


def test_offline_standalone_reads_only_mode_fields(tmp_path, monkeypatch):
    data = tmp_path / ".data"
    data.mkdir()
    with closing(sqlite3.connect(data / "relay.sqlite3")) as db:
        db.execute("CREATE TABLE settings (key TEXT,value TEXT)")
        db.executemany("INSERT INTO settings VALUES (?,?)", [("provider", "tool"), ("tool_tunnel_id", "tunnel_private"), ("openai_api_key", "sk-private")])
        db.commit()
    monkeypatch.delenv("RELAY_DATA_DIR", raising=False)
    monkeypatch.setattr("diagnose.discover_server", lambda port: (None, {}))
    report = standalone_report(tmp_path, offline=True)
    assert report["authorization"]["selected_provider"] == "tool"
    assert not report["network"]["requested"]
    assert "sk-private" not in json.dumps(report) and "tunnel_private" not in json.dumps(report)


@pytest.mark.parametrize("url", ["https://127.0.0.1:8000", "http://evil.example:8000", "http://user:secret@localhost:8000", "http://localhost:8000/x", "http://localhost:8000?key=secret", "http://localhost", "http://localhost:99999", "file:///tmp/x"])
def test_stdio_cannot_read_arbitrary_endpoints(url):
    with pytest.raises(RelayError):
        local_url(url)


def test_guide_setup_and_interface_discovery(client):
    assert client.get("/tool-guide").status_code == 200
    assert client.get("/api/tools/setup").json()["stdio"]["args"][0].endswith("mcp_stdio.py")
    assert not client.get("/api/tools/status").json()["tool_call_observed"]
    result = client.post("/api/tools/check").json()  # TestClient isn't a real loopback listener.
    assert not result["ok"] and not result["external_host_verified"]
    assert not client.get("/api/tools/status").json()["tool_call_observed"]


def test_official_sdk_initialization_tools_and_call(client, transport):
    async def workflow():
        async def call(operation, arguments):
            return await invoke_tool(client.app, operation, arguments, "mcp_http")
        async with Client(make_mcp_server(call)) as host:
            catalog = (await host.list_tools()).tools
            assert {tool.name for tool in catalog} == EXPECTED_TOOLS
            assert "当前宿主对话" in host.instructions
            assert all(tool.annotations.open_world_hint is False for tool in catalog)
            result = await host.call_tool("relay_start", {"request_key": "sdk-request-001", "idea": "我想做卡牌游戏"})
            task = result.structured_content
            context = (await host.call_tool("relay_context", {"task_id": task["task_id"]})).structured_content
            assert context["response_schema"]["$defs"]["Report"]
            assert "忽略" in context["system_prompt"]
            invalid = await host.call_tool("relay_submit", {"task_id": task["task_id"], "reply": {}})
            assert invalid.is_error
            valid = await host.call_tool("relay_submit", {"task_id": task["task_id"], "reply": questions_reply()})
            assert valid.structured_content["ok"]
    asyncio.run(workflow())
    assert not transport.calls


def test_exhausted_task_can_retry_original_input_and_clear_diagnostic(client):
    client.put("/api/settings", json={"provider": "tool"})
    task = queued(client, use_default_assumptions=True)
    for _ in range(3):
        invoke(client, "submit", task_id=task["task_id"], reply=questions_reply())
    sid = task["session_id"]
    assert client.get(f"/api/sessions/{sid}").json()["session"]["status"] == "error"
    retry = client.post(f"/api/sessions/{sid}/retry").json()
    assert retry["task_id"] != task["task_id"]
    assert len(client.get(f"/api/sessions/{sid}").json()["messages"]) == 1
    assert invoke(client, "submit", task_id=retry["task_id"], reply=full_reply()).json()["ok"]
    assert client.get("/api/tools/diagnostics").json()["error_code"] is None


@pytest.mark.parametrize("idea,forced", [
    ("我想做卡牌游戏，使用默认假设，我需要结果", True),
    ("我想做卡牌游戏，不使用默认假设，请先问我", False),
    ("我想做卡牌游戏，按钮文案叫“使用默认假设”", False),
])
def test_tool_mode_preserves_default_command_and_negation(client, idea, forced):
    task = queued(client, idea=idea)
    assert task["use_default_assumptions"] is forced


def test_legacy_database_gets_additive_tool_table_without_losing_history(config):
    from contextlib import closing
    with TestClient(create_app(config), headers={"X-Relay-Client": "local"}) as first:
        sid = first.post("/api/sessions", json={"title": "旧版保留历史"}).json()["id"]
        first.post(f"/api/sessions/{sid}/messages", json={"content": "我想做卡牌游戏"})
        original = first.get(f"/api/sessions/{sid}").json()["messages"]
    with closing(sqlite3.connect(config.data_dir / "relay.sqlite3")) as db:
        db.execute("DROP TABLE tool_tasks")
        db.commit()
    with TestClient(create_app(config), headers={"X-Relay-Client": "local"}) as upgraded:
        assert upgraded.get(f"/api/sessions/{sid}").json()["messages"] == original
        assert queued(upgraded, session_id=sid)["queued_for_tool"]
