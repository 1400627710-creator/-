from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session as DBSession

from app.errors import RelayError
from app.schemas import (
    DiagnosticRequest,
    GenerateRequest,
    GenerateResult,
    KeyImport,
    MessageCreate,
    MessageResult,
    SessionCreate,
    SessionDetail,
    SessionOut,
    SessionRename,
    SettingsOut,
    SettingsUpdate,
)
from app.services import session_service

router = APIRouter(prefix="/api")


def get_db(request: Request):
    with request.app.state.database.sessions() as db:
        yield db


DB = Annotated[DBSession, Depends(get_db)]


@asynccontextmanager
async def mutation(request: Request):
    # One in-flight mutation avoids mixed settings and concurrent tab races.
    lock = request.app.state.mutation_lock
    if lock.locked():
        raise RelayError("busy", "正在处理上一条请求，请等待完成后再操作。", 409)
    async with lock:
        yield


@router.get("/settings", response_model=SettingsOut)
def get_settings(request: Request, db: DB):
    return request.app.state.settings.get(db)


@router.put("/settings", response_model=SettingsOut)
async def put_settings(patch: SettingsUpdate, request: Request, db: DB):
    async with mutation(request):
        return request.app.state.settings.update(db, patch)


@router.post("/settings/import-key")
async def import_key(body: KeyImport, request: Request, db: DB):
    async with mutation(request):
        settings = request.app.state.settings.import_key(db, body.content.get_secret_value())
        try:
            connection = await request.app.state.connection.check(db)
        except RelayError as error:
            connection = {"ok": False, **error.detail()}
        return {"settings": settings, "connection": connection}


@router.post("/settings/test-connection")
async def test_connection(request: Request, db: DB):
    async with mutation(request):
        return await request.app.state.connection.check(db)


@router.post("/auth/chatgpt/start")
async def chatgpt_start(request: Request, db: DB):
    async with mutation(request):
        result = request.app.state.chatgpt_auth.start(str(request.base_url))
        request.app.state.settings.update(db, SettingsUpdate(provider="chatgpt"))
        return result


@router.post("/auth/chatgpt/cancel")
async def chatgpt_cancel(request: Request):
    async with mutation(request):
        return request.app.state.chatgpt_auth.cancel()


@router.get("/auth/chatgpt/status")
def chatgpt_status(request: Request):
    return request.app.state.chatgpt_auth.status()


@router.post("/auth/chatgpt/models")
async def chatgpt_models(request: Request, db: DB):
    async with mutation(request):
        models = await request.app.state.chatgpt_auth.models()
        current = request.app.state.settings.get(db)
        if models and not any(m["slug"] == current.chatgpt_model for m in models):
            request.app.state.settings.update(db, SettingsUpdate(chatgpt_model=models[0]["slug"]))
        auth = request.app.state.chatgpt_auth
        if auth.last_result and auth.last_result["code"] == "chatgpt_model_catalog_pending":
            auth.record_result(True, "已使用 ChatGPT 登录并授权，模型列表已更新。")
        return {"models": models}


@router.post("/auth/chatgpt/logout")
async def chatgpt_logout(request: Request, db: DB):
    async with mutation(request):
        result = await request.app.state.chatgpt_auth.logout()
        request.app.state.settings.update(db, SettingsUpdate(provider="api"))
        return result


@router.post("/diagnostics/run")
async def run_diagnostics(body: DiagnosticRequest, request: Request, db: DB):
    # Read-only probes use a separate lock so they cannot block the OAuth callback.
    return await request.app.state.diagnostics.run(body.check_network, request.url.port or 80, request.app.state.settings.get(db))


@router.get("/diagnostics/export")
def export_diagnostics(request: Request):
    return Response(content=request.app.state.diagnostics.export(), media_type="application/json", headers={"Content-Disposition": 'attachment; filename="relay-diagnostics.json"'})


@router.post("/sessions", response_model=SessionOut, status_code=201)
async def create_session(request: Request, db: DB, body: SessionCreate | None = None):
    async with mutation(request):
        return session_service.create_session(db, body.title if body else None)


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(db: DB):
    return session_service.list_sessions(db)


@router.get("/sessions/{session_id}", response_model=SessionDetail)
def get_session(session_id: int, db: DB):
    return session_service.detail(db, session_id)


@router.patch("/sessions/{session_id}", response_model=SessionOut)
async def rename_session(session_id: int, body: SessionRename, request: Request, db: DB):
    async with mutation(request):
        return session_service.rename(db, session_id, body.title)


@router.post("/sessions/{session_id}/messages", response_model=MessageResult)
async def post_message(session_id: int, body: MessageCreate, request: Request, db: DB):
    async with mutation(request):
        return await request.app.state.relay.run(db, session_id, content=body.content)


@router.post("/sessions/{session_id}/generate", response_model=GenerateResult)
async def generate(session_id: int, body: GenerateRequest, request: Request, db: DB):
    async with mutation(request):
        result = await request.app.state.relay.run(
            db, session_id, force_defaults=body.use_default_assumptions
        )
        if result.generation_id is None:
            raise RelayError("more_info_needed", "仍需补充信息，问题已保存；可选择使用默认假设。", 409)
        return GenerateResult(
            generation_id=result.generation_id,
            output_markdown=result.output_markdown,
            message=result.message,
        )


@router.post("/sessions/{session_id}/retry", response_model=MessageResult)
async def retry(session_id: int, request: Request, db: DB):
    async with mutation(request):
        return await request.app.state.relay.run(db, session_id, retry=True)


@router.get("/sessions/{session_id}/export")
def export(session_id: int, db: DB, message_id: Annotated[int | None, Query(ge=1)] = None):
    message, markdown = session_service.export_markdown(db, session_id, message_id)
    return Response(
        content=markdown.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="relay-{session_id}-{message.id}.md"'},
    )


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: int, request: Request, db: DB):
    async with mutation(request):
        session_service.delete_session(db, session_id)
        return {"ok": True}
