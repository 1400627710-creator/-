import os
from pathlib import Path

from sqlalchemy import create_engine, event, update
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import Config
from app.models import Base, Session


class Database:
    def __init__(self, config: Config):
        config.data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        if os.name != "nt":
            config.data_dir.chmod(0o700)
        options = {"connect_args": {"check_same_thread": False, "timeout": 2}}
        if config.sqlite_url.endswith(":memory:"):
            options["poolclass"] = StaticPool
        self.engine = create_engine(config.sqlite_url, **options)

        @event.listens_for(self.engine, "connect")
        def sqlite_pragmas(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA busy_timeout=2000")

        self.sessions = sessionmaker(self.engine, expire_on_commit=False)

    def initialize(self):
        Base.metadata.create_all(self.engine)
        # Recover a request interrupted by closing the process. Keep its input.
        with self.sessions.begin() as db:
            db.execute(
                update(Session)
                .where(Session.status == "processing")
                .values(status="error", last_error="上次生成被中断，原输入已保存，可以重试。")
            )
        if self.engine.url.database and self.engine.url.database != ":memory:":
            path = Path(self.engine.url.database)
            if os.name != "nt":
                path.chmod(0o600)

    def close(self):
        self.engine.dispose()
