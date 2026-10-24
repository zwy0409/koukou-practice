import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';

const args=process.argv.slice(2);
const value=(flag,fallback)=>args.includes(flag)?args[args.indexOf(flag)+1]:fallback;
const root=resolve(value('--dir','public'));
const port=Number(value('--port','4173'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
// Match Pages' static response headers during local browser checks.
const rules=[];
let rule;
for(const line of (await readFile(resolve(root,'_headers'),'utf8')).split(/\r?\n/)) {
  if(line.startsWith('/')) { rule={pattern:line.trim(),headers:{}};rules.push(rule); }
  else if(rule && /^\s+[^:]+:/.test(line)) {
    const colon=line.indexOf(':');rule.headers[line.slice(0,colon).trim()]=line.slice(colon+1).trim();
  }
}
const server=createServer(async(req,res)=>{
  try {
    if(!['GET','HEAD'].includes(req.method)) {res.writeHead(405).end();return;}
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname.split('/').some(p=>p.startsWith('.')) || pathname==='/_headers') {res.writeHead(404).end();return;}
    let file=resolve(root,'.'+pathname);
    if(file!==root && !file.startsWith(root+sep)) {res.writeHead(403).end();return;}
    if((await stat(file)).isDirectory()) file=resolve(file,'index.html');
    const bytes=await readFile(file);
    const headers={'Content-Type':types[extname(file)]||'application/octet-stream'};
    for(const item of rules) {
      if(item.pattern===pathname || (item.pattern.endsWith('*') && pathname.startsWith(item.pattern.slice(0,-1)))) Object.assign(headers,item.headers);
    }
    res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:bytes);
  } catch {res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Serving ${root} at http://localhost:${port}`));
