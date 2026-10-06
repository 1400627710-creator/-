"""Install and start the local app using only the Python standard library."""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import webbrowser
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def startup_result(installer, operation, outcome, code=None):
    try:
        from diagnose import record_operation
        record_operation(installer.root / ".data", operation, installer.stage, outcome, code)
    except (ImportError, OSError):
        pass


MODULES = (
    "fastapi", "uvicorn", "pydantic", "sqlalchemy", "openai", "jinja2", "dotenv",
    "httpx", "httpx2", "pytest", "pytest_asyncio", "jwt", "cryptography", "mcp",
)
PROBE = """
import json, sys
print(json.dumps({"version": list(sys.version_info[:2]), "prefix": sys.prefix, "base": sys.base_prefix}))
"""
CHECK_PACKAGES = """
import importlib, importlib.metadata, json, sys
expected = json.loads(sys.argv[1])
assert all(importlib.metadata.version(name) == version for name, version in expected.items())
for name in json.loads(sys.argv[2]):
    importlib.import_module(name)
"""


class InstallError(Exception):
    pass


class AlreadyRunningError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def write_runtime(root: Path, instance: str, port: int, version: str):
    folder = root / ".data"
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=folder, delete=False) as stream:
            temporary = Path(stream.name)
            if os.name != "nt":
                temporary.chmod(0o600)
            json.dump({"instance": instance, "port": port, "version": version}, stream)
        os.replace(temporary, folder / "active-server.json")
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def reopen_running(root: Path = ROOT, *, no_browser=False) -> bool:
    """Reopen this project's verified server, never a guessed port or redirect."""
    try:
        path = root / ".data/active-server.json"
        if path.stat().st_size > 4096:
            return False
        record = json.loads(path.read_text(encoding="utf-8"))
        port, instance = record["port"], record["instance"]
        if type(port) is not int or not 8000 <= port <= 8010 or not isinstance(instance, str) or not re.fullmatch(r"[0-9a-f]{32}", instance):
            return False
        url = f"http://127.0.0.1:{port}"
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        with opener.open(url + "/api/runtime", timeout=1) as response:
            info = json.loads(response.read(4097))
        if not isinstance(info, dict) or info.get("application") != "language-relay" or info.get("instance") != instance or info.get("port") != port:
            return False
        match = re.search(r'APP_VERSION\s*=\s*["\']([0-9.]+)["\']', (root / "app/main.py").read_text(encoding="utf-8"))
        if not match or info.get("version") != match[1]:
            raise InstallError("此文件夹的旧版服务仍在运行。请先关闭旧启动窗口，再双击“启动中继器.bat”打开新版。")
        if not no_browser:
            webbrowser.open(url)
        print(f"中继器已经运行，已找到本项目的页面：{url}", flush=True)
        return True
    except urllib.error.HTTPError as error:
        error.close()
        return False
    except (OSError, ValueError, KeyError, TypeError, urllib.error.URLError):
        return False


@contextmanager
def project_lock(path: Path):
    """OS releases the lock even if a launcher is killed or its PC restarts."""
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with path.open("a+b") as stream:
        stream.seek(0, os.SEEK_END)
        if stream.tell() == 0:
            stream.write(b"\0")
            stream.flush()
        stream.seek(0)
        if os.name == "nt":
            import msvcrt

            try:
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError:
                raise AlreadyRunningError from None
        else:
            import fcntl

            try:
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise AlreadyRunningError from None
        try:
            yield
        finally:
            if os.name == "nt":
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


class Installer:
    def __init__(self, root: Path = ROOT):
        self.root = root
        self.venv = root / ".venv"
        self.python = self.venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        self.log = root / ".data" / "install.log"
        self.stage = "python_environment"
        self.env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
        # A moved/activated environment must not control creation of the new one.
        self.env.pop("PYTHONHOME", None)
        self.env.pop("PYTHONPATH", None)

    def message(self, value: str):
        print(value, flush=True)
        with self.log.open("a", encoding="utf-8") as stream:
            stream.write(value + "\n")

    def run(self, command: list[str], *, timeout: float | None = None, quiet: bool = False) -> bool:
        if quiet:
            try:
                result = subprocess.run(
                    command, cwd=self.root, env=self.env, stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL, timeout=timeout, check=False,
                )
                return result.returncode == 0
            except (OSError, subprocess.TimeoutExpired):
                return False
        # Only setup commands are logged. The app's messages, settings and API key
        # are never read here, and the running app's output is not captured.
        with self.log.open("a", encoding="utf-8") as stream:
            with subprocess.Popen(
                command, cwd=self.root, env=self.env, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
            ) as process:
                assert process.stdout is not None
                for line in process.stdout:
                    print(line, end="", flush=True)
                    stream.write(line)
                return process.wait() == 0

    def valid_environment(self) -> bool:
        if not self.python.is_file():
            return False
        try:
            result = subprocess.run(
                [str(self.python), "-I", "-c", PROBE], cwd=self.root, env=self.env,
                capture_output=True, text=True, encoding="utf-8", timeout=10, check=False,
            )
            data = json.loads(result.stdout)
            return (
                result.returncode == 0 and tuple(data["version"]) >= (3, 11)
                and Path(data["prefix"]).resolve() == self.venv.resolve()
                and Path(data["prefix"]).resolve() != Path(data["base"]).resolve()
            )
        except (OSError, subprocess.TimeoutExpired, ValueError, KeyError, TypeError):
            return False

    def prepare_environment(self):
        if self.valid_environment():
            return
        if self.venv.exists() or self.venv.is_symlink():
            backup = self.root / f".venv-backup-{time.time_ns()}"
            self.venv.rename(backup)
            self.message(f"旧程序环境无法使用，已保留为 {backup.name}，正在重新建立。")
        else:
            self.message("第 1/3 步：正在建立本机程序环境。")
        if not self.run([sys.executable, "-m", "venv", str(self.venv)]):
            raise InstallError(
                "无法建立程序环境。Windows 请修复或重新安装完整的 Python 3.11 或更新版本；"
                "Linux 请安装对应的 python3-venv 组件后重试。"
            )
        if not self.valid_environment():
            raise InstallError("程序环境校验失败，请将整个项目解压到可写的普通文件夹后重新启动。")

    def expected_packages(self) -> dict[str, str]:
        expected = {}
        for line in (self.root / "requirements.txt").read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            match = re.fullmatch(r"([A-Za-z0-9_.-]+)==([A-Za-z0-9_.+-]+)", line)
            if not match:
                raise InstallError("requirements.txt 的格式不正确，请重新解压完整安装包。")
            expected[match[1]] = match[2]
        if not expected:
            raise InstallError("依赖清单为空，请重新解压完整安装包。")
        return expected

    def packages_ready(self, expected: dict[str, str]) -> bool:
        return self.run(
            [str(self.python), "-I", "-c", CHECK_PACKAGES, json.dumps(expected), json.dumps(MODULES)],
            quiet=True, timeout=30,
        ) and self.run([str(self.python), "-m", "pip", "check"], quiet=True, timeout=30)

    def install(self):
        if sys.version_info < (3, 11):  # noqa: UP036
            raise InstallError("需要完整的 64 位 Python 3.11 或更新版本，支持 Python 3.14。")
        self.stage = "application_files"
        if not all((self.root / name).is_file() for name in ("requirements.txt", "run.py", "app/main.py")):
            raise InstallError("文件不完整。请先完整解压 ZIP，再打开文件夹里的 start.bat。")
        self.log.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.message("语言转换指令中继器：正在检查安装环境。")
        self.stage = "python_environment"
        self.prepare_environment()
        self.stage = "dependency_install"
        if not self.run([str(self.python), "-m", "pip", "--version"], quiet=True, timeout=15):
            self.message("正在恢复缺失的 pip 安装工具。")
            if not self.run([str(self.python), "-m", "ensurepip", "--upgrade"]):
                raise InstallError("无法恢复 pip，请修复或重新安装当前的完整 Python 后再次启动。")
        self.stage = "dependency_validation"
        expected = self.expected_packages()
        if not self.packages_ready(expected):
            self.message("第 2/3 步：正在安装或修复依赖，请保持联网并等待完成。")
            self.stage = "dependency_install"
            if not self.run([
                str(self.python), "-m", "pip", "install", "--disable-pip-version-check",
                "--timeout", "20", "--retries", "2", "--upgrade", "--force-reinstall",
                "-r", str(self.root / "requirements.txt"),
            ]):
                raise InstallError(
                    "依赖安装失败。上方是具体下载或安装错误；请检查网络，稍后重新双击 start.bat。"
                    "详细安装记录在 .data/install.log。"
                )
            self.stage = "dependency_validation"
            if not self.packages_ready(expected):
                raise InstallError("依赖校验未通过，请查看 .data/install.log，并重新解压最新版到新文件夹安装。")
        self.message("第 3/3 步：依赖与程序环境校验通过。")


def main() -> int:
    parser = argparse.ArgumentParser(description="安装并启动本机中继器")
    parser.add_argument("--install-only", action="store_true", help="仅检查和安装，不启动网页服务")
    parser.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    args = parser.parse_args()
    installer = Installer()
    try:
        with project_lock(ROOT / ".data" / "startup.lock"):
            installer.install()
            startup_result(installer, "installation", "ok")
            if args.install_only:
                return 0
            command = [str(installer.python), str(ROOT / "run.py")]
            if args.no_browser:
                command.append("--no-browser")
            installer.stage = "server_start"
            result = subprocess.call(command, cwd=ROOT, env=installer.env)
            if result not in (0, 130):
                startup_result(installer, "server_start", "error", "server_start_failed")
            return result
    except AlreadyRunningError:
        try:
            if reopen_running(no_browser=args.no_browser):
                return 0
        except InstallError as error:
            installer.stage = "server_start"
            startup_result(installer, "server_start", "error", "server_start_failed")
            print(str(error), flush=True)
            return 1
        print("已有启动窗口正在安装或运行。请回到原窗口，按显示的网址打开浏览器。", flush=True)
        return 0
    except InstallError as error:
        startup_result(installer, "installation", "error", "startup_install_failed")
        print(f"\n安装未完成：{error}", flush=True)
        return 1
    except OSError:
        startup_result(installer, "installation", "error", "startup_write_failed")
        print("\n无法写入程序文件。请把完整项目解压到桌面或文档文件夹，再重新启动。", flush=True)
        return 1
    except KeyboardInterrupt:
        print("\n已停止。下次启动会重新检查并接续安装。", flush=True)
        return 130


if __name__ == "__main__":
    # Do not depend on packages being present, or on Windows' console encoding.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    raise SystemExit(main())
