"""Pure, bounded checks for a development plan; no network or generated code."""

import re
from pathlib import PurePosixPath

from app.schemas import Report
from app.services.llm_client import ReplyFormatError

# This allowlist is also used in the trusted retry instruction. Never interpolate
# generated text, invalid field names, exception strings or previous answers.
ISSUE_HINTS = {
    "duplicate_id": "模块、接口、任务、验收和风险编号必须分别唯一。",
    "unknown_reference": "所有需求、模块、任务引用必须指向本轮实际存在的编号，列表内不能重复。",
    "module_cycle": "模块依赖不能指向自己或形成循环。",
    "task_cycle": "分步任务依赖不能指向自己或形成循环。",
    "module_coverage": "每个必须需求 R 和量化指标 Q 都需要至少一个负责模块。",
    "task_coverage": "每个必须需求 R 和量化指标 Q 都需要至少一个实施任务。",
    "acceptance_coverage": "每个必须需求 R 和量化指标 Q 都需要至少一个验收用例。",
    "ownership": "接口、任务和风险引用的需求必须由其指定模块负责；任务须涵盖每个指定模块。",
    "optional_scope": "同一个任务不能混合必须/量化需求和可选需求，应拆为独立任务。",
    "file_path": "文件路径必须是无反引号的相对文件路径，不能包含父目录跳转或平台非法字符。",
    "duplicate_file": "每个文件只能归属一个模块，不要使用大小写不同的路径重复分配。",
    "interface_shape": "HTTP 操作写成大写方法加路径；函数写清名称、参数与返回类型；事件或 CLI 写明确操作名。",
    "duplicate_interface": "同一个 HTTP 操作或同一模块函数、事件、CLI 操作不能重复定义。",
    "vague_acceptance": "验收场景不能仅说快速、美观或易用；应给操作、条件和可观察结果。",
    "unearned_verification": "这里只设计方案，不能声称项目代码已实现或测试已经运行通过。",
}


def requirement_index(report: Report):
    """IDs are assigned from the canonical requirement lists, not model prose."""
    return {
        f"{prefix}{index}": fact
        for prefix, values in (
            ("R", report.requirements.must_do),
            ("O", report.requirements.optional),
            ("Q", report.requirements.quantified),
        )
        for index, fact in enumerate(values, 1)
    }


def has_cycle(items) -> bool:
    graph = {item.id: set(item.depends_on) for item in items}
    pending = set(graph)
    while pending:
        ready = {key for key in pending if not graph[key].intersection(pending)}
        if not ready:
            return True
        pending -= ready
    return False


def ordered_tasks(report: Report):
    """Stable dependency order, including forward references in model output."""
    pending = list(report.planning.tasks)
    done: set[str] = set()
    result = []
    while pending:
        ready = [task for task in pending if set(task.depends_on) <= done]
        if not ready:
            raise ReplyFormatError("task cycle", issues=("task_cycle",))
        result.extend(ready)
        done.update(task.id for task in ready)
        pending = [task for task in pending if task.id not in done]
    return result


def planning_issues(report: Report) -> tuple[str, ...]:
    issues: list[str] = []

    def flag(code, condition=True):
        if condition and code not in issues:
            issues.append(code)

    plan = report.planning
    requirements = set(requirement_index(report))
    required = {key for key in requirements if key.startswith(("R", "Q"))}
    modules = {module.id: module for module in plan.modules}
    tasks = {task.id: task for task in plan.tasks}
    for items in (plan.modules, plan.interfaces, plan.tasks, plan.acceptance, plan.risks):
        flag("duplicate_id", len({item.id for item in items}) != len(items))

    def references(values, allowed):
        valid = len(set(values)) == len(values) and set(values) <= set(allowed)
        flag("unknown_reference", not valid)
        return valid

    for item in (*plan.modules, *plan.interfaces, *plan.tasks, *plan.acceptance, *plan.risks):
        references(item.requirement_ids, requirements)
    for module in plan.modules:
        references(module.depends_on, modules)
    for task in plan.tasks:
        references(task.depends_on, tasks)
        references(task.module_ids, modules)
    for risk in plan.risks:
        references(risk.module_ids, modules)
    for interface in plan.interfaces:
        references([interface.module_id], modules)

    flag("module_cycle", has_cycle(plan.modules))
    flag("task_cycle", has_cycle(plan.tasks))
    for code, items in (
        ("module_coverage", plan.modules),
        ("task_coverage", plan.tasks),
        ("acceptance_coverage", plan.acceptance),
    ):
        covered = {key for item in items for key in item.requirement_ids}
        flag(code, not required <= covered)

    for interface in plan.interfaces:
        owner = modules.get(interface.module_id)
        flag(
            "ownership",
            owner is not None and not set(interface.requirement_ids) <= set(owner.requirement_ids),
        )
    for item in (*plan.tasks, *plan.risks):
        owners = [modules[key] for key in item.module_ids if key in modules]
        owner_requirements = {key for owner in owners for key in owner.requirement_ids}
        flag("ownership", not set(item.requirement_ids) <= owner_requirements)
        if item in plan.tasks:
            flag(
                "ownership",
                any(not set(item.requirement_ids).intersection(owner.requirement_ids) for owner in owners),
            )
            flag(
                "optional_scope",
                any(key.startswith("O") for key in item.requirement_ids)
                and any(key.startswith(("R", "Q")) for key in item.requirement_ids),
            )

    files: set[str] = set()
    for module in plan.modules:
        for file in module.files:
            path = file.path.text
            valid = (
                not PurePosixPath(path).is_absolute()
                and not re.search(r'[\\<>:"|?*`]', path)
                and all(
                    part not in ("", ".", "..") and not part.endswith((".", " ")) for part in path.split("/")
                )
            )
            flag("file_path", not valid)
            folded = path.casefold()
            flag(
                "duplicate_file",
                any(
                    folded == existing
                    or folded.startswith(existing + "/")
                    or existing.startswith(folded + "/")
                    for existing in files
                ),
            )
            files.add(folded)

    operations: set[tuple[str, str, str]] = set()
    for interface in plan.interfaces:
        operation = interface.operation.text
        if interface.kind == "http":
            valid = bool(re.fullmatch(r"(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /[^\s?#]*", operation))
            without_parameters = re.sub(r"\{[A-Za-z_]\w*\}", "{}", operation)
            valid = valid and not re.search(r"[{}]", without_parameters.replace("{}", ""))
            # /items/{id} and /items/{item_id} are the same route pattern.
            identity = without_parameters
        elif interface.kind == "function":
            valid = bool(re.fullmatch(r"[A-Za-z_][\w.]*\([^()]*\)\s*(?::|->)\s*\S.*", operation))
            identity = operation.split("(", 1)[0]
        elif interface.kind == "event":
            valid = bool(re.fullmatch(r"[\w.:-]+", operation))
            identity = operation
        else:
            valid = bool(re.fullmatch(r"[\w./-]+(?: [^\x00-\x1f;&|`$]+)*", operation))
            identity = operation
        flag("interface_shape", not valid)
        key = (interface.kind, "" if interface.kind == "http" else interface.module_id, identity)
        flag("duplicate_interface", key in operations)
        operations.add(key)

    for case in plan.acceptance:
        flag(
            "vague_acceptance",
            bool(re.search(r"快速|很快|高效|美观|易用|简单", case.scenario.text))
            and not bool(re.search(r"\d|[RQ]\d+", case.scenario.text)),
        )
    checks = [
        *report.self_check,
        *(case.verification for case in plan.acceptance),
        *(task.verification for task in plan.tasks),
        *(risk.verification for risk in plan.risks),
    ]
    flag(
        "unearned_verification",
        any(
            re.search(
                r"测试(?:已经|已)(?:全部)?通过|(?:已经|已)运行.{0,8}测试|(?:已经|已)(?:运行|执行).{0,8}测试.{0,8}通过|已(?:完成|实现).{0,8}(?:全部功能|项目代码)",
                check.text,
            )
            for check in checks
        ),
    )
    return tuple(issues)


def validate_planning(report: Report):
    issues = planning_issues(report)
    if issues:
        raise ReplyFormatError("inconsistent engineering plan", issues=issues)


def traceability_rows(report: Report):
    plan = report.planning
    return [
        (
            key,
            ", ".join(item.id for item in plan.modules if key in item.requirement_ids) or "—",
            ", ".join(item.id for item in plan.interfaces if key in item.requirement_ids) or "—",
            ", ".join(item.id for item in ordered_tasks(report) if key in item.requirement_ids) or "—",
            ", ".join(item.id for item in plan.acceptance if key in item.requirement_ids) or "—",
        )
        for key in requirement_index(report)
    ]
