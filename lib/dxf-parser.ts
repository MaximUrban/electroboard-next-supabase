import type { CadAsset, CadLayer, CadPrimitive } from "@/lib/cad-types";

type DxfPair = {
  code: number;
  value: string;
};

type EntityChunk = {
  type: string;
  pairs: DxfPair[];
};

function toNumber(value: string | undefined, fallback = 0) {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function stripMTextFormatting(value: string) {
  return value
    .replace(/\\P/g, "\n")
    .replace(/\\[A-Za-z][^;]*;/g, "")
    .replace(/[{}]/g, "")
    .trim();
}

function readPairs(text: string): DxfPair[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const pairs: DxfPair[] = [];

  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = Number(lines[i].trim());
    const value = lines[i + 1] ?? "";
    if (!Number.isNaN(code)) {
      pairs.push({ code, value });
    }
  }

  return pairs;
}

function extractEntitiesSection(pairs: DxfPair[]) {
  const result: DxfPair[] = [];
  let inEntities = false;

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const next = pairs[i + 1];

    if (!inEntities) {
      if (pair.code === 0 && pair.value === "SECTION" && next?.code === 2 && next.value === "ENTITIES") {
        inEntities = true;
        i += 1;
      }
      continue;
    }

    if (pair.code === 0 && pair.value === "ENDSEC") {
      break;
    }

    result.push(pair);
  }

  return result;
}

function chunkEntities(entityPairs: DxfPair[]) {
  const chunks: EntityChunk[] = [];
  let current: EntityChunk | null = null;

  for (const pair of entityPairs) {
    if (pair.code === 0) {
      if (current) chunks.push(current);
      current = {
        type: pair.value,
        pairs: [],
      };
    } else if (current) {
      current.pairs.push(pair);
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function firstValue(pairs: DxfPair[], code: number) {
  return pairs.find((p) => p.code === code)?.value;
}

function allValues(pairs: DxfPair[], code: number) {
  return pairs.filter((p) => p.code === code).map((p) => p.value);
}

function parseLine(chunk: EntityChunk): CadPrimitive | null {
  const layerId = firstValue(chunk.pairs, 8) || "0";
  const x1 = toNumber(firstValue(chunk.pairs, 10));
  const y1 = toNumber(firstValue(chunk.pairs, 20));
  const x2 = toNumber(firstValue(chunk.pairs, 11));
  const y2 = toNumber(firstValue(chunk.pairs, 21));

  return {
    type: "line",
    layerId,
    x1,
    y1: -y1,
    x2,
    y2: -y2,
    strokeWidth: 1,
  };
}

function parseCircle(chunk: EntityChunk): CadPrimitive | null {
  const layerId = firstValue(chunk.pairs, 8) || "0";
  const cx = toNumber(firstValue(chunk.pairs, 10));
  const cy = toNumber(firstValue(chunk.pairs, 20));
  const r = Math.abs(toNumber(firstValue(chunk.pairs, 40)));

  if (r <= 0) return null;

  return {
    type: "circle",
    layerId,
    cx,
    cy: -cy,
    r,
    strokeWidth: 1,
  };
}

function arcToPolyline(chunk: EntityChunk): CadPrimitive | null {
  const layerId = firstValue(chunk.pairs, 8) || "0";
  const cx = toNumber(firstValue(chunk.pairs, 10));
  const cy = toNumber(firstValue(chunk.pairs, 20));
  const r = Math.abs(toNumber(firstValue(chunk.pairs, 40)));
  const startDeg = toNumber(firstValue(chunk.pairs, 50));
  const endDeg = toNumber(firstValue(chunk.pairs, 51));

  if (r <= 0) return null;

  let sweep = endDeg - startDeg;
  if (sweep <= 0) sweep += 360;

  const segments = Math.max(12, Math.ceil(sweep / 12));
  const points: { x: number; y: number }[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const deg = startDeg + sweep * t;
    const rad = (deg * Math.PI) / 180;
    points.push({
      x: cx + Math.cos(rad) * r,
      y: -(cy + Math.sin(rad) * r),
    });
  }

  return {
    type: "polyline",
    layerId,
    points,
    strokeWidth: 1,
  };
}

function parseLwPolyline(chunk: EntityChunk): CadPrimitive | null {
  const layerId = firstValue(chunk.pairs, 8) || "0";
  const xs = allValues(chunk.pairs, 10).map((v) => toNumber(v));
  const ys = allValues(chunk.pairs, 20).map((v) => -toNumber(v));
  const flags = toNumber(firstValue(chunk.pairs, 70), 0);
  const closed = (flags & 1) === 1;

  const points = xs
    .map((x, i) => ({
      x,
      y: ys[i] ?? 0,
    }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  if (points.length < 2) return null;

  return {
    type: "polyline",
    layerId,
    points,
    closed,
    strokeWidth: 1,
  };
}

function parseText(chunk: EntityChunk): CadPrimitive | null {
  const layerId = firstValue(chunk.pairs, 8) || "0";
  const x = toNumber(firstValue(chunk.pairs, 10));
  const y = toNumber(firstValue(chunk.pairs, 20));
  const text = firstValue(chunk.pairs, 1) || "";
  const size = toNumber(firstValue(chunk.pairs, 40), 12);

  if (!text.trim()) return null;

  return {
    type: "text",
    layerId,
    x,
    y: -y,
    text,
    size: Math.max(8, size),
  };
}

function parseMText(chunk: EntityChunk): CadPrimitive | null {
  const layerId = firstValue(chunk.pairs, 8) || "0";
  const x = toNumber(firstValue(chunk.pairs, 10));
  const y = toNumber(firstValue(chunk.pairs, 20));
  const text1 = allValues(chunk.pairs, 1).join("");
  const text3 = allValues(chunk.pairs, 3).join("");
  const text = stripMTextFormatting(`${text1}${text3}`);
  const size = toNumber(firstValue(chunk.pairs, 40), 12);

  if (!text.trim()) return null;

  return {
    type: "text",
    layerId,
    x,
    y: -y,
    text,
    size: Math.max(8, size),
  };
}

function parsePolylineEntities(chunks: EntityChunk[], startIndex: number) {
  const head = chunks[startIndex];
  const layerId = firstValue(head.pairs, 8) || "0";
  const flags = toNumber(firstValue(head.pairs, 70), 0);
  const closed = (flags & 1) === 1;

  const points: { x: number; y: number }[] = [];
  let i = startIndex + 1;

  while (i < chunks.length) {
    const chunk = chunks[i];

    if (chunk.type === "VERTEX") {
      const x = toNumber(firstValue(chunk.pairs, 10));
      const y = -toNumber(firstValue(chunk.pairs, 20));
      points.push({ x, y });
      i += 1;
      continue;
    }

    if (chunk.type === "SEQEND") {
      i += 1;
      break;
    }

    break;
  }

  if (points.length < 2) {
    return { primitive: null, nextIndex: i };
  }

  return {
    primitive: {
      type: "polyline",
      layerId,
      points,
      closed,
      strokeWidth: 1,
    } satisfies CadPrimitive,
    nextIndex: i,
  };
}

function collectLayers(primitives: CadPrimitive[]): CadLayer[] {
  const seen = new Map<string, CadLayer>();

  for (const primitive of primitives) {
    if (!seen.has(primitive.layerId)) {
      seen.set(primitive.layerId, {
        id: primitive.layerId,
        name: primitive.layerId,
        visible: true,
      });
    }
  }

  if (!seen.size) {
    seen.set("0", { id: "0", name: "0", visible: true });
  }

  return [...seen.values()];
}

function computeBounds(primitives: CadPrimitive[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function touchPoint(x: number, y: number) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  for (const primitive of primitives) {
    if (primitive.type === "line") {
      touchPoint(primitive.x1, primitive.y1);
      touchPoint(primitive.x2, primitive.y2);
    } else if (primitive.type === "polyline") {
      primitive.points.forEach((p) => touchPoint(p.x, p.y));
    } else if (primitive.type === "circle") {
      touchPoint(primitive.cx - primitive.r, primitive.cy - primitive.r);
      touchPoint(primitive.cx + primitive.r, primitive.cy + primitive.r);
    } else if (primitive.type === "text") {
      touchPoint(primitive.x, primitive.y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return {
      x: 0,
      y: 0,
      width: 1000,
      height: 700,
    };
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function normalizePrimitives(primitives: CadPrimitive[]) {
  const bounds = computeBounds(primitives);

  const shifted = primitives.map((primitive) => {
    if (primitive.type === "line") {
      return {
        ...primitive,
        x1: primitive.x1 - bounds.x,
        y1: primitive.y1 - bounds.y,
        x2: primitive.x2 - bounds.x,
        y2: primitive.y2 - bounds.y,
      };
    }

    if (primitive.type === "polyline") {
      return {
        ...primitive,
        points: primitive.points.map((p) => ({
          x: p.x - bounds.x,
          y: p.y - bounds.y,
        })),
      };
    }

    if (primitive.type === "circle") {
      return {
        ...primitive,
        cx: primitive.cx - bounds.x,
        cy: primitive.cy - bounds.y,
      };
    }

    return {
      ...primitive,
      x: primitive.x - bounds.x,
      y: primitive.y - bounds.y,
    };
  });

  return {
    primitives: shifted,
    bounds: {
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height,
    },
  };
}

export function parseDxfToCadAsset(fileName: string, text: string): CadAsset {
  const pairs = readPairs(text);
  const entityPairs = extractEntitiesSection(pairs);
  const chunks = chunkEntities(entityPairs);

  const primitives: CadPrimitive[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (chunk.type === "LINE") {
      const primitive = parseLine(chunk);
      if (primitive) primitives.push(primitive);
      continue;
    }

    if (chunk.type === "CIRCLE") {
      const primitive = parseCircle(chunk);
      if (primitive) primitives.push(primitive);
      continue;
    }

    if (chunk.type === "ARC") {
      const primitive = arcToPolyline(chunk);
      if (primitive) primitives.push(primitive);
      continue;
    }

    if (chunk.type === "LWPOLYLINE") {
      const primitive = parseLwPolyline(chunk);
      if (primitive) primitives.push(primitive);
      continue;
    }

    if (chunk.type === "POLYLINE") {
      const { primitive, nextIndex } = parsePolylineEntities(chunks, i);
      if (primitive) primitives.push(primitive);
      i = Math.max(i, nextIndex - 1);
      continue;
    }

    if (chunk.type === "TEXT") {
      const primitive = parseText(chunk);
      if (primitive) primitives.push(primitive);
      continue;
    }

    if (chunk.type === "MTEXT") {
      const primitive = parseMText(chunk);
      if (primitive) primitives.push(primitive);
      continue;
    }
  }

  const normalized = normalizePrimitives(primitives);
  const layers = collectLayers(normalized.primitives);

  return {
    id: crypto.randomUUID(),
    sourceFormat: "dxf",
    sourceName: fileName,
    importedFileName: fileName,
    importMode: "drawing-import",
    layers,
    primitives: normalized.primitives,
    bounds: normalized.bounds,
  };
}
