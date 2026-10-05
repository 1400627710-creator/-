from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.errors import RelayError
from app.models import Generation, Message, Session, utcnow
from app.schemas import MessageOut, SessionDetail, SessionOut


def get_session(db: DBSession, session_id: int) -> Session:
    session = db.get(Session, session_id)
    if session is None:
        raise RelayError("session_not_found", "会话不存在，可能已被删除。", 404)
    return session


def list_sessions(db: DBSession) -> list[SessionOut]:
    return [
        SessionOut.model_validate(item)
        for item in db.scalars(select(Session).order_by(Session.updated_at.desc(), Session.id.desc()))
    ]


def create_session(db: DBSession, title: str | None = None) -> SessionOut:
    session = Session(title=title or "新会话")
    db.add(session)
    db.commit()
    return SessionOut.model_validate(session)


def get_messages(db: DBSession, session_id: int) -> list[Message]:
    return list(db.scalars(select(Message).where(Message.session_id == session_id).order_by(Message.id)))


def detail(db: DBSession, session_id: int) -> SessionDetail:
    return SessionDetail(
        session=SessionOut.model_validate(get_session(db, session_id)),
        messages=[MessageOut.model_validate(m) for m in get_messages(db, session_id)],
    )


def rename(db: DBSession, session_id: int, title: str) -> SessionOut:
    session = get_session(db, session_id)
    session.title = title
    session.updated_at = utcnow()
    db.commit()
    return SessionOut.model_validate(session)


def delete_session(db: DBSession, session_id: int):
    session = get_session(db, session_id)
    db.delete(session)
    db.commit()


def save_input(db: DBSession, session_id: int, content: str) -> Message:
    session = get_session(db, session_id)
    message = Message(session_id=session_id, role="user", kind="input", content=content)
    db.add(message)
    if session.title == "新会话":
        session.title = " ".join(content.split())[:40]
    session.updated_at = utcnow()
    db.commit()
    return message


def latest_user(db: DBSession, session_id: int) -> Message:
    get_session(db, session_id)
    message = db.scalar(
        select(Message)
        .where(Message.session_id == session_id, Message.role == "user")
        .order_by(Message.id.desc())
        .limit(1)
    )
    if message is None:
        raise RelayError("empty_session", "请先输入一个想法，再生成开发指令。", 400)
    return message


def export_markdown(db: DBSession, session_id: int, message_id: int | None = None) -> tuple[Message, str]:
    get_session(db, session_id)
    query = select(Message).where(Message.session_id == session_id, Message.role == "assistant")
    if message_id is not None:
        query = query.where(Message.id == message_id)
    message = db.scalar(query.order_by(Message.id.desc()).limit(1))
    if message is None:
        raise RelayError("nothing_to_export", "当前没有可导出的结果，请先发送想法。", 404)
    return message, message.content


def summary_counts(db: DBSession, session_id: int) -> tuple[int, int]:
    return (
        db.scalar(select(func.count()).select_from(Message).where(Message.session_id == session_id)) or 0,
        db.scalar(select(func.count()).select_from(Generation).where(Generation.session_id == session_id))
        or 0,
    )
