"use client";

type MapPiece = {
  id: number;
  name: string;
  affinity: string;
  crew: string;
  glyph: string;
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

function cellPath(x: number, y: number, id: number) {
  const rx = id >= 40 ? 42 : 47;
  const ry = id >= 40 ? 39 : 36;
  const wobble = (id % 3) * 2;
  return [
    `M ${x - rx + wobble} ${y - 8}`,
    `L ${x - rx / 2} ${y - ry}`,
    `L ${x + rx / 2 + wobble} ${y - ry + 2}`,
    `L ${x + rx} ${y - 7}`,
    `L ${x + rx - 5} ${y + 23}`,
    `L ${x + rx / 3} ${y + ry}`,
    `L ${x - rx / 2} ${y + ry - 2}`,
    `L ${x - rx} ${y + 14}`,
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
        <path
          className="brain-silhouette"
          d="M51 112C92 26 217 4 350 15c159-15 299 39 348 139 41 84 8 173-81 205-63 23-116 9-155 42-33 28-34 28-63-1-34-35-75-18-133-22C109 367 20 292 34 193c4-29 4-53 17-81Z"
        />
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
              <path d={cellPath(center.x, center.y, piece.id)} />
              <text x={center.x} y={center.y - 2} textAnchor="middle">
                {piece.id}
              </text>
              <text
                className="cell-glyph"
                x={center.x}
                y={center.y + 17}
                textAnchor="middle"
              >
                {piece.glyph}
              </text>
              <title>{label}</title>
            </g>
          );
        })}
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
