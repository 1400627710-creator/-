from dataclasses import replace

from fastapi.testclient import TestClient

from app.main import create_app
from tests.fakes import ScriptedTransport


def test_corrupt_key_file_does_not_block_settings_ui(config):
    config.data_dir.mkdir(parents=True)
    (config.data_dir / "api-key.json").write_text("broken JSON", encoding="utf-8")
    with TestClient(
        create_app(config, transport=ScriptedTransport()), headers={"X-Relay-Client": "local"}
    ) as client:
        assert client.get("/").status_code == 200
        assert client.get("/api/settings").json()["openai_api_key_set"] is False
        sid = client.post("/api/sessions", json={}).json()["id"]
        error = client.post(f"/api/sessions/{sid}/messages", json={"content": "我想做卡牌游戏"})
        assert error.json()["detail"]["code"] == "settings_unreadable"
        assert client.put("/api/settings", json={"openai_api_key": "sk-repaired"}).status_code == 200
        assert client.post(f"/api/sessions/{sid}/retry").status_code == 200


def test_env_key_is_available_without_copying_it_into_sqlite(config):
    with TestClient(create_app(replace(config, api_key="sk-env-only"))) as client:
        assert client.get("/api/settings").json()["openai_api_key_set"] is True
        assert not (config.data_dir / "api-key.json").exists()
        assert b"sk-env-only" not in (config.data_dir / "relay.sqlite3").read_bytes()
