import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import dotenv_values

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def valid_api_key_format(value: str) -> bool:
    # Empty explicitly clears the key; preserve printable token boundaries.
    return len(value) <= 512 and all("\x21" <= char <= "\x7e" for char in value)


@dataclass(frozen=True)
class Config:
    data_dir: Path = field(default_factory=lambda: PROJECT_ROOT / ".data")
    api_key: str = field(default="", repr=False)
    model: str = "gpt-4o-mini"
    temperature: float = 0.2
    llm_budget_seconds: float = 28.0
    max_context_chars: int = 60000
    database_url: str | None = None

    @property
    def sqlite_url(self) -> str:
        return self.database_url or f"sqlite:///{self.data_dir / 'relay.sqlite3'}"

    @classmethod
    def from_env(cls) -> "Config":
        values = {**dotenv_values(PROJECT_ROOT / ".env"), **os.environ}
        data_dir = Path(values.get("RELAY_DATA_DIR") or ".data").expanduser()
        if not data_dir.is_absolute():
            data_dir = PROJECT_ROOT / data_dir
        temperature = float(values.get("OPENAI_TEMPERATURE") or "0.2")
        budget = float(values.get("RELAY_LLM_BUDGET_SECONDS") or "28")
        if not 0 <= temperature <= 2 or not 1 <= budget <= 28:
            raise ValueError("温度必须在 0–2 之间，调用总预算必须在 1–28 秒之间。")
        return cls(
            data_dir=data_dir.resolve(),
            api_key=(values.get("OPENAI_API_KEY") or "").strip(),
            model=(values.get("OPENAI_MODEL") or "gpt-4o-mini").strip(),
            temperature=temperature,
            llm_budget_seconds=budget,
        )
