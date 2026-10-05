"""Dependency-free, local-only diagnostics; also shared by the running app.

Reports are built from allowlisted fields. Never export credentials, callback
parameters, account identifiers, environment values, provider bodies or logs.
"""
import argparse
import concurrent.futures
import importlib.metadata
import json
import math
import os
import platform
import re
import socket
import ssl
import struct
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path

DIAGNOSTIC_VERSION = "1.1.2"
DISCOVERY_URL = "https://auth.openai.com/.well-known/openid-configuration"
JWKS_URL = "https://auth.openai.com/.well-known/jwks.json"
PLAN_SCOPE = "chatgpt.tokens.use.direct"
SCOPES = ("openid", "profile", "email", "offline_access", "resource.invoke", PLAN_SCOPE)
PACKAGES = ("fastapi", "uvicorn", "pydantic", "SQLAlchemy", "openai", "Jinja2", "python-dotenv", "httpx", "httpx2", "PyJWT", "cryptography")
PROVIDER_CODES = frozenset({
    "invalid_grant", "invalid_refresh_token", "refresh_token_reused", "token_expired",
    "refresh_token_expired", "refresh_token_invalidated", "refresh_token_invalid",
    "invalid_client", "invalid_request", "unauthorized_client", "access_denied",
    "insufficient_scope", "login_required", "consent_required", "interaction_required",
    "server_error", "temporarily_unavailable", "permission_denied", "model_not_found",
    "unsupported_country_region_territory", "account_deactivated", "organization_deactivated",
    "subscription_sharing_user_not_eligible", "subscription_sharing_usage_limit_exceeded",
    "subscription_sharing_usage_unavailable", "subscription_sharing_user_unavailable",
    "subscription_sharing_unsupported_capability", "subscription_sharing_route_not_supported",
    "subscription_sharing_invalid_user", "chatpass_v2_scope_not_authorized",
    "chatpass_v2_invalid_authorization_context",
})
LOCAL_CODES = frozenset({
    "chatgpt_connected", "chatgpt_signed_out", "chatgpt_login_pending", "chatgpt_login_cancelled",
    "chatgpt_login_interrupted", "chatgpt_consent_denied", "chatgpt_client_invalid",
    "chatgpt_code_missing", "chatgpt_state_invalid", "chatgpt_identity_invalid",
    "chatgpt_account_mismatch", "chatgpt_token_invalid", "chatgpt_plan_not_enabled",
    "chatgpt_login_required", "chatgpt_login_expired", "chatgpt_auth_unreadable",
    "chatgpt_not_eligible", "chatgpt_auth_forbidden", "chatgpt_client_rejected",
    "chatgpt_scope_rejected", "chatgpt_auth_unavailable", "chatgpt_auth_connection",
    "chatgpt_auth_response_invalid", "chatgpt_auth_gateway", "chatgpt_auth_redirect",
    "chatgpt_callback_invalid", "chatgpt_model_catalog_pending", "auth_endpoint_invalid",
    "auth_write_failed", "chatgpt_scope_check_passed",
})
STAGES = {
    "authorization_start": "打开官方授权页", "callback": "接收并检查本机回调",
    "client_registration": "保存客户端注册", "token_exchange": "交换授权码",
    "discovery": "获取身份验证配置", "jwks": "获取签名公钥",
    "verify_identity": "验证身份签名", "scope_check": "检查计划授权权限",
    "save_credentials": "保存本机授权", "models": "获取可用模型",
    "token_refresh": "刷新授权", "local_authorization": "检查本机调用授权",
    "revocation": "撤销授权", "auth_discovery": "检查官方授权网络",
    "auth_jwks": "检查官方签名网络", "model_permission": "检查模型列表权限",
    "unknown": "未记录阶段",
}
PHASES = frozenset({"waiting_callback", "token_exchange", "verify_identity", "loading_models", "plan_required", "connected", "expired", "failed", "signed_out"})
SHAPES = frozenset({"json_error_object", "json_error_string", "json_detail", "json_object", "json_array", "html", "text", "empty", "invalid_json"})
NETWORK_CODES = frozenset({"dns_failure", "tls_failure", "network_timeout", "network_connection", "network_interrupted"})


def utc_now():
    return datetime.now(UTC).isoformat(timespec="seconds")


def read_json(path):
    try:
        if path.stat().st_size > 1024 * 1024:
            return None
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def atomic_json(path, value):
    temporary = None
    try:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            if os.name != "nt":
                temporary.chmod(0o600)
            json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def safe_number(value, minimum, maximum):
    try:
        return value if type(value) in (int, float) and math.isfinite(value) and minimum <= value <= maximum else None
    except OverflowError:
        return None


def safe_version(value):
    return value if isinstance(value, str) and re.fullmatch(r"[0-9][0-9A-Za-z.+-]{0,35}", value) else "unknown"


def mapping(value):
    return value if isinstance(value, dict) else {}


def enum_value(value, allowed, default=None):
    return value if isinstance(value, str) and value in allowed else default


def http_evidence(status, headers, content):
    """Inspect the shape and a known symbolic code, never the actual error text."""
    data = None
    try:
        if content and len(content) <= 1024 * 1024:
            data = json.loads(content)
    except (ValueError, TypeError, UnicodeError):
        pass
    code = None
    if isinstance(data, dict):
        error = data.get("error")
        shape = "json_error_object" if isinstance(error, dict) else "json_error_string" if isinstance(error, str) else "json_detail" if "detail" in data else "json_object"
        candidate = error.get("code", error.get("type")) if isinstance(error, dict) else error
        code = candidate if isinstance(candidate, str) and candidate in PROVIDER_CODES else "unrecognized" if candidate is not None else None
    elif isinstance(data, list):
        shape = "json_array"
    elif not content:
        shape = "empty"
    else:
        shape = "html" if "html" in headers.get("content-type", "").lower() or content.lstrip()[:20].lower().startswith((b"<!doctype html", b"<html")) else "invalid_json" if "json" in headers.get("content-type", "").lower() else "text"
    request_id = headers.get("x-request-id", headers.get("request-id", ""))
    request_id_safe = request_id if isinstance(request_id, str) and re.fullmatch(r"req_[0-9a-fA-F]{16,64}", request_id) else None
    evidence = {"http_status": status, "body_shape": shape, "provider_code": code, "request_id": request_id_safe, "request_id_present": bool(request_id)}
    try:
        server_time = parsedate_to_datetime(headers.get("date", ""))
        if server_time.tzinfo:
            skew = round(time.time() - server_time.timestamp())
            evidence["clock_skew_seconds"] = safe_number(skew, -315360000, 315360000)
    except (ValueError, TypeError, OverflowError):
        pass
    return evidence


def network_error(error):
    """Exception types only: exception messages can contain URLs and secrets."""
    current, seen = error, set()
    for _ in range(10):
        if current is None or id(current) in seen:
            break
        seen.add(id(current))
        if isinstance(current, socket.gaierror):
            return "dns_failure"
        if isinstance(current, ssl.SSLError):
            return "tls_failure"
        if isinstance(current, (TimeoutError, socket.timeout)) or "Timeout" in type(current).__name__:
            return "network_timeout"
        current = getattr(current, "reason", None) or getattr(current, "__cause__", None) or getattr(current, "__context__", None)
    return "network_connection"


def clean_event(value):
    if not isinstance(value, dict):
        return None
    stage = enum_value(value.get("stage"), STAGES, "unknown")
    out = {"stage": stage, "outcome": enum_value(value.get("outcome"), {"ok", "error", "warning", "skipped"}, "warning")}
    for key, low, high in (("elapsed_ms", 0, 86400000), ("duration_ms", 0, 300000), ("http_status", 100, 599), ("clock_skew_seconds", -315360000, 315360000), ("visible_models_count", 0, 1000)):
        number = safe_number(value.get(key), low, high)
        if number is not None:
            out[key] = number
    for key, allowed in (("body_shape", SHAPES), ("provider_code", PROVIDER_CODES | {"unrecognized"}), ("code", LOCAL_CODES | NETWORK_CODES)):
        if isinstance(value.get(key), str) and value[key] in allowed:
            out[key] = value[key]
    rid = value.get("request_id")
    if isinstance(rid, str) and re.fullmatch(r"req_[0-9a-fA-F]{16,64}", rid):
        out["request_id"] = rid
    for key in ("request_id_present", "state_valid", "authorization_code_present", "client_id_present", "plan_scope_present"):
        if type(value.get(key)) is bool:
            out[key] = value[key]
    return out


def clean_trace(value):
    value = value if isinstance(value, dict) else {}
    events = value.get("events", [])
    events = events if isinstance(events, list) else []
    result = {"schema_version": 1, "events": [event for item in events[-40:] if (event := clean_event(item))], "storage_ok": value.get("storage_ok") is True}
    attempt = value.get("attempt_id")
    if isinstance(attempt, str) and re.fullmatch(r"[0-9a-f]{32}", attempt):
        result["attempt_id"] = attempt
    started = value.get("started_at")
    if isinstance(started, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00", started):
        result["started_at"] = started
    port = safe_number(value.get("callback_port"), 1, 65535)
    if port is not None:
        result["callback_port"] = int(port)
    if enum_value(value.get("registration_kind"), {"new", "returning"}):
        result["registration_kind"] = value["registration_kind"]
    first = clean_event(value.get("first_failure"))
    result["first_failure"] = first if first and first["outcome"] == "error" else next((event for event in result["events"] if event["outcome"] == "error"), None)
    return result


class LoginTrace:
    def __init__(self, path):
        self.path = path
        self.data = clean_trace(read_json(path))
        self.started = time.monotonic()
        self.elapsed_offset = max((event.get("elapsed_ms", 0) for event in self.data["events"]), default=0)

    def begin(self, port, returning):
        self.started = time.monotonic()
        self.elapsed_offset = 0
        self.data = {"attempt_id": uuid.uuid4().hex, "started_at": utc_now(), "callback_port": port, "registration_kind": "returning" if returning else "new", "events": [], "first_failure": None, "storage_ok": True}
        self.record("authorization_start", "ok")

    def record(self, stage, outcome, **fields):
        event = clean_event({"stage": stage, "outcome": outcome, "elapsed_ms": self.elapsed_offset + round((time.monotonic() - self.started) * 1000), **fields})
        self.data["events"] = [*self.data["events"], event][-40:]
        if outcome == "error" and not self.data.get("first_failure"):
            self.data["first_failure"] = event
        try:
            self.data["storage_ok"] = True
            atomic_json(self.path, clean_trace(self.data))
        except OSError:
            self.data["storage_ok"] = False

    def snapshot(self):
        return clean_trace(self.data)


def environment_snapshot():
    versions = {}
    for name in PACKAGES:
        try:
            versions[name] = safe_version(importlib.metadata.version(name))
        except importlib.metadata.PackageNotFoundError:
            versions[name] = "not_installed"
    system_proxy = None
    if os.name == "nt":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Internet Settings") as key:
                system_proxy = bool(winreg.QueryValueEx(key, "ProxyEnable")[0])
        except OSError:
            pass
    return {"python_version": platform.python_version(), "python_supported": sys.version_info >= (3, 11), "os": platform.system(), "bits": struct.calcsize("P") * 8, "windows_build": sys.getwindowsversion().build if os.name == "nt" else None, "packages": versions, "environment_proxy_set": any(bool(os.environ.get(name)) for name in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy")), "windows_browser_proxy_enabled": system_proxy, "backend_uses_environment_proxy": False}


def local_snapshot(data_dir):
    result = {"data_directory_exists": data_dir.is_dir(), "auth_file_exists": (data_dir / "chatgpt-auth.json").is_file(), "login_result_exists": (data_dir / "chatgpt-login-result.json").is_file(), "trace_exists": (data_dir / "chatgpt-login-trace.json").is_file(), "database_exists": (data_dir / "relay.sqlite3").is_file(), "key_file_exists": (data_dir / "api-key.json").is_file(), "data_directory_writable": False}
    try:
        data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        with tempfile.TemporaryFile(dir=data_dir) as stream:
            stream.write(b"diagnostic-write-check")
            stream.flush()
        result["data_directory_writable"] = True
    except OSError:
        pass
    return result


def auth_snapshot(data, status):
    data = data if isinstance(data, dict) else {}
    status = status if isinstance(status, dict) else {}
    scopes = data.get("scopes", [])
    scopes = scopes if isinstance(scopes, list) else []
    result = status.get("result") or {}
    result = result if isinstance(result, dict) else {}
    expires = safe_number(data.get("expires_at"), 0, 4102444800)
    return {**{key: status.get(key) is True for key in ("signed_in", "plan_enabled", "connected", "pending")}, "phase": enum_value(status.get("phase"), PHASES, "signed_out"), "result_code": enum_value(result.get("code"), LOCAL_CODES, "unrecognized"), "result_ok": result.get("ok") is True, "access_token_present": bool(data.get("access_token")), "refresh_token_present": bool(data.get("refresh_token")), "id_token_present": bool(data.get("id_token")), "issued_client_id_present": bool(data.get("client_id")), "host_registration_present": bool(data.get("host_id")), "token_expired": expires <= time.time() if expires is not None else None, "granted_scopes": [scope for scope in SCOPES if scope in scopes]}


def findings_for(auth, trace, local, probes, environment):
    findings = []
    def add(code, message, next_step, stage="unknown", level="error", certainty="observed"):
        findings.append({"code": code, "level": level, "certainty": certainty, "stage": stage, "message": message, "next_step": next_step})
    if not environment["python_supported"]:
        add("python_unsupported", "诊断进程的 Python 版本低于 3.11。", "使用已安装的 Python 3.14 或 Python 3.11+。")
    if not local.get("data_directory_writable"):
        add("data_write_failed", "数据目录写入检查失败。", "确认项目已完整解压到可写目录，再启动；保留原数据目录。", "save_credentials")
    if local.get("auth_record_unreadable"):
        add("auth_record_unreadable", "本机授权记录无法读取或格式不正确。", "先保留数据目录，使用连接与设置重新登录修复授权记录；不需要删除会话历史。", "save_credentials")
    if local.get("server_reachable") is False:
        add("server_not_detected", "未检测到唯一的中继器服务；当前报告来自独立诊断进程。", "保持启动窗口打开；有多个应用时用 --port 指定该窗口显示的端口。诊断进程的依赖版本可能不同于应用虚拟环境。", level="warning")
    first = trace.get("first_failure")
    if first and not auth.get("connected"):
        stage, provider = first["stage"], first.get("provider_code")
        label = STAGES[stage]
        suffix = f"（HTTP {first['http_status']}）" if first.get("http_status") else ""
        if provider == "subscription_sharing_user_not_eligible":
            add("plan_not_eligible", f"{label}被官方拒绝{suffix}，错误码明确表示所选用户、工作区或政策不满足计划使用条件。", "在官方设置中核对所选账号与工作区的应用权限；保留请求 ID 用于官方支持。重复刷新不能授予权限。", stage)
        elif provider in {"invalid_client", "unauthorized_client"}:
            add("client_registration_rejected", f"{label}失败{suffix}：上游拒绝客户端注册或配置。", "把此报告反馈给开发者，检查签发客户端、资源和回调的一致性；不要仅按地区限制处理。", stage)
        elif provider in {"insufficient_scope", "chatpass_v2_scope_not_authorized", "chatpass_v2_invalid_authorization_context"} or stage == "scope_check":
            add("plan_scope_missing", f"{label}未通过{suffix}。账号身份登录与计划调用授权是两项权限。", "检查官方授权页是否允许本应用使用计划；若官方明确拒绝，应先解决权限原因。", stage)
        elif first.get("body_shape") in {"html", "text", "invalid_json"}:
            add("non_json_response", f"{label}收到非预期的非 JSON 响应{suffix}。", "假设：可能涉及网络网关或服务边缘拦截。结合下面的网络检查与请求 ID 定位，不能据此认定账户不合格。", stage)
        elif first.get("http_status") == 403:
            add("authorization_forbidden_unknown", f"{label}被拒绝（HTTP 403）；现有安全错误码没有说明具体的账户、地区或工作区原因。", "把失败阶段、响应形状和请求 ID 反馈给开发者；先核对集成与官方权限，单纯刷新模型不会修复授权。", stage)
        else:
            add("authorization_stage_failed", f"{label}失败{suffix}，请结合事件中的错误码定位。", "将本报告反馈给开发者；若是过期回调，重新发起一次登录即可，勿反复使用旧回调。", stage)
    elif auth.get("result_code") == "chatgpt_not_eligible" and not auth.get("connected"):
        add("legacy_403_details_missing", "旧版曾收到 HTTP 403，但把它统一显示为账户、地区或工作区限制；没有保存具体阶段和上游错误码。", "升级到 1.1.2 后重新完成一次登录，再一键自检。旧记录无法还原被丢弃的上游细节。")
    elif auth.get("signed_in") and not auth.get("plan_enabled"):
        add("identity_without_plan", "本机保存了账号登录，但没有获准使用 ChatGPT 计划。", "需要官方授予计划调用权限后才能刷新模型或生成指令。", "scope_check")
    elif auth.get("pending"):
        add("callback_not_completed", "官方回调尚未完成，当前正在等待授权流程。", "完成官方页面后返回；如果一直等待，核对是否返回同一启动窗口的本机地址。", "callback", "warning")
    elif not auth.get("connected") and auth.get("selected_provider") != "api":
        add("local_grant_unavailable", "本机没有可用的 ChatGPT 计划授权。", "结合首次失败原因完成官方授权；刷新模型不能代替授权。", "local_authorization", "warning")
    if auth.get("selected_provider") == "api":
        add("api_key_present" if auth.get("api_key_configured") else "api_key_missing", "当前选择 API 密钥连接；" + ("已保存密钥。" if auth.get("api_key_configured") else "尚未配置密钥。"), "自检不调用模型，也不验证密钥的计费或生成权限。需要时可另行使用保存并检测连接。", level="info" if auth.get("api_key_configured") else "error")
    for probe in probes:
        if probe["outcome"] == "error":
            stage = probe["stage"]
            add("official_network_check_failed", f"本次{STAGES[stage]}未通过。", "查看该检查的 HTTP 状态、响应形状或 DNS/TLS/超时类别。公共网络检查成功也不等于获得计划权限。", stage)
            if probe.get("code") in NETWORK_CODES and (environment.get("environment_proxy_set") or environment.get("windows_browser_proxy_enabled")):
                add("network_settings_may_differ", "检测到代理配置，后端按现有设计直接连接官方服务。", "假设：浏览器与后端的网络配置可能不同，请核对本机正常访问官方服务的网络设置。报告不记录代理地址。", stage, "warning", "hypothesis")
        if abs(probe.get("clock_skew_seconds", 0)) > 120:
            add("clock_difference", "本机时钟与官方响应时间相差超过 120 秒。", "在 Windows 设置中同步日期与时间，再重新登录。响应时间仅作参考，不是独立授时验证。", probe["stage"], "warning")
        if probe.get("stage") == "model_permission" and probe.get("outcome") == "ok" and probe.get("visible_models_count") == 0:
            add("model_catalog_empty", "模型列表接口可达，但未返回可选择模型。", "核对账户模型权限；本次自检不会自行指定其他模型或计费方式。", "model_permission", "warning")
    if auth.get("connected"):
        add("local_grant_available", "本机保存了身份和计划授权。本次自检未调用模型，不能证明生成一定成功。", "可在设置中选择可用模型；实际生成若失败，保留新的错误并再次导出报告。", "local_authorization", "info")
    return findings


def make_report(*, app_version, environment, local, auth, trace, probes=(), network_requested=False, server_port=None, source="app"):
    # Rebuild a strict report even when reading a response from an older local app.
    environment, local, auth = mapping(environment), mapping(local), mapping(auth)
    packages = mapping(environment.get("packages"))
    env = {"python_version": safe_version(environment.get("python_version")), "python_supported": environment.get("python_supported") is True, "os": enum_value(environment.get("os"), {"Windows", "Linux", "Darwin"}, "other"), "bits": environment.get("bits") if type(environment.get("bits")) is int and environment["bits"] in {32, 64} else None, "windows_build": safe_number(environment.get("windows_build"), 0, 999999), "packages": {name: "not_installed" if packages.get(name) == "not_installed" else safe_version(packages.get(name)) for name in PACKAGES}, "environment_proxy_set": environment.get("environment_proxy_set") is True, "windows_browser_proxy_enabled": environment.get("windows_browser_proxy_enabled") if type(environment.get("windows_browser_proxy_enabled")) is bool else None, "backend_uses_environment_proxy": False}
    local_fields = ("data_directory_exists", "data_directory_writable", "auth_file_exists", "login_result_exists", "trace_exists", "database_exists", "key_file_exists", "auth_record_unreadable", "server_reachable", "legacy_app", "virtualenv_exists")
    clean_local = {key: local[key] for key in local_fields if type(local.get(key)) is bool}
    auth_fields = ("signed_in", "plan_enabled", "connected", "pending", "result_ok", "access_token_present", "refresh_token_present", "id_token_present", "issued_client_id_present", "host_registration_present", "token_expired", "api_key_configured")
    clean_auth = {key: auth[key] if type(auth.get(key)) is bool else None for key in auth_fields}
    granted = auth.get("granted_scopes") if isinstance(auth.get("granted_scopes"), list) else []
    clean_auth.update(phase=enum_value(auth.get("phase"), PHASES, "signed_out"), result_code=enum_value(auth.get("result_code"), LOCAL_CODES, "unrecognized"), granted_scopes=[scope for scope in SCOPES if scope in granted], selected_provider=enum_value(auth.get("selected_provider"), {"api", "chatgpt"}))
    clean_probes = [event for item in (probes if isinstance(probes, (list, tuple)) else [])[:5] if (event := clean_event(item))]
    clean_history = clean_trace(trace)
    findings = findings_for(clean_auth, clean_history, clean_local, clean_probes, env)
    return {"schema_version": 1, "application": "language-relay", "diagnostic_version": DIAGNOSTIC_VERSION, "app_version": safe_version(app_version), "report_id": uuid.uuid4().hex, "created_at": utc_now(), "source": source if source in {"app", "standalone", "standalone_legacy"} else "standalone", "server_port": int(server_port) if safe_number(server_port, 1, 65535) is not None else None, "environment": env, "local": clean_local, "authorization": clean_auth, "login_trace": clean_history, "network": {"requested": bool(network_requested), "model_inference_performed": False, "probes": clean_probes}, "findings": findings, "summary": "\n".join(item["message"] + " " + item["next_step"] for item in findings), "privacy": {"allowlisted_fields_only": True, "credentials_exported": False, "account_identifiers_exported": False, "callback_parameters_exported": False, "ideas_or_history_exported": False, "raw_logs_or_provider_bodies_exported": False, "automatic_upload": False}}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def get_bytes(url, *, body=None, timeout=6):
    # URLs only come from fixed official endpoints or validated loopback ports.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    request = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers={"X-Relay-Client": "local", "Content-Type": "application/json"})
    try:
        with opener.open(request, timeout=timeout) as response:
            return response.status, response.headers, response.read(1024 * 1024 + 1)
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read(1024 * 1024 + 1)


def public_probe(pair):
    stage, url = pair
    started = time.monotonic()
    try:
        status, headers, content = get_bytes(url)
        evidence = http_evidence(status, headers, content)
        success = status == 200 and evidence["body_shape"] == "json_object"
        if success:
            body = json.loads(content)
            success = (body.get("issuer") == "https://auth.openai.com" and body.get("jwks_uri") == JWKS_URL) if stage == "auth_discovery" else isinstance(body.get("keys"), list) and bool(body["keys"])
        return {"stage": stage, "outcome": "ok" if success else "error", "duration_ms": round((time.monotonic() - started) * 1000), **evidence}
    except (OSError, urllib.error.URLError, ValueError):
        error = sys.exception()
        return {"stage": stage, "outcome": "error", "code": network_error(error), "duration_ms": round((time.monotonic() - started) * 1000)}


def discover_server(port=None):
    def inspect(candidate):
        try:
            status, _, body = get_bytes(f"http://127.0.0.1:{candidate}/api/auth/chatgpt/status", timeout=0.6)
            data = json.loads(body)
            if status == 200 and isinstance(data, dict) and all(type(data.get(key)) is bool for key in ("connected", "signed_in", "plan_enabled", "pending")):
                return candidate, data
        except (OSError, urllib.error.URLError, ValueError):
            pass
        return None
    with concurrent.futures.ThreadPoolExecutor(max_workers=11) as pool:
        candidates = [result for result in pool.map(inspect, [port] if port else range(8000, 8011)) if result]
    return candidates[0] if len(candidates) == 1 else (None, {})


def standalone_report(project, *, port=None, offline=False):
    server_port, server_status = discover_server(port)
    if server_port:
        try:
            status, _, body = get_bytes(f"http://127.0.0.1:{server_port}/api/diagnostics/run", body={"check_network": not offline}, timeout=13)
            result = json.loads(body)
            if status == 200 and result.get("application") == "language-relay" and result.get("schema_version") == 1:
                return make_report(app_version=result.get("app_version"), environment=result.get("environment", {}), local=result.get("local", {}), auth=result.get("authorization", {}), trace=result.get("login_trace", {}), probes=result.get("network", {}).get("probes", []), network_requested=not offline, server_port=server_port, source="standalone")
        except (OSError, urllib.error.URLError, ValueError, AttributeError, TypeError):
            pass
    data_dir = project / ".data"
    # Honor a configured data directory without recording its path or other .env values.
    configured = os.environ.get("RELAY_DATA_DIR")
    if not configured:
        try:
            text = (project / ".env").read_text(encoding="utf-8-sig")
            match = re.search(r"(?m)^\s*RELAY_DATA_DIR\s*=\s*([^\r\n#]*)", text)
            configured = match[1].strip().strip("\"'") if match else None
        except (OSError, UnicodeError):
            pass
    if configured:
        candidate = Path(configured).expanduser()
        data_dir = candidate if candidate.is_absolute() else project / candidate
    data = read_json(data_dir / "chatgpt-auth.json")
    data = data if isinstance(data, dict) else {}
    result = read_json(data_dir / "chatgpt-login-result.json")
    trace = read_json(data_dir / "chatgpt-login-trace.json")
    if not server_status:
        scopes = data.get("scopes") if isinstance(data.get("scopes"), list) else []
        enabled = bool(data.get("access_token") and PLAN_SCOPE in scopes)
        expiry = safe_number(data.get("expires_at"), 0, 4102444800) or 0
        server_status = {"signed_in": bool(data.get("access_token") and data.get("id_token") and data.get("subject")), "plan_enabled": enabled, "connected": enabled and (expiry > time.time() or bool(data.get("refresh_token"))), "pending": False, "phase": "signed_out", "result": result}
    local = local_snapshot(data_dir)
    local.update(server_reachable=bool(server_port), legacy_app=bool(server_port), virtualenv_exists=(project / ".venv").is_dir(), auth_record_unreadable=(data_dir / "chatgpt-auth.json").exists() and not isinstance(read_json(data_dir / "chatgpt-auth.json"), dict))
    app_version = "unknown"
    try:
        text = (project / "app" / "main.py").read_text(encoding="utf-8")
        match = re.search(r'APP_VERSION\s*=\s*["\']([0-9.]+)["\']', text)
        app_version = match[1] if match else "unknown"
    except (OSError, UnicodeError):
        pass
    probes = []
    if not offline:
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            probes = list(pool.map(public_probe, [("auth_discovery", DISCOVERY_URL), ("auth_jwks", JWKS_URL)]))
    return make_report(app_version=app_version, environment=environment_snapshot(), local=local, auth=auth_snapshot(data, server_status), trace=trace, probes=probes, network_requested=not offline, server_port=server_port, source="standalone_legacy" if server_port else "standalone")


def main():
    parser = argparse.ArgumentParser(description="中继器一键自检：仅导出脱敏信息，不调用模型。")
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--port", type=int)
    parser.add_argument("--offline", action="store_true", help="仅检查本机，不连接官方授权网络")
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    if args.port is not None and not 1 <= args.port <= 65535:
        parser.error("端口必须在 1–65535 之间。")
    print("中继器自检中；不调用模型，不上传报告，请稍候…", flush=True)
    report = standalone_report(args.project, port=args.port, offline=args.offline)
    folder = args.output_dir or args.project / "diagnostics"
    filename = f"relay-diagnostics-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}-{report['report_id'][:8]}.json"
    try:
        atomic_json(folder / filename, report)
    except OSError:
        print("无法保存报告，请把诊断工具放到可写目录，或使用 --output-dir 指定输出目录。")
        return 1
    print(report["summary"])
    print(f"\n诊断报告已保存：{filename}\n请从 diagnostics 文件夹把这一份 JSON 文件反馈给开发者。不要发送 .env、授权文件或完整回调网址。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
