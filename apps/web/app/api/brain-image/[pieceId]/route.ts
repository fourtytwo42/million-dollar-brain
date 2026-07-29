import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { keccak256 } from "viem";
import { brainAbi } from "@/lib/abi";
import { deployment, publicClient } from "@/lib/chain";
import { MAX_ANIMATED_PORTRAIT_BYTES, portraitMediaType } from "@/lib/portrait";

export const runtime = "nodejs";

const HASH_PATTERN = /^0x[0-9a-f]{64}$/;
const MAX_PORTRAIT_BYTES = MAX_ANIMATED_PORTRAIT_BYTES;

function parsePieceId(raw: string) {
  const pieceId = Number(raw);
  if (!Number.isInteger(pieceId) || pieceId < 1 || pieceId > 42) {
    throw new Error("invalid brain piece");
  }
  return pieceId;
}

function portraitDirectory() {
  const stateDirectory =
    process.env.MDB_STATE_DIR ??
    "/home/hendo420/projects/million-dollar-brain/var";
  return join(stateDirectory, "brain-portraits");
}

function portraitPath(pieceId: number, hash: string) {
  const brain = deployment().brain.toLowerCase();
  return join(portraitDirectory(), brain, String(pieceId), `${hash}.media`);
}

function legacyPortraitPath(pieceId: number, hash: string) {
  const brain = deployment().brain.toLowerCase();
  return join(portraitDirectory(), brain, String(pieceId), `${hash}.webp`);
}

function defaultPortraitPath(pieceId: number) {
  return join(
    process.cwd(),
    "apps",
    "web",
    "public",
    "brain-art",
    "v4",
    `piece-${String(pieceId).padStart(2, "0")}.webp`,
  );
}

async function currentPortraitHash(pieceId: number) {
  return (
    await publicClient.readContract({
      address: deployment().brain,
      abi: brainAbi,
      functionName: "portraitHash",
      args: [BigInt(pieceId)],
    })
  ).toLowerCase();
}

async function storedPortrait(pieceId: number, hash: string) {
  try {
    return await readFile(portraitPath(pieceId, hash));
  } catch {
    return readFile(legacyPortraitPath(pieceId, hash));
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ pieceId: string }> },
) {
  try {
    const pieceId = parsePieceId((await context.params).pieceId);
    const hash = request.nextUrl.searchParams.get("hash")?.toLowerCase() ?? "";
    if (
      !HASH_PATTERN.test(hash) ||
      hash !== (await currentPortraitHash(pieceId))
    ) {
      return new NextResponse("portrait not found", { status: 404 });
    }

    try {
      const image = await storedPortrait(pieceId, hash);
      const mediaType = portraitMediaType(image);
      if (!mediaType) throw new Error("invalid stored portrait");
      return new NextResponse(image, {
        headers: {
          "content-type": mediaType,
          "cache-control": "public, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
        },
      });
    } catch {
      const fallback = await readFile(defaultPortraitPath(pieceId));
      return new NextResponse(fallback, {
        headers: {
          "content-type": "image/webp",
          "cache-control": "no-store",
          "x-mdb-portrait-status": "pending-upload",
          "x-content-type-options": "nosniff",
        },
      });
    }
  } catch {
    return new NextResponse("portrait not found", { status: 404 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ pieceId: string }> },
) {
  try {
    const pieceId = parsePieceId((await context.params).pieceId);
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_PORTRAIT_BYTES + 64 * 1024) {
      return NextResponse.json(
        { error: "portrait is too large" },
        { status: 413 },
      );
    }

    const form = await request.formData();
    const file = form.get("portrait");
    if (
      !(file instanceof File) ||
      (file.type !== "image/webp" && file.type !== "image/gif")
    ) {
      return NextResponse.json(
        { error: "a GIF or WebP portrait is required" },
        { status: 400 },
      );
    }
    if (file.size === 0 || file.size > MAX_PORTRAIT_BYTES) {
      return NextResponse.json(
        { error: "portrait is too large" },
        { status: 413 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mediaType = portraitMediaType(bytes);
    if (!mediaType || mediaType !== file.type) {
      return NextResponse.json(
        { error: "invalid GIF or WebP portrait" },
        { status: 400 },
      );
    }
    const hash = keccak256(bytes).toLowerCase();
    if (hash !== (await currentPortraitHash(pieceId))) {
      return NextResponse.json(
        { error: "portrait does not match the on-chain commitment" },
        { status: 409 },
      );
    }

    const output = portraitPath(pieceId, hash);
    await mkdir(
      join(
        portraitDirectory(),
        deployment().brain.toLowerCase(),
        String(pieceId),
      ),
      {
        recursive: true,
      },
    );
    try {
      await writeFile(output, bytes, { flag: "wx", mode: 0o644 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    return NextResponse.json({ pieceId, hash, stored: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "portrait upload failed",
      },
      { status: 400 },
    );
  }
}
