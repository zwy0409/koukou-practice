import {validateManifest,validateCatalog,validateCourses,CATALOG_KEY} from './core.js';
export const MANIFEST_URL = new URL('../manifest.json',import.meta.url).href;
export async function fetchFresh(url,fetcher = fetch) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(),12000);
  try {
    const r = await fetcher(url,{cache:'no-store',signal:controller.signal});
    if (!r.ok) throw Error(`下载失败（HTTP ${r.status}）`);
    const text = await r.text();
    if (text.length > 4_000_000) throw Error('课程文件过大');
    return text;
  } finally { clearTimeout(timer); }
}
export async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2,'0')).join('');
}
// 一次更新只有一次持久化提交；任何下载、校验、配额错误都不修改旧目录。
export async function updateCatalog(current,{storage = localStorage,fetcher = fetch,manifestURL = MANIFEST_URL} = {}) {
  const manifest = validateManifest(JSON.parse(await fetchFresh(manifestURL,fetcher)),manifestURL);
  const courses = [], downloads = [];
  for (const entry of manifest.courses) {
    const old = current?.manifest.courses.find(c => c.id === entry.id);
    if (old?.version === entry.version && old.sha256 === entry.sha256) {
      courses.push(current.courses.find(c => c.id === entry.id)); continue;
    }
    const text = await fetchFresh(new URL(entry.url,manifestURL).href,fetcher);
    if (await sha256(text) !== entry.sha256) throw Error(`课程 ${entry.id} 完整性校验失败`);
    const pack = JSON.parse(text);
    if (pack.schemaVersion !== 1 || pack.version !== entry.version || pack.course?.id !== entry.id) throw Error('课程版本或 ID 与清单不匹配');
    validateCourses([pack.course]); courses.push(pack.course);
    downloads.push({url:new URL(entry.url,manifestURL).href,text});
  }
  const next = validateCatalog({manifest,courses,checkedAt:new Date().toISOString()},manifestURL);
  storage.setItem(CATALOG_KEY,JSON.stringify(next));
  // CacheStorage 是离线文件副本，localStorage 中完整目录是唯一生效指针。
  // 缓存配额错误不回滚已成功保存的课程，也不会影响学习进度。
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open('koukoulian-courses-v1');
      for (const file of downloads) await cache.put(file.url,new Response(file.text,{headers:{'Content-Type':'application/json'}}));
    } catch { /* 完整课程仍已在 localStorage 中，可离线练习。 */ }
  }
  return next;
}
