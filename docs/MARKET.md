# 发到 DSH 插件市场

「DSH 插件市场」不是一个单独的站点——它读的是
[**awesome-dsh-plugin**](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
这份**社区精选清单**，而那份清单又被发布成 npm 上的
[`dsh-plugin-catalog`](https://www.npmjs.com/package/dsh-plugin-catalog)
（市场发现页 `Plugins → Discover → Index sources` 里加
`https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json` 就能搜到）。

所以进市场 = **给那份清单提一个 PR**，一个文件。

## 前提

- ✅ 插件已发布到 npm（`dsh plugin add dsh-realtime-interview` 能装上）
- ✅ 仓库公开，README 有截图（市场卡片没配图时，会自动从 README 里抽第一张）
- ✅ 仓库设好 GitHub Topic（见 `BRAND.md`）

## 投稿：一个文件

在 `awesome-dsh-plugin/awesome-dsh-plugin` 里加
`data/plugins/LiangshouX__dsh-realtime-interview.yml`（文件名 = `<owner>__<repo>`）：

```yaml
url: https://github.com/LiangshouX/dsh-realtime-interview
name: LiangshouX/dsh-realtime-interview
category: tools
description:
  en: Mock-interview plugin for DeepSeek Harness: turns a resume and a job description into a prepared interview with live voice, camera and a post-interview report.
  zh: 简历 + JD 变成一场有准备的模拟面试：助手先出分级考点清单，再逐轮提问，实时语音与摄像头，结束后写一份基于转录原话的事后报告。数据全部留在本机。
icon: https://raw.githubusercontent.com/LiangshouX/dsh-realtime-interview/main/assets/brand/icon-180.png
```

要点（来自该仓库的 `contributing.md`）：

- **只有 `description.en` 是必填的**；中文写不了就省掉，维护者会补。
- 描述里带 `: `（冒号加空格）必须加引号，否则 YAML 解析失败。
- `category` 取值见下表。**面试类插件在社区里的先例是 `tools`**
  （`dsh-interview`、`dsh-plugin-resume-warehouse` 都在这一类）。
- `icon` 是**可选**的位图（市场卡片图标）；不写就回退成作者头像。
  必须是 **GitHub 托管的位图**——写 SVG 不行。我们已经有
  `assets/brand/icon-180.png`（180px，由 `node dev/make-brand-assets.mjs` 烘出）。
- 两个 README 是**脚本生成**的，不要手工编辑；只加那一个 yml 文件。

## 分类可选值

`agi` `ui` `usage` `theme` `model` `identity` `session` `memory` `tools`
`wsl` `browser` `vision` `voice` `docs` `skill` `workflow` `git` `notify`
`dev` `security` `remote` `market` `fun`

## 收录之后

- 清单的两个 README 在 `main` 上自动重新生成；
- 市场条目带着 `engines.dsh`（我们声明 `>=0.1.7`），卡片上会显示这个要求；
  用户开了「只看与当前宿主兼容的」过滤时才可能看不到本条目——**不声明反而会被
  猜成不兼容**，所以这个字段要留着；
- README 顶部可以加上这枚徽章：

  ```markdown
  [![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)
  ```

## 顺带一提

- 仓库的 **GitHub Topic** 也在 GitHub 侧设置（Settings → Topics），
  不在这个清单里管，但**找插件的人靠它搜**。
- 市场的更新检查走 npm 版本或固定 commit 对 HEAD，所以发版后市场里能一键升级。
