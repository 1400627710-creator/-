import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


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
    category: Literal[
        "scope", "architecture", "data", "security", "dependency", "cost", "performance"
    ]
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


class ToolPrepare(StrictModel):
    request_key: str = Field(min_length=8, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    session_id: int | None = Field(default=None, ge=1)
    idea: str | None = Field(default=None, min_length=1, max_length=20000)
    use_default_assumptions: bool | None = None
