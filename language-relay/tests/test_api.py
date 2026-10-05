import asyncio
import json
import os
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from threading import Event

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db import Database
from app.main import create_app
from app.models import Generation, Message, Setting
from app.services import session_service
from tests.fakes import ScriptedTransport, SlowReply, full_reply, questions_reply


def new_session(client, title=None):
    response = client.post("/api/sessions", json={"title": title} if title else {})
    assert response.status_code == 201
    return response.json()["id"]


def send(client, session_id, content="我想做卡牌游戏"):
    return client.post(f"/api/sessions/{session_id}/messages", json={"content": content})


def test_health_and_local_first_screen(client):
    assert client.get("/health").json() == {"status": "ok"}
    start = time.perf_counter()
    page = client.get("/")
    assert page.status_code == 200
    assert time.perf_counter() - start < 1
    assert "语言转换指令中继器" in page.text
    assert "sk-local-test-key" not in page.text
    assert '<script defer src="/static/vendor/htmx.min.js">' in page.text
    assert "cdn." not in page.text
    assert "script-src 'self'" in page.headers["content-security-policy"]
    assert page.headers["cache-control"] == "no-store"
    assert client.get("/docs").status_code == 404


def test_startup_failure_closes_database_connection(config, monkeypatch):
    connections = []
    initialize = Database.initialize

    def fail_after_database_opened(database):
        initialize(database)
        with database.engine.connect() as connection:
            connections.append(connection.connection.driver_connection)
        raise RuntimeError("startup failed")

    monkeypatch.setattr(Database, "initialize", fail_after_database_opened)
    with pytest.raises(RuntimeError, match="startup failed"), TestClient(create_app(config)):
        pytest.fail("startup unexpectedly succeeded")
    assert len(connections) == 1
    with pytest.raises(sqlite3.ProgrammingError, match="closed database"):
        connections[0].execute("SELECT 1")


def test_settings_defaults_and_secret_never_returned(client, app):
    assert client.get("/api/settings").json() == {
        "openai_api_key_set": True,
        "model": "gpt-4o-mini",
        "temperature": 0.2,
        "provider": "api",
        "chatgpt_model": "",
    }
    response = client.put(
        "/api/settings",
        json={
            "openai_api_key": "sk-test-new-secret",
            "model": "gpt-4o-mini-2024-07-18",
            "temperature": 0.7,
        },
    )
    assert response.status_code == 200
    assert "sk-test-new-secret" not in response.text
    assert response.json()["temperature"] == 0.7
    with app.state.database.sessions() as db:
        assert not any("sk-test-new-secret" in row.value for row in db.scalars(select(Setting)))
    key_file = app.state.settings.key_file
    assert json.loads(key_file.read_text())["openai_api_key"] == "sk-test-new-secret"
    if os.name != "nt":
        assert key_file.stat().st_mode & 0o777 == 0o600


def test_upgrade_uses_versioned_assets_instead_of_cached_old_frontend(client, app):
    page = client.get("/")
    for asset in ("app.css", "app.js"):
        url = f"/static/{asset}?v={app.version}"
        assert f'"{url}"' in page.text
        assert client.get(url).status_code == 200


def test_patch_settings_preserves_key_and_explicit_clear(client, app):
    client.put("/api/settings", json={"openai_api_key": "sk-new"})
    client.put("/api/settings", json={"temperature": 0})
    assert app.state.settings.api_key() == "sk-new"
    assert client.put("/api/settings", json={"openai_api_key": ""}).json()["openai_api_key_set"] is False
    assert app.state.settings.api_key() == ""  # Do not fall back to the environment.


@pytest.mark.parametrize(
    "patch",
    [
        {"temperature": -0.1},
        {"temperature": 2.1},
        {"model": ""},
        {"model": "bad model"},
        {"openai_api_key": "sk-secret\nnewline"},
        {"system_prompt": "override"},
    ],
)
def test_settings_validation_does_not_echo_secrets(client, patch):
    response = client.put("/api/settings", json=patch)
    assert response.status_code == 422
    assert "sk-secret" not in response.text


def test_invalid_temperature_nan_rejected(client):
    response = client.put(
        "/api/settings", content='{"temperature":NaN}', headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422


@pytest.mark.parametrize("key", ["sk-中文测试", "sk-test\x00", "sk-test\x7f", "sk-test\x1b"])
def test_bad_key_is_rejected_before_settings_are_changed(client, app, key):
    before = app.state.settings.api_key()
    response = client.put("/api/settings", json={"openai_api_key": key})
    assert response.status_code == 422
    assert key not in response.text
    assert app.state.settings.api_key() == before


def test_environment_key_error_saves_input_and_recovers_after_configuration(config):
    app = create_app(replace(config, api_key="sk-中文错误"), transport=ScriptedTransport())
    with TestClient(app, headers={"X-Relay-Client": "local"}) as client:
        sid = new_session(client)
        response = send(client, sid)
        assert response.status_code == 401 and response.json()["detail"]["code"] == "api_key_invalid"
        assert "sk-中文错误" not in response.text
        assert len(client.get(f"/api/sessions/{sid}").json()["messages"]) == 1
        assert client.put("/api/settings", json={"openai_api_key": "sk-corrected-test"}).status_code == 200
        assert client.post(f"/api/sessions/{sid}/retry").status_code == 200
        assert sum(m["role"] == "user" for m in client.get(f"/api/sessions/{sid}").json()["messages"]) == 1


def test_internal_failure_saves_safe_error_and_manual_retry_reuses_input(client, transport, caplog):
    transport.outcomes = [RuntimeError("sk-private-upstream-details"), questions_reply()]
    sid = new_session(client)
    response = send(client, sid)
    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "gpt_client_error"
    assert "sk-private-upstream-details" not in response.text + caplog.text
    detail = client.get(f"/api/sessions/{sid}").json()
    assert detail["session"]["status"] == "error" and len(detail["messages"]) == 1
    assert client.post(f"/api/sessions/{sid}/retry").status_code == 200
    assert len(transport.calls) == 2
    assert sum(m["role"] == "user" for m in client.get(f"/api/sessions/{sid}").json()["messages"]) == 1


async def test_cancelled_generation_becomes_retryable_and_does_not_duplicate_input(client, app, transport):
    started = asyncio.Event()
    transport.outcomes = [SlowReply(10, started=started)]
    sid = new_session(client)
    with app.state.database.sessions() as db:
        task = asyncio.create_task(app.state.relay.run(db, sid, content="我想做卡牌游戏"))
        await asyncio.wait_for(started.wait(), timeout=1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert task.cancelled()
        session = session_service.get_session(db, sid)
        assert session.status == "error" and "中断" in session.last_error
    transport.outcomes = [questions_reply()]
    assert client.post(f"/api/sessions/{sid}/retry").status_code == 200
    assert sum(m["role"] == "user" for m in client.get(f"/api/sessions/{sid}").json()["messages"]) == 1


def test_output_processing_failure_cannot_leave_a_processing_session(client, transport, monkeypatch):
    def broken_renderer(*_):
        raise RuntimeError("private provider content")

    transport.outcomes = [questions_reply()]
    sid = new_session(client)
    with monkeypatch.context() as patch:
        patch.setattr("app.services.relay_service.render_markdown", broken_renderer)
        response = send(client, sid)
    assert response.status_code == 500 and response.json()["detail"]["code"] == "relay_internal_error"
    detail = client.get(f"/api/sessions/{sid}").json()
    assert detail["session"]["status"] == "error"
    assert "private provider content" not in response.text + detail["session"]["last_error"]
    assert client.post(f"/api/sessions/{sid}/retry").status_code == 200


def test_create_list_view_rename_delete_and_cascade(client, app, transport):
    transport.outcomes = [full_reply()]
    sid = new_session(client, "卡牌原型")
    assert client.get("/api/sessions").json()[0]["title"] == "卡牌原型"
    assert send(client, sid).status_code == 200
    detail = client.get(f"/api/sessions/{sid}").json()
    assert len(detail["messages"]) == 2
    assert detail["session"]["status"] == "ready"
    assert detail["session"]["created_at"].endswith("Z")
    assert client.patch(f"/api/sessions/{sid}", json={"title": "游戏想法"}).json()["title"] == "游戏想法"
    assert client.delete(f"/api/sessions/{sid}").json() == {"ok": True}
    assert client.get(f"/api/sessions/{sid}").status_code == 404
    with app.state.database.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Message)) == 0
        assert db.scalar(select(func.count()).select_from(Generation)) == 0


def test_cards_need_only_section_three_and_at_most_five_questions(client):
    sid = new_session(client)
    response = send(client, sid)
    assert response.status_code == 200
    data = response.json()
    assert data["need_more_info"] is True
    assert 1 <= len(data["questions"]) <= 5
    assert data["message"]["content"].startswith("## 3. 需要确认的问题\n")
    assert "## 1." not in data["output_markdown"]
    assert "## 4." not in data["output_markdown"]
    assert data["generation_id"] is None


def test_force_defaults_phrase_and_continued_revisions(client, transport):
    transport.outcomes = [questions_reply(), full_reply(), full_reply()]
    sid = new_session(client)
    send(client, sid)
    response = send(client, sid, "使用默认假设，我需要结果")
    data = response.json()
    assert response.status_code == 200
    assert data["need_more_info"] is False
    assert data["generation_id"] is not None
    for number in range(1, 8):
        assert f"## {number}. " in data["output_markdown"]
    assert "假设" in data["output_markdown"]
    response = send(client, sid, "把玩家人数改为 2 人")
    assert response.status_code == 200
    assert "必须使用默认假设" in transport.calls[-1]["messages"][1]["content"]


def test_generate_endpoint_uses_existing_idea_without_duplicate_input(client, transport):
    transport.outcomes = [questions_reply(), full_reply()]
    sid = new_session(client)
    send(client, sid)
    response = client.post(f"/api/sessions/{sid}/generate", json={"use_default_assumptions": True})
    assert response.status_code == 200
    assert response.json()["generation_id"] > 0
    messages = client.get(f"/api/sessions/{sid}").json()["messages"]
    assert sum(m["role"] == "user" for m in messages) == 1


def test_user_can_leave_defaults_mode_and_explicit_false_is_respected(client, transport):
    transport.outcomes = [full_reply(), questions_reply(), full_reply(), questions_reply()]
    sid = new_session(client)
    assert send(client, sid, "我想做卡牌游戏，使用默认假设").status_code == 200
    result = send(client, sid, "不要使用默认假设，先确认信息")
    assert result.status_code == 200 and result.json()["need_more_info"] is True
    assert client.get(f"/api/sessions/{sid}").json()["session"]["use_default_assumptions"] is False
    assert (
        client.post(f"/api/sessions/{sid}/generate", json={"use_default_assumptions": True}).status_code
        == 200
    )
    result = client.post(f"/api/sessions/{sid}/generate", json={"use_default_assumptions": False})
    assert result.status_code == 409
    assert client.get(f"/api/sessions/{sid}").json()["session"]["use_default_assumptions"] is False


def test_retry_preserves_explicit_generate_mode(client, transport):
    transport.outcomes = [full_reply(), "invalid", "invalid", "invalid", questions_reply()]
    sid = new_session(client)
    assert send(client, sid, "我想做卡牌游戏，我需要结果").status_code == 200
    assert (
        client.post(f"/api/sessions/{sid}/generate", json={"use_default_assumptions": False}).status_code
        == 502
    )
    response = client.post(f"/api/sessions/{sid}/retry")
    assert response.status_code == 200 and response.json()["need_more_info"] is True
    assert "本轮检查信息是否足够" in transport.calls[-1]["messages"][1]["content"]


def test_negation_leaves_defaults_and_quoted_labels_do_not_reenable_it(client, transport):
    transport.outcomes = [full_reply(), questions_reply(), questions_reply(), full_reply()]
    sid = new_session(client)
    assert send(client, sid, "我想做卡牌游戏，使用默认假设").status_code == 200
    assert send(client, sid, "不使用默认假设，先确认信息").json()["need_more_info"] is True
    result = send(client, sid, "界面里有个按钮叫“使用默认假设，我需要结果”")
    assert result.status_code == 200 and result.json()["need_more_info"] is True
    assert client.get(f"/api/sessions/{sid}").json()["session"]["use_default_assumptions"] is False
    assert "本轮检查信息是否足够" in transport.calls[-1]["messages"][1]["content"]
    assert send(client, sid, "使用默认假设，我需要结果").json()["need_more_info"] is False


@pytest.mark.parametrize("content", ["不要使用默认假设", "取消默认假设模式", "我不需要结果，先问问题"])
def test_cancel_command_alone_does_not_invent_a_project(client, transport, content):
    sid = new_session(client)
    assert send(client, sid, content).status_code == 400
    assert not transport.calls


def test_answered_questions_can_generate_without_defaults(client, transport):
    transport.outcomes = [questions_reply(), full_reply()]
    sid = new_session(client)
    assert send(client, sid).json()["need_more_info"] is True
    answer = "平台是本机浏览器。玩法是单人抽牌和出牌。第一版实现回合循环、胜负判定和重开。"
    result = send(client, sid, answer)
    assert result.status_code == 200 and result.json()["need_more_info"] is False
    assert "## 7. 自检" in result.json()["output_markdown"]
    context = json.loads(transport.calls[-1]["messages"][2]["content"])
    assert context["user_messages"] == ["我想做卡牌游戏", answer]
    assert context["last_output"].startswith("## 3. 需要确认的问题")
    assert client.get(f"/api/sessions/{sid}").json()["session"]["use_default_assumptions"] is False


def test_empty_generate_does_not_invent_a_project(client, transport):
    sid = new_session(client)
    assert (
        client.post(f"/api/sessions/{sid}/generate", json={"use_default_assumptions": True}).status_code
        == 400
    )
    assert not transport.calls
    assert send(client, sid, "使用默认假设，我需要结果").status_code == 400
    assert not transport.calls


def test_missing_key_saves_input_and_retry_reuses_it(config):
    transport = ScriptedTransport()
    app = create_app(replace(config, api_key=""), transport=transport)
    with TestClient(app, headers={"X-Relay-Client": "local"}) as client:
        sid = new_session(client)
        response = send(client, sid)
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "api_key_missing"
        assert not transport.calls
        assert len(client.get(f"/api/sessions/{sid}").json()["messages"]) == 1
        client.put("/api/settings", json={"openai_api_key": "sk-new"})
        assert client.post(f"/api/sessions/{sid}/retry").status_code == 200
        messages = client.get(f"/api/sessions/{sid}").json()["messages"]
        assert len(messages) == 2
        assert sum(m["role"] == "user" for m in messages) == 1
        assert client.post(f"/api/sessions/{sid}/retry").status_code == 409


def test_format_failure_retries_twice_and_is_persisted(client, transport):
    transport.outcomes = ["not json"]
    sid = new_session(client)
    response = send(client, sid)
    assert response.status_code == 502
    assert response.json()["detail"]["attempts"] == 3
    assert len(transport.calls) == 3
    detail = client.get(f"/api/sessions/{sid}").json()
    assert detail["session"]["status"] == "error"
    assert len(detail["messages"]) == 1
    assert "自动重试 2 次" in detail["session"]["last_error"]


def test_export_exactly_matches_latest_or_selected_output(client, transport):
    transport.outcomes = [questions_reply(), full_reply()]
    sid = new_session(client)
    first = send(client, sid).json()["message"]
    second = send(client, sid, "使用默认假设，我需要结果").json()["message"]
    export = client.get(f"/api/sessions/{sid}/export")
    assert export.text == second["content"]
    assert export.content == second["content"].encode("utf-8")
    assert "text/markdown" in export.headers["content-type"]
    assert ".md" in export.headers["content-disposition"]
    assert client.get(f"/api/sessions/{sid}/export?message_id={first['id']}").text == first["content"]
    other = new_session(client)
    assert client.get(f"/api/sessions/{other}/export?message_id={first['id']}").status_code == 404


def test_markdown_api_results_keep_exact_trailing_newline(client, transport):
    transport.outcomes = [full_reply()]
    sid = new_session(client)
    result = send(client, sid).json()
    assert result["output_markdown"].endswith("\n")
    assert result["output_markdown"] == result["message"]["content"]
    generated = client.post(f"/api/sessions/{sid}/generate", json={"use_default_assumptions": True}).json()
    assert generated["output_markdown"] == generated["message"]["content"]
    assert client.get(f"/api/sessions/{sid}/export").text == generated["output_markdown"]


def test_refresh_and_process_restart_preserve_history_and_settings(config):
    transport = ScriptedTransport([full_reply()])
    with TestClient(create_app(config, transport=transport), headers={"X-Relay-Client": "local"}) as first:
        sid = new_session(first)
        markdown = send(first, sid).json()["output_markdown"]
        first.put("/api/settings", json={"temperature": 0.9, "openai_api_key": "sk-persisted"})
    with TestClient(create_app(config, transport=transport), headers={"X-Relay-Client": "local"}) as second:
        assert second.get(f"/api/sessions/{sid}/export").text == markdown
        assert len(second.get(f"/api/sessions/{sid}").json()["messages"]) == 2
        assert second.get("/api/settings").json()["temperature"] == 0.9
        assert second.app.state.settings.api_key() == "sk-persisted"


def test_failed_planning_check_saves_input_but_never_publishes_invalid_report(client, app, transport):
    bad = full_reply()
    bad["report"]["planning"]["tasks"][0]["depends_on"] = ["T1"]
    transport.outcomes = [bad]
    sid = new_session(client)
    response = send(client, sid, "我想做卡牌游戏，我需要结果")
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "gpt_format_error"
    assert len(transport.calls) == 3
    messages = client.get(f"/api/sessions/{sid}").json()["messages"]
    assert len(messages) == 1 and messages[0]["role"] == "user"
    assert client.get(f"/api/sessions/{sid}/export").status_code == 404
    with app.state.database.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Generation)) == 0
    transport.outcomes = [full_reply()]
    response = client.post(f"/api/sessions/{sid}/retry")
    assert response.status_code == 200
    assert "程序已执行的结构检查" in response.json()["output_markdown"]
    messages = client.get(f"/api/sessions/{sid}").json()["messages"]
    assert len(messages) == 2 and sum(message["role"] == "user" for message in messages) == 1


def test_old_markdown_history_can_still_be_viewed_and_exported_after_schema_upgrade(client, app, transport):
    sid = new_session(client)
    legacy = "## 1. 我理解的想法\n\n旧版的完整输出原文。\n"
    with app.state.database.sessions() as db:
        message = Message(session_id=sid, role="assistant", kind="report", content=legacy)
        db.add(message)
        db.commit()
        mid = message.id
    assert client.get(f"/api/sessions/{sid}").json()["messages"][0]["content"] == legacy
    assert client.get(f"/api/sessions/{sid}/export?message_id={mid}").content == legacy.encode("utf-8")
    transport.outcomes = [full_reply()]
    assert send(client, sid, "我想做卡牌游戏，我需要结果").status_code == 200
    assert client.get(f"/api/sessions/{sid}/export?message_id={mid}").content == legacy.encode("utf-8")


@pytest.mark.parametrize("content", ["", "   ", "x" * 20001])
def test_invalid_messages_do_not_save_or_call_gpt(client, transport, content):
    sid = new_session(client)
    assert send(client, sid, content).status_code == 422
    assert client.get(f"/api/sessions/{sid}").json()["messages"] == []
    assert not transport.calls


def test_unknown_session_and_empty_export(client):
    assert send(client, 999).status_code == 404
    assert client.delete("/api/sessions/999").status_code == 404
    sid = new_session(client)
    assert client.get(f"/api/sessions/{sid}/export").status_code == 404


def test_cross_origin_and_missing_custom_header_blocked(client):
    assert (
        client.post("/api/sessions", json={}, headers={"Origin": "https://other.example"}).status_code == 403
    )
    assert client.post("/api/sessions", json={}, headers={"Origin": "http://testserver"}).status_code == 201
    assert client.post("/api/sessions", json={}, headers={"Origin": "null"}).status_code == 403
    with TestClient(client.app) as anonymous:
        assert anonymous.post("/api/sessions", json={}).status_code == 403
    assert client.get("/health", headers={"Host": "attacker.example"}).status_code == 400


def test_request_body_size_limit(client):
    assert client.post("/api/sessions", content="x" * 100001).status_code == 413


def test_jinja_history_escapes_untrusted_titles(client):
    new_session(client, "<img src=x onerror=alert(1)>")
    page = client.get("/ui/sessions").text
    assert "<img src=x" not in page
    assert "&lt;img" in page


def test_busy_rejects_concurrent_mutations_but_reads_work(client, transport):
    started = Event()
    transport.outcomes = [SlowReply(0.3, questions_reply(), started)]
    sid = new_session(client)
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(send, client, sid)
        assert started.wait(2)
        assert client.get(f"/api/sessions/{sid}").status_code == 200
        assert client.put("/api/settings", json={"temperature": 1}).status_code == 409
        assert send(client, sid, "第二条").status_code == 409
        assert client.delete(f"/api/sessions/{sid}").status_code == 409
        assert pending.result(timeout=3).status_code == 200
    assert sum(m["role"] == "user" for m in client.get(f"/api/sessions/{sid}").json()["messages"]) == 1


def test_interrupted_request_recovered_on_restart(config):
    with TestClient(create_app(config), headers={"X-Relay-Client": "local"}) as client:
        sid = new_session(client)
        with client.app.state.database.sessions() as db:
            from app.models import Session

            db.get(Session, sid).status = "processing"
            db.commit()
    with TestClient(create_app(config), headers={"X-Relay-Client": "local"}) as client:
        session = client.get(f"/api/sessions/{sid}").json()["session"]
        assert session["status"] == "error"
        assert "被中断" in session["last_error"]
