import asyncio
import json
import time
from contextlib import asynccontextmanager
from dataclasses import replace
from urllib.parse import parse_qs, urlsplit

import httpx2
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from openai import APIConnectionError, AuthenticationError, PermissionDeniedError, RateLimitError

from app.errors import RelayError
from app.main import create_app
from app.services.chatgpt_auth import DISCOVERY, ISSUER, JWKS, SCOPES, TOKEN, ChatGPTAuth
from app.services.llm_client import OpenAITransport, terminal_provider_error
from tests.fakes import ScriptedTransport, full_reply, questions_reply


class Probe:
    def __init__(self, error=None):
        self.error = error
        self.calls = []

    async def probe(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error


@pytest.mark.parametrize("code", ["subscription_sharing_route_not_supported", "subscription_sharing_unknown_rejection"])
def test_chatgpt_forbidden_requests_are_not_retried(code):
    response = httpx2.Response(403, request=httpx2.Request("POST", "https://api.openai.com/v1/responses"))
    error = PermissionDeniedError("safe test", response=response, body={"error": {"code": code}})
    classified = terminal_provider_error(error, "chatgpt")
    assert classified.status_code == 403 and not classified.retryable


def test_chatgpt_refresh_shares_generation_deadline_and_keeps_input(config):
    transport = ScriptedTransport()
    app = create_app(replace(config, llm_budget_seconds=0.2), transport=transport)
    with TestClient(app, headers={"X-Relay-Client": "local"}) as client:
        async def slow_refresh():
            await asyncio.sleep(0.8)
            return "never-publish-token"

        app.state.chatgpt_auth.access_token = slow_refresh
        client.put("/api/settings", json={"provider": "chatgpt", "chatgpt_model": "gpt-6.1-sol"})
        session_id = client.post("/api/sessions", json={}).json()["id"]
        started = time.monotonic()
        response = client.post(f"/api/sessions/{session_id}/messages", json={"content": "我想做卡牌游戏"})
        assert response.status_code == 504 and response.json()["detail"]["code"] == "gpt_timeout"
        assert time.monotonic() - started < 0.6 and not transport.calls
        history = client.get(f"/api/sessions/{session_id}").json()
        assert history["session"]["status"] == "error"
        assert history["messages"][0]["content"] == "我想做卡牌游戏"


@pytest.fixture(scope="module")
def signing_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


class OAuthServer:
    def __init__(self, key):
        self.key = key
        self.nonce = ""
        self.override = {}
        self.calls = []
        self.refresh_error = None
        self.scopes = SCOPES
        self.models_error = None

    def handler(self, request):
        self.calls.append(request)
        url = str(request.url)
        if url == DISCOVERY:
            return httpx2.Response(200, json={"issuer": ISSUER, "jwks_uri": JWKS, "revocation_endpoint": ISSUER + "/revoke"})
        if url == JWKS:
            public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(self.key.public_key()))
            return httpx2.Response(200, json={"keys": [{**public, "kid": "test-key", "alg": "RS256"}]})
        if url == TOKEN:
            fields = parse_qs(request.content.decode())
            if fields["grant_type"] == ["refresh_token"]:
                if self.refresh_error:
                    return httpx2.Response(400, json={"error": self.refresh_error})
                return httpx2.Response(200, json={"access_token": "oauth-renewed-access", "refresh_token": "rotated-refresh", "token_type": "Bearer", "expires_in": 3600})
            claims = {"sub": "test-subject", "email": "private@example.test", "iss": ISSUER, "aud": "oaiapp_test", "exp": time.time() + 3600, "iat": time.time(), "nonce": self.nonce, **self.override}
            identity = jwt.encode(claims, self.key, algorithm="RS256", headers={"kid": "test-key"})
            return httpx2.Response(200, json={"access_token": "oauth-test-access", "refresh_token": "oauth-test-refresh", "id_token": identity, "token_type": "Bearer", "expires_in": 3600, "scope": self.scopes})
        if url.endswith("/models"):
            if self.models_error:
                return httpx2.Response(503, json={"error": {"code": "unavailable", "message": "never-display-catalog-body"}})
            return httpx2.Response(200, json={"models": [{"slug": "gpt-6.1-sol", "display_name": "GPT 6.1", "visibility": "list"}, {"slug": "hidden-model", "visibility": "hidden"}]})
        if url.endswith("/revoke"):
            return httpx2.Response(200)
        raise AssertionError("unexpected endpoint")

    def factory(self):
        return httpx2.AsyncClient(transport=httpx2.MockTransport(self.handler), trust_env=False, follow_redirects=False)


@asynccontextmanager
async def auth_flow(config, signing_key):
    server = OAuthServer(signing_key)
    auth = ChatGPTAuth(config, server.factory)
    result = auth.start("http://127.0.0.1:8123")
    params = {k: v[0] for k, v in parse_qs(urlsplit(result["authorization_url"]).query).items()}
    server.nonce = params["nonce"]
    yield auth, server, params


@pytest.mark.parametrize("content", ["sk-test-imported", '\ufeffOPENAI_API_KEY="sk-test-imported"\n', '{"openai_api_key":"sk-test-imported"}', "export OPENAI_API_KEY='sk-test-imported'\nOPENAI_MODEL=gpt-4o-mini"])
def test_one_action_key_import_saves_and_probes_without_history(config, content):
    probe = Probe()
    app = create_app(config, connection_transport=probe)
    with TestClient(app, headers={"X-Relay-Client": "local"}) as client:
        response = client.post("/api/settings/import-key", json={"content": content})
        assert response.status_code == 200 and response.json()["connection"]["ok"]
        assert "sk-test-imported" not in response.text
        assert app.state.settings.api_key() == "sk-test-imported"
        assert len(probe.calls) == 1
        assert client.get("/api/sessions").json() == []


@pytest.mark.parametrize("content", ["", "sk-中文", "OPENAI_API_KEY=sk-first\nOPENAI_API_KEY=sk-second", '{"openai_api_key": null}', "unrelated.txt", "x" * 16385])
def test_invalid_key_import_keeps_previous_key(config, content):
    app = create_app(config, connection_transport=Probe())
    with TestClient(app, headers={"X-Relay-Client": "local"}) as client:
        before = app.state.settings.api_key()
        response = client.post("/api/settings/import-key", json={"content": content})
        assert response.status_code in {400, 422}
        assert app.state.settings.api_key() == before
        assert "sk-first" not in response.text


def test_quota_has_clear_reason_and_no_generation_retries(config):
    error = RateLimitError("secret upstream", response=httpx2.Response(429, request=httpx2.Request("POST", "https://api.openai.com/v1/chat/completions")), body={"error": {"code": "insufficient_quota", "message": "secret upstream"}})
    probe = Probe(error)
    transport = ScriptedTransport([error])
    app = create_app(config, transport=transport, connection_transport=probe)
    with TestClient(app, headers={"X-Relay-Client": "local"}) as client:
        result = client.post("/api/settings/test-connection")
        assert result.status_code == 402 and result.json()["detail"]["code"] == "api_quota_exhausted"
        assert "secret upstream" not in result.text
        sid = client.post("/api/sessions", json={}).json()["id"]
        response = client.post(f"/api/sessions/{sid}/messages", json={"content": "我想做卡牌游戏"})
        assert response.status_code == 402 and len(transport.calls) == 1
        assert client.get(f"/api/sessions/{sid}").json()["session"]["status"] == "error"


@pytest.mark.parametrize("kind", ["invalid", "network"])
def test_import_retains_key_when_connection_fails(config, kind):
    request = httpx2.Request("POST", "https://api.openai.com/v1/chat/completions")
    error = AuthenticationError("secret", response=httpx2.Response(401, request=request), body={}) if kind == "invalid" else APIConnectionError(request=request)
    app = create_app(config, connection_transport=Probe(error))
    with TestClient(app, headers={"X-Relay-Client": "local"}) as client:
        result = client.post("/api/settings/import-key", json={"content": "sk-test-imported"}).json()
        assert not result["connection"]["ok"]
        assert app.state.settings.api_key() == "sk-test-imported"
        assert result["connection"]["code"] == ("api_key_invalid" if kind == "invalid" else "connection_network_error")


async def test_official_login_verifies_identity_and_uses_no_api_key(config, signing_key):
    async with auth_flow(config, signing_key) as (auth, server, params):
        assert params["client_id"] == "dynamic_agent_client"
        assert params["redirect_uri"] == "http://127.0.0.1:8123/auth/callback"
        assert params["code_challenge_method"] == "S256" and params["resource"] == "https://api.openai.com/v1"
        result = await auth.finish({"state": params["state"], "code": "one-time-code", "client_id": "oaiapp_test"})
        assert result["connected"] and result["models"] == [{"slug": "gpt-6.1-sol", "display_name": "GPT 6.1"}]
        assert "oauth-test-access" not in json.dumps(result)
        assert "oauth-test-refresh" not in json.dumps(result)
        restored = ChatGPTAuth(config, server.factory)
        assert restored.status()["connected"]
        again = parse_qs(urlsplit(restored.start("http://127.0.0.1:8999")["authorization_url"]).query)
        assert again["client_id"] == ["oaiapp_test"] and again["ext_agent_host_id"] == [params["ext_agent_host_id"]]
        assert "id_token_hint" not in again


@pytest.mark.parametrize("field,value", [("nonce", "wrong"), ("aud", "other-client"), ("iss", "https://attacker.test"), ("exp", 1), ("sub", "")])
async def test_identity_failures_never_activate_account(config, signing_key, field, value):
    async with auth_flow(config, signing_key) as (auth, server, params):
        server.override[field] = value
        with pytest.raises(RelayError, match="身份验证"):
            await auth.finish({"state": params["state"], "code": "code", "client_id": "oaiapp_test"})
        assert not auth.status()["connected"]


@pytest.mark.parametrize("wrong_state", ["wrong", "错误状态"])
async def test_wrong_state_denied_consent_and_callback_replay(config, signing_key, wrong_state):
    async with auth_flow(config, signing_key) as (auth, server, params):
        with pytest.raises(RelayError, match="不匹配"):
            await auth.finish({"state": wrong_state, "code": "code", "client_id": "oaiapp_test"})
        assert not server.calls
        with pytest.raises(RelayError, match="没有完成"):
            await auth.finish({"state": params["state"], "error": "access_denied"})
        with pytest.raises(RelayError, match="不匹配"):
            await auth.finish({"state": params["state"], "code": "code", "client_id": "oaiapp_test"})
        assert not server.calls


async def test_refresh_rotation_and_remote_logout(config, signing_key):
    async with auth_flow(config, signing_key) as (auth, server, params):
        await auth.finish({"state": params["state"], "code": "code", "client_id": "oaiapp_test"})
        record = auth.read()
        record["expires_at"] = 1
        from app.services.chatgpt_auth import write_private_json

        write_private_json(auth.path, record)
        assert await auth.access_token() == "oauth-renewed-access"
        assert auth.read()["refresh_token"] == "rotated-refresh"
        assert (await auth.logout())["ok"]
        assert not auth.status()["connected"]
        assert auth.read()["client_id"] == "oaiapp_test"
        assert "access_token" not in auth.read() and "refresh_token" not in auth.read()
        assert any(str(call.url).endswith("/revoke") for call in server.calls)


def test_callback_enables_relay_rules_without_api_key(config, signing_key):
    server = OAuthServer(signing_key)
    transport = ScriptedTransport([questions_reply(), full_reply()])
    app = create_app(replace(config, api_key=""), transport=transport, auth_http_factory=server.factory, connection_transport=Probe())
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        started = client.post("/api/auth/chatgpt/start").json()
        params = parse_qs(urlsplit(started["authorization_url"]).query)
        server.nonce = params["nonce"][0]
        callback = client.get("/auth/callback", params={"state": params["state"][0], "code": "code", "client_id": "oaiapp_test"}, follow_redirects=False)
        assert callback.status_code == 303 and "code" not in callback.headers["location"]
        assert client.get("/api/settings").json()["provider"] == "chatgpt"
        sid = client.post("/api/sessions", json={}).json()["id"]
        first = client.post(f"/api/sessions/{sid}/messages", json={"content": "我想做卡牌游戏"}).json()
        assert first["need_more_info"] and first["output_markdown"].count("## ") == 1
        second = client.post(f"/api/sessions/{sid}/messages", json={"content": "使用默认假设，我需要结果"}).json()
        assert not second["need_more_info"] and second["output_markdown"].count("\n## ") == 6
        assert "假设" in second["output_markdown"]
        assert client.get(f"/api/sessions/{sid}/export").text == second["output_markdown"]
        assert not app.state.settings.api_key()
        assert transport.calls[0]["api_key"] == "oauth-test-access"
        assert client.post("/api/settings/test-connection").json()["ok"]


async def test_sdk_chatgpt_stream_obeys_official_preview_body():
    captured = []

    def handler(request):
        captured.append(json.loads(request.content))
        events = [{"type": "response.output_text.delta", "delta": '{"ok":true}', "item_id": "m1", "output_index": 0, "content_index": 0, "sequence_number": 1}, {"type": "response.completed", "response": {"id": "r1", "object": "response", "status": "completed", "output": [], "created_at": 1, "model": "gpt-6.1-sol"}, "sequence_number": 2}]
        content = "\n\n".join("data: " + json.dumps(e) for e in events) + "\n\n"
        return httpx2.Response(200, headers={"content-type": "text/event-stream"}, content=content)

    transport = OpenAITransport(lambda: httpx2.AsyncClient(transport=httpx2.MockTransport(handler)))
    raw = await transport.responses_request("oauth-test-access", "gpt-6.1-sol", [{"role": "system", "content": "fixed rules"}, {"role": "user", "content": "idea"}], 1, {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"], "additionalProperties": False})
    assert json.loads(raw)["ok"]
    body = captured[0]
    assert body["store"] is False and body["stream"] is True and body["instructions"] == "fixed rules"
    assert body["input"] == [{"role": "user", "content": "idea"}]
    assert "temperature" not in body and "max_output_tokens" not in body


async def test_invalid_refresh_clears_tokens_but_keeps_registration(config, signing_key):
    from app.services.chatgpt_auth import write_private_json

    async with auth_flow(config, signing_key) as (auth, server, params):
        await auth.finish({"state": params["state"], "code": "code", "client_id": "oaiapp_test"})
        record = auth.read()
        record["expires_at"] = 1
        write_private_json(auth.path, record)
        server.refresh_error = "invalid_grant"
        with pytest.raises(RelayError, match="失效"):
            await auth.access_token()
        assert not auth.status()["connected"] and auth.read()["client_id"] == "oaiapp_test"


async def test_stream_without_completed_event_is_rejected():
    from app.services.llm_client import ReplyFormatError

    def handler(request):
        event = {"type": "response.output_text.delta", "delta": '{"ok":true}', "item_id": "m1", "output_index": 0, "content_index": 0, "sequence_number": 1}
        return httpx2.Response(200, headers={"content-type": "text/event-stream"}, content="data: " + json.dumps(event) + "\n\n")

    transport = OpenAITransport(lambda: httpx2.AsyncClient(transport=httpx2.MockTransport(handler)))
    with pytest.raises(ReplyFormatError, match="without completion"):
        await transport.responses_request("oauth-test-access", "gpt-6.1-sol", [{"role": "user", "content": "idea"}], 1, {"type": "object"})


def test_login_mutations_require_local_client_header(config):
    app = create_app(config)
    with TestClient(app, base_url="http://127.0.0.1:8123") as client:
        for path in ("/api/auth/chatgpt/start", "/api/auth/chatgpt/logout", "/api/auth/chatgpt/cancel", "/api/settings/test-connection"):
            assert client.post(path).status_code == 403
        assert client.get("/auth/callback?state=wrong&code=never-display-this", follow_redirects=False).status_code == 303
        assert "never-display-this" not in client.get("/api/auth/chatgpt/status").text


def test_identity_login_without_plan_is_visible_after_refresh(config, signing_key):
    server = OAuthServer(signing_key)
    server.scopes = "openid profile email"
    app = create_app(config, auth_http_factory=server.factory)
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        params = parse_qs(urlsplit(client.post("/api/auth/chatgpt/start").json()["authorization_url"]).query)
        server.nonce = params["nonce"][0]
        client.get("/auth/callback", params={"state": params["state"][0], "code": "code", "client_id": "oaiapp_test"})
        status = client.get("/api/auth/chatgpt/status").json()
        assert status["signed_in"] and not status["connected"] and not status["plan_enabled"]
        assert status["account"] == "private@example.test" and status["phase"] == "plan_required"
        assert status["result"]["code"] == "chatgpt_plan_not_enabled"
        assert "oauth-test-access" not in json.dumps(status)


def test_login_start_selects_connection_and_preserves_pending_attempt(config):
    app = create_app(config)
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        first = client.post("/api/auth/chatgpt/start").json()
        second = client.post("/api/auth/chatgpt/start").json()
        assert first["authorization_url"] == second["authorization_url"]
        assert client.get("/api/settings").json()["provider"] == "chatgpt"
        status = client.get("/api/auth/chatgpt/status").json()
        assert status["pending"] and status["phase"] == "waiting_callback"
        assert "state" not in status and "verifier" not in status


def test_declined_login_reason_survives_application_restart(config):
    with TestClient(create_app(config), base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        params = parse_qs(urlsplit(client.post("/api/auth/chatgpt/start").json()["authorization_url"]).query)
        client.get("/auth/callback", params={"state": params["state"][0], "error": "access_denied", "error_description": "never-display-provider-body"})
    with TestClient(create_app(config), base_url="http://127.0.0.1:8123") as restored:
        status = restored.get("/api/auth/chatgpt/status").json()
        assert status["result"]["code"] == "chatgpt_consent_denied"
        assert "没有完成" in status["result"]["message"] and "never-display-provider-body" not in json.dumps(status)


def test_restart_during_login_explains_interruption(config):
    auth = ChatGPTAuth(config)
    auth.start("http://127.0.0.1:8123")
    restored = ChatGPTAuth(config)
    status = restored.status()
    assert not status["pending"] and status["phase"] == "failed"
    assert "服务重启中断" in status["message"]


def test_cancel_login_rejects_old_callback_without_deleting_credentials(config):
    app = create_app(config)
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        params = parse_qs(urlsplit(client.post("/api/auth/chatgpt/start").json()["authorization_url"]).query)
        cancelled = client.post("/api/auth/chatgpt/cancel").json()
        assert not cancelled["pending"] and cancelled["result"]["code"] == "chatgpt_login_cancelled"
        callback = client.get("/auth/callback", params={"state": params["state"][0], "code": "never-exchange-code", "client_id": "oaiapp_test"}, follow_redirects=False)
        assert callback.status_code == 303
        assert not client.get("/api/auth/chatgpt/status").json()["connected"]


def test_unrelated_callback_does_not_interrupt_pending_login(config):
    app = create_app(config)
    with TestClient(app, base_url="http://127.0.0.1:8123", headers={"X-Relay-Client": "local"}) as client:
        first = client.post("/api/auth/chatgpt/start").json()["authorization_url"]
        client.get("/auth/callback?state=unknown&code=never-exchange-code", follow_redirects=False)
        status = client.get("/api/auth/chatgpt/status").json()
        assert status["pending"] and status["result"]["code"] == "chatgpt_login_pending"
        assert client.post("/api/auth/chatgpt/start").json()["authorization_url"] == first


async def test_model_catalog_failure_does_not_hide_successful_login(config, signing_key):
    async with auth_flow(config, signing_key) as (auth, server, params):
        server.models_error = True
        status = await auth.finish({"state": params["state"], "code": "code", "client_id": "oaiapp_test"})
        assert status["signed_in"] and status["connected"] and not status["pending"]
        assert status["result"]["code"] == "chatgpt_model_catalog_pending"
        assert "模型列表尚未加载" in status["result"]["message"]
        assert "never-display-catalog-body" not in json.dumps(status)


async def test_cancelled_callback_does_not_stay_pending(config):
    auth = ChatGPTAuth(config)
    params = parse_qs(urlsplit(auth.start("http://127.0.0.1:8123")["authorization_url"]).query)

    async def unfinished_callback(_params, _pending):
        await asyncio.sleep(10)

    auth._finish_valid = unfinished_callback
    task = asyncio.create_task(auth.finish({"state": params["state"][0], "code": "code", "client_id": "oaiapp_test"}))
    await asyncio.sleep(0)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    status = auth.status()
    assert not status["pending"] and not status["connected"]
    assert "登录已中断" in status["result"]["message"]


def test_expired_login_can_start_fresh_attempt(config):
    auth = ChatGPTAuth(config)
    first = auth.start("http://127.0.0.1:8123")["authorization_url"]
    auth.pending["expires"] = time.monotonic() - 1
    assert not auth.status()["pending"] and "已过期" in auth.status()["message"]
    assert auth.start("http://127.0.0.1:8123")["authorization_url"] != first


async def test_cancelling_new_login_keeps_existing_verified_authorization(config, signing_key):
    async with auth_flow(config, signing_key) as (auth, _server, params):
        await auth.finish({"state": params["state"], "code": "code", "client_id": "oaiapp_test"})
        previous = auth.path.read_bytes()
        auth.start("http://127.0.0.1:8123")
        result = auth.cancel()
        assert result["connected"] and result["signed_in"] and not result["pending"]
        assert auth.path.read_bytes() == previous
