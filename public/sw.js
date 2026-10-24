/* 程序文件有任何改动，都要递增此版本。课程更新无需改这里。 */
const APP_VERSION = '3.0.3';
const SHELL = `koukoulian-shell-${APP_VERSION}`;
const COURSES = 'koukoulian-courses-v1';
const ASSETS = [
  './','./styles.css','./js/app.js','./js/core.js','./js/catalog.js','./js/speech.js',
  './app.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png',
  './courses/builtin-v2.json'
];
const base = new URL('./',self.location.href);
self.addEventListener('install',event => {
  // 有一个资源失败就不安装，旧程序和旧缓存继续工作。
  // Pages redirects /index.html to /. A redirected cached response cannot serve
  // a navigation request: cache only canonical URLs and fail installation on redirects.
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(ASSETS.map(p => new Request(new URL(p,base),{cache:'reload',redirect:'error'})))));
  // 不自动 skipWaiting，等待用户完成当前练习后选择重新加载。
});
self.addEventListener('message',event => {
  if(event.data?.type==='SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate',event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('koukoulian-shell-') && n !== SHELL).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event => {
  const request = event.request, url = new URL(request.url);
  if(request.method !== 'GET' || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  // 更新检查必须看到网络结果。断网抛错，由应用保留已验证的本地课程。
  if(request.cache === 'no-store' || url.pathname === new URL('manifest.json',base).pathname) return;
  if(request.mode === 'navigate') {
    event.respondWith(caches.open(SHELL).then(async cache => (await cache.match(new URL('./',base))) || fetch(request)));
    return;
  }
  const shellURL = ASSETS.map(p => new URL(p,base).href).includes(url.href);
  if(shellURL) {
    event.respondWith(caches.open(SHELL).then(async cache => (await cache.match(request)) || fetch(request)));
    return;
  }
  // 课程缓存由应用在 SHA-256 和结构校验通过后写入；SW 只读取已验证版本。
  if(url.pathname.startsWith(new URL('courses/',base).pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(COURSES);
      const saved = await cache.match(request);
      return saved || fetch(request);
    })());
  }
});
