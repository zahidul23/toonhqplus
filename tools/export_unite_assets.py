from __future__ import annotations

from pathlib import Path
from io import BytesIO
from urllib.request import Request, urlopen
from PIL import Image

TTR_MAPS = Path.home() / "Projects" / "ttrfiles" / "extracted" / "phase_3.5" / "phase_3.5" / "maps"
TTR_PHASE_4_MAPS = Path.home() / "Projects" / "ttrfiles" / "extracted" / "phase_4" / "phase_4" / "maps"
TTR_PHASE_6_MAPS = Path.home() / "Projects" / "ttrfiles" / "extracted" / "phase_6" / "phase_6" / "maps"
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "images" / "unites"


def extract(
    name: str,
    atlas: str,
    crop: tuple[int, int, int, int],
    maps: Path = TTR_MAPS,
    output_size: tuple[int, int] = (128, 128),
    enlarge: bool = False,
) -> None:
    color = Image.open(maps / f"{atlas}.jpg").convert("RGB")
    alpha = Image.open(maps / f"{atlas}_a.rgb").convert("L")
    image = color.copy()
    image.putalpha(alpha)
    image = image.crop(crop)
    bbox = image.getbbox()
    if bbox:
        image = image.crop(bbox)
    if enlarge:
        scale = min(output_size[0] / image.width, output_size[1] / image.height)
        image = image.resize(
            (round(image.width * scale), round(image.height * scale)),
            Image.Resampling.LANCZOS,
        )
    else:
        image.thumbnail(output_size, Image.Resampling.LANCZOS)
    image.save(OUTPUT / name, quality=85, method=6)


def atlas_card(atlas: str, crop: tuple[int, int, int, int]) -> Image.Image:
    color = Image.open(TTR_MAPS / f"{atlas}.jpg").convert("RGB")
    alpha = Image.open(TTR_MAPS / f"{atlas}_a.rgb").convert("L")
    color.putalpha(alpha)
    return color.crop(crop)


def resize_exact(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Scale a GUI card to its intended rendered size, including enlargement."""
    return image.resize(size, Image.Resampling.LANCZOS)


def fit(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Fit while preserving aspect ratio, enlarging small source cards when needed."""
    scale = min(size[0] / image.width, size[1] / image.height)
    rendered_size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return resize_exact(image, rendered_size)


def trim_transparency(image: Image.Image) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    return image.crop(bbox) if bbox else image


def tint_luminance(image: Image.Image, dark: tuple[int, int, int], light: tuple[int, int, int]) -> Image.Image:
    alpha = image.getchannel("A")
    gray = image.convert("L")
    tinted = Image.new("RGBA", image.size)
    pixels = []
    for value in gray.getdata():
        ratio = value / 255
        pixels.append(tuple(round(dark[channel] + (light[channel] - dark[channel]) * ratio) for channel in range(3)) + (255,))
    tinted.putdata(pixels)
    tinted.putalpha(alpha)
    return tinted


def export_gag_up(name: str, gag_image: str | None) -> None:
    size = 256
    result = Image.new("RGBA", (size, size))

    back = Image.open(TTR_MAPS / "ttr_t_gui_bat_toonGUI_gagcircle_back.jpg").convert("RGBA")
    back.putalpha(Image.open(TTR_MAPS / "ttr_t_gui_bat_toonGUI_gagcircle_back_a.rgb").convert("L"))
    back = resize_exact(back, (220, 220))
    back = tint_luminance(back, (105, 191, 224), (198, 239, 250))
    result.alpha_composite(back, ((size - back.width) // 2, (size - back.height) // 2))

    # gagCircle/frame card UVs: (0.0078125, 0.484375) to (0.515625, 0.9921875).
    frame = atlas_card("battle_gui_remastered_palette_4amla_13", (2, 2, 132, 132))
    frame = resize_exact(frame, (238, 238))
    frame = tint_luminance(frame, (0, 35, 78), (31, 137, 185))
    result.alpha_composite(frame, ((size - frame.width) // 2, (size - frame.height) // 2))

    # gagCircle/highlights card UVs: (0.0078125, 0.5) to (0.5, 0.9921875).
    highlight = resize_exact(atlas_card("battle_gui_remastered_palette_4amla_15", (2, 2, 128, 128)), (226, 226))
    result.alpha_composite(highlight, ((size - highlight.width) // 2, (size - highlight.height) // 2))

    if gag_image:
        url = f"https://toonhq.org/static/assets/gags/ttr/{gag_image}"
        request = Request(url, headers={"User-Agent": "Mozilla/5.0 ToonHQ+ asset exporter"})
        subject = Image.open(BytesIO(urlopen(request).read())).convert("RGBA")
        subject = fit(trim_transparency(subject), (112, 112))
    else:
        # guiIcon/gagUpAll card UVs: (0.6015625, 0.3671875) to (0.9375, 0.671875).
        subject = fit(
            trim_transparency(atlas_card("battle_gui_remastered_palette_4amla_19", (154, 84, 240, 162))),
            (142, 122),
        )
    result.alpha_composite(subject, ((size - subject.width) // 2, (size - subject.height) // 2))

    # guiIcon/gagUp card UVs: (0.79296875, 0.82421875) to (0.953125, 0.9921875).
    plus = resize_exact(atlas_card("battle_gui_remastered_palette_4amla_4", (203, 2, 244, 45)), (72, 75))
    result.alpha_composite(plus, (168, 163))
    # Both the 56 px sidebar slot and Chrome/Windows notifications render best
    # from this pre-filtered size; keeping a separate 256 px copy adds no value.
    notification = result.resize((128, 128), Image.Resampling.LANCZOS)
    notification.save(OUTPUT / f"gag-up-{name}.webp", quality=85, method=6)


OUTPUT.mkdir(parents=True, exist_ok=True)

# ttr_m_tf_gui_tokens.bam token card uses this texture and its alpha mask.
extract(
    "cartoonival-token.webp",
    "ttr_t_tf_gui_funnymoney",
    (0, 0, 32, 32),
    TTR_PHASE_6_MAPS,
)

# The same GUI model's jar card has the blue lid and Cartoonival tokens.
extract(
    "cartoonival-token-jar.webp",
    "ttr_t_tf_gui_tokenJar",
    (0, 0, 128, 128),
    TTR_PHASE_6_MAPS,
)

# ttr_m_gui_bat_gagShop.bam jellybeanJar_GRP: remastered jar card UVs
# (0.0078125, 0.20703125) to (0.7109375, 0.9921875).
extract(
    "jellybean-jar.webp",
    "purchase_gui_remastered_palette_4amla_1",
    (2, 2, 182, 203),
    TTR_PHASE_4_MAPS,
    (230, 256),
    True,
)

for slug, gag in {
    "toon-up": "feather.png",
    "trap": "banana_peel.png",
    "lure": "1_bill.png",
    "sound": "bike_horn.png",
    "throw": "cupcake.png",
    "squirt": "squirting_flower.png",
    "drop": "flower_pot.png",
    "all": None,
}.items():
    export_gag_up(slug, gag)
