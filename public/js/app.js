import {LIMIT,PROGRESS_KEY,CATALOG_KEY,dateKey,addDays,freshState,validateProgress,validateCatalog,allQuestions,meta,dayRecord,queueFor,grade,streak,safeURL} from './core.js';
import {updateCatalog,MANIFEST_URL} from './catalog.js';
import {chooseEnglishVoice} from './speech.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const href = s => esc(safeURL(s) || '#');
let state = freshState(), catalog = null, revealed = null, lessonId = null;
let updating = false, updateMessage = '启动时自动检查，也可以手动检查。', storageBlocked = false;
let registration, installPrompt, speechToken = 0, toastTimer, lastDay = dateKey();
let practiceId = null;
const tab = () => ['practice','courses','progress','resources','settings','updates'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'practice';
const questions = () => allQuestions(catalog.courses);
const record = () => dayRecord(state,dateKey());
function toast(text) { $('#toast').textContent = text; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').textContent = '',5000); }
function storageError(text) { storageBlocked = true; $('#storage-error').hidden = false; $('#storage-error').textContent = text; }
function readProgress() {
  const raw = localStorage.getItem(PROGRESS_KEY) || localStorage.getItem('koukoulian_progress_v2');
  return raw ? validateProgress(JSON.parse(raw)) : freshState();
}
function persist(next) {
  localStorage.setItem(PROGRESS_KEY,JSON.stringify(next));
  state = next; storageBlocked = false; $('#storage-error').hidden = true;
}
async function mutate(fn) {
  const run = () => {
    // 每次写入前读取最新记录，避免同一网址多个标签互相覆盖。
    if (storageBlocked) throw Error('本地记录需要先恢复，当前操作未保存');
    const latest = readProgress(); persist(fn(latest));
  };
  try {
    if (navigator.locks) await navigator.locks.request('koukoulian-progress',run); else run();
    return true;
  } catch (e) { toast(`未保存：${e.message}。请先导出备份。`); return false; }
}
function speechStatus(text) { const el=$('#speech-status'); if(el) {el.textContent=text;el.hidden=!text;} }
function stopSpeech() { speechToken++; speechStatus(''); if ('speechSynthesis' in window) speechSynthesis.cancel(); }
function speak(text) {
  stopSpeech();
  if (!('speechSynthesis' in window)) return toast('此浏览器不支持朗读，请使用 Chrome 或三星浏览器。');
  const token = speechToken, {rate,repeat} = state.settings;
  let count = 0;
  const play = () => {
    if (token !== speechToken || count++ >= repeat || document.hidden) return;
    const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = rate;
    const voices = speechSynthesis.getVoices();
    const voice = chooseEnglishVoice(voices,!navigator.onLine);
    if(!navigator.onLine && !voice) {speechStatus('离线英语朗读需要本地英语语音包，请先在系统文字转语音设置中安装。');return;}
    if (voice) u.voice = voice;
    const engine=voice?.localService?'本地英语语音':voice?'在线英语语音':'系统英语语音';
    speechStatus('正在准备英语朗读…');
    u.onstart = () => {if(token===speechToken) speechStatus(`正在朗读 ${count} / ${repeat} · ${engine}`);};
    u.onend = () => {
      if(token!==speechToken) return;
      if(count<repeat) {speechStatus(`跟读间隔 · 已播放 ${count} / ${repeat}`);setTimeout(play,850);}
      else speechStatus(`朗读完成 · ${count} / ${repeat} · ${engine}`);
    };
    u.onerror = e => { if (token===speechToken && !['interrupted','canceled'].includes(e.error)) {speechStatus('朗读失败，请检查系统英语语音包。');toast('朗读暂不可用，请检查系统英语语音包；离线朗读需要本地语音。');} };
    speechSynthesis.speak(u);
  };
  play();
}
function settingsControls() {
  return `<div class="settings-row"><label for="rate">朗读速度</label><select id="rate">${[0.5,0.65,0.85,1,1.25].map(n => `<option value="${n}" ${state.settings.rate===n?'selected':''}>${n}×${n===0.85?' · 推荐':''}</option>`).join('')}</select></div><div class="settings-row"><label for="repeat">连续播放</label><select id="repeat">${[1,2,3,5].map(n => `<option value="${n}" ${state.settings.repeat===n?'selected':''}>${n} 次</option>`).join('')}</select></div>`;
}
function bindSettings() {
  for (const key of ['rate','repeat']) {
    const el = $(`#${key}`);
    if (el) el.onchange = async () => { stopSpeech(); const value = Number(el.value); await mutate(s => ({...s,settings:{...s.settings,[key]:value}})); render(); };
  }
}
function practice() {
  const day = dateKey(), r = record(), queue = queueFor(state,catalog.courses,day);
  const s = queue.find(x => x.id === practiceId) || queue[0]; practiceId = s?.id || null;
  const intro = `<section class="intro row"><div><p class="eyebrow">DAILY PRACTICE</p><h1>今天，也开口说。</h1><p class="hint">不求完美，先把一句话说完整。</p></div><div class="day-count"><b>${r.done}</b> / ${LIMIT}<br><span class="hint">今日完成</span></div></section>`;
  if (!s) return intro + `<section class="card empty"><div class="empty-symbol">✓</div><h2>${r.done >= LIMIT?'今天的练习完成了':'今天的到期题练完了'}</h2><p class="muted">完成 ${r.done} 题，答对 ${r.correct} 题。<br>明天再来，让表达更自然。</p><a class="btn primary" href="#progress">查看学习进度 →</a></section><div class="notice">答错的题明天复习；连续答对 3 次后，退出日常循环。课程讲解和朗读随时可以查看。</div>`;
  const m = meta(state,s.id,day), shown = revealed === s.id;
  return intro + `<div class="mode-switch" aria-label="练习模式"><button data-mode="speak" class="${state.settings.mode==='speak'?'active':''}" aria-pressed="${state.settings.mode==='speak'}">句型反应</button><button data-mode="shadow" class="${state.settings.mode==='shadow'?'active':''}" aria-pressed="${state.settings.mode==='shadow'}">听力跟读</button></div><section class="card practice-card"><div class="row practice-label"><span>${esc(s.courseName)}</span><span class="tag">${m.wrong?'错题复习':m.correct?'间隔复习':'新句子'}</span></div><div class="track" role="progressbar" aria-label="今日完成" aria-valuenow="${r.done}" aria-valuemin="0" aria-valuemax="20"><span style="width:${r.done/LIMIT*100}%"></span></div><div class="prompt"><small>看中文，先自己说英文</small>${esc(s.zh)}</div>${shown ? `<div class="answer"><p class="answer-en" lang="en">${esc(s.en)}</p><p class="wrong">常见错误 · <span lang="en">${esc(s.wrong)}</span></p></div><div class="btn-row"><button class="btn outline" id="speak">◖ 听标准发音</button><button class="btn outline" id="stop">停止播放</button></div>${state.settings.mode==='shadow'?settingsControls():''}<p class="hint" style="margin:18px 0 12px">${state.settings.mode==='shadow'?'听一遍，留出时间跟读，再对照句型自评。':'对照句型和用词自评，无需和答案逐字一致。'}</p><div class="btn-row"><button class="btn negative" id="wrong">还不熟 · 答错</button><button class="btn positive" id="correct">说对了 ✓</button></div>` : `<button class="btn primary full" id="reveal">我说完了，显示答案 <span aria-hidden="true">→</span></button>`}<div class="practice-bottom"><span>本次剩余 ${queue.length} 句</span><span>连续答对 ${m.streak} / 3 次</span></div></section><div class="notice"><b>先开口，再看答案。</b><br>${state.settings.mode==='shadow'?'显示答案后，点击朗读，支持重复播放和调速。':'答错没关系。明天优先复习，记住用法比记住答案更重要。'}</div><p class="keyboard"><kbd>空格</kbd>显示答案 <kbd>1</kbd>答对 <kbd>2</kbd>答错 <kbd>R</kbd>朗读</p>`;
}
function coursesPage() {
  if (lessonId) {
    const c = catalog.courses.find(c => c.id === lessonId);
    if (c) return `<button class="btn outline small" id="back-courses">← 全部课程</button><section class="card" style="margin-top:18px"><p class="eyebrow">PATTERN LESSON</p><h1>${esc(c.name)}</h1><p>${esc(c.explanation)}</p><div class="notice"><b>常见错误</b><br>${esc(c.commonMistakes || '留意句型结构和动词形式。')}</div><h3>自然例句</h3>${(c.examples || []).map(e => `<p lang="en">${esc(e)}</p>`).join('')}${c.lessonUrl?`<a class="link" href="${href(c.lessonUrl)}" target="_blank" rel="noopener noreferrer">查看扩展讲解 ↗</a>`:''}<details><summary>查看本课 ${c.sentences.length} 个练习句与朗读</summary>${c.sentences.map(s => `<div class="sentence"><p>${esc(s.zh)}</p><p lang="en">${esc(s.en)}</p><button class="btn outline small" data-read="${esc(s.id)}">朗读这句</button></div>`).join('')}</details></section><p class="hint">课程内朗读不计入每日训练和复习成绩。</p>`;
    lessonId = null;
  }
  return `<section class="intro"><p class="eyebrow">YOUR LEARNING PATH</p><h1>从句型，到表达。</h1><p class="hint">${catalog.courses.length} 个核心句型 · ${questions().length} 个生活场景<br>先理解用法，再把它说成自己的话。</p></section>${catalog.courses.map((c,i) => { const n = c.sentences.filter(s => meta(state,s.id,dateKey()).mastered).length; return `<button class="lesson" data-lesson="${esc(c.id)}"><span class="lesson-num">${String(i+1).padStart(2,'0')}</span><span class="lesson-body"><strong>${esc(c.name)}</strong><small>${c.sentences.length} 句 · 已掌握 ${n} 句</small></span><span class="arrow">↗</span></button>`; }).join('')}<a class="link" href="#updates">课程更新与版本 →</a>`;
}
function progressPage() {
  const day = dateKey(), r = record(), q = questions(), n = q.filter(s => meta(state,s.id,day).mastered).length;
  return `<section class="intro"><p class="eyebrow">SMALL STEPS, REAL PROGRESS</p><h1>每一句，都算数。</h1><p class="hint">已掌握 ${n} / ${q.length} 句，继续保持你的节奏。</p></section><section class="card"><div class="stats-grid"><div class="stat"><b>${r.done}</b><span>今日完成</span></div><div class="stat"><b>${r.done?Math.round(r.correct/r.done*100):0}%</b><span>今日正确率</span></div><div class="stat"><b>${streak(state,day)}</b><span>连续练习天数</span></div></div><h3>最近 7 天</h3><div class="week">${Array.from({length:7},(_,i) => { const d=addDays(day,i-6), done=dayRecord(state,d).done; return `<div>${d.slice(5)}<span class="${done?'done':''}" aria-label="${d} 完成 ${done} 题">${done||'·'}</span></div>`; }).join('')}</div><p class="hint">今天尚未练习时，连续天数延续到昨天。答错次日复习；答对后间隔 1 天、3 天，连续答对第三次即掌握。</p></section><section class="card"><h2>句型掌握情况</h2>${catalog.courses.map(c => { const m=c.sentences.filter(s => meta(state,s.id,day).mastered).length; return `<div class="course-stat"><div class="row"><strong>${esc(c.name)}</strong><span>${m}/${c.sentences.length}</span></div><div class="track"><span style="width:${m/c.sentences.length*100}%"></span></div></div>`; }).join('')}</section>`;
}
function resourcesPage() {
  const links = catalog.manifest.links || {};
  return `<section class="intro"><p class="eyebrow">KEEP YOUR CURIOSITY</p><h1>让语言走进生活。</h1><p class="hint">听一点英语，也探索一门新的语言。</p></section><section class="card"><div class="resource-mark">01 / ENGLISH LISTENING</div><h2>给耳朵一点英语</h2><p class="hint">从短音频开始，先听懂大意，再模仿一句。</p><a class="link" href="${href(links.bbc || 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english')}" target="_blank" rel="noopener noreferrer">BBC · 6 Minute English ↗<small>真实话题，短篇听力，适合每天一点点。</small></a></section><section class="card"><div class="resource-mark">02 / ¡HOLA, ESPAÑOL!</div><h2>西班牙语，从好奇开始</h2>${(Array.isArray(links.spanish)?links.spanish:[]).filter(l => safeURL(l.url)).map(l => `<a class="link" href="${href(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.name)} ↗</a>`).join('')}</section><p class="hint">以上为外部学习资源，需要联网；不包含在离线课程中。</p>`;
}
function settingsPage() {
  return `<section class="intro"><p class="eyebrow">MAKE IT YOURS</p><h1>按你的节奏来。</h1><p class="hint">管理朗读、安装和学习记录。</p></section><section class="card"><h2>朗读偏好</h2>${settingsControls()}<p class="hint">使用浏览器 speechSynthesis。离线发音取决于手机是否已安装英语语音包，不录音、不自动判分。</p></section><section class="card"><h2>安装到主屏幕</h2><p class="hint" id="install-help">${matchMedia('(display-mode: standalone)').matches?'你正在使用已安装的应用。':'Chrome：浏览器菜单 → 安装应用 / 添加到主屏幕。三星浏览器：菜单 → 添加页面到 → 主屏幕。首次请联网打开一次并等待离线资源准备完成。'}</p><button class="btn outline full" id="install">${installPrompt?'安装开口练':'查看安装方法'}</button><p class="hint" id="offline-status">${offlineStatus()}</p></section><section class="card"><h2>学习记录备份</h2><p class="hint">记录只保存在当前网址、当前浏览器。定期备份，换手机或浏览器时导入即可。旧版 V2 进度也可导入。</p><button class="btn primary full" id="export-progress">导出学习记录 JSON</button><details><summary>导入学习记录</summary><p class="hint">导入前会校验文件。确认后以备份替换本机记录，不改变课程。建议先导出当前记录。</p><input class="file-input" id="import-progress" type="file" accept=".json,application/json" aria-label="选择学习记录 JSON"><button class="btn outline full" id="apply-import" hidden>确认用此备份替换记录</button><p class="hint" id="import-preview"></p></details></section><section class="card"><div class="row"><h2 style="margin:0">课程与程序</h2><a class="btn outline small" href="#updates">检查更新 →</a></div><p class="hint" style="margin:15px 0 0">程序 v3.0.1 · 课程 ${esc(catalog.manifest.version)}<br>更新课程保留学习记录；清除网站数据会移除本机记录。</p></section>`;
}
function updatesPage() {
  const m=catalog.manifest;
  return `<section class="intro"><p class="eyebrow">ALWAYS SOMETHING TO SAY</p><h1>课程持续生长。</h1><p class="hint">联网检查新内容，离线也能继续练习。</p></section><section class="card"><div class="row"><h2 style="margin:0">当前课程库</h2><span class="version">v${esc(m.version)}</span></div><p class="hint" style="margin-top:20px">更新日期：${esc(m.updatedAt)}<br>${catalog.courses.length} 课 · ${questions().length} 句<br>最近成功检查：${catalog.checkedAt?esc(new Date(catalog.checkedAt).toLocaleString('zh-CN')):'尚未联网检查'}</p><div class="notice">${esc(m.releaseNotes || '保持练习，期待下一批内容。')}</div><button class="btn primary full" id="check-update" ${updating?'disabled':''}>${updating?'正在检查并下载课程…':'检查课程更新'}</button><p class="log" role="status">${esc(updateMessage)}</p><button class="btn outline full" id="check-app">检查程序更新</button><p class="hint">整批课程下载并校验成功后才生效，失败继续使用当前课程。程序新版本准备好时会提示重新加载。</p></section><section class="card"><h2>当前清单中的最新课程</h2>${m.courses.map(c => `<div class="release"><strong>${esc(c.name)}</strong><small>${esc(c.id)} · v${esc(c.version)} · ${esc(m.updatedAt)}</small></div>`).join('')}</section>`;
}
let offlineReady = false;
function offlineStatus() { return offlineReady ? '✓ 离线资源已准备好，可断网练习。' : '离线资源尚未确认准备完成，请保持联网；准备好后会自动显示。'; }
function render() {
  if (!catalog) return;
  const t = tab();
  document.querySelectorAll('[data-tab]').forEach(a => {
    if (a.dataset.tab === (t==='updates'?'settings':t)) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
  });
  $('#main').innerHTML = ({practice,courses:coursesPage,progress:progressPage,resources:resourcesPage,settings:settingsPage,updates:updatesPage})[t]();
  bindSettings(); bindPage();
}
async function gradeCurrent(ok) {
  const id = practiceId, day = dateKey();
  if (day !== lastDay) { lastDay=day; revealed=null; practiceId=null; render(); toast('新的一天开始了，请重新作答。'); return; }
  if (!id || revealed !== id) return;
  // 首次点击立即撤销授权，避免双击或键盘重复导致连续计分。
  revealed = null; stopSpeech();
  if (await mutate(s => grade(s,catalog.courses,id,ok,day))) practiceId = null;
  else revealed = id;
  render();
}
function bindPage() {
  const on = (id,fn) => { const el=$(`#${id}`); if(el) el.onclick=fn; };
  on('reveal',() => { revealed=practiceId; render(); });
  on('correct',() => gradeCurrent(true)); on('wrong',() => gradeCurrent(false));
  on('speak',() => { const s=questions().find(x => x.id===practiceId); if(s && revealed===s.id) speak(s.en); }); on('stop',stopSpeech);
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick=async () => { stopSpeech(); await mutate(s => ({...s,settings:{...s.settings,mode:b.dataset.mode}})); render(); });
  document.querySelectorAll('[data-lesson]').forEach(b => b.onclick=() => { lessonId=b.dataset.lesson; render(); $('#main').focus(); window.scrollTo(0,0); });
  document.querySelectorAll('[data-read]').forEach(b => b.onclick=() => { const s=questions().find(x=>x.id===b.dataset.read); if(s) speak(s.en); });
  on('back-courses',() => { lessonId=null; stopSpeech(); render(); });
  on('export-progress',() => downloadBackup());
  on('check-update',checkUpdates);
  on('check-app',async () => { try { if (!registration) throw Error('请使用 HTTPS 网址并等待应用注册'); await registration.update(); toast(registration.waiting?'新版本已准备好，请点击顶部重新加载。':'已检查程序版本；若有新版本，下载完成后将提示。'); } catch(e) { toast(`暂时无法检查程序：${e.message}`); } });
  on('install',async () => { if(!installPrompt) return toast($('#install-help').textContent); await installPrompt.prompt(); await installPrompt.userChoice; installPrompt=null; render(); });
  const file=$('#import-progress');
  if(file) file.onchange=async () => {
    $('#apply-import').hidden=true;
    try {
      const f=file.files[0]; if(!f) return; if(f.size>5_000_000) throw Error('备份超过 5 MB');
      const next=validateProgress(JSON.parse(await f.text()));
      $('#import-preview').textContent=`校验成功：${Object.keys(next.items).length} 道题的记录，${Object.keys(next.days).length} 天统计。确认后替换本机记录。`;
      $('#apply-import').hidden=false;
      $('#apply-import').onclick=async () => {
        const run=() => persist(next);
        try { if(navigator.locks) await navigator.locks.request('koukoulian-progress',run); else run(); revealed=null; practiceId=null; stopSpeech(); render(); toast('学习记录已恢复。'); }
        catch(e) { toast(`导入失败，原记录保留：${e.message}`); }
      };
    } catch(e) { $('#import-preview').textContent=`导入失败：${e.message}。现有记录未改变。`; }
  };
}
function downloadBackup() {
  // 记录异常时也允许导出原始值，便于人工恢复，绝不静默覆盖。
  let data;
  if (storageBlocked) {
    try { const raw=localStorage.getItem(PROGRESS_KEY) || localStorage.getItem('koukoulian_progress_v2'); data={format:'koukoulian-recovery',raw,progressInMemory:state}; } catch { data={format:'koukoulian-backup',progress:state}; }
  } else data={format:'koukoulian-backup',schemaVersion:1,exportedAt:new Date().toISOString(),progress:state};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a'); a.href=url; a.download=`开口练_学习记录_${dateKey()}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function checkUpdates() {
  if (updating || !catalog) return;
  updating=true; updateMessage='正在获取最新清单并校验课程…';
  // 练习页不重绘，保留刚显示的答案和焦点。
  if(tab()==='updates') render();
  try {
    const old=JSON.stringify(catalog.manifest);
    const run=async () => {
      const saved=localStorage.getItem(CATALOG_KEY);
      const current=saved?validateCatalog(JSON.parse(saved),MANIFEST_URL):catalog;
      const next=await updateCatalog(current); catalog=next;
    };
    if(navigator.locks) await navigator.locks.request('koukoulian-catalog',run); else await run();
    updateMessage=old===JSON.stringify(catalog.manifest)?'当前已是最新课程，离线题库可继续使用。':'课程已更新成功，原有学习记录全部保留。';
    if (old!==JSON.stringify(catalog.manifest)) { stopSpeech(); revealed=null; practiceId=null; render(); toast('新课程已就绪，学习进度已保留。'); }
  } catch(e) { updateMessage=`更新未完成，继续使用当前课程和进度。原因：${e.message}`; }
  finally { updating=false; if(tab()==='updates') render(); }
}
function networkStatus() { $('#network').textContent=navigator.onLine?'在线 · 可练习':'离线 · 可练习'; }
async function setupWorker() {
  if(!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
    const waiting=() => { if(registration.waiting) $('#app-update').hidden=false; };
    waiting();
    registration.addEventListener('updatefound',() => {
      const worker=registration.installing;
      worker.addEventListener('statechange',() => {
        if(worker.state==='installed') { if(navigator.serviceWorker.controller) waiting(); else { offlineReady=true; if(tab()==='settings') render(); toast('离线资源已准备好。'); } }
      });
    });
    navigator.serviceWorker.ready.then(() => { offlineReady=true; if(tab()==='settings') render(); });
    let reloading=false;
    navigator.serviceWorker.addEventListener('controllerchange',() => {
      if(reloading) location.reload();
    });
    $('#reload-app').onclick=() => { if(registration.waiting) { reloading=true; registration.waiting.postMessage({type:'SKIP_WAITING'}); } else location.reload(); };
  } catch { toast('离线缓存未准备完成，请保持联网并稍后重新打开。'); }
}
async function start() {
  try { state=readProgress(); localStorage.setItem(PROGRESS_KEY,JSON.stringify(state)); }
  catch(e) { storageError(`本地记录无法读取或保存（${e.message}）。为保护原记录，已暂停计分；可在设置中导出备份或导入有效记录恢复。`); }
  try {
    const raw=localStorage.getItem(CATALOG_KEY);
    if(raw) catalog=validateCatalog(JSON.parse(raw),MANIFEST_URL);
  } catch { /* 缓存损坏时使用随程序分发的完整初始题库，绝不写学习进度。 */ }
  if(!catalog) {
    try {
      const response=await fetch('./courses/builtin-v2.json');
      if(!response.ok) throw Error('初始课程下载失败');
      catalog=validateCatalog(await response.json(),MANIFEST_URL);
      try { localStorage.setItem(CATALOG_KEY,JSON.stringify(catalog)); } catch { toast('题库暂时无法存入本地，请检查浏览器存储空间。'); }
    } catch(e) {
      $('#main').innerHTML=`<section class="card empty"><h1>课程暂时没有加载成功</h1><p class="hint">首次打开需要联网下载课程。已有学习记录仍保留，请连接网络后重试。</p><button class="btn primary" id="retry">重新加载</button></section>`;
      $('#retry').onclick=()=>location.reload(); setupWorker(); return;
    }
  }
  networkStatus(); render(); setupWorker(); checkUpdates();
}
window.addEventListener('hashchange',() => { stopSpeech(); revealed=null; lessonId=null; render(); $('#main').focus(); window.scrollTo(0,0); });
window.addEventListener('online',() => { networkStatus(); checkUpdates(); });
window.addEventListener('offline',networkStatus);
window.addEventListener('beforeinstallprompt',e => { e.preventDefault(); installPrompt=e; if(tab()==='settings') render(); });
window.addEventListener('appinstalled',() => { installPrompt=null; toast('已安装到主屏幕。'); });
window.addEventListener('storage',e => {
  try {
    if(e.key===PROGRESS_KEY || e.key===null) { state=readProgress(); revealed=null; practiceId=null; }
    if(e.key===CATALOG_KEY && e.newValue) { catalog=validateCatalog(JSON.parse(e.newValue),MANIFEST_URL); revealed=null; }
    render();
  } catch(e) { storageError(`另一标签的记录无法读取：${e.message}。请先导出备份。`); }
});
document.addEventListener('visibilitychange',() => {
  if(document.hidden) { stopSpeech(); return; }
  if(dateKey()!==lastDay) { lastDay=dateKey(); revealed=null; practiceId=null; render(); }
  registration?.update().catch(()=>{});
  checkUpdates();
});
document.addEventListener('keydown',e => {
  if(e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.isComposing || tab()!=='practice' || e.target.closest('input,select,textarea,[contenteditable],button,a')) return;
  if(e.key===' ') { e.preventDefault(); $('#reveal')?.click(); }
  if(e.key==='1') $('#correct')?.click();
  if(e.key==='2') $('#wrong')?.click();
  if(e.key.toLowerCase()==='r') $('#speak')?.click();
});
// 前台停留过午夜也要刷新日期，避免把昨天显示的答案记到今天。
setInterval(()=> { if(dateKey()!==lastDay) { lastDay=dateKey(); stopSpeech(); revealed=null; practiceId=null; render(); } },30000);
start();
