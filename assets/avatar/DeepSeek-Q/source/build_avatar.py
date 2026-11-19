"""把 Q 版立绘绑成本插件能用的面试官形象（第二步：绑定 + 补眼窝）。

第一步（抠图 / 裁剪 / 闭嘴）在同目录的 `prep.py` 里做完了，产物是
`square.png`（750×750 正方形，含透明留白）。

这里做三件事：

  1. 把眼/嘴的锚点与眼轮廓交给 RuiC-2D 的流水线，生成 rig.json 与图层；
  2. 嘴的参数按这张脸的实际嘴宽给（渲染器画的嘴半宽 = halfLen × opening.width）；
  3. 底图的眼窝自己重做——流水线默认的补脸在这种高光很亮的脸上会填成一片
     白雾，眨眼时整块露出来（上一版形象踩过这个坑）。

运行时不带头部切片（workspace.regions = []）：插件不用切片，切了反而有缝。
"""
import base64
import json
import math
import os
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ART = Path(__file__).resolve().parent
SRC = ART / "square.png"

RUIC = Path(os.environ.get("RUIC_DIR", r"D:\Code\tmp-ruic\x\RuiC-2D-main"))
PYTHON = os.environ.get("RUIC_PYTHON", sys.executable)
PROJECT = os.environ.get("AVATAR_PROJECT", "deepseek-q")
AVATAR_ID = os.environ.get("AVATAR_ID", "DeepSeek-Q")
AVATAR_NAME = os.environ.get("AVATAR_NAME", "DeepSeek-Q")

# 裁剪与补白（与 prep.py 保持一致；坐标从这里换算到方形图空间）
CROP = (150, 0, 900, 735)
PAD = (0, 7)
# 眼窝椭圆（原图坐标）：cx, cy, rx, ry
EYES = [(487, 432, 47, 44), (652, 378, 40, 42)]
# 嘴（闭嘴微笑唇线的中点，原图坐标）
MOUTH = (591, 477)
# 皮肤基色（脸颊中位色）
SKIN = np.array([253, 235, 235])


def ellipse_contour(cx, cy, rx, ry, samples=24):
    points = []
    for index in range(samples):
        angle = 2 * math.pi * index / samples
        points.append([round(float(cx + rx * math.cos(angle)), 2),
                       round(float(cy + ry * math.sin(angle)), 2)])
    return points


def run_pipeline(args, data=None):
    env = {**os.environ, "PYTHONUTF8": "1"}
    return subprocess.run(
        [PYTHON, str(RUIC / "tools" / "pipeline.py"), *args], cwd=str(RUIC), input=data,
        capture_output=True, text=True, encoding="utf-8", env=env)


def main():
    square = Image.open(SRC).convert("RGBA")
    offset = np.array([CROP[0], CROP[1]])
    pad_x, pad_y = PAD

    # **坐标全部换算到「补白后的方形图」空间。** 漏掉 padding 会让眼睛和嘴整体
    # 偏移，眼窝切到额头上、口型浮在唇线上方。
    def to_image(point):
        return [round(float(point[0] - offset[0] + pad_x), 2),
                round(float(point[1] - offset[1] + pad_y), 2)]

    anchors = [
        to_image([EYES[0][0], EYES[0][1]]),
        to_image([EYES[1][0], EYES[1][1]]),
        to_image([MOUTH[0], MOUTH[1]]),
    ]
    contours = [
        [to_image(p) for p in ellipse_contour(*EYES[0])],
        [to_image(p) for p in ellipse_contour(*EYES[1])],
    ]
    payload = {
        "image": "data:image/png;base64," + base64.b64encode(SRC.read_bytes()).decode(),
        "name": AVATAR_NAME,
        "anchors": anchors,
        "eyeContours": contours,
    }
    done = run_pipeline(["create", PROJECT], json.dumps(payload))
    if done.returncode != 0:
        raise SystemExit(done.stdout[-1000:] + done.stderr[-2000:])

    proj = RUIC / "projects" / PROJECT
    workspace = json.loads((proj / "workspace.json").read_text(encoding="utf-8"))
    workspace["regions"] = []                      # 不切头部切片（插件不用，切了有缝）
    (proj / "workspace.json").write_text(json.dumps(workspace, ensure_ascii=False, indent=2), encoding="utf-8")

    # 嘴：按这张脸的实际嘴宽给参数。
    # 渲染器里画的嘴半宽 = halfLen × opening.width；闭嘴微笑唇线半宽 26px，
    # 所以 halfLen ≈ 26 / 0.78 ≈ 33。
    # 角度用**唇线自己的倾角**（≈ -4.6°），不用眼睛连线的倾角（这张脸眼睛连线
    # 倾角接近 -18°，那是动漫眼型的画法，不是头的倾角）。
    rig = json.loads((proj / "rig.json").read_text(encoding="utf-8"))
    mouth_x, mouth_y = to_image([MOUTH[0], MOUTH[1]])
    rig["mouth"].update({
        "cx": mouth_x, "cy": mouth_y,
        "angle": -0.08,
        "halfLen": 34.0, "bow": 2.0,
        "area": {"cx": mouth_x, "cy": mouth_y, "rx": 26.0, "ry": 12.0, "angle": 0},
        "opening": {"width": 0.78, "height": 16.0, "upperLift": 0.0, "tongue": 0.9},
    })
    rig["view"]["padTop"] = 0.04
    rig["view"]["padSide"] = 0.04
    (proj / "rig.json").write_text(json.dumps(rig, ensure_ascii=False, indent=2), encoding="utf-8")

    done = run_pipeline(["build", PROJECT])
    if done.returncode != 0:
        raise SystemExit(done.stdout[-1000:] + done.stderr[-2000:])

    # **base 自己重做。** 流水线默认的补脸（fill_skin）拿洞口周围「较亮的一半」
    # 估皮肤色，这张脸高光很亮、旁边又是深色头发，它会填出一片白雾——眨眼时
    # 整块露出来。这里改成：先用「base 与原图的差异」定位洞，再拿洞外一圈皮肤
    # 做归一化模糊填回去。
    original_rgb = np.asarray(square)[..., :3].astype(np.int16)
    base_img = Image.open(proj / "built" / "base.png").convert("RGBA")
    base_rgb = np.asarray(base_img)[..., :3].astype(np.int16)
    alpha_square = np.asarray(square)[..., 3]
    diff = np.abs(base_rgb - original_rgb).max(axis=2)
    # **蒙版要用 0/255，不能用 0/1** —— morphology 的核按灰度值卷，
    # 0/1 的蒙版做一次开运算就被整片抹掉了。
    hole = (((diff > 10) & (alpha_square > 128)).astype(np.uint8)) * 255
    hole = cv2.morphologyEx(hole, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    hole = cv2.dilate(hole, np.ones((3, 3), np.uint8))          # 补掉接缝
    # 取样环 = 洞外扩一圈、但不含洞本身（这里全是眼皮皮肤）
    ring = (cv2.dilate(hole, np.ones((25, 25), np.uint8)) > 0) & (hole == 0)
    skin_like = (np.abs(original_rgb - SKIN).max(axis=2) < 45).astype(np.float32)
    weight = ring.astype(np.float32) * skin_like
    src_f = original_rgb.astype(np.float32)
    blur_img = cv2.GaussianBlur(src_f * weight[..., None], (0, 0), 10)
    blur_w = cv2.GaussianBlur(weight, (0, 0), 10)
    fill = blur_img / np.maximum(blur_w[..., None], 1e-3)
    # 环上取不到皮肤像素的地方不要填黑：落回皮肤基色。
    fill = np.where(blur_w[..., None] > 0.02, fill, SKIN.astype(np.float32))
    repaired = np.where(hole[..., None] > 0, fill, base_rgb.astype(np.float32)).astype(np.uint8)
    Image.fromarray(np.dstack([repaired, alpha_square]), "RGBA").save(proj / "built" / "base.png")
    print("eye hole pixels =", int(hole.sum() // 255))

    # 运行时**无条件**读 built/sprites/sprites.json（少它就是一次 404），
    # 但这份立绘不用切片，清单是空的。
    sprites_dir = proj / "built" / "sprites"
    sprites_dir.mkdir(parents=True, exist_ok=True)
    (sprites_dir / "sprites.json").write_text(
        json.dumps({"layers": {}, "build": "none"}, ensure_ascii=False, indent=2), encoding="utf-8")
    # create 阶段留下的头部切片（后来 regions 被清空，它已经没人引用）
    stale = proj / "built" / "detail_head-pixels.png"
    if stale.exists():
        stale.unlink()

    # 清单：口型参数随形象走（运行时直接吃，不给用户调）。
    manifest = json.loads((proj / "avatar.json").read_text(encoding="utf-8"))
    manifest.update({
        "format": "mesh-avatar",
        "version": 1,
        "name": AVATAR_NAME,
        "source": "source/source-original.png",
        "lipSync": {
            "granularity": 0.62,
            "openness": 0.8,
            "closeSpeed": 0.66,
            "preset": "custom",
        },
    })
    (proj / "avatar.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print("anchors =", anchors, "size =", square.size)
    print("project =", proj)
    print("built =", sorted(p.name for p in (proj / "built").iterdir()))


if __name__ == "__main__":
    main()
