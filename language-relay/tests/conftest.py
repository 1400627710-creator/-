import pytest
from fastapi.testclient import TestClient

from app.config import Config
from app.main import create_app
from tests.fakes import ScriptedTransport


@pytest.fixture
def config(tmp_path):
    return Config(data_dir=tmp_path / "data", api_key="sk-local-test-key", llm_budget_seconds=1.0)


@pytest.fixture
def transport():
    return ScriptedTransport()


@pytest.fixture
def app(config, transport):
    return create_app(config, transport=transport)


@pytest.fixture
def client(app):
    with TestClient(app, headers={"X-Relay-Client": "local"}) as result:
        yield result
