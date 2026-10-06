import asyncio
import json
import socket
import ssl
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event
from urllib.parse import parse_qs, urlsplit

import httpx2
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

import diagnose
from app.main import create_app
from app.services.chatgpt_auth import DISCOVERY, JWKS, TOKEN, ChatGPTAuth, write_private_json
from tests.fakes import ScriptedTransport
from tests.test_connection import OAuthServer, Probe

REQUEST_ID = "req_0123456789abcdef0123456789abcdef"
SECRET = "sk-do-not-export-diagnostic-secret"


@pytest.fixture(scope="module")
def signing_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


class DeniedServer(OAuthServer):
    def __init__(self, key, endpoint=TOKEN, status=403, content=None, provider_code=None):
        super().__init__(key)
        self.endpoint, self.denial_status, self.content, self.provider_code = endpoint, status, content, provider_code

    def handler(self, request):
        if str(request.url) == self.endpoint:
            self.calls.append(request)
            if self.content is not None:
                return httpx2.Response(self.denial_status, content=self.content, headers={"content-type": "text/html", "x-request-id": REQUEST_ID, "location": "https://attacker.invalid/" + SECRET})
            return httpx2.Response(self.denial_status, json={"error": {"code": self.provider_code or "not_a_known_error_" + SECRET, "message": SECRET}, "detail": SECRET}, headers={"x-request-id": REQUEST_ID})
        return super().handler(request)


def start_and_return(client, server):
    started = client.post("/api/auth/chatgpt/start").json()
    params = parse_qs(urlsplit(started["authorization_url"]).query)
    server.nonce = params["nonce"][0]
    response = client.get("/auth/callback", params={"state": params["state"][0], "code": "one-time-secret-code", "client_id": "oaiapp_test"}, follow_redirects=False)
    assert response.status_code == 303 and response.headers["location"] == "/?chatgpt_login=finished"
    return params


def assert_private(report, *extra):
    text = json.dumps(report, ensure_ascii=False)
    for secret in (SECRET, "private@example.test", "test-subject", "oaiapp_test", "urn:uuid:", "one-time-secret-code", "oauth-test-access", "oauth-test-refresh", "sk-local-test-key", "Bearer ", "eyJ", *extra):
        assert secret not in text
    assert not report["network"]["model_inference_performed"]
    assert not report["privacy"]["automatic_upload"]


@pytest.mark.parametrize("endpoint,stage", [(TOKEN, "token_exchange"), (DISCOVERY, "discovery"), (JWKS, "jwks")])
def test_403_stage_root_cause_survives_refresh_report_and_restart(config, signing_key, endpoint, stage):
    server = DeniedServer(signing_key, endpoint, provider_code="invalid_client")
    app = create_app(config, auth_http_factory=server.factory, connection_transport=Probe())
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        params = start_and_return(client, server)
        status = client.get("/api/auth/chatgpt/status").json()
        assert not status["connected"] and not status["signed_in"]
        assert status["result"]["code"] == "chatgpt_client_rejected"
        before = len(server.calls)
        refresh = client.post("/api/auth/chatgpt/models")
        assert refresh.status_code == 401
        assert "上次授权未完成" in refresh.text and "客户端注册" in refresh.text and "刷新模型不能完成授权" in refresh.text
        assert len(server.calls) == before
        report = client.post("/api/diagnostics/run", json={"check_network": False}).json()
        first = report["login_trace"]["first_failure"]
        assert first["stage"] == stage and first["http_status"] == 403
        assert first["provider_code"] == "invalid_client" and first["request_id"] == REQUEST_ID
        assert report["findings"][0]["code"] == "client_registration_rejected"
        assert_private(report, params["state"][0], params["nonce"][0], str(config.data_dir))
        assert client.get("/api/diagnostics/export").json() == report
    restored = ChatGPTAuth(config, server.factory)
    assert restored.trace.snapshot()["first_failure"] == first
    assert restored.status()["result"]["code"] == "chatgpt_client_rejected"
    assert not restored.status()["connected"]
    next_start = parse_qs(urlsplit(restored.start("http://127.0.0.1:8123")["authorization_url"]).query)
    assert next_start["client_id"] == ["oaiapp_test"]  # registration retained, no false login


@pytest.mark.parametrize("provider,app_code,finding", [
    ("subscription_sharing_user_not_eligible", "chatgpt_not_eligible", "plan_not_eligible"),
    ("chatpass_v2_scope_not_authorized", "chatgpt_scope_rejected", "plan_scope_missing"),
    ("unrecognized_private_code_" + SECRET, "chatgpt_auth_forbidden", "authorization_forbidden_unknown"),
])
def test_403_classification_requires_exact_known_provider_code(config, signing_key, provider, app_code, finding):
    server = DeniedServer(signing_key, provider_code=provider)
    app = create_app(config, auth_http_factory=server.factory)
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        start_and_return(client, server)
        assert client.get("/api/auth/chatgpt/status").json()["result"]["code"] == app_code
        report = client.post("/api/diagnostics/run", json={"check_network": False}).json()
        assert report["findings"][0]["code"] == finding
        assert report["feedback"]["error_code"] == app_code
        assert report["feedback"]["diagnostic_code"] == finding
        assert report["feedback"]["evidence"]["provider_code"] == report["login_trace"]["first_failure"]["provider_code"]
        assert report["feedback"]["evidence"]["http_status"] == 403
        assert_private(report)


@pytest.mark.parametrize("status,content,app_code", [(403, b"<html>" + SECRET.encode() + b"</html>", "chatgpt_auth_gateway"), (200, SECRET.encode(), "chatgpt_auth_response_invalid"), (302, b"", "chatgpt_auth_redirect")])
def test_non_json_and_redirect_do_not_become_eligibility_or_leak_body(config, signing_key, status, content, app_code):
    server = DeniedServer(signing_key, status=status, content=content)
    app = create_app(config, auth_http_factory=server.factory)
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        start_and_return(client, server)
        assert client.get("/api/auth/chatgpt/status").json()["result"]["code"] == app_code
        report = client.post("/api/diagnostics/run", json={"check_network": False}).json()
        assert report["login_trace"]["first_failure"]["http_status"] == status
        assert_private(report)
        assert all(urlsplit(str(call.url)).hostname == "auth.openai.com" for call in server.calls)


def test_network_report_reads_catalog_without_refresh_generation_or_mutation(config, signing_key):
    server = OAuthServer(signing_key)
    transport, probe = ScriptedTransport(), Probe()
    app = create_app(config, transport=transport, auth_http_factory=server.factory, connection_transport=probe)
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        start_and_return(client, server)
        before = app.state.chatgpt_auth.path.read_bytes()
        trace = app.state.chatgpt_auth.trace.snapshot()
        first_call = len(server.calls)
        report = client.post("/api/diagnostics/run", json={"check_network": True}).json()
        calls = server.calls[first_call:]
        assert {str(call.url) for call in calls} == {DISCOVERY, JWKS, "https://api.openai.com/v1/models"}
        assert all(call.method == "GET" for call in calls)
        assert report["authorization"]["connected"]
        assert all(item["outcome"] == "ok" for item in report["network"]["probes"])
        assert next(p for p in report["network"]["probes"] if p["stage"] == "model_permission")["visible_models_count"] == 1
        assert before == app.state.chatgpt_auth.path.read_bytes()
        assert trace == app.state.chatgpt_auth.trace.snapshot()
        assert not transport.calls and not probe.calls
        assert not client.get("/api/sessions").json()
        assert_private(report)


@pytest.mark.parametrize("identity_only,expired", [(True, False), (False, True)])
def test_diagnostic_skips_model_probe_without_current_plan_token(config, signing_key, identity_only, expired):
    server = OAuthServer(signing_key)
    if identity_only:
        server.scopes = "openid profile email"
    app = create_app(config, auth_http_factory=server.factory)
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        start_and_return(client, server)
        if expired:
            record = app.state.chatgpt_auth.read()
            record["expires_at"] = 1
            write_private_json(app.state.chatgpt_auth.path, record)
        first_call = len(server.calls)
        before = app.state.chatgpt_auth.path.read_bytes()
        report = client.post("/api/diagnostics/run", json={"check_network": True}).json()
        assert next(item for item in report["network"]["probes"] if item["stage"] == "model_permission")["outcome"] == "skipped"
        assert all(str(call.url) in {DISCOVERY, JWKS} for call in server.calls[first_call:])
        assert before == app.state.chatgpt_auth.path.read_bytes()
        assert_private(report)


def test_offline_report_makes_no_network_calls_and_preserves_legacy_cause(config, signing_key):
    server = OAuthServer(signing_key)
    write_private_json(config.data_dir / "chatgpt-login-result.json", {"ok": False, "code": "chatgpt_not_eligible", "message": "此账户、地区或工作区目前无法授权本应用使用 ChatGPT 计划。"})
    app = create_app(config, auth_http_factory=server.factory)
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        report = client.post("/api/diagnostics/run", json={"check_network": False}).json()
        assert report["findings"][0]["code"] == "legacy_403_details_missing"
        assert not server.calls
        assert report["network"]["probes"] == []


@pytest.mark.parametrize("error,expected", [(socket.gaierror("secret DNS host"), "dns_failure"), (ssl.SSLCertVerificationError("secret certificate body"), "tls_failure"), (TimeoutError("secret URL"), "network_timeout")])
def test_transport_error_types_without_private_error_text(config, error, expected):
    def handler(request):
        raise httpx2.ConnectError(SECRET, request=request) from error
    app = create_app(config, auth_http_factory=lambda: httpx2.AsyncClient(transport=httpx2.MockTransport(handler)))
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        report = client.post("/api/diagnostics/run", json={"check_network": True}).json()
        failures = [p for p in report["network"]["probes"] if p["outcome"] == "error"]
        assert len(failures) == 2 and all(p["code"] == expected for p in failures)
        assert_private(report, str(error))


def test_diagnostic_endpoints_are_local_guarded_and_disk_export_sanitized(config):
    app = create_app(config)
    with TestClient(app) as client:
        assert client.post("/api/diagnostics/run", json={"check_network": False}).status_code == 403
        assert client.get("/api/diagnostics/export").status_code == 404
        assert client.post("/api/diagnostics/run", json={"check_network": False}, headers={"X-Relay-Client": "local", "Origin": "https://attacker.invalid"}).status_code == 403
        assert client.post("/api/diagnostics/run", json={"check_network": False, "secret": SECRET}, headers={"X-Relay-Client": "local"}).status_code == 422
        report = client.post("/api/diagnostics/run", json={"check_network": False}, headers={"X-Relay-Client": "local"}).json()
        report["raw_token"] = SECRET
        report["environment"]["proxy_address"] = SECRET
        report["login_trace"]["events"] = [{"stage": [SECRET], "outcome": "error", "raw_response": SECRET, "provider_code": SECRET, "request_id": SECRET}]
        write_private_json(app.state.diagnostics.path, report)
        exported = client.get("/api/diagnostics/export")
        assert exported.status_code == 200 and SECRET not in exported.text


def test_standalone_runs_without_site_packages_and_exports_only_flags(tmp_path):
    project = tmp_path / "private-user-folder"
    data_dir = project / ".data"
    data_dir.mkdir(parents=True)
    (project / ".env").write_text("OPENAI_API_KEY=" + SECRET, encoding="utf-8")
    write_private_json(data_dir / "chatgpt-auth.json", {"account": "private@example.test", "client_id": "oaiapp_test", "host_id": "urn:uuid:private-host", "access_token": "oauth-test-access", "id_token": "private-id-token", "subject": "test-subject", "scopes": ["openid"], "expires_at": time.time() + 3600})
    write_private_json(data_dir / "chatgpt-login-result.json", {"ok": False, "code": "chatgpt_not_eligible", "message": SECRET})
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    result = subprocess.run([sys.executable, "-S", str(Path(diagnose.__file__)), "--offline", "--project", str(project), "--port", str(port)], capture_output=True, text=True, encoding="utf-8", timeout=12)
    assert result.returncode == 0, result.stderr
    assert SECRET not in result.stdout and not result.stderr
    files = list((project / "diagnostics").glob("relay-diagnostics-*.json"))
    assert len(files) == 1
    report = json.loads(files[0].read_text(encoding="utf-8"))
    assert_private(report, str(project), "private-id-token")
    assert report["source"] == "standalone"
    assert any(f["code"] == "legacy_403_details_missing" for f in report["findings"])


def test_old_running_app_report_does_not_invent_missing_upstream_details(tmp_path, monkeypatch):
    status = {"connected": False, "signed_in": False, "plan_enabled": False, "pending": False, "result": {"ok": False, "code": "chatgpt_not_eligible", "message": SECRET}}
    monkeypatch.setattr(diagnose, "discover_server", lambda port=None: (8000, status))
    monkeypatch.setattr(diagnose, "get_bytes", lambda *args, **kwargs: (404, {}, b"{}"))
    report = diagnose.standalone_report(tmp_path, offline=True)
    assert report["source"] == "standalone_legacy"
    assert report["login_trace"]["first_failure"] is None
    assert any(f["code"] == "legacy_403_details_missing" for f in report["findings"])
    assert_private(report)


@pytest.mark.parametrize("value", [None, [], {"events": [SECRET, None, {"stage": {}, "outcome": [], "provider_code": SECRET}], "first_failure": [], "registration_kind": {}}, {"attempt_id": SECRET, "started_at": SECRET, "events": [], "first_failure": {"stage": "token_exchange", "outcome": "error", "request_id": SECRET}}])
def test_corrupt_trace_is_bounded_and_cannot_export_extra_fields(value):
    cleaned = diagnose.clean_trace(value)
    assert SECRET not in json.dumps(cleaned)
    assert len(cleaned["events"]) <= 40


def test_trace_retains_first_failure_when_later_errors_exceed_window(tmp_path):
    trace = diagnose.LoginTrace(tmp_path / "trace.json")
    trace.begin(8123, False)
    trace.record("token_exchange", "error", http_status=403, provider_code="invalid_client")
    first = trace.snapshot()["first_failure"]
    for _ in range(45):
        trace.record("local_authorization", "error", code="chatgpt_login_required")
    assert len(trace.snapshot()["events"]) == 40
    assert trace.snapshot()["first_failure"] == first
    assert diagnose.LoginTrace(trace.path).snapshot()["first_failure"] == first
    trace.begin(8123, True)
    assert trace.snapshot()["first_failure"] is None


def test_running_diagnostic_does_not_block_official_callback(config, signing_key):
    server = OAuthServer(signing_key)
    app = create_app(config, auth_http_factory=server.factory)
    entered, release = Event(), Event()
    async def blocked_probe(stage, url, token=None):
        entered.set()
        while not release.is_set():
            await asyncio.sleep(0.005)
        return {"stage": stage, "outcome": "ok"}
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        started = client.post("/api/auth/chatgpt/start").json()
        params = parse_qs(urlsplit(started["authorization_url"]).query)
        server.nonce = params["nonce"][0]
        app.state.diagnostics.probe = blocked_probe
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(client.post, "/api/diagnostics/run", json={"check_network": True})
            try:
                assert entered.wait(2)
                callback = client.get("/auth/callback", params={"state": params["state"][0], "code": "code", "client_id": "oaiapp_test"}, follow_redirects=False)
                assert callback.status_code == 303
                assert client.get("/api/auth/chatgpt/status").json()["connected"]
                assert not future.done()
            finally:
                release.set()
            report = future.result(timeout=5).json()
        assert report["authorization"]["connected"] and report["login_trace"]["first_failure"] is None


def test_unresponsive_diagnostic_network_has_total_deadline_and_no_token_loss(config):
    cancelled = []
    async def handler(request):
        try:
            await asyncio.sleep(20)
        finally:
            cancelled.append(str(request.url))
    app = create_app(config, auth_http_factory=lambda: httpx2.AsyncClient(transport=httpx2.MockTransport(handler)))
    with TestClient(app, headers={"X-Relay-Client": "local"}) as client:
        before = app.state.chatgpt_auth.trace.snapshot()
        start = time.monotonic()
        report = client.post("/api/diagnostics/run", json={"check_network": True}).json()
        assert 5.5 < time.monotonic() - start < 9
        assert report["network"]["probes"][0]["code"] == "network_timeout"
        assert len(cancelled) == 2
        assert before == app.state.chatgpt_auth.trace.snapshot()
        assert_private(report)
