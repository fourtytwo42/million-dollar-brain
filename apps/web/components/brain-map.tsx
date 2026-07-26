"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatUnits } from "viem";
import {
  BRAIN_PRESENTATION,
  BRAIN_PRESENTATION_BY_ID,
  type BrainDirection,
  type BrainMapMode,
} from "../lib/brain-presentation";

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
  options: readonly { label: string; value: number }[];
};

type BrainMapProps = {
  pieces: MapPiece[];
  selectedId: number;
  account: string | null;
  mode: BrainMapMode;
  onModeChange: (mode: BrainMapMode) => void;
  onSelect: (pieceId: number) => void;
  onHover?: (pieceId: number | null) => void;
  onZoomChange?: (zoom: number) => void;
};

const brainShape =
  "M47 238C25 202 34 157 64 127C68 82 115 52 166 55C199 20 267 17 316 43C354 14 422 12 474 39C534 25 607 49 641 99C692 110 724 151 715 194C735 231 711 279 669 298C651 335 600 352 555 339C530 367 499 375 470 362C455 388 450 406 449 425H389C391 394 375 372 345 353C312 372 269 371 237 352C185 363 135 340 112 306C72 298 43 272 47 238Z";

const modes: readonly { value: BrainMapMode; label: string }[] = [
  { value: "characters", label: "Characters" },
  { value: "ownership", label: "Ownership" },
  { value: "influence", label: "Influence" },
  { value: "mood", label: "Mood" },
];

function portraitPath(pieceId: number) {
  return `/brain-art/v2/piece-${String(pieceId).padStart(2, "0")}.webp`;
}

function shortOwner(owner: string) {
  return owner && owner !== "0x0000000000000000000000000000000000000000"
    ? `${owner.slice(0, 6)}…${owner.slice(-4)}`
    : "Unowned";
}

function displayPrice(price: string) {
  return Number(formatUnits(BigInt(price), 18)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function ownershipState(piece: MapPiece, account: string | null) {
  if (piece.unowned) return "unowned";
  return account && piece.owner.toLowerCase() === account.toLowerCase()
    ? "mine"
    : "owned";
}

function pieceLabel(piece: MapPiece, account: string | null) {
  const mood = piece.options[piece.preset]?.label ?? "Unknown";
  const state = ownershipState(piece, account);
  return `${piece.name}. ${piece.crew}. ${piece.affinity}. Mood ${mood}. ${piece.weight / 100}% influence. ${state === "mine" ? "Owned by you" : state}. Price $${displayPrice(piece.price)}.`;
}

export function BrainMap({
  pieces,
  selectedId,
  account,
  mode,
  onModeChange,
  onSelect,
  onHover,
  onZoomChange,
}: BrainMapProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const [query, setQuery] = useState("");
  const segmentRefs = useRef(new Map<number, SVGGElement>());
  const pieceById = useMemo(
    () => new Map(pieces.map((piece) => [piece.id, piece])),
    [pieces],
  );
  const weights = pieces.map((piece) => piece.weight);
  const minWeight = Math.min(...weights, 0);
  const maxWeight = Math.max(...weights, 1);
  const previewPiece = hoveredId ? pieceById.get(hoveredId) : undefined;
  const filteredPieces = pieces.filter((piece) => {
    const mood = piece.options[piece.preset]?.label ?? "";
    return [piece.name, piece.crew, piece.affinity, mood]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  });

  const setPreview = (pieceId: number | null) => {
    setHoveredId(pieceId);
    onHover?.(pieceId);
  };

  const changeZoom = (next: number) => {
    const clamped = Math.min(2.5, Math.max(1, next));
    setZoom(clamped);
    onZoomChange?.(clamped);
  };

  const moveFocus = (pieceId: number, direction: BrainDirection) => {
    const targetId =
      BRAIN_PRESENTATION_BY_ID.get(pieceId)?.neighbors[direction];
    if (!targetId) return;
    onSelect(targetId);
    window.requestAnimationFrame(() =>
      segmentRefs.current.get(targetId)?.focus(),
    );
  };

  const handleKeyDown = (
    event: KeyboardEvent<SVGGElement>,
    pieceId: number,
  ) => {
    const directions: Partial<Record<string, BrainDirection>> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    if (directions[event.key]) {
      event.preventDefault();
      moveFocus(pieceId, directions[event.key]!);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const targetId = event.key === "Home" ? 1 : 42;
      onSelect(targetId);
      window.requestAnimationFrame(() =>
        segmentRefs.current.get(targetId)?.focus(),
      );
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(pieceId);
    }
  };

  return (
    <div className="brain-map-wrap">
      <div className="brain-map-header">
        <div>
          <p className="section-kicker">THE 42</p>
          <strong>Choose how to read the brain</strong>
        </div>
        <div className="brain-mode-control" aria-label="Brain map view">
          {modes.map((item) => (
            <button
              key={item.value}
              className={mode === item.value ? "active" : ""}
              aria-pressed={mode === item.value}
              onClick={() => onModeChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mobile-map-switch" aria-label="Mobile brain view">
        <button
          className={mobileView === "map" ? "active" : ""}
          onClick={() => setMobileView("map")}
        >
          Map
        </button>
        <button
          className={mobileView === "list" ? "active" : ""}
          onClick={() => setMobileView("list")}
        >
          List
        </button>
      </div>

      <div
        className={`brain-map-panel ${mobileView === "map" ? "active" : ""}`}
      >
        <div className="map-zoom-tools" aria-label="Map zoom controls">
          <span>42 / 42 ON-CHAIN</span>
          <div>
            <button
              aria-label="Zoom out"
              disabled={zoom <= 1}
              onClick={() => changeZoom(zoom - 0.25)}
            >
              −
            </button>
            <output aria-live="polite">{zoom.toFixed(2)}×</output>
            <button
              aria-label="Zoom in"
              disabled={zoom >= 2.5}
              onClick={() => changeZoom(zoom + 0.25)}
            >
              +
            </button>
            <button onClick={() => changeZoom(1)}>Reset</button>
          </div>
        </div>
        <div className="brain-map-viewport">
          <div
            className="brain-map-stage"
            style={{ width: `${zoom * 100}%` }}
            data-zoom={zoom.toFixed(2)}
          >
            <svg
              className={`brain-map mode-${mode}`}
              viewBox="0 0 760 435"
              role="group"
              aria-label="Interactive 42-piece brain marketplace"
            >
              <defs>
                <clipPath id="brain-boundary">
                  <path d={brainShape} />
                </clipPath>
                <pattern
                  id="ownership-owned"
                  width="8"
                  height="8"
                  patternUnits="userSpaceOnUse"
                >
                  <path d="M0 8L8 0" />
                </pattern>
                <pattern
                  id="ownership-mine"
                  width="7"
                  height="7"
                  patternUnits="userSpaceOnUse"
                >
                  <path d="M0 3.5H7M3.5 0V7" />
                </pattern>
                {BRAIN_PRESENTATION.map((piece) => (
                  <clipPath id={`piece-boundary-${piece.id}`} key={piece.id}>
                    <path d={piece.path} />
                  </clipPath>
                ))}
              </defs>
              <path
                className="brain-backplate"
                d={brainShape}
                aria-hidden="true"
              />
              <image
                className="brain-illustration"
                href="/brain-art/brain-base.webp"
                x="-19"
                y="1"
                width="795"
                height="434"
                preserveAspectRatio="none"
                clipPath="url(#brain-boundary)"
                aria-hidden="true"
              />
              <g clipPath="url(#brain-boundary)">
                {pieces.map((piece) => {
                  const presentation = BRAIN_PRESENTATION_BY_ID.get(piece.id);
                  if (!presentation) return null;
                  const state = ownershipState(piece, account);
                  const moodValue = piece.options[piece.preset]?.value ?? 0;
                  const influence =
                    (piece.weight - minWeight) /
                    Math.max(1, maxWeight - minWeight);
                  const classes = [
                    "brain-cell",
                    `ownership-${state}`,
                    `mood-${moodValue < 0 ? `n${Math.abs(moodValue)}` : `p${moodValue}`}`,
                    selectedId === piece.id ? "selected" : "",
                    hoveredId === piece.id ? "hovered" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const label = pieceLabel(piece, account);
                  return (
                    <g
                      className={classes}
                      style={
                        {
                          "--influence": influence.toFixed(3),
                        } as CSSProperties
                      }
                      key={piece.id}
                      role="button"
                      tabIndex={selectedId === piece.id ? 0 : -1}
                      aria-label={label}
                      aria-current={
                        selectedId === piece.id ? "true" : undefined
                      }
                      aria-controls="piece-inspector"
                      aria-describedby={
                        hoveredId === piece.id
                          ? "brain-piece-tooltip"
                          : undefined
                      }
                      ref={(node) => {
                        if (node) segmentRefs.current.set(piece.id, node);
                        else segmentRefs.current.delete(piece.id);
                      }}
                      onClick={() => onSelect(piece.id)}
                      onMouseEnter={() => setPreview(piece.id)}
                      onMouseLeave={() => setPreview(null)}
                      onFocus={() => setPreview(piece.id)}
                      onBlur={() => setPreview(null)}
                      onKeyDown={(event) => handleKeyDown(event, piece.id)}
                    >
                      <path className="segment-fill" d={presentation.path} />
                      <image
                        className="piece-portrait"
                        href={portraitPath(piece.id)}
                        x={presentation.portrait.x}
                        y={presentation.portrait.y}
                        width={presentation.portrait.width}
                        height={presentation.portrait.height}
                        preserveAspectRatio="xMidYMid meet"
                        clipPath={`url(#piece-boundary-${piece.id})`}
                        aria-hidden="true"
                      />
                      <path
                        className="segment-boundary"
                        d={presentation.path}
                      />
                      <title>{label}</title>
                    </g>
                  );
                })}
              </g>
              <path
                className="brain-outline"
                d={brainShape}
                aria-hidden="true"
              />
            </svg>
            {previewPiece &&
              (() => {
                const presentation = BRAIN_PRESENTATION_BY_ID.get(
                  previewPiece.id,
                );
                if (!presentation) return null;
                const state = ownershipState(previewPiece, account);
                return (
                  <div
                    id="brain-piece-tooltip"
                    role="tooltip"
                    className="brain-piece-tooltip"
                    style={{
                      left: `${(presentation.center.x / 760) * 100}%`,
                      top: `${(presentation.center.y / 435) * 100}%`,
                    }}
                  >
                    <b>{previewPiece.name}</b>
                    <span>
                      {previewPiece.crew} ·{" "}
                      {previewPiece.options[previewPiece.preset]?.label}
                    </span>
                    <span>
                      {previewPiece.weight / 100}% influence ·{" "}
                      {state === "mine"
                        ? "Yours"
                        : state === "unowned"
                          ? "Unowned"
                          : shortOwner(previewPiece.owner)}
                    </span>
                    <strong>${displayPrice(previewPiece.price)}</strong>
                  </div>
                );
              })()}
          </div>
        </div>
      </div>

      <div
        className={`brain-list-panel ${mobileView === "list" ? "active" : ""}`}
      >
        <label>
          <span className="sr-only">Search brain pieces</span>
          <input
            type="search"
            placeholder="Search name, crew, affinity, or mood"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="brain-piece-list">
          {filteredPieces.map((piece) => {
            const state = ownershipState(piece, account);
            return (
              <button
                key={piece.id}
                className={selectedId === piece.id ? "selected" : ""}
                onClick={() => onSelect(piece.id)}
              >
                <img src={portraitPath(piece.id)} alt="" />
                <span>
                  <b>{piece.name}</b>
                  <small>
                    {piece.options[piece.preset]?.label} · {piece.weight / 100}%
                  </small>
                </span>
                <span>
                  <small>{state === "mine" ? "Yours" : state}</small>
                  <strong>${displayPrice(piece.price)}</strong>
                </span>
              </button>
            );
          })}
          {!filteredPieces.length && <p>No brain pieces match that search.</p>}
        </div>
      </div>

      <ModeLegend mode={mode} pieces={pieces} account={account} />
    </div>
  );
}

function ModeLegend({
  mode,
  pieces,
  account,
}: {
  mode: BrainMapMode;
  pieces: MapPiece[];
  account: string | null;
}) {
  if (mode === "characters") {
    const crews = [...new Set(pieces.map((piece) => piece.crew))];
    return (
      <div className="map-legend" aria-label="Character crew legend">
        <p>Portraits stay quiet until focused or selected.</p>
        {crews.map((crew) => (
          <span key={crew}>
            <i className="legend-character" />
            {crew} ({pieces.filter((piece) => piece.crew === crew).length})
          </span>
        ))}
      </div>
    );
  }
  if (mode === "ownership") {
    const counts = { unowned: 0, owned: 0, mine: 0 };
    pieces.forEach((piece) => counts[ownershipState(piece, account)]++);
    return (
      <div className="map-legend" aria-label="Ownership legend">
        <span>
          <i className="legend-unowned" />
          Unowned ({counts.unowned})
        </span>
        <span>
          <i className="legend-owned" />
          Other owners ({counts.owned})
        </span>
        <span>
          <i className="legend-mine" />
          Yours ({counts.mine})
        </span>
      </div>
    );
  }
  if (mode === "influence") {
    return (
      <div className="map-legend" aria-label="Influence legend">
        <span>
          <i className="legend-influence-low" />
          Light: lower influence
        </span>
        <span>
          <i className="legend-influence-mid" />
          Medium
        </span>
        <span>
          <i className="legend-influence-high" />
          Dark: higher influence
        </span>
      </div>
    );
  }
  return (
    <div className="map-legend" aria-label="Mood legend">
      {[-2, -1, 0, 1, 2].map((value) => (
        <span key={value}>
          <i
            className={`legend-mood legend-mood-${value < 0 ? `n${Math.abs(value)}` : `p${value}`}`}
          />
          {value > 0 ? `+${value}` : value} (
          {
            pieces.filter(
              (piece) => (piece.options[piece.preset]?.value ?? 0) === value,
            ).length
          }
          )
        </span>
      ))}
    </div>
  );
}
