"""Inline core.js, app.js and the home-screen icon into one index.html."""
import base64
import io
import pathlib

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).parent


def icon_data_url() -> str:
    size = 180
    img = Image.new("RGB", (size, size), "#0E1116")
    d = ImageDraw.Draw(img)
    # stylised heart-rate line in lime
    pts = [(28, 96), (64, 96), (80, 56), (102, 132), (118, 84), (152, 84)]
    d.line(pts, fill="#C6F432", width=14, joint="curve")
    for x, y in (pts[0], pts[-1]):
        d.ellipse((x - 7, y - 7, x + 7, y + 7), fill="#C6F432")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def main() -> None:
    html = (ROOT / "src/template.html").read_text()
    html = html.replace("__ICON__", icon_data_url())
    html = html.replace("/*__CORE__*/", (ROOT / "src/core.js").read_text())
    html = html.replace("/*__APP__*/", (ROOT / "src/app.js").read_text())
    out = ROOT / "index.html"
    out.write_text(html)
    print(f"wrote {out} ({len(html) // 1024} KB)")


if __name__ == "__main__":
    main()
