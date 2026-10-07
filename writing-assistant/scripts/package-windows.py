#!/usr/bin/env python3
"""Package only the prepared app, with portable ZIP paths; validate the actual archive."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

REQUIRED = {'author-writing/START.cmd', 'author-writing/scripts/windows-launch.ps1',
            'author-writing/scripts/launcher.mjs', 'author-writing/dist/main.js',
            'author-writing/dist/editor.html', 'author-writing/package-lock.json',
            'author-writing/runtime/node.exe', 'author-writing/runtime/NODE-LICENSE.txt',
            'author-writing/node_modules/zod/package.json'}

def verify(archive):
    with zipfile.ZipFile(archive) as z:
        names = z.namelist()
        if len(names) != len(set(names)): raise ValueError('Duplicate ZIP entries')
        for name in names:
            if '\\' in name or not name.startswith('author-writing/') or '..' in name.split('/') or ':' in name:
                raise ValueError('Nonportable or unsafe ZIP entry: ' + name)
        if REQUIRED - set(names): raise ValueError('Incomplete Windows ZIP: ' + str(sorted(REQUIRED - set(names))))
        bad = z.testzip()
        if bad: raise ValueError('ZIP CRC failed: ' + bad)
    return len(names)

def package(app, output):
    output = output.resolve(); app = app.resolve()
    if output.is_relative_to(app): raise ValueError('Output must be outside the staged app')
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for file in sorted(app.rglob('*')):
            if file.is_symlink(): raise ValueError('Symlink not allowed in prepared Windows app')
            if not file.is_file(): continue
            relative = file.relative_to(app)
            if any(part in ('.data', 'local-data', 'test-results', '__pycache__') for part in relative.parts):
                raise ValueError('Runtime/private directory in staged app')
            if relative.name in ('state.json', 'state.previous.json', 'connect.json', '桌面MCP备用配置.json'):
                raise ValueError('Private runtime file in staged app')
            z.write(file, 'author-writing/' + relative.as_posix())
    entries = verify(output)
    with output.open('rb') as stream: digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    Path(str(output) + '.sha256').write_text(digest + '  ' + output.name + '\n', encoding='ascii')
    return entries, digest

def main():
    p = argparse.ArgumentParser(); p.add_argument('--app'); p.add_argument('--output', required=True); p.add_argument('--verify', action='store_true'); a = p.parse_args()
    if a.verify: print(json.dumps({'ok': True, 'entries': verify(Path(a.output)), 'portableZipPaths': True})); return
    if not a.app: p.error('--app is required when creating a package')
    entries, digest = package(Path(a.app), Path(a.output))
    print(json.dumps({'ok': True, 'entries': entries, 'sha256': digest, 'portableZipPaths': True}))

if __name__ == '__main__': main()
