"""Regression checks for the delivered launcher and separate sign-in/call state."""

import json
from dataclasses import replace
from urllib.parse import parse_qs, urlsplit

import httpx2
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from openai import APIConnectionError, PermissionDeniedError

import bootstrap
from app.main import APP_VERSION, create_app
from app.services.chatgpt_auth import SCOPES, ChatGPTAuth
from tests.fakes import ScriptedTransport, full_reply
from tests.test_connection import OAuthServer, Probe
from tests.test_diagnostics import assert_private


@pytest.fixture(scope="module")
def key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def login(client, server, *, authorize=False):
    started = client.post("/api/auth/chatgpt/start", params={"authorize_plan": authorize})
    assert started.status_code == 200
    params = parse_qs(urlsplit(started.json()["authorization_url"]).query)
    server.nonce = params["nonce"][0]
    client.get("/auth/callback", params={"state": params["state"][0], "code": "synthetic-code", "client_id": "oaiapp_test"})
    return params


def test_missing_scope_has_an_explicit_reconsent_path(config, key):
    server = OAuthServer(key)
    server.scopes = "openid profile email"
    app = create_app(replace(config, api_key=""), auth_http_factory=server.factory, connection_transport=Probe())
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        first = login(client, server)
        assert "prompt" not in first
        before = client.get("/api/auth/chatgpt/status").json()
        assert before["signed_in"] and not before["plan_enabled"]
        assert "授权模型调用" in before["message"]
        ordinary = client.post("/api/auth/chatgpt/start").json()
        assert "prompt" not in parse_qs(urlsplit(ordinary["authorization_url"]).query)
        client.post("/api/auth/chatgpt/cancel")
        server.scopes = SCOPES
        consent = login(client, server, authorize=True)
        assert consent["prompt"] == ["consent"]
        assert consent["client_id"] == ["oaiapp_test"]
        assert consent["ext_agent_host_id"] == first["ext_agent_host_id"]
        assert consent["redirect_uri"] == first["redirect_uri"]
        assert set(SCOPES.split()) == set(consent["scope"][0].split())
        assert "force_reconsent" not in consent and "id_token_hint" not in consent
        status = client.get("/api/auth/chatgpt/status").json()
        assert status["signed_in"] and status["plan_enabled"] and status["connection_check"] is None
        assert not client.get("/api/settings").json()["openai_api_key_set"]
        assert client.post("/api/settings/test-connection").json()["ok"]
        status = client.get("/api/auth/chatgpt/status").json()
        assert status["phase"] == "connection_verified" and status["connection_check"]["ok"]


def test_consent_action_does_not_discard_an_inflight_ordinary_login(config):
    auth = ChatGPTAuth(config)
    first = auth.start("http://127.0.0.1:8123")
    from app.errors import RelayError

    with pytest.raises(RelayError, match="完成或取消"):
        auth.start("http://127.0.0.1:8123", authorize_plan=True)
    assert auth.start("http://127.0.0.1:8123")["authorization_url"] == first["authorization_url"]


@pytest.mark.parametrize("stage", ["callback", "client_registration", "token_exchange", "verify_identity", "save_credentials", "scope_check", "loading_models"])
def test_all_processing_stages_keep_login_polling_active(config, stage):
    auth = ChatGPTAuth(config)
    auth.start("http://127.0.0.1:8123")
    auth.stage = stage
    auth.pending = None
    status = auth.status()
    assert status["pending"] and status["phase"] == stage
    assert status["result"]["code"] == "chatgpt_login_pending"
    assert "重启" not in status["message"]


@pytest.mark.asyncio
async def test_callback_is_processing_before_trace_file_io(config, key, monkeypatch):
    server = OAuthServer(key)
    auth = ChatGPTAuth(config, server.factory)
    params = parse_qs(urlsplit(auth.start("http://127.0.0.1:8123")["authorization_url"]).query)
    server.nonce = params["nonce"][0]
    original = auth.trace.record
    observed = []
    def record(stage, outcome, **kwargs):
        if stage == "callback" and outcome == "ok":
            observed.append(auth.status())
        return original(stage, outcome, **kwargs)
    monkeypatch.setattr(auth.trace, "record", record)
    await auth.finish({"state": params["state"][0], "code": "code", "client_id": "oaiapp_test"})
    assert len(observed) == 1 and observed[0]["pending"]
    assert observed[0]["phase"] == "callback"
    assert observed[0]["result"]["code"] == "chatgpt_login_pending"


@pytest.mark.parametrize("body,code,finding", [
    ({"error": {"code": "subscription_sharing_user_not_eligible"}}, "chatgpt_not_eligible", "plan_not_eligible"),
    ({"detail": "private-response-must-not-appear"}, "chatgpt_auth_forbidden", "authorization_forbidden_unknown"),
    ({"error": {"code": "private-response-must-not-appear"}}, "chatgpt_auth_forbidden", "authorization_forbidden_unknown"),
    ({"error": {"code": "chatpass_v2_scope_not_authorized"}}, "chatgpt_plan_not_enabled", "plan_scope_missing"),
])
def test_model_denial_keeps_identity_and_exports_actual_failure(config, key, body, code, finding):
    server = OAuthServer(key)
    request = httpx2.Request("POST", "https://api.openai.com/v1/responses")
    response = httpx2.Response(403, request=request, json=body, headers={"x-request-id": "req_0123456789abcdef"})
    error = PermissionDeniedError("private-response-must-not-appear", response=response, body=body)
    app = create_app(config, auth_http_factory=server.factory, connection_transport=Probe(error))
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        login(client, server)
        credentials = app.state.chatgpt_auth.path.read_bytes()
        result = client.post("/api/settings/test-connection")
        assert result.status_code == 403 and result.json()["detail"]["code"] == code
        status = client.get("/api/auth/chatgpt/status").json()
        assert status["signed_in"] and status["plan_enabled"] and status["connected"]
        assert status["phase"] == "connection_failed" and status["connection_check"]["code"] == code
        assert app.state.chatgpt_auth.path.read_bytes() == credentials
        report = client.post("/api/diagnostics/run", json={"check_network": False}).json()
        assert report["findings"][0]["code"] == finding
        evidence = report["login_trace"]["first_failure"]
        assert evidence["stage"] == "model_inference" and evidence["http_status"] == 403
        assert evidence["request_id"] == "req_0123456789abcdef"
        assert_private(report)
        assert "private-response-must-not-appear" not in json.dumps([status, report])
        assert "identity_fingerprint" not in json.dumps([status, report])
    with TestClient(create_app(config), headers={"X-Relay-Client": "local"}) as restored:
        status = restored.get("/api/auth/chatgpt/status").json()
        assert status["signed_in"] and status["connection_check"]["code"] == code
        assert restored.post("/api/diagnostics/run", json={"check_network": False}).json()["authorization"]["connection_ok"] is False


def test_network_failure_keeps_grant_and_successful_retry_replaces_outcome(config, key):
    server = OAuthServer(key)
    probe = Probe(APIConnectionError(request=httpx2.Request("POST", "https://api.openai.com/v1/responses")))
    app = create_app(config, auth_http_factory=server.factory, connection_transport=probe)
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        login(client, server)
        assert client.post("/api/settings/test-connection").status_code == 502
        assert client.get("/api/auth/chatgpt/status").json()["signed_in"]
        probe.error = None
        assert client.post("/api/settings/test-connection").json()["ok"]
        status = client.get("/api/auth/chatgpt/status").json()
        assert status["phase"] == "connection_verified"
        assert client.post("/api/diagnostics/run", json={"check_network": False}).json()["authorization"]["connection_ok"] is True
        client.put("/api/settings", json={"chatgpt_model": "different-model"})
        assert client.get("/api/auth/chatgpt/status").json()["connection_check"] is None


def test_connection_record_is_bound_to_validated_identity(config, key):
    server = OAuthServer(key)
    app = create_app(config, auth_http_factory=server.factory, connection_transport=Probe())
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        login(client, server)
        client.post("/api/settings/test-connection")
        assert client.get("/api/auth/chatgpt/status").json()["connection_check"]["ok"]
        login(client, server)
        assert client.get("/api/auth/chatgpt/status").json()["connection_check"] is None
        client.post("/api/auth/chatgpt/logout")
        assert client.get("/api/auth/chatgpt/status").json().get("connection_check") is None


def test_successful_relay_generation_also_verifies_model_connection(config, key):
    server = OAuthServer(key)
    app = create_app(config, auth_http_factory=server.factory, transport=ScriptedTransport([full_reply()]))
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        login(client, server)
        sid = client.post("/api/sessions", json={}).json()["id"]
        result = client.post(f"/api/sessions/{sid}/messages", json={"content": "我想做卡牌游戏，使用默认假设，我需要结果"})
        assert result.status_code == 200
        assert result.json()["output_markdown"].count("\n## ") == 6
        assert client.get("/api/auth/chatgpt/status").json()["connection_check"]["ok"]


def test_runtime_endpoint_starts_without_any_model_credential(config):
    with TestClient(create_app(replace(config, api_key="")), base_url="http://127.0.0.1:8001") as client:
        assert client.get("/health").json() == {"status": "ok"}
        assert client.get("/api/runtime").json() == {"application": "language-relay", "version": APP_VERSION, "instance": None, "port": 8001}
        assert client.get("/").status_code == 200


@pytest.mark.parametrize("change", [None, "wrong_instance", "wrong_app", "old_version", "redirect"])
def test_repeat_launcher_only_opens_its_own_current_server(tmp_path, monkeypatch, change):
    root = tmp_path / "中文路径 with spaces"
    (root / "app").mkdir(parents=True)
    (root / "app/main.py").write_text('APP_VERSION = "1.2.1"', encoding="utf-8")
    instance = "a" * 32
    bootstrap.write_runtime(root, instance, 8001, "1.2.1")
    info = {"application": "language-relay", "version": "1.2.1", "instance": instance, "port": 8001}
    if change == "wrong_instance":
        info["instance"] = "b" * 32
    if change == "wrong_app":
        info["application"] = "other-app"
    if change == "old_version":
        info["version"] = "1.2.0"
    opened = []

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def read(self, _limit):
            return json.dumps(info).encode()

    class Opener:
        def open(self, url, timeout):
            assert url == "http://127.0.0.1:8001/api/runtime" and timeout <= 1
            if change == "redirect":
                raise bootstrap.urllib.error.HTTPError(url, 302, "redirect", {}, None)
            return Response()

    monkeypatch.setattr(bootstrap.urllib.request, "build_opener", lambda *args: Opener())
    monkeypatch.setattr(bootstrap.webbrowser, "open", opened.append)
    if change == "old_version":
        with pytest.raises(bootstrap.InstallError, match="旧版服务仍在运行"):
            bootstrap.reopen_running(root)
    else:
        assert bootstrap.reopen_running(root) is (change is None)
    assert opened == (["http://127.0.0.1:8001"] if change is None else [])


@pytest.mark.parametrize("record", [{}, {"port": "8000", "instance": "a" * 32}, {"port": 80, "instance": "a" * 32}, {"port": 8000, "instance": "http://private.example"}])
def test_bad_launcher_record_never_opens_a_browser(tmp_path, monkeypatch, record):
    (tmp_path / ".data").mkdir()
    (tmp_path / ".data/active-server.json").write_text(json.dumps(record))
    monkeypatch.setattr(bootstrap.webbrowser, "open", lambda _: pytest.fail("opened an invalid server"))
    assert bootstrap.reopen_running(tmp_path) is False
