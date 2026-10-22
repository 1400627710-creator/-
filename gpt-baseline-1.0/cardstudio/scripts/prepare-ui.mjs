import {readFileSync,writeFileSync} from 'node:fs';
const css=readFileSync('ui/style.css','utf8'),js=readFileSync('.ui-build/workbench.js','utf8').replaceAll('</script','<\\/script');
const html=readFileSync('ui/index.html','utf8').replace('/*CSS*/',css).replace('/*APP*/',()=>js);
writeFileSync('lib/workbench-html.mjs','export const WORKBENCH_HTML='+JSON.stringify(html)+';\nexport const WORKBENCH_WEB_HTML=WORKBENCH_HTML.replace(\'name="cardstudio-surface" content="mcp"\',\'name="cardstudio-surface" content="web"\');\n');
console.log('Self-contained workbench HTML:',Buffer.byteLength(html),'bytes');
