from pathlib import Path
import hashlib,json,subprocess,sys,zipfile

root=Path(__file__).resolve().parents[1]
version=json.loads((root/'VERSION.json').read_text())['版本']
files=[p for p in subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0') if p]
entries=[]
for name in sorted(set(files)-{'MANIFEST.json','MD5SUMS.txt'}):
    path=root/name;data=path.read_bytes()
    entries.append({'path':name,'bytes':len(data),'md5':hashlib.md5(data).hexdigest(),'sha256':hashlib.sha256(data).hexdigest(),'gitMode':'100755' if path.stat().st_mode&0o111 else '100644'})
manifest={'版本':version,'文件数':len(entries),'说明':'不包含 MANIFEST.json 和 MD5SUMS.txt 自身；MD5SUMS.txt 另外包含清单校验值。','files':entries}
(root/'MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
md5=[f"{e['md5']}  {e['path']}" for e in entries]
md5.append(hashlib.md5((root/'MANIFEST.json').read_bytes()).hexdigest()+'  MANIFEST.json')
(root/'MD5SUMS.txt').write_text('\n'.join(md5)+'\n')
out=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else root.parent/f'deliverables/Kadi-Chekaji-{version}.zip'
out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for name in sorted(set(files)|{'MANIFEST.json','MD5SUMS.txt'}):
        path=root/name;info=zipfile.ZipInfo(f'卡递与车卡机-{version}/'+name,date_time=(2026,10,24,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=path.stat().st_mode<<16
        archive.writestr(info,path.read_bytes())
with zipfile.ZipFile(out) as archive:
    assert archive.testzip() is None
    for e in entries:assert hashlib.sha256(archive.read(f'卡递与车卡机-{version}/'+e['path'])).hexdigest()==e['sha256']
print(json.dumps({'path':str(out),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'files':len(files)},ensure_ascii=False))
