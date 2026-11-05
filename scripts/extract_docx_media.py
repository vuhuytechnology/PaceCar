from __future__ import annotations

import argparse
import io
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from PIL import Image, ImageDraw, ImageFont


def extract(docx_path: Path, output_dir: Path) -> list[tuple[Path, int, int]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    document = Document(docx_path)
    seen: set[str] = set()
    exported: list[tuple[Path, int, int]] = []
    index = 1

    for element in document.element.body.iter():
        for blip in element.findall(".//" + qn("a:blip")):
            rel_id = blip.get(qn("r:embed"))
            if not rel_id or rel_id in seen:
                continue
            seen.add(rel_id)
            part = document.part.related_parts[rel_id]
            suffix = Path(part.partname).suffix or ".png"
            target = output_dir / f"{index:02d}_{Path(part.partname).stem}{suffix}"
            target.write_bytes(part.blob)
            try:
                with Image.open(io.BytesIO(part.blob)) as image:
                    width, height = image.size
            except Exception:
                width, height = 0, 0
            exported.append((target, width, height))
            index += 1
    return exported


def contact_sheet(images: list[tuple[Path, int, int]], target: Path) -> None:
    thumb_w, thumb_h = 320, 190
    label_h, gap, columns = 46, 18, 4
    rows = (len(images) + columns - 1) // columns
    canvas = Image.new(
        "RGB",
        (
            gap + columns * (thumb_w + gap),
            gap + rows * (thumb_h + label_h + gap),
        ),
        "#111827",
    )
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()

    for idx, (path, width, height) in enumerate(images):
        row, col = divmod(idx, columns)
        x = gap + col * (thumb_w + gap)
        y = gap + row * (thumb_h + label_h + gap)
        try:
            with Image.open(path) as source:
                source = source.convert("RGB")
                source.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
                px = x + (thumb_w - source.width) // 2
                py = y + (thumb_h - source.height) // 2
                canvas.paste(source, (px, py))
        except Exception:
            draw.rectangle((x, y, x + thumb_w, y + thumb_h), fill="#374151")
        draw.text(
            (x, y + thumb_h + 7),
            f"{path.name}  {width}x{height}",
            fill="white",
            font=font,
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(target, quality=92)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("docx", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    images = extract(args.docx, args.output_dir)
    sheet = args.output_dir / "contact_sheet.jpg"
    contact_sheet(images, sheet)
    for path, width, height in images:
        print(f"{path.name}\t{width}x{height}")
    print(f"CONTACT_SHEET\t{sheet}")


if __name__ == "__main__":
    main()
