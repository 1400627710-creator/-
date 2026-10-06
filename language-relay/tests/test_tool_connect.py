"""Local onboarding orchestration with simulated official-client outcomes."""
import json
from types import SimpleNamespace

import httpx
import pytest

import tool_connect
from app.config import Config


@pytest.fixture
def onboarding(tmp_path, monkeypatch):
    config = Config(data_dir=tmp_path / "data")
    monkeypatch.setattr(tool_connect, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(tool_connect.Config, "from_env", lambda: config)
    monkeypatch.setattr(tool_connect, "get_server", lambda _: "http://127.0.0.1:8000")
    monkeypatch.setattr(tool_connect, "find_client", lambda: str(tmp_path / "tunnel-client.exe"))
    monkeypatch.setenv("CONTROL_PLANE_API_KEY", "sk-private-tunnel-marker")
    original = httpx.Client
    def request(req):
        if req.url.path == "/api/tools/check":
            return httpx.Response(200, json={"ok": True})
        if req.url.path == "/api/tools/setup":
            return httpx.Response(200, json={"tunnel_id": "tunnel_unit_test"})
        return httpx.Response(200, json={})
    monkeypatch.setattr(tool_connect.httpx, "Client", lambda **kw: original(transport=httpx.MockTransport(request), **kw))
    return config


@pytest.mark.parametrize("phase,code", [("init", "tool_tunnel_configuration_failed"), ("doctor", "tool_tunnel_doctor_failed"), ("run", "tool_tunnel_stopped")])
def test_each_official_client_failure_has_specific_safe_report(onboarding, monkeypatch, capsys, phase, code):
    def run(args, **kwargs):
        assert "sk-private-tunnel-marker" not in " ".join(args)
        return SimpleNamespace(returncode=1 if args[1] == phase else 0)
    monkeypatch.setattr(tool_connect.subprocess, "run", run)
    assert tool_connect.main() == 1
    text = capsys.readouterr().out
    assert code in text and "sk-private-tunnel-marker" not in text
    report = json.loads((tool_connect.PROJECT_ROOT / "diagnostics" / "relay-tool-launcher.json").read_text())
    assert report["error_code"] == code and report["privacy"]["credentials_exported"] is False


def test_missing_official_binary_has_actionable_report(onboarding, monkeypatch, capsys):
    monkeypatch.setattr(tool_connect, "find_client", lambda: None)
    assert tool_connect.main() == 1
    assert "tool_tunnel_client_missing" in capsys.readouterr().out


def test_saved_configuration_reuses_profile_and_never_claims_host_verified(onboarding, monkeypatch, capsys):
    calls = []
    def run(args, **kwargs):
        calls.append(args)
        assert kwargs["env"]["CONTROL_PLANE_API_KEY"] == "sk-private-tunnel-marker"
        return SimpleNamespace(returncode=0)
    monkeypatch.setattr(tool_connect.subprocess, "run", run)
    assert tool_connect.main() == 0
    assert tool_connect.main() == 0
    assert [c[1] for c in calls] == ["init", "doctor", "run", "doctor", "run"]
    assert "sk-private-tunnel-marker" not in capsys.readouterr().out
    assert json.loads((onboarding.data_dir / "tunnel-credential.json").read_text())["runtime_key"] == "sk-private-tunnel-marker"


def test_no_runtime_credential_does_not_call_client(onboarding, monkeypatch, capsys):
    monkeypatch.delenv("CONTROL_PLANE_API_KEY")
    monkeypatch.setattr(tool_connect.getpass, "getpass", lambda _: "")
    monkeypatch.setattr(tool_connect.subprocess, "run", lambda *a, **k: pytest.fail("No credentials, no client run"))
    assert tool_connect.main() == 1
    assert "tool_tunnel_credentials_missing" in capsys.readouterr().out


def test_access_invalid_ascii_or_unicode_is_false(onboarding):
    from app.services.tool_access import ToolAccess
    access = ToolAccess(onboarding)
    assert not access.authorized("Bearer 密钥")
    assert not access.authorized("Bearer " + "x" * 64)
    assert not access.authorized(None)
    assert not access.path.exists()
