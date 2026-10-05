import json
import os
import re
import tempfile
from pathlib import Path
from threading import RLock

from sqlalchemy.orm import Session as DBSession

from app.config import Config, valid_api_key_format
from app.errors import RelayError
from app.models import Setting
from app.schemas import SettingsOut, SettingsUpdate


class SettingsService:
    def __init__(self, config: Config):
        self.config = config
        self.key_file = config.data_dir / "api-key.json"
        self.lock = RLock()

    def api_key(self) -> str:
        with self.lock:
            if self.key_file.exists():
                try:
                    data = json.loads(self.key_file.read_text(encoding="utf-8"))
                    key = data["openai_api_key"]
                    if not isinstance(key, str):
                        raise TypeError
                    return key
                except (OSError, ValueError, KeyError, TypeError):
                    raise RelayError(
                        "settings_unreadable", "本地密钥文件无法读取，请重新在设置中保存 API Key。", 500
                    ) from None
            return self.config.api_key

    def _write_key(self, key: str):
        self.config.data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", dir=self.config.data_dir, delete=False
            ) as stream:
                temporary = Path(stream.name)
                if os.name != "nt":
                    temporary.chmod(0o600)
                json.dump({"openai_api_key": key}, stream, ensure_ascii=False)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.key_file)
        except OSError:
            raise RelayError(
                "settings_write_failed", "无法保存本地密钥，请检查数据目录的写入权限。", 500
            ) from None
        finally:
            if temporary and temporary.exists():
                temporary.unlink()

    def get(self, db: DBSession) -> SettingsOut:
        model = db.get(Setting, "model")
        temperature = db.get(Setting, "temperature")
        provider = db.get(Setting, "provider")
        chatgpt_model = db.get(Setting, "chatgpt_model")
        try:
            key_set = bool(self.api_key())
        except RelayError:
            # Keep the UI reachable so the user can replace a corrupt key file.
            key_set = False
        return SettingsOut(
            openai_api_key_set=key_set,
            model=model.value if model else self.config.model,
            temperature=float(temperature.value) if temperature else self.config.temperature,
            provider=provider.value if provider else "api",
            chatgpt_model=chatgpt_model.value if chatgpt_model else "",
        )

    def update(self, db: DBSession, patch: SettingsUpdate) -> SettingsOut:
        with self.lock:
            if patch.openai_api_key is not None:
                self._write_key(patch.openai_api_key.get_secret_value())
            for key in ("model", "temperature", "provider", "chatgpt_model"):
                value = getattr(patch, key)
                if value is not None:
                    db.merge(Setting(key=key, value=str(value)))
            db.commit()
            return self.get(db)

    def import_key(self, db: DBSession, content: str):
        content = content.lstrip("\ufeff").strip()
        try:
            if content.startswith("{"):
                data = json.loads(content)
                content = data.get("openai_api_key", data.get("OPENAI_API_KEY", ""))
                if not isinstance(content, str):
                    raise ValueError
            elif "OPENAI_API_KEY" in content:
                matches = re.findall(r"(?m)^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*([^\r\n]+)$", content)
                if len(matches) != 1:
                    raise ValueError
                content = matches[0]
            content = content.strip().strip("\"'").strip()
            if not re.fullmatch(r"sk-[A-Za-z0-9_-]{3,509}", content) or not valid_api_key_format(content):
                raise ValueError
        except (ValueError, TypeError, AttributeError):
            raise RelayError("key_import_invalid", "没有识别到完整 OpenAI 密钥。请选择仅含密钥的 .txt、.env 或密钥 JSON 文件，也可直接粘贴 sk- 开头的密钥。", 400) from None
        return self.update(db, SettingsUpdate(openai_api_key=content, provider="api"))
