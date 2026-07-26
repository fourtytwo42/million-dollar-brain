"""Build the cache-safe v4 meme-universe brain portrait set."""

from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


GENERATED_SOURCES = {
    1: "call_x8aayp2x1Itd4ALbWxtJ4GDa.png",
    2: "exec-af516a29-d120-434e-8b7b-4b60b14c2812.png",
    3: "exec-0beb063f-8bd3-48b9-9e51-8a69a3fbf48a.png",
    4: "call_ejw8yZ0AGvwPFUkpQMswC8jR.png",
    5: "exec-53e7cab7-41d3-4cf3-a22b-e531ad4254f1.png",
    6: "exec-723465bb-8da6-4252-8eda-286c4d42f3c4.png",
    7: "exec-cd1226f5-dd4f-4b57-b3a7-6719b9f220e9.png",
    8: "exec-08eba050-a53e-4c95-abb8-f7a3bfcde089.png",
    9: "exec-bc1da0ef-834a-4df6-9175-9e47fad631bb.png",
    10: "exec-e574c7c1-f562-4d93-bc97-50efa7eb27d5.png",
    11: "exec-1a9a6bcf-f149-4133-97cb-f97ab29f0356.png",
    12: "exec-7972a343-6130-4525-b4c0-c5524500a4f7.png",
    13: "exec-73d27dd4-d58f-4206-bdce-b500842ec879.png",
    14: "exec-0dbcdce7-c475-4e2b-a823-8f36a69281d6.png",
    15: "exec-5a4c29d7-330f-48f1-8cc6-43fd3d21d107.png",
    16: "exec-4ed45e46-fdb1-4ccb-9544-ca9ed9a23e1a.png",
    17: "exec-499c54ed-330d-4020-86fb-b6e6a752464d.png",
    18: "exec-ca44e016-b0d3-425f-87ec-fb82f382d9b8.png",
    19: "exec-58b42b4a-11ce-40a5-93c7-850f45e0d7b1.png",
    20: "exec-c113bf71-d824-44e6-9744-77679e4395e0.png",
    21: "exec-e65b6abd-fed1-4168-91cc-e34f710be24c.png",
    22: "exec-7af37441-39cb-4520-90b0-df1289cf4c72.png",
    23: "exec-48592a0b-7c0e-4424-8851-b721cf1ad29f.png",
    24: "exec-36acc83c-748e-4c76-89fc-6c25209b08d7.png",
    25: "exec-a63f5378-ccb0-4e1e-b3ad-f519c4bafd0c.png",
    26: "exec-bc2b47dd-1eae-490f-a9ef-1d520598708c.png",
    27: "exec-5ff68429-3c31-4341-8b01-c5b396ac5687.png",
    28: "exec-73e9a74e-9a80-4da8-890f-e1e36916bcde.png",
    29: "exec-2eef201d-6b54-4c03-8f09-eec6de75e7e9.png",
    30: "exec-5844332d-c033-4b7b-968f-d4682fefe3ea.png",
    31: "exec-5f49a007-c951-430d-b470-13b63898bade.png",
    32: "exec-625a266c-e445-4f2a-947d-f9b23488f999.png",
    33: "exec-ac816883-3d18-46e0-b1f9-d5143b2e8eea.png",
    34: "exec-16cdf159-019c-4613-98fa-fa6d024c8be6.png",
    35: "exec-0ea10ec1-b8ce-4f77-baf2-52666b105ccc.png",
    36: "exec-550e4c96-9ace-4972-bbe3-1426e2bd7513.png",
    37: "exec-9d0abdc6-9f66-42dc-88f2-c8d3250d0f10.png",
    38: "exec-2eae5b98-2297-44cb-b4b1-8ad87f86b418.png",
    39: "exec-1707d776-98b4-4d03-b491-acdd42ea5acb.png",
    40: "exec-af45c347-b25c-4dcf-b835-a018752c81c1.png",
    41: "exec-a7e49917-e4a7-481d-9e5a-50895f62e87b.png",
    42: "exec-c74d44f5-b43d-49ef-bda7-26430d543991.png",
}


def build(source_dir: Path, helper: Path, v4_dir: Path, atlas: Path) -> None:
    v4_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="brain-art-v4-") as temp_name:
        temp_dir = Path(temp_name)
        for piece_id, source_name in GENERATED_SOURCES.items():
            output_webp = v4_dir / f"piece-{piece_id:02d}.webp"
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
                resized.save(output_webp, "WEBP", quality=88, method=6)

    create_atlas(v4_dir, atlas)


def create_atlas(v4_dir: Path, output: Path) -> None:
    columns, rows = 7, 6
    cell_width, cell_height = 180, 180
    canvas = Image.new("RGB", (columns * cell_width, rows * cell_height), "#e8ddc8")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=18)

    for index in range(42):
        piece_id = index + 1
        column, row = index % columns, index // columns
        x, y = column * cell_width, row * cell_height
        with Image.open(v4_dir / f"piece-{piece_id:02d}.webp") as portrait:
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
    parser.add_argument("--v4-dir", required=True, type=Path)
    parser.add_argument("--atlas", required=True, type=Path)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    build(args.source_dir, args.helper, args.v4_dir, args.atlas)
