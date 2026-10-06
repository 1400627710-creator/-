"""Interactive local onboarding for the official OpenAI tunnel-client."""
import getpass
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import time

import httpx

from app.config import PROJECT_ROOT, Config, valid_api_key_format
from app.errors import RelayError
from diagnose import atomic_json, record_operation, utc_now
from mcp_stdio import discover


def find_client():
    name = "tunnel-client.exe" if os.name == "nt" else "tunnel-client"
    for candidate in (PROJECT_ROOT / name, PROJECT_ROOT / "bin" / name):
        if candidate.is_file():
            return str(candidate)
    return shutil.which("tunnel-client")


def get_server(config, seconds=30):
    deadline = time.monotonic() + seconds
    while True:
        try:
            url = discover(config)
            with httpx.Client(trust_env=False, timeout=2) as client:
                response = client.get(url + "/api/runtime")
                response.raise_for_status()
                data = response.json()
                if data.get("application") == "language-relay" and data.get("version") == "1.3.0":
                    return url
        except (RelayError, httpx.HTTPError, ValueError):
            pass
        if time.monotonic() >= deadline:
            raise RelayError("tool_server_unreachable", "未找到 1.3.0 中继器。请完整解压新包，先运行启动中继器.bat，保持窗口打开。", 503)
        time.sleep(0.5)


def failure_report(config, error):
    report = {"application": "language-relay", "app_version": "1.3.0", "created_at": utc_now(),
              "source": "tool_launcher", "problem_stage": "tool_connection",
              "error_code": error.code, "message": error.message, "model_inference_performed": False,
              "external_host_verified": False,
              "privacy": {"credentials_exported": False, "ideas_or_history_exported": False, "automatic_upload": False}}
    record_operation(config.data_dir, "connection", "tool_connection", "error", error.code, provider="tool")
    folder = PROJECT_ROOT / "diagnostics"
    atomic_json(folder / "relay-tool-launcher.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print("以上为安全报错；同一报告保存在 diagnostics/relay-tool-launcher.json，可直接反馈。")


def main():
    config = Config.from_env()
    try:
        url = get_server(config)
        binary = find_client()
        if not binary:
            raise RelayError("tool_tunnel_client_missing",
                             "未找到官方 tunnel-client。请从 https://github.com/openai/tunnel-client/releases/latest 下载完整 Windows 64位 client，解压后把 tunnel-client.exe 放在中继器目录。不要选 runtime 版。", 503)
        with httpx.Client(base_url=url, trust_env=False, timeout=10, headers={"X-Relay-Client": "local"}) as client:
            check = client.post("/api/tools/check").json()
            if not check.get("ok"):
                raise RelayError(check.get("code") or "tool_protocol_mismatch", check.get("message", "本机 MCP 自检未通过。"), 503)
            setup = client.get("/api/tools/setup").json()
            tunnel_id = setup["tunnel_id"] or input("请输入官方 Tunnel ID（在官方隧道设置创建，不是模型 Key）：").strip()
            if not re.fullmatch(r"tunnel_[A-Za-z0-9_-]{5,150}", tunnel_id):
                raise RelayError("tool_tunnel_id_missing", "Tunnel ID 缺失或格式错误。请按 TOOL_GUIDE.md 在官方隧道设置创建。", 400)
            saved = client.put("/api/tools/setup", json={"tunnel_id": tunnel_id})
            saved.raise_for_status()
            mode = client.put("/api/settings", json={"provider": "tool"})
            mode.raise_for_status()
        credential = config.data_dir / "tunnel-credential.json"
        key = os.environ.get("CONTROL_PLANE_API_KEY", "")
        if not key and credential.exists():
            try:
                key = json.loads(credential.read_text(encoding="utf-8")).get("runtime_key", "")
            except (OSError, ValueError, AttributeError):
                key = ""
        if not key:
            key = getpass.getpass("请输入你自己的官方隧道运行凭据（隐藏输入，仅保存本机）：").strip()
        if not isinstance(key, str) or not key or not valid_api_key_format(key):
            raise RelayError("tool_tunnel_credentials_missing", "未提供有效的官方隧道运行凭据。此凭据用于工具连接，中继器不会用它请求模型。", 400)
        atomic_json(credential, {"runtime_key": key})
        credential.chmod(0o600)
        env = {**os.environ, "CONTROL_PLANE_API_KEY": key, "RELAY_DATA_DIR": str(config.data_dir), "PYTHONUTF8": "1"}
        argv = [sys.executable, str(PROJECT_ROOT / "mcp_stdio.py"), "--url", url]
        command = subprocess.list2cmdline(argv) if os.name == "nt" else shlex.join(argv)
        signature = hashlib.sha256((tunnel_id + command).encode()).hexdigest()
        state_file = config.data_dir / "tunnel-local-state.json"
        try:
            initialized = json.loads(state_file.read_text(encoding="utf-8")).get("signature") == signature
        except (OSError, ValueError, AttributeError):
            initialized = False
        if not initialized:
            try:
                result = subprocess.run([binary, "init", "--sample", "sample_mcp_stdio_local", "--profile", "language-relay",
                                         "--tunnel-id", tunnel_id, "--mcp-command", command], env=env, capture_output=True,
                                        stdin=subprocess.DEVNULL, timeout=30, check=False)
            except (OSError, subprocess.TimeoutExpired):
                raise RelayError("tool_tunnel_configuration_failed", "官方隧道配置未完成。请核对官方 client 版本和隧道权限；不要把原始日志或凭据公开上传。", 503) from None
            if result.returncode != 0:
                raise RelayError("tool_tunnel_configuration_failed", "官方 client 拒绝了配置。运行 tunnel-client help quickstart 核对本机 profile；若已有同名 profile，请按官方说明修复，不会自动覆盖它。", 503)
            atomic_json(state_file, {"signature": signature})
        try:
            doctor = subprocess.run([binary, "doctor", "--profile", "language-relay", "--explain"], env=env,
                                    capture_output=True, stdin=subprocess.DEVNULL, timeout=30, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise RelayError("tool_tunnel_doctor_failed", "官方隧道诊断未完成。请核对联网、隧道权限和工作区关联。", 503) from None
        if doctor.returncode != 0:
            raise RelayError("tool_tunnel_doctor_failed", "官方隧道 doctor 未通过。请在官方 client 的本机管理页核对连接与权限。报错只证明此阶段失败，未推断账号或地区原因。", 503)
        record_operation(config.data_dir, "connection", "tool_connection", "ok", provider="tool")
        print("本机接口及官方隧道 doctor 已通过。现在运行隧道，请保持本窗口打开。")
        print("在 https://chatgpt.com/plugins 添加自定义 MCP，选择 Tunnel，使用已保存的 Tunnel ID，创建并安装。")
        print("新对话选择该插件后发送想法；本机页面收到调用后会更新状态。")
        result = subprocess.run([binary, "run", "--profile", "language-relay"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                stdin=subprocess.DEVNULL, check=False)
        if result.returncode != 0:
            raise RelayError("tool_tunnel_stopped", "官方隧道停止且返回错误。请保留本机管理页状态，重新运行连接启动器并反馈安全报错。", 503)
        return 0
    except (KeyboardInterrupt, EOFError):
        return 0
    except RelayError as error:
        failure_report(config, error)
        return 1
    except Exception:
        failure_report(config, RelayError("tool_tunnel_configuration_failed", "工具连接启动未完成，请反馈此安全报告。", 503))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
