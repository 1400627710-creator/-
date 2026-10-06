import asyncio
import json
import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime

import httpx2
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    AuthenticationError,
    BadRequestError,
    PermissionDeniedError,
)
from pydantic import ValidationError

from app.config import Config, valid_api_key_format
from app.errors import RelayError
from app.prompts.relay_prompt import SYSTEM_PROMPT, control_prompt
from app.schemas import LLMReply, SettingsOut
from diagnose import http_evidence

logger = logging.getLogger(__name__)


class ReplyFormatError(ValueError):
    def __init__(self, message: str, *, issues: tuple[str, ...] = ()):
        super().__init__(message)
        # Only application-defined issue codes, never provider/user text.
        self.issues = issues


def provider_retry_delay(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return max(0.0, float(value))
    except ValueError:
        try:
            target = parsedate_to_datetime(value)
            if target.tzinfo is None:
                target = target.replace(tzinfo=UTC)
            return max(0.0, (target - datetime.now(UTC)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return 0.0


def plan_error(code):
    errors = {
        "subscription_sharing_usage_limit_exceeded": (
            "chatgpt_usage_limit",
            "ChatGPT 计划或本应用额度已达到上限，请在 ChatGPT 设置中查看额度。",
            429,
        ),
        "subscription_sharing_user_not_eligible": (
            "chatgpt_not_eligible",
            "此账户或工作区目前不能让本应用使用 ChatGPT 计划。",
            403,
        ),
        "subscription_sharing_unsupported_capability": (
            "chatgpt_capability_unsupported",
            "所选 ChatGPT 模型或请求参数暂不受支持，请选择其他可用模型。",
            400,
        ),
        "subscription_sharing_route_not_supported": (
            "chatgpt_route_unsupported",
            "官方暂不允许此调用接口，请导出自检报告核对接口配置，或明确选择 API Key 连接。",
            403,
        ),
        "subscription_sharing_invalid_user": (
            "chatgpt_login_expired",
            "ChatGPT 授权未被接受，请重新登录。",
            401,
        ),
        "chatpass_v2_scope_not_authorized": (
            "chatgpt_plan_not_enabled",
            "请重新登录并允许本应用使用 ChatGPT 计划。",
            403,
        ),
        "chatpass_v2_invalid_authorization_context": (
            "chatgpt_plan_not_enabled",
            "请重新登录并允许本应用使用 ChatGPT 计划。",
            403,
        ),
    }
    if code in errors:
        name, message, status = errors[code]
        result = RelayError(name, message, status)
        result.provider_evidence = {"provider_code": code}
        return result
    return RelayError(
        "chatgpt_temporarily_unavailable", "ChatGPT 计划服务暂时不可用，请稍后重试。", 503, retryable=True
    )


def terminal_provider_error(error, provider="api"):
    body = error.body if isinstance(error.body, dict) else {}
    inner = body.get("error", body)
    code = str(inner.get("code") or "") if isinstance(inner, dict) else ""
    if provider == "chatgpt":
        evidence = http_evidence(error.status_code, error.response.headers, error.response.content)
        if code.startswith(("subscription_sharing_", "chatpass_v2_")):
            result = plan_error(code)
            if not result.retryable:
                result.provider_evidence = evidence
                return result
            if error.status_code >= 500:
                return None
        if error.status_code == 401:
            result = RelayError("chatgpt_login_expired", "ChatGPT 授权未被接受，请重新登录。", 401)
            result.provider_evidence = evidence
            return result
        if code == "insufficient_scope":
            result = RelayError("chatgpt_scope_rejected", "模型调用缺少官方许可。请点击“授权模型调用”或导出自检报告核对权限。", 403)
            result.provider_evidence = evidence
            return result
        if error.status_code == 403:
            result = RelayError("chatgpt_auth_forbidden", "模型调用被拒绝（HTTP 403），现有错误码尚未说明具体的账户、地区或工作区原因。请一键自检并导出报告。", 403)
            result.provider_evidence = evidence
            return result
    if code in {"insufficient_quota", "billing_hard_limit_reached", "billing_not_active"}:
        return RelayError(
            "api_quota_exhausted",
            "OpenAI API 额度不足或计费未启用。请在 API 平台检查余额；API 与 ChatGPT 订阅的计费分别管理。",
            402,
        )
    if isinstance(error, AuthenticationError):
        return RelayError("api_key_invalid", "API Key 无效，请在设置中重新导入完整密钥。", 401)
    if isinstance(error, PermissionDeniedError):
        return RelayError(
            "api_permission_denied", "密钥项目权限、账户或地区限制阻止了调用，请检查 API 平台权限。", 403
        )
    if isinstance(error, BadRequestError) or error.status_code == 404:
        return RelayError(
            "model_config_invalid",
            "模型或温度配置不受支持。请检查模型权限与结构化输出支持；API 默认模型为 gpt-4o-mini。",
            400,
        )
    if error.status_code not in (408, 409, 429) and error.status_code < 500:
        return RelayError("gpt_request_rejected", "OpenAI 拒绝了请求，请检查账户与模型权限。", 502)
    return None


class OpenAITransport:
    def __init__(self, http_client_factory=None):
        # Ignore environment proxies and disable redirects: private data goes
        # only to the explicit official HTTPS endpoint.
        self.http_client_factory = http_client_factory or (
            lambda: httpx2.AsyncClient(trust_env=False, follow_redirects=False)
        )

    async def request(
        self, *, api_key: str, settings: SettingsOut, messages: list[dict], timeout: float
    ) -> str:
        if settings.provider == "chatgpt":
            return await self.responses_request(
                api_key, settings.chatgpt_model, messages, timeout, LLMReply.model_json_schema()
            )
        # An explicit endpoint prevents OPENAI_BASE_URL from redirecting private data.
        # SDK retries are disabled: the outer loop owns exactly two retries.
        async with AsyncOpenAI(
            api_key=api_key,
            base_url="https://api.openai.com/v1",
            max_retries=0,
            timeout=timeout,
            http_client=self.http_client_factory(),
        ) as client:
            completion = await client.chat.completions.create(
                model=settings.model,
                temperature=settings.temperature,
                messages=messages,
                max_completion_tokens=7000,
                store=False,
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "language_relay",
                        "strict": True,
                        "schema": LLMReply.model_json_schema(),
                    },
                },
            )
        if not completion.choices:
            raise ReplyFormatError("empty response")
        choice = completion.choices[0]
        if choice.message.refusal:
            raise RelayError("model_refused", "GPT 未能处理这个想法，请调整内容后再试。", 422)
        if choice.finish_reason != "stop" or not choice.message.content:
            raise ReplyFormatError("incomplete response")
        return choice.message.content

    async def responses_request(self, token, model, messages, timeout, schema):
        if not model:
            raise RelayError("chatgpt_model_missing", "请在设置中刷新并选择账户可用的 ChatGPT 模型。", 400)
        instructions = "\n\n".join(m["content"] for m in messages if m["role"] in {"system", "developer"})
        inputs = [{"role": "user", "content": m["content"]} for m in messages if m["role"] == "user"]
        parts, completed = [], False
        async with AsyncOpenAI(
            api_key=token,
            base_url="https://api.openai.com/v1",
            max_retries=0,
            timeout=timeout,
            http_client=self.http_client_factory(),
        ) as client:
            stream = await client.responses.create(
                model=model,
                instructions=instructions,
                input=inputs,
                store=False,
                stream=True,
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "language_relay",
                        "strict": True,
                        "schema": schema,
                    }
                },
            )
            async with stream:
                async for event in stream:
                    if event.type == "response.output_text.delta":
                        parts.append(event.delta)
                        if sum(map(len, parts)) > 100000:
                            raise ReplyFormatError("oversize response")
                    elif event.type == "response.completed":
                        completed = True
                    elif event.type == "response.failed":
                        code = getattr(getattr(event.response, "error", None), "code", "")
                        raise plan_error(code)
                    elif event.type in {"response.incomplete", "error"}:
                        raise ReplyFormatError("incomplete response")
        if not completed:
            raise ReplyFormatError("stream ended without completion")
        return "".join(parts)

    async def probe(self, *, api_key, settings, timeout):
        schema = {
            "type": "object",
            "properties": {"ok": {"type": "boolean"}},
            "required": ["ok"],
            "additionalProperties": False,
        }
        messages = [
            {"role": "system", "content": 'Connection test. Return {"ok": true}.'},
            {"role": "user", "content": "Test connection only."},
        ]
        if settings.provider == "chatgpt":
            raw = await self.responses_request(api_key, settings.chatgpt_model, messages, timeout, schema)
        else:
            async with AsyncOpenAI(
                api_key=api_key,
                base_url="https://api.openai.com/v1",
                max_retries=0,
                timeout=timeout,
                http_client=self.http_client_factory(),
            ) as client:
                response = await client.chat.completions.create(
                    model=settings.model,
                    temperature=settings.temperature,
                    messages=messages,
                    store=False,
                    max_completion_tokens=32,
                    response_format={
                        "type": "json_schema",
                        "json_schema": {"name": "connection_check", "strict": True, "schema": schema},
                    },
                )
            raw = response.choices[0].message.content if response.choices else ""
        if json.loads(raw or "{}").get("ok") is not True:
            raise ReplyFormatError("connection response invalid")


class LLMClient:
    def __init__(self, config: Config, transport=None):
        self.config = config
        self.transport = transport or OpenAITransport()

    async def complete(
        self,
        *,
        api_key: str,
        settings: SettingsOut,
        context: dict,
        force_defaults: bool,
        validate: Callable[[LLMReply], None],
        deadline: float | None = None,
    ) -> LLMReply:
        if not api_key:
            raise RelayError("api_key_missing", "尚未配置 OpenAI API Key，请打开设置填写后重试。", 400)
        if settings.provider == "api" and not valid_api_key_format(api_key):
            raise RelayError("api_key_invalid", "API Key 格式不正确，请在设置中重新填写完整密钥。", 401)
        context_json = json.dumps(context, ensure_ascii=False)
        if len(context_json) > self.config.max_context_chars:
            raise RelayError("context_too_long", "这个会话内容过长，请新建会话并提供整理后的需求。", 413)

        deadline = min(
            deadline if deadline is not None else float("inf"),
            time.monotonic() + self.config.llm_budget_seconds,
        )
        failure_code = "gpt_failed"
        format_retry = False
        format_issues: tuple[str, ...] = ()
        attempts = 0
        failure_evidence = {}
        # Give the first attempt more time, retaining time for BOTH retries.
        weights = (3, 1, 1)
        delay_base = min(0.15, self.config.llm_budget_seconds / 20)
        for attempt in range(3):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            reserved_pauses = sum(delay_base * (index + 1) for index in range(attempt, 2))
            available = max(remaining - reserved_pauses, remaining * 0.1)
            timeout = available * weights[attempt] / sum(weights[attempt:])
            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "system", "content": control_prompt(force_defaults, format_retry, format_issues)},
                {"role": "user", "content": context_json},
            ]
            attempts += 1
            retry_after = 0.0
            try:
                async with asyncio.timeout(timeout):
                    raw = await self.transport.request(
                        api_key=api_key, settings=settings, messages=messages, timeout=timeout
                    )
                    try:
                        if not isinstance(raw, str) or len(raw) > 100000:
                            raise ReplyFormatError("invalid response type or size")
                        reply = LLMReply.model_validate_json(raw)
                        validate(reply)
                    except ReplyFormatError:
                        raise
                    except ValueError:
                        raise ReplyFormatError("invalid structured response") from None
                    return reply
            except (TimeoutError, APITimeoutError):
                failure_code = "gpt_timeout"
            except (ValidationError, ReplyFormatError) as error:
                failure_code = "gpt_format_error"
                format_retry = True
                format_issues = getattr(error, "issues", ())
            except APIConnectionError:
                failure_code = "gpt_connection_error"
            except APIStatusError as error:
                if settings.provider == "chatgpt":
                    failure_evidence = http_evidence(error.status_code, error.response.headers, error.response.content)
                terminal = terminal_provider_error(error, settings.provider)
                if terminal:
                    terminal.attempts = attempts
                    raise terminal from None
                failure_code = "gpt_rate_limited" if error.status_code == 429 else "gpt_failed"
                retry_after = provider_retry_delay(error.response.headers.get("retry-after"))
            except RelayError as error:
                if error.retryable:
                    failure_code = "gpt_failed"
                else:
                    raise
            except Exception as error:
                logger.error("OpenAI client failed: %s", type(error).__name__)
                raise RelayError(
                    "gpt_client_error",
                    "OpenAI 调用处理失败，原输入已保存，请点击重试。",
                    500,
                    retryable=True,
                    attempts=attempts,
                ) from None

            if attempt < 2:
                pause = max(retry_after, delay_base * (attempt + 1))
                if pause >= deadline - time.monotonic():
                    # Respect provider backoff without exceeding the local deadline.
                    break
                await asyncio.sleep(pause)

        explanations = {
            "gpt_timeout": "GPT 响应超时。原输入已保存，请稍后点击重试。",
            "gpt_format_error": "GPT 输出未通过结构或规划一致性检查。原输入已保存，请点击重试。",
            "gpt_connection_error": "无法连接 OpenAI。请检查网络后点击重试。",
            "gpt_rate_limited": "OpenAI 暂时限流，请稍后点击重试。",
            "gpt_failed": "GPT 暂时不可用。原输入已保存，请稍后点击重试。",
        }
        note = " 已自动重试 2 次。" if attempts == 3 else ""
        result = RelayError(
            failure_code,
            explanations[failure_code] + note,
            504 if failure_code == "gpt_timeout" else 502,
            retryable=True,
            attempts=attempts,
        )
        result.provider_evidence = failure_evidence
        raise result
