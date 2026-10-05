import re
from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

from app.config import valid_api_key_format


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SettingsUpdate(StrictModel):
    openai_api_key: SecretStr | None = None
    model: str | None = Field(default=None, min_length=1, max_length=100)
    temperature: float | None = Field(default=None, ge=0, le=2, allow_inf_nan=False)
    provider: Literal["api", "chatgpt"] | None = None
    chatgpt_model: str | None = Field(default=None, min_length=1, max_length=100)

    @field_validator("model", "chatgpt_model")
    @classmethod
    def valid_model(cls, value):
        if value is not None and not re.fullmatch(r"[A-Za-z0-9._-]+", value):
            raise ValueError("模型名称只能包含英文、数字、点、下划线和横线。")
        return value

    @field_validator("openai_api_key")
    @classmethod
    def valid_key(cls, value):
        if value is not None:
            raw = value.get_secret_value()
            if not valid_api_key_format(raw):
                raise ValueError("API Key 长度或格式不正确。")
        return value


class SettingsOut(StrictModel):
    openai_api_key_set: bool
    model: str
    temperature: float
    provider: Literal["api", "chatgpt"] = "api"
    chatgpt_model: str = ""


class KeyImport(StrictModel):
    content: SecretStr

    @field_validator("content")
    @classmethod
    def bounded_content(cls, value):
        if not 1 <= len(value.get_secret_value()) <= 16384:
            raise ValueError("密钥文件内容为空或超过 16 KB。")
        return value


class DiagnosticRequest(StrictModel):
    check_network: bool = True


class SessionCreate(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=80)


class SessionRename(StrictModel):
    title: str = Field(min_length=1, max_length=80)


class MessageCreate(StrictModel):
    content: str = Field(min_length=1, max_length=20000)


class GenerateRequest(StrictModel):
    use_default_assumptions: bool = True


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @field_validator("created_at", "updated_at", mode="after", check_fields=False)
    @classmethod
    def utc_dates(cls, value: datetime):
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value


class SessionOut(ORMModel):
    id: int
    title: str
    status: str
    use_default_assumptions: bool
    last_error: str | None
    created_at: datetime
    updated_at: datetime


class MessageOut(ORMModel):
    id: int
    session_id: int
    role: Literal["user", "assistant"]
    kind: Literal["input", "questions", "report"]
    content: str
    created_at: datetime


class SessionDetail(StrictModel):
    session: SessionOut
    messages: list[MessageOut]


class MessageResult(StrictModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    message: MessageOut
    user_message: MessageOut
    need_more_info: bool
    questions: list[str]
    generation_id: int | None
    output_markdown: str


class GenerateResult(StrictModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    generation_id: int
    output_markdown: str
    message: MessageOut


# The provider returns claims, never arbitrary top-level Markdown.
class Fact(StrictModel):
    text: str = Field(min_length=1, max_length=800)
    basis: Literal["user", "assumption"]
    evidence: str | None

    @field_validator("text", "evidence")
    @classmethod
    def one_line(cls, value):
        if value is not None and re.search(r"[\x00-\x1f\x7f\u2028\u2029]", value):
            raise ValueError("事实必须是单行，不能添加或覆盖章节。")
        return value


Facts = Annotated[list[Fact], Field(min_length=1, max_length=12)]


class Requirements(StrictModel):
    must_do: Facts
    optional: list[Fact] = Field(max_length=12)
    quantified: Facts


class Instructions(StrictModel):
    role: Facts
    goal: Facts
    context: Facts
    tech_stack: Facts
    output_format: Facts


# All fields are required for OpenAI's strict JSON Schema. Empty arrays mean
# there is no applicable item; nullable/default fields must not hide omissions.
RequirementID = Annotated[str, Field(pattern=r"^[ROQ](?:[1-9]|1[0-2])$")]
ModuleID = Annotated[str, Field(pattern=r"^M[1-8]$")]
TaskID = Annotated[str, Field(pattern=r"^T(?:[1-9]|10)$")]
RequirementRefs = Annotated[list[RequirementID], Field(min_length=1, max_length=36)]
ModuleRefs = Annotated[list[ModuleID], Field(min_length=1, max_length=8)]


class Analysis(StrictModel):
    actors: Facts
    workflow: Facts
    constraints: list[Fact] = Field(max_length=8)
    out_of_scope: list[Fact] = Field(max_length=8)
    open_issues: list[Fact] = Field(max_length=5)


class ArchitectureDecision(StrictModel):
    choice: Fact
    alternative: Fact
    reason: Fact
    tradeoff: Fact


class PlannedFile(StrictModel):
    path: Fact
    purpose: Fact


class ModulePlan(StrictModel):
    id: ModuleID
    name: Fact
    responsibility: Fact
    files: list[PlannedFile] = Field(min_length=1, max_length=8)
    requirement_ids: RequirementRefs
    depends_on: list[ModuleID] = Field(max_length=8)


class InterfacePlan(StrictModel):
    id: str = Field(pattern=r"^I[1-8]$")
    kind: Literal["http", "function", "event", "cli"]
    module_id: ModuleID
    requirement_ids: RequirementRefs
    operation: Fact
    input: Fact
    output: Fact
    errors: Facts
    security: Fact
    idempotency: Fact
    examples: list[Fact] = Field(min_length=2, max_length=2)


class TaskPlan(StrictModel):
    id: TaskID
    title: Fact
    module_ids: ModuleRefs
    requirement_ids: RequirementRefs
    depends_on: list[TaskID] = Field(max_length=10)
    deliverable: Fact
    verification: Fact


class AcceptancePlan(StrictModel):
    id: str = Field(pattern=r"^C(?:[1-9]|1[0-2])$")
    requirement_ids: RequirementRefs
    scenario: Fact
    verification: Fact


class RiskPlan(StrictModel):
    id: str = Field(pattern=r"^K[1-6]$")
    category: Literal["scope", "architecture", "data", "security", "dependency", "cost", "performance"]
    level: Literal["high", "medium", "low"]
    module_ids: ModuleRefs
    requirement_ids: RequirementRefs
    description: Fact
    trigger: Fact
    mitigation: Fact
    verification: Fact


class EngineeringPlan(StrictModel):
    decisions: list[ArchitectureDecision] = Field(min_length=1, max_length=3)
    data_flow: Facts
    data_model: Facts
    modules: list[ModulePlan] = Field(min_length=1, max_length=8)
    interfaces: list[InterfacePlan] = Field(min_length=1, max_length=8)
    tasks: list[TaskPlan] = Field(min_length=1, max_length=10)
    acceptance: list[AcceptancePlan] = Field(min_length=1, max_length=12)
    risks: list[RiskPlan] = Field(min_length=1, max_length=6)


class Report(StrictModel):
    understanding: Facts
    analysis: Analysis
    motivation: Facts
    requirements: Requirements
    technical_plan: Facts
    instructions: Instructions
    planning: EngineeringPlan
    self_check: Facts


class LLMReply(StrictModel):
    need_more_info: bool
    questions: list[str] = Field(max_length=5)
    report: Report | None
