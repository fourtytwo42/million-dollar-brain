export const MAX_ANIMATED_PORTRAIT_BYTES = 4 * 1024 * 1024;
export const MAX_STATIC_PORTRAIT_BYTES = 512 * 1024;

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

export function portraitMediaType(bytes: Uint8Array) {
  if (
    bytes.length >= 6 &&
    (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")
  ) {
    return "image/gif" as const;
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    return "image/webp" as const;
  }
  return null;
}

export function isAnimatedWebp(bytes: Uint8Array) {
  if (portraitMediaType(bytes) !== "image/webp") return false;
  for (let index = 12; index + 8 <= bytes.length;) {
    const chunkType = ascii(bytes, index, 4);
    const chunkSize =
      bytes[index + 4] |
      (bytes[index + 5] << 8) |
      (bytes[index + 6] << 16) |
      (bytes[index + 7] << 24);
    if (chunkType === "ANIM" || chunkType === "ANMF") return true;
    if (chunkSize < 0) return false;
    index += 8 + chunkSize + (chunkSize % 2);
  }
  return false;
}

export function preserveAnimatedPortrait(bytes: Uint8Array) {
  return portraitMediaType(bytes) === "image/gif" || isAnimatedWebp(bytes);
}

export const EMPTY_PORTRAIT_HASH = `0x${"0".repeat(64)}` as const;

export type PortraitPiece = {
  id: number;
  portraitHash?: string;
};

export function defaultPortraitUrl(pieceId: number) {
  return `/brain-art/v4/piece-${String(pieceId).padStart(2, "0")}.webp`;
}

export function portraitUrl(piece: PortraitPiece) {
  const hash = piece.portraitHash?.toLowerCase();
  if (!hash || hash === EMPTY_PORTRAIT_HASH) {
    return defaultPortraitUrl(piece.id);
  }
  return `/api/brain-image/${piece.id}?hash=${encodeURIComponent(hash)}`;
}

export async function preparePortrait(file: File) {
  const allowedTypes = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
  ]);
  if (!allowedTypes.has(file.type)) {
    throw new Error("Choose a PNG, JPEG, GIF, or WebP image.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 10 MB.");
  }

  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  if (preserveAnimatedPortrait(sourceBytes)) {
    if (sourceBytes.length > MAX_ANIMATED_PORTRAIT_BYTES) {
      throw new Error("Animated portraits must be 4 MB or smaller.");
    }
    const mediaType = portraitMediaType(sourceBytes);
    const extension = mediaType === "image/gif" ? "gif" : "webp";
    return new File([sourceBytes], `brain-piece.${extension}`, {
      type: mediaType ?? file.type,
    });
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () =>
        reject(new Error("That image could not be read."));
      candidate.src = sourceUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 384;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable.");

    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;
    context.clearRect(0, 0, 384, 384);
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      384,
      384,
    );

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("The portrait could not be encoded.")),
        "image/webp",
        0.9,
      ),
    );
    if (blob.size > MAX_STATIC_PORTRAIT_BYTES) {
      throw new Error("The processed portrait is larger than 512 KB.");
    }
    return new File([blob], `brain-piece.webp`, { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
