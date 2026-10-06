"""Offline relay adapter: validation, SQLite history, export and optional MCP.

No model requests, credential access, subprocess execution or package installation.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import sqlite3
import sys
import tempfile
import time
from contextlib import closing
from pathlib import Path

from relay_core.errors import PluginError

SKILL_ROOT = Path(__file__).resolve().parent.parent
VERSION = "1.0.0"
TABLES = {"sessions", "messages", "generations", "settings", "tool_tasks"}
SETTINGS = {"provider", "tool_last_call", "tool_protocol_check"}


def emit(value):
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")), flush=True)


def private_dir(path):
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if os.name != "nt":
        path.chmod(0o700)


def atomic_json(path, value):
    private_dir(path.parent)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=path.parent, delete=False
        ) as stream:
            temporary = Path(stream.name)
            json.dump(value, stream, ensure_ascii=False)
        os.replace(temporary, path)
        if os.name != "nt":
            path.chmod(0o600)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def manifest():
    try:
        value = json.loads(
            (SKILL_ROOT / "assets/runtime-manifest.json").read_text(encoding="utf-8")
        )
        if not isinstance(value["files"], dict) or not isinstance(
            value["requirements"], dict
        ):
            raise TypeError
        for name, digest in value["files"].items():
            path = SKILL_ROOT / name
            if (
                path.is_symlink()
                or not path.resolve().is_relative_to(SKILL_ROOT)
                or path.stat().st_size > 100000
            ):
                raise ValueError
            if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                raise ValueError
        return value
    except (OSError, ValueError, KeyError, TypeError):
        raise PluginError(
            "plugin_bundle_invalid",
            "package_validation",
            "插件资源缺失或校验不符。",
            "更新插件后重新自检。",
        ) from None


def verify_runtime(info, *, mcp=False):
    if not supported_python():
        raise PluginError(
            "plugin_python_unsupported",
            "python_environment",
            "支持 Python 3.11 至 3.14。",
            "使用已有受支持的 Python，无需强制安装 3.11。",
        )
    expected = {
        **info["requirements"],
        **(info["optional_mcp_requirements"] if mcp else {}),
    }
    if not all(item["matches"] for item in dependency_state(expected).values()):
        raise PluginError(
            "plugin_dependencies_missing",
            "dependency_validation",
            "当前 Python 缺少插件所需依赖。",
            "选择具有匹配依赖的 Python；setup 只检查，不安装软件。",
        )


def supported_python():
    return (3, 11) <= sys.version_info[:2] <= (3, 14)


def dependency_state(expected):
    result = {}
    for name, version in expected.items():
        try:
            actual = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            actual = None
        result[name] = {
            "expected": version,
            "installed": actual,
            "matches": actual == version,
        }
    return result


def recent_failure(workspace):
    try:
        path = workspace / "plugin-diagnostic.json"
        if path.stat().st_size > 8192:
            return None
        value = json.loads(path.read_text(encoding="utf-8"))
        code, stage = value.get("error_code"), value.get("problem_stage")
        # Never echo arbitrary persisted text as an allegedly safe diagnostic.
        if code is not None and (
            not isinstance(code, str)
            or len(code) > 64
            or not code.replace("_", "").isascii()
            or not code.replace("_", "").isalpha()
        ):
            return None
        stages = {
            "package_validation",
            "python_environment",
            "dependency_validation",
            "dependency_installation",
            "tool_arguments",
            "history_restore",
            "history_checkpoint",
            "markdown_export",
            "tool_runtime",
            "tool_call",
            "tool_result_validation",
            "workspace",
        }
        if stage is not None and stage not in stages:
            return None
        return {
            "error_code": code,
            "problem_stage": stage,
            "message": "最近一次调用成功。"
            if code is None
            else "最近一次调用在此阶段失败；原始内容未导出。",
            "next_step": "继续当前任务。"
            if code is None
            else "将错误码和阶段反馈给开发者。",
        }
    except (OSError, ValueError, TypeError):
        return None


def diagnose(workspace):
    failure, packages, ready, bundle_ok = None, {}, False, False
    try:
        info = manifest()
        bundle_ok = True
        packages = dependency_state(info["requirements"])
        verify_runtime(info)
        ready = True
    except PluginError as error:
        failure = error.detail()
    result = {
        "application": "language-relay",
        "plugin_version": VERSION,
        "app_version": "1.3.0",
        "source": "skill_script",
        "python_version": ".".join(map(str, sys.version_info[:3])),
        "python_supported": supported_python(),
        "bundle_valid": bundle_ok,
        "runtime_ready": ready,
        "packages_in_current_python": packages,
        "database_exists": (workspace / "data/relay.sqlite3").is_file(),
        "last_failure": recent_failure(workspace),
        "model_api_key_required": False,
        "model_inference_performed": False,
        "network_requested": False,
        "mcp_plugin_installation_verified": False,
        "account_login_verified": False,
        "privacy": {
            "credentials_exported": False,
            "ideas_or_history_exported": False,
            "automatic_upload": False,
        },
        "message": "离线脚本资源就绪；账户 MCP 插件安装状态未验证。"
        if ready
        else "已定位运行资源问题。",
    }
    return {
        **result,
        **(failure or {"ok": True, "problem_stage": None, "error_code": None}),
    }


def request_file(path):
    try:
        if path.stat().st_size > 100000:
            raise ValueError
        value = json.loads(path.read_text(encoding="utf-8"))
        if (
            not isinstance(value, dict)
            or set(value) != {"operation", "arguments"}
            or not isinstance(value["operation"], str)
            or not isinstance(value["arguments"], dict)
        ):
            raise ValueError
        return value
    except (OSError, ValueError, TypeError):
        raise PluginError(
            "plugin_request_invalid",
            "tool_arguments",
            "请求文件须为不超过100KB的 operation/arguments JSON 对象。",
            "按调用规则修正请求。",
        ) from None


def sqlite_connection(path):
    return sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)


def validate_backup(path):
    try:
        if not path.is_file() or path.stat().st_size > 100_000_000:
            raise ValueError
        with closing(sqlite_connection(path)) as db:
            if db.execute("PRAGMA quick_check").fetchone() != ("ok",):
                raise ValueError
            tables = {
                row[0]
                for row in db.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                )
            }
            if (
                tables != TABLES
                or db.execute(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type IN ('trigger','view')"
                ).fetchone()[0]
            ):
                raise ValueError
            if (
                not {row[0] for row in db.execute("SELECT key FROM settings")}
                <= SETTINGS
            ):
                raise ValueError
            expected = {
                "sessions": {"id", "title", "status", "created_at"},
                "messages": {"id", "session_id", "content", "role"},
                "tool_tasks": {"id", "request_key", "status", "assistant_message_id"},
                "generations": {"id", "session_id", "output_markdown"},
                "settings": {"key", "value"},
            }
            for table, fields in expected.items():
                if not fields <= {
                    row[1] for row in db.execute('PRAGMA table_info("' + table + '")')
                }:
                    raise ValueError
    except (OSError, ValueError, sqlite3.Error):
        raise PluginError(
            "plugin_checkpoint_invalid",
            "history_restore",
            "历史快照不是有效的中继器工具数据库。",
            "使用本插件导出的 checkpoint，不导入含账户凭据的原应用数据库。",
        ) from None


def checkpoint(workspace, output):
    source = workspace / "data/relay.sqlite3"
    validate_backup(source)
    if output.resolve() == source.resolve() or output.is_symlink():
        raise PluginError(
            "plugin_output_invalid",
            "history_checkpoint",
            "备份目标不能是运行数据库或符号链接。",
            "选择独立的 checkpoint 文件。",
        )
    private_dir(output.parent)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=output.parent, delete=False) as stream:
            temporary = Path(stream.name)
        with (
            closing(sqlite_connection(source)) as original,
            closing(sqlite3.connect(temporary)) as copied,
        ):
            original.backup(copied)
            copied.execute("PRAGMA journal_mode=DELETE")
            copied.commit()
        validate_backup(temporary)
        os.replace(temporary, output)
        if os.name != "nt":
            output.chmod(0o600)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()
    return {
        "ok": True,
        "output": str(output),
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "contains_user_history": True,
        "credentials_included": False,
        "persistent_save_completed": False,
        "next_step": "用官方 Library 技能保存或替换同一状态文件；本命令尚未完成账号保存。",
    }


def restore(workspace, source):
    validate_backup(source)
    target = workspace / "data/relay.sqlite3"
    if target.exists():
        raise PluginError(
            "plugin_state_exists",
            "history_restore",
            "当前工作区已有中继器历史，已拒绝覆盖。",
            "复用本地状态，或指定新的 workspace。",
        )
    private_dir(target.parent)
    with target.open("xb") as stream:
        stream.write(source.read_bytes())
    if os.name != "nt":
        target.chmod(0o600)
    return {"ok": True, "message": "中继器工具历史已恢复，未导入登录凭据。"}


def selfcheck():
    """Use synthetic input and a disposable DB; never invoke another model."""
    from relay_core.store import RelayStore

    with tempfile.TemporaryDirectory(prefix="relay-selfcheck-") as temporary:
        work = Path(temporary)
        store = RelayStore(work)
        checks = {}
        try:
            first = store.invoke(
                "prepare",
                {"request_key": "check_questions_01", "idea": "我想做卡牌游戏"},
            )
            context = store.invoke("context", {"task_id": first["task_id"]})
            checks["schema_available"] = (
                "report" in context["response_schema"]["properties"]
            )
            question = {
                "need_more_info": True,
                "questions": ["希望使用哪一种卡牌玩法？", "要在哪个平台运行？"],
                "report": None,
            }
            output = store.invoke(
                "submit", {"task_id": first["task_id"], "reply": question}
            )
            checks["questions_only_section_three"] = (
                output["output_markdown"].startswith("## 3.")
                and output["output_markdown"].count("## ") == 1
            )
            replay = store.invoke(
                "submit", {"task_id": first["task_id"], "reply": question}
            )
            checks["same_submit_idempotent"] = (
                replay["message_id"] == output["message_id"]
            )
            second = store.invoke(
                "prepare",
                {
                    "request_key": "check_defaults_02",
                    "session_id": first["session_id"],
                    "idea": "使用默认假设，我需要结果",
                },
            )
            checks["defaults_activated"] = second["use_default_assumptions"]
            reply = json.loads(
                (SKILL_ROOT / "assets/selfcheck-reply.json").read_text(encoding="utf-8")
            )
            full = store.invoke(
                "submit", {"task_id": second["task_id"], "reply": reply}
            )
            checks["seven_sections"] = all(
                "## " + str(i) + "." in full["output_markdown"] for i in range(1, 8)
            )
            checks["assumptions_marked"] = "假设" in full["output_markdown"]
            checks["section_six_contract"] = all(
                label in full["output_markdown"]
                for label in (
                    "角色",
                    "目标",
                    "上下文",
                    "技术栈",
                    "功能清单",
                    "文件结构",
                    "接口定义",
                    "验收标准",
                    "输出格式",
                    "分步任务",
                )
            )
            checks["history_readback"] = (
                store.invoke("result", {"task_id": second["task_id"]})[
                    "output_markdown"
                ]
                == full["output_markdown"]
            )
            third = store.invoke(
                "prepare", {"request_key": "check_invalid_03", "idea": "我想做卡牌游戏"}
            )
            for index in range(3):
                try:
                    store.invoke("submit", {"task_id": third["task_id"], "reply": {}})
                except PluginError as error:
                    checks["format_failure_" + str(index + 1)] = (
                        error.code == "tool_result_invalid"
                        and error.remaining_retries == 2 - index
                    )
                else:
                    checks["format_failure_" + str(index + 1)] = False
            checks["format_retry_exhausted"] = (
                store.invoke("result", {"task_id": third["task_id"]})["status"]
                == "error"
            )
            report = store.invoke("diagnostics", {})
            checks["failure_stage_located"] = (
                report["problem_stage"] == "tool_result_validation"
                and report["error_code"] == "tool_result_invalid"
            )
            checks["diagnostic_privacy"] = (
                not report["privacy"]["credentials_exported"]
                and not report["privacy"]["ideas_or_history_exported"]
            )
            target = work / "check.sqlite3"
            checkpoint(work, target)
            validate_backup(target)
            checks["sqlite_online_checkpoint"] = target.is_file()
        finally:
            store.close()
    return {
        "ok": all(checks.values()),
        "application": "language-relay",
        "plugin_version": VERSION,
        "source": "plugin_selfcheck",
        "checks": checks,
        "passed": sum(checks.values()),
        "total": len(checks),
        "test_data": "synthetic",
        "model_inference_performed": False,
        "network_requested": False,
        "user_history_modified": False,
        "chatgpt_installation_verified": False,
    }


def execute(args):
    if args.command == "diagnose":
        return diagnose(args.workspace)
    if args.command == "restore":
        return restore(args.workspace, args.input)
    info = manifest()
    verify_runtime(info, mcp=args.command == "mcp")
    if args.command == "setup":
        return {
            "ok": True,
            "runtime_ready": True,
            "model_api_key_required": False,
            "software_installed": False,
        }
    if args.command == "checkpoint":
        return checkpoint(args.workspace, args.output)
    if args.command == "selfcheck":
        return selfcheck()
    request = request_file(args.request_file) if args.command == "call" else None
    from relay_core.store import RelayStore

    store = RelayStore(args.workspace)
    try:
        if args.command == "mcp":
            from relay_core.mcp_server import make_mcp_server

            async def invoke(operation, arguments):
                return store.invoke(operation, arguments, mcp=True)

            make_mcp_server(invoke).run("stdio")
            return None
        if args.command == "export":
            result = store.invoke("result", {"task_id": args.task_id})
            if not result.get("ok"):
                raise PluginError(
                    "plugin_result_pending",
                    "markdown_export",
                    "任务还没有校验通过的结果。",
                    "先完成 submit，再导出。",
                )
            output = args.output
            if (
                output.suffix.lower() != ".md"
                or output.is_symlink()
                or output.resolve().is_relative_to((args.workspace / "data").resolve())
            ):
                raise PluginError(
                    "plugin_output_invalid",
                    "markdown_export",
                    "导出目标须是独立的 .md 文件。",
                    "选择独立 Markdown 文件。",
                )
            private_dir(output.parent)
            output.write_bytes(result["output_markdown"].encode("utf-8"))
            return {
                "ok": True,
                "output": str(output),
                "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
            }
        result = store.invoke(request["operation"], request["arguments"])
        atomic_json(
            args.workspace / "plugin-diagnostic.json",
            {"error_code": None, "problem_stage": None},
        )
        return result
    finally:
        store.close()


def main():
    parser = argparse.ArgumentParser(description="无额外模型 Key 的语言转换指令中继器")
    parser.add_argument("--workspace", type=Path, required=True)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("setup", "diagnose", "mcp", "selfcheck"):
        commands.add_parser(name)
    call = commands.add_parser("call")
    call.add_argument("--request-file", type=Path, required=True)
    export = commands.add_parser("export")
    export.add_argument("--task-id", required=True)
    export.add_argument("--output", type=Path, required=True)
    backup = commands.add_parser("checkpoint")
    backup.add_argument("--output", type=Path, required=True)
    recovery = commands.add_parser("restore")
    recovery.add_argument("--input", type=Path, required=True)
    args = parser.parse_args()
    args.workspace = args.workspace.expanduser().resolve()
    if args.workspace.is_relative_to(SKILL_ROOT.resolve()):
        emit(
            PluginError(
                "plugin_workspace_invalid",
                "workspace",
                "运行状态不能放在技能源码目录。",
                "指定独立工作区。",
            ).detail()
        )
        return 2
    started = time.monotonic()
    try:
        value = execute(args)
        if value is not None:
            emit(value)
        return 0 if not isinstance(value, dict) or value.get("ok", True) else 2
    except PluginError as error:
        failure = error.detail()
    except Exception:  # noqa: BLE001 - never export raw exceptions or user content
        failure = PluginError(
            "plugin_execution_failed",
            "tool_runtime",
            "本地工具执行失败，未输出原始异常或输入内容。",
            "运行 diagnose，反馈失败阶段和错误码。",
        ).detail()
    failure["elapsed_ms"] = round((time.monotonic() - started) * 1000)
    if args.command != "diagnose":
        try:
            atomic_json(args.workspace / "plugin-diagnostic.json", failure)
        except OSError:
            pass
    if args.command == "mcp":
        print(json.dumps(failure, ensure_ascii=False), file=sys.stderr, flush=True)
    else:
        emit(failure)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
