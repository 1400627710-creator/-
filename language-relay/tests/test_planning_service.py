import json
from copy import deepcopy

import pytest
from pydantic import ValidationError

from app.prompts.relay_prompt import control_prompt
from app.schemas import LLMReply
from app.services.llm_client import ReplyFormatError
from app.services.planning_service import ordered_tasks, planning_issues, traceability_rows
from app.services.relay_service import render_markdown, validate_reply
from tests.fakes import ScriptedTransport, fact, full_reply
from tests.test_relay_service import complete


def report(raw=None):
    return LLMReply.model_validate(raw or full_reply()).report


def test_canonical_requirements_drive_traceability_and_both_instruction_copies():
    value = report()
    assert planning_issues(value) == ()
    assert traceability_rows(value) == [
        ("R1", "M1, M2", "I1, I2", "T1, T2", "C1, C2"),
        ("O1", "—", "—", "—", "—"),
        ("Q1", "M1", "I2", "T2", "C3"),
    ]
    reply = LLMReply.model_validate(full_reply())
    text = render_markdown(reply, ["我想做卡牌游戏"])
    section4 = text.split("## 4. 需求规格\n", 1)[1].split("## 5.", 1)[0]
    section6 = text.split("## 6. 给编程 AI 的指令\n", 1)[1].split("## 7.", 1)[0]
    assert section4.strip() in section6
    for needed in (
        "架构取舍",
        "数据流与失败路径",
        "数据模型与状态约束",
        "风险与应对",
        "成功示例",
        "失败示例",
        "权限边界",
        "重复调用与副作用",
        "待执行验证",
    ):
        assert needed in section6
    assert "| R1 | M1, M2 | I1, I2 | T1, T2 | C1, C2 |" in text
    assert "不能证明技术选择正确" in text
    assert "#### 可选做" in section6


@pytest.mark.parametrize("group", ["modules", "interfaces", "tasks", "acceptance", "risks"])
def test_repeated_identifiers_rejected(group):
    raw = full_reply()
    items = raw["report"]["planning"][group]
    items.append(deepcopy(items[0]))
    assert "duplicate_id" in planning_issues(report(raw))


@pytest.mark.parametrize("group", ["modules", "interfaces", "tasks", "acceptance", "risks"])
def test_unknown_or_duplicate_requirement_reference_rejected(group):
    for bad in (["R12"], ["R1", "R1"]):
        raw = full_reply()
        raw["report"]["planning"][group][0]["requirement_ids"] = bad
        assert "unknown_reference" in planning_issues(report(raw))


@pytest.mark.parametrize("group,code", [("modules", "module_cycle"), ("tasks", "task_cycle")])
def test_cycles_and_self_dependencies_rejected(group, code):
    for self_reference in (False, True):
        raw = full_reply()
        items = raw["report"]["planning"][group]
        if self_reference:
            items[0]["depends_on"] = [items[0]["id"]]
        else:
            items[0]["depends_on"] = [items[1]["id"]]
            items[1]["depends_on"] = [items[0]["id"]]
        assert code in planning_issues(report(raw))


def test_forward_task_references_are_rendered_in_dependency_order():
    raw = full_reply()
    raw["report"]["planning"]["tasks"].reverse()
    value = report(raw)
    assert planning_issues(value) == ()
    assert [task.id for task in ordered_tasks(value)] == ["T1", "T2"]
    text = render_markdown(LLMReply.model_validate(raw), [])
    assert text.index("[T1 · 必须做]") < text.index("[T2 · 必须做]")


@pytest.mark.parametrize(
    "group,code",
    [("modules", "module_coverage"), ("tasks", "task_coverage"), ("acceptance", "acceptance_coverage")],
)
def test_quantified_and_must_requirements_cannot_lack_implementation_or_acceptance(group, code):
    for identifier in ("R2", "Q2"):
        raw = full_reply()
        key = "must_do" if identifier.startswith("R") else "quantified"
        raw["report"]["requirements"][key].append(fact("本机新增操作完成时间 ≤2 秒。"))
        assert code in planning_issues(report(raw))


@pytest.mark.parametrize(
    "group,key",
    [("modules", "depends_on"), ("tasks", "depends_on"), ("tasks", "module_ids"), ("risks", "module_ids")],
)
def test_missing_dependency_and_owner_references_rejected(group, key):
    raw = full_reply()
    raw["report"]["planning"][group][0][key] = ["T10" if group == "tasks" and key == "depends_on" else "M8"]
    assert "unknown_reference" in planning_issues(report(raw))


def test_interface_requirement_must_belong_to_its_owner_module():
    raw = full_reply()
    raw["report"]["planning"]["interfaces"][0]["requirement_ids"] = ["Q1"]
    assert "ownership" in planning_issues(report(raw))


@pytest.mark.parametrize("group", ["tasks", "risks"])
def test_task_or_risk_cannot_reference_an_unrelated_module(group):
    raw = full_reply()
    raw["report"]["planning"][group][0]["requirement_ids"] = ["Q1"]
    assert "ownership" in planning_issues(report(raw))


@pytest.mark.parametrize(
    "path",
    [
        "/tmp/main.py",
        "../main.py",
        "src/../main.py",
        "C:/main.py",
        "src\\main.py",
        "src//main.py",
        "src/",
        "`src/main.py`",
        "src/x?.py",
        "src/x.",
    ],
)
def test_bad_relative_file_paths_are_rejected(path):
    raw = full_reply()
    raw["report"]["planning"]["modules"][0]["files"][0]["path"] = fact(path)
    assert "file_path" in planning_issues(report(raw))


def test_file_ownership_is_unique_even_on_case_insensitive_windows():
    raw = full_reply()
    raw["report"]["planning"]["modules"][1]["files"][0]["path"] = fact("SRC/Main.TS")
    assert "duplicate_file" in planning_issues(report(raw))


@pytest.mark.parametrize(
    "kind,operation",
    [
        ("http", "POST /api/items/{item_id}"),
        ("function", "store.save(item: Item) -> None"),
        ("event", "item.created"),
        ("cli", "relay summarize --input input.csv"),
    ],
)
def test_interfaces_adapt_to_http_functions_events_and_cli(kind, operation):
    raw = full_reply()
    interface = raw["report"]["planning"]["interfaces"][0]
    interface.update(kind=kind, operation=fact(operation))
    assert planning_issues(report(raw)) == ()


@pytest.mark.parametrize(
    "kind,operation",
    [
        ("http", "调用保存接口"),
        ("http", "post /api/items"),
        ("http", "GET https://example.com/api"),
        ("function", "playCard"),
        ("function", "playCard(id)"),
        ("event", "事件 TBD"),
        ("cli", "relay; remove-all"),
    ],
)
def test_placeholder_interface_operations_are_not_accepted(kind, operation):
    raw = full_reply()
    raw["report"]["planning"]["interfaces"][0].update(kind=kind, operation=fact(operation))
    assert "interface_shape" in planning_issues(report(raw))


def test_duplicate_http_routes_are_rejected_across_modules():
    raw = full_reply()
    for interface in raw["report"]["planning"]["interfaces"]:
        interface.update(kind="http", operation=fact("POST /api/items"))
    assert "duplicate_interface" in planning_issues(report(raw))


def test_http_parameter_names_do_not_hide_duplicate_routes():
    raw = full_reply()
    for interface, path in zip(
        raw["report"]["planning"]["interfaces"], ("GET /items/{id}", "GET /items/{item_id}"), strict=True
    ):
        interface.update(kind="http", operation=fact(path))
    assert "duplicate_interface" in planning_issues(report(raw))


def test_file_cannot_also_be_another_files_parent_directory():
    raw = full_reply()
    raw["report"]["planning"]["modules"][0]["files"][0]["path"] = fact("src")
    assert "duplicate_file" in planning_issues(report(raw))


def test_a_future_test_action_is_not_confused_with_a_completed_test():
    raw = full_reply()
    raw["report"]["planning"]["tasks"][0]["verification"] = fact(
        "运行规则测试并确认所有测试通过，失败时保留错误记录。"
    )
    assert planning_issues(report(raw)) == ()


@pytest.mark.parametrize("field", ["input", "output", "errors", "security", "idempotency", "examples"])
def test_interface_contract_cannot_omit_a_required_component(field):
    raw = full_reply()
    raw["report"]["planning"]["interfaces"][0].pop(field)
    with pytest.raises(ValidationError):
        report(raw)


def test_optional_work_remains_separate_and_can_depend_on_mandatory_work():
    raw = full_reply()
    plan = raw["report"]["planning"]
    plan["modules"][1]["requirement_ids"].append("O1")
    plan["tasks"].append(
        {
            "id": "T3",
            "title": fact("增加可选编辑器。"),
            "module_ids": ["M2"],
            "requirement_ids": ["O1"],
            "depends_on": ["T2"],
            "deliverable": fact("交付编辑器与校验。"),
            "verification": fact("修改卡牌后重开验证新规则。"),
        }
    )
    assert planning_issues(report(raw)) == ()
    text = render_markdown(LLMReply.model_validate(raw), [])
    assert "[T3 · 可选做]" in text
    plan["tasks"][-1]["requirement_ids"].append("R1")
    assert "optional_scope" in planning_issues(report(raw))


def test_vague_acceptance_and_unearned_testing_claims_fail():
    raw = full_reply()
    raw["report"]["planning"]["acceptance"][0]["scenario"] = fact("简单易用。")
    raw["report"]["self_check"] = [fact("所有测试已通过，项目代码已完成。")]
    assert {"vague_acceptance", "unearned_verification"} <= set(planning_issues(report(raw)))


async def test_inconsistent_plan_is_repaired_with_specific_safe_retry_feedback(config):
    bad = full_reply()
    bad["report"]["planning"]["tasks"][1]["depends_on"] = ["T2"]
    bad["report"]["planning"]["modules"][0]["responsibility"] = fact("sk-PRIVATE-NOT-IN-RETRY")
    transport = ScriptedTransport([bad, full_reply()])
    reply = await complete(config, transport, force=True)
    assert reply.report is not None
    assert len(transport.calls) == 2
    retry = transport.calls[1]["messages"][1]["content"]
    assert "分步任务依赖不能指向自己或形成循环" in retry
    assert "sk-PRIVATE-NOT-IN-RETRY" not in retry
    assert "本次需要修正" in retry


def test_untrusted_issue_codes_cannot_enter_system_prompt():
    assert "HACKED" not in control_prompt(True, True, ("HACKED", "task_cycle"))


def test_renderer_cannot_claim_structure_passed_for_an_invalid_plan():
    raw = full_reply()
    raw["report"]["planning"]["modules"][0]["requirement_ids"] = ["O1"]
    with pytest.raises(ReplyFormatError):
        render_markdown(LLMReply.model_validate(raw), [])


def test_provider_schema_has_required_fields_and_no_open_object():
    schema = LLMReply.model_json_schema()

    def walk(node):
        if isinstance(node, dict):
            if node.get("type") == "object":
                assert node.get("additionalProperties") is False
                assert set(node.get("required", [])) == set(node.get("properties", {}))
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(schema)
    assert schema["type"] == "object" and "anyOf" not in schema
    assert len(json.dumps(schema)) < 30000


def test_quantification_still_applies_before_plan_is_accepted():
    raw = full_reply()
    raw["report"]["requirements"]["quantified"] = [fact("很快。")]
    with pytest.raises(ReplyFormatError):
        validate_reply(LLMReply.model_validate(raw), True)
