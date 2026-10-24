# 开口练 · 英语口语训练 PWA

固定正式网址：https://koukou-practice.pages.dev

HTML、CSS、原生 JavaScript，无运行时依赖、账号、后端、数据库或 AI 判分。保留提供的 V2 题库：10 个核心句型、100 句、原题目 ID。

## 本地运行

需要 Node.js 22+。无需 Python，也无需 `npm install`。

```sh
npm test
npm run build
npm run dev
```

打开 `http://localhost:4173`。不要双击 HTML 使用 `file://`；Service Worker 需要 HTTPS 或 localhost。`npm run build` 校验题库后把 `public/` 复制到 `dist/`。

## 已实现

- 每日最多 20 次计分；到期错题优先；同一道题当天只练一次。
- 先中文、自己说英文、显示参考答案与常见错误，再手动自评。
- 答错次日复习；第一次连续答对后隔 1 天，第二次隔 3 天，第三次掌握并退出日常循环。
- 浏览器英语朗读、0.5–1.25 倍速、1 / 2 / 3 / 5 次播放、停止按钮与跟读模式。
- 课程讲解、全部例句朗读、每日统计、7 日记录、连续练习天数。
- 课程显示已练句数；展开练习句可查看每句连续答对次数、累计对错和下次复习日期。一次答对记入已练，同一句在后续到期复习中连续答对三次才计为掌握。
- 英语听力、西班牙语资源入口。
- 五个底部导航、手机优先布局、桌面限宽；空格显示答案、1 答对、2 答错、R 朗读。输入框、按钮等获得焦点时保留其原生键盘行为。
- PWA 安装图标、独立窗口、静态资源和课程离线缓存。
- 启动、恢复前台和网络恢复时检查课程清单；下载、SHA-256、结构校验全部成功后一次替换课程库。
- 程序更新等待用户点击“重新加载”，避免练习中途被打断。
- localStorage 学习记录、JSON 备份与恢复、V2 备份迁移、多标签记录同步。

## 项目结构

```text
public/
  index.html, styles.css     界面
  js/core.js                调度、日期、进度验证，纯函数
  js/catalog.js             下载、校验、课程原子替换
  js/app.js                 页面、备份、朗读、PWA 生命周期
  manifest.json             远程课程清单（不是 PWA manifest）
  app.webmanifest           PWA 安装清单
  courses/*.json            独立、带版本的课程包
  courses/builtin-v2.json    首次安装与离线初始题库
  sw.js                     静态资源版本管理、课程缓存读取
  _headers                  Cloudflare 缓存与安全响应头
  icons/                    PNG 普通及 maskable 安装图标
scripts/                    校验、构建、SHA-256 工具
tests/core.test.mjs          19 项核心测试
.github/workflows/check.yml GitHub 推送 / PR 自动检查
docs/                       部署、格式、发布与验收说明
```

## 数据可靠性

学习记录键为 `koukoulian_progress_v3`，课程键为 `koukoulian_catalog_v1`，二者完全独立。更新器从不写入进度键。相同题目 ID 保留原进度，暂时下架题目的进度也保留，再上架后恢复关联。

课程更新先在内存中装配完整目录，一次 `localStorage.setItem` 提交。任何 HTTP、解析、哈希、重复 ID 或存储配额错误均保留旧目录。CacheStorage 是额外文件副本，离线课程主要从本地完整目录读取。初始题库也随程序预缓存。

计分先读取最新存储，计算新状态并写入，成功后才修改内存与界面。存储失败不前进到下一题，记录损坏时暂停计分并提示恢复。支持 Web Locks 的浏览器会串行处理多个标签的计分和导入；旧浏览器采用同步读写回退，建议只在一个标签中练习。

日期按设备本地日历计算。连续天数在今天尚未练习时延续至昨天。每日上限针对计分练习，课程讲解与朗读可以随时查看。没有服务器时间或跨设备同步，更改系统日期或手工修改存储不在防作弊范围内。

## 从旧版迁移

1. 在旧 HTML 的“资源”页导出学习进度 JSON。
2. 在固定 HTTPS 新网址打开本应用，进入“设置 → 导入学习记录”。
3. 文件校验成功后点击确认替换，原 `dont-01` 等 ID 对应进度继续使用。

如果旧版和新版在同一浏览器、同一来源（协议、域名和端口），新版会读取旧键 `koukoulian_progress_v2` 并迁移到 V3，不删除旧键。手机本地文件与 HTTPS 网站不共享存储，需要手动导出导入。

## 部署与维护

- [Cloudflare Pages + GitHub 部署](docs/DEPLOY.md)
- [课程 JSON 格式](docs/CONTENT_FORMAT.md)
- [发布下一批课程与程序升级](docs/PUBLISHING.md)
- [测试结果和上线验收清单](docs/TESTING.md)

浏览器可能清理网站数据；请定期导出备份。手机离线英语朗读需要系统本地英语语音，课程离线可用并不代表在线语音引擎离线可用。外部学习资源需要网络。
