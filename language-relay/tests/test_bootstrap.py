"""Installer boundaries; no downloads or real OpenAI calls in pytest."""

import importlib.metadata
import os
import socket
import subprocess
import sys
from pathlib import Path

import pytest

from bootstrap import AlreadyRunningError, Installer, InstallError, project_lock
from run import available_port


@pytest.fixture
def installer(tmp_path):
    root = tmp_path / "中文安装路径 with spaces"
    (root / "app").mkdir(parents=True)
    (root / "app/main.py").write_text("", encoding="utf-8")
    (root / "run.py").write_text("", encoding="utf-8")
    (root / "requirements.txt").write_text("fastapi==0.142.2\n", encoding="utf-8")
    instance = Installer(root)
    instance.log.parent.mkdir()
    return instance


def create_empty_env(installer):
    subprocess.run([sys.executable, "-m", "venv", "--without-pip", str(installer.venv)], check=True)


def test_real_environment_with_chinese_and_spaces_is_valid(installer):
    create_empty_env(installer)
    assert installer.valid_environment()
    installer.prepare_environment()
    assert not list(installer.root.glob(".venv-backup-*"))


def test_existing_global_python_cannot_pass_as_project_environment(installer):
    installer.python = Path(sys.executable)
    assert installer.valid_environment() is False


def test_broken_env_is_preserved_and_rebuilt_without_touching_user_data(installer):
    installer.python.parent.mkdir(parents=True)
    installer.python.write_bytes(b"broken executable")
    (installer.venv / ".relay-deps-1.0.ok").touch()
    secret_file = installer.root / ".data/api-key.json"
    history_file = installer.root / ".data/relay.sqlite3"
    env_file = installer.root / ".env"
    secret_file.write_bytes(b"private-key-fixture")
    history_file.write_bytes(b"history-fixture")
    env_file.write_bytes(b"OPENAI_API_KEY=private-env-fixture")
    installer.prepare_environment()
    assert installer.valid_environment()
    backups = list(installer.root.glob(".venv-backup-*"))
    assert len(backups) == 1
    relative = installer.python.relative_to(installer.venv)
    assert (backups[0] / relative).read_bytes() == b"broken executable"
    assert secret_file.read_bytes() == b"private-key-fixture"
    assert history_file.read_bytes() == b"history-fixture"
    assert env_file.read_bytes() == b"OPENAI_API_KEY=private-env-fixture"
    assert "private" not in installer.log.read_text(encoding="utf-8")


def test_missing_pip_is_recovered_offline(installer, monkeypatch):
    create_empty_env(installer)
    monkeypatch.setattr(installer, "packages_ready", lambda _: True)
    installer.install()
    assert installer.run([str(installer.python), "-m", "pip", "--version"], quiet=True)
    assert "恢复缺失的 pip" in installer.log.read_text(encoding="utf-8")


def test_old_marker_cannot_skip_missing_deps_and_failure_can_be_retried(installer, monkeypatch):
    create_empty_env(installer)
    (installer.venv / ".relay-deps-1.0.ok").touch()
    state = {"ready": False, "can_install": False, "attempts": 0}
    original_run = installer.run

    def run(command, **kwargs):
        if "install" in command and "-r" in command:
            state["attempts"] += 1
            assert "--force-reinstall" in command
            state["ready"] = state["can_install"]
            return state["can_install"]
        return original_run(command, **kwargs)

    monkeypatch.setattr(installer, "run", run)
    monkeypatch.setattr(installer, "packages_ready", lambda _: state["ready"])
    with pytest.raises(InstallError, match="依赖安装失败"):
        installer.install()
    assert state["attempts"] == 1
    state["can_install"] = True
    installer.install()
    assert state["attempts"] == 2


@pytest.mark.parametrize("content", ["", "# empty\n", "fastapi>=0.1\n", "-r elsewhere.txt\n"])
def test_invalid_dependency_manifest_has_actionable_error(installer, content):
    (installer.root / "requirements.txt").write_text(content, encoding="utf-8")
    with pytest.raises(InstallError, match="依赖清单|requirements.txt"):
        installer.expected_packages()


def test_changed_pinned_version_is_detected_from_installed_packages(installer):
    installer.python = Path(sys.executable)
    expected = {"fastapi": importlib.metadata.version("fastapi")}
    # pip availability is not relevant to this check's version comparison.
    expected["fastapi"] = "0.0.0"
    assert installer.packages_ready(expected) is False


def test_os_lock_blocks_duplicate_launcher_and_is_released(tmp_path):
    path = tmp_path / "startup.lock"
    with project_lock(path):
        with pytest.raises(AlreadyRunningError), project_lock(path):
            pytest.fail("second launcher acquired the lock")
    with project_lock(path):
        assert path.exists()


def test_busy_default_port_uses_another_local_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as occupied:
        try:
            occupied.bind(("127.0.0.1", 8000))
        except OSError:
            pass  # Another local process has already occupied it.
        else:
            occupied.listen()
        port = available_port()
        assert 8000 < port <= 8010


def test_child_environment_does_not_inherit_python_path_override(installer, monkeypatch):
    monkeypatch.setenv("PYTHONHOME", "invalid-python-home")
    monkeypatch.setenv("PYTHONPATH", "invalid-python-path")
    child = Installer(installer.root)
    assert "PYTHONHOME" not in child.env and "PYTHONPATH" not in child.env
    assert child.env["PYTHONUTF8"] == "1"
    assert os.environ["PYTHONHOME"] == "invalid-python-home"
