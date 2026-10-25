"""Copy the tested CardStudio source to its existing Sites checkout.

The hosted checkout has CardStudio at its root; shared modules sit in /shared.
Runtime stores, Site identity, credentials and unrelated source are retained.
"""
from pathlib import Path
import subprocess,sys,shutil

root=Path(__file__).resolve().parents[1]
target=Path(sys.argv[1]).resolve()
assert (target/'.openai/hosting.json').is_file(),'Open the existing Site checkout first'
paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','cardstudio','shared'],cwd=root).decode().split('\0')
count=0
for relative in dict.fromkeys(paths):
 if not relative:continue
 source=root/relative
 if not source.is_file():continue
 dest=target/(relative[len('cardstudio/'):] if relative.startswith('cardstudio/') else relative)
 if relative.endswith('CardStudio-Local.html'):continue
 dest.parent.mkdir(parents=True,exist_ok=True)
 data=source.read_bytes()
 if source.suffix in ['.mjs','.js','.ts','.tsx','.py']:
  data=data.decode().replace('../../shared/','../shared/').replace('../cardstudio/','../').encode()
 dest.write_bytes(data);shutil.copymode(source,dest);count+=1
print(f'Synced {count} source files; Site identity and runtime data retained.')
