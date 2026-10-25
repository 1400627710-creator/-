import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {Script} from 'node:vm';
const bundle=readFileSync('.local-build/local.js','utf8');
new Script(bundle,{filename:'cardstudio-local-bundle.js'});
// Base64 keeps HTML and preview injectors from interpreting strings inside JS.
// A regular inline script element executes the decoded source, without eval.
const bootstrap=`(()=>{const bytes=Uint8Array.from(atob('${Buffer.from(bundle).toString('base64')}'),c=>c.charCodeAt(0));const script=document.createElement('script');script.textContent=new TextDecoder().decode(bytes);document.head.append(script)})();`;
new Script(bootstrap,{filename:'cardstudio-local-bootstrap.js'});
const html=readFileSync('local/index.html','utf8').replace('/*CSS*/',readFileSync('ui/style.css','utf8')+'\n'+readFileSync('local/style.css','utf8')+'\n'+readFileSync('local/assistant.css','utf8')).replace('/*APP*/',()=>bootstrap);
mkdirSync('local/dist',{recursive:true});
writeFileSync('local/dist/CardStudio-Local.html',html);
console.log('Standalone local HTML:',Buffer.byteLength(html),'bytes');
