"""Check web import packaging separately from desktop MCP capabilities."""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'plugins/language-relay-web'


def test_web_import_does_not_declare_desktop_mcp():
    manifest = json.loads((WEB / 'plugin.json').read_text())
    assert manifest['name'] == 'language-relay-web'
    assert manifest['version'] == '1.0.1'
    assert 'mcpServers' not in manifest and 'mcp' not in manifest
    assert 'apps' not in manifest['extensions']['com.openai']
    assert not (WEB / 'mcp.json').exists() and not (WEB / '.mcp.json').exists()
    assert not (WEB / '.app.json').exists()
    catalog = json.loads((ROOT / '.agents/plugins/marketplace.json').read_text())
    entry = next(p for p in catalog['plugins'] if p['name'] == 'language-relay-web')
    assert (ROOT / entry['source']['path']).resolve() == WEB.resolve()


def test_web_runtime_still_validates_full_flow(tmp_path):
    script = WEB / 'skills/language-relay/scripts/relay_tool.py'
    run = subprocess.run([sys.executable, str(script), '--workspace', str(tmp_path / 'state'), 'selfcheck'],
                         capture_output=True, text=True, timeout=15, check=False)
    assert run.returncode == 0, run.stdout + run.stderr
    report = json.loads(run.stdout)
    assert report['plugin_version'] == '1.0.1' and report['passed'] == report['total'] == 15
    assert not report['chatgpt_installation_verified'] and not report['network_requested']
    assert not (tmp_path / 'state').exists()
