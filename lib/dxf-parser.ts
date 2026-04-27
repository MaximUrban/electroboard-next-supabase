import type { CadAsset, CadLayer, CadPrimitive } from "@/lib/cad-types";

type DxfPair = {
  code: number;
  value: string;
};

type EntityChunk = {
  type: string;
  pairs: DxfPair[];
};

type Point = {
  x: number;
  y: number;
};

type LayerInfo = {
  id: string;
  name: string;
  visible: boolean;
  color?: string;
};

type BlockDefinition = {
  name: string;
  basePoint: Point;
  entities: EntityChunk[];
};

type Transform2D = {
  insertX: number;
  insertY: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
};

function toNumber(value: string | undefined, fallback = 0) {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value: string) {
  return value
    .replace(/%%d/gi, "°")
    .replace(/%%p/gi, "±")
    .replace(/%%c/gi, "⌀");
}

function stripMTextFormatting(value: string) {
  return normalizeText(
    value
      .replace(/\\P/g, "\n")
      .replace(/\\X/g, " ")
      .replace(/\\~+/g, " ")
      .replace(/\\[A-Za-z][^;]*;/g, "")
      .replace(/[{}]/g, "")
      .replace(/\\+/g, "")
      .trim()
  );
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

function extractSection(pairs: DxfPair[], sectionName: string) {
  const result: DxfPair[] = [];
  let inSection = false;

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const next = pairs[i + 1];

    if (!inSection) {
      if (
        pair.code === 0 &&
        pair.value === "SECTION" &&
        next?.code === 2 &&
        next.value === sectionName
      ) {
        inSection = true;
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

function getLayerId(pairs: DxfPair[]) {
  return firstValue(pairs, 8) || "0";
}

function aciToHex(aci: number | undefined) {
  const map: Record<number, string> = {
    1: "#ff0000",
    2: "#ffff00",
    3: "#00ff00",
    4: "#00ffff",
    5: "#0000ff",
    6: "#ff00ff",
    7: "#ffffff",
    8: "#808080",
    9: "#c0c0c0",
    10: "#ff0000",
    20: "#ff7f00",
    30: "#ffff00",
    40: "#7fff00",
    50: "#00ff00",
    60: "#00ff7f",
    70: "#00ffff",
    80: "#007fff",
    90: "#0000ff",
    100: "#7f00ff",
    110: "#ff00ff",
    120: "#ff007f",
    130: "#7f0000",
    140: "#7f3f00",
    150: "#7f7f00",
    160: "#3f7f00",
    170: "#007f00",
    180: "#007f3f",
    190: "#007f7f",
    200: "#003f7f",
    210: "#00007f",
    220: "#3f007f",
    230: "#7f007f",
    240: "#7f003f",
    250: "#333333",
    251: "#505050",
    252: "#696969",
    253: "#828282",
    254: "#bebebe",
    255: "#ffffff",
  };

  if (!aci || aci <= 0) return undefined;
  return map[aci] || undefined;
}

function parseLayerTable(tablePairs: DxfPair[]): LayerInfo[] {
  const layers: LayerInfo[] = [];
  let i = 0;

  while (i < tablePairs.length) {
    const pair = tablePairs[i];

    if (pair.code === 0 && pair.value === "LAYER") {
      const entityPairs: DxfPair[] = [];
      i += 1;

      while (i < tablePairs.length) {
        const next = tablePairs[i];
        if (next.code === 0) break;
        entityPairs.push(next);
        i += 1;
      }

      const name = firstValue(entityPairs, 2) || "0";
      const flags = toNumber(firstValue(entityPairs, 70), 0);
      const aci = Math.abs(toNumber(firstValue(entityPairs, 62), 7));

      layers.push({
        id: name,
        name,
        visible: (flags & 1) === 0,
        color: aciToHex(aci),
      });

      continue;
    }

    i += 1;
  }

  return layers;
}

function parseTablesSection(tablePairs: DxfPair[]) {
  const layers: LayerInfo[] = [];
  let i = 0;

  while (i < tablePairs.length) {
    const pair = tablePairs[i];
    const next = tablePairs[i + 1];

    if (pair.code === 0 && pair.value === "TABLE" && next?.code === 2) {
      const tableName = next.value;
      i += 2;

      const body: DxfPair[] = [];
      while (i < tablePairs.length) {
        const current = tablePairs[i];
        if (current.code === 0 && current.value === "ENDTAB") {
          i += 1;
          break;
        }
        body.push(current);
        i += 1;
      }

      if (tableName === "LAYER") {
        layers.push(...parseLayerTable(body));
      }

      continue;
    }

    i += 1;
  }

  return layers;
}

function parseBlocksSection(blockPairs: DxfPair[]) {
  const blocks = new Map<string, BlockDefinition>();
  const chunks = chunkEntities(blockPairs);

  let i = 0;
  while (i < chunks.length) {
    const chunk = chunks[i];

    if (chunk.type !== "BLOCK") {
      i += 1;
      continue;
    }

    const name = firstValue(chunk.pairs, 2) || firstValue(chunk.pairs, 3) || "";
    const basePoint = {
      x: toNumber(firstValue(chunk.pairs, 10), 0),
      y: -toNumber(firstValue(chunk.pairs, 20), 0),
    };

    const entities: EntityChunk[] = [];
    i += 1;

    while (i < chunks.length && chunks[i].type !== "ENDBLK") {
      entities.push(chunks[i]);
      i += 1;
    }

    if (name) {
      blocks.set(name, {
        name,
        basePoint,
        entities,
      });
    }

    if (i < chunks.length && chunks[i].type === "ENDBLK") {
      i += 1;
    }
  }

  return blocks;
}

function transformPoint(point: Point, transform: Transform2D, basePoint?: Point): Point {
  const localX = point.x - (basePoint?.x ?? 0);
  const localY = point.y - (basePoint?.y ?? 0);

  const scaledX = localX * transform.scaleX;
  const scaledY = localY * transform.scaleY;

  const rad = (transform.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const rotatedX = scaledX * cos - scaledY * sin;
  const rotatedY = scaledX * sin + scaledY * cos;

  return {
    x: rotatedX + transform.insertX,
    y: rotatedY + transform.insertY,
  };
}

function transformPrimitive(
  primitive: CadPrimitive,
  transform: Transform2D,
  basePoint?: Point
): CadPrimitive {
  if (primitive.type === "line") {
    const p1 = transformPoint({ x: primitive.x1, y: primitive.y1 }, transform, basePoint);
    const p2 = transformPoint({ x: primitive.x2, y: primitive.y2 }, transform, basePoint);

    return {
      ...primitive,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      strokeWidth:
        primitive.strokeWidth != null
          ? primitive.strokeWidth * Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY))
          : primitive.strokeWidth,
    };
  }

  if (primitive.type === "polyline") {
    return {
      ...primitive,
      points: primitive.points.map((point) => transformPoint(point, transform, basePoint)),
      strokeWidth:
        primitive.strokeWidth != null
          ? primitive.strokeWidth * Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY))
          : primitive.strokeWidth,
    };
  }

  if (primitive.type === "circle") {
    const center = transformPoint({ x: primitive.cx, y: primitive.cy }, transform, basePoint);
    return {
      ...primitive,
      cx: center.x,
      cy: center.y,
      r: primitive.r * Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY)),
      strokeWidth:
        primitive.strokeWidth != null
          ? primitive.strokeWidth * Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY))
          : primitive.strokeWidth,
    };
  }

  const point = transformPoint({ x: primitive.x, y: primitive.y }, transform, basePoint);

  return {
    ...primitive,
    x: point.x,
    y: point.y,
    size:
      primitive.size != null
        ? primitive.size * Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY))
        : primitive.size,
    rotation: (primitive.rotation || 0) + transform.rotationDeg,
  };
}

function parseLine(chunk: EntityChunk): CadPrimitive | null {
  const layerId = getLayerId(chunk.pairs);
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
  const layerId = getLayerId(chunk.pairs);
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
  const layerId = getLayerId(chunk.pairs);
  const cx = toNumber(firstValue(chunk.pairs, 10));
  const cy = toNumber(firstValue(chunk.pairs, 20));
  const r = Math.abs(toNumber(firstValue(chunk.pairs, 40)));
  const startDeg = toNumber(firstValue(chunk.pairs, 50));
  const endDeg = toNumber(firstValue(chunk.pairs, 51));

  if (r <= 0) return null;

  let sweep = endDeg - startDeg;
  if (sweep <= 0) sweep += 360;

  const segments = Math.max(16, Math.ceil(sweep / 10));
  const points: Point[] = [];

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
  const layerId = getLayerId(chunk.pairs);
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
  const layerId = getLayerId(chunk.pairs);
  const x = toNumber(firstValue(chunk.pairs, 10));
  const y = toNumber(firstValue(chunk.pairs, 20));
  const text = normalizeText(firstValue(chunk.pairs, 1) || "");
  const size = toNumber(firstValue(chunk.pairs, 40), 12);
  const rotation = toNumber(firstValue(chunk.pairs, 50), 0);

  if (!text.trim()) return null;

  return {
    type: "text",
    layerId,
    x,
    y: -y,
    text,
    size: Math.max(8, size),
    rotation,
  };
}

function parseMText(chunk: EntityChunk): CadPrimitive | null {
  const layerId = getLayerId(chunk.pairs);
  const x = toNumber(firstValue(chunk.pairs, 10));
  const y = toNumber(firstValue(chunk.pairs, 20));
  const text1 = allValues(chunk.pairs, 1).join("");
  const text3 = allValues(chunk.pairs, 3).join("");
  const text = stripMTextFormatting(`${text1}${text3}`);
  const size = toNumber(firstValue(chunk.pairs, 40), 12);
  const rotation = toNumber(firstValue(chunk.pairs, 50), 0);

  if (!text.trim()) return null;

  return {
    type: "text",
    layerId,
    x,
    y: -y,
    text,
    size: Math.max(8, size),
    rotation,
  };
}

function parseEllipse(chunk: EntityChunk): CadPrimitive | null {
  const layerId = getLayerId(chunk.pairs);

  const cx = toNumber(firstValue(chunk.pairs, 10), 0);
  const cyRaw = toNumber(firstValue(chunk.pairs, 20), 0);

  const mx = toNumber(firstValue(chunk.pairs, 11), 0);
  const myRaw = toNumber(firstValue(chunk.pairs, 21), 0);

  const ratio = Math.abs(toNumber(firstValue(chunk.pairs, 40), 1));
  const startParam = toNumber(firstValue(chunk.pairs, 41), 0);
  const endParam = toNumber(firstValue(chunk.pairs, 42), Math.PI * 2);

  const my = -myRaw;
  const cy = -cyRaw;

  const majorLen = Math.sqrt(mx * mx + my * my);
  if (majorLen <= 0) return null;

  const ux = mx / majorLen;
  const uy = my / majorLen;
  const vx = -uy;
  const vy = ux;

  const minorLen = majorLen * ratio;

  let sweep = endParam - startParam;
  if (sweep <= 0) sweep += Math.PI * 2;

  const segments = Math.max(24, Math.ceil((sweep * 180) / Math.PI / 10));
  const points: Point[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = startParam + (sweep * i) / segments;
    const ex = cx + majorLen * Math.cos(t) * ux + minorLen * Math.sin(t) * vx;
    const ey = cy + majorLen * Math.cos(t) * uy + minorLen * Math.sin(t) * vy;
    points.push({ x: ex, y: ey });
  }

  return {
    type: "polyline",
    layerId,
    points,
    closed: Math.abs(sweep - Math.PI * 2) < 0.001,
    strokeWidth: 1,
  };
}

function parseSpline(chunk: EntityChunk): CadPrimitive | null {
  const layerId = getLayerId(chunk.pairs);

  const xs = allValues(chunk.pairs, 10).map((v) => toNumber(v));
  const ys = allValues(chunk.pairs, 20).map((v) => -toNumber(v));

  const fitXs = allValues(chunk.pairs, 11).map((v) => toNumber(v));
  const fitYs = allValues(chunk.pairs, 21).map((v) => -toNumber(v));

  const sourceXs = fitXs.length >= 2 ? fitXs : xs;
  const sourceYs = fitYs.length >= 2 ? fitYs : ys;

  const points = sourceXs
    .map((x, index) => ({
      x,
      y: sourceYs[index] ?? 0,
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  if (points.length < 2) return null;

  return {
    type: "polyline",
    layerId,
    points,
    strokeWidth: 1,
  };
}

function parsePolylineEntities(chunks: EntityChunk[], startIndex: number) {
  const head = chunks[startIndex];
  const layerId = getLayerId(head.pairs);
  const flags = toNumber(firstValue(head.pairs, 70), 0);
  const closed = (flags & 1) === 1;

  const points: Point[] = [];
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
    return { primitive: null as CadPrimitive | null, nextIndex: i };
  }

  return {
    primitive: {
      type: "polyline",
      layerId,
      points,
      closed,
      strokeWidth: 1,
    } as CadPrimitive,
    nextIndex: i,
  };
}

function parseInsertTransform(chunk: EntityChunk): Transform2D {
  return {
    insertX: toNumber(firstValue(chunk.pairs, 10), 0),
    insertY: -toNumber(firstValue(chunk.pairs, 20), 0),
    scaleX: toNumber(firstValue(chunk.pairs, 41), 1) || 1,
    scaleY: toNumber(firstValue(chunk.pairs, 42), 1) || 1,
    rotationDeg: toNumber(firstValue(chunk.pairs, 50), 0),
  };
}

function combineTransforms(parent: Transform2D, child: Transform2D): Transform2D {
  const childOrigin = transformPoint(
    { x: child.insertX, y: child.insertY },
    parent
  );

  return {
    insertX: childOrigin.x,
    insertY: childOrigin.y,
    scaleX: parent.scaleX * child.scaleX,
    scaleY: parent.scaleY * child.scaleY,
    rotationDeg: parent.rotationDeg + child.rotationDeg,
  };
}

function parseEntitiesToPrimitives(
  chunks: EntityChunk[],
  blocks: Map<string, BlockDefinition>,
  depth = 0,
  inheritedTransform?: Transform2D,
  blockBasePoint?: Point
): CadPrimitive[] {
  const primitives: CadPrimitive[] = [];
  const maxDepth = 6;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let primitive: CadPrimitive | null = null;

    if (chunk.type === "LINE") {
      primitive = parseLine(chunk);
    } else if (chunk.type === "CIRCLE") {
      primitive = parseCircle(chunk);
    } else if (chunk.type === "ARC") {
      primitive = arcToPolyline(chunk);
    } else if (chunk.type === "LWPOLYLINE") {
      primitive = parseLwPolyline(chunk);
    } else if (chunk.type === "ELLIPSE") {
      primitive = parseEllipse(chunk);
    } else if (chunk.type === "SPLINE") {
      primitive = parseSpline(chunk);
    } else if (chunk.type === "TEXT") {
      primitive = parseText(chunk);
    } else if (chunk.type === "MTEXT") {
      primitive = parseMText(chunk);
    } else if (chunk.type === "POLYLINE") {
      const result = parsePolylineEntities(chunks, i);
      if (result.primitive) {
        primitive = result.primitive;
      }
      i = Math.max(i, result.nextIndex - 1);
    } else if (chunk.type === "INSERT") {
      if (depth < maxDepth) {
        const blockName = firstValue(chunk.pairs, 2) || "";
        const block = blocks.get(blockName);

        if (block) {
          const currentTransform = parseInsertTransform(chunk);
          const finalTransform = inheritedTransform
            ? combineTransforms(inheritedTransform, currentTransform)
            : currentTransform;

          const inserted = parseEntitiesToPrimitives(
            block.entities,
            blocks,
            depth + 1,
            finalTransform,
            block.basePoint
          );

          primitives.push(...inserted);
        }
      }
    }

    if (primitive) {
      if (inheritedTransform) {
        primitives.push(transformPrimitive(primitive, inheritedTransform, blockBasePoint));
      } else {
        primitives.push(primitive);
      }
    }
  }

  return primitives;
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
      primitive.points.forEach((point) => touchPoint(point.x, point.y));
    } else if (primitive.type === "circle") {
      touchPoint(primitive.cx - primitive.r, primitive.cy - primitive.r);
      touchPoint(primitive.cx + primitive.r, primitive.cy + primitive.r);
    } else if (primitive.type === "text") {
      touchPoint(primitive.x, primitive.y);
    }
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
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
        points: primitive.points.map((point) => ({
          x: point.x - bounds.x,
          y: point.y - bounds.y,
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

function mergeLayers(primitives: CadPrimitive[], parsedLayers: LayerInfo[]): CadLayer[] {
  const map = new Map<string, CadLayer>();

  for (const layer of parsedLayers) {
    map.set(layer.id, {
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      color: layer.color,
    });
  }

  for (const primitive of primitives) {
    if (!map.has(primitive.layerId)) {
      map.set(primitive.layerId, {
        id: primitive.layerId,
        name: primitive.layerId,
        visible: true,
      });
    }
  }

  if (!map.size) {
    map.set("0", {
      id: "0",
      name: "0",
      visible: true,
    });
  }

  return [...map.values()];
}

export function parseDxfToCadAsset(fileName: string, text: string): CadAsset {
  const pairs = readPairs(text);

  const tablesSection = extractSection(pairs, "TABLES");
  const blocksSection = extractSection(pairs, "BLOCKS");
  const entitiesSection = extractSection(pairs, "ENTITIES");

  const parsedLayers = parseTablesSection(tablesSection);
  const blocks = parseBlocksSection(blocksSection);
  const entityChunks = chunkEntities(entitiesSection);

  const primitives = parseEntitiesToPrimitives(entityChunks, blocks);
  const normalized = normalizePrimitives(primitives);
  const layers = mergeLayers(normalized.primitives, parsedLayers);

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
