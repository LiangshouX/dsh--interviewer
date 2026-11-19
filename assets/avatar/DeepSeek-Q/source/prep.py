"""把这张 Q 版立绘做成可绑定的形象素材（第一步：抠图 + 裁剪 + 闭嘴）。

原图：Q 版蓝发少女全身立绘（1080×1399，白底，猫耳，开嘴大笑，胸前挂着
第三方 logo 的木牌）。作为面试官它只出现在舞台右上角那个方形小窗里，所以：

  1. 裁到**头肩**并补成正方形——渲染器按 min 比例铺图，宽图会被压到底部；
     裁到 y=735 是为了把胸前那块第三方 logo 木牌裁在框外；
  2. 白底用 grabCut 抠掉（白外套和白底同一个色系，色值阈值会把外套一起切了）；
  3. **把张开的嘴补成皮肤、画一条闭嘴的微笑唇线**——面试官要说话，口型由
     运行时的着色器画，底图上不能是张开的嘴。

眼睛都睁着（大眼动漫眼），眼轮廓给的是包住整只眼睛的椭圆。
"""
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

ART = Path(__file__).resolve().parent
SRC = ART / "source.png"
OUT = ART / "square.png"
PREVIEW = ART / "cut-preview.png"

# 裁剪（原图坐标）：头肩构图，含两只猫耳，把木牌裁在框外
CROP = (150, 0, 900, 735)          # 750×735
# 眼窝椭圆（原图坐标）：cx, cy, rx, ry
EYES = [(487, 432, 47, 44), (652, 378, 40, 42)]
# 张开的嘴（原图坐标）：椭圆 + 闭嘴的微笑唇线
MOUTH_ELLIPSE = ((591, 479), (29, 26))
SMILE = {"center_x": 591, "y": 472.0, "half_width": 26.0, "sag": 5.0, "width": 2.4,
         "color": (172, 96, 92)}
LIP_HIGHLIGHT = {"y": 481.0, "half_width": 14.0, "sag": 3.0, "width": 1.6,
                 "color": (234, 166, 160)}


def cut_background(rgb):
    """grabCut 去白底。

    白底看着最好抠，其实最难：外套、袜子都是白的，颜色阈值会把它们一起切掉。
    grabCut 用「边界像背景 + 内部像前景」的统计模型，对这种一张图一个主体的
    构图最稳。
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
    # 被前景整圈包住的洞 = 误判（白衣服中间被当成背景），补回前景
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


def main():
    original = Image.open(SRC).convert("RGB")
    full = np.asarray(original).astype(np.uint8)
    alpha_full = cut_background(full)            # 先整图抠（整身构图最完整），再裁

    offset = np.array([CROP[0], CROP[1]])
    rgb = full[CROP[1]:CROP[3], CROP[0]:CROP[2]].copy()
    alpha = alpha_full[CROP[1]:CROP[3], CROP[0]:CROP[2]].copy()

    # 1) 闭嘴：整块 inpaint（周围是脸颊皮肤）
    mouth = np.zeros(rgb.shape[:2], np.uint8)
    cv2.ellipse(mouth, (MOUTH_ELLIPSE[0][0] - offset[0], MOUTH_ELLIPSE[0][1] - offset[1]),
                MOUTH_ELLIPSE[1], 0, 0, 360, 255, -1)
    mouth = cv2.GaussianBlur(mouth, (5, 5), 1.4)
    rgb = cv2.inpaint(rgb, (mouth > 20).astype(np.uint8) * 255, 6, cv2.INPAINT_TELEA)

    # 2) 画闭嘴的微笑唇线（4 倍超采样，缩回来才不毛）
    face = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
    scale = 4
    canvas = face.resize((face.width * scale, face.height * scale), Image.LANCZOS)
    draw = ImageDraw.Draw(canvas)

    def smile(spec, alpha_value=255):
        points = []
        center_x = spec.get("center_x", SMILE["center_x"]) - offset[0]
        for index in range(41):
            t = index / 40
            x = center_x - spec["half_width"] + 2 * spec["half_width"] * t
            y = spec["y"] - offset[1] + spec["sag"] * (1 - (2 * t - 1) ** 2)
            points.append((x * scale, y * scale))
        draw.line(points, fill=tuple(spec["color"]) + (alpha_value,),
                  width=int(spec["width"] * scale), joint="curve")

    smile(SMILE)
    smile(LIP_HIGHLIGHT, alpha_value=200)
    face = canvas.resize(face.size, Image.LANCZOS)

    # 3) 补成正方形（透明留白，渲染器按正方形居中）
    side = max(face.width, face.height)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    pad_x = (side - face.width) // 2
    pad_y = (side - face.height) // 2
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

    # 抠图结果看一眼：白外套有没有被误切
    def checker(w, h, step=20):
        c = np.zeros((h, w, 3), np.uint8)
        for y in range(h):
            for x in range(w):
                v = 200 if ((x // step) + (y // step)) % 2 else 235
                c[y, x] = v
        return c

    h, w = full.shape[:2]
    comp = np.where((alpha_full[..., None] > 0), full, checker(w, h))
    Image.fromarray(comp).save(PREVIEW)

    print("square =", square.size, "pad =", (pad_x, pad_y))
    print("crop =", CROP, "->", (CROP[2] - CROP[0], CROP[3] - CROP[1]))
    print("saved", OUT)


if __name__ == "__main__":
    main()
