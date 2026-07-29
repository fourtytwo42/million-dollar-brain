export const MAX_CUSTOM_PIECE_NAME_BYTES = 48;
export const MAX_PROFILE_URL_BYTES = 200;

export type NamedPiece = {
  name: string;
  customName?: string;
};

export function pieceDisplayName(piece: NamedPiece) {
  return piece.customName?.length ? piece.customName : piece.name;
}

export function validateCustomPieceName(value: string) {
  if (!value.length) return "Enter a name.";
  if (value !== value.trim()) return "Remove spaces from the beginning or end.";
  if (/[\u0000-\u001f\u007f]/u.test(value))
    return "Control characters are not allowed.";
  if (new TextEncoder().encode(value).length > MAX_CUSTOM_PIECE_NAME_BYTES) {
    return `Use no more than ${MAX_CUSTOM_PIECE_NAME_BYTES} UTF-8 bytes.`;
  }
  return null;
}

export function normalizeProfileUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Enter a valid website address.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Braincell links must use HTTPS.");
  }
  if (parsed.username || parsed.password || !parsed.hostname) {
    throw new Error("Enter a public HTTPS website without sign-in details.");
  }
  const normalized = parsed.href;
  if (new TextEncoder().encode(normalized).length > MAX_PROFILE_URL_BYTES) {
    throw new Error(
      `Use a link no longer than ${MAX_PROFILE_URL_BYTES} bytes.`,
    );
  }
  if (/[^\u0021-\u007e]/u.test(normalized)) {
    throw new Error("Use a standard ASCII website address.");
  }
  return normalized;
}

export function profileUrlLabel(value: string) {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    const label = `${parsed.hostname}${path}`;
    return label.length > 42 ? `${label.slice(0, 39)}…` : label;
  } catch {
    return "";
  }
}
