"""Copy the bundled browser app; no model, service, credentials or network."""
from pathlib import Path
import argparse
import hashlib
import json

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
args = parser.parse_args()
source = Path(__file__).resolve().parent.parent / 'assets' / 'novel-archive.html'
destination = Path(args.output).expanduser().resolve()
data = source.read_bytes()
text = data.decode('utf-8')
if not text.startswith('<!doctype html>') or 'id="novel-archive-app"' not in text:
    raise SystemExit('invalid_browser_bundle')
if source.resolve() == destination:
    raise SystemExit('output_must_not_overwrite_skill_asset')
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_bytes(data)
print(json.dumps({'html_path': str(destination), 'sha256': hashlib.sha256(data).hexdigest(), 'execution': 'browser', 'preview_availability': 'host_dependent', 'external_ai_required': False}, ensure_ascii=False))
