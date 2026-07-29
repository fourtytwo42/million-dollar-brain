export const MAX_CUSTOM_PIECE_NAME_BYTES = 48;

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
