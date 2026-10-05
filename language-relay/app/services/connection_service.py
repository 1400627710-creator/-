"""A small synthetic request diagnoses the selected connection, without history."""
import asyncio
import time

from openai import APIConnectionError, APIStatusError, APITimeoutError

from app.config import valid_api_key_format
from app.errors import RelayError
from app.services.llm_client import OpenAITransport, terminal_provider_error


class ConnectionService:
    def __init__(self, settings, auth, transport=None):
        self.settings, self.auth = settings, auth
        self.transport = transport or OpenAITransport()

    async def check(self, db):
        settings = self.settings.get(db)
        start = time.monotonic()
        try:
            async with asyncio.timeout(10):
                if settings.provider == "chatgpt":
                    key = await self.auth.access_token()
                else:
                    key = self.settings.api_key()
                    if not key:
                        raise RelayError("api_key_missing", "尚未配置密钥，请导入 API Key，或选择使用 ChatGPT 登录。", 400)
                    if not valid_api_key_format(key):
                        raise RelayError("api_key_invalid", "密钥格式不正确，请重新导入完整密钥。", 401)
                await self.transport.probe(api_key=key, settings=settings, timeout=8)
        except RelayError:
            raise
        except (TimeoutError, APITimeoutError):
            raise RelayError("connection_timeout", "连接检查超时。密钥或授权已保留，请检查网络后再次检测。", 504) from None
        except APIConnectionError:
            raise RelayError("connection_network_error", "无法连接 OpenAI 官方接口。请检查网络；重新导入密钥无法修复网络连接。", 502) from None
        except APIStatusError as error:
            terminal = terminal_provider_error(error, settings.provider)
            if terminal:
                raise terminal from None
            raise RelayError("connection_temporarily_unavailable", "OpenAI 暂时限流或服务不可用，请稍后再次检测。", 502) from None
        except Exception:
            raise RelayError("connection_response_invalid", "连接检查返回的格式不受支持，请检查所选模型或稍后重试。", 502) from None
        return {"ok": True, "provider": settings.provider, "model": settings.chatgpt_model if settings.provider == "chatgpt" else settings.model, "elapsed_ms": round((time.monotonic() - start) * 1000), "message": "连接检测通过，可以发送想法。"}
