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
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 10 MB.");
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
    if (blob.size > 512 * 1024) {
      throw new Error("The processed portrait is larger than 512 KB.");
    }
    return new File([blob], `brain-piece.webp`, { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
