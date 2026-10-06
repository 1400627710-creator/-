"""Local bearer credential for MCP transport, never an OpenAI model key."""
import json
import os
import re
import secrets
import tempfile
from hmac import compare_digest
from threading import RLock

from app.errors import RelayError


class ToolAccess:
    def __init__(self, config):
        self.path = config.data_dir / "tool-access.json"
        self.lock = RLock()

    def token(self):
        with self.lock:
            if self.path.exists():
                try:
                    value = json.loads(self.path.read_text(encoding="utf-8"))["token"]
                    if not isinstance(value, str) or len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
                        raise ValueError
                    return value
                except (OSError, KeyError, TypeError, ValueError):
                    raise RelayError("tool_credentials_unreadable", "工具连接口令无法读取，请恢复本机 tool-access.json，或移走损坏文件后重启。", 503) from None
            self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            value = secrets.token_hex(32)
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=self.path.parent, delete=False) as stream:
                    temporary = stream.name
                    if os.name != "nt":
                        os.chmod(temporary, 0o600)
                    json.dump({"token": value}, stream)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, self.path)
            except OSError:
                raise RelayError("tool_credentials_unreadable", "无法保存工具连接口令，请检查本机数据目录权限。", 503) from None
            finally:
                if temporary and os.path.exists(temporary):
                    os.unlink(temporary)
            return value

    def authorized(self, header):
        return isinstance(header, str) and re.fullmatch(r"Bearer [0-9a-f]{64}", header) is not None and compare_digest(header[7:], self.token())
