from __future__ import annotations

import math
from pathlib import Path

from pptx import Presentation
from pptx.chart.data import ChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_DATA_LABEL_POSITION, XL_LEGEND_POSITION
from pptx.enum.dml import MSO_LINE
from pptx.enum.shapes import MSO_AUTO_SHAPE_TYPE, MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "PACECAR_EXE201_PRODUCT_DECK.pptx"
ASSET = ROOT / "docs" / "ppt_assets" / "report_media"
PUBLIC = ROOT / "client" / "public" / "images"

W, H = 13.333, 7.5
NAVY = "0B1224"
NAVY_2 = "111A3A"
INK = "0A0A0B"
BLUE = "1769FF"
BLUE_2 = "386CF5"
BLUE_3 = "91B3FF"
ICE = "EDF3FF"
WHITE = "FFFFFF"
PAGE = "F3F5F8"
MUTED = "65686F"
LINE = "D9DADD"
YELLOW = "F7B938"
GREEN = "0AA36E"
RED = "E41616"
ORANGE = "F59E0B"

FONT_HEAD = "Bahnschrift"
FONT_BODY = "Segoe UI"


def rgb(hex_value: str) -> RGBColor:
    return RGBColor.from_string(hex_value.replace("#", ""))


def set_bg(slide, color: str) -> None:
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = rgb(color)


def add_rect(slide, x, y, w, h, fill, line=None, radius=False, transparency=0):
    kind = MSO_AUTO_SHAPE_TYPE.ROUNDED_RECTANGLE if radius else MSO_AUTO_SHAPE_TYPE.RECTANGLE
    shape = slide.shapes.add_shape(kind, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = rgb(fill)
    shape.fill.transparency = transparency
    if line:
        shape.line.color.rgb = rgb(line)
        shape.line.width = Pt(0.8)
    else:
        shape.line.fill.background()
    return shape


def add_text(
    slide,
    text,
    x,
    y,
    w,
    h,
    size=18,
    color=INK,
    bold=False,
    font=FONT_BODY,
    align=PP_ALIGN.LEFT,
    valign=MSO_ANCHOR.TOP,
    margin=0,
    line_spacing=1.0,
    fit=False,
):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.clear()
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = Inches(margin)
    tf.vertical_anchor = valign
    p = tf.paragraphs[0]
    p.alignment = align
    p.line_spacing = line_spacing
    run = p.add_run()
    run.text = text
    run.font.name = font
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = rgb(color)
    if fit:
        tf.fit_text(font_family=font, max_size=size)
    return box


def add_rich_text(slide, runs, x, y, w, h, size=18, color=INK, font=FONT_BODY, align=PP_ALIGN.LEFT):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.clear()
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    p.alignment = align
    for item in runs:
        run = p.add_run()
        run.text = item.get("text", "")
        run.font.name = item.get("font", font)
        run.font.size = Pt(item.get("size", size))
        run.font.bold = item.get("bold", False)
        run.font.color.rgb = rgb(item.get("color", color))
    return box


def add_bullets(slide, items, x, y, w, h, size=15, color=INK, accent=BLUE, gap=5):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.clear()
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(gap)
        p.level = 0
        p.text = "●  " + item
        p.font.name = FONT_BODY
        p.font.size = Pt(size)
        p.font.color.rgb = rgb(color)
        p.runs[0].font.color.rgb = rgb(accent)
    return box


def add_image_cover(slide, path: Path, x, y, w, h, transparency=None):
    with Image.open(path) as im:
        iw, ih = im.size
    box_ratio = w / h
    image_ratio = iw / ih
    if image_ratio > box_ratio:
        crop = 1 - box_ratio / image_ratio
        crop_left = crop_right = crop / 2
        crop_top = crop_bottom = 0
    else:
        crop = 1 - image_ratio / box_ratio
        crop_top = crop_bottom = crop / 2
        crop_left = crop_right = 0
    pic = slide.shapes.add_picture(str(path), Inches(x), Inches(y), Inches(w), Inches(h))
    pic.crop_left, pic.crop_right = crop_left, crop_right
    pic.crop_top, pic.crop_bottom = crop_top, crop_bottom
    return pic


def add_logo(slide, x=0.55, y=0.35, dark=False):
    add_rect(slide, x, y, 0.33, 0.33, BLUE, radius=True)
    add_text(slide, "P", x, y + 0.005, 0.33, 0.29, 16, WHITE, True, FONT_HEAD, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
    add_text(slide, "PACE", x + 0.42, y - 0.005, 0.72, 0.2, 12, WHITE if dark else NAVY, True, FONT_HEAD)
    add_text(slide, "CAR", x + 0.42, y + 0.145, 0.72, 0.18, 9, BLUE, True, FONT_HEAD)


def add_header(slide, title, section=None, dark=False, page=None):
    add_logo(slide, dark=dark)
    if section:
        add_text(slide, section.upper(), 0.55, 0.9, 4.0, 0.25, 9, BLUE_3 if dark else BLUE, True, FONT_BODY)
    add_text(slide, title, 0.55, 1.18, 12.1, 0.58, 26, WHITE if dark else NAVY, True, FONT_HEAD)
    if page is not None:
        add_text(slide, f"{page:02}", 12.25, 0.38, 0.5, 0.25, 9, BLUE_3 if dark else MUTED, True, FONT_BODY, PP_ALIGN.RIGHT)


def add_footer(slide, text, dark=False):
    add_text(slide, text, 0.55, 7.16, 12.0, 0.18, 7.5, "AEB8CC" if dark else "7D8799")


def add_kpi(slide, value, label, x, y, w, color=BLUE, dark=False, suffix=None):
    bg = "121D38" if dark else WHITE
    add_rect(slide, x, y, w, 1.08, bg, "263451" if dark else LINE, radius=True)
    add_text(slide, str(value), x + 0.16, y + 0.12, w - 0.3, 0.48, 24, color, True, FONT_HEAD)
    if suffix:
        add_text(slide, suffix, x + w - 0.6, y + 0.19, 0.45, 0.25, 10, MUTED, True, FONT_BODY, PP_ALIGN.RIGHT)
    add_text(slide, label, x + 0.16, y + 0.67, w - 0.3, 0.23, 10.5, "CFD7E6" if dark else MUTED, False)


def add_pill(slide, text, x, y, w, fill=ICE, color=BLUE):
    add_rect(slide, x, y, w, 0.34, fill, None, radius=True)
    add_text(slide, text, x + 0.08, y + 0.045, w - 0.16, 0.23, 9.5, color, True, FONT_BODY, PP_ALIGN.CENTER)


def add_ring(slide, value, total, cx, cy, r, color=BLUE, track="DDE3EE", width=12):
    # Editable semicircle-like approximation built from 60 small arcs as shapes.
    segments = 60
    filled = int(round(value / total * segments))
    for i in range(segments):
        angle = 2 * math.pi * i / segments - math.pi / 2
        x = cx + math.cos(angle) * r
        y = cy + math.sin(angle) * r
        dot = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x - 0.045), Inches(y - 0.045), Inches(0.09), Inches(0.09))
        dot.fill.solid()
        dot.fill.fore_color.rgb = rgb(color if i < filled else track)
        dot.line.fill.background()


def add_donut_chart(slide, values, labels, colors, x, y, w, h, hole=68):
    data = ChartData()
    data.categories = labels
    data.add_series("Status", values)
    chart = slide.shapes.add_chart(XL_CHART_TYPE.DOUGHNUT, Inches(x), Inches(y), Inches(w), Inches(h), data).chart
    chart.has_legend = False
    chart.has_title = False
    chart.chart_style = 10
    plot = chart.plots[0]
    plot.hole_size = hole
    plot.vary_by_categories = True
    for point, color in zip(plot.series[0].points, colors):
        point.format.fill.solid()
        point.format.fill.fore_color.rgb = rgb(color)
        point.format.line.fill.background()
    return chart


def add_bar_chart(slide, categories, series, colors, x, y, w, h, max_scale=100):
    data = ChartData()
    data.categories = categories
    for name, values in series:
        data.add_series(name, values)
    chart = slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(x), Inches(y), Inches(w), Inches(h), data).chart
    chart.has_title = False
    chart.has_legend = len(series) > 1
    if chart.has_legend:
        chart.legend.position = XL_LEGEND_POSITION.BOTTOM
        chart.legend.include_in_layout = False
        chart.legend.font.size = Pt(9)
    chart.value_axis.minimum_scale = 0
    chart.value_axis.maximum_scale = max_scale
    chart.value_axis.has_major_gridlines = True
    chart.value_axis.major_gridlines.format.line.color.rgb = rgb("E5E9F0")
    chart.value_axis.tick_labels.font.size = Pt(8)
    chart.category_axis.tick_labels.font.size = Pt(8.5)
    chart.category_axis.format.line.color.rgb = rgb(LINE)
    for s, color in zip(chart.series, colors):
        s.format.fill.solid()
        s.format.fill.fore_color.rgb = rgb(color)
        s.format.line.fill.background()
    return chart


def add_process_step(slide, index, title, subtitle, x, y, w, status="done"):
    fill = BLUE if status == "done" else YELLOW if status == "active" else "D7DCE5"
    text_color = WHITE if status in {"done", "active"} else MUTED
    shape = slide.shapes.add_shape(MSO_AUTO_SHAPE_TYPE.CHEVRON, Inches(x), Inches(y), Inches(w), Inches(1.02))
    shape.fill.solid()
    shape.fill.fore_color.rgb = rgb(fill)
    shape.line.fill.background()
    add_text(slide, f"{index}", x + 0.12, y + 0.13, 0.28, 0.28, 14, text_color, True, FONT_HEAD, PP_ALIGN.CENTER)
    add_text(slide, title, x + 0.42, y + 0.14, w - 0.62, 0.28, 12, text_color, True, FONT_HEAD)
    add_text(slide, subtitle, x + 0.42, y + 0.52, w - 0.66, 0.32, 8.5, text_color, False, FONT_BODY)


def add_label_value(slide, label, value, x, y, w, dark=False):
    add_text(slide, label.upper(), x, y, w, 0.18, 8, BLUE_3 if dark else MUTED, True)
    add_text(slide, value, x, y + 0.22, w, 0.42, 15, WHITE if dark else NAVY, True, FONT_HEAD)


def add_trust_waterfall(slide, steps, x0, base_y, plot_w, unit, bar_w=0.55):
    """Waterfall bằng shape. steps = (nhãn, loại total|up|down, giá trị)."""
    slot = plot_w / len(steps)
    level = 0
    prev_top = None
    for i, (label, kind, value) in enumerate(steps):
        cx = x0 + slot * i + slot / 2
        if kind == "total":
            lo, hi, level = 0, value, value
            color = BLUE if i == 0 else ORANGE
            text = str(value)
        elif kind == "up":
            lo, hi, level = level, level + value, level + value
            color, text = GREEN, f"+{value}"
        else:
            lo, hi, level = level - value, level, level - value
            color, text = RED, f"−{value}"
        top_y = base_y - hi * unit
        height = max((hi - lo) * unit, 0.03)
        if prev_top is not None:
            add_rect(slide, cx - slot + bar_w / 2, prev_top, slot - bar_w, 0.012, "9AA3B5")
        add_rect(slide, cx - bar_w / 2, top_y, bar_w, height, color, radius=False)
        add_text(slide, text, cx - 0.4, top_y - 0.27, 0.8, 0.24, 11.5, color if kind != "total" else NAVY, True, FONT_HEAD, PP_ALIGN.CENTER)
        add_text(slide, label, cx - slot / 2 + 0.02, base_y + 0.08, slot - 0.04, 0.42, 8.5, MUTED, False, FONT_BODY, PP_ALIGN.CENTER)
        prev_top = base_y - level * unit


def build_deck() -> Presentation:
    prs = Presentation()
    prs.slide_width = Inches(W)
    prs.slide_height = Inches(H)
    blank = prs.slide_layouts[6]

    # 1 — Cover
    slide = prs.slides.add_slide(blank)
    add_image_cover(slide, PUBLIC / "home-hero.jpg", 0, 0, W, H)
    add_rect(slide, 0, 0, W, H, NAVY, transparency=18)
    add_rect(slide, 0, 0, 7.4, H, NAVY, transparency=4)
    add_logo(slide, 0.62, 0.48, dark=True)
    add_pill(slide, "EXE201 • PRODUCT DEVELOPMENT", 0.65, 1.38, 2.72, "20327B", WHITE)
    add_text(slide, "PACE CAR", 0.62, 1.95, 6.2, 0.82, 48, WHITE, True, FONT_HEAD)
    add_text(slide, "Từ MVP đến nền tảng thuê xe\nminh bạch & an toàn hơn", 0.65, 2.86, 6.1, 1.25, 28, WHITE, True, FONT_HEAD)
    add_text(slide, "Overview dự án • Validation • Feedback → cải tiến • Sản phẩm 3 cấp độ", 0.67, 4.45, 5.9, 0.72, 14, "D7E1F2")
    add_rect(slide, 0.67, 5.55, 4.96, 0.78, WHITE, None, radius=True, transparency=8)
    add_text(slide, "BẢN TRÌNH BÀY SẢN PHẨM", 0.93, 5.72, 2.7, 0.22, 9, NAVY, True)
    add_text(slide, "05.11.2026", 4.02, 5.68, 1.3, 0.27, 13, BLUE, True, FONT_HEAD, PP_ALIGN.RIGHT)
    add_footer(slide, "Nguồn: Báo cáo kỹ thuật PaceCar (04.11.2026) và tài liệu góp ý mentor.", dark=True)

    # 2 — Executive overview
    slide = prs.slides.add_slide(blank)
    set_bg(slide, PAGE)
    add_header(slide, "Dự án trong 60 giây", "01 • Overview", page=2)
    add_text(slide, "Một nền tảng kết nối — không giữ tiền — nhưng giữ lại bằng chứng, quy trình và sự minh bạch.", 0.55, 1.82, 11.8, 0.42, 16, MUTED)
    add_kpi(slide, "56", "commit • 23/09–04/11", 0.55, 2.35, 2.25, BLUE)
    add_kpi(slide, "3", "vai trò người dùng", 2.98, 2.35, 2.25, GREEN)
    add_kpi(slide, "16", "nhóm tính năng hoạt động", 5.41, 2.35, 2.25, YELLOW)
    add_kpi(slide, "20", "xe mẫu phục vụ demo", 7.84, 2.35, 2.25, BLUE_2)
    add_kpi(slide, "2", "xe công khai trên website", 10.27, 2.35, 2.25, ORANGE)
    cards = [
        ("BÀI TOÁN", "Thuê xe qua mạng xã hội thiếu minh bạch về giá, lịch trống và trách nhiệm."),
        ("GIẢI PHÁP", "Tìm xe → báo giá → hợp đồng số → giao nhận có bằng chứng → tranh chấp."),
        ("MÔ HÌNH", "Chủ xe trả hoa hồng 3–5% sau chuyến; người thuê không trả phí nền tảng."),
    ]
    for i, (title, body) in enumerate(cards):
        x = 0.55 + i * 4.08
        add_rect(slide, x, 3.78, 3.72, 2.46, WHITE, LINE, radius=True)
        add_pill(slide, title, x + 0.2, 4.02, 1.18, ICE, BLUE)
        add_text(slide, body, x + 0.2, 4.56, 3.28, 1.15, 15, NAVY, True if i == 1 else False, FONT_BODY)
        add_text(slide, ["WHY", "HOW", "VALUE"][i], x + 2.74, 5.87, 0.72, 0.22, 8, BLUE, True, FONT_BODY, PP_ALIGN.RIGHT)
    add_footer(slide, "Phiên bản hiện tại được xem là sản phẩm hoàn thiện theo phạm vi demo/EXE201; các khoảng trống production được nêu ở cuối deck.")

    # 2b — Trust Score formula
    slide = prs.slides.add_slide(blank)
    set_bg(slide, PAGE)
    add_header(slide, "Trust Score: công thức tính điểm tin cậy", "01 • Trust Score", page=3)
    add_text(slide, "Mọi tài khoản bắt đầu ở 50 điểm; hành vi thật cộng hoặc trừ điểm, kết quả luôn nằm trong thang 0–100.", 0.55, 1.82, 11.8, 0.34, 14, MUTED)

    # Công thức dạng khối
    tiles = [
        ("50", "Điểm gốc", BLUE, False),
        ("≤ 25", "Xác thực hồ sơ", GREEN, False),
        ("≤ 25", "Lịch sử giao dịch", GREEN, False),
        ("−10 … +10", "Đánh giá (Bayes)", YELLOW, False),
        ("Phạt", "Tranh chấp • hủy đơn", RED, False),
        ("0 – 100", "TRUST SCORE", WHITE, True),
    ]
    ops = ["+", "+", "+", "−", "="]
    tile_w, gap = 1.72, 0.38
    for i, (value, label, color, final) in enumerate(tiles):
        x = 0.55 + i * (tile_w + gap)
        add_rect(slide, x, 2.32, tile_w, 1.1, NAVY if final else WHITE, None if final else LINE, radius=True)
        add_rect(slide, x, 2.32, tile_w, 0.07, BLUE if final else color)
        add_text(slide, value, x, 2.55, tile_w, 0.4, 20, color if not final else WHITE, True, FONT_HEAD, PP_ALIGN.CENTER)
        add_text(slide, label, x, 3.04, tile_w, 0.25, 10.5, BLUE_3 if final else MUTED, final, FONT_BODY, PP_ALIGN.CENTER)
        if i < len(ops):
            add_text(slide, ops[i], x + tile_w, 2.58, gap, 0.4, 22, BLUE, True, FONT_HEAD, PP_ALIGN.CENTER)

    # Waterfall ví dụ
    add_rect(slide, 0.55, 3.62, 7.3, 3.4, WHITE, LINE, radius=True)
    add_text(slide, "Ví dụ: một người thuê qua từng sự kiện", 0.8, 3.78, 5.0, 0.3, 14, NAVY, True, FONT_HEAD)
    add_text(slide, "Điểm thay đổi sau mỗi bước", 0.8, 4.08, 3.5, 0.22, 9.5, MUTED)
    plot_x, plot_w, base_y, unit = 1.0, 5.75, 6.38, 0.0185
    for level, name, col in ((75, "75 • Low", GREEN), (50, "50 • Medium", ORANGE)):
        y = base_y - level * unit
        line = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(plot_x), Inches(y), Inches(plot_x + plot_w + 0.05), Inches(y))
        line.line.color.rgb = rgb(col)
        line.line.width = Pt(1)
        line.line.dash_style = MSO_LINE.DASH
        add_text(slide, name, plot_x + plot_w + 0.1, y - 0.1, 0.9, 0.2, 8.5, col, True)
    add_rect(slide, plot_x, base_y, plot_w + 0.05, 0.012, "9AA3B5")
    add_trust_waterfall(slide, [
        ("Điểm gốc", "total", 50),
        ("Xác thực\nđủ hồ sơ", "up", 25),
        ("Chuyến đầu\nhoàn tất", "up", 8),
        ("Đánh giá\n5 sao", "up", 5),
        ("Hủy đơn\nđã thanh toán", "down", 10),
        ("Tranh chấp\nlỗi vừa", "down", 20),
        ("Điểm cuối", "total", 58),
    ], plot_x, base_y, plot_w, unit)

    # Mức rủi ro
    add_rect(slide, 8.05, 3.62, 4.73, 1.62, WHITE, LINE, radius=True)
    add_text(slide, "MỨC RỦI RO TỰ ĐỘNG", 8.3, 3.78, 2.4, 0.22, 9.5, BLUE, True)
    bar_x, bar_w_, bar_y = 8.3, 4.23, 4.42
    for frac_start, frac_w, name, col in ((0, 0.50, "HIGH", RED), (0.50, 0.25, "MEDIUM", ORANGE), (0.75, 0.25, "LOW", GREEN)):
        add_rect(slide, bar_x + bar_w_ * frac_start, bar_y, bar_w_ * frac_w, 0.34, col)
        add_text(slide, name, bar_x + bar_w_ * frac_start, bar_y + 0.06, bar_w_ * frac_w, 0.22, 9, WHITE, True, FONT_BODY, PP_ALIGN.CENTER)
    for frac, tick in ((0, "0"), (0.5, "50"), (0.75, "75"), (1, "100")):
        add_text(slide, tick, bar_x + bar_w_ * frac - 0.3, bar_y + 0.38, 0.6, 0.18, 8.5, MUTED, False, FONT_BODY, PP_ALIGN.CENTER)
    mark_x = bar_x + bar_w_ * 0.58
    marker = slide.shapes.add_shape(MSO_SHAPE.FLOWCHART_MERGE, Inches(mark_x - 0.08), Inches(bar_y - 0.15), Inches(0.16), Inches(0.13))
    marker.fill.solid()
    marker.fill.fore_color.rgb = rgb(NAVY)
    marker.line.fill.background()
    add_text(slide, "Ví dụ: 58", mark_x - 0.5, bar_y - 0.37, 1.0, 0.2, 9, NAVY, True, FONT_BODY, PP_ALIGN.CENTER)
    add_text(slide, "LOW cần điểm ≥ 75 và đã xác thực • tranh chấp nghiêm trọng → HIGH ngay.", 8.3, 4.95, 4.25, 0.25, 9, MUTED)

    # Điểm cộng / trừ
    add_rect(slide, 8.05, 5.4, 4.73, 1.62, WHITE, LINE, radius=True)
    add_pill(slide, "+ CỘNG ĐIỂM", 8.25, 5.52, 1.5, "DDF5EA", GREEN)
    add_text(slide, "Chuyến đầu +5, sau đó +2\nĐặt cọc đúng hạn +1\nBiên bản giao nhận đủ +1\nTrả xe đúng giờ +1", 8.27, 5.94, 2.2, 1.0, 10, NAVY, False, FONT_BODY, line_spacing=1.12)
    add_pill(slide, "− TRỪ ĐIỂM", 10.6, 5.52, 1.5, "FDE3E3", RED)
    add_text(slide, "Người thuê hủy −5 / −10\nChủ xe hủy −8 / −15\nTranh chấp nhẹ −10\nVừa −20 • Nặng −30", 10.62, 5.94, 2.1, 1.0, 10, NAVY, False, FONT_BODY, line_spacing=1.12)
    add_footer(slide, "Nguồn: server/src/trustScore.js. Ví dụ minh họa theo quy tắc hiện hành; hủy đơn tính theo hai mức: chưa / đã thanh toán.")

    # 3 — Problem and model
    slide = prs.slides.add_slide(blank)
    set_bg(slide, NAVY)
    add_header(slide, "Chốt lại vai trò của PaceCar", "02 • Problem → Model", dark=True, page=4)
    add_text(slide, "Quyết định cốt lõi sau feedback mentor", 0.55, 1.83, 6.2, 0.33, 14, "B9C6DB")
    add_rect(slide, 0.55, 2.33, 5.72, 3.82, "111D38", "263451", radius=True)
    add_text(slide, "PACE CAR = NỀN TẢNG KẾT NỐI", 0.86, 2.66, 5.0, 0.5, 23, WHITE, True, FONT_HEAD)
    add_bullets(slide, [
        "Hợp đồng ký trực tiếp: người thuê ↔ chủ xe",
        "Cọc và tiền thuê chuyển thẳng cho chủ xe",
        "PaceCar cung cấp báo giá, hợp đồng số và bằng chứng",
        "PaceCar hỗ trợ đối chiếu tranh chấp, không sở hữu xe",
    ], 0.87, 3.4, 4.95, 1.95, 13.5, "E0E7F2", BLUE_3, 9)
    add_pill(slide, "KHÔNG GIỮ TIỀN", 0.87, 5.48, 1.7, "20327B", WHITE)
    add_pill(slide, "KHÔNG PHÍ ẨN", 2.72, 5.48, 1.52, "20327B", WHITE)
    add_pill(slide, "CÓ BẰNG CHỨNG", 4.39, 5.48, 1.6, "20327B", WHITE)
    add_text(slide, "DÒNG GIÁ TRỊ", 6.75, 2.31, 2.2, 0.3, 10, BLUE_3, True)
    flows = [
        ("NGƯỜI THUÊ", "Tìm xe\nMinh bạch chi phí", BLUE),
        ("PACE CAR", "Kết nối\nBảo vệ quy trình", YELLOW),
        ("CHỦ XE", "Tăng tỷ lệ lấp đầy\nQuản lý giao dịch", GREEN),
    ]
    for i, (title, body, color) in enumerate(flows):
        x = 6.75 + i * 2.0
        add_rect(slide, x, 2.86, 1.66, 2.0, "111D38", "263451", radius=True)
        add_rect(slide, x, 2.86, 1.66, 0.08, color)
        add_text(slide, title, x + 0.13, 3.14, 1.4, 0.3, 11, color, True, FONT_HEAD, PP_ALIGN.CENTER)
        add_text(slide, body, x + 0.13, 3.63, 1.4, 0.72, 11, "E0E7F2", False, FONT_BODY, PP_ALIGN.CENTER)
        if i < 2:
            add_text(slide, "→", x + 1.65, 3.55, 0.42, 0.4, 24, BLUE_3, True, FONT_HEAD, PP_ALIGN.CENTER)
    add_rect(slide, 6.75, 5.26, 5.66, 0.9, "172544", "263451", radius=True)
    add_rich_text(slide, [
        {"text": "Doanh thu: ", "color": "B9C6DB", "size": 12},
        {"text": "hoa hồng 5% / 4% / 3%", "color": YELLOW, "bold": True, "size": 16, "font": FONT_HEAD},
        {"text": " từ chủ xe sau khi chuyến hoàn tất.", "color": "E0E7F2", "size": 12},
    ], 7.03, 5.50, 5.08, 0.48)
    add_footer(slide, "Kết quả xử lý feedback lớn nhất: chuyển từ vai trò mơ hồ sang mô hình marketplace kết nối có quy trình bảo vệ.", dark=True)

    # 4 — MVP baseline
    slide = prs.slides.add_slide(blank)
    set_bg(slide, PAGE)
    add_header(slide, "MVP ban đầu: đã chạy trọn vòng", "03 • MVP", page=5)
    add_text(slide, "Commit đầu tiên • 23/09/2026 • 30 tệp • khoảng 15.000 dòng mã", 0.55, 1.82, 7.0, 0.32, 13, MUTED)
    add_rect(slide, 0.55, 2.28, 7.38, 4.18, WHITE, LINE, radius=True)
    add_image_cover(slide, ASSET / "01_image1.jpg", 0.74, 2.48, 6.99, 3.73)
    add_pill(slide, "MVP 23/09", 0.95, 2.68, 1.22, NAVY_2, WHITE)
    add_text(slide, "PHẠM VI MVP", 8.35, 2.28, 2.0, 0.25, 10, BLUE, True)
    add_bullets(slide, [
        "Tìm / lọc / xem chi tiết xe",
        "Báo giá và đặt xe",
        "3 vai trò với dashboard riêng",
        "Hợp đồng điện tử + giao nhận",
        "Đánh giá + tranh chấp + Trust Score",
    ], 8.35, 2.72, 4.25, 2.12, 14, NAVY, BLUE, 7)
    add_rect(slide, 8.34, 5.05, 4.25, 1.41, "FFF7E4", "F7D17A", radius=True)
    add_text(slide, "GIỚI HẠN BAN ĐẦU", 8.58, 5.28, 2.2, 0.22, 9, "98600C", True)
    add_text(slide, "Chưa thanh toán thật • chỉ có ngày, chưa có giờ • dữ liệu lưu trong 1 tệp • phí 10% đặt lên người thuê.", 8.58, 5.60, 3.75, 0.70, 12.5, NAVY)
    add_footer(slide, "Nguồn hình: giao diện MVP được chạy lại từ commit đầu tiên và chụp ngày 04/11/2026.")

    # 5 — Validation / survey
    slide = prs.slides.add_slide(blank)
    set_bg(slide, PAGE)
    add_header(slide, "Validation: nghe — đo — thử trọn hành trình", "04 • Khảo sát & bằng chứng", page=6)
    add_text(slide, "Không suy diễn “khảo sát khách hàng” khi tài liệu chưa có bộ dữ liệu định lượng riêng.", 0.55, 1.82, 11.8, 0.34, 14, RED, True)
    add_rect(slide, 0.55, 2.36, 5.25, 3.97, WHITE, LINE, radius=True)
    add_text(slide, "3 lớp bằng chứng đã có", 0.83, 2.67, 3.5, 0.35, 19, NAVY, True, FONT_HEAD)
    validations = [
        ("24", "nhóm vấn đề mentor", "Business model → vận hành thực tế"),
        ("90", "tổ hợp QA giao diện", "5 độ rộng màn hình"),
        ("01", "kịch bản end-to-end", "Hà Nội → Hải Phòng • 06:00–22:00"),
    ]
    for i, (value, label, detail) in enumerate(validations):
        y = 3.25 + i * 0.9
        add_rect(slide, 0.85, y, 0.64, 0.64, BLUE if i < 2 else YELLOW, None, radius=True)
        add_text(slide, value, 0.85, y + 0.1, 0.64, 0.31, 17, WHITE, True, FONT_HEAD, PP_ALIGN.CENTER)
        add_text(slide, label, 1.72, y - 0.01, 2.75, 0.28, 13.5, NAVY, True)
        add_text(slide, detail, 1.72, y + 0.34, 3.48, 0.25, 10.5, MUTED)
    add_text(slide, "DỮ LIỆU HÀNH VI • 03–04/11", 6.25, 2.4, 3.4, 0.25, 10, BLUE, True)
    add_kpi(slide, "356", "lượt xem trang", 6.25, 2.81, 1.9, BLUE)
    add_kpi(slide, "13", "đăng ký mới", 8.35, 2.81, 1.9, GREEN)
    add_kpi(slide, "11", "đơn trong hệ thống", 10.45, 2.81, 1.9, YELLOW)
    add_kpi(slide, "4", "đơn hoàn tất", 6.25, 4.18, 1.9, ORANGE)
    add_kpi(slide, "2", "người active / 5 phút", 8.35, 4.18, 1.9, BLUE_2)
    add_kpi(slide, "2", "xe công khai", 10.45, 4.18, 1.9, BLUE_3)
    add_rect(slide, 6.25, 5.55, 6.1, 0.78, ICE, "BFD3FF", radius=True)
    add_text(slide, "Lưu ý: số đơn gồm dữ liệu mẫu và đơn thử; lượt xem chưa tách người dùng duy nhất. Đây là tín hiệu sớm, chưa phải conversion chính thức.", 6.49, 5.77, 5.62, 0.37, 10.5, NAVY)
    add_footer(slide, "Khoảng trống cần bổ sung: khảo sát nhu cầu có mẫu, phỏng vấn chủ xe thực tế, dữ liệu khách thật tách khỏi traffic nội bộ.")

    # 6 — Six-step process
    slide = prs.slides.add_slide(blank)
    set_bg(slide, WHITE)
    add_header(slide, "Quy trình phát triển sản phẩm trong 6 bước", "05 • Product Development", page=7)
    add_text(slide, "Mỗi vòng feedback được biến thành quyết định sản phẩm, mã nguồn, kiểm thử và bản deploy tiếp theo.", 0.55, 1.82, 11.7, 0.34, 14, MUTED)
    step_w = 2.07
    steps = [
        ("Ideation", "24 nhóm vấn đề\nmentor + QA"),
        ("Product definition", "Chốt mô hình\nkết nối"),
        ("Prototyping", "MVP trọn vòng\n23/09"),
        ("Detailed design", "Figma + chính sách\ngiá / giờ / cọc"),
        ("Validation", "QA 90 tổ hợp\nE2E + Lighthouse"),
        ("Commercialization", "Deploy Render\nhoa hồng 3–5%"),
    ]
    for i, (title, subtitle) in enumerate(steps):
        add_process_step(slide, i + 1, title, subtitle, 0.42 + i * 2.08, 2.6, step_w, "active" if i == 5 else "done")
    labels = [
        ("DISCOVERY", 0.55, 3.94, 3.82),
        ("PRODUCT DEVELOPMENT", 4.54, 3.94, 5.82),
        ("LAUNCH", 10.53, 3.94, 2.0),
    ]
    for text_, x, y, w in labels:
        add_rect(slide, x, y, w, 0.08, BLUE if text_ != "LAUNCH" else YELLOW)
        add_text(slide, text_, x, y + 0.15, w, 0.22, 9, BLUE if text_ != "LAUNCH" else "98600C", True, FONT_BODY, PP_ALIGN.CENTER)
    add_rect(slide, 0.55, 4.72, 12.0, 1.36, PAGE, LINE, radius=True)
    add_text(slide, "KẾT QUẢ", 0.82, 4.98, 0.95, 0.22, 9, BLUE, True)
    outcomes = [
        ("01", "Mô hình kinh doanh rõ"),
        ("02", "UX tìm xe rõ hơn"),
        ("03", "Pricing minh bạch"),
        ("04", "Vận hành có bằng chứng"),
        ("05", "Demo được deploy"),
    ]
    for i, (n, label) in enumerate(outcomes):
        x = 1.75 + i * 2.12
        add_text(slide, n, x, 4.93, 0.38, 0.28, 14, BLUE, True, FONT_HEAD)
        add_text(slide, label, x, 5.32, 1.72, 0.44, 10.5, NAVY, True)
    add_footer(slide, "Màu vàng = giai đoạn đang chuyển từ demo sang kiểm chứng thương mại thực tế.")

    # 7 — Feedback matrix
    slide = prs.slides.add_slide(blank)
    set_bg(slide, PAGE)
    add_header(slide, "Feedback mentor → backlog → cải tiến", "06 • Feedback Loop", page=8)
    add_text(slide, "13 nhóm feedback rút gọn trong báo cáo kỹ thuật", 0.55, 1.82, 5.5, 0.34, 14, MUTED)
    add_donut_chart(slide, [9, 1, 3], ["Đã xử lý", "Một phần", "Chưa xử lý"], [GREEN, YELLOW, RED], 0.55, 2.25, 3.5, 3.5)
    add_text(slide, "69%", 1.55, 3.31, 1.5, 0.55, 26, NAVY, True, FONT_HEAD, PP_ALIGN.CENTER)
    add_text(slide, "đã xử lý", 1.55, 3.86, 1.5, 0.28, 11, MUTED, True, FONT_BODY, PP_ALIGN.CENTER)
    legends = [(GREEN, "9 • Đã xử lý"), (YELLOW, "1 • Một phần"), (RED, "3 • Chưa xử lý")]
    for i, (color, text_) in enumerate(legends):
        add_rect(slide, 0.82, 5.65 + i * 0.33, 0.13, 0.13, color, radius=True)
        add_text(slide, text_, 1.03, 5.58 + i * 0.33, 1.85, 0.22, 9.5, NAVY)
    add_text(slide, "MASTER LIST 6 NHÓM", 4.42, 2.28, 3.0, 0.24, 10, BLUE, True)
    rows = [
        ("01", "Business Model", "Chốt mô hình + hoa hồng", GREEN),
        ("02", "Contract & Responsibility", "Hợp đồng số; hủy xe còn thiếu", YELLOW),
        ("03", "Website UX", "Giờ, địa điểm, availability", GREEN),
        ("04", "Pricing", "Báo giá tách khoản, đầy–đầy", GREEN),
        ("05", "Operation", "Giao nhận + tranh chấp; ảnh còn lỗi", YELLOW),
        ("06", "Real-world Validation", "Chưa làm với đơn vị thuê xe thật", RED),
    ]
    for i, (num, title, desc, color) in enumerate(rows):
        y = 2.72 + i * 0.62
        add_rect(slide, 4.42, y, 7.95, 0.5, WHITE, LINE, radius=True)
        add_text(slide, num, 4.61, y + 0.11, 0.32, 0.2, 10, color, True, FONT_HEAD)
        add_text(slide, title, 5.08, y + 0.09, 2.55, 0.23, 11.5, NAVY, True)
        add_text(slide, desc, 7.72, y + 0.1, 3.86, 0.23, 10.5, MUTED)
        add_rect(slide, 11.86, y + 0.16, 0.18, 0.18, color, radius=True)
    add_footer(slide, "Phân loại trạng thái được tổng hợp trực tiếp từ Bảng 2.1 của báo cáo kỹ thuật.")

    # 8 — Before after
    slide = prs.slides.add_slide(blank)
    set_bg(slide, NAVY)
    add_header(slide, "Trước & sau: không chỉ đổi giao diện", "07 • Product Evolution", dark=True, page=9)
    add_text(slide, "Từ demo nhiều giả định → sản phẩm có chính sách, bằng chứng và vận hành rõ hơn.", 0.55, 1.82, 11.8, 0.34, 14, "B9C6DB")
    add_rect(slide, 0.55, 2.33, 5.83, 3.32, WHITE, None, radius=True)
    add_image_cover(slide, ASSET / "01_image1.jpg", 0.72, 2.5, 5.49, 3.0)
    add_pill(slide, "TRƯỚC • MVP", 0.94, 2.72, 1.33, NAVY_2, WHITE)
    add_rect(slide, 6.95, 2.33, 5.83, 3.32, WHITE, None, radius=True)
    add_image_cover(slide, ASSET / "22_image22.jpg", 7.12, 2.5, 5.49, 3.0)
    add_pill(slide, "SAU • 04/11", 7.34, 2.72, 1.33, BLUE, WHITE)
    add_text(slide, "→", 6.38, 3.64, 0.57, 0.5, 32, YELLOW, True, FONT_HEAD, PP_ALIGN.CENTER)
    improvements = [
        ("Ngày", "Ngày + giờ"),
        ("10 xe mẫu", "20 xe mẫu"),
        ("Phí 10% từ khách", "Hoa hồng 3–5% từ chủ xe"),
        ("Tệp máy chủ", "PostgreSQL"),
    ]
    for i, (before, after) in enumerate(improvements):
        x = 0.55 + i * 3.05
        add_text(slide, before, x, 5.94, 2.72, 0.22, 9.5, "8994A7", False, FONT_BODY, PP_ALIGN.CENTER)
        add_text(slide, after, x, 6.27, 2.72, 0.5, 13.5, WHITE, True, FONT_HEAD, PP_ALIGN.CENTER)
    add_footer(slide, "Các thay đổi chính: search rõ nghĩa, giờ nhận/trả, pricing, QR, hợp đồng, giao nhận, tranh chấp, admin analytics.", dark=True)

    # 9 — Customer journey
    slide = prs.slides.add_slide(blank)
    set_bg(slide, WHITE)
    add_header(slide, "Customer Journey sau cải tiến", "08 • End-to-End Flow", page=10)
    add_text(slide, "Một luồng thống nhất từ ý định thuê xe đến hoàn tất và đánh giá.", 0.55, 1.82, 11.8, 0.34, 14, MUTED)
    journey = [
        ("01", "TÌM", "Khu vực • ngày giờ"),
        ("02", "LỌC", "Xe còn trống"),
        ("03", "BÁO GIÁ", "Tách từng khoản"),
        ("04", "YÊU CẦU", "2 xác nhận"),
        ("05", "CỌC", "QR → chủ xe"),
        ("06", "KÝ", "Hợp đồng số"),
        ("07", "GIAO/TRẢ", "Ảnh • xăng • km"),
        ("08", "KẾT THÚC", "Đánh giá / tranh chấp"),
    ]
    for i, (num, title, desc) in enumerate(journey):
        row, col = divmod(i, 4)
        x = 0.55 + col * 3.08
        y = 2.38 + row * 1.67
        add_rect(slide, x, y, 2.7, 1.28, ICE if row == 0 else PAGE, "BFD3FF" if row == 0 else LINE, radius=True)
        add_rect(slide, x + 0.17, y + 0.19, 0.5, 0.5, BLUE if row == 0 else NAVY_2, None, radius=True)
        add_text(slide, num, x + 0.17, y + 0.29, 0.5, 0.22, 12, WHITE, True, FONT_HEAD, PP_ALIGN.CENTER)
        add_text(slide, title, x + 0.84, y + 0.18, 1.58, 0.28, 13, NAVY, True, FONT_HEAD)
        add_text(slide, desc, x + 0.84, y + 0.59, 1.55, 0.38, 10.5, MUTED)
        if col < 3:
            add_text(slide, "→", x + 2.71, y + 0.43, 0.37, 0.3, 17, BLUE_3, True, FONT_HEAD, PP_ALIGN.CENTER)
    add_rect(slide, 0.55, 5.88, 11.95, 0.55, NAVY, None, radius=True)
    add_text(slide, "Điểm khác biệt: dữ liệu giao dịch và bằng chứng luôn ở lại nền tảng — đây là lý do hai bên tiếp tục dùng PaceCar.", 0.83, 6.04, 11.4, 0.25, 11.5, WHITE, True, FONT_BODY, PP_ALIGN.CENTER)
    add_footer(slide, "Quy trình thực tế gồm 8 bước; các trạng thái được lưu vào dashboard của người thuê, chủ xe và quản trị viên.")

    # 10 — 3 product levels
    slide = prs.slides.add_slide(blank)
    set_bg(slide, PAGE)
    add_header(slide, "Sản phẩm hoàn thiện theo 3 cấp độ", "09 • Product Levels", page=11)
    add_text(slide, "Không chỉ là website: sản phẩm gồm nhu cầu cốt lõi, trải nghiệm thực tế và lớp giá trị gia tăng.", 0.55, 1.82, 11.8, 0.34, 14, MUTED)
    levels = [
        ("01", "CORE PRODUCT", "Kết nối thuê xe minh bạch", "Xe đúng lịch • tổng chi phí rõ", NAVY, ASSET / "11_image11.jpg"),
        ("02", "ACTUAL PRODUCT", "Website dùng được đa thiết bị", "Tìm / lọc / đặt • QR • hợp đồng", BLUE, ASSET / "25_image25.jpg"),
        ("03", "AUGMENTED PRODUCT", "Yên tâm hơn ngoài việc thuê xe", "Trust Score • bằng chứng • tranh chấp", YELLOW, ASSET / "20_image20.jpg"),
    ]
    widths = [7.1, 9.25, 11.4]
    x0 = [3.1, 2.03, 0.95]
    y0 = [2.53, 3.72, 4.91]
    for i, ((num, title, headline, details, color, image_path), x, y, w) in enumerate(zip(levels, x0, y0, widths)):
        add_rect(slide, x, y, w, 0.97, WHITE, color, radius=True)
        add_rect(slide, x, y, 0.72, 0.97, color, None, radius=True)
        add_text(slide, num, x, y + 0.28, 0.72, 0.3, 16, WHITE if i < 2 else NAVY, True, FONT_HEAD, PP_ALIGN.CENTER)
        add_text(slide, title, x + 0.96, y + 0.14, 2.0, 0.25, 10, color, True)
        add_text(slide, headline, x + 0.96, y + 0.47, 3.28, 0.3, 14, NAVY, True, FONT_HEAD)
        add_text(slide, details, x + 4.25, y + 0.33, w - 6.05, 0.34, 9.5, MUTED, False, FONT_BODY, PP_ALIGN.RIGHT)
        add_rect(slide, x + w - 1.48, y + 0.12, 1.27, 0.73, PAGE, LINE, radius=True)
        add_image_cover(slide, image_path, x + w - 1.43, y + 0.17, 1.17, 0.63)
    add_text(slide, "CÀNG LÊN CAO → CÀNG KHÓ BỊ THAY THẾ BỞI GIAO DỊCH NGOÀI NỀN TẢNG", 2.18, 6.28, 9.0, 0.3, 10, BLUE, True, FONT_BODY, PP_ALIGN.CENTER)
    add_footer(slide, "Phân loại theo Core / Actual / Augmented Product từ Mục 3.2 của báo cáo kỹ thuật.")

    # 11 — Product today feature map
    slide = prs.slides.add_slide(blank)
    set_bg(slide, NAVY)
    add_header(slide, "Sản phẩm hiện tại: 16 nhóm tính năng", "10 • Product Scope", dark=True, page=12)
    add_text(slide, "Bốn cụm năng lực tạo thành một vòng vận hành khép kín.", 0.55, 1.82, 11.8, 0.34, 14, "B9C6DB")
    groups = [
        ("DISCOVERY", "01", ["Tìm xe theo lịch", "Lọc & sắp xếp", "Chi tiết + Trust Score"], BLUE),
        ("TRANSACTION", "02", ["Báo giá 15 phút", "Yêu cầu thuê", "QR cọc & tiền thuê", "Hợp đồng điện tử"], GREEN),
        ("OPERATION", "03", ["Giao nhận có ảnh", "Hoàn cọc & đánh giá", "Tranh chấp & phản ánh", "Thông báo / nhật ký"], YELLOW),
        ("PLATFORM", "04", ["Quản lý xe", "Hoa hồng 3–5%", "Admin & analytics", "Yêu thích"], BLUE_3),
    ]
    for i, (title, num, items, color) in enumerate(groups):
        x = 0.55 + i * 3.08
        add_rect(slide, x, 2.38, 2.72, 3.64, "111D38", "263451", radius=True)
        add_rect(slide, x, 2.38, 2.72, 0.08, color)
        add_text(slide, num, x + 0.22, 2.66, 0.5, 0.35, 18, color, True, FONT_HEAD)
        add_text(slide, title, x + 0.78, 2.7, 1.67, 0.28, 12.5, WHITE, True, FONT_HEAD)
        for j, item in enumerate(items):
            y = 3.35 + j * 0.58
            add_rect(slide, x + 0.23, y + 0.07, 0.17, 0.17, color, radius=True)
            add_text(slide, item, x + 0.51, y, 1.94, 0.34, 10.5, "DFE6F1")
        add_text(slide, f"{len(items)} tính năng", x + 0.22, 5.58, 2.2, 0.24, 9, color, True)
    add_rect(slide, 0.55, 6.25, 11.95, 0.47, "172544", "263451", radius=True)
    add_text(slide, "3 vai trò xuyên suốt: NGƯỜI THUÊ  •  CHỦ XE  •  QUẢN TRỊ VIÊN", 0.85, 6.38, 11.34, 0.22, 11, WHITE, True, FONT_BODY, PP_ALIGN.CENTER)
    add_footer(slide, "Nguồn: Bảng 3.1 — Tính năng đang hoạt động.", dark=True)

    # 12 — Architecture and delivery
    slide = prs.slides.add_slide(blank)
    set_bg(slide, WHITE)
    add_header(slide, "Nền tảng kỹ thuật & cách phát hành", "11 • Technical Overview", page=13)
    add_text(slide, "Một stack đủ gọn cho MVP, nhưng đã có đường nâng cấp cho dữ liệu và tự động hóa.", 0.55, 1.82, 11.8, 0.34, 14, MUTED)
    layers = [
        ("CLIENT", "React • Vite • Tailwind", 0.65, BLUE),
        ("API", "Node.js • Express", 3.28, GREEN),
        ("DATA", "PostgreSQL • ảnh trong DB", 5.91, YELLOW),
        ("PAYMENT", "VietQR / SePay", 8.54, ORANGE),
        ("DELIVERY", "GitHub → Render", 11.17, BLUE_2),
    ]
    for i, (title, body, x, color) in enumerate(layers):
        add_rect(slide, x, 2.55, 1.75, 1.55, PAGE, LINE, radius=True)
        add_rect(slide, x, 2.55, 1.75, 0.08, color)
        add_text(slide, title, x + 0.13, 2.84, 1.49, 0.26, 11, color, True, FONT_HEAD, PP_ALIGN.CENTER)
        add_text(slide, body, x + 0.15, 3.3, 1.45, 0.44, 10.5, NAVY, True, FONT_BODY, PP_ALIGN.CENTER)
        if i < 4:
            add_text(slide, "→", x + 1.82, 3.11, 0.8, 0.35, 20, BLUE_3, True, FONT_HEAD, PP_ALIGN.CENTER)
    add_text(slide, "DELIVERY LOOP", 0.65, 4.64, 2.0, 0.26, 10, BLUE, True)
    loop = [
        ("CODE", "56 commit"),
        ("TEST", "Playwright • Lighthouse"),
        ("BUILD", "Vite production build"),
        ("DEPLOY", "Render auto deploy"),
        ("MONITOR", "Health check + analytics"),
    ]
    for i, (title, body) in enumerate(loop):
        x = 0.65 + i * 2.43
        add_rect(slide, x, 5.08, 2.12, 0.94, ICE if i % 2 == 0 else PAGE, LINE, radius=True)
        add_text(slide, f"{i+1:02}  {title}", x + 0.16, 5.28, 1.8, 0.23, 11, NAVY, True, FONT_HEAD)
        add_text(slide, body, x + 0.16, 5.61, 1.8, 0.2, 9.5, MUTED)
    add_footer(slide, "Bản MVP lưu dữ liệu trong tệp; bản sau đã hỗ trợ PostgreSQL và lưu ảnh bền vững hơn.")

    # 13 — QA and performance
    slide = prs.slides.add_slide(blank)
    set_bg(slide, PAGE)
    add_header(slide, "QA: chức năng ổn, mobile còn điểm nghẽn", "12 • Quality & Performance", page=14)
    add_donut_chart(slide, [9, 2], ["Đạt", "Không đạt"], [GREEN, RED], 0.55, 2.05, 3.1, 3.1)
    add_text(slide, "9/11", 1.34, 3.02, 1.5, 0.48, 25, NAVY, True, FONT_HEAD, PP_ALIGN.CENTER)
    add_text(slide, "hạng mục đạt", 1.34, 3.51, 1.5, 0.28, 10.5, MUTED, True, FONT_BODY, PP_ALIGN.CENTER)
    add_text(slide, "FUNCTIONAL TEST", 0.88, 5.35, 2.3, 0.24, 9, BLUE, True, FONT_BODY, PP_ALIGN.CENTER)
    add_bar_chart(slide, ["Hiệu suất", "Tiếp cận", "Best practice", "SEO"], [("Mobile", [76, 97, 100, 92]), ("Desktop", [94, 97, 96, 92])], [BLUE, NAVY_2], 3.65, 2.3, 5.25, 3.42, 100)
    add_text(slide, "Lighthouse /100", 5.35, 5.77, 1.9, 0.22, 9, MUTED, False, FONT_BODY, PP_ALIGN.CENTER)
    add_rect(slide, 9.33, 2.28, 3.2, 3.78, WHITE, LINE, radius=True)
    add_text(slide, "MOBILE BOTTLENECK", 9.62, 2.58, 2.64, 0.25, 10, RED, True)
    add_label_value(slide, "LCP", "5,9 giây", 9.62, 3.05, 1.25)
    add_label_value(slide, "Dung lượng", "8,5 MB", 11.05, 3.05, 1.2)
    add_text(slide, "Nguyên nhân chính", 9.62, 4.02, 2.3, 0.22, 10, MUTED, True)
    add_bullets(slide, ["4 ảnh PNG lớn", "Ảnh bằng chứng chưa hiển thị", "Ảnh BMW 330i lỗi 404"], 9.62, 4.38, 2.45, 1.25, 11, NAVY, RED, 6)
    add_pill(slide, "ƯU TIÊN: NÉN ẢNH", 9.62, 5.58, 2.32, "FDECEC", RED)
    add_footer(slide, "Đợt test 04/11/2026: website thật (read-only), bản chạy thử end-to-end và 2/2 bộ test tự động.")

    # 14 — Today / completion montage
    slide = prs.slides.add_slide(blank)
    set_bg(slide, NAVY)
    add_header(slide, "Sản phẩm đã vượt khỏi một website tìm xe", "13 • Product in Action", dark=True, page=15)
    add_text(slide, "Các module mới biến trải nghiệm thành một hệ thống vận hành có kiểm soát.", 0.55, 1.82, 11.8, 0.34, 14, "B9C6DB")
    montage = [
        (ASSET / "18_image18.jpg", "QR CỌC"),
        (ASSET / "20_image20.jpg", "TRANH CHẤP"),
        (ASSET / "21_image21.jpg", "QUẢN LÝ XE"),
        (ASSET / "29_image29.jpg", "ADMIN"),
    ]
    for i, (path, label) in enumerate(montage):
        x = 0.55 + i * 3.05
        add_rect(slide, x, 2.36, 2.72, 3.31, WHITE, None, radius=True)
        add_image_cover(slide, path, x + 0.12, 2.48, 2.48, 2.78)
        add_pill(slide, label, x + 0.43, 5.36, 1.86, BLUE if i != 1 else YELLOW, WHITE if i != 1 else NAVY)
    add_rect(slide, 0.55, 5.95, 11.95, 0.62, "172544", "263451", radius=True)
    add_text(slide, "Báo giá minh bạch  •  QR trực tiếp  •  Hợp đồng số  •  Giao nhận  •  Tranh chấp  •  Analytics", 0.8, 6.14, 11.45, 0.25, 11, WHITE, True, FONT_BODY, PP_ALIGN.CENTER)
    add_footer(slide, "Ảnh chụp từ phiên bản hiện tại trong báo cáo kỹ thuật.", dark=True)

    # 15 — Gaps and roadmap
    slide = prs.slides.add_slide(blank)
    set_bg(slide, WHITE)
    add_header(slide, "Hoàn thiện theo EXE201 — chưa phải production-ready", "14 • Risks & Next Steps", page=16)
    add_text(slide, "Ưu tiên theo tác động đến niềm tin và khả năng vận hành với khách thật.", 0.55, 1.82, 11.8, 0.34, 14, MUTED)
    priorities = [
        ("P0", "Bảo mật & dữ liệu", "Đổi tài khoản admin mẫu • sửa ảnh bằng chứng • backup DB", RED),
        ("P1", "Tốc độ & thanh toán", "Nén ảnh • webhook ngân hàng • bật xác minh email", ORANGE),
        ("P2", "Vận hành thực tế", "Chủ xe hủy • xe thay thế • giao dịch ngoài nền tảng", YELLOW),
        ("P3", "Validation thị trường", "Phỏng vấn đơn vị thuê xe • pilot khách thật • đo conversion", BLUE),
    ]
    for i, (p, title, desc, color) in enumerate(priorities):
        y = 2.38 + i * 0.96
        add_rect(slide, 0.55, y, 7.38, 0.72, PAGE, LINE, radius=True)
        add_rect(slide, 0.55, y, 0.77, 0.72, color, None, radius=True)
        add_text(slide, p, 0.55, y + 0.2, 0.77, 0.26, 13, WHITE if i != 2 else NAVY, True, FONT_HEAD, PP_ALIGN.CENTER)
        add_text(slide, title, 1.57, y + 0.11, 2.2, 0.25, 13, NAVY, True, FONT_HEAD)
        add_text(slide, desc, 3.87, y + 0.13, 3.75, 0.36, 10.5, MUTED)
    add_rect(slide, 8.37, 2.38, 4.16, 3.61, NAVY, None, radius=True)
    add_text(slide, "MỤC TIÊU VÒNG TIẾP THEO", 8.71, 2.72, 3.45, 0.28, 11, BLUE_3, True)
    add_text(slide, "Từ “demo chạy được”\nđến “dịch vụ đáng tin”", 8.71, 3.22, 3.36, 0.92, 24, WHITE, True, FONT_HEAD)
    add_bullets(slide, ["Có người dùng thật", "Có đối tác chủ xe thật", "Có dữ liệu conversion sạch"], 8.72, 4.44, 3.2, 1.05, 12.5, "E0E7F2", YELLOW, 7)
    add_footer(slide, "Kết luận có chủ đích: sản phẩm đã hoàn thiện theo scope học phần, nhưng còn 4 lớp việc trước khi mở rộng thương mại.")

    # 16 — Visual evidence for three product levels
    slide = prs.slides.add_slide(blank)
    set_bg(slide, PAGE)
    add_header(slide, "Ví dụ trực quan cho 3 cấp độ sản phẩm", "15 • Visual Evidence", page=17)
    add_text(slide, "Mỗi cấp độ được minh họa bằng một màn hình đang có trong phiên bản hiện tại.", 0.55, 1.82, 11.8, 0.34, 14, MUTED)
    evidence_levels = [
        ("CORE PRODUCT", "Báo giá minh bạch", "Khách biết giá thuê, phụ phí, giảm giá và tiền cọc trước khi gửi yêu cầu.", ASSET / "11_image11.jpg", NAVY),
        ("ACTUAL PRODUCT", "Trải nghiệm đa thiết bị", "Tìm xe, lọc và đặt xe hoạt động trên cả màn hình máy tính và điện thoại.", ASSET / "25_image25.jpg", BLUE),
        ("AUGMENTED PRODUCT", "Hỗ trợ tranh chấp", "Quy trình tiếp nhận, đối chiếu bằng chứng và cập nhật quyết định ngay trong tài khoản.", ASSET / "20_image20.jpg", YELLOW),
    ]
    for i, (level, title, desc, path, color) in enumerate(evidence_levels):
        x = 0.55 + i * 4.08
        add_rect(slide, x, 2.36, 3.72, 3.98, WHITE, color, radius=True)
        add_image_cover(slide, path, x + 0.16, 2.53, 3.40, 1.91)
        add_pill(slide, level, x + 0.25, 4.60, 1.78, color, WHITE if i < 2 else NAVY)
        add_text(slide, title, x + 0.25, 5.08, 3.18, 0.34, 16, NAVY, True, FONT_HEAD)
        add_text(slide, desc, x + 0.25, 5.52, 3.18, 0.58, 10.5, MUTED)
    add_footer(slide, "Nguồn ảnh: các ảnh chụp màn hình đã nhúng trong BAO_CAO_KY_THUAT_PACECAR.docx.")

    # 17 — Before/after visual proof
    slide = prs.slides.add_slide(blank)
    set_bg(slide, NAVY)
    add_header(slide, "Feedback đã thay đổi sản phẩm như thế nào?", "16 • Before / After", dark=True, page=18)
    add_text(slide, "Ba ví dụ cùng màn hình, cùng ngữ cảnh — nhìn thấy rõ thay đổi thay vì chỉ đọc mô tả.", 0.55, 1.82, 11.8, 0.34, 14, "B9C6DB")
    comparisons = [
        ("TÌM XE", ASSET / "06_image6.jpg", ASSET / "07_image7.jpg", "Thêm điểm đến, ngày + giờ và thông báo lỗi rõ."),
        ("BÁO GIÁ", ASSET / "10_image10.jpg", ASSET / "11_image11.jpg", "Tách khoản phí, cọc và điều kiện thuê."),
        ("GỬI YÊU CẦU", ASSET / "12_image12.jpg", ASSET / "13_image13.jpg", "Hai xác nhận chủ động trước khi kết nối."),
    ]
    for i, (title, before, after, desc) in enumerate(comparisons):
        x = 0.55 + i * 4.08
        add_text(slide, title, x, 2.30, 3.72, 0.28, 12, BLUE_3, True, FONT_HEAD, PP_ALIGN.CENTER)
        add_rect(slide, x, 2.71, 3.72, 1.57, WHITE, None, radius=True)
        add_image_cover(slide, before, x + 0.10, 2.81, 3.52, 1.37)
        add_pill(slide, "TRƯỚC", x + 0.17, 2.88, 0.75, NAVY_2, WHITE)
        add_text(slide, "↓", x + 1.55, 4.30, 0.62, 0.38, 20, YELLOW, True, FONT_HEAD, PP_ALIGN.CENTER)
        add_rect(slide, x, 4.73, 3.72, 1.57, WHITE, None, radius=True)
        add_image_cover(slide, after, x + 0.10, 4.83, 3.52, 1.37)
        add_pill(slide, "SAU", x + 0.17, 4.90, 0.75, BLUE, WHITE)
        add_text(slide, desc, x + 0.12, 6.45, 3.48, 0.38, 9.5, "D7E1F2", False, FONT_BODY, PP_ALIGN.CENTER)
    add_footer(slide, "Minh chứng trước–sau lấy từ các cặp ảnh ở Mục 2.4 của báo cáo kỹ thuật.", dark=True)

    # 18 — End-to-end screens
    slide = prs.slides.add_slide(blank)
    set_bg(slide, WHITE)
    add_header(slide, "Một hành trình thuê xe qua 4 màn hình", "17 • End-to-End Evidence", page=19)
    add_text(slide, "Ảnh giao diện cho thấy các bước chính đã được nối thành một quy trình sử dụng được.", 0.55, 1.82, 11.8, 0.34, 14, MUTED)
    journey_evidence = [
        ("01", "TÌM XE", "Chọn khu vực, điểm đến, ngày và giờ", ASSET / "07_image7.jpg", BLUE),
        ("02", "XEM BÁO GIÁ", "Giá thuê, phụ phí và tiền cọc", ASSET / "11_image11.jpg", GREEN),
        ("03", "CHUYỂN CỌC", "QR đúng số tiền và nội dung", ASSET / "18_image18.jpg", YELLOW),
        ("04", "GIAO / TRẢ XE", "Ảnh, nhiên liệu và số km", ASSET / "37_image37.jpg", ORANGE),
    ]
    for i, (num, title, desc, path, color) in enumerate(journey_evidence):
        x = 0.55 + i * 3.08
        add_rect(slide, x, 2.46, 2.72, 3.72, PAGE, LINE, radius=True)
        add_image_cover(slide, path, x + 0.12, 2.58, 2.48, 1.72)
        add_rect(slide, x + 0.18, 4.51, 0.48, 0.48, color, None, radius=True)
        add_text(slide, num, x + 0.18, 4.61, 0.48, 0.22, 12, WHITE if i != 2 else NAVY, True, FONT_HEAD, PP_ALIGN.CENTER)
        add_text(slide, title, x + 0.80, 4.53, 1.62, 0.28, 12, NAVY, True, FONT_HEAD)
        add_text(slide, desc, x + 0.20, 5.22, 2.30, 0.48, 10.5, MUTED, False, FONT_BODY, PP_ALIGN.CENTER)
        if i < 3:
            add_text(slide, "→", x + 2.72, 3.30, 0.36, 0.38, 18, BLUE_3, True, FONT_HEAD, PP_ALIGN.CENTER)
    add_footer(slide, "Luồng đầy đủ tiếp tục với ký hợp đồng, thanh toán tiền thuê, hoàn tất chuyến, hoa hồng và tranh chấp.")

    # 19 — Closing
    slide = prs.slides.add_slide(blank)
    add_image_cover(slide, PUBLIC / "home-hero.jpg", 0, 0, W, H)
    add_rect(slide, 0, 0, W, H, NAVY, transparency=12)
    add_rect(slide, 0, 0, W, H, NAVY_2, transparency=28)
    add_logo(slide, 0.62, 0.48, dark=True)
    add_pill(slide, "KẾT LUẬN", 0.65, 1.49, 1.16, "20327B", WHITE)
    add_text(slide, "PACE CAR ĐÃ HOÀN THIỆN\nMỘT VÒNG GIÁ TRỊ", 0.62, 2.02, 7.0, 1.4, 36, WHITE, True, FONT_HEAD)
    add_text(slide, "Từ tìm xe đến hợp đồng, thanh toán, giao nhận và xử lý tranh chấp — có bằng chứng, có vai trò và có business model rõ ràng.", 0.65, 3.72, 6.22, 1.0, 15, "DFE6F1")
    add_rect(slide, 0.65, 5.17, 6.18, 0.88, WHITE, None, radius=True, transparency=6)
    add_rich_text(slide, [
        {"text": "Bước tiếp theo: ", "color": NAVY, "bold": True, "size": 12},
        {"text": "pilot với khách & chủ xe thật", "color": BLUE, "bold": True, "size": 15, "font": FONT_HEAD},
        {"text": " để kiểm chứng khả năng thương mại.", "color": NAVY, "size": 12},
    ], 0.92, 5.42, 5.6, 0.48)
    add_text(slide, "CẢM ƠN", 10.22, 5.34, 2.35, 0.58, 26, WHITE, True, FONT_HEAD, PP_ALIGN.RIGHT)
    add_footer(slide, "PaceCar • EXE201 Product Development Deck • 05.11.2026", dark=True)

    # Metadata
    prs.core_properties.title = "PaceCar — EXE201 Product Development Deck"
    prs.core_properties.subject = "Từ MVP đến sản phẩm hoàn thiện theo quy trình 6 bước"
    prs.core_properties.author = "PaceCar Team"
    prs.core_properties.keywords = "PaceCar, EXE201, MVP, product development, feedback"
    return prs


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    prs = build_deck()
    prs.save(OUT)
    print(f"Saved {OUT}")
    print(f"Slides: {len(prs.slides)}")


if __name__ == "__main__":
    main()
