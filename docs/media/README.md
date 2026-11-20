# docs/media

README 与文档里用到的图。

| 文件 | 是什么 |
|---|---|
| `interview-room.jpg` | 面试中：舞台上是虚拟面试官，右下是提问字幕，右侧是速记与现场控制台 |
| `prepare.jpg` | 准备页：简历 / JD 归档与面试官底稿 |
| `report.jpg` | 报告页：逐考点评估的阅读版式 |

## 怎么来的

真截图，不是画出来的。用 `dev/shoot.mjs` 在真 Chromium 里渲染面板：

```bash
node dev/shoot.mjs live-dark-granted prepare-dark report
```

画面里那个「人」是**合成**的：Chromium 默认的假摄像头是个绿球，
拿来做门面不行。`scripts/browser.mjs` 支持 `DSH_IV_FAKE_VIDEO=<file.y4m|file.mjpeg>`，
把一段视频当作摄像头画面喂进去。这三张图用的就是一段**逆光人影**的合成画面
（暗房、剪影、轮廓光）——刻意不画脸，也不用任何真人肖像。

改完界面要重出图：重新截 → 缩到 1600 宽 → 存成 JPEG（q86）。
每张 100 KiB 上下，npm 包体不受影响。
