import re

from .errors import ReplyFormatError
from .planning import ordered_tasks, traceability_rows, validate_planning
from .schema import Fact, LLMReply

CLAUSE_DELIMITERS = "。;；!！?？\r\n"

SECTION_TITLES = (
    "我理解的想法",
    "动机分析",
    "需要确认的问题",
    "需求规格",
    "技术方案",
    "给编程 AI 的指令",
    "自检",
)
INSTRUCTION_FIELDS = (
    ("角色", "role"),
    ("目标", "goal"),
    ("上下文", "context"),
    ("技术栈", "tech_stack"),
    ("文件结构", "file_structure"),
    ("接口定义", "interfaces"),
    ("验收标准", "acceptance"),
    ("输出格式", "output_format"),
    ("分步任务", "steps"),
)
MODE_REQUEST = re.compile(
    r"(?P<cancel>"
    r"(?:取消|关闭|停止|停用)(?:使用)?默认假设(?:模式)?"
    r"|(?:不要|不想|不必|无需|别|停止|暂不|不)(?:再|继续|直接|先)*(?:使用|采用|用)默认假设"
    r"|(?:不需要|不想要|无需)默认假设"
    r"|(?:我)?(?:不再需要|暂不需要|不需要)结果"
    r")|(?P<enable>使用默认假设|我需要结果)"
)
QUOTED_MATERIAL = re.compile(
    r"```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`"
    r'|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\''
    r"|“[^”]*”|‘[^’]*’|「[^」]*」|『[^』]*』"
    r"|^\s*>[^\n]*$",
    re.MULTILINE,
)


def normalize(text: str) -> str:
    return re.sub(r"\s+", "", text)


def requested_mode(text: str) -> bool | None:
    # Button labels, examples, JSON strings and code are project material,
    # rather than a request to change the relay's current mode.
    text = normalize(QUOTED_MATERIAL.sub(" ", text))
    matches = list(MODE_REQUEST.finditer(text))
    return matches[-1].lastgroup == "enable" if matches else None


def requested_defaults(text: str) -> bool:
    return requested_mode(text) is True


def substantive_idea(text: str) -> bool:
    cleaned = MODE_REQUEST.sub("", normalize(text))
    cleaned = re.sub(
        r"直接生成|先确认信息|先确认需求|先问问题|我想先补充信息|我先补充信息|先补充信息|暂时|现在|请",
        "",
        cleaned,
    )
    cleaned = re.sub(r"[^\w]", "", cleaned)
    return len(cleaned) >= 2


def validate_reply(reply: LLMReply, force_defaults: bool):
    if reply.need_more_info:
        if force_defaults:
            raise ReplyFormatError("defaults require a full report")
        if reply.report is not None or not 1 <= len(reply.questions) <= 5:
            raise ReplyFormatError("clarification must contain questions only")
        if len({normalize(q) for q in reply.questions}) != len(reply.questions):
            raise ReplyFormatError("duplicate questions")
        for question in reply.questions:
            if (
                not question.strip()
                or len(question) > 240
                or re.search(r"[\x00-\x1f\x7f\u2028\u2029]", question)
            ):
                raise ReplyFormatError("question must be a short single line")
            if len(re.findall(r"[?？]", question)) > 1:
                raise ReplyFormatError("one question per item")
    else:
        if reply.report is None or reply.questions:
            raise ReplyFormatError("full report must not ask blocking questions")
        for metric in reply.report.requirements.quantified:
            if not re.search(
                r"\d(?:\.\d+)?\s*(?:毫秒|秒|分钟|小时|天|轮|次|项|个|人|步|张|%|％|MB|GB|KB|ms|s\b|fps\b|px|像素)",
                metric.text,
                re.IGNORECASE,
            ):
                raise ReplyFormatError(
                    "quantified requirements need measurable numbers"
                )
        validate_planning(reply.report)


def canonical_quote(text: str) -> str:
    # Keep whitespace BETWEEN tokens: "1 0" must never become "10".
    return re.sub(r"[^\S\r\n]+", " ", text).strip()


def quote_is_complete(quote: str, original: str) -> bool:
    delimiters = re.escape(CLAUSE_DELIMITERS)
    body = quote.rstrip(CLAUSE_DELIMITERS + ",，.")
    if not body:
        return False
    # Decimal points, version dots and numeric grouping commas are not clauses.
    comma = r"(?<!\d)[,，]|[,，](?!\d)"
    prefix = rf"(?:^|[{delimiters}]|{comma}|(?<!\d)\.(?=\s|$))\s*"
    suffix = rf"(?=\s*(?:$|[{delimiters}]|{comma}|\.(?=\s|$)))"
    source = canonical_quote(original)
    for match in re.finditer(prefix + rf"(?P<body>{re.escape(body)})" + suffix, source):
        if source.startswith(quote, match.start("body")):
            return True
    return False


def fact_line(fact: Fact, user_inputs: list[str], prefix: str = "") -> str:
    # Complete clauses retain negation, quantities and conditions. A substring
    # such as "需要联网" inside "不需要联网" is not a verified user claim.
    quote = canonical_quote(fact.evidence or "")
    text = canonical_quote(fact.text)
    verified = (
        fact.basis == "user"
        and len(quote) >= 2
        and text == quote
        and any(quote_is_complete(quote, original) for original in user_inputs)
    )
    marker = "用户已提供" if verified else "假设"
    return f"- **{marker}**：{prefix}{fact.text}"


def render_markdown(reply: LLMReply, user_inputs: list[str]) -> str:
    if reply.need_more_info:
        return (
            "## 3. 需要确认的问题\n\n"
            + "\n".join(
                f"{index}. {q.strip()}" for index, q in enumerate(reply.questions, 1)
            )
            + "\n"
        )

    report = reply.report
    if report is None:
        raise ReplyFormatError("missing report")
    validate_planning(report)
    plan = report.planning
    lines: list[str] = []

    def heading(number: int):
        lines.extend([f"## {number}. {SECTION_TITLES[number - 1]}", ""])

    def facts(values: list[Fact]):
        lines.extend(fact_line(value, user_inputs) for value in values)
        if not values:
            lines.append("暂无。")
        lines.append("")

    def claim(value: Fact, prefix=""):
        lines.append(fact_line(value, user_inputs, prefix))

    def proposed(text):
        claim(Fact(text=text, basis="assumption", evidence=None))

    def subtitle(title, level=3):
        lines.extend([f"{'#' * level} {title}", ""])

    def requirements():
        for title, prefix, values in (
            ("必须做", "R", report.requirements.must_do),
            ("可选做", "O", report.requirements.optional),
            ("量化指标", "Q", report.requirements.quantified),
        ):
            subtitle(title, 4)
            for index, value in enumerate(values, 1):
                claim(value, f"[{prefix}{index}] ")
            if not values:
                lines.append("暂无。")
            lines.append("")

    def architecture(level):
        subtitle("架构取舍", level)
        for index, decision in enumerate(plan.decisions, 1):
            for label, value in (
                ("选择", decision.choice),
                ("备选", decision.alternative),
                ("理由", decision.reason),
                ("代价与调整条件", decision.tradeoff),
            ):
                claim(value, f"[A{index} · {label}] ")
            lines.append("")
        subtitle("数据流与失败路径", level)
        facts(plan.data_flow)
        subtitle("数据模型与状态约束", level)
        facts(plan.data_model)

    def risk_details(level):
        subtitle("风险与应对", level)
        levels = {"high": "高", "medium": "中", "low": "低"}
        categories = {
            "scope": "范围",
            "architecture": "架构",
            "data": "数据",
            "security": "安全",
            "dependency": "依赖",
            "cost": "成本",
            "performance": "性能",
        }
        for risk in plan.risks:
            proposed(
                f"[{risk.id}] {categories[risk.category]}风险，等级{levels[risk.level]}；关联模块 {', '.join(risk.module_ids)}，需求 {', '.join(risk.requirement_ids)}。"
            )
            for label, value in (
                ("风险与影响", risk.description),
                ("触发条件", risk.trigger),
                ("处理与降级", risk.mitigation),
                ("待执行验证", risk.verification),
            ):
                claim(value, f"[{risk.id} · {label}] ")
            lines.append("")

    heading(1)
    facts(report.understanding)
    for title, values in (
        ("使用者与场景", report.analysis.actors),
        ("核心操作闭环", report.analysis.workflow),
        ("约束与范围边界", report.analysis.constraints + report.analysis.out_of_scope),
    ):
        subtitle(title)
        facts(values)
    heading(2)
    facts(report.motivation)
    heading(3)
    lines.extend(["无阻塞问题。未明确的信息已逐项标记为“假设”，可继续补充修改。", ""])
    if report.analysis.open_issues:
        subtitle("非阻塞未知项与待验证假设")
        facts(report.analysis.open_issues)
    heading(4)
    requirements()
    heading(5)
    facts(report.technical_plan)
    architecture(3)
    subtitle("模块职责与依赖")
    for module in plan.modules:
        claim(module.name, f"[{module.id}] ")
        claim(module.responsibility, f"[{module.id} · 职责] ")
        proposed(
            f"[{module.id}] 覆盖 {', '.join(module.requirement_ids)}；依赖 {', '.join(module.depends_on) or '无'}。"
        )
        lines.append("")
    heading(6)
    for title, field in INSTRUCTION_FIELDS:
        if title == "文件结构":
            subtitle("功能清单")
            requirements()
        subtitle(title)
        if field == "file_structure":
            for module in plan.modules:
                claim(module.name, f"[{module.id}] ")
                claim(module.responsibility, f"[{module.id} · 职责] ")
                proposed(
                    f"[{module.id}] 覆盖 {', '.join(module.requirement_ids)}；依赖 {', '.join(module.depends_on) or '无'}。"
                )
                for file in module.files:
                    claim(file.path, f"[{module.id} · 文件] ")
                    claim(file.purpose, f"[{module.id} · 文件职责] ")
                lines.append("")
        elif field == "interfaces":
            for interface in plan.interfaces:
                proposed(
                    f"[{interface.id}] 归属 {interface.module_id}，覆盖 {', '.join(interface.requirement_ids)}。"
                )
                for label, value in (
                    ("操作", interface.operation),
                    ("输入与校验", interface.input),
                    ("成功返回", interface.output),
                    ("权限边界", interface.security),
                    ("重复调用与副作用", interface.idempotency),
                ):
                    claim(value, f"[{interface.id} · {label}] ")
                for error in interface.errors:
                    claim(error, f"[{interface.id} · 错误与状态] ")
                for label, example in zip(
                    ("成功示例", "失败示例"), interface.examples, strict=True
                ):
                    claim(example, f"[{interface.id} · {label}] ")
                lines.append("")
        elif field == "acceptance":
            for case in plan.acceptance:
                optional = all(key.startswith("O") for key in case.requirement_ids)
                proposed(
                    f"[{case.id}] {'可选' if optional else '必须'}验收，覆盖 {', '.join(case.requirement_ids)}。"
                )
                claim(case.scenario, f"[{case.id} · 条件/操作/预期] ")
                claim(case.verification, f"[{case.id} · 待执行验证] ")
                lines.append("")
        elif field == "steps":
            for task in ordered_tasks(report):
                optional = all(key.startswith("O") for key in task.requirement_ids)
                claim(
                    task.title, f"[{task.id} · {'可选做' if optional else '必须做'}] "
                )
                proposed(
                    f"[{task.id}] 模块 {', '.join(task.module_ids)}；需求 {', '.join(task.requirement_ids)}；前置任务 {', '.join(task.depends_on) or '无'}。"
                )
                claim(task.deliverable, f"[{task.id} · 交付] ")
                claim(task.verification, f"[{task.id} · 待执行验证] ")
                lines.append("")
            risk_details(4)
        else:
            facts(getattr(report.instructions, field))
            if field == "context":
                subtitle("使用场景、操作与边界", 4)
                facts(
                    report.analysis.actors
                    + report.analysis.workflow
                    + report.analysis.constraints
                    + report.analysis.out_of_scope
                )
                if report.analysis.open_issues:
                    subtitle("未知项与待验证假设", 4)
                    facts(report.analysis.open_issues)
            if field == "tech_stack":
                architecture(4)
    heading(7)
    subtitle("程序已执行的结构检查")
    lines.extend(
        [
            "本次规划结构校验通过：编号唯一、引用有效、模块/任务无循环依赖、文件归属唯一、接口形状有效；必须需求与量化指标均有模块、任务和验收。",
            "",
            "| 需求编号 | 负责模块 | 调用接口 | 实施任务 | 验收用例 |",
            "| --- | --- | --- | --- | --- |",
        ]
    )
    lines.extend("| " + " | ".join(row) + " |" for row in traceability_rows(report))
    lines.extend(
        [
            "",
            "R = 必须做；O = 可选做；Q = 量化指标。接口栏为空表示未规划调用接口；可选项可留待后续规划。",
            "",
            "结构校验不能证明技术选择正确、需求理解准确或项目代码已通过测试。以下验证仍需实际执行。",
            "",
        ]
    )
    risk_details(3)
    subtitle("待执行的内容与实现检查")
    facts(report.self_check)
    return "\n".join(lines).rstrip() + "\n"
