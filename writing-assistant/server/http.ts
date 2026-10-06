import fs from 'node:fs';
import http from 'node:http';
import { Service, errorInfo } from './service.js';

export async function localServer(service:Service,htmlPath:string,port=0) {
  const server=http.createServer(async(req,res)=>{
    const address=server.address();const boundPort=typeof address==='object'&&address?address.port:port;
    const hosts=[`127.0.0.1:${boundPort}`,`localhost:${boundPort}`];
    if(!hosts.includes(req.headers.host||'') || req.headers.origin&&!hosts.some(h=>req.headers.origin===`http://${h}`)) {res.writeHead(403);res.end('Forbidden');return;}
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    if(req.method==='GET'&&req.url==='/') {
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; font-src 'self'; base-uri 'none'; frame-ancestors 'none'");
      const html=fs.readFileSync(htmlPath,'utf8').replace('<!--LOCAL_BOOT-->','<script>window.__WRITER_LOCAL__='+JSON.stringify({clientKey:service.clientKey}).replace(/</g,'\\u003c')+';</script>');res.end(html);return;
    }
    if(req.method==='POST'&&req.url==='/ui') {
      if(!req.headers['content-type']?.startsWith('application/json')){res.writeHead(415);res.end();return;}
      try {
        service.authorize(String(req.headers['x-writer-client']||''));
        let size=0;const chunks:Buffer[]=[];
        for await(const chunk of req){size+=chunk.length;if(size>30_000_000){res.writeHead(413);res.end();req.destroy();return;}chunks.push(Buffer.from(chunk));}
        const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const output=service.ui(input.action,input.args,service.clientKey);
        res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(output));
      } catch(e){res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:errorInfo(e)}));}
      return;
    }
    res.writeHead(404);res.end('Not found');
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const address=server.address();service.localUrl=`http://127.0.0.1:${typeof address==='object'&&address?address.port:port}/`;
  return server;
}
