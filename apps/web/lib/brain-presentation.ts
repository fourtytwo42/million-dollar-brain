export type BrainMapMode = "characters" | "ownership" | "influence" | "mood";

export type BrainDirection = "up" | "down" | "left" | "right";
export type BrainRegion = "cerebrum" | "cerebellum" | "brainstem";

export type BrainPresentationPiece = {
  id: number;
  region: BrainRegion;
  path: string;
  center: { x: number; y: number };
  neighbors: Partial<Record<BrainDirection, number>>;
  portrait: { x: number; y: number; width: number; height: number };
};

type Placement = {
  id: number;
  region: BrainRegion;
  x: number;
  y: number;
  rx: number;
  ry: number;
  portraitScale?: number;
  portraitX?: number;
  portraitY?: number;
};

export const BRAIN_SILHOUETTE_PATH =
  "M451 428L481.8 426.3L494.1 419.3L489.6 398.3L492 380.5L510.9 387L538.2 390.1L569.6 385.6L589.2 379.2L614.7 365.1L627 352.7L636.9 333.3L636.6 314.9L652.1 316.3L665.7 312.6L678 303.9L686.3 292.4L696.3 266.2L695.8 249.9L700 236.8L698.8 221.1L692.4 208.3L689.9 188.1L680.4 166.1L664.6 149.8L658.4 131.5L644.9 118.3L638.2 103.7L626.6 91.7L616.5 85.9L599.9 67.7L588 60.8L566.7 54.4L558.9 46.1L547.1 39.5L534.7 36.6L519.8 28.9L502.6 26.1L485.4 19.4L469.9 18.5L453.3 13.7L436.1 14.1L414.2 8.4L399.3 9L386.3 13L369.7 8L342.4 10.6L329.9 8.9L305.6 11.6L291.4 16.1L271.8 15.2L251.6 23L232.6 24.6L213.6 32.5L204.7 38.7L183.4 45.7L157.3 62.3L145.1 74.3L123.5 86.9L114.8 95.3L109.8 104.7L95.6 116.2L82.1 136.2L77.2 155.6L69.1 172.9L65 204.3L66.1 216.4L72.9 227.9L73.7 238.9L78.6 249.9L87.9 259.3L105.1 269.6L121.7 275.5L138.8 276.7L156.1 282.4L169.7 281.2L198.8 283.9L213.6 280.2L219.6 280.9L221.5 295.5L231.2 311.3L258.7 327.4L279.5 335.1L324 335.8L343.6 328.8L356.6 319.4L371.7 343.3L382.1 352.4L397.9 361.1L416.6 381L428.4 401.6L437.6 424.5Z";

const rows: readonly (readonly Placement[])[] = [
  [
    { id: 1, region: "cerebrum", x: 170, y: 65, rx: 55, ry: 43 },
    { id: 2, region: "cerebrum", x: 255, y: 52, rx: 54, ry: 40 },
    { id: 3, region: "cerebrum", x: 340, y: 58, rx: 54, ry: 42 },
    { id: 4, region: "cerebrum", x: 425, y: 55, rx: 55, ry: 42 },
    { id: 5, region: "cerebrum", x: 510, y: 66, rx: 54, ry: 43 },
    { id: 6, region: "cerebrum", x: 585, y: 83, rx: 55, ry: 45 },
  ],
  [
    { id: 7, region: "cerebrum", x: 105, y: 127, rx: 52, ry: 44 },
    { id: 8, region: "cerebrum", x: 185, y: 121, rx: 51, ry: 43 },
    { id: 9, region: "cerebrum", x: 270, y: 119, rx: 51, ry: 43 },
    { id: 10, region: "cerebrum", x: 355, y: 121, rx: 52, ry: 44 },
    { id: 11, region: "cerebrum", x: 440, y: 121, rx: 52, ry: 44 },
    { id: 12, region: "cerebrum", x: 525, y: 129, rx: 51, ry: 43 },
    { id: 13, region: "cerebrum", x: 605, y: 140, rx: 51, ry: 44 },
    { id: 14, region: "cerebrum", x: 660, y: 164, rx: 43, ry: 47 },
  ],
  [
    { id: 15, region: "cerebrum", x: 75, y: 198, rx: 45, ry: 48 },
    { id: 16, region: "cerebrum", x: 150, y: 190, rx: 49, ry: 44 },
    { id: 17, region: "cerebrum", x: 230, y: 188, rx: 49, ry: 43 },
    { id: 18, region: "cerebrum", x: 310, y: 188, rx: 50, ry: 44 },
    { id: 19, region: "cerebrum", x: 390, y: 190, rx: 50, ry: 44 },
    { id: 20, region: "cerebrum", x: 470, y: 194, rx: 50, ry: 45 },
    { id: 21, region: "cerebrum", x: 550, y: 199, rx: 49, ry: 45 },
    { id: 22, region: "cerebrum", x: 625, y: 211, rx: 46, ry: 47 },
    { id: 23, region: "cerebrum", x: 685, y: 225, rx: 36, ry: 46 },
  ],
  [
    { id: 24, region: "cerebrum", x: 90, y: 255, rx: 46, ry: 46 },
    { id: 25, region: "cerebrum", x: 180, y: 258, rx: 49, ry: 44 },
    { id: 26, region: "cerebrum", x: 270, y: 258, rx: 49, ry: 44 },
    { id: 27, region: "cerebrum", x: 360, y: 258, rx: 50, ry: 44 },
    { id: 28, region: "cerebrum", x: 450, y: 258, rx: 50, ry: 44 },
    { id: 29, region: "cerebrum", x: 540, y: 260, rx: 49, ry: 44 },
    { id: 30, region: "cerebrum", x: 630, y: 263, rx: 49, ry: 45 },
  ],
  [
    { id: 31, region: "cerebrum", x: 220, y: 305, rx: 54, ry: 44 },
    { id: 32, region: "cerebrum", x: 315, y: 306, rx: 50, ry: 43 },
    { id: 33, region: "cerebrum", x: 410, y: 304, rx: 50, ry: 43 },
    { id: 34, region: "cerebrum", x: 485, y: 299, rx: 50, ry: 43 },
  ],
  [
    {
      id: 35,
      region: "cerebellum",
      x: 525,
      y: 326,
      rx: 45,
      ry: 38,
      portraitScale: 0.88,
    },
    {
      id: 36,
      region: "cerebellum",
      x: 575,
      y: 325,
      rx: 45,
      ry: 38,
      portraitScale: 0.88,
    },
    {
      id: 37,
      region: "cerebellum",
      x: 620,
      y: 315,
      rx: 42,
      ry: 38,
      portraitScale: 0.82,
    },
  ],
  [
    {
      id: 38,
      region: "cerebellum",
      x: 515,
      y: 365,
      rx: 43,
      ry: 36,
      portraitScale: 0.84,
    },
    {
      id: 39,
      region: "cerebellum",
      x: 565,
      y: 365,
      rx: 43,
      ry: 36,
      portraitScale: 0.84,
    },
    {
      id: 40,
      region: "cerebellum",
      x: 610,
      y: 354,
      rx: 40,
      ry: 36,
      portraitScale: 0.78,
    },
  ],
  [
    {
      id: 41,
      region: "brainstem",
      x: 430,
      y: 355,
      rx: 34,
      ry: 38,
      portraitScale: 0.72,
    },
    {
      id: 42,
      region: "brainstem",
      x: 461,
      y: 408,
      rx: 34,
      ry: 34,
      portraitScale: 0.68,
    },
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
      region: placement.region,
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
