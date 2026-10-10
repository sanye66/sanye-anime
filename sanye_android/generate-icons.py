"""从 PC 版既有图标生成安卓启动图标和启动页资源。"""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / "sanye_desktop" / "assets" / "icon.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
ART = Image.open(SOURCE).convert("RGBA")


def centered(size: tuple[int, int], artwork: int, transparent: bool = False) -> Image.Image:
    background = (255, 255, 255, 0 if transparent else 255)
    image = Image.new("RGBA", size, background)
    scaled = ART.resize((artwork, artwork), Image.Resampling.LANCZOS)
    image.alpha_composite(scaled, ((size[0] - artwork) // 2, (size[1] - artwork) // 2))
    return image


for density, scale in DENSITIES.items():
    folder = RES / f"mipmap-{density}"
    legacy = round(48 * scale)
    centered((legacy, legacy), round(legacy * 0.86)).convert("RGB").save(folder / "ic_launcher.png")
    round_icon = centered((legacy, legacy), round(legacy * 0.86))
    mask = Image.new("L", (legacy, legacy), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, legacy - 1, legacy - 1), fill=255)
    round_icon.putalpha(mask)
    round_icon.save(folder / "ic_launcher_round.png")
    adaptive = round(108 * scale)
    centered((adaptive, adaptive), round(adaptive * 0.64), transparent=True).save(folder / "ic_launcher_foreground.png")

for asset in RES.glob("drawable*/splash.png"):
    with Image.open(asset) as existing:
        width, height = existing.size
    artwork = round(min(width * 0.42, height * 0.48))
    centered((width, height), artwork).convert("RGB").save(asset)
