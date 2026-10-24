import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateManifest,validateCatalog,validateCourses} from '../public/js/core.js';
const manifest=validateManifest(JSON.parse(await readFile('public/manifest.json','utf8')),'https://example.org/manifest.json');
const courses=[];
for(const entry of manifest.courses) {
  if(!/^courses\/[a-zA-Z0-9_.-]+\.json$/.test(entry.url)) throw Error('发布文件必须是 courses/ 下的本地 JSON');
  const bytes=await readFile(`public/${entry.url}`);
  if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256) throw Error(`${entry.id} SHA-256 不匹配`);
  const pack=JSON.parse(bytes.toString());
  if(pack.schemaVersion!==1 || pack.version!==entry.version || pack.course?.id!==entry.id) throw Error(`${entry.id} ID 或版本不匹配`);
  validateCourses([pack.course]); courses.push(pack.course);
}
validateCatalog({manifest,courses});
validateCatalog(JSON.parse(await readFile('public/courses/builtin-v2.json','utf8')));
const app=JSON.parse(await readFile('public/app.webmanifest','utf8'));
for(const icon of app.icons) await readFile(`public/${icon.src.replace('./','')}`);
console.log(`题库校验通过：${courses.length} 课 / ${courses.reduce((n,c)=>n+c.sentences.length,0)} 句，文件摘要和稳定 ID 均有效。`);
