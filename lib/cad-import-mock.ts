import type { CadAsset, CadLayer, CadPrimitive } from "@/lib/cad-types";
import { parseDxfToCadAsset } from "@/lib/dxf-parser";

function detectFormat(fileName: string): CadAsset["sourceFormat"] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".dwg")) return "dwg";
  if (lower.endsWith(".dxf")) return "dxf";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".png")) return "png";
  return "jpg";
}

function accentByFormat(format: CadAsset["sourceFormat"]) {
  if (format === "dwg") return "#8fb4ff";
  if (format === "dxf") return "#7ce7c3";
  if (format === "pdf") return "#ffbf47";
  return "#dce7ff";
}

function createMockCadAssetFromImportedFileFallback(file: File): CadAsset {
  const format = detectFormat(file.name);
  const accent = accentByFormat(format);

  const width = 1200;
  const height = 800;

  const layers: CadLayer[] = [
    { id: "frame", name: "Frame", visible: true, color: "#dce7ff" },
    { id: "walls", name: "Walls", visible: true, color: "#9fb0d1" },
    { id: "electrical", name: "Electrical", visible: true, color: accent },
    { id: "dimensions", name: "Dimensions", visible: true, color: "#ffbf47" },
    { id: "text", name: "Text", visible: true, color: "#f2f6ff" },
  ];

  const primitives: CadPrimitive[] = [
    {
      type: "polyline",
      layerId: "frame",
      stroke: "#dce7ff",
      strokeWidth: 2,
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 1200, y: 0 },
        { x: 1200, y: 800 },
        { x: 0, y: 800 },
      ],
    },
    {
      type: "polyline",
      layerId: "walls",
      stroke: "#9fb0d1",
      strokeWidth: 6,
      closed: true,
      points: [
        { x: 80, y: 80 },
        { x: 1120, y: 80 },
        { x: 1120, y: 720 },
        { x: 80, y: 720 },
      ],
    },
    {
      type: "line",
      layerId: "walls",
      x1: 400,
      y1: 80,
      x2: 400,
      y2: 420,
      stroke: "#9fb0d1",
      strokeWidth: 6,
    },
    {
      type: "line",
      layerId: "walls",
      x1: 760,
      y1: 300,
      x2: 1120,
      y2: 300,
      stroke: "#9fb0d1",
      strokeWidth: 6,
    },
    {
      type: "circle",
      layerId: "electrical",
      cx: 220,
      cy: 200,
      r: 18,
      stroke: accent,
      strokeWidth: 2,
      fill: "rgba(255,255,255,0.03)",
    },
    {
      type: "circle",
      layerId: "electrical",
      cx: 320,
      cy: 200,
      r: 18,
      stroke: accent,
      strokeWidth: 2,
      fill: "rgba(255,255,255,0.03)",
    },
    {
      type: "line",
      layerId: "electrical",
      x1: 220,
      y1: 200,
      x2: 320,
      y2: 200,
      stroke: accent,
      strokeWidth: 2,
    },
    {
      type: "polyline",
      layerId: "electrical",
      stroke: accent,
      strokeWidth: 2,
      points: [
        { x: 500, y: 180 },
        { x: 650, y: 180 },
        { x: 650, y: 260 },
        { x: 920, y: 260 },
      ],
    },
    {
      type: "line",
      layerId: "dimensions",
      x1: 80,
      y1: 760,
      x2: 1120,
      y2: 760,
      stroke: "#ffbf47",
      strokeWidth: 1.5,
    },
    {
      type: "line",
      layerId: "dimensions",
      x1: 80,
      y1: 746,
      x2: 80,
      y2: 774,
      stroke: "#ffbf47",
      strokeWidth: 1.5,
    },
    {
      type: "line",
      layerId: "dimensions",
      x1: 1120,
      y1: 746,
      x2: 1120,
      y2: 774,
      stroke: "#ffbf47",
      strokeWidth: 1.5,
    },
    {
      type: "text",
      layerId: "text",
      x: 92,
      y: 40,
      text: `Imported drawing: ${file.name}`,
      size: 22,
      fill: "#f2f6ff",
    },
    {
      type: "text",
      layerId: "text",
      x: 92,
      y: 68,
      text: `Format: ${format.toUpperCase()} · mock import`,
      size: 14,
      fill: "#b9c7ef",
    },
    {
      type: "text",
      layerId: "dimensions",
      x: 560,
      y: 752,
      text: "1200",
      size: 14,
      fill: "#ffbf47",
    },
  ];

  return {
    id: crypto.randomUUID(),
    sourceFormat: format,
    sourceName: file.name,
    importedFileName: file.name,
    importMode: "drawing-import",
    layers,
    primitives,
    bounds: {
      x: 0,
      y: 0,
      width: 1200,
      height: 800,
    },
  };
}

export async function createMockCadAssetFromImportedFile(file: File): Promise<CadAsset> {
  const format = detectFormat(file.name);

  if (format === "dxf") {
    const text = await file.text();
    return parseDxfToCadAsset(file.name, text);
  }

  return createMockCadAssetFromImportedFileFallback(file);
}
