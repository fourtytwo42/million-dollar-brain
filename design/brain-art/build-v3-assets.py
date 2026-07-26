"""Build the cache-safe v3 brain portrait set from ImageGen source PNGs."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


GENERATED_SOURCES = {
    1: "call_4smtXKrMTV16pJEbOAl78xAg.png",
    2: "exec-40476ae6-a234-4d57-ba79-4a108273b9cd.png",
    3: "exec-70a7455c-cd83-4f99-8c12-cf104ef807d8.png",
    4: "exec-087def70-d648-40d1-b6f9-373eacd63d9c.png",
    7: "exec-48ebd0a2-f65c-4e06-801c-6f0a49a17f6f.png",
    8: "exec-91c337ce-3493-4dd4-b3cd-0dd38ace6f88.png",
    9: "exec-4d61948c-03a6-4d05-95a2-1a2e63c19de0.png",
    10: "exec-4a35c884-4848-4c87-8f8c-b5ed3c800c54.png",
    13: "exec-a89e1237-ba50-4c7c-9bd8-5463791bbc3d.png",
    14: "exec-e465dc78-3255-4295-95c3-1121717b00a6.png",
    15: "exec-272604c4-6bca-4b2a-8eb5-073746dc05a0.png",
    16: "exec-ddadbebc-9381-464b-92ca-aabeaae9f96b.png",
    17: "exec-7ac384ee-ef04-4384-9e48-76ab4a9424f2.png",
    18: "exec-7320ec40-2e06-47d6-9920-3719d9948acb.png",
    19: "exec-0ada3c22-5f05-413f-8a84-f98af4dd9052.png",
    20: "exec-9989ccc2-aa7e-49ca-acb4-d88e5652d1c8.png",
    21: "exec-5dc52d33-5ac3-4068-bddc-f3c036b141b2.png",
    22: "exec-4bdec301-1158-44a3-b900-2907f921728a.png",
    23: "exec-f7b19c1f-fb5f-4d44-b2e0-51b2e00ab827.png",
    24: "exec-f7a0f391-9866-4a71-8482-5ae73dad2755.png",
    25: "exec-8ee7631d-084f-4af9-ade5-d04d31135d7d.png",
    26: "exec-c58982ef-30d6-4aa0-9226-0d3c80f587f3.png",
    27: "exec-a5c7c573-7feb-4fcf-992a-73d5a9bd31af.png",
    28: "exec-eb8664ac-9ca2-491a-afee-29a6ecaccbf0.png",
    29: "exec-27527edf-a6f6-43f5-8ff6-a475f2f70d04.png",
    30: "exec-556805c0-bf91-41a8-8353-5f080d583c85.png",
    31: "exec-45da3380-a9d2-4fcd-b3d7-45b529f4ac65.png",
    32: "exec-03129193-6894-43f6-a5fa-fcc82490448f.png",
    37: "exec-690f2f20-98d1-4f82-86da-2c969cddb2be.png",
    39: "exec-005f0edb-d88c-4f5e-b8e4-ec8fb0e74cae.png",
    40: "exec-e41d8380-ea7f-490f-887f-f3de2ff5419d.png",
    41: "exec-d4b7231b-b79d-433f-9350-11e4d5d83058.png",
    42: "exec-387b71c2-063b-4844-b2d0-a25fd8007626.png",
}
RETAINED_PIECES = {5, 6, 11, 12, 33, 34, 35, 36, 38}


def build(source_dir: Path, helper: Path, v2_dir: Path, v3_dir: Path, atlas: Path) -> None:
    v3_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="brain-art-v3-") as temp_name:
        temp_dir = Path(temp_name)
        for piece_id, source_name in GENERATED_SOURCES.items():
            output_webp = v3_dir / f"piece-{piece_id:02d}.webp"
            if output_webp.exists():
                continue
            keyed_png = temp_dir / f"piece-{piece_id:02d}.png"
            subprocess.run(
                [
                    "python",
                    str(helper),
                    "--input",
                    str(source_dir / source_name),
                    "--out",
                    str(keyed_png),
                    "--auto-key",
                    "border",
                    "--soft-matte",
                    "--transparent-threshold",
                    "12",
                    "--opaque-threshold",
                    "220",
                    "--despill",
                    "--force",
                ],
                check=True,
            )
            with Image.open(keyed_png) as image:
                resized = image.convert("RGBA").resize((384, 384), Image.Resampling.LANCZOS)
                resized.save(
                    output_webp,
                    "WEBP",
                    lossless=False,
                    quality=88,
                    method=6,
                )

    for piece_id in RETAINED_PIECES:
        shutil.copy2(
            v2_dir / f"piece-{piece_id:02d}.webp",
            v3_dir / f"piece-{piece_id:02d}.webp",
        )

    create_atlas(v3_dir, atlas)


def create_atlas(v3_dir: Path, output: Path) -> None:
    columns, rows = 7, 6
    cell_width, cell_height = 180, 180
    canvas = Image.new("RGB", (columns * cell_width, rows * cell_height), "#e8ddc8")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=18)

    for index in range(42):
        piece_id = index + 1
        column, row = index % columns, index // columns
        x, y = column * cell_width, row * cell_height
        with Image.open(v3_dir / f"piece-{piece_id:02d}.webp") as portrait:
            portrait = portrait.convert("RGBA").resize((164, 164), Image.Resampling.LANCZOS)
            canvas.paste(portrait, (x + 8, y + 8), portrait)
        draw.rounded_rectangle((x + 10, y + 10, x + 43, y + 39), 8, fill="#f4ead7")
        draw.text((x + 18, y + 15), f"{piece_id:02d}", fill="#321f1b", font=font)

    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, "WEBP", quality=90, method=6)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--helper", required=True, type=Path)
    parser.add_argument("--v2-dir", required=True, type=Path)
    parser.add_argument("--v3-dir", required=True, type=Path)
    parser.add_argument("--atlas", required=True, type=Path)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    build(args.source_dir, args.helper, args.v2_dir, args.v3_dir, args.atlas)
