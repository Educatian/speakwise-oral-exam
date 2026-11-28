"""Brand images from the studio busts (work/render/bust_*.png, written by build_cue_pro.py).

  python art/interviewer/pro/brand.py      (needs Pillow)

docs/brand/gen/examiner-1.png, examiner-2.png   1024 px portraits on the app's navy
public/examiner-mark.png                        256 px badge used beside the live transcript
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
NAVY, GREEN, INDIGO = (9, 14, 30), (52, 211, 153), (99, 102, 241)


def backdrop(size):
    """Navy with a soft teal pool of light behind the head."""
    glow = Image.new('L', (size, size), 0)
    ImageDraw.Draw(glow).ellipse([size * .14, size * .04, size * .86, size * .80], fill=120)
    glow = glow.filter(ImageFilter.GaussianBlur(size * .14))
    return Image.composite(Image.new('RGB', (size, size), (28, 78, 84)), Image.new('RGB', (size, size), NAVY), glow)


def frame(size, radius, width):
    """Rounded border running from the brand green to indigo, as on the logo."""
    ramp = Image.linear_gradient('L').resize((size, size)).rotate(-45)
    colour = Image.composite(Image.new('RGB', (size, size), INDIGO), Image.new('RGB', (size, size), GREEN), ramp)
    ring = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(ring)
    draw.rounded_rectangle([width, width, size - width, size - width], radius, outline=255, width=width)
    return colour, ring


def portrait(name, out, size=1024, crop=(0, 0, 1, 1)):
    bust = Image.open(HERE / 'work' / 'render' / f'bust_{name}.png').convert('RGBA')
    w, h = bust.size
    bust = bust.crop([int(w * crop[0]), int(h * crop[1]), int(w * crop[2]), int(h * crop[3])]).resize((size, size), Image.LANCZOS)
    card = backdrop(size)
    card.paste(bust, (0, 0), bust)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size, size], size // 9, fill=255)
    final = Image.new('RGB', (size, size), NAVY)
    final.paste(card, (0, 0), mask)
    colour, ring = frame(size, size // 9, max(3, size // 170))
    halo = ring.filter(ImageFilter.GaussianBlur(size / 60))
    final.paste(colour, (0, 0), ImageChops.lighter(ring, halo.point(lambda v: v * .6)))
    final.save(out, optimize=True)
    print(out)


portrait('neutral', ROOT / 'docs' / 'brand' / 'gen' / 'examiner-1.png')
portrait('thinking', ROOT / 'docs' / 'brand' / 'gen' / 'examiner-2.png')
portrait('neutral', ROOT / 'public' / 'examiner-mark.png', size=256, crop=(.19, .10, .81, .72))
