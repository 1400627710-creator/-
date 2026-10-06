import { build } from 'esbuild';
import fs from 'node:fs/promises';
await fs.mkdir('dist',{recursive:true});
await build({entryPoints:['server/main.ts'],outfile:'dist/main.js',bundle:true,platform:'node',format:'esm',target:'node22',packages:'external',sourcemap:false});
const result=await build({entryPoints:['web/src/main.tsx'],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',minify:true,define:{'process.env.NODE_ENV':'"production"'},legalComments:'none'});
const js=result.outputFiles.find(f=>f.path.endsWith('.js'))?.text||result.outputFiles[0].text;
const css=await fs.readFile('web/src/style.css','utf8');
await fs.writeFile('dist/editor.html','<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小说码字助手</title><style>'+css+'</style></head><body><div id="root"></div><!--LOCAL_BOOT--><script>'+js.replace(/<\/script/gi,'<\\/script')+'</script></body></html>');
console.log('构建完成：本机服务与单文件编辑窗口。');
