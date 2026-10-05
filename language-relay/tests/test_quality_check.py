import json

import httpx
import pytest

from app.schemas import LLMReply
from app.services.relay_service import render_markdown
from tests.fakes import full_reply, questions_reply
from tools.quality_check import CASES, check_full, main, run


def full_output():
    reply = full_reply()
    reply["output_markdown"] = render_markdown(LLMReply.model_validate(reply), ["我想做卡牌游戏"])
    return reply


def test_real_quality_contract_checks_do_not_require_an_http_server_in_the_plan():
    data = full_output()
    check_full(data, {"no_http": True, "stack": ["TypeScript", "Vite"]})
    with pytest.raises(AssertionError):
        check_full(data, {"stack": ["Python"]})
    with pytest.raises(AssertionError):
        check_full(data, {"excluded_stack": ["Vite"]})


def test_quality_check_rejects_unwanted_http_operation():
    raw = full_reply()
    raw["report"]["planning"]["interfaces"][0].update(kind="http")
    raw["report"]["planning"]["interfaces"][0]["operation"]["text"] = "POST /api/cards"
    raw["output_markdown"] = render_markdown(LLMReply.model_validate(raw), [])
    with pytest.raises(AssertionError):
        check_full(raw, {"no_http": True})


def test_list_cases_is_offline_and_identifies_all_five_review_dimensions(monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["quality_check.py", "--list-cases"])
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: pytest.fail("unexpected HTTP"))
    main()
    result = json.loads(capsys.readouterr().out)
    assert len(result["cases"]) == len(result["human_review_dimensions"]) == 5


def test_live_quality_mode_preserves_failed_output_and_cleans_only_its_synthetic_sessions(
    tmp_path, monkeypatch, capsys
):
    created = []
    deleted = []
    last = {}
    output = full_output()

    def handle(request):
        path = request.url.path
        if path == "/api/settings":
            return httpx.Response(200, json={"provider": "api", "openai_api_key_set": True})
        if request.method == "POST" and path == "/api/sessions":
            identifier = 100 + len(created)
            created.append(identifier)
            return httpx.Response(201, json={"id": identifier})
        sid = int(path.split("/")[3])
        if request.method == "DELETE":
            deleted.append(sid)
            return httpx.Response(200, json={"ok": True})
        if path.endswith("/export"):
            return httpx.Response(200, text=last[sid])
        text = json.loads(request.content)["content"]
        data = output
        if text == "我想做卡牌游戏":
            data = questions_reply()
            data["output_markdown"] = render_markdown(LLMReply.model_validate(data), [text])
        last[sid] = data["output_markdown"]
        return httpx.Response(200, json=data)

    client_class = httpx.Client
    monkeypatch.setattr(
        httpx, "Client", lambda **kwargs: client_class(transport=httpx.MockTransport(handle), **kwargs)
    )
    assert run("http://127.0.0.1:8000", tmp_path) is False
    result = json.loads((tmp_path / "quality-report.json").read_text(encoding="utf-8"))
    assert result["content_quality_confirmed"] is False
    assert len(result["results"]) == len(CASES)
    assert created == deleted and len(set(created)) == len(CASES)
    assert (tmp_path / "case-2-turn-1.md").read_text(encoding="utf-8") == output["output_markdown"]
    assert result["results"][1]["contract_passed"] is False
    assert all(item["human_content_review"] == "待检查" for item in result["results"])


def test_missing_connection_stops_before_any_synthetic_conversation(tmp_path, monkeypatch):
    paths = []

    def handle(request):
        paths.append(request.url.path)
        return httpx.Response(200, json={"provider": "api", "openai_api_key_set": False})

    client_class = httpx.Client
    monkeypatch.setattr(
        httpx, "Client", lambda **kwargs: client_class(transport=httpx.MockTransport(handle), **kwargs)
    )
    with pytest.raises(SystemExit, match="配置并检测 API Key"):
        run("http://127.0.0.1:8000", tmp_path)
    assert paths == ["/api/settings"]
