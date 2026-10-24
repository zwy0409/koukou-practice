# GitHub 管理代码，Cloudflare Pages 自动部署

本交付包含完整代码和部署配置，未创建远程 GitHub 仓库或 Cloudflare 项目。以下操作由你的 GitHub / Cloudflare 账号完成，不需要后端或付费数据库。

## 1. 上传 GitHub

在 GitHub 新建空仓库，例如 `koukou-practice`，在本项目根目录执行（替换你的 GitHub 用户名）：

```sh
git init
git add .
git commit -m "Initial speaking practice PWA"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/koukou-practice.git
git push -u origin main
```

也可通过 GitHub 网页上传源文件。不要只上传 `dist/`，应保留 `public/`、脚本、文档和测试。GitHub Actions 会在推送和 PR 时运行检查；若需强制检查通过再合并，可在仓库分支规则中启用必需检查。

## 2. 创建 Cloudflare Pages 项目

Cloudflare 控制台 → Workers & Pages → 创建应用 → Pages → 连接 Git（界面名称可能变化）。授权 GitHub 仓库后设置：

| 设置 | 值 |
| --- | --- |
| 生产分支 | `main` |
| 框架 | `None` |
| 根目录 | 本仓库根目录，留空 |
| 构建命令 | `npm test && npm run build` |
| 输出目录 | `dist` |
| 环境变量 | `NODE_VERSION=22` |

如果上传到现有仓库的子目录，把根目录设为该子目录。项目不需要安装依赖。首次部署成功后，使用固定生产网址 `https://你的项目名.pages.dev`。以后向 `main` 推送，Pages 自动重新构建并部署。

发布课程时，程序不必重新安装；已打开的程序联网检查 `manifest.json` 后自动获取课程。程序文件有改动则遵循 [程序升级](PUBLISHING.md#程序升级) 的 SW 版本规则。

## 3. 固定网址

可以使用项目的正式 `pages.dev` 域名，也可在 Pages 设置中绑定自定义域名并按向导配置 DNS。确定后长期使用同一个 HTTPS 域名。学习记录按来源隔离，预览分支网址、`pages.dev` 与自定义域名之间不共享进度；改域名前先导出、改后导入。

不要把每次部署生成的随机预览链接作为手机长期入口。PWA 默认部署于域名根目录；若部署在子路径，应同时检查作用域、响应头与静态路径。

## 4. 手机安装和离线验收

1. 使用 Chrome 或三星浏览器打开固定 HTTPS 网址。
2. 等待“设置”页显示“离线资源已准备好”。
3. Chrome 菜单选择“安装应用”或“添加到主屏幕”；三星浏览器菜单选择“添加页面到 → 主屏幕”。按钮和菜单文案随版本变化。
4. 从主屏幕打开，完成一次练习并重新打开，确认计数保存。
5. 开飞行模式，完全关闭再从主屏幕打开，确认题目、课程和统计可用。
6. 如需离线发音，在 Android 系统“文字转语音”设置中安装本地英语语音包。

安装提示由浏览器决定，已安装、无痕模式或系统策略可能不显示原生安装按钮，因此应用提供手动菜单说明。

## 缓存配置

`public/_headers` 由构建复制到 `dist/`，Pages 负责应用响应头。课程清单禁止 HTTP 缓存，SW 不拦截清单和 `cache:no-store` 更新请求；SW 脚本也要求重新验证。静态程序文件在 SW 版本缓存中保持一致，直到用户接受新版本。

本地 Python 服务不会解析 `_headers`，上线后需检查 Pages 实际响应头。若额外配置 Cloudflare Cache Rules，不要对 `/manifest.json`、`/sw.js` 设置“缓存所有内容”或强制 Edge TTL。

## 回滚

- 坏课程发布会被客户端拒绝，旧课程继续使用。修复文件和清单后重新提交即可。
- 课程回滚可把清单条目重新指向上一版文件，保留题目 ID。不要删历史课程文件，避免尚未更新的客户端请求失效。
- 程序回滚后，把 `sw.js` 中 `APP_VERSION` 改成新的未用过版本再发布，使客户端能识别回滚构建。
- 不要让用户通过“清除网站数据”修复更新问题，这会删除学习记录。先导出再处理。
