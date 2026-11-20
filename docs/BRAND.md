# 品牌素材

给这个插件的对外形象。已有的是图标（`assets/brand/`），**缺一张宣传海报**——
下面那段提示词就是给画图用的。

## 现状

| 素材 | 位置 | 状态 |
|---|---|---|
| 插件图标（DSH 侧栏用，扁 tile） | `icon.svg` | ✅ 定稿 |
| 对外版图标（正方 squircle） | `assets/brand/mark.svg` | ✅ 定稿 |
| 位图（市场卡片 180px / 渠道头像 512px） | `assets/brand/icon-180.png`、`icon-512.png` | ✅ 由 `node dev/make-brand-assets.mjs` 从 SVG 烘出 |
| README 截图 ×3 | `docs/media/*.jpg` | ✅ 真截图 |
| 宣传海报 | `docs/media/poster.jpg` | ✅ 定稿（1600×900，JPEG q92，121 KiB） |

改了 `assets/brand/mark.svg` 就重跑一次烘图：

```bash
node dev/make-brand-assets.mjs
```

图标为什么是「取景框 + 琥珀声波」：蓝框是**正在录**，琥珀是**正在说话**。
一眼能读出「镜头前有人在答」。

---

## 宣传海报 · 提示词（定稿稿的来路）

海报已经画好了（`docs/media/poster.jpg`）：暗房里的模拟面试——镜头前是**逆光剪影**
的候选人，右上角是带琥珀声波的**几何化 AI 面试官**，右下角是叠着的**评估报告卡片**
（柱状图 + 雷达图）。

下面这段提示词是**重画用的存档**——要改风格就照着它再来一张，别从零描述：

```text
一张 16:9 的深色科技风宣传横幅海报（2400×1350 px），主题是「AI 模拟面试」。

画面构成（从左到右）：
左侧三分之一：一块深色圆角矩形面板，像一个视频会议的舞台缩略图。
  面板里是一个**抽象的人物剪影**（只看得出头肩轮廓，看不出五官），
  背光，暖色轮廓光勾出侧脸边缘；背景是暗室，有极淡的网格与光晕。
  剪影旁边压着一层半透明的字幕条，暗示「正在提问」。
右上角：一个小的圆角画中画小窗，里面是一张**抽象的、有光影的 AI 面试官头像**
  （几何构成的女性面孔，不要写真实人像，不要出现现成 IP），带一圈柔和的琥珀色声波。
右下角：三张叠在一起的「评估报告」卡片，卡片上是抽象的**柱状图与雷达图**，
  琥珀与蓝灰两种强调色，纸白底。
整体留白充足，元素少而准，不要塞满。

配色（严格只用这几支）：
  墨底 #0D1117（背景）
  纸白骨 #EBEDF0（正文与卡片）
  琥珀 #CDA96F（正在发声 / 强调）
  蓝灰 #7FA6D9（取景 / 结构）
  青玉 #6FBF9A（就绪 / 通过）
  朱红 #E0563F（只用于极小面积的 REC 点）
  描边 #39404c

质感：哑光纸面 + 极低对比的玻璃感卡片，**不要**霓虹、赛博朋克、镜头光斑、
粒子特效、渐变彩虹。整体像「一间安静的暗房里的一场面试」。

不要出现：任何真实人脸、任何现成品牌 logo、任何水印、任何中文字符、
任何英文单词（画面是纯图形，文字后期自己排）。
```

出图之后：

- 存成 `docs/media/poster.jpg`（宽度压到 1600，JPEG q92，约 120 KiB）；
- 放在 README 徽标区**下面**、第一张截图**上面**：

  ```markdown
  ![宣传海报：暗房里的模拟面试，虚拟面试官、提问字幕与评估报告](https://raw.githubusercontent.com/LiangshouX/dsh-realtime-interview/main/docs/media/poster.jpg)
  ```

- 顺手也导一份 1200×630 的版本给社交媒体（OG 图），放 `docs/media/og.jpg`。

---

## README 徽标

README 顶部那排徽标现在是这样（`shields.io` + 官方徽章，GitHub 与 npm 都能渲染）：

| 徽标 | 指向 |
|---|---|
| npm 版本 / 月下载量 | npm 包页 |
| MIT 许可证 | 仓库里的 `LICENSE` |
| Node ≥ 20 | nodejs.org |
| DeepSeek Harness ≥ 0.1.7 | 官方仓库 |
| GitHub stars | 仓库 |
| Awesome DSH Plugin | awesome-dsh-plugin.com |

`Awesome DSH Plugin` 那枚要等插件**被收录进 awesome-dsh-plugin** 之后才有意义
（见 `docs/MARKET.md`）。在那之前它指向的页面里还没有这个条目——可以先留着，
也可以等收录后再加。

---

## GitHub Topic

仓库主题（Settings → Topics，或 API）在 GitHub 侧生效，用来找插件的人靠它搜索。
建议这一组（与 `dsh-ide-workbench` 的命名习惯一致）：

```
deepseek-harness
dsh
dsh-plugin
interview
mock-interview
job-interview
voice
asr
tts
camera
chinese
```
