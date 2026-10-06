"""Start the private app on loopback only."""

import argparse
import json
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
import webbrowser

from bootstrap import (
    ROOT,
    AlreadyRunningError,
    InstallError,
    NoRedirect,
    project_lock,
    reopen_running,
    write_runtime,
)


def available_port() -> int:
    for port in range(8000, 8011):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            try:
                listener.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError("8000–8010 端口均被占用，请关闭其他启动窗口后重试。")


def open_when_ready(url: str, instance: str):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        try:
            with opener.open(url + "/api/runtime", timeout=0.5) as response:
                info = json.loads(response.read(4096))
                if response.status == 200 and isinstance(info, dict) and info.get("application") == "language-relay" and info.get("instance") == instance:
                    webbrowser.open(url)
                    return
        except urllib.error.HTTPError as error:
            error.close()
        except (OSError, ValueError, urllib.error.URLError):
            pass
        time.sleep(0.1)

def start(no_browser: bool):
    if sys.version_info < (3, 11):  # noqa: UP036 - Give a useful error before importing the app.
        raise SystemExit("请安装 Python 3.11 或更新版本。")
    try:
        import uvicorn

        from app.main import app
    except ImportError:
        raise SystemExit("依赖尚未安装完整，请双击 start.bat 或运行 sh start.sh 自动检查和修复。") from None
    except (OSError, ValueError):
        raise SystemExit("本地配置或数据目录无法使用，请检查 .env 的温度、模型和目录设置后重新启动。") from None
    try:
        port = available_port()
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
    url = f"http://127.0.0.1:{port}"
    instance = uuid.uuid4().hex
    app.state.launcher_instance = instance
    write_runtime(ROOT, instance, port, app.version)

    print("语言转换指令中继器 · 私人版")
    if port != 8000:
        print(f"8000 端口已被占用，本次使用 {port} 端口。")
    print(f"请在浏览器打开 {url}")
    print("关闭此窗口会停止服务；会话记录仍保存在本机。")
    if not no_browser:
        threading.Thread(target=open_when_ready, args=(url, instance), daemon=True).start()
    try:
        uvicorn.run(app, host="127.0.0.1", port=port, workers=1, proxy_headers=False, access_log=False)
    finally:
        (ROOT / ".data/active-server.json").unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="启动私人版中继器")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    try:
        with project_lock(ROOT / ".data" / "server.lock"):
            start(args.no_browser)
    except AlreadyRunningError:
        try:
            if reopen_running(no_browser=args.no_browser):
                raise SystemExit(0)
        except InstallError as error:
            raise SystemExit(str(error)) from None
        raise SystemExit("本项目已经运行，请使用原启动窗口显示的网址。") from None
    except OSError:
        raise SystemExit("项目文件夹无法写入，请将完整项目移到桌面或文档文件夹后重新启动。") from None
