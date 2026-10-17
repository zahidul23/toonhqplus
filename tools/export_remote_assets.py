"""Extract the native Remote Control GUI artwork as transparent WebPs."""
from pathlib import Path

from PIL import Image
from fontTools.ttLib import TTFont

MAPS = Path.home() / "Projects/ttrfiles/extracted/phase_3.5/phase_3.5/maps"
OUTPUT = Path(__file__).resolve().parents[1] / "public/images/remotes"


def export(name, atlas, uv=None, max_size=(256, 256)):
    image = Image.open(MAPS / f"{atlas}.jpg").convert("RGB")
    image.putalpha(Image.open(MAPS / f"{atlas}_a.rgb").convert("L"))
    if uv:
        left, bottom, right, top = uv
        width, height = image.size
        image = image.crop((round(left * width), round((1 - top) * height),
                            round(right * width), round((1 - bottom) * height)))
    image = image.crop(image.getbbox())
    image.thumbnail(max_size, Image.Resampling.LANCZOS)
    image.save(OUTPUT / f"{name}.webp", quality=85, method=6)


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    # UV rectangles from ttr_m_gui_bat_battleMenu.bam's remote icon cards.
    for name, atlas, uv in [
        ("damage-1", 12, (0.0078125, 0.0078125, 0.3984375, 0.45703125)),
        ("damage-2", 7, (0.5546875, 0.515625, 0.97265625, 0.9921875)),
        ("damage-3", 6, (0.55078125, 0.48828125, 0.9921875, 0.9921875)),
        ("healing-1", 6, (0.55078125, 0.0234375, 0.9453125, 0.47265625)),
        ("healing-2", 7, (0.5546875, 0.0234375, 0.97265625, 0.5)),
        ("healing-3", 13, (0.53125, 0.48828125, 0.97265625, 0.9921875)),
        ("star", 2, (0.859375, 0.65234375, 0.93359375, 0.73046875)),
    ]:
        export(name, f"battle_gui_remastered_palette_4amla_{atlas}", uv)
    font_path = OUTPUT.parents[1] / "fonts/MinnieFont.woff"
    font = TTFont(MAPS.parents[2] / "phase_3/phase_3/fonts/MinnieFont.ttf")
    font.flavor = "woff"
    font.save(font_path)
