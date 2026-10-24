import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {freshState,validateProgress,validateCourses,validateCatalog,dateKey,addDays,queueFor,grade,streak,CATALOG_KEY,PROGRESS_KEY} from '../public/js/core.js';
import {updateCatalog,sha256} from '../public/js/catalog.js';
const fixture=JSON.parse(await readFile(new URL('../public/courses/builtin-v2.json',import.meta.url)));
const courses=fixture.courses, day='2026-10-24', id=courses[0].sentences[0].id;
const clone=o=>JSON.parse(JSON.stringify(o));
test('原始题库保留 10 课 100 个稳定 ID',()=> {
  validateCatalog(fixture); assert.equal(courses.length,10); assert.equal(courses.flatMap(c=>c.sentences).length,100); assert.equal(id,'dont-01');
});
test('每日上限 20，刷新、不同课程或重复计分均不能突破',()=> {
  let s=freshState();
  for(let i=0;i<20;i++) s=grade(s,courses,queueFor(s,courses,day)[0].id,i%2===0,day);
  s=validateProgress(JSON.parse(JSON.stringify(s)));
  assert.equal(s.days[day].done,20); assert.equal(s.days[day].correct,10); assert.equal(queueFor(s,courses,day).length,0);
  assert.throws(()=>grade(s,courses,id,true,day));
  assert.equal(queueFor(s,courses,addDays(day,1)).length,20);
});
test('错题次日优先，不在当天重复',()=> {
  const s=grade(freshState(),courses,courses[1].sentences[0].id,false,day);
  assert.equal(s.items['not-01'].due,addDays(day,1));
  assert(!queueFor(s,courses,day).some(q=>q.id==='not-01'));
  assert.equal(queueFor(s,courses,addDays(day,1))[0].id,'not-01');
});
test('连续答对间隔 1 天、3 天，第三次掌握',()=> {
  let s=grade(freshState(),courses,id,true,day);
  assert.equal(s.items[id].due,'2026-10-25');
  s=grade(s,courses,id,true,'2026-10-25'); assert.equal(s.items[id].due,'2026-10-28');
  assert(!queueFor(s,courses,'2026-10-26').some(q=>q.id===id));
  s=grade(s,courses,id,true,'2026-10-28'); assert(s.items[id].mastered);
  assert(!queueFor(s,courses,'2099-01-01').some(q=>q.id===id)); validateProgress(s);
});
test('答错会重置连续正确次数并安排次日',()=> {
  let s=grade(freshState(),courses,id,true,day); s=grade(s,courses,id,false,'2026-10-25');
  assert.equal(s.items[id].streak,0); assert.equal(s.items[id].due,'2026-10-26');
});
test('跨月、跨年及夏令时使用本地日历加天',()=> {
  assert.equal(addDays('2026-12-31',1),'2027-01-01'); assert.equal(addDays('2024-02-28',1),'2024-02-29'); assert.equal(addDays('2026-03-08',1),'2026-03-09');
  assert.equal(dateKey(new Date(2026,9,24,23,59)),'2026-10-24');
});
test('今日未练习也保留截至昨天的连续天数',()=> {
  const s=freshState(); s.days['2026-10-23']={done:2,correct:1,ids:[]}; s.days['2026-10-22']={done:1,correct:1,ids:[]};
  assert.equal(streak(s,day),2); assert.equal(streak(s,'2026-10-25'),0);
});
test('V2 备份迁移保留掌握、统计和当天排重信息',()=> {
  const s=grade(freshState(),courses,id,false,day); s.schema=2; delete s.settings; delete s.days[day].ids;
  s.session={date:day,queue:[id],index:1};
  const next=validateProgress(s); assert.equal(next.schema,3); assert.deepEqual(next.items,s.items); assert.deepEqual(next.days[day].ids,[id]);
});
test('导入验证保留暂时下架题目的进度',()=> {
  const s=grade(freshState(),courses,id,true,day); s.items['retired-01']={...s.items[id]};
  assert.equal(validateProgress({format:'koukoulian-backup',progress:s}).items['retired-01'].correct,1);
});
test('无效备份不被接受：负数、错误日期、原型键、错误字段',()=> {
  for(const change of [s=>s.days[day]={done:-1,correct:0},s=>s.days['2026-02-30']={done:1,correct:0},s=>s.items.constructor={},s=>s.history=[{id,date:day,ok:'yes'}]]) {
    const s=freshState(); change(s); assert.throws(()=>validateProgress(s));
  }
});
test('题目 ID 全局唯一，拒绝脚本链接',()=> {
  const bad=clone(courses); bad[1].sentences[0].id=id; assert.throws(()=>validateCourses(bad));
  const link=clone(courses); link[0].lessonUrl='javascript:alert(1)'; assert.throws(()=>validateCourses(link));
});
function storageMock() {
  const map=new Map([[CATALOG_KEY,JSON.stringify(fixture)],[PROGRESS_KEY,'progress must survive']]);
  return {map,setItem:(k,v)=>map.set(k,v),getItem:k=>map.get(k)};
}
async function release() {
  const next=clone(fixture.manifest); next.version='2.1.0'; next.updatedAt='2026-10-25';
  const course=clone(courses[0]); course.sentences.push({id:'dont-11',zh:'我不喝咖啡。',en:"I don't drink coffee.",wrong:"I'm not drink coffee."});
  const text=JSON.stringify({schemaVersion:1,version:'2.1.0',course});
  next.courses[0]={...next.courses[0],version:'2.1.0',url:'courses/dont.2.1.0.json',sha256:await sha256(text)};
  const files={'https://example.org/manifest.json':JSON.stringify(next),'https://example.org/courses/dont.2.1.0.json':text};
  return {next,files,fetcher:async (url,options)=>{assert.equal(options.cache,'no-store'); return new Response(files[url]||'',{status:files[url]?200:404});}};
}
test('更新提交新增课程并保留原题 ID，不触碰进度键',async()=> {
  const r=await release(), storage=storageMock();
  const updated=await updateCatalog(fixture,{storage,fetcher:r.fetcher,manifestURL:'https://example.org/manifest.json'});
  assert.equal(updated.courses[0].sentences.length,11); assert.equal(updated.courses[0].sentences[0].id,id);
  assert.equal(storage.getItem(PROGRESS_KEY),'progress must survive');
  assert.equal(JSON.parse(storage.getItem(CATALOG_KEY)).manifest.version,'2.1.0');
});
test('清单离线失败，保留原课程和进度',async()=> {
  const storage=storageMock(), before=storage.getItem(CATALOG_KEY);
  await assert.rejects(updateCatalog(fixture,{storage,fetcher:async()=>{throw Error('offline');}}));
  assert.equal(storage.getItem(CATALOG_KEY),before); assert.equal(storage.getItem(PROGRESS_KEY),'progress must survive');
});
test('课程下载 404 不提交新清单',async()=> {
  const r=await release(),storage=storageMock(),before=storage.getItem(CATALOG_KEY);
  await assert.rejects(updateCatalog(fixture,{storage,manifestURL:'https://example.org/manifest.json',fetcher:async url=>url.endsWith('manifest.json')?new Response(JSON.stringify(r.next)):new Response('',{status:404})}));
  assert.equal(storage.getItem(CATALOG_KEY),before);
});
test('课程损坏或 SHA 不匹配不提交',async()=> {
  const r=await release(),storage=storageMock(),before=storage.getItem(CATALOG_KEY);
  r.files['https://example.org/courses/dont.2.1.0.json']='{"broken":true}';
  await assert.rejects(updateCatalog(fixture,{storage,fetcher:r.fetcher,manifestURL:'https://example.org/manifest.json'}),/校验失败/);
  assert.equal(storage.getItem(CATALOG_KEY),before);
});
test('整批更新最后一课失败时，前面成功下载的课也不生效',async()=> {
  const r=await release(),storage=storageMock(),before=storage.getItem(CATALOG_KEY);
  r.next.courses[1].version='2.1.0'; r.files['https://example.org/manifest.json']=JSON.stringify(r.next);
  await assert.rejects(updateCatalog(fixture,{storage,fetcher:r.fetcher,manifestURL:'https://example.org/manifest.json'}));
  assert.equal(storage.getItem(CATALOG_KEY),before); assert.equal(fixture.courses[0].sentences.length,10);
});
test('本地配额错误不改变原课程',async()=> {
  const r=await release(),storage=storageMock(),before=storage.getItem(CATALOG_KEY); storage.setItem=()=>{throw Error('QuotaExceededError');};
  await assert.rejects(updateCatalog(fixture,{storage,fetcher:r.fetcher,manifestURL:'https://example.org/manifest.json'}));
  assert.equal(storage.getItem(CATALOG_KEY),before);
});
test('无变化时只获取清单，不重新下载所有课程',async()=> {
  let count=0;const storage=storageMock();
  await updateCatalog(fixture,{storage,manifestURL:'https://example.org/manifest.json',fetcher:async()=>{count++;return new Response(JSON.stringify(fixture.manifest));}});
  assert.equal(count,1);
});
test('重复 ID / 版本错配，即使 SHA 正确也拒绝更新',async()=> {
  const r=await release(),storage=storageMock();
  const text=JSON.stringify({schemaVersion:1,version:'wrong',course:courses[0]}); r.next.courses[0].sha256=await sha256(text);
  r.files['https://example.org/courses/dont.2.1.0.json']=text; r.files['https://example.org/manifest.json']=JSON.stringify(r.next);
  await assert.rejects(updateCatalog(fixture,{storage,fetcher:r.fetcher,manifestURL:'https://example.org/manifest.json'}),/不匹配/);
});
