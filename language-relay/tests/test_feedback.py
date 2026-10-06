"""Reports locate failed operations without exporting input or provider text."""
import ast
import json
import sys
from pathlib import Path

import httpx2
import pytest
from fastapi.testclient import TestClient
from openai import APIConnectionError, AuthenticationError, RateLimitError
from sqlalchemy.exc import SQLAlchemyError

import bootstrap
from app.main import create_app
from app.services import session_service
from diagnose import LOCAL_CODES, clean_operations, read_json, record_operation, standalone_report
from tests.fakes import ScriptedTransport, full_reply
from tests.test_connection import Probe

HEADERS = {"X-Relay-Client": "local"}
PRIVATE = "private-provider-body-and-user-input"


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
