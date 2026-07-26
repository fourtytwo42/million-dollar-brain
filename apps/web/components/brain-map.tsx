"use client";

import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { formatUnits } from "viem";
import {
  BRAIN_PRESENTATION,
  BRAIN_PRESENTATION_BY_ID,
  BRAIN_SILHOUETTE_PATH,
  type BrainDirection,
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
  onSelect: (pieceId: number) => void;
  onHover?: (pieceId: number | null) => void;
  onZoomChange?: (zoom: number) => void;
};

function portraitPath(pieceId: number) {
  return `/brain-art/v4/piece-${String(pieceId).padStart(2, "0")}.webp`;
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
  onSelect,
  onHover,
  onZoomChange,
}: BrainMapProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const [query, setQuery] = useState("");
  const [highlightedCrew, setHighlightedCrew] = useState<string | null>(null);
  const [mineHighlighted, setMineHighlighted] = useState(false);
  const segmentRefs = useRef(new Map<number, SVGGElement>());
  const pieceById = useMemo(
    () => new Map(pieces.map((piece) => [piece.id, piece])),
    [pieces],
  );
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
          <strong>Explore the community brain</strong>
          <p className="brain-map-explainer">
            Click a character to see what it controls, its current preset, and
            who can change it.
          </p>
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
              className={`brain-map mode-characters${highlightedCrew || mineHighlighted ? " has-piece-filter" : ""}`}
              viewBox="0 0 760 435"
              role="group"
              aria-label="Interactive 42-piece brain marketplace"
            >
              <defs>
                <clipPath id="brain-boundary">
                  <path d={BRAIN_SILHOUETTE_PATH} />
                </clipPath>
                {BRAIN_PRESENTATION.map((piece) => (
                  <clipPath id={`piece-boundary-${piece.id}`} key={piece.id}>
                    <path d={piece.path} />
                  </clipPath>
                ))}
              </defs>
              <path
                className="brain-backplate"
                d={BRAIN_SILHOUETTE_PATH}
                aria-hidden="true"
              />
              <g clipPath="url(#brain-boundary)">
                {pieces.map((piece) => {
                  const presentation = BRAIN_PRESENTATION_BY_ID.get(piece.id);
                  if (!presentation) return null;
                  const state = ownershipState(piece, account);
                  const classes = [
                    "brain-cell",
                    `ownership-${state}`,
                    selectedId === piece.id ? "selected" : "",
                    hoveredId === piece.id ? "hovered" : "",
                    highlightedCrew === piece.crew ||
                    (mineHighlighted && state === "mine")
                      ? "piece-filter-highlight"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const label = pieceLabel(piece, account);
                  return (
                    <g
                      className={classes}
                      key={piece.id}
                      data-region={presentation.region}
                      data-crew={piece.crew}
                      data-center-x={presentation.center.x}
                      data-center-y={presentation.center.y}
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
                        className="ownership-halo"
                        d={presentation.path}
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
                d={BRAIN_SILHOUETTE_PATH}
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

      <CharacterLegend
        pieces={pieces}
        account={account}
        highlightedCrew={highlightedCrew}
        mineHighlighted={mineHighlighted}
        onCrewHighlight={(crew) => {
          setMineHighlighted(false);
          setHighlightedCrew((current) => (current === crew ? null : crew));
        }}
        onMineHighlight={() => {
          setHighlightedCrew(null);
          setMineHighlighted((current) => !current);
        }}
      />
    </div>
  );
}

function CharacterLegend({
  pieces,
  account,
  highlightedCrew,
  mineHighlighted,
  onCrewHighlight,
  onMineHighlight,
}: {
  pieces: MapPiece[];
  account: string | null;
  highlightedCrew: string | null;
  mineHighlighted: boolean;
  onCrewHighlight: (crew: string) => void;
  onMineHighlight: () => void;
}) {
  const mineCount = pieces.filter(
    (piece) => ownershipState(piece, account) === "mine",
  ).length;
  const ownershipKey = (
    <button
      className={`crew-legend-button ownership-at-glance-key${mineHighlighted ? " active" : ""}`}
      aria-pressed={mineHighlighted}
      disabled={mineCount === 0 && !mineHighlighted}
      onClick={onMineHighlight}
      title={
        mineCount === 0
          ? "This wallet does not own any brain pieces yet"
          : "Highlight the brain pieces owned by this wallet"
      }
    >
      <i className="legend-mine-halo" />
      Yours ({mineCount}) · double outline
    </button>
  );
  const crews = [...new Set(pieces.map((piece) => piece.crew))];
  return (
    <div className="map-legend" aria-label="Character crew legend">
      <p>
        {mineHighlighted
          ? "Your pieces highlighted. Select Yours again to clear."
          : highlightedCrew
            ? `${highlightedCrew} highlighted. Select it again to clear.`
            : "Select a crew or Yours to highlight its members."}
      </p>
      {ownershipKey}
      {crews.map((crew) => (
        <button
          className={`crew-legend-button${highlightedCrew === crew ? " active" : ""}`}
          key={crew}
          aria-pressed={highlightedCrew === crew}
          onClick={() => onCrewHighlight(crew)}
        >
          <i className="legend-character" />
          {crew} ({pieces.filter((piece) => piece.crew === crew).length})
        </button>
      ))}
    </div>
  );
}
