export type BrainMapMode = "characters" | "ownership" | "influence" | "mood";

export type BrainDirection = "up" | "down" | "left" | "right";

export type BrainPresentationPiece = {
  id: number;
  path: string;
  center: { x: number; y: number };
  neighbors: Partial<Record<BrainDirection, number>>;
  portrait: { x: number; y: number; width: number; height: number };
};

type Placement = {
  id: number;
  x: number;
  y: number;
  rx: number;
  ry: number;
  portraitScale?: number;
  portraitX?: number;
  portraitY?: number;
};

const rows: readonly (readonly Placement[])[] = [
  [
    { id: 1, x: 156, y: 65, rx: 55, ry: 43 },
    { id: 2, x: 245, y: 51, rx: 54, ry: 40 },
    { id: 3, x: 336, y: 58, rx: 54, ry: 42 },
    { id: 4, x: 427, y: 54, rx: 55, ry: 42 },
    { id: 5, x: 518, y: 65, rx: 54, ry: 43 },
    { id: 6, x: 604, y: 91, rx: 55, ry: 45 },
  ],
  [
    { id: 7, x: 93, y: 132, rx: 52, ry: 44 },
    { id: 8, x: 176, y: 126, rx: 51, ry: 43 },
    { id: 9, x: 261, y: 120, rx: 51, ry: 43 },
    { id: 10, x: 347, y: 124, rx: 52, ry: 44 },
    { id: 11, x: 433, y: 122, rx: 52, ry: 44 },
    { id: 12, x: 518, y: 132, rx: 51, ry: 43 },
    { id: 13, x: 601, y: 146, rx: 51, ry: 44 },
    { id: 14, x: 670, y: 177, rx: 43, ry: 47 },
  ],
  [
    { id: 15, x: 73, y: 205, rx: 45, ry: 48 },
    { id: 16, x: 151, y: 194, rx: 49, ry: 44 },
    { id: 17, x: 233, y: 191, rx: 49, ry: 43 },
    { id: 18, x: 316, y: 191, rx: 50, ry: 44 },
    { id: 19, x: 400, y: 193, rx: 50, ry: 44 },
    { id: 20, x: 484, y: 198, rx: 50, ry: 45 },
    { id: 21, x: 566, y: 208, rx: 49, ry: 45 },
    { id: 22, x: 638, y: 230, rx: 46, ry: 47 },
    { id: 23, x: 689, y: 248, rx: 36, ry: 46 },
  ],
  [
    { id: 24, x: 83, y: 272, rx: 46, ry: 46 },
    { id: 25, x: 163, y: 263, rx: 49, ry: 44 },
    { id: 26, x: 245, y: 261, rx: 49, ry: 44 },
    { id: 27, x: 328, y: 260, rx: 50, ry: 44 },
    { id: 28, x: 412, y: 262, rx: 50, ry: 44 },
    { id: 29, x: 495, y: 269, rx: 49, ry: 44 },
    { id: 30, x: 576, y: 279, rx: 49, ry: 45 },
    { id: 31, x: 642, y: 295, rx: 44, ry: 44 },
    { id: 32, x: 682, y: 304, rx: 34, ry: 41 },
  ],
  [
    { id: 33, x: 139, y: 328, rx: 54, ry: 44 },
    { id: 34, x: 224, y: 329, rx: 50, ry: 43 },
    { id: 35, x: 307, y: 327, rx: 50, ry: 43 },
    { id: 36, x: 391, y: 327, rx: 50, ry: 43 },
    { id: 37, x: 475, y: 329, rx: 50, ry: 43 },
    { id: 38, x: 557, y: 333, rx: 49, ry: 43 },
    { id: 39, x: 625, y: 341, rx: 43, ry: 41 },
  ],
  [
    { id: 40, x: 303, y: 382, rx: 52, ry: 43 },
    { id: 41, x: 391, y: 384, rx: 52, ry: 44 },
    { id: 42, x: 478, y: 380, rx: 51, ry: 43 },
  ],
] as const;

const allPlacements = rows.flat();

type Point = { x: number; y: number };

function clipPolygon(polygon: Point[], a: number, b: number, limit: number) {
  const result: Point[] = [];
  const inside = (point: Point) => a * point.x + b * point.y <= limit + 0.001;
  const intersection = (start: Point, end: Point) => {
    const denominator = a * (end.x - start.x) + b * (end.y - start.y);
    const t =
      Math.abs(denominator) < 0.0001
        ? 0
        : (limit - a * start.x - b * start.y) / denominator;
    return {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    };
  };
  for (let index = 0; index < polygon.length; index++) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const startInside = inside(start);
    const endInside = inside(end);
    if (startInside && endInside) result.push(end);
    else if (startInside && !endInside) result.push(intersection(start, end));
    else if (!startInside && endInside) {
      result.push(intersection(start, end), end);
    }
  }
  return result;
}

function roundedVoronoiPath(source: Placement) {
  let polygon: Point[] = [
    { x: 28, y: 0 },
    { x: 732, y: 0 },
    { x: 732, y: 425 },
    { x: 28, y: 425 },
  ];
  for (const target of allPlacements) {
    if (target.id === source.id) continue;
    const a = 2 * (target.x - source.x);
    const b = 2 * (target.y - source.y);
    const limit =
      target.x * target.x +
      target.y * target.y -
      source.x * source.x -
      source.y * source.y;
    polygon = clipPolygon(polygon, a, b, limit);
  }
  const radius = 5;
  const before = (point: Point, previous: Point) => {
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
    const amount = Math.min(radius / Math.max(distance, 1), 0.22);
    return {
      x: point.x + (previous.x - point.x) * amount,
      y: point.y + (previous.y - point.y) * amount,
    };
  };
  const after = (point: Point, next: Point) => {
    const distance = Math.hypot(point.x - next.x, point.y - next.y);
    const amount = Math.min(radius / Math.max(distance, 1), 0.22);
    return {
      x: point.x + (next.x - point.x) * amount,
      y: point.y + (next.y - point.y) * amount,
    };
  };
  const format = (value: number) => Number(value.toFixed(2));
  const first = before(polygon[0], polygon.at(-1)!);
  const commands = [`M ${format(first.x)} ${format(first.y)}`];
  for (let index = 0; index < polygon.length; index++) {
    const point = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const entering = before(point, polygon.at(index - 1)!);
    const leaving = after(point, next);
    if (index > 0) {
      commands.push(`L ${format(entering.x)} ${format(entering.y)}`);
    }
    commands.push(
      `Q ${format(point.x)} ${format(point.y)} ${format(leaving.x)} ${format(leaving.y)}`,
    );
  }
  commands.push(`L ${format(first.x)} ${format(first.y)} Z`);
  return commands.join(" ");
}

function nearestDirectionalNeighbor(
  source: Placement,
  direction: BrainDirection,
) {
  const candidates = allPlacements.filter((target) => {
    if (target.id === source.id) return false;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    if (direction === "left") return dx < -8 && Math.abs(dy) < 82;
    if (direction === "right") return dx > 8 && Math.abs(dy) < 82;
    if (direction === "up") return dy < -8;
    return dy > 8;
  });
  const ranked = candidates.sort((a, b) => {
    const score = (target: Placement) => {
      const dx = Math.abs(target.x - source.x);
      const dy = Math.abs(target.y - source.y);
      return direction === "left" || direction === "right"
        ? dx + dy * 2.25
        : dy + dx * 1.35;
    };
    return score(a) - score(b);
  });
  return ranked[0]?.id;
}

export const BRAIN_PRESENTATION: readonly BrainPresentationPiece[] =
  allPlacements.map((placement) => {
    const scale = placement.portraitScale ?? 1;
    const width = 112 * scale;
    const height = 112 * scale;
    return {
      id: placement.id,
      path: roundedVoronoiPath(placement),
      center: { x: placement.x, y: placement.y },
      neighbors: {
        up: nearestDirectionalNeighbor(placement, "up"),
        down: nearestDirectionalNeighbor(placement, "down"),
        left: nearestDirectionalNeighbor(placement, "left"),
        right: nearestDirectionalNeighbor(placement, "right"),
      },
      portrait: {
        x: placement.x - width / 2 + (placement.portraitX ?? 0),
        y: placement.y - height / 2 + (placement.portraitY ?? 0),
        width,
        height,
      },
    };
  });

export const BRAIN_PRESENTATION_BY_ID = new Map(
  BRAIN_PRESENTATION.map((piece) => [piece.id, piece]),
);
