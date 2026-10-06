#!/usr/bin/env python3
"""Deterministic source/release allowlist: excludes all local writing data and credentials."""
import json, hashlib, zipfile, argparse
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
TOP=['package.json','package-lock.json','tsconfig.json','plugin.json','mcp.json','.gitignore','README.md','THIRD-PARTY-NOTICES.md','START.cmd','INSTALL-GPT.cmd','START.command','INSTALL-GPT.command']
FOLDERS=['server','web/src','scripts','skills','docs','tests/fixtures']
TESTS=['tests/store.test.ts','tests/setup.test.mjs','tests/browser-flow.mjs','tests/app-bridge.mjs','tests/live-session.mjs']

def files():
    result=[ROOT/p for p in TOP+TESTS]
    for folder in FOLDERS:result.extend(p for p in (ROOT/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
    result.extend([ROOT/'dist/main.js',ROOT/'dist/editor.html'])
    result=sorted(set(result))
    for p in result:
        if not p.is_file():raise ValueError('Missing packaged file: '+str(p.relative_to(ROOT)))
        if any(part in ('node_modules','.data','local-data','test-results') for part in p.relative_to(ROOT).parts):raise ValueError('Private path rejected')
        if p.name in ('state.json','state.previous.json','connect.json','桌面MCP备用配置.json'):raise ValueError('Runtime file rejected')
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--manifest',required=True);a=p.parse_args()
    output=Path(a.output);output.parent.mkdir(parents=True,exist_ok=True);listing=[]
    with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for f in files():
            body=f.read_bytes();rel=f.relative_to(ROOT).as_posix();info=zipfile.ZipInfo('author-writing/'+rel,(2026,10,7,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(0o100755 if rel.endswith('.command') else 0o100644)<<16;z.writestr(info,body)
            listing.append({'path':'writing-assistant/'+rel,'local':str(f),'sha256':hashlib.sha256(body).hexdigest(),'bytes':len(body)})
    metadata={'version':'0.1.0','files':listing,'archive':{'path':'writing-assistant/releases/author-writing-0.1.0.zip','local':str(output),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()},'privateRuntimeIncluded':False}
    Path(a.manifest).write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'ok':True,'files':len(listing),'archiveBytes':metadata['archive']['bytes'],'archiveSha256':metadata['archive']['sha256'],'privateRuntimeIncluded':False}))
if __name__=='__main__':main()
