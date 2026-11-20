# docs/media

README 与文档里用到的图。

| 文件 | 是什么 |
|---|---|
| `poster.jpg` | 宣传海报：暗房里的模拟面试——镜头前的候选人、虚拟面试官、评估报告 |
| `interview-room.jpg` | 面试中：舞台上是虚拟面试官，下缘是提问字幕，右侧是速记与现场控制台 |
| `prepare.jpg` | 准备页：简历 / JD 归档与面试官底稿 |
| `report.jpg` | 报告页：逐考点评估的阅读版式 |

`poster.jpg` 是**画出来的**（提示词与配色见 `docs/BRAND.md`），其余三张是真截图。

## 怎么来的

真截图，不是画出来的。用 `dev/shoot.mjs` 在真 Chromium 里渲染面板：

```bash
node dev/shoot.mjs live prepare report
```

原始文件是 3200×2000 的 PNG，落在 `dev/shots/`（gitignore）。
这里的三张是**缩到 1600 宽的 JPEG**（q92，每张 150 KiB 上下）——
README 里显示宽度约 900 px，1600 宽够两倍屏用，而整包因此只多几百 KB。

画面里那个「人」是**合成**的：Chromium 默认的假摄像头是个绿球，
拿来做门面不行。`scripts/browser.mjs` 支持 `DSH_IV_FAKE_VIDEO=<file.y4m|file.mjpeg>`，
把一段视频当作摄像头画面喂进去。这三张图用的就是一段**逆光人影**的合成画面
（暗房、剪影、轮廓光）——刻意不画脸，也不用任何真人肖像。

## 换图

1. 重新截：`node dev/shoot.mjs <preset>`（或直接用自己拍的图）；
2. 缩到 1600 宽、存成 JPEG q92，放进这个目录；
3. 改 README 里对应的图片路径。
