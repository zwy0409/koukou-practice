# 课程数据格式

所有文件为 UTF-8 JSON，建议不含 BOM，不允许注释或末尾逗号。课程清单和 PWA 安装清单用途不同：`manifest.json` 管课程，`app.webmanifest` 管应用安装。

## 课程清单 `public/manifest.json`

```json
{
  "schemaVersion": 1,
  "version": "2.1.0",
  "updatedAt": "2026-11-01",
  "title": "开口练 · 英语口语训练",
  "releaseNotes": "新增日常计划句型。",
  "links": {
    "bbc": "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english",
    "spanish": [{"name":"Language Transfer", "url":"https://www.languagetransfer.org/complete-spanish"}]
  },
  "courses": [
    {
      "id": "dont",
      "name": "I don’t + 动词",
      "version": "2.1.0",
      "url": "courses/dont.2.1.0.json",
      "sha256": "填入该文件实际的64位小写SHA256摘要"
    }
  ]
}
```

这是结构示例，摘要占位符不能直接发布。实际清单必须列出所有当前有效课程；不是只列出变化的课程。条目顺序决定新题学习顺序，错题仍优先。`updatedAt` 是有效的 `YYYY-MM-DD` 日期；`version` 使用版本字符串，建议语义化版本。每条目必须含 ID、名称、版本、JSON 地址和摘要。

默认从同一网址的清单下载课程。相对 URL 以清单 URL 为基准。客户端结构验证支持 HTTPS URL，但默认 CSP 只允许同源请求，因此推荐始终使用 `courses/` 下的同源文件。若自行改成跨域地址，需要同时修改 `catalog.js` 的清单 URL、CSP `connect-src`、远端 CORS 和离线策略；附带的发布校验器刻意要求本地课程路径。

## 单课文件

`public/courses/dont.2.1.0.json`：

```json
{
  "schemaVersion": 1,
  "version": "2.1.0",
  "course": {
    "id": "dont",
    "name": "I don’t + 动词",
    "explanation": "I don’t 后接动词原形，表达习惯性否定。",
    "commonMistakes": "I’m not play ✗；I don’t plays ✗",
    "examples": ["I don’t play games.", "I don’t know.", "I don’t mind."],
    "lessonUrl": "",
    "sentences": [
      {
        "id": "dont-01",
        "zh": "我现在不怎么玩英雄联盟了。",
        "en": "I don't play League of Legends much anymore.",
        "wrong": "I'm not play League of Legends."
      }
    ]
  }
}
```

实际发布更新时保留完整旧题，示例只展示一道。课程 `id`、名称、讲解和非空 `sentences` 必需；题目 `id`、`zh`、`en`、`wrong` 必需；例句、常见错误讲解和扩展链接可选。课程包 `version` 和 `course.id` 必须与清单一致。没有扩展链接时用空字符串。

ID 必须以字母或数字开头，只含 ASCII 字母、数字、`-`、`_`，长度最多 100，不能使用保留键 `constructor`、`prototype`、`__proto__`。题目 ID 在整个题库中全局唯一。

## 稳定 ID 规则

- 已有 `dont-01`、`not-01` 等 ID 不变；题目改错别字、补充等价参考答案继续用原 ID。
- 新题使用新 ID，例如 `dont-11`。不能把已删除题的 ID 分配给完全不同的新题。
- 大幅改变题意、目标结构或难度时用新 ID，让新题拥有独立复习进度。
- 暂时下架只从课程清单或课程题目数组移除，学习记录仍保存，重新加回同 ID 后进度恢复。
- 更新同一课程包时，数组应包含希望保留的全部题目，客户端不对课程包做追加合并。

## 学习记录格式

正常导出为 `{ "format":"koukoulian-backup", "schemaVersion":1, "exportedAt":"...", "progress":{...} }`。`progress` 为 schema 3，包含 `items`、`days`、最多最近 2000 条 `history` 与 `settings`。

`items` 按题目 ID 保存累计正确 / 错误次数、连续答对次数、掌握标记和下次复习日期；`days` 保存每日完成、正确数和当天做过的题目 ID。导入也接受旧 V2 的原始进度对象。导入会替换本机学习记录，先做完整校验并要求页面内确认，失败不修改原记录。它不会改变课程目录。

若发现本地记录损坏，设置页可导出包含原始字符串的 `koukoulian-recovery` 恢复材料；这种恢复文件用于人工修复，不直接作为正常进度导入。
