import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(cache) {
  const events=new Map(),network=[];
  runInNewContext(source,{
    URL,Request,
    self:{location:{href:'https://example.org/sw.js'},addEventListener:(name,handler)=>events.set(name,handler)},
    caches:{open:async()=>cache},fetch:async request=>{network.push(request);return 'network-response';}
  });
  return {events,network};
}
test('预缓存使用规范根地址，拒绝缓存重定向后的 HTML',async()=>{
  let requests;
  const {events}=worker({addAll:async values=>{requests=values;}});
  let installed;events.get('install')({waitUntil:value=>{installed=value;}});await installed;
  assert(requests.some(r=>r.url==='https://example.org/'));
  assert(!requests.some(r=>r.url.endsWith('/index.html')));
  assert(requests.every(r=>r.redirect==='error'));
});
test('离线导航读取根地址缓存，避免 Pages 的 index.html 重定向响应',async()=>{
  const matched=[];
  const {events,network}=worker({match:async key=>{matched.push(String(key));return String(key)==='https://example.org/'?'cached-root':null;}});
  let response;
  events.get('fetch')({request:{url:'https://example.org/',method:'GET',mode:'navigate'},respondWith:value=>{response=value;}});
  assert.equal(await response,'cached-root');assert.deepEqual(matched,['https://example.org/']);assert.equal(network.length,0);
});
test('导航缓存缺失时使用网络，课程更新请求绕过 SW',async()=>{
  const {events,network}=worker({match:async()=>undefined});
  let response;const handler=events.get('fetch');
  handler({request:{url:'https://example.org/',method:'GET',mode:'navigate'},respondWith:value=>{response=value;}});
  assert.equal(await response,'network-response');assert.equal(network.length,1);
  for(const request of [{url:'https://example.org/manifest.json'},{url:'https://example.org/courses/new.json',cache:'no-store'}]) {
    handler({request:{method:'GET',...request},respondWith:()=>assert.fail('更新检查必须直连网络')});
  }
});
