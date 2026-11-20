"""把这张半身像做成本插件能用的虚拟面试官形象（作者脚本，运行时不参与）。

原图：AI 生成的写实插画少女半身像（1145×1374，白底，长发，浅紫纱裙，闭嘴微笑）。
**正面平视**——上一版形象就是败在「歪头」：那张原图的眼睛连线是斜的（≈ -8.3°），
歪头会直接烙进绑定里（嘴的角度、头部椭圆都跟着斜）。这张眼睛连线只有 ≈ -4.4°，
正不正一眼看得出来，换图前先量这一条。

作为面试官它只出现在舞台右上角那个方形小窗里，所以这里做四件事：

  1. 裁到**头肩**并补成正方形——渲染器按 min 比例铺图，宽图会被压到底部；
  2. 白底用 grabCut 抠掉（浅色纱裙与白底同一色系，色值阈值会把纱裙一起切了）；
  3. 眼睛与嘴的锚点按**实测像素坐标**给死（写实眼睛小，椭圆近似够用）；
  4. 底图的眼窝自己重做——流水线默认的补脸在高光很亮的脸上会填成一片白雾，
     眨眼时非常明显（上一版 Q 版形象踩过这个坑）。

两只眼睛都是睁着的写实杏眼，嘴本来就是闭着的（不用补嘴）。
"""
import base64
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ART = Path(__file__).resolve().parent
# 包内运行时：`source/prepare.py` 与 `source/source-original.png` 并排；
# 作者工作区里则是 `source.png`。
SRC = ART / "source-original.png" if (ART / "source-original.png").exists() else ART / "source.png"
# 中间产物落在**工作目录**，不落在脚本旁边——脚本随包发布，在它旁边写文件
# 会把仓库弄脏（`square.png` 变成未跟踪文件）。
WORK = Path(os.environ.get("AVATAR_WORK_DIR", Path(tempfile.gettempdir()) / "dsh-avatar-work"))
WORK.mkdir(parents=True, exist_ok=True)
OUT = WORK / "square.png"

RUIC = Path(os.environ.get("RUIC_DIR", r"D:\Code\tmp-ruic\x\RuiC-2D-main"))
PYTHON = os.environ.get("RUIC_PYTHON", sys.executable)
AVATAR_ID = os.environ.get("AVATAR_ID", "interviewer")
AVATAR_NAME = os.environ.get("AVATAR_NAME", "沈蘅月")


def _base36(number: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while number:
        number, rest = divmod(number, 36)
        out = digits[rest] + out
    return out or "0"


def new_project_id(avatar_id: str) -> str:
    """工程目录名：形象 id + 时间戳。

    **为什么要带时间戳。** RuiC-2D 的 `create` 是 `p.mkdir()`（不带 exist_ok），
    同名工程目录还在就直接 FileExistsError 崩掉——于是「先删旧的」成了每次生成
    的固定动作。带时间戳就不撞名，跑完再把同前缀的旧工程清掉（`prune_siblings`）：
    既不用手动删，也不会越积越多。
    """
    slug = re.sub(r"[^A-Za-z0-9_-]", "-", avatar_id) or "avatar"
    return f"avatar-{slug}-{_base36(int(time.time()))}"


def prune_siblings(project_dir: Path) -> None:
    """把同前缀的旧工程清掉，只留当前这一个。

    **只清同前缀的。** 上游的样例工程 `da-fei-yu-1` 不在 `avatar-` 前缀里，
    流水线 `create` 硬依赖它（缺了会直接崩），绝不能碰。
    """
    prefix = project_dir.name.rsplit("-", 1)[0] + "-"
    for path in project_dir.parent.glob(f"{prefix}*"):
        if path.is_dir() and path.name != project_dir.name:
            shutil.rmtree(path, ignore_errors=True)

# 裁剪（原图坐标）：头肩构图，脸居中
CROP = (230, 0, 930, 700)          # 700×700
# 眼窝椭圆（原图坐标）：cx, cy, rx, ry
EYES = [(505, 367, 32, 17), (647, 356, 26, 16)]
# 嘴中心（原图坐标）
MOUTH = (585, 514)
# 皮肤基色（鼻尖与脸颊的中位色）
SKIN = np.array([240, 198, 197])


def ellipse_contour(cx, cy, rx, ry, samples=24):
    points = []
    for index in range(samples):
        angle = 2 * math.pi * index / samples
        points.append([round(float(cx + rx * math.cos(angle)), 2),
                       round(float(cy + ry * math.sin(angle)), 2)])
    return points


def cut_background(rgb):
    """grabCut 去白底。

    白底看着最好抠，其实最难：浅色纱裙、皮肤高光都是白系，色值阈值会把
    身体一起切掉。grabCut 用「边界像背景 + 内部像前景」的统计模型，对这种
    一张图一个主体的构图最稳。
    """
    h, w = rgb.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(rgb, mask, (3, 3, w - 6, h - 6), bgd, fgd, 6, cv2.GC_INIT_WITH_RECT)
    foreground = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(foreground, connectivity=8)
    keep = np.zeros_like(foreground)
    if count > 1:
        biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        keep = np.where(labels == biggest, 255, 0).astype(np.uint8)
    # 被前景整圈包住的洞 = 误判（浅色衣服中间被当成背景），补回前景
    holes = (keep == 0).astype(np.uint8)
    flood = holes.copy()
    marker = np.zeros((h + 2, w + 2), np.uint8)
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if flood[y, x] == 1:
            cv2.floodFill(flood, marker, (x, y), 2)
    outside = (flood == 2)
    alpha = np.where(outside, 0, 255).astype(np.uint8)
    # 只留最大的主体：grabCut 偶尔会在画面边缘留下一小块背景碎片
    count, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 128).astype(np.uint8), connectivity=8)
    if count > 1:
        biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        limit = stats[biggest, cv2.CC_STAT_AREA] * 0.005
        for index in range(1, count):
            if index != biggest and stats[index, cv2.CC_STAT_AREA] < limit:
                alpha[labels == index] = 0
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0.6)
    return alpha


def run_pipeline(args, data=None):
    env = {**os.environ, "PYTHONUTF8": "1"}
    return subprocess.run(
        [PYTHON, str(RUIC / "tools" / "pipeline.py"), *args], cwd=str(RUIC), input=data,
        capture_output=True, text=True, encoding="utf-8", env=env)


def main():
    original = Image.open(SRC).convert("RGB")
    full = np.asarray(original).astype(np.uint8)
    alpha_full = cut_background(full)            # 先整图抠（整身构图最完整），再裁

    offset = np.array([CROP[0], CROP[1]])
    rgb = full[CROP[1]:CROP[3], CROP[0]:CROP[2]].copy()
    alpha = alpha_full[CROP[1]:CROP[3], CROP[0]:CROP[2]].copy()

    # 1) 补成正方形（透明留白，渲染器按正方形居中）
    side = max(rgb.shape[1], rgb.shape[0])
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    pad_x = (side - rgb.shape[1]) // 2
    pad_y = (side - rgb.shape[0]) // 2
    face = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
    square.paste(face, (pad_x, pad_y), face)

    # 最后再过一遍「只留主体」：模糊之后可能又分出小碎块
    sq = np.asarray(square).copy()
    count, labels, stats, _ = cv2.connectedComponentsWithStats(
        (sq[..., 3] > 128).astype(np.uint8), connectivity=8)
    if count > 1:
        biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        limit = stats[biggest, cv2.CC_STAT_AREA] * 0.005
        for index in range(1, count):
            if index != biggest and stats[index, cv2.CC_STAT_AREA] < limit:
                sq[labels == index] = [0, 0, 0, 0]
    square = Image.fromarray(sq, "RGBA")
    square.save(OUT)

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
        "image": "data:image/png;base64," + base64.b64encode(OUT.read_bytes()).decode(),
        "name": AVATAR_NAME,
        "anchors": anchors,
        "eyeContours": contours,
    }
    # 工程目录：默认带时间戳（不撞名），显式指定时同名目录直接顶掉——
    # **两种情况都不需要人先删旧的**。
    project = os.environ.get("AVATAR_PROJECT") or new_project_id(AVATAR_ID)
    proj = RUIC / "projects" / project
    if proj.exists():
        shutil.rmtree(proj, ignore_errors=True)
    done = run_pipeline(["create", project], json.dumps(payload))
    if done.returncode != 0:
        raise SystemExit(done.stdout[-1000:] + done.stderr[-2000:])

    workspace = json.loads((proj / "workspace.json").read_text(encoding="utf-8"))
    workspace["regions"] = []                      # 不切头部切片（插件不用，切了有缝）
    (proj / "workspace.json").write_text(json.dumps(workspace, ensure_ascii=False, indent=2), encoding="utf-8")

    # 嘴：按**这张脸的实际嘴宽**给参数。
    # 渲染器里画的嘴半宽 = halfLen × opening.width，嘴张开的高度 = opening.height。
    # 这一张的嘴约 124px 宽（原图），比上一版 Q 版形象的嘴宽 2 倍多，
    # 所以 halfLen 要跟着放大，否则口型会缩成一条缝浮在唇线上。
    # 角度用**唇线自己的倾角**（≈ -4.6°），不用眼睛连线的倾角（≈ -8.3°）——
    # 后者会把嘴的右端甩到唇角外面。
    rig = json.loads((proj / "rig.json").read_text(encoding="utf-8"))
    mouth_x, mouth_y = to_image([MOUTH[0], MOUTH[1]])
    rig["mouth"].update({
        "cx": mouth_x, "cy": mouth_y,
        "angle": -0.073,
        "halfLen": 70.0, "bow": 2.0,
        "area": {"cx": mouth_x, "cy": mouth_y, "rx": 54.0, "ry": 12.0, "angle": 0},
        "opening": {"width": 0.78, "height": 24.0, "upperLift": 0.0, "tongue": 0.9},
    })
    rig["view"]["padTop"] = 0.04
    rig["view"]["padSide"] = 0.04
    (proj / "rig.json").write_text(json.dumps(rig, ensure_ascii=False, indent=2), encoding="utf-8")

    done = run_pipeline(["build", project])
    if done.returncode != 0:
        raise SystemExit(done.stdout[-1000:] + done.stderr[-2000:])

    # **base 自己重做。** 流水线的 fill_skin 拿洞口周围「较亮的一半」估皮肤色，
    # 这张脸高光很亮、旁边又是深色头发和睫毛，它会填出一片白雾——眨眼时整块
    # 露出来（上一版 Q 版形象踩过这个坑）。
    #
    # 这里不再猜洞在哪：流水线把眼睛抠掉再补 skin，**补过的地方和原图必然不同**，
    # 所以直接用「base 与原图的差异」定位洞，再拿洞外一圈皮肤做归一化模糊填回去。
    original_rgb = np.asarray(square)[..., :3].astype(np.int16)
    base_img = Image.open(proj / "built" / "base.png").convert("RGBA")
    base_rgb = np.asarray(base_img)[..., :3].astype(np.int16)
    alpha_square = np.asarray(square)[..., 3]
    diff = np.abs(base_rgb - original_rgb).max(axis=2)
    # **蒙版要用 0/255，不能用 0/1** —— morphology 的核是按灰度值卷的，
    # 0/1 的蒙版做一次开运算就被整片抹掉了（踩过：洞算出来只剩 25 像素）。
    hole = (((diff > 10) & (alpha_square > 128)).astype(np.uint8)) * 255
    hole = cv2.morphologyEx(hole, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    hole = cv2.dilate(hole, np.ones((3, 3), np.uint8))          # 补掉接缝
    # 取样环 = 洞外扩一圈、但不含洞本身（这里全是眼皮与鼻梁的皮肤）
    ring = (cv2.dilate(hole, np.ones((25, 25), np.uint8)) > 0) & (hole == 0)
    skin_like = (np.abs(original_rgb - SKIN).max(axis=2) < 60).astype(np.float32)
    weight = ring.astype(np.float32) * skin_like
    src_f = original_rgb.astype(np.float32)
    blur_img = cv2.GaussianBlur(src_f * weight[..., None], (0, 0), 10)
    blur_w = cv2.GaussianBlur(weight, (0, 0), 10)
    fill = blur_img / np.maximum(blur_w[..., None], 1e-3)
    # 环上取不到皮肤像素的地方（整圈都是睫毛）不要填黑：落回皮肤基色。
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

    # 旧的同前缀工程清掉，只留这一份（上游样例 `da-fei-yu-1` 不受影响）。
    prune_siblings(proj)

    print("anchors =", anchors, "size =", square.size)
    print("project =", proj)
    print("built =", sorted(p.name for p in (proj / "built").iterdir()))
    print("下一步：把 avatar.json / rig.json / built/ 拷进 assets/avatar/<id>/")


if __name__ == "__main__":
    main()
