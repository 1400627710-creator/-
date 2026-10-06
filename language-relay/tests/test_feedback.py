"""Reports locate failed operations without exporting input or provider text."""
import ast
import json
import sys
from pathlib import Path

import httpx2
import pytest
from fastapi.testclient import TestClient
from openai import APIConnectionError, AuthenticationError, PermissionDeniedError, RateLimitError
from sqlalchemy.exc import SQLAlchemyError

import bootstrap
from app.main import create_app
from app.services import session_service
from diagnose import (
    LOCAL_CODES,
    REGION_PROVIDER_CODE,
    clean_operations,
    make_report,
    read_json,
    record_operation,
    standalone_report,
)
from tests.fakes import ScriptedTransport, full_reply
from tests.test_connection import Probe

HEADERS = {"X-Relay-Client": "local"}
PRIVATE = "private-provider-body-and-user-input"


def regional_report(*, provider="chatgpt", operations=(), pending=False):
    first = {"stage": "token_exchange", "outcome": "error", "elapsed_ms": 15000,
             "http_status": 403, "provider_code": REGION_PROVIDER_CODE, "body_shape": "json_error_object"}
    return make_report(app_version="1.2.1", environment={"python_supported": True, "python_version": "3.14.8"},
                       local={"data_directory_writable": True, "server_reachable": True},
                       auth={"selected_provider": provider, "api_key_configured": provider == "api", "connected": False,
                             "result_code": "chatgpt_auth_forbidden", "result_ok": False, "pending": pending},
                       trace={"started_at": "2026-10-06T10:00:00+00:00", "first_failure": None if pending else first,
                              "events": [] if pending else [first, {"stage": "token_exchange", "outcome": "error", "elapsed_ms": 15002, "code": "chatgpt_auth_forbidden"}]},
                       operations=list(operations))


@pytest.mark.parametrize("provider", [None, "api"])
@pytest.mark.parametrize("at", ["2026-10-06T09:57:00+00:00", "2026-10-06T10:01:00+00:00", None])
def test_known_region_failure_is_primary_over_api_key_error_from_another_mode(provider, at):
    data = regional_report(operations=[{"operation": "generation", "stage": "connection_settings", "outcome": "error",
                                       "code": "api_key_missing", "provider": provider, "at": at}])
    feedback = data["feedback"]
    assert feedback["problem_stage"] == "token_exchange" and feedback["diagnostic_code"] == "region_not_supported"
    assert feedback["error_code"] == "chatgpt_auth_forbidden"  # Keep the code actually recorded by 1.2.1.
    assert feedback["evidence"] == {"http_status": 403, "provider_code": REGION_PROVIDER_CODE}
    assert "国家、地区" in feedback["confirmed"] and "未知" not in feedback["confirmed"]
    old = next(f for f in data["findings"] if f["code"] == "api_key_missing")
    assert old["level"] == "info" and old["context"] == "other_provider"
    assert "历史错误" in old["message"] and len(data["operations"]) == 1


def test_generation_after_denied_login_reports_the_original_cause():
    data = regional_report(operations=[{"operation": "generation", "stage": "model_inference", "outcome": "error",
                                       "code": "chatgpt_login_required", "provider": "chatgpt", "at": "2026-10-06T10:01:00+00:00"}])
    assert data["feedback"]["problem_stage"] == "token_exchange"
    assert data["feedback"]["evidence"]["provider_code"] == REGION_PROVIDER_CODE
    assert data["findings"][-1]["context"] == "blocked_by_authorization"


def test_pending_login_does_not_report_an_older_generation_as_the_current_failure():
    data = regional_report(pending=True, operations=[{"operation": "generation", "stage": "output_validation", "outcome": "error",
                                                     "code": "gpt_format_error", "provider": "chatgpt", "at": "2026-10-06T09:57:00+00:00"}])
    assert data["feedback"]["problem_stage"] == "callback"
    assert data["findings"][-1]["context"] == "earlier_authorization"


def test_switching_to_api_does_not_make_the_previous_chatgpt_failure_primary():
    data = regional_report(provider="api", operations=[{"operation": "connection", "stage": "model_inference", "outcome": "error",
                                                        "code": "api_region_unsupported", "provider": "api", "http_status": 403,
                                                        "provider_code": REGION_PROVIDER_CODE, "at": "2026-10-06T10:02:00+00:00"}])
    assert data["feedback"]["problem_stage"] == "model_inference"
    assert data["feedback"]["error_code"] == "api_region_unsupported"
    assert data["feedback"]["evidence"] == {"http_status": 403, "provider_code": REGION_PROVIDER_CODE}
    assert data["findings"][0]["level"] == "info" and data["findings"][0]["context"] == "other_provider"


def test_operation_priority_uses_timestamps_and_latest_success_removes_failure():
    newer = {"operation": "settings", "stage": "input_validation", "outcome": "error", "code": "invalid_input", "at": "2026-10-06T10:02:00+00:00"}
    older = {"operation": "installation", "stage": "dependency_install", "outcome": "error", "code": "startup_install_failed", "at": "2026-10-06T09:00:00+00:00"}
    assert regional_report(provider="api", operations=[newer, older])["feedback"]["error_code"] == "invalid_input"
    success = {**newer, "outcome": "ok", "at": "2026-10-06T10:03:00+00:00"}
    assert clean_operations([success, newer]) == [success]


@pytest.mark.parametrize("poison", [{"secret": PRIVATE}, PRIVATE, [PRIVATE]])
def test_operation_provider_and_timestamp_are_allowlisted(poison):
    clean = clean_operations([{"operation": "generation", "stage": "model_inference", "outcome": "error", "code": "gpt_failed",
                               "provider": poison, "at": "2026-99-99T10:00:00+00:00", "secret": PRIVATE}])
    assert len(clean) == 1 and "provider" not in clean[0] and "at" not in clean[0]
    assert PRIVATE not in json.dumps(clean)


@pytest.mark.parametrize("operation", ["connection", "generation"])
def test_api_region_denial_preserves_upstream_evidence_without_retrying_or_leaking(config, operation):
    request = httpx2.Request("POST", "https://api.openai.com/v1/chat/completions")
    body = {"error": {"code": REGION_PROVIDER_CODE, "message": PRIVATE}}
    response = httpx2.Response(403, request=request, json=body, headers={"x-request-id": "req_0123456789abcdef"})
    error = PermissionDeniedError(PRIVATE, response=response, body=body)
    transport, probe = ScriptedTransport([error]), Probe(error)
    with TestClient(create_app(config, transport=transport, connection_transport=probe), headers=HEADERS) as client:
        if operation == "connection":
            result = client.post("/api/settings/test-connection")
            assert len(probe.calls) == 1
        else:
            sid = client.post("/api/sessions", json={}).json()["id"]
            result = client.post(f"/api/sessions/{sid}/messages", json={"content": "我想做卡牌游戏，使用默认假设"})
            assert len(transport.calls) == 1
        assert result.json()["detail"]["code"] == "api_region_unsupported"
        data = report(client)
        event = next(e for e in data["operations"] if e["operation"] == operation)
        assert event["provider"] == "api" and event["provider_code"] == REGION_PROVIDER_CODE
        assert data["feedback"]["evidence"] == {"http_status": 403, "provider_code": REGION_PROVIDER_CODE, "request_id": "req_0123456789abcdef"}


def report(client):
    response = client.post("/api/diagnostics/run", json={"check_network": False})
    assert response.status_code == 200
    result = response.json()
    assert client.get("/api/diagnostics/export").json() == result
    assert PRIVATE not in json.dumps(result)
    return result


@pytest.mark.parametrize("kind,code,stage", [
    ("network", "connection_network_error", "model_inference"),
    ("invalid", "api_key_invalid", "connection_settings"),
    ("quota", "api_quota_exhausted", "model_inference"),
])
def test_api_import_failure_is_located_and_survives_restart(config, kind, code, stage):
    request = httpx2.Request("POST", "https://api.openai.com/v1/chat/completions")
    errors = {
        "network": APIConnectionError(request=request),
        "invalid": AuthenticationError(PRIVATE, response=httpx2.Response(401, request=request), body={}),
        "quota": RateLimitError(PRIVATE, response=httpx2.Response(429, request=request), body={"error": {"code": "insufficient_quota"}}),
    }
    probe = Probe(errors[kind])
    with TestClient(create_app(config, connection_transport=probe), headers=HEADERS) as client:
        assert not client.post("/api/settings/import-key", json={"content": "sk-feedback-fixture"}).json()["connection"]["ok"]
        data = report(client)
        assert data["feedback"]["problem_stage"] == stage
        assert data["feedback"]["error_code"] == code
        assert len(probe.calls) == 1  # Running/exporting diagnostics does not call the model.
    with TestClient(create_app(config, connection_transport=probe), headers=HEADERS) as client:
        assert report(client)["feedback"]["error_code"] == code
        probe.error = None
        assert client.post("/api/settings/test-connection").json()["ok"]
        assert not [e for e in report(client)["operations"] if e["operation"] == "connection" and e["outcome"] == "error"]


def test_bad_generation_format_is_not_misdiagnosed_as_login(config):
    transport = ScriptedTransport([{}, {}, {}, full_reply()])
    with TestClient(create_app(config, transport=transport), headers=HEADERS) as client:
        sid = client.post("/api/sessions", json={}).json()["id"]
        response = client.post(f"/api/sessions/{sid}/messages", json={"content": "我想做卡牌游戏，使用默认假设，我需要结果"})
        assert response.json()["detail"]["code"] == "gpt_format_error"
        assert report(client)["feedback"]["problem_stage"] == "output_validation"
        assert len(transport.calls) == 3
        assert client.post(f"/api/sessions/{sid}/retry").status_code == 200
        data = report(client)
        assert not [e for e in data["operations"] if e["operation"] == "generation" and e["outcome"] == "error"]


def test_invalid_settings_can_be_reported_without_the_bad_value(config):
    with TestClient(create_app(config), headers=HEADERS) as client:
        assert client.put("/api/settings", json={"temperature": PRIVATE}).status_code == 422
        assert report(client)["feedback"]["problem_stage"] == "input_validation"
        assert client.put("/api/settings", json={"temperature": 0.2}).status_code == 200
        assert not [e for e in report(client)["operations"] if e["operation"] == "settings" and e["outcome"] == "error"]


def test_storage_failure_is_safe_and_points_to_history(config, monkeypatch):
    def fail(_db):
        raise SQLAlchemyError(PRIVATE)
    monkeypatch.setattr(session_service, "list_sessions", fail)
    with TestClient(create_app(config), headers=HEADERS) as client:
        response = client.get("/api/sessions")
        assert response.status_code == 500 and PRIVATE not in response.text
        assert report(client)["feedback"]["problem_stage"] == "history_storage"


@pytest.mark.parametrize("stage", ["python_environment", "dependency_install", "dependency_validation"])
def test_install_failure_can_be_reported_without_dependencies(tmp_path, monkeypatch, stage):
    installer = bootstrap.Installer(tmp_path)
    def fail():
        installer.stage = stage
        raise bootstrap.InstallError(PRIVATE)
    monkeypatch.setattr(installer, "install", fail)
    monkeypatch.setattr(bootstrap, "Installer", lambda: installer)
    monkeypatch.setattr(bootstrap, "ROOT", tmp_path)
    monkeypatch.setattr(sys, "argv", ["bootstrap.py"])
    assert bootstrap.main() == 1
    import diagnose
    monkeypatch.setattr(diagnose, "discover_server", lambda _port: (None, {}))
    data = standalone_report(tmp_path, offline=True)
    assert data["feedback"]["problem_stage"] == stage
    assert data["feedback"]["error_code"] == "startup_install_failed"
    assert PRIVATE not in json.dumps(data)


def test_export_failure_has_its_own_stage(config):
    with TestClient(create_app(config), headers=HEADERS) as client:
        sid = client.post("/api/sessions", json={}).json()["id"]
        assert client.get(f"/api/sessions/{sid}/export").status_code == 404
        assert report(client)["feedback"]["problem_stage"] == "markdown_export"


@pytest.mark.parametrize("poison", [{"operation": []}, {"operation": {"secret": PRIVATE}}, None])
def test_operation_files_cannot_inject_private_values(config, poison):
    record_operation(config.data_dir, "connection", "model_inference", "error", "connection_network_error",
                     {"message": PRIVATE, "request_id": PRIVATE, "http_status": 502})
    data = read_json(config.data_dir / "operation-results.json")
    clean = clean_operations([*data, poison])
    assert len(clean) == 1 and clean[0]["http_status"] == 502
    assert PRIVATE not in json.dumps(clean)


@pytest.mark.parametrize("status,code", [(500, "diagnostic_write_failed"), (403, "client_header_required")])
def test_standalone_returns_report_even_when_page_selfcheck_fails(tmp_path, monkeypatch, status, code):
    import diagnose
    monkeypatch.setattr(diagnose, "discover_server", lambda _port: (8123, {}))
    body = json.dumps({"detail": {"code": code, "message": PRIVATE}}).encode()
    monkeypatch.setattr(diagnose, "get_bytes", lambda *a, **k: (status, {}, body))
    data = standalone_report(tmp_path, offline=True)
    assert data["feedback"]["problem_stage"] == "diagnostic_report"
    assert data["feedback"]["error_code"] == code
    assert not data["local"]["legacy_app"]
    assert PRIVATE not in json.dumps(data)


def test_malformed_selfcheck_response_falls_back_without_copying_body(tmp_path, monkeypatch):
    import diagnose
    monkeypatch.setattr(diagnose, "discover_server", lambda _port: (8123, {}))
    monkeypatch.setattr(diagnose, "get_bytes", lambda *a, **k: (200, {}, PRIVATE.encode()))
    data = standalone_report(tmp_path, offline=True)
    assert data["feedback"]["error_code"] == "diagnostic_unreachable"
    assert PRIVATE not in json.dumps(data)


def test_all_local_application_error_codes_can_be_returned_in_feedback():
    codes = set()
    for path in (Path(__file__).resolve().parents[1] / "app").rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "RelayError" and node.args:
                code = node.args[0]
                if isinstance(code, ast.Constant) and isinstance(code.value, str):
                    codes.add(code.value)
    assert codes <= LOCAL_CODES  # Local symbolic codes are safe; upstream strings stay allowlisted.
