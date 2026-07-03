"""
Graphviz xuat SVG voi icon node tham chieu bang duong dan tuyet doi tren
may tao ra file (vd C:\\Users\\...\\site-packages\\resources\\...png) thay vi
nhung du lieu anh vao SVG. SVG chi hien dung tren dung may vua generate --
push len GitHub/xem may khac se vo icon (khung + chu con, icon mat).

Script nay thay xlink:href tro toi file .png tren dia bang data URI base64,
lam SVG tu chua du lieu, xem duoc o bat ky dau. Chay lai script nay sau
MOI LAN generate lai diagram (truoc khi commit).

Usage: python inline_svg_icons.py file1.svg file2.svg ...
"""
import base64
import pathlib
import re
import sys


def inline_svg_images(svg_path: str) -> int:
    path = pathlib.Path(svg_path)
    content = path.read_text(encoding="utf-8")
    count = 0

    def replace(match: re.Match) -> str:
        nonlocal count
        href = match.group(1)
        png_path = pathlib.Path(href)
        if not png_path.exists():
            return match.group(0)  # da la data URI hoac file khong ton tai, giu nguyen
        data = base64.b64encode(png_path.read_bytes()).decode("ascii")
        count += 1
        return f'xlink:href="data:image/png;base64,{data}"'

    new_content = re.sub(r'xlink:href="([^"]+\.png)"', replace, content)
    path.write_text(new_content, encoding="utf-8")
    return count


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python inline_svg_icons.py file1.svg file2.svg ...")
        sys.exit(1)
    for arg in sys.argv[1:]:
        n = inline_svg_images(arg)
        print(f"{arg}: inlined {n} icon(s)")
