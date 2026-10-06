import sys

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.api.routes import DB, mutation
from app.errors import RelayError
from app.models import Setting, ToolTask
from app.schemas import ToolConnectionUpdate, ToolInvoke, ToolPrepare
from app.services import session_service
from diagnose import record_operation

router = APIRouter(prefix="/api/tools")


async def invoke_tool(app, operation, arguments, transport="http"):
    try:
        result = await _invoke_tool(app, operation, arguments, transport)
    except RelayError as error:
        record_operation(app.state.tools.config.data_dir, "tool_submit" if error.code == "tool_result_invalid" else "tool_call",
                         "tool_result_validation" if error.code == "tool_result_invalid" else "tool_call",
                         "error", error.code, provider="tool")
        raise
    record_operation(app.state.tools.config.data_dir, "tool_call", "tool_call", "ok", provider="tool")
    return result


async def _invoke_tool(app, operation, arguments, transport="http"):
    allowed = {
        "status": set(), "sessions": set(), "prepare": {"request_key", "idea", "session_id", "use_default_assumptions"},
        "next_task": {"session_id"}, "context": {"task_id"}, "submit": {"task_id", "reply"},
        "result": {"task_id"}, "cancel": {"task_id"}, "diagnostics": set(),
    }
    if operation not in allowed or not isinstance(arguments, dict) or not set(arguments) <= allowed[operation]:
        raise RelayError("tool_arguments_invalid", "工具名称或参数不符合接口定义。", 400)
    lock = app.state.mutation_lock
    if lock.locked():
        raise RelayError("busy", "本机正在处理其他请求，请稍后重试。", 409)
    async with lock:
        with app.state.database.sessions() as db:
            service = app.state.tools
            service.observed(db, operation, transport)
            if operation == "status":
                return service.status(db)
            if operation == "sessions":
                return {"sessions": [s.model_dump(mode="json") for s in session_service.list_sessions(db)]}
            if operation == "prepare":
                try:
                    body = ToolPrepare.model_validate(arguments)
                except ValueError:
                    raise RelayError("tool_arguments_invalid", "想法、会话编号或 request_key 格式不正确。", 400) from None
                return service.prepare(db, body)
            if operation == "next_task":
                sid = arguments.get("session_id")
                if sid is not None and (isinstance(sid, bool) or not isinstance(sid, int) or sid < 1):
                    raise RelayError("tool_arguments_invalid", "会话编号须为正整数。", 400)
                return service.next_task(db, sid)
            if operation == "context":
                return service.context(db, arguments.get("task_id"))
            if operation == "submit":
                if not isinstance(arguments.get("reply"), dict):
                    raise RelayError("tool_arguments_invalid", "reply 须为符合任务结构定义的 JSON 对象。", 400)
                return service.submit(db, arguments.get("task_id"), arguments["reply"])
            if operation == "result":
                return service.result(db, arguments.get("task_id"))
            if operation == "cancel":
                return service.cancel(db, arguments.get("task_id"))
            return tool_diagnostic(db, service)


def tool_diagnostic(db, service):
    status = service.status(db)
    failed = db.scalar(select(ToolTask).where(ToolTask.validation_failures > 0, ToolTask.status.in_(["pending", "error"])).order_by(ToolTask.updated_at.desc()).limit(1))
    check = status.get("protocol_check")
    code = "tool_result_invalid" if failed else check.get("code") if check and not check["ok"] else None if status["tool_call_observed"] else "tool_host_not_connected"
    return {
        "application": "language-relay", "app_version": "1.3.0", "source": "tool",
        "problem_stage": "tool_result_validation" if failed else "tool_connection" if code else None,
        "error_code": code, "status": status,
        "validation_failures": failed.validation_failures if failed else 0,
        "remaining_retries": min(2, max(0, 3 - failed.validation_failures)) if failed else None,
        "message": "结构化结果校验失败，请宿主读取规则并修正后重试。" if failed else status["message"],
        "limitations": "工具调用已收到不等于验证了客户端是ChatGPT；不能从本机证明插件在所有未来会话中启用。",
        "privacy": {"credentials_exported": False, "ideas_or_history_exported": False, "automatic_upload": False},
    }


@router.get("/status")
def status(request: Request, db: DB):
    return request.app.state.tools.status(db)


@router.get("/setup")
def setup(request: Request, db: DB):
    setting = db.get(Setting, "tool_tunnel_id")
    root = request.app.state.tools.config.data_dir
    from app.config import PROJECT_ROOT
    return {
        "tunnel_id": setting.value if setting else "",
        "mcp_path": "/mcp", "stdio": {"command": sys.executable, "args": [str(PROJECT_ROOT / "mcp_stdio.py")],
                                     "env": {"RELAY_DATA_DIR": str(root), "PYTHONUTF8": "1"}},
        "host_connection_url": "https://chatgpt.com/plugins",
        "official_guide": "https://developers.openai.com/api/docs/guides/secure-mcp-tunnels",
        "note": "网页版使用官方安全隧道连接此stdio服务；隧道运行凭据与模型API Key用途不同。本机服务和隧道运行时才能调用。",
    }


@router.put("/setup")
async def save_setup(body: ToolConnectionUpdate, request: Request, db: DB):
    async with mutation(request):
        db.merge(Setting(key="tool_tunnel_id", value=body.tunnel_id))
        db.commit()
        return setup(request, db)


@router.post("/access-token")
async def access_token(request: Request):
    return {"token": request.app.state.tool_access.token(), "usage": "仅供本机MCP HTTP连接，不是OpenAI API Key。"}


@router.get("/diagnostics")
def diagnostics(request: Request, db: DB):
    return tool_diagnostic(db, request.app.state.tools)


@router.post("/check")
async def check_protocol(request: Request, db: DB):
    # HTTP callback runs independently of the mutation lock; this self-check
    # only initializes/discovers, and never calls or changes a user task.
    import json

    from tool_check import check
    result = await check(request.app.state.tools.config, str(request.base_url))
    async with mutation(request):
        db.merge(Setting(key="tool_protocol_check", value=json.dumps(result, ensure_ascii=False)))
        db.commit()
        record_operation(request.app.state.tools.config.data_dir, "connection", "tool_connection",
                         "ok" if result["ok"] else "error", result["code"], provider="tool")
    return result


@router.post("/tasks")
async def prepare(body: ToolPrepare, request: Request, db: DB):
    async with mutation(request):
        return request.app.state.tools.prepare(db, body)


@router.get("/tasks")
def tasks(request: Request, db: DB, session_id: int | None = None):
    query = select(ToolTask).order_by(ToolTask.created_at.desc()).limit(100)
    if session_id is not None:
        query = query.where(ToolTask.session_id == session_id)
    return [request.app.state.tools.prepared(db, item) for item in db.scalars(query)]


@router.post("/tasks/{task_id}/cancel")
async def cancel(task_id: str, request: Request, db: DB):
    async with mutation(request):
        return request.app.state.tools.cancel(db, task_id)


@router.post("/invoke")
async def invoke(body: ToolInvoke, request: Request):
    if not request.app.state.tool_access.authorized(request.headers.get("authorization")):
        raise RelayError("tool_unauthorized", "工具连接口令缺失或错误。", 401)
    transport = "stdio" if request.headers.get("x-relay-tool-transport") == "stdio" else "http"
    return await invoke_tool(request.app, body.operation, body.arguments, transport)
