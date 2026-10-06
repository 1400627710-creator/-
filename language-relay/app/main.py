import asyncio
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.routes import DB, mutation, router
from app.config import PROJECT_ROOT, Config
from app.db import Database
from app.errors import RelayError
from app.services import session_service
from app.services.chatgpt_auth import ChatGPTAuth
from app.services.connection_service import ConnectionService
from app.services.diagnostics_service import DiagnosticsService
from app.services.llm_client import LLMClient
from app.services.relay_service import RelayService
from app.services.settings_service import SettingsService
from diagnose import record_operation

APP_VERSION = "1.2.2"


def create_app(config: Config | None = None, *, transport=None, auth_http_factory=None, connection_transport=None) -> FastAPI:
    config = config or Config.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database = Database(config)
        app.state.database = database
        try:
            database.initialize()
            app.state.settings = SettingsService(config)
            app.state.chatgpt_auth = ChatGPTAuth(config, auth_http_factory)
            app.state.diagnostics = DiagnosticsService(config, app.state.chatgpt_auth, APP_VERSION)
            app.state.connection = ConnectionService(app.state.settings, app.state.chatgpt_auth, connection_transport)
            app.state.relay = RelayService(app.state.settings, LLMClient(config, transport), app.state.chatgpt_auth)
            app.state.mutation_lock = asyncio.Lock()
            record_operation(config.data_dir, "server_start", "server_start", "ok")
            yield
        finally:
            database.close()

    app = FastAPI(
        title="语言转换指令中继器",
        version=APP_VERSION,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
    )
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]", "testserver"])
    templates = Jinja2Templates(directory=PROJECT_ROOT / "templates")
    app.mount("/static", StaticFiles(directory=PROJECT_ROOT / "static"), name="static")
    app.include_router(router)

    def track_error(request, error):
        path = request.url.path
        if path.startswith("/api/diagnostics") or path.startswith("/api/auth/") or path == "/auth/callback" or error.code == "busy":
            return
        operation, stage = "application", "application_request"
        if path in {"/api/settings/test-connection", "/api/settings/import-key"}:
            operation, stage = "connection", "model_inference"
        elif path.startswith("/api/settings"):
            operation, stage = "settings", "connection_settings"
        elif re.fullmatch(r"/api/sessions/\d+/(messages|generate|retry)", path):
            operation, stage = "generation", "model_inference"
        elif re.fullmatch(r"/api/sessions/\d+/export", path):
            operation, stage = "export", "markdown_export"
        elif path.startswith("/api/sessions") or path == "/":
            operation, stage = "history", "history_storage"
        record_operation(config.data_dir, operation, stage, "error", error.code, getattr(error, "provider_evidence", None), provider=getattr(error, "selected_provider", None))

    @app.middleware("http")
    async def local_security(request: Request, call_next):
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            origin = request.headers.get("origin")
            expected = f"{request.url.scheme}://{request.url.netloc}"
            if origin is not None and origin != expected:
                return JSONResponse(
                    {"detail": {"code": "origin_blocked", "message": "已阻止其他网站操作本地应用。"}},
                    status_code=403,
                )
            if request.headers.get("x-relay-client") != "local":
                return JSONResponse(
                    {"detail": {"code": "client_header_required", "message": "请求缺少本地客户端标识。"}},
                    status_code=403,
                )
            if len(await request.body()) > 100000:
                return JSONResponse(
                    {"detail": {"code": "request_too_large", "message": "输入内容过长。"}},
                    status_code=413,
                )
        try:
            response = await call_next(request)
        except Exception as error:
            code = "history_storage_failed" if isinstance(error, SQLAlchemyError) else "application_internal_error"
            failure = RelayError(code, "本机服务处理失败。请一键自检并导出报告，原有数据请保留。", 500)
            track_error(request, failure)
            response = JSONResponse({"detail": failure.detail()}, status_code=500)
        if request.method == "PUT" and request.url.path == "/api/settings" and response.status_code < 400:
            record_operation(config.data_dir, "settings", "connection_settings", "ok")
        if request.method == "GET" and re.fullmatch(r"/api/sessions/\d+/export", request.url.path) and response.status_code == 200:
            record_operation(config.data_dir, "export", "markdown_export", "ok")
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "img-src 'self' data:; font-src 'self'; connect-src 'self'; "
            "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
        )
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = (
            "private, max-age=86400" if request.url.path.startswith("/static/") else "no-store"
        )
        return response

    @app.exception_handler(RelayError)
    async def relay_error(_request: Request, error: RelayError):
        track_error(_request, error)
        return JSONResponse({"detail": error.detail()}, status_code=error.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, error: RequestValidationError):
        track_error(_request, RelayError("invalid_input", "输入格式不正确。", 422))
        # FastAPI's default includes input values; never echo an API key.
        fields = [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in error.errors()]
        return JSONResponse(
            {
                "detail": {
                    "code": "invalid_input",
                    "message": "输入格式不正确，请检查后重试。",
                    "fields": fields,
                }
            },
            status_code=422,
        )

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/runtime")
    def runtime(request: Request):
        return {"application": "language-relay", "version": APP_VERSION,
                "instance": getattr(app.state, "launcher_instance", None),
                "port": request.url.port or 80}

    @app.get("/")
    def index(request: Request, db: DB):
        settings = app.state.settings.get(db)
        return templates.TemplateResponse(
            request=request,
            name="index.html",
            context={
                "sessions": session_service.list_sessions(db),
                "settings": settings,
                "app_version": APP_VERSION,
                "chatgpt": app.state.chatgpt_auth.status(settings.chatgpt_model),
                "login_return": request.query_params.get("chatgpt_login") == "finished",
            },
        )

    @app.get("/ui/sessions")
    def session_list(request: Request, db: DB):
        return templates.TemplateResponse(
            request=request,
            name="session_list.html",
            context={"sessions": session_service.list_sessions(db)},
        )

    @app.get("/auth/callback")
    async def chatgpt_callback(request: Request, db: DB):
        try:
            async with mutation(request):
                result = await app.state.chatgpt_auth.finish(dict(request.query_params))
                current = app.state.settings.get(db)
                from app.schemas import SettingsUpdate

                models = result["models"]
                selected = current.chatgpt_model if any(m["slug"] == current.chatgpt_model for m in models) else (models[0]["slug"] if models else None)
                app.state.settings.update(db, SettingsUpdate(provider="chatgpt", chatgpt_model=selected))
        except RelayError as error:
            auth = app.state.chatgpt_auth
            if error.code != "chatgpt_state_invalid" or (not auth.pending_active() and not auth.status()["connected"]):
                if error.code == "chatgpt_state_invalid":
                    auth.trace.record("callback", "error", code=error.code, state_valid=False)
                auth.stage = "failed"
                auth.record_result(False, error.message, error.code)
        except Exception:
            app.state.chatgpt_auth.stage = "failed"
            app.state.chatgpt_auth.record_result(False, "登录返回信息无法处理，请回到连接与设置重新登录。", "chatgpt_callback_invalid")
        # Remove authorization code from the address bar; no popup tokens or messages.
        return RedirectResponse("/?chatgpt_login=finished", status_code=303)

    return app


app = create_app()
