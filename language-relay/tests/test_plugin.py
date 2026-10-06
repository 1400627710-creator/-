"""Verify the actual distributed plugin, without a model key or model network."""
import json
import os
import sqlite3
import subprocess
import sys
from contextlib import closing
from pathlib import Path

import pytest
from mcp import Client, StdioServerParameters

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / 'plugins/language-relay'
SKILL = PLUGIN / 'skills/language-relay'
SCRIPT = SKILL / 'scripts/relay_tool.py'


def command(workspace, *args, ok=True):
    wrapper = "import socket,runpy,sys,pathlib; socket.socket.connect=lambda *a,**k: (_ for _ in ()).throw(RuntimeError('network_blocked')); p=sys.argv.pop(1); sys.argv[0]=p; sys.path.insert(0,str(pathlib.Path(p).resolve().parent)); runpy.run_path(p,run_name='__main__')"
    result = subprocess.run([sys.executable, '-c', wrapper, str(SCRIPT), '--workspace', str(workspace), *map(str, args)],
                            capture_output=True, text=True, encoding='utf-8', timeout=25, check=False,
                            env={**os.environ, 'OPENAI_API_KEY': 'sk-synthetic-must-not-appear', 'PYTHONUTF8': '1'})
    assert result.returncode == (0 if ok else 2), result.stdout + result.stderr
    assert not result.stderr
    assert 'sk-synthetic' not in result.stdout
    return json.loads(result.stdout)


def call(workspace, operation, arguments=None, ok=True):
    workspace.parent.mkdir(parents=True, exist_ok=True)
    source = workspace.parent / 'request.json'
    source.write_text(json.dumps({'operation': operation, 'arguments': arguments or {}}, ensure_ascii=False), encoding='utf-8')
    return command(workspace, 'call', '--request-file', source, ok=ok)


def test_diagnose_readonly(tmp_path):
    workspace = tmp_path / '中文 with spaces'
    report = command(workspace, 'diagnose')
    assert report['runtime_ready'] and not workspace.exists()
    assert not report['network_requested'] and not report['account_login_verified']
    assert not report['mcp_plugin_installation_verified']


def test_one_click_selfcheck(tmp_path):
    report = command(tmp_path / 'state', 'selfcheck')
    assert report['ok'] and report['passed'] == report['total'] == 15
    assert report['test_data'] == 'synthetic'
    assert not report['user_history_modified'] and not report['model_inference_performed']


def test_questions_defaults_export_and_restore(tmp_path):
    w = tmp_path / '中文 state with spaces'
    first = call(w, 'prepare', {'request_key': 'questions_001', 'idea': '我想做卡牌游戏'})
    context = call(w, 'context', {'task_id': first['task_id']})
    assert not context['trusted_mode']['use_default_assumptions']
    questions = {'need_more_info': True, 'questions': ['希望采用哪种卡牌玩法？'], 'report': None}
    saved = call(w, 'submit', {'task_id': first['task_id'], 'reply': questions})
    assert saved['output_markdown'].startswith('## 3.') and saved['output_markdown'].count('## ') == 1
    assert call(w, 'submit', {'task_id': first['task_id'], 'reply': questions})['message_id'] == saved['message_id']
    second = call(w, 'prepare', {'request_key': 'defaults_002', 'session_id': first['session_id'], 'idea': '使用默认假设，我需要结果'})
    assert second['use_default_assumptions']
    reply = json.loads((SKILL / 'assets/selfcheck-reply.json').read_text(encoding='utf-8'))
    full = call(w, 'submit', {'task_id': second['task_id'], 'reply': reply})
    assert all('## ' + str(i) + '.' in full['output_markdown'] for i in range(1, 8))
    output = tmp_path / '正确导出.md'
    command(w, 'export', '--task-id', second['task_id'], '--output', output)
    assert output.read_bytes() == full['output_markdown'].encode()
    checkpoint = tmp_path / 'language-relay-state.sqlite3'
    backup = command(w, 'checkpoint', '--output', checkpoint)
    assert not backup['credentials_included'] and not backup['persistent_save_completed']
    restored = tmp_path / 'restored'
    command(restored, 'restore', '--input', checkpoint)
    assert call(restored, 'result', {'task_id': second['task_id']})['output_markdown'] == full['output_markdown']
    assert command(restored, 'restore', '--input', checkpoint, ok=False)['error_code'] == 'plugin_state_exists'
    assert len(call(restored, 'sessions')['sessions']) == 1


@pytest.mark.parametrize('operation,arguments', [('unknown', {}), ('status', {'api_key': 'sk-fake'}),
    ('prepare', {'request_key': 'x', 'idea': '想法'}), ('next_task', {'session_id': True}),
    ('context', {'task_id': 'wrong'}), ('submit', {'task_id': 'wrong', 'reply': 'raw markdown'})])
def test_bad_arguments(tmp_path, operation, arguments):
    result = call(tmp_path / 'state', operation, arguments, ok=False)
    assert result['problem_stage'] == 'tool_call' and result['error_code'].startswith('tool_')


def test_format_retry_and_diagnostic(tmp_path):
    w = tmp_path / 'state'
    task = call(w, 'prepare', {'request_key': 'bad_reply_001', 'idea': '我想做卡牌游戏'})
    for retries in (2, 1, 0):
        result = call(w, 'submit', {'task_id': task['task_id'], 'reply': {}}, ok=False)
        assert result['error_code'] == 'tool_result_invalid' and result['remaining_retries'] == retries
    report = call(w, 'diagnostics')
    assert report['problem_stage'] == 'tool_result_validation' and report['error_code'] == 'tool_result_invalid'
    assert not report['privacy']['ideas_or_history_exported']


@pytest.mark.parametrize('text', ['not json', '[]', '{"operation":"status"}', 'x' * 100001])
def test_invalid_request_file(tmp_path, text):
    source = tmp_path / 'invalid.json'
    source.write_text(text)
    assert command(tmp_path / 'state', 'call', '--request-file', source, ok=False)['error_code'] == 'plugin_request_invalid'


def test_checkpoint_rejects_credentials(tmp_path):
    w = tmp_path / 'state'
    call(w, 'status')
    with closing(sqlite3.connect(w / 'data/relay.sqlite3')) as db:
        db.execute("INSERT INTO settings(key,value) VALUES('openai_api_key','sk-synthetic-private')")
        db.commit()
    assert command(w, 'checkpoint', '--output', tmp_path / 'refused.sqlite3', ok=False)['error_code'] == 'plugin_checkpoint_invalid'


def test_diagnostic_filters_stored_text(tmp_path):
    w = tmp_path / 'state'
    w.mkdir()
    (w / 'plugin-diagnostic.json').write_text(json.dumps({'error_code': 'plugin_execution_failed', 'problem_stage': 'tool_runtime', 'message': 'sk-synthetic-secret', 'next_step': 'sensitive-input'}))
    report = command(w, 'diagnose')
    assert report['last_failure']['error_code'] == 'plugin_execution_failed'
    assert 'sensitive-input' not in json.dumps(report)


def test_manifest_and_marketplace():
    manifest = json.loads((PLUGIN / 'plugin.json').read_text())
    assert manifest['name'] == 'language-relay' and manifest['version'] == '1.0.0'
    assert 'apps' not in manifest['extensions']['com.openai']
    server = json.loads((PLUGIN / 'mcp.json').read_text())['mcpServers']['language-relay']
    assert server['type'] == 'stdio' and '${PLUGIN_DATA}/language-relay' in server['args']
    market = json.loads((ROOT / '.agents/plugins/marketplace.json').read_text())
    entry = next(p for p in market['plugins'] if p['name'] == 'language-relay')
    assert (ROOT / entry['source']['path']).resolve() == PLUGIN.resolve()


@pytest.mark.asyncio
async def test_real_stdio_catalog_and_write(tmp_path):
    parameters = StdioServerParameters(command=sys.executable, args=[str(SCRIPT), '--workspace', str(tmp_path / 'mcp-state'), 'mcp'])
    async with Client(parameters) as client:
        tools = (await client.list_tools()).tools
        assert {t.name for t in tools} == {'relay_status', 'relay_sessions', 'relay_start', 'relay_next_task', 'relay_context', 'relay_submit', 'relay_result', 'relay_cancel', 'relay_diagnostics'}
        status = (await client.call_tool('relay_status', {})).structured_content
        assert status['execution_surface'] == 'stdio_mcp' and not status['external_mcp_installation_verified']
        task = (await client.call_tool('relay_start', {'request_key': 'mcp_plugin_001', 'idea': '我想做卡牌游戏'})).structured_content
        context = (await client.call_tool('relay_context', {'task_id': task['task_id']})).structured_content
        assert 'report' in context['response_schema']['properties']
        reply = {'need_more_info': True, 'questions': ['希望采用哪种玩法？'], 'report': None}
        saved = (await client.call_tool('relay_submit', {'task_id': task['task_id'], 'reply': reply})).structured_content
        assert saved['ok'] and saved['output_markdown'].startswith('## 3.')
