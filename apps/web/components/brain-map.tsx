"use client";

type MapPiece = {
  id: number;
  name: string;
  affinity: string;
  crew: string;
  preset: number;
  owner: string;
  unowned: boolean;
  price: string;
  weight: number;
  options: readonly { label: string }[];
};

const rows = [
  { ids: [1, 2, 3, 4, 5, 6], y: 54, start: 138, gap: 92 },
  { ids: [7, 8, 9, 10, 11, 12, 13, 14], y: 118, start: 72, gap: 86 },
  { ids: [15, 16, 17, 18, 19, 20, 21, 22, 23], y: 184, start: 38, gap: 83 },
  { ids: [24, 25, 26, 27, 28, 29, 30, 31, 32], y: 250, start: 48, gap: 82 },
  { ids: [33, 34, 35, 36, 37, 38, 39], y: 316, start: 112, gap: 88 },
  { ids: [40, 41, 42], y: 382, start: 292, gap: 78 },
] as const;

const centers: Map<number, { x: number; y: number }> = new Map(
  rows.flatMap((row) =>
    row.ids.map(
      (id, index) =>
        [id, { x: row.start + index * row.gap, y: row.y }] as const,
    ),
  ),
);

const brainShape =
  "M47 238C25 202 34 157 64 127C68 82 115 52 166 55C199 20 267 17 316 43C354 14 422 12 474 39C534 25 607 49 641 99C692 110 724 151 715 194C735 231 711 279 669 298C651 335 600 352 555 339C530 367 499 375 470 362C455 388 450 406 449 425H389C391 394 375 372 345 353C312 372 269 371 237 352C185 363 135 340 112 306C72 298 43 272 47 238Z";

function pieceArtPath(pieceId: number) {
  return `/brain-art/piece-${String(pieceId).padStart(2, "0")}.webp`;
}

function cellPath(x: number, y: number, id: number) {
  const rx = id >= 40 ? 40 + (id % 2) * 4 : 44 + ((id * 7) % 9);
  const ry = id >= 40 ? 42 : 33 + ((id * 5) % 8);
  const lean = ((id * 11) % 9) - 4;
  const shoulder = ((id * 13) % 7) - 3;
  return [
    `M ${x - rx + lean} ${y - 9 + shoulder}`,
    `L ${x - rx * 0.58 + shoulder} ${y - ry}`,
    `L ${x + rx * 0.45 + lean} ${y - ry + shoulder}`,
    `L ${x + rx} ${y - 10 - lean}`,
    `L ${x + rx - 4 + shoulder} ${y + 20}`,
    `L ${x + rx * 0.38 - lean} ${y + ry}`,
    `L ${x - rx * 0.5 + shoulder} ${y + ry - 1}`,
    `L ${x - rx} ${y + 13 + lean}`,
    "Z",
  ].join(" ");
}

export function BrainMap({
  pieces,
  selectedId,
  account,
  onSelect,
}: {
  pieces: MapPiece[];
  selectedId: number;
  account: string | null;
  onSelect: (pieceId: number) => void;
}) {
  return (
    <div className="brain-map-wrap">
      <div className="map-tools">
        <span>VIEW · CHARACTER CREWS</span>
        <span>42 / 42 ON-CHAIN</span>
      </div>
      <svg
        className="brain-map"
        viewBox="0 0 760 435"
        role="group"
        aria-label="Interactive 42-piece brain marketplace"
      >
        <defs>
          <clipPath id="brain-boundary">
            <path d={brainShape} />
          </clipPath>
          {pieces.map((piece) => {
            const center = centers.get(piece.id);
            return center ? (
              <clipPath id={`piece-boundary-${piece.id}`} key={piece.id}>
                <path d={cellPath(center.x, center.y, piece.id)} />
              </clipPath>
            ) : null;
          })}
        </defs>
        <image
          className="brain-illustration"
          href="/brain-art/brain-base.webp"
          x="28"
          y="0"
          width="704"
          height="435"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        />
        <g clipPath="url(#brain-boundary)">
          {pieces.map((piece) => {
            const center = centers.get(piece.id);
            if (!center) return null;
            const mine = Boolean(
              account && piece.owner.toLowerCase() === account.toLowerCase(),
            );
            const classes = [
              "brain-cell",
              `crew-${piece.crew.toLowerCase().replaceAll(" ", "-")}`,
              selectedId === piece.id ? "selected" : "",
              mine ? "mine" : "",
              piece.unowned ? "unowned" : "owned",
            ]
              .filter(Boolean)
              .join(" ");
            const mood = piece.options[piece.preset]?.label ?? "Unknown";
            const label = `Piece ${piece.id}, ${piece.name}, ${piece.affinity}, mood ${mood}, ${piece.weight / 100}% influence, ${piece.unowned ? "unowned" : "owned"}`;
            return (
              <g
                className={classes}
                key={piece.id}
                role="button"
                tabIndex={0}
                aria-label={label}
                onClick={() => onSelect(piece.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(piece.id);
                  }
                }}
              >
                <image
                  className="piece-portrait"
                  href={pieceArtPath(piece.id)}
                  x={center.x - 49}
                  y={center.y - 43}
                  width="98"
                  height="86"
                  preserveAspectRatio="xMidYMid meet"
                  clipPath={`url(#piece-boundary-${piece.id})`}
                  aria-hidden="true"
                />
                <path d={cellPath(center.x, center.y, piece.id)} />
                <title>{label}</title>
              </g>
            );
          })}
        </g>
        <path className="brain-outline" d={brainShape} aria-hidden="true" />
      </svg>
      <div className="map-legend">
        <span>
          <i className="legend-executive" />
          Executive Dysfunction
        </span>
        <span>
          <i className="legend-mystics" />
          Market Mystics
        </span>
        <span>
          <i className="legend-sector" />
          Sector Weirdos
        </span>
        <span>
          <i className="legend-decision" />
          Decision Goblins
        </span>
      </div>
    </div>
  );
}
