import type { DeviceLibraryItem, DrawingAsset } from "@/lib/device-library";
import type { CadAsset, CadLayer, CadPrimitive } from "@/lib/cad-types";

function colorByFormat(format: DrawingAsset["format"]) {
  if (format === "dwg") return "#8fb4ff";
  if (format === "dxf") return "#7ce7c3";
  if (format === "pdf") return "#ffbf47";
  return "#d8e2ff";
}

export function createMockCadAssetFromDrawing(
  item: DeviceLibraryItem,
  drawingAsset: DrawingAsset
): CadAsset {
  const modules = Math.max(1, item.modules || 1);
  const width = modules * 42;
  const height = 118;
  const accent = colorByFormat(drawingAsset.format);

  const layers: CadLayer[] = [
    {
      id: "preview",
      name: "Preview image",
      visible: true,
      color: "#ffffff",
    },
    {
      id: "outline",
      name: "Outline",
      visible: true,
      color: "#dce7ff",
    },
    {
      id: "body",
      name: "Body",
      visible: true,
      color: "#c7d2e8",
    },
    {
      id: "details",
      name: "Details",
      visible: true,
      color: accent,
    },
    {
      id: "text",
      name: "Text",
      visible: true,
      color: "#f2f6ff",
    },
  ];

  const primitives: CadPrimitive[] = [];

  primitives.push({
    type: "polyline",
    layerId: "outline",
    stroke: "#dce7ff",
    strokeWidth: 2,
    closed: true,
    points: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
  });

  primitives.push({
    type: "polyline",
    layerId: "body",
    stroke: "#9fb0d1",
    strokeWidth: 1.4,
    fill: "rgba(255,255,255,0.03)",
    closed: true,
    points: [
      { x: 7, y: 8 },
      { x: width - 7, y: 8 },
      { x: width - 7, y: height - 28 },
      { x: 7, y: height - 28 },
    ],
  });

  const leverWidth = Math.max(10, Math.min(24, width * 0.24));

  primitives.push({
    type: "polyline",
    layerId: "details",
    stroke: accent,
    strokeWidth: 1.5,
    fill: "rgba(255,255,255,0.05)",
    closed: true,
    points: [
      { x: 10, y: 18 },
      { x: 10 + leverWidth, y: 18 },
      { x: 10 + leverWidth, y: height - 42 },
      { x: 10, y: height - 42 },
    ],
  });

  primitives.push({
    type: "line",
    layerId: "details",
    x1: 10 + leverWidth + 8,
    y1: 24,
    x2: width - 12,
    y2: 24,
    stroke: accent,
    strokeWidth: 2,
  });

  primitives.push({
    type: "line",
    layerId: "details",
    x1: 10 + leverWidth + 8,
    y1: 38,
    x2: width - 20,
    y2: 38,
    stroke: "#9fb0d1",
    strokeWidth: 1.4,
  });

  primitives.push({
    type: "line",
    layerId: "details",
    x1: 10 + leverWidth + 8,
    y1: 51,
    x2: width - 26,
    y2: 51,
    stroke: "#9fb0d1",
    strokeWidth: 1.4,
  });

  primitives.push({
    type: "circle",
    layerId: "details",
    cx: width - 18,
    cy: height - 45,
    r: 4,
    stroke: accent,
    strokeWidth: 1.4,
    fill: "rgba(255,255,255,0.06)",
  });

  primitives.push({
    type: "text",
    layerId: "text",
    x: 10,
    y: height - 12,
    text: item.article,
    size: 11,
    fill: "#f2f6ff",
  });

  primitives.push({
    type: "text",
    layerId: "text",
    x: 10,
    y: height - 42,
    text: item.series,
    size: 12,
    fill: "#dce7ff",
  });

  primitives.push({
    type: "text",
    layerId: "text",
    x: 10,
    y: height - 56,
    text: drawingAsset.label,
    size: 10,
    fill: accent,
  });

  return {
    id: crypto.randomUUID(),
    sourceFormat: drawingAsset.format,
    sourceUrl: drawingAsset.sourceUrl,
    sourceLabel: drawingAsset.label,
    previewUrl: item.catalogImageUrl,
    layers,
    primitives,
    bounds: {
      x: 0,
      y: 0,
      width,
      height,
    },
  };
}
