#!/usr/bin/env python3
"""くじ（Qji）のアイコン・ロゴ・OGP を作る。

名前は「くじ」。英字は Qji（おくるん＝OQRN・キロっく＝kiloQ と同じ作り方で、「く」を Q にする）。
アイコンはおくるんと同じ角の丸い四角に、コーラルの赤のグラデーション。
Q はおみくじの筒（いただいた絵を 90 度回した向き）：六角の上の面（木の色・太い黒ふち）が輪、胴は左やや上へ伸びて白地に赤い枠の札、
真ん中の穴から右下へ出たみくじ棒（赤い先）が脚。アイコンは横長のロゴの Q を切り出し、上の面とみくじ棒を大きく真ん中に置いたもの（左上へ伸びる胴はアイコンの枠で切れる）。

  icon.svg・icon-32.png・apple-touch-icon.png・icon-512.png・icon-maskable-512.png … アイコン
  logo.svg … 横長のロゴ「Qji」。みくじ棒の先を j の下の曲がりが手のように受け止める（j は棒の裏側）。j・i は Jua
  ogp.png  … 共有したときの画像（1200×630）

使い方: python3 tools/icon.py（となりのおくるん（q-oqrn）の tools/brandkit.py を使う）
"""
import math
from pathlib import Path

import brandkit_path  # noqa: F401（となりのおくるん（q-oqrn）の tools/brandkit.py を読めるようにする）
from brandkit import FONT_PATH, Brand, centered, shapes_bounds

ROOT = Path(__file__).resolve().parent.parent
BRAND = Brand(light=(255, 128, 112), dark=(226, 62, 74))  # コーラルの赤
WOOD, WOOD_LIGHT, WOOD_SIDE, WOOD_SIDE2 = (226, 186, 112), (240, 210, 146), (200, 156, 84), (176, 132, 66)
RIM, HOLE, TIP, LABEL_RED, PAPER = (48, 40, 38), (120, 24, 30), (222, 44, 44), (214, 40, 48), (255, 250, 240)


def hexagon(c, r, squash=1.0, tilt=0.0, start=0):
    """六角形。squash で片方向につぶし（少し斜めから見た筒の上の面）、tilt 度だけ回す"""
    pts = []
    t = math.radians(tilt)
    for i in range(6):
        a = math.radians(start + 60 * i)
        x, y = r * math.cos(a), r * math.sin(a) * squash
        pts.append((c[0] + x * math.cos(t) - y * math.sin(t), c[1] + x * math.sin(t) + y * math.cos(t)))
    return pts


# ---- Q（側面つきのおみくじ筒＋みくじ棒）。横長のロゴの Q と、正方形のアイコンで同じ形を使う ----


def num(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def _glyph_tools():
    from fontTools.pens.boundsPen import BoundsPen
    from fontTools.ttLib import TTFont

    font = TTFont(str(FONT_PATH))
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()

    def bounds(ch):
        pen = BoundsPen(glyphs)
        glyphs[cmap[ord(ch)]].draw(pen)
        return pen.bounds

    return glyphs, cmap, bounds


def q_shapes(tip_end, h):
    """おみくじ筒の Q を brandkit の図形で。tip_end はみくじ棒の先（ロゴでは j の手のひらの上）、h は字の高さ。
    いただいたおみくじ筒の絵を 90 度回した向き：上の面（六角）が右を向き、胴は左やや上へ、みくじ棒は右下へ"""
    ang = math.radians(40)
    hole = (tip_end[0] - math.cos(ang) * 0.72 * h, tip_end[1] - math.sin(ang) * 0.72 * h)
    r = h * 0.5
    face_c = (hole[0] - math.cos(ang) * r * 0.12, hole[1] - math.sin(ang) * r * 0.12)  # 穴は面の真ん中より少し棒の向きへ
    face = hexagon(face_c, r, 1.0, -8, start=90)
    face = [(face_c[0] + (x - face_c[0]) * 0.84, y) for x, y in face]  # 少し斜めから見て、横につぶす
    depth = (-h * 0.55, -h * 0.22)  # 胴の向き（左やや上）。短め
    back = [(x + depth[0], y + depth[1]) for x, y in face]
    rim = h * 0.09
    shapes = []
    # 見える側面だけ描く：面のふちの外向きが、胴の伸びる向きと同じ側のもの
    sides = []
    for i in range(6):
        a, b = face[i], face[(i + 1) % 6]
        mx, my = (a[0] + b[0]) / 2 - face_c[0], (a[1] + b[1]) / 2 - face_c[1]
        if mx * depth[0] + my * depth[1] > 0:
            quad = [a, b, back[(i + 1) % 6], back[i]]
            area = abs(sum(quad[k][0] * quad[(k + 1) % 4][1] - quad[(k + 1) % 4][0] * quad[k][1] for k in range(4))) / 2
            sides.append((quad, area, i))
    for quad, _, n in sides:
        shapes += [
            {"t": "poly", "p": quad, "fill": WOOD_SIDE if n % 2 else WOOD_SIDE2, "body": True},
            {"t": "line", "p": quad + quad[:2], "w": rim, "fill": RIM, "body": True},
        ]
    # 札（白地に赤い枠）：いちばん大きく見える側面の真ん中に、側面の形を縮めて貼る
    big = max(sides, key=lambda s: s[1])[0]
    cx, cy = sum(x for x, _ in big) / 4, sum(y for _, y in big) / 4
    label = [(cx + (x - cx) * 0.6, cy + (y - cy) * 0.6 * 0.8) for x, y in big]
    shapes += [
        {"t": "poly", "p": label, "fill": PAPER, "body": True},
        {"t": "line", "p": label + label[:2], "w": h * 0.035, "fill": LABEL_RED, "body": True},
        # 上の面（六角）と穴
        {"t": "poly", "p": face, "fill": WOOD},
        {"t": "line", "p": face + face[:2], "w": rim, "fill": RIM},
        {"t": "circle", "c": hole, "r": h * 0.075, "fill": HOLE},
    ]
    # みくじ棒（黒いふち取り→木→赤い先）
    stick_w = h * 0.085
    tip_start = (tip_end[0] - math.cos(ang) * h * 0.24, tip_end[1] - math.sin(ang) * h * 0.24)
    shapes += [
        {"t": "line", "p": [hole, tip_end], "w": stick_w + h * 0.04, "fill": RIM},
        {"t": "line", "p": [hole, tip_end], "w": stick_w, "fill": WOOD_LIGHT},
        {"t": "line", "p": [tip_start, tip_end], "w": stick_w, "fill": TIP},
    ]
    return shapes


def transform(shapes, k, dx, dy):
    """図形を k 倍して (dx, dy) ずらす（線の太さ・半径も）"""
    move = lambda p: (p[0] * k + dx, p[1] * k + dy)  # noqa: E731
    out = []
    for sh in shapes:
        sh = dict(sh)
        if "c" in sh:
            sh["c"] = move(sh["c"])
        if "p" in sh:
            sh["p"] = [move(p) for p in sh["p"]]
        for key in ("w", "r", "h"):
            if key in sh:
                sh[key] = sh[key] * k
        out.append(sh)
    return out


def logo_parts():
    """横長のロゴの部品：字（j・i）の SVG パス、Q の図形、字の右はし、字の高さ（フォントの単位）"""
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen

    glyphs, cmap, bounds = _glyph_tools()
    top = bounds("I")[3]
    h = top - bounds("I")[1]  # 字の高さ（大文字の I）

    def glyph(ch, origin):
        pen = SVGPathPen(glyphs)
        glyphs[cmap[ord(ch)]].draw(TransformPen(pen, (1, 0, 0, -1, origin, top)))
        return pen.getCommands()

    jb, ib = bounds("j"), bounds("i")
    xi = jb[2] + h * 0.09 - ib[0]
    letters = [glyph("j", 0.0), glyph("i", xi)]
    # みくじ棒の先は、j の下の曲がり（手のひら）の上（Jua の j の内側の曲線の少し上）
    shapes = q_shapes((175, top - 30), h)
    return letters, shapes, xi + ib[2], h, top


def icon_shapes():
    """正方形のアイコン：横長のロゴの Q（側面つきの筒＋みくじ棒）を切り出す。
    上の面とみくじ棒を大きく真ん中に置き、左上へ伸びる胴（側面と札）はアイコンの枠で切れてよい"""
    _, shapes, _, _, _ = logo_parts()
    front = [sh for sh in shapes if not sh.get("body")]  # 上の面・穴・みくじ棒
    x0, y0, x1, y1 = shapes_bounds(front)
    k = 76 / max(x1 - x0, y1 - y0)
    scaled = transform(shapes, k, 0, 0)
    fx0, fy0, fx1, fy1 = shapes_bounds([sh for sh in scaled if not sh.get("body")])
    return transform(scaled, 1, 50 - (fx0 + fx1) / 2 + 3, 50 - (fy0 + fy1) / 2 + 3)  # 胴の分だけ少し右下へ


def logo_svg():
    letters, shapes, right, h, top = logo_parts()
    x0s, y0s, x1s, y1s = shapes_bounds(shapes)
    pad_x, pad_y = h * 0.5, h * 0.36
    x0, y0 = min(x0s, 0) - pad_x, min(y0s, 0) - pad_y
    width, height = max(x1s, right) + pad_x - x0, max(y1s, top + 130) + pad_y - y0
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{num(x0)} {num(y0)} {num(width)} {num(height)}" role="img" aria-label="Qji（くじ）">'
        f"<defs>{BRAND.gradient_svg(x0, y0, width, height)}</defs>"
        f'<rect x="{num(x0)}" y="{num(y0)}" width="{num(width)}" height="{num(height)}" rx="{num(h * 0.3)}" fill="url(#g)"/>'
        # 字（j・i）は裏側に。みくじ棒の先が j の下の曲がり（手のひら）に乗る
        + f'<g fill="#ffffff" stroke="url(#g)" stroke-width="{num(h * 0.05)}" stroke-linejoin="round">'
        + "".join(f'<path d="{d}"/>' for d in letters)
        + "</g>"
        + BRAND.shapes_svg(shapes)
        + "</svg>\n"
    )
    return svg, width / height


def decorate(d, s):
    """OGP の背景：うっすら紙吹雪のようなくじの紙"""
    for x, y, w, hh, a in ((1060, 90, 46, 22, 70), (1140, 320, 34, 16, 60), (980, 560, 40, 18, 60), (70, 100, 36, 16, 55), (430, 580, 30, 14, 50)):
        d.rounded_rectangle(((x - w / 2) * s, (y - hh / 2) * s, (x + w / 2) * s, (y + hh / 2) * s), radius=4 * s, fill=(255, 255, 255, a))


def main():
    shapes = icon_shapes()
    BRAND.write_icons(ROOT, shapes)
    logo, ratio = logo_svg()
    (ROOT / "logo.svg").write_text(logo, encoding="utf-8")
    BRAND.write_ogp(ROOT / "ogp.png", shapes, "くじ", "Qji", ["くじ引き・あみだ・ルーレット", "お題も罰ゲームも、ここで決まる"], decorate, copy="迷ったら、くじで決めよう")
    print(f"アイコン・logo.svg（高さ 28px なら幅 {28 * ratio:.0f}px）・ogp.png を書き出しました")


if __name__ == "__main__":
    main()
