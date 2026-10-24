export const LIMIT = 20;
export const PROGRESS_KEY = 'koukoulian_progress_v3';
export const CATALOG_KEY = 'koukoulian_catalog_v1';
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const safeId = s => typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(s) && !['__proto__', 'constructor', 'prototype'].includes(s);
const nonempty = s => typeof s === 'string' && s.trim().length > 0;
const int = n => Number.isSafeInteger(n) && n >= 0;
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function addDays(day, count) {
  const [y,m,d] = day.split('-').map(Number);
  return dateKey(new Date(y,m-1,d+count,12));
}
export function validDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s,0) === s;
}
export function safeURL(value, base = 'https://example.org/') {
  if (!nonempty(value)) return null;
  try { const u = new URL(value,base); return ['https:','http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function validateCourses(courses) {
  if (!Array.isArray(courses) || !courses.length) throw Error('课程数组为空');
  const ids = new Set(), questions = new Set();
  for (const c of courses) {
    if (!plain(c) || !safeId(c.id) || ids.has(c.id)) throw Error('课程 ID 无效或重复');
    ids.add(c.id);
    if (![c.name,c.explanation].every(nonempty) || !Array.isArray(c.sentences) || !c.sentences.length) throw Error('课程字段不完整');
    if (c.examples !== undefined && (!Array.isArray(c.examples) || !c.examples.every(nonempty))) throw Error('例句格式无效');
    if (c.commonMistakes !== undefined && typeof c.commonMistakes !== 'string') throw Error('常见错误格式无效');
    if (c.lessonUrl && !safeURL(c.lessonUrl)) throw Error('课程链接无效');
    for (const s of c.sentences) {
      if (!plain(s) || !safeId(s.id) || questions.has(s.id) || ![s.zh,s.en,s.wrong].every(nonempty)) throw Error('题目字段缺失或题目 ID 重复');
      questions.add(s.id);
    }
  }
  return courses;
}
export function validateManifest(m, base) {
  if (!plain(m) || m.schemaVersion !== 1 || !nonempty(m.version) || !validDate(m.updatedAt) || !Array.isArray(m.courses) || !m.courses.length) throw Error('课程清单格式无效');
  const ids = new Set();
  for (const c of m.courses) {
    if (!plain(c) || !safeId(c.id) || ids.has(c.id) || !nonempty(c.version) || !nonempty(c.name) || !safeURL(c.url,base) || !/^[a-f0-9]{64}$/.test(c.sha256)) throw Error('课程清单条目无效');
    const u = new URL(c.url,base);
    if (u.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(u.hostname)) throw Error('远程课程必须使用 HTTPS');
    ids.add(c.id);
  }
  return m;
}
export function validateCatalog(c, base = 'https://example.org/manifest.json') {
  validateManifest(c?.manifest,base); validateCourses(c.courses);
  if (c.courses.length !== c.manifest.courses.length || c.manifest.courses.some(e => !c.courses.some(x => x.id === e.id))) throw Error('课程与清单不一致');
  return c;
}
export function freshState() { return {schema:3,items:{},days:{},history:[],settings:{rate:0.85,repeat:1,mode:'speak'}}; }
export function validateProgress(raw) {
  const s = raw?.format === 'koukoulian-backup' ? raw.progress : raw;
  if (!plain(s) || !plain(s.items) || !plain(s.days) || ![2,3].includes(s.schema)) throw Error('不是有效的学习进度（支持 V2 / V3）');
  const out = freshState();
  for (const [id,m] of Object.entries(s.items)) {
    if (!safeId(id) || !plain(m) || ![m.correct,m.wrong,m.streak].every(int) || m.streak > 3 || m.streak > m.correct || typeof m.mastered !== 'boolean' || m.mastered !== (m.streak >= 3) || !validDate(m.due)) throw Error('题目进度格式无效');
    out.items[id] = {correct:m.correct,wrong:m.wrong,streak:m.streak,mastered:m.mastered,due:m.due};
  }
  for (const [day,r] of Object.entries(s.days)) {
    if (!validDate(day) || !plain(r) || !int(r.done) || !int(r.correct) || r.correct > r.done || (r.ids !== undefined && (!Array.isArray(r.ids) || !r.ids.every(safeId)))) throw Error('每日统计格式无效');
    out.days[day] = {done:r.done,correct:r.correct,ids:[...new Set(r.ids || [])]};
  }
  if (s.history !== undefined && !Array.isArray(s.history)) throw Error('练习历史格式无效');
  for (const h of s.history || []) {
    if (!plain(h) || !validDate(h.date) || !safeId(h.id) || typeof h.ok !== 'boolean') throw Error('练习历史记录无效');
    out.history.push({date:h.date,id:h.id,ok:h.ok});
    if (out.days[h.date] && !out.days[h.date].ids.includes(h.id)) out.days[h.date].ids.push(h.id);
  }
  // 旧版 session 保留当天已完成题目的排除信息。
  if (s.schema === 2 && s.session && validDate(s.session.date) && Array.isArray(s.session.queue) && int(s.session.index)) {
    const r = out.days[s.session.date];
    if (r) r.ids = [...new Set([...r.ids,...s.session.queue.slice(0,s.session.index).filter(safeId)])];
  }
  out.history = out.history.slice(-2000);
  if (s.settings) {
    if (typeof s.settings.rate !== 'number' || s.settings.rate < 0.5 || s.settings.rate > 1.25 || ![1,2,3,5].includes(s.settings.repeat) || !['speak','shadow'].includes(s.settings.mode)) throw Error('朗读设置无效');
    out.settings = {...s.settings};
  }
  return out;
}
export function allQuestions(courses) { return courses.flatMap(c => c.sentences.map(s => ({...s,courseId:c.id,courseName:c.name}))); }
export function courseProgress(state,course) {
  const records=course.sentences.map(s=>state.items[s.id]);
  return {total:course.sentences.length,practiced:records.filter(m=>m && m.correct+m.wrong>0).length,mastered:records.filter(m=>m?.mastered).length};
}
export function meta(state,id,day) { return state.items[id] || {correct:0,wrong:0,streak:0,mastered:false,due:day}; }
export function dayRecord(state,day) { return state.days[day] || {done:0,correct:0,ids:[]}; }
export function queueFor(state,courses,day) {
  const r = dayRecord(state,day);
  if (r.done >= LIMIT) return [];
  return allQuestions(courses).filter(s => {
    const m = meta(state,s.id,day); return !m.mastered && m.due <= day && !r.ids.includes(s.id);
  }).sort((a,b) => {
    const x = meta(state,a.id,day), y = meta(state,b.id,day);
    return Number(y.wrong > 0)-Number(x.wrong > 0) || x.due.localeCompare(y.due);
  }).slice(0,LIMIT-r.done);
}
export function grade(state,courses,id,ok,day) {
  if (typeof ok !== 'boolean' || !queueFor(state,courses,day).some(s => s.id === id)) throw Error('题目已完成或今日练习已结束');
  const next = JSON.parse(JSON.stringify(state)), m = {...meta(next,id,day)};
  m.correct += Number(ok); m.wrong += Number(!ok); m.streak = ok ? m.streak+1 : 0; m.mastered = m.streak >= 3;
  m.due = addDays(day,ok ? (m.mastered ? 36500 : [1,3][m.streak-1]) : 1);
  next.items[id] = m;
  const r = next.days[day] ||= {done:0,correct:0,ids:[]};
  r.done++; r.correct += Number(ok); r.ids.push(id);
  next.history.push({date:day,id,ok}); next.history = next.history.slice(-2000);
  return next;
}
export function streak(state,day) {
  let d = dayRecord(state,day).done > 0 ? day : addDays(day,-1), n = 0;
  while (dayRecord(state,d).done > 0) { n++; d = addDays(d,-1); }
  return n;
}
