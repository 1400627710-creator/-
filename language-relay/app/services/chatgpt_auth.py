"""Official local Sign in with ChatGPT flow; no browser cookies or API key."""
import asyncio
import base64
import hashlib
import json
import os
import re
import secrets
import tempfile
import time
import uuid
from pathlib import Path
from urllib.parse import urlencode, urlsplit

import httpx2
import jwt

from app.errors import RelayError
from diagnose import STAGES, LoginTrace, http_evidence, network_error

ISSUER = "https://auth.openai.com"
AUTHORIZE = ISSUER + "/api/accounts/authorize"
TOKEN = ISSUER + "/api/accounts/oauth/token"
DISCOVERY = ISSUER + "/.well-known/openid-configuration"
JWKS = ISSUER + "/.well-known/jwks.json"
RESOURCE = "https://api.openai.com/v1"
SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"


def write_private_json(path: Path, data: dict):
    temporary = None
    try:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            if os.name != "nt":
                temporary.chmod(0o600)
            json.dump(data, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except OSError:
        raise RelayError("auth_write_failed", "无法保存本机授权，请检查数据目录的写入权限。", 500) from None
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


class ChatGPTAuth:
    def __init__(self, config, http_client_factory=None):
        self.path = config.data_dir / "chatgpt-auth.json"
        self.factory = http_client_factory or (lambda: httpx2.AsyncClient(trust_env=False, follow_redirects=False))
        self.pending = None
        self.lock = asyncio.Lock()
        self.stage = "idle"
        self.trace = LoginTrace(config.data_dir / "chatgpt-login-trace.json")
        self.result_path = config.data_dir / "chatgpt-login-result.json"
        try:
            result = json.loads(self.result_path.read_text(encoding="utf-8"))
            self.last_result = {key: result[key] for key in ("ok", "code", "message")}
            if not isinstance(self.last_result["ok"], bool) or not all(isinstance(self.last_result[key], str) for key in ("code", "message")):
                raise ValueError
        except (OSError, ValueError, KeyError, TypeError):
            self.last_result = None

    def record_result(self, ok, message, code="chatgpt_connected"):
        self.last_result = {"ok": ok, "code": code, "message": message}
        try:
            write_private_json(self.result_path, self.last_result)
        except RelayError:
            # Credentials are saved separately; a diagnostic failure must not erase them.
            self.last_result = {"ok": False, "code": "auth_write_failed", "message": "登录状态记录无法保存，请检查数据目录权限。"}

    def pending_active(self):
        return bool(self.pending and time.monotonic() <= self.pending["expires"])

    def read(self):
        if not self.path.exists():
            return {}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                raise ValueError
            for key in ("client_id", "subject", "access_token", "refresh_token", "id_token", "host_id"):
                if key in data and not isinstance(data[key], str):
                    raise ValueError
            if not isinstance(data.get("scopes", []), list) or not isinstance(data.get("models", []), list):
                raise ValueError
            return data
        except (OSError, ValueError):
            raise RelayError("chatgpt_auth_unreadable", "ChatGPT 本机授权文件无法读取，请重新登录。", 500) from None

    def status(self):
        try:
            data = self.read()
            signed_in = bool(data.get("id_token") and data.get("subject") and data.get("access_token"))
            plan_enabled = bool(data.get("access_token") and "chatgpt.tokens.use.direct" in data.get("scopes", []))
            expires = float(data.get("expires_at", 0))
            connected = plan_enabled and (expires > time.time() or bool(data.get("refresh_token")))
            completing = self.stage in {"token_exchange", "verify_identity", "loading_models"}
            pending = self.pending_active() or completing
            result = self.last_result
            if pending:
                phase = self.stage
                messages = {"waiting_callback": "正在等待官方授权返回。请在官方页面完成登录与授权，随后返回中继器。", "token_exchange": "已收到官方回调，正在完成本机授权。", "verify_identity": "已收到授权，正在验证账户身份。", "loading_models": "已完成授权，正在加载账户可用模型。"}
                message = messages.get(phase, "正在完成登录，请稍候。")
            elif signed_in and not plan_enabled:
                phase, message = "plan_required", "账号已登录，但尚未授权本应用调用模型。请重新登录并允许使用 ChatGPT 计划。"
            elif connected:
                phase, message = "connected", "已登录并授权，可以选择账户可用模型。"
            elif plan_enabled:
                phase, message = "expired", "ChatGPT 授权已过期，请重新登录。"
            elif result and result["code"] == "chatgpt_login_pending":
                phase = "failed"
                message = "登录等待已过期，请重新点击使用 ChatGPT 继续。" if self.pending else "登录被服务重启中断，请重新点击使用 ChatGPT 继续。"
                result = {"ok": False, "code": "chatgpt_login_interrupted", "message": message}
            elif result and not result["ok"]:
                phase, message = "failed", result["message"]
            else:
                phase, message = "signed_out", "尚未使用 ChatGPT 登录。"
            return {"connected": connected, "signed_in": signed_in, "plan_enabled": plan_enabled, "pending": pending, "phase": phase, "message": message, "account": data.get("account", "") if signed_in or connected else "", "models": data.get("models", []) if connected else [], "result": result}
        except RelayError as error:
            return {"connected": False, "signed_in": False, "plan_enabled": False, "pending": False, "phase": "failed", "message": error.message, "account": "", "models": [], "result": {"ok": False, "code": error.code, "message": error.message}}
        except (ValueError, TypeError):
            return {"connected": False, "signed_in": False, "plan_enabled": False, "pending": False, "phase": "failed", "message": "本机授权记录格式不正确，请重新登录。", "account": "", "models": [], "result": None}

    def start(self, origin: str):
        parsed = urlsplit(origin)
        if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost"}:
            raise RelayError("login_local_only", "请通过本机 http://127.0.0.1 地址登录 ChatGPT。", 400)
        callback = f"http://127.0.0.1:{parsed.port or 80}/auth/callback"
        if self.pending_active() and self.pending["callback"] == callback:
            return {"authorization_url": self.pending["authorization_url"], "reused": True}
        try:
            data = self.read()
        except RelayError:
            data = {}  # Explicit sign-in repairs unreadable local credentials.
        self.trace.begin(parsed.port or 80, bool(data.get("client_id")))
        if not data.get("host_id"):
            data["host_id"] = "urn:uuid:" + str(uuid.uuid4())
            try:
                write_private_json(self.path, data)
            except RelayError as error:
                self.trace.record("client_registration", "error", code=error.code)
                self.record_result(False, error.message, error.code)
                raise
        state, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(3))
        client_id = data.get("client_id") or "dynamic_agent_client"
        self.pending = {"state": state, "nonce": nonce, "verifier": verifier, "callback": callback, "client_id": client_id, "subject": data.get("subject"), "expires": time.monotonic() + 600, "host_id": data["host_id"]}
        self.stage = "waiting_callback"
        params = {"client_id": client_id, "ext_agent_host_id": data["host_id"], "response_type": "code", "redirect_uri": callback, "scope": SCOPES, "resource": RESOURCE, "state": state, "nonce": nonce, "code_challenge_method": "S256", "code_challenge": base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()}
        if client_id == "dynamic_agent_client":
            params["agent_name_hint"] = "语言转换指令中继器"
        # No ID token is placed in a browser URL; account selection stays official.
        url = AUTHORIZE + "?" + urlencode(params)
        self.pending["authorization_url"] = url
        self.record_result(False, "正在等待官方授权返回。", "chatgpt_login_pending")
        return {"authorization_url": url, "reused": False}

    def cancel(self):
        self.pending = None
        self.stage = "idle"
        self.record_result(False, "已取消本次登录。可以重新登录；原有授权不会因此被删除。", "chatgpt_login_cancelled")
        return self.status()

    async def fetch(self, method, url, **kwargs):
        parsed = urlsplit(url)
        if parsed.scheme != "https" or parsed.netloc not in {"auth.openai.com", "api.openai.com"}:
            raise RelayError("auth_endpoint_invalid", "官方授权地址不匹配，已停止连接。", 502)
        stage = "token_refresh" if url == TOKEN and kwargs.get("data", {}).get("grant_type") == "refresh_token" else "token_exchange" if url == TOKEN else "discovery" if url == DISCOVERY else "jwks" if url == JWKS else "models" if url == RESOURCE + "/models" else "revocation"
        started = time.monotonic()
        try:
            async with self.factory() as client:
                response = await client.request(method, url, timeout=8, **kwargs)
            evidence = http_evidence(response.status_code, response.headers, response.content)
            json_shape = evidence["body_shape"].startswith("json_")
            failed = response.status_code >= 300 or (response.content and not json_shape)
            self.trace.record(stage, "error" if failed else "ok", duration_ms=round((time.monotonic() - started) * 1000), **evidence)
            if response.status_code >= 300:
                code = evidence.get("provider_code")
                if code in {"invalid_grant", "invalid_refresh_token", "refresh_token_reused", "token_expired", "refresh_token_expired", "refresh_token_invalidated", "refresh_token_invalid"}:
                    raise RelayError("chatgpt_login_expired", "ChatGPT 授权已失效，请重新登录。", 401)
                if response.status_code < 400:
                    raise RelayError("chatgpt_auth_redirect", f"{STAGES[stage]}遇到异常跳转，已停止连接；请一键自检并导出报告。", 502)
                if not json_shape:
                    raise RelayError("chatgpt_auth_gateway", f"{STAGES[stage]}收到非预期响应（HTTP {response.status_code}），不能据此判断账户资格；请一键自检并导出报告。", 502)
                if code in {"invalid_client", "unauthorized_client"}:
                    raise RelayError("chatgpt_client_rejected", f"{STAGES[stage]}失败：官方未接受本应用的客户端注册或配置（HTTP {response.status_code}）。请导出自检报告。", 403 if response.status_code == 403 else 400)
                if code in {"insufficient_scope", "chatpass_v2_scope_not_authorized", "chatpass_v2_invalid_authorization_context"}:
                    raise RelayError("chatgpt_scope_rejected", f"{STAGES[stage]}失败：官方返回的权限上下文不允许此操作。请导出自检报告。", 403)
                if response.status_code == 401:
                    raise RelayError("chatgpt_login_expired", "ChatGPT 授权未被接受，请重新登录。", 401)
                if response.status_code == 403:
                    if code == "subscription_sharing_user_not_eligible":
                        raise RelayError("chatgpt_not_eligible", "官方明确拒绝所选用户、工作区或政策的 ChatGPT 计划使用资格。请导出自检报告；重复刷新不能完成授权。", 403)
                    raise RelayError("chatgpt_auth_forbidden", f"{STAGES[stage]}被拒绝（HTTP 403），尚不能确定具体的账户、地区或工作区原因。请一键自检并导出报告。", 403)
                raise RelayError("chatgpt_auth_unavailable", "ChatGPT 官方授权服务暂时不可用，请稍后重试。", 502)
            body = response.json() if response.content else {}
            if not isinstance(body, dict):
                raise RelayError("chatgpt_auth_response_invalid", f"{STAGES[stage]}返回格式不正确，请一键自检并导出报告。", 502)
            return body
        except RelayError:
            raise
        except httpx2.HTTPError as error:
            self.trace.record(stage, "error", code=network_error(error), duration_ms=round((time.monotonic() - started) * 1000))
            raise RelayError("chatgpt_auth_connection", f"{STAGES[stage]}无法连接官方服务，请一键自检并导出报告。", 502) from None
        except (ValueError, TypeError):
            self.trace.record(stage, "error", code="chatgpt_auth_response_invalid")
            raise RelayError("chatgpt_auth_response_invalid", f"{STAGES[stage]}返回格式不正确，请一键自检并导出报告。", 502) from None

    async def validate_identity(self, token, client_id, nonce):
        discovery = await self.fetch("GET", DISCOVERY)
        if discovery.get("issuer") != ISSUER or discovery.get("jwks_uri") != JWKS:
            raise RelayError("auth_endpoint_invalid", "OpenAI 身份验证地址不匹配，已停止登录。", 502)
        keys = await self.fetch("GET", JWKS)
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") not in {"RS256", "ES256"}:
                raise ValueError
            key_data = next(k for k in keys["keys"] if k.get("kid") == header.get("kid"))
            key = jwt.PyJWK.from_dict(key_data, algorithm=header["alg"])
            claims = jwt.decode(token, key.key, algorithms=[header["alg"]], audience=client_id, issuer=ISSUER, leeway=5, options={"require": ["sub", "exp", "iat", "nonce"]})
            if not isinstance(claims["sub"], str) or not claims["sub"] or not secrets.compare_digest(claims["nonce"], nonce):
                raise ValueError
            if claims.get("azp") and claims["azp"] != client_id:
                raise ValueError
            self.trace.record("verify_identity", "ok")
            return claims
        except (jwt.PyJWTError, ValueError, KeyError, TypeError, StopIteration):
            self.trace.record("verify_identity", "error", code="chatgpt_identity_invalid")
            raise RelayError("chatgpt_identity_invalid", "ChatGPT 身份验证未通过，请重新发起登录。", 401) from None

    @staticmethod
    def token_fields(body, old=None):
        old = old or {}
        if not isinstance(body.get("access_token"), str) or not body["access_token"] or str(body.get("token_type", "")).lower() != "bearer":
            raise RelayError("chatgpt_token_invalid", "官方返回的授权信息不完整，请重新登录。", 502)
        try:
            expires = float(body["expires_in"])
            if not 0 < expires <= 86400:
                raise ValueError
            scopes = body.get("scope", " ".join(old.get("scopes", []))).split()
            refresh = body.get("refresh_token", old.get("refresh_token", ""))
            if not isinstance(refresh, str):
                raise ValueError
        except (KeyError, ValueError, TypeError, AttributeError):
            raise RelayError("chatgpt_token_invalid", "官方返回的授权信息不完整，请重新登录。", 502) from None
        return {"access_token": body["access_token"], "refresh_token": refresh, "expires_at": time.time() + expires, "scopes": scopes}

    async def finish(self, params: dict):
        async with self.lock:
            pending = self.pending
            state = params.get("state", "")
            if not isinstance(state, str) or not state.isascii() or not pending or time.monotonic() > pending["expires"] or not secrets.compare_digest(state, pending["state"]):
                raise RelayError("chatgpt_state_invalid", "登录请求已过期或不匹配，请回到中继器重新登录。", 400)
            self.pending = None  # Valid state is one-time, including declined consent.
            self.trace.record("callback", "ok", state_valid=True, authorization_code_present=bool(params.get("code")), client_id_present=bool(params.get("client_id")))
            self.stage = "callback"
            try:
                return await self._finish_valid(params, pending)
            except asyncio.CancelledError:
                self.stage = "failed"
                self.record_result(False, "本次登录已中断，请重新点击使用 ChatGPT 继续。", "chatgpt_login_interrupted")
                raise
            except RelayError as error:
                stage = self.stage if self.stage in STAGES else "models" if self.stage == "loading_models" else "unknown"
                self.trace.record(stage, "error", code=error.code)
                self.stage = "failed"
                self.record_result(False, error.message, error.code)
                raise
            except Exception:
                self.stage = "failed"
                message = "登录返回信息无法处理，请回到连接与设置重新登录。"
                self.record_result(False, message, "chatgpt_callback_invalid")
                raise RelayError("chatgpt_callback_invalid", message, 502) from None

    async def _finish_valid(self, params, pending):
        if params.get("error"):
            raise RelayError("chatgpt_consent_denied", "你没有完成 ChatGPT 授权，可以回到中继器重新登录或使用 API Key。", 400)
        client_id = params.get("client_id") or pending["client_id"]
        if not re.fullmatch(r"oaiapp_[A-Za-z0-9_-]+", client_id) or (pending["client_id"] != "dynamic_agent_client" and client_id != pending["client_id"]):
            raise RelayError("chatgpt_client_invalid", "ChatGPT 客户端注册未完成或不匹配，请重新登录。", 400)
        code = params.get("code", "")
        if not code or len(code) > 4096:
            raise RelayError("chatgpt_code_missing", "登录回调缺少授权码，请重新登录。", 400)
        self.stage = "client_registration"
        # Retain the issued registration even if exchange later fails. It is not
        # a login or a grant, and existing verified credentials stay untouched.
        registration = self.read()
        if not registration.get("client_id"):
            registration.update(host_id=pending["host_id"], client_id=client_id)
            write_private_json(self.path, registration)
        self.trace.record("client_registration", "ok")
        self.stage = "token_exchange"
        body = await self.fetch("POST", TOKEN, data={"grant_type": "authorization_code", "client_id": client_id, "code": code, "code_verifier": pending["verifier"], "redirect_uri": pending["callback"], "resource": RESOURCE})
        self.stage = "verify_identity"
        claims = await self.validate_identity(body.get("id_token", ""), client_id, pending["nonce"])
        if pending["subject"] and claims["sub"] != pending["subject"]:
            raise RelayError("chatgpt_account_mismatch", "返回的 ChatGPT 账户与原授权不一致，请使用此前授权的账户重新登录。", 401)
        fields = self.token_fields(body)
        record = {"host_id": pending["host_id"], "client_id": client_id, "subject": claims["sub"], "account": str(claims.get("email") or claims.get("name") or "ChatGPT 账户")[:160], "id_token": body["id_token"], "models": [], **fields}
        self.stage = "save_credentials"
        write_private_json(self.path, record)
        self.trace.record("save_credentials", "ok")
        self.stage = "scope_check"
        if "chatgpt.tokens.use.direct" not in fields["scopes"]:
            self.trace.record("scope_check", "error", code="chatgpt_plan_not_enabled", plan_scope_present=False)
            raise RelayError("chatgpt_plan_not_enabled", "已登录，但没有授权使用 ChatGPT 计划。请再次登录并允许计划使用。", 403)
        self.trace.record("scope_check", "ok", plan_scope_present=True)
        self.stage = "loading_models"
        catalog_error = None
        try:
            await self.models(fields["access_token"])
        except RelayError as error:
            catalog_error = error
        self.stage = "idle"
        message = "已使用 ChatGPT 登录并授权，可在 ChatGPT 设置中管理额度。"
        if catalog_error:
            message += "模型列表尚未加载：" + catalog_error.message + " 请点击刷新可用模型。"
        self.record_result(True, message, "chatgpt_model_catalog_pending" if catalog_error else "chatgpt_connected")
        return self.status()

    async def access_token(self):
        async with self.lock:
            data = self.read()
            if not data.get("access_token") or "chatgpt.tokens.use.direct" not in data.get("scopes", []):
                self.trace.record("local_authorization", "error", code="chatgpt_login_required")
                if data.get("id_token") and data.get("subject") and data.get("access_token"):
                    raise RelayError("chatgpt_plan_not_enabled", "账号已登录，但没有获准使用 ChatGPT 计划；刷新模型不能代替计划授权。请运行一键自检并导出报告。", 403)
                if self.last_result and not self.last_result["ok"] and self.last_result["code"] not in {"chatgpt_login_pending", "chatgpt_login_cancelled"}:
                    raise RelayError("chatgpt_login_required", "上次授权未完成：" + self.last_result["message"] + " 刷新模型不能完成授权，请运行一键自检并导出报告。", 401)
                raise RelayError("chatgpt_login_required", "请先在连接与设置中使用 ChatGPT 登录，并授权使用计划。", 401)
            if float(data.get("expires_at", 0)) > time.time() + 60:
                return data["access_token"]
            if not data.get("refresh_token"):
                raise RelayError("chatgpt_login_expired", "ChatGPT 授权已过期，请重新登录。", 401)
            try:
                body = await self.fetch("POST", TOKEN, data={"grant_type": "refresh_token", "client_id": data["client_id"], "refresh_token": data["refresh_token"], "resource": RESOURCE})
            except RelayError as error:
                if error.code == "chatgpt_login_expired":
                    for key in ("access_token", "refresh_token", "id_token"):
                        data.pop(key, None)
                    write_private_json(self.path, data)
                    self.record_result(False, error.message, error.code)
                raise
            data.update(self.token_fields(body, data))
            if "chatgpt.tokens.use.direct" not in data["scopes"]:
                raise RelayError("chatgpt_plan_not_enabled", "ChatGPT 计划授权已关闭，请重新登录并授权。", 403)
            write_private_json(self.path, data)
            return data["access_token"]

    async def models(self, token=None):
        # Called outside refresh lock. No filesystem or external tools are enabled.
        token = token or await self.access_token()
        body = await self.fetch("GET", RESOURCE + "/models", headers={"Authorization": "Bearer " + token})
        values = []
        for item in body.get("models", []):
            slug = item.get("slug", "")
            if item.get("visibility") == "list" and isinstance(slug, str) and re.fullmatch(r"[A-Za-z0-9._-]{1,100}", slug):
                values.append({"slug": slug, "display_name": str(item.get("display_name") or slug)[:160]})
        data = self.read()
        data["models"] = values[:100]
        write_private_json(self.path, data)
        return values[:100]

    async def logout(self):
        async with self.lock:
            self.pending = None
            data = self.read()
            revoked = True
            if data.get("refresh_token"):
                try:
                    discovery = await self.fetch("GET", DISCOVERY)
                    endpoint = discovery.get("revocation_endpoint", "")
                    if urlsplit(endpoint).netloc != "auth.openai.com":
                        raise RelayError("auth_endpoint_invalid", "注销地址不匹配。")
                    await self.fetch("POST", endpoint, data={"token": data["refresh_token"], "token_type_hint": "refresh_token", "client_id": data["client_id"]})
                except RelayError:
                    revoked = False
            for key in ("access_token", "refresh_token", "id_token", "expires_at", "scopes", "models"):
                data.pop(key, None)
            write_private_json(self.path, data)
            self.stage = "idle"
            self.record_result(True, "已断开 ChatGPT。" if revoked else "已在本机断开；远程撤销未确认，请在 ChatGPT 设置中断开此应用。", "chatgpt_signed_out")
            return self.last_result
