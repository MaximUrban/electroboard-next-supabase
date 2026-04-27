"use client";

import Link from "next/link";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getProjectById, saveProject } from "@/lib/projects";
import DeviceLibraryModal from "@/components/DeviceLibraryModal";
import type {
  DeviceLibraryItem,
  DrawingAsset,
  LibraryCountry,
} from "@/lib/device-library";
import type { CadAsset, CadPrimitive } from "@/lib/cad-types";
import { createMockCadAssetFromDrawing } from "@/lib/cad-mock";
import { createMockCadAssetFromImportedFile } from "@/lib/cad-import-mock";
import { importDwgOnServer } from "@/lib/dwg-import";

type Tool =
  | "select"
  | "rectangle"
  | "circle"
  | "line"
  | "cable"
  | "socket"
  | "switch";

type BaseShape = {
  id: string;
  type: "rectangle" | "circle" | "socket" | "switch" | "line" | "cable" | "cad";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  opacity: number;
  label: string;
  locked?: boolean;
  groupName?: string;
  cableType?: string;
};

type RectShape = BaseShape & {
  type: "rectangle";
};

type CircleShape = BaseShape & {
  type: "circle";
};

type SocketShape = BaseShape & {
  type: "socket";
};

type SwitchShape = BaseShape & {
  type: "switch";
};

type LineShape = BaseShape & {
  type: "line" | "cable";
  x2: number;
  y2: number;
};

type CadShape = BaseShape & {
  type: "cad";
  assetId: string;
  article: string;
  brand: string;
  series: string;
  modules: number;
  categoryLabel: string;
  country: LibraryCountry;
  layerState: Record<string, boolean>;
};

type Shape = RectShape | CircleShape | SocketShape | SwitchShape | LineShape | CadShape;

type ResizeHandle =
  | "n"
  | "s"
  | "e"
  | "w"
  | "nw"
  | "ne"
  | "sw"
  | "se";

type InteractionState =
  | {
      mode: "idle";
    }
  | {
      mode: "panning";
      startX: number;
      startY: number;
      startPanX: number;
      startPanY: number;
    }
  | {
      mode: "drawing";
      tool: Tool;
      shapeId: string;
      startX: number;
      startY: number;
    }
  | {
      mode: "dragging";
      startX: number;
      startY: number;
      initialShapes: Shape[];
      ids: string[];
    }
  | {
      mode: "resizing";
      shapeId: string;
      handle: ResizeHandle;
      startX: number;
      startY: number;
      initialShape: Shape;
    };

type GuideLine = {
  orientation: "vertical" | "horizontal";
  value: number;
};

type ProjectPayload = {
  id: string;
  name: string;
  shapes?: Shape[];
  cadAssets?: CadAsset[];
  view?: {
    zoom: number;
    panX: number;
    panY: number;
  };
};

const defaultStyle = {
  rotation: 0,
  strokeColor: "#d7e3ff",
  fillColor: "rgba(120, 149, 255, 0.10)",
  strokeWidth: 2,
  opacity: 1,
  label: "",
  locked: false,
  groupName: "",
  cableType: "",
};

function toSavedProjectData(payload: ProjectPayload) {
  const now = Date.now();

  return {
    id: payload.id,
    name: payload.name,
    data: payload,
    createdAt: now,
    updatedAt: now,
  };
}

const GRID_SIZE = 24;
const SNAP_DISTANCE = 8;
const MIN_SIZE = 24;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function distance(a: number, b: number) {
  return Math.abs(a - b);
}

function getLineBounds(shape: LineShape) {
  return {
    left: Math.min(shape.x, shape.x2),
    right: Math.max(shape.x, shape.x2),
    top: Math.min(shape.y, shape.y2),
    bottom: Math.max(shape.y, shape.y2),
    width: Math.abs(shape.x2 - shape.x),
    height: Math.abs(shape.y2 - shape.y),
    centerX: (shape.x + shape.x2) / 2,
    centerY: (shape.y + shape.y2) / 2,
  };
}

function getShapeBounds(shape: Shape) {
  if (shape.type === "line" || shape.type === "cable") {
    return getLineBounds(shape);
  }

  return {
    left: shape.x,
    right: shape.x + shape.width,
    top: shape.y,
    bottom: shape.y + shape.height,
    width: shape.width,
    height: shape.height,
    centerX: shape.x + shape.width / 2,
    centerY: shape.y + shape.height / 2,
  };
}

function resizeCursor(handle: ResizeHandle) {
  switch (handle) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    default:
      return "default";
  }
}

function pointsToString(points: { x: number; y: number }[]) {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function getCadShapeAsset(shape: Shape, assets: CadAsset[]) {
  if (shape.type !== "cad") return null;
  return assets.find((asset) => asset.id === shape.assetId) || null;
}

function enhanceCadStroke(primitive: CadPrimitive, zoom: number) {
  const base =
    primitive.type === "text"
      ? 1
      : (primitive.strokeWidth ?? 1);

  const minVisible = 1.25 / Math.max(zoom, 0.25);
  return Math.max(base * 1.35, minVisible);
}
function ensurePositiveRect(x: number, y: number, width: number, height: number) {
  let nextX = x;
  let nextY = y;
  let nextW = width;
  let nextH = height;

  if (nextW < 0) {
    nextX += nextW;
    nextW = Math.abs(nextW);
  }
  if (nextH < 0) {
    nextY += nextH;
    nextH = Math.abs(nextH);
  }

  return {
    x: nextX,
    y: nextY,
    width: nextW,
    height: nextH,
  };
}

function isCornerHandle(handle: ResizeHandle) {
  return handle === "nw" || handle === "ne" || handle === "sw" || handle === "se";
}

export default function ElectroBoard({ projectId }: { projectId: string }) {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [projectName, setProjectName] = useState("Project");
  const [tool, setTool] = useState<Tool>("select");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [cadAssets, setCadAssets] = useState<CadAsset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [interaction, setInteraction] = useState<InteractionState>({ mode: "idle" });
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(120);
  const [panY, setPanY] = useState(90);
  const [status, setStatus] = useState("Готово");
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryCountry, setLibraryCountry] = useState<LibraryCountry>("TR");
  const [canvasSize, setCanvasSize] = useState({ width: 1400, height: 900 });
  const [guideLines, setGuideLines] = useState<GuideLine[]>([]);
  const [history, setHistory] = useState<ProjectPayload[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const selectedShapes = useMemo(
    () => shapes.filter((shape) => selectedIds.includes(shape.id)),
    [shapes, selectedIds]
  );

  const primarySelected = selectedShapes[0] || null;
  const selectedCadAsset = primarySelected
    ? getCadShapeAsset(primarySelected, cadAssets)
    : null;

  const worldToScreen = useCallback(
    (x: number, y: number) => ({
      x: x * zoom + panX,
      y: y * zoom + panY,
    }),
    [zoom, panX, panY]
  );

  const screenToWorld = useCallback(
    (x: number, y: number) => ({
      x: (x - panX) / zoom,
      y: (y - panY) / zoom,
    }),
    [zoom, panX, panY]
  );

  const selectedBounds = useMemo(() => {
    if (!selectedShapes.length) return null;

    const bounds = selectedShapes.map(getShapeBounds);
    return {
      left: Math.min(...bounds.map((b) => b.left)),
      right: Math.max(...bounds.map((b) => b.right)),
      top: Math.min(...bounds.map((b) => b.top)),
      bottom: Math.max(...bounds.map((b) => b.bottom)),
    };
  }, [selectedShapes]);

  const commitHistory = useCallback(
    (nextShapes: Shape[], nextAssets: CadAsset[], nextView?: { zoom: number; panX: number; panY: number }) => {
      const payload: ProjectPayload = {
        id: projectId,
        name: projectName,
        shapes: nextShapes,
        cadAssets: nextAssets,
        view: nextView || { zoom, panX, panY },
      };

      setHistory((prev) => {
        const sliced = historyIndex >= 0 ? prev.slice(0, historyIndex + 1) : [];
        const merged = [...sliced, payload].slice(-60);
        setHistoryIndex(merged.length - 1);
        return merged;
      });

      saveProject(toSavedProjectData(payload));
    },
    [projectId, projectName, zoom, panX, panY, historyIndex]
  );

  useEffect(() => {
    const project = (getProjectById(projectId) as ProjectPayload | null) || null;

    if (project) {
      setProjectName(project.name || "Project");
      setShapes(Array.isArray(project.shapes) ? project.shapes : []);
      setCadAssets(Array.isArray(project.cadAssets) ? project.cadAssets : []);
      if (project.view) {
        setZoom(project.view.zoom || 1);
        setPanX(project.view.panX || 120);
        setPanY(project.view.panY || 90);
      }
      const initialPayload: ProjectPayload = {
        id: project.id,
        name: project.name || "Project",
        shapes: Array.isArray(project.shapes) ? project.shapes : [],
        cadAssets: Array.isArray(project.cadAssets) ? project.cadAssets : [],
        view: project.view || { zoom: 1, panX: 120, panY: 90 },
      };
      setHistory([initialPayload]);
      setHistoryIndex(0);
    }

    setLoaded(true);
  }, [projectId]);

  useEffect(() => {
    const onResize = () => {
      if (!boardRef.current) return;
      const rect = boardRef.current.getBoundingClientRect();
      setCanvasSize({
        width: rect.width,
        height: rect.height,
      });
    };

    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveProject(
  toSavedProjectData({
    id: projectId,
    name: projectName,
    shapes,
    cadAssets,
    view: { zoom, panX, panY },
  })
);
  }, [loaded, projectId, projectName, shapes, cadAssets, zoom, panX, panY]);

  const pushShapes = useCallback(
    (updater: Shape[] | ((prev: Shape[]) => Shape[]), options?: { commit?: boolean; assets?: CadAsset[] }) => {
      setShapes((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (options?.commit) {
          const nextAssets = options.assets || cadAssets;
          window.setTimeout(() => {
            commitHistory(next, nextAssets);
          }, 0);
        }
        return next;
      });
    },
    [cadAssets, commitHistory]
  );

  const setShapeLocked = useCallback(
    (ids: string[], locked: boolean) => {
      pushShapes(
        (prev) =>
          prev.map((shape) =>
            ids.includes(shape.id)
              ? {
                  ...shape,
                  locked,
                }
              : shape
          ),
        { commit: true }
      );
      setStatus(locked ? "Объект заблокирован" : "Блокировка снята");
    },
    [pushShapes]
  );

  const addCadFromLibrary = useCallback(
    (item: DeviceLibraryItem, drawingAsset: DrawingAsset) => {
      const cadAsset = createMockCadAssetFromDrawing(item, drawingAsset);

      const fitWidth = 220;
      const scale = fitWidth / Math.max(cadAsset.bounds.width, 1);
      const width = cadAsset.bounds.width * scale;
      const height = cadAsset.bounds.height * scale;

      const center = screenToWorld(canvasSize.width / 2, canvasSize.height / 2);

      const shape: CadShape = {
        id: crypto.randomUUID(),
        type: "cad",
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
        assetId: cadAsset.id,
        article: item.article,
        brand: item.brand,
        series: item.series,
        modules: item.modules,
        categoryLabel: item.categoryLabel,
        country: item.country,
        layerState: Object.fromEntries(cadAsset.layers.map((layer) => [layer.id, layer.visible])),
        ...defaultStyle,
        fillColor: "rgba(17, 24, 39, 0.10)",
        strokeColor: "#dbe7ff",
        label: item.article,
      };

      setCadAssets((prevAssets) => {
        const nextAssets = [...prevAssets, cadAsset];
        pushShapes((prevShapes) => [...prevShapes, shape], {
          commit: true,
          assets: nextAssets,
        });
        return nextAssets;
      });

      setSelectedIds([shape.id]);
      setTool("select");
      setShowLibrary(false);
      setStatus(`Добавлен элемент: ${item.article}`);
    },
    [canvasSize.width, canvasSize.height, pushShapes, screenToWorld]
  );

  const placeImportedCadAsset = useCallback(
    (cadAsset: CadAsset, displayName: string) => {
      const fitWidth = 900;
      const scale = fitWidth / Math.max(1, cadAsset.bounds.width);
      const width = cadAsset.bounds.width * scale;
      const height = cadAsset.bounds.height * scale;
      const center = screenToWorld(canvasSize.width / 2, canvasSize.height / 2);

      const shape: CadShape = {
        id: crypto.randomUUID(),
        type: "cad",
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
        assetId: cadAsset.id,
        article: displayName,
        brand: "Imported",
        series: "Drawing",
        modules: 0,
        categoryLabel: "Imported drawing",
        country: "TR",
        layerState: Object.fromEntries(cadAsset.layers.map((layer) => [layer.id, layer.visible])),
        ...defaultStyle,
        strokeColor: "#e5eeff",
        fillColor: "rgba(12,16,32,0.18)",
        label: displayName,
      };

      setCadAssets((prevAssets) => {
        const nextAssets = [...prevAssets, cadAsset];
        pushShapes((prevShapes) => [...prevShapes, shape], {
          commit: true,
          assets: nextAssets,
        });
        return nextAssets;
      });

      setSelectedIds([shape.id]);
    },
    [canvasSize.width, canvasSize.height, pushShapes, screenToWorld]
  );

  const importDrawingFile = useCallback(
    async (file: File) => {
      try {
        const lower = file.name.toLowerCase();
        const isDwg = lower.endsWith(".dwg");
        const isDxf = lower.endsWith(".dxf");

        setStatus(`Импорт: ${file.name}...`);

        if (isDwg) {
          const result = await importDwgOnServer(file);

          if (result.ok) {
            placeImportedCadAsset(result.asset, file.name);
            setStatus(`DWG импортирован: ${file.name}`);
            return;
          }

          const shouldFallback =
            result.status === 501 ||
            result.error.toLowerCase().includes("конвертер") ||
            result.error.toLowerCase().includes("not configured") ||
            result.error.toLowerCase().includes("not connected");

          if (!shouldFallback) {
            alert(result.details ? `${result.error}\n\n${result.details}` : result.error);
            setStatus(`DWG не импортирован: ${result.error}`);
            return;
          }
        }

        const asset = await createMockCadAssetFromImportedFile(file);
        placeImportedCadAsset(asset, file.name);
        setStatus(isDxf ? `DXF импортирован: ${file.name}` : `Чертёж импортирован: ${file.name}`);
      } catch (error) {
        console.error(error);
        alert("Ошибка импорта файла");
        setStatus(`Ошибка импорта: ${file.name}`);
      }
    },
    [placeImportedCadAsset]
  );

  const updateCadLayerVisibility = useCallback(
    (shapeId: string, layerId: string, visible: boolean) => {
      pushShapes(
        (prev) =>
          prev.map((shape) =>
            shape.id === shapeId && shape.type === "cad"
              ? {
                  ...shape,
                  layerState: {
                    ...shape.layerState,
                    [layerId]: visible,
                  },
                }
              : shape
          ),
        { commit: true }
      );
    },
    [pushShapes]
  );

  const alignWithOtherShapes = useCallback(
    (shapeId: string, targetX: number, targetY: number, width: number, height: number) => {
      const others = shapes.filter((shape) => shape.id !== shapeId);
      const guides: GuideLine[] = [];

      const candidateX = [
        { key: "left", value: targetX },
        { key: "centerX", value: targetX + width / 2 },
        { key: "right", value: targetX + width },
      ];

      const candidateY = [
        { key: "top", value: targetY },
        { key: "centerY", value: targetY + height / 2 },
        { key: "bottom", value: targetY + height },
      ];

      let snapDx = 0;
      let snapDy = 0;
      let bestX = SNAP_DISTANCE / zoom;
      let bestY = SNAP_DISTANCE / zoom;

      for (const other of others) {
        const b = getShapeBounds(other);
        const otherX = [b.left, b.centerX, b.right];
        const otherY = [b.top, b.centerY, b.bottom];

        for (const cx of candidateX) {
          for (const ox of otherX) {
            const diff = ox - cx.value;
            if (distance(ox, cx.value) < bestX) {
              bestX = distance(ox, cx.value);
              snapDx = diff;
              guides.push({ orientation: "vertical", value: ox });
            }
          }
        }

        for (const cy of candidateY) {
          for (const oy of otherY) {
            const diff = oy - cy.value;
            if (distance(oy, cy.value) < bestY) {
              bestY = distance(oy, cy.value);
              snapDy = diff;
              guides.push({ orientation: "horizontal", value: oy });
            }
          }
        }
      }

      return {
        x: targetX + snapDx,
        y: targetY + snapDy,
        guides: [
          ...guides.filter((g, index, arr) => arr.findIndex((x) => x.orientation === g.orientation && distance(x.value, g.value) < 0.001) === index),
        ],
      };
    },
    [shapes, zoom]
  );

  const createShape = useCallback(
    (shapeTool: Tool, x: number, y: number): Shape => {
      const id = crypto.randomUUID();

      if (shapeTool === "line" || shapeTool === "cable") {
        return {
          id,
          type: shapeTool,
          x,
          y,
          x2: x + 1,
          y2: y + 1,
          width: 1,
          height: 1,
          ...defaultStyle,
          strokeColor: shapeTool === "cable" ? "#f8b84e" : "#cfe0ff",
          fillColor: "transparent",
          cableType: shapeTool === "cable" ? "NYM" : "",
        };
      }

      if (shapeTool === "socket") {
        return {
          id,
          type: "socket",
          x,
          y,
          width: 56,
          height: 56,
          ...defaultStyle,
          label: "Socket",
        };
      }

      if (shapeTool === "switch") {
        return {
          id,
          type: "switch",
          x,
          y,
          width: 56,
          height: 56,
          ...defaultStyle,
          label: "Switch",
        };
      }

      if (shapeTool === "circle") {
        return {
          id,
          type: "circle",
          x,
          y,
          width: 88,
          height: 88,
          ...defaultStyle,
        };
      }

      return {
        id,
        type: "rectangle",
        x,
        y,
        width: 140,
        height: 90,
        ...defaultStyle,
      };
    },
    []
  );

  const handleBoardPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.button !== 1) return;

      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;

      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const world = screenToWorld(sx, sy);

      if (tool === "select") {
        if (event.button === 1 || event.altKey || event.metaKey) {
          setInteraction({
            mode: "panning",
            startX: sx,
            startY: sy,
            startPanX: panX,
            startPanY: panY,
          });
          return;
        }

        setSelectedIds([]);
        setGuideLines([]);
        return;
      }

      const shape = createShape(tool, world.x, world.y);
      setShapes((prev) => [...prev, shape]);
      setSelectedIds([shape.id]);
      setInteraction({
        mode: "drawing",
        tool,
        shapeId: shape.id,
        startX: world.x,
        startY: world.y,
      });
    },
    [tool, screenToWorld, createShape, panX, panY]
  );

  const handleShapePointerDown = useCallback(
    (event: React.PointerEvent, shape: Shape) => {
      event.stopPropagation();
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;

      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;

      const shift = event.shiftKey;
      const alreadySelected = selectedIds.includes(shape.id);

      let nextSelected = selectedIds;

      if (shift) {
        nextSelected = alreadySelected
          ? selectedIds.filter((id) => id !== shape.id)
          : [...selectedIds, shape.id];
        setSelectedIds(nextSelected);
        setStatus(`Выбрано: ${nextSelected.length}`);
        return;
      }

      if (!alreadySelected) {
        nextSelected = [shape.id];
        setSelectedIds(nextSelected);
      }

      if (shape.locked) {
        setStatus("Объект заблокирован для перемещения");
        return;
      }

      const ids = alreadySelected ? selectedIds : [shape.id];
      const initialShapes = shapes.filter((item) => ids.includes(item.id));

      setInteraction({
        mode: "dragging",
        startX: sx,
        startY: sy,
        initialShapes,
        ids,
      });
    },
    [selectedIds, shapes]
  );

  const startResize = useCallback(
    (event: React.PointerEvent, shape: Shape, handle: ResizeHandle) => {
      event.stopPropagation();

      if (shape.locked) {
        setStatus("Объект заблокирован для перемещения");
        return;
      }

      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;

      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;

      setSelectedIds([shape.id]);
      setInteraction({
        mode: "resizing",
        shapeId: shape.id,
        handle,
        startX: sx,
        startY: sy,
        initialShape: shape,
      });
    },
    []
  );

  const updateDrawingShape = useCallback(
    (shapeId: string, startX: number, startY: number, currentX: number, currentY: number, activeTool: Tool) => {
      pushShapes((prev) =>
        prev.map((shape) => {
          if (shape.id !== shapeId) return shape;

          if (shape.type === "line" || shape.type === "cable") {
            return {
              ...shape,
              x2: currentX,
              y2: currentY,
            };
          }

          if (activeTool === "circle") {
            const size = Math.max(Math.abs(currentX - startX), Math.abs(currentY - startY));
            const next = ensurePositiveRect(
              currentX >= startX ? startX : startX - size,
              currentY >= startY ? startY : startY - size,
              size,
              size
            );
            return {
              ...shape,
              ...next,
            };
          }

          const next = ensurePositiveRect(startX, startY, currentX - startX, currentY - startY);
          return {
            ...shape,
            ...next,
          };
        })
      );
    },
    [pushShapes]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;

      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const world = screenToWorld(sx, sy);

      if (interaction.mode === "panning") {
        setPanX(interaction.startPanX + (sx - interaction.startX));
        setPanY(interaction.startPanY + (sy - interaction.startY));
        return;
      }

      if (interaction.mode === "drawing") {
        updateDrawingShape(
          interaction.shapeId,
          interaction.startX,
          interaction.startY,
          world.x,
          world.y,
          interaction.tool
        );
        return;
      }

      if (interaction.mode === "dragging") {
        const dx = (sx - interaction.startX) / zoom;
        const dy = (sy - interaction.startY) / zoom;

        const primary = interaction.initialShapes[0];
        if (!primary) return;

        const pb = getShapeBounds(primary);
        const candidateX = pb.left + dx;
        const candidateY = pb.top + dy;
        const aligned = alignWithOtherShapes(primary.id, candidateX, candidateY, pb.width, pb.height);

        const extraDx = aligned.x - candidateX;
        const extraDy = aligned.y - candidateY;

        setGuideLines(aligned.guides);

        pushShapes((prev) =>
          prev.map((shape) => {
            const original = interaction.initialShapes.find((item) => item.id === shape.id);
            if (!original) return shape;

            if (shape.type === "line" || shape.type === "cable") {
  if (original.type !== "line" && original.type !== "cable") {
    return shape;
  }

  return {
    ...shape,
    x: original.x + dx + extraDx,
    y: original.y + dy + extraDy,
    x2: original.x2 + dx + extraDx,
    y2: original.y2 + dy + extraDy,
  };
}

            return {
              ...shape,
              x: original.x + dx + extraDx,
              y: original.y + dy + extraDy,
            };
          })
        );
        return;
      }

      if (interaction.mode === "resizing") {
        const dx = (sx - interaction.startX) / zoom;
        const dy = (sy - interaction.startY) / zoom;
        const shape = interaction.initialShape;

        if (shape.type === "line" || shape.type === "cable") return;

        const start = {
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
        };

        let x = start.x;
        let y = start.y;
        let width = start.width;
        let height = start.height;

        if (interaction.handle.includes("e")) {
          width = start.width + dx;
        }
        if (interaction.handle.includes("s")) {
          height = start.height + dy;
        }
        if (interaction.handle.includes("w")) {
          x = start.x + dx;
          width = start.width - dx;
        }
        if (interaction.handle.includes("n")) {
          y = start.y + dy;
          height = start.height - dy;
        }

        if (isCornerHandle(interaction.handle)) {
          const ratio = start.width / Math.max(start.height, 1);
          const signX = interaction.handle.includes("w") ? -1 : 1;
          const signY = interaction.handle.includes("n") ? -1 : 1;
          const dominant = Math.max(Math.abs(dx), Math.abs(dy));
          width = Math.max(MIN_SIZE, start.width + dominant * signX);
          height = Math.max(MIN_SIZE, width / ratio);

          if (interaction.handle.includes("w")) {
            x = start.x + (start.width - width);
          } else {
            x = start.x;
          }

          if (interaction.handle.includes("n")) {
            y = start.y + (start.height - height);
          } else {
            y = start.y;
          }
        } else {
          width = Math.max(MIN_SIZE, width);
          height = Math.max(MIN_SIZE, height);
        }

        const aligned = alignWithOtherShapes(shape.id, x, y, width, height);
        setGuideLines(aligned.guides);

        pushShapes((prev) =>
          prev.map((item) =>
            item.id === shape.id && item.type !== "line" && item.type !== "cable"
              ? {
                  ...item,
                  x: aligned.x,
                  y: aligned.y,
                  width,
                  height,
                }
              : item
          )
        );
      }
    },
    [interaction, screenToWorld, zoom, updateDrawingShape, pushShapes, alignWithOtherShapes]
  );

  const finishInteraction = useCallback(() => {
    if (interaction.mode === "drawing" || interaction.mode === "dragging" || interaction.mode === "resizing") {
      commitHistory(shapes, cadAssets, { zoom, panX, panY });
    }
    setGuideLines([]);
    setInteraction({ mode: "idle" });
  }, [interaction.mode, commitHistory, shapes, cadAssets, zoom, panX, panY]);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();

      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;

      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const worldBefore = screenToWorld(sx, sy);

      const delta = event.deltaY > 0 ? 0.92 : 1.08;
      const nextZoom = clamp(zoom * delta, 0.15, 4);

      setZoom(nextZoom);

      const nextPanX = sx - worldBefore.x * nextZoom;
      const nextPanY = sy - worldBefore.y * nextZoom;
      setPanX(nextPanX);
      setPanY(nextPanY);
    },
    [screenToWorld, zoom]
  );

  const deleteSelected = useCallback(() => {
    if (!selectedIds.length) return;

    const ids = new Set(selectedIds);
    const remainingShapes = shapes.filter((shape) => !ids.has(shape.id));
    const usedCadAssetIds = new Set(
      remainingShapes.filter((shape): shape is CadShape => shape.type === "cad").map((shape) => shape.assetId)
    );
    const remainingAssets = cadAssets.filter((asset) => usedCadAssetIds.has(asset.id));

    setShapes(remainingShapes);
    setCadAssets(remainingAssets);
    setSelectedIds([]);
    commitHistory(remainingShapes, remainingAssets);
    setStatus("Выбранные объекты удалены");
  }, [selectedIds, shapes, cadAssets, commitHistory]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    const state = history[nextIndex];
    if (!state) return;

    setHistoryIndex(nextIndex);
    setShapes(state.shapes || []);
    setCadAssets(state.cadAssets || []);
    setProjectName(state.name || "Project");
    if (state.view) {
      setZoom(state.view.zoom || 1);
      setPanX(state.view.panX || 120);
      setPanY(state.view.panY || 90);
    }
    setSelectedIds([]);
    setStatus("Undo");
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    const state = history[nextIndex];
    if (!state) return;

    setHistoryIndex(nextIndex);
    setShapes(state.shapes || []);
    setCadAssets(state.cadAssets || []);
    setProjectName(state.name || "Project");
    if (state.view) {
      setZoom(state.view.zoom || 1);
      setPanX(state.view.panX || 120);
      setPanY(state.view.panY || 90);
    }
    setSelectedIds([]);
    setStatus("Redo");
  }, [history, historyIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))
      ) {
        event.preventDefault();
        redo();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        const active = document.activeElement;
        const tag = active?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea") return;
        deleteSelected();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedIds(shapes.map((shape) => shape.id));
      }

      if (event.key === "Escape") {
        setInteraction({ mode: "idle" });
        setGuideLines([]);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, redo, shapes, undo]);

  const renderCadPrimitive = useCallback(
    (primitive: CadPrimitive, shape: CadShape, asset: CadAsset) => {
      const visible = shape.layerState[primitive.layerId] ?? true;
      if (!visible) return null;

      const scaleX = shape.width / Math.max(asset.bounds.width, 1);
      const scaleY = shape.height / Math.max(asset.bounds.height, 1);

      const mapX = (x: number) => shape.x + x * scaleX;
const mapY = (y: number) => shape.y + y * scaleY;

const stroke =
  primitive.type !== "text" && "stroke" in primitive
    ? primitive.stroke || "#e7efff"
    : "#e7efff";

const strokeWidth =
  enhanceCadStroke(primitive, zoom) * Math.max(scaleX, scaleY) * 0.35;
      if (primitive.type === "line") {
        return (
          <line
            key={`${shape.id}-${primitive.layerId}-${primitive.x1}-${primitive.y1}-${primitive.x2}-${primitive.y2}`}
            x1={mapX(primitive.x1)}
            y1={mapY(primitive.y1)}
            x2={mapX(primitive.x2)}
            y2={mapY(primitive.y2)}
            stroke={stroke}
            strokeWidth={strokeWidth}
            opacity={0.98}
          />
        );
      }

      if (primitive.type === "polyline") {
        return (
          <polyline
            key={`${shape.id}-${primitive.layerId}-${primitive.points.length}-${primitive.points[0]?.x ?? 0}`}
            points={pointsToString(primitive.points.map((p) => ({ x: mapX(p.x), y: mapY(p.y) })))}
            fill={primitive.closed ? primitive.fill || "rgba(255,255,255,0.02)" : "none"}
            stroke={stroke}
            strokeWidth={strokeWidth}
            opacity={0.98}
          />
        );
      }

      if (primitive.type === "circle") {
        return (
          <circle
            key={`${shape.id}-${primitive.layerId}-${primitive.cx}-${primitive.cy}-${primitive.r}`}
            cx={mapX(primitive.cx)}
            cy={mapY(primitive.cy)}
            r={primitive.r * Math.max(scaleX, scaleY)}
            fill={primitive.fill || "none"}
            stroke={stroke}
            strokeWidth={strokeWidth}
            opacity={0.98}
          />
        );
      }

      return (
        <text
          key={`${shape.id}-${primitive.layerId}-${primitive.x}-${primitive.y}-${primitive.text}`}
          x={mapX(primitive.x)}
          y={mapY(primitive.y)}
          fontSize={Math.max(primitive.size || 12, 12) * Math.max(scaleX, scaleY) * 0.85}
          fill={primitive.fill || "#f2f7ff"}
          opacity={0.98}
        >
          {primitive.text}
        </text>
      );
    },
    [zoom]
  );

  const renderShape = useCallback(
    (shape: Shape) => {
      const selected = selectedIds.includes(shape.id);

      if (shape.type === "line" || shape.type === "cable") {
        const line = shape as LineShape;
        return (
          <g key={shape.id}>
            <line
              x1={line.x}
              y1={line.y}
              x2={line.x2}
              y2={line.y2}
              stroke={shape.strokeColor}
              strokeWidth={shape.strokeWidth}
              strokeDasharray={shape.type === "cable" ? "8 6" : undefined}
              opacity={shape.opacity}
              onPointerDown={(event) => handleShapePointerDown(event, shape)}
              style={{ cursor: shape.locked ? "not-allowed" : "move" }}
            />
            {selected && (
              <>
                <circle cx={line.x} cy={line.y} r={6 / zoom} fill="#7fb2ff" />
                <circle cx={line.x2} cy={line.y2} r={6 / zoom} fill="#7fb2ff" />
              </>
            )}
          </g>
        );
      }

      if (shape.type === "cad") {
        const asset = cadAssets.find((item) => item.id === shape.assetId);
        return (
          <g key={shape.id}>
            <rect
              x={shape.x}
              y={shape.y}
              width={shape.width}
              height={shape.height}
              fill="rgba(7,10,20,0.15)"
              stroke={selected ? "#7fb2ff" : "rgba(255,255,255,0.10)"}
              strokeWidth={selected ? 2 / zoom : 1 / zoom}
              rx={10 / zoom}
              ry={10 / zoom}
              onPointerDown={(event) => handleShapePointerDown(event, shape)}
              style={{ cursor: shape.locked ? "not-allowed" : "move" }}
            />
            {asset?.previewUrl ? (
              <image
                href={asset.previewUrl}
                x={shape.x}
                y={shape.y}
                width={shape.width}
                height={shape.height}
                preserveAspectRatio="xMidYMid meet"
                opacity={0.12}
                onPointerDown={(event) => handleShapePointerDown(event, shape)}
                style={{ cursor: shape.locked ? "not-allowed" : "move", pointerEvents: "none" }}
              />
            ) : null}
            {asset ? (
              <g
                onPointerDown={(event) => handleShapePointerDown(event, shape)}
                style={{ cursor: shape.locked ? "not-allowed" : "move" }}
              >
                {asset.primitives.map((primitive) => renderCadPrimitive(primitive, shape, asset))}
              </g>
            ) : null}
            {shape.label ? (
              <text
                x={shape.x}
                y={shape.y - 8 / zoom}
                fontSize={12 / zoom}
                fill="#dfe9ff"
                opacity={0.95}
              >
                {shape.label}
              </text>
            ) : null}
          </g>
        );
      }

      if (shape.type === "circle") {
        return (
          <g key={shape.id}>
            <ellipse
              cx={shape.x + shape.width / 2}
              cy={shape.y + shape.height / 2}
              rx={shape.width / 2}
              ry={shape.height / 2}
              fill={shape.fillColor}
              stroke={shape.strokeColor}
              strokeWidth={shape.strokeWidth}
              opacity={shape.opacity}
              onPointerDown={(event) => handleShapePointerDown(event, shape)}
              style={{ cursor: shape.locked ? "not-allowed" : "move" }}
            />
          </g>
        );
      }

      if (shape.type === "socket") {
        return (
          <g key={shape.id}>
            <rect
              x={shape.x}
              y={shape.y}
              width={shape.width}
              height={shape.height}
              rx={12 / zoom}
              ry={12 / zoom}
              fill="rgba(255,255,255,0.06)"
              stroke={shape.strokeColor}
              strokeWidth={shape.strokeWidth}
              onPointerDown={(event) => handleShapePointerDown(event, shape)}
              style={{ cursor: shape.locked ? "not-allowed" : "move" }}
            />
            <circle cx={shape.x + shape.width * 0.35} cy={shape.y + shape.height * 0.48} r={4 / zoom} fill="#dbe8ff" />
            <circle cx={shape.x + shape.width * 0.65} cy={shape.y + shape.height * 0.48} r={4 / zoom} fill="#dbe8ff" />
          </g>
        );
      }

      if (shape.type === "switch") {
        return (
          <g key={shape.id}>
            <rect
              x={shape.x}
              y={shape.y}
              width={shape.width}
              height={shape.height}
              rx={12 / zoom}
              ry={12 / zoom}
              fill="rgba(255,255,255,0.05)"
              stroke={shape.strokeColor}
              strokeWidth={shape.strokeWidth}
              onPointerDown={(event) => handleShapePointerDown(event, shape)}
              style={{ cursor: shape.locked ? "not-allowed" : "move" }}
            />
            <line
              x1={shape.x + shape.width * 0.35}
              y1={shape.y + shape.height * 0.65}
              x2={shape.x + shape.width * 0.65}
              y2={shape.y + shape.height * 0.35}
              stroke="#dbe8ff"
              strokeWidth={2 / zoom}
              pointerEvents="none"
            />
          </g>
        );
      }

      return (
        <g key={shape.id}>
          <rect
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            fill={shape.fillColor}
            stroke={shape.strokeColor}
            strokeWidth={shape.strokeWidth}
            opacity={shape.opacity}
            rx={12 / zoom}
            ry={12 / zoom}
            onPointerDown={(event) => handleShapePointerDown(event, shape)}
            style={{ cursor: shape.locked ? "not-allowed" : "move" }}
          />
          {shape.label ? (
            <text
              x={shape.x + 10 / zoom}
              y={shape.y + 20 / zoom}
              fontSize={13 / zoom}
              fill="#edf4ff"
              pointerEvents="none"
            >
              {shape.label}
            </text>
          ) : null}
        </g>
      );
    },
    [cadAssets, handleShapePointerDown, renderCadPrimitive, selectedIds, zoom]
  );

  const renderSelectionBox = useCallback(
    (shape: Shape) => {
      if (shape.type === "line" || shape.type === "cable") return null;

      const selected = selectedIds.includes(shape.id);
      if (!selected) return null;

      const handles: { handle: ResizeHandle; x: number; y: number }[] = [
        { handle: "nw", x: shape.x, y: shape.y },
        { handle: "n", x: shape.x + shape.width / 2, y: shape.y },
        { handle: "ne", x: shape.x + shape.width, y: shape.y },
        { handle: "e", x: shape.x + shape.width, y: shape.y + shape.height / 2 },
        { handle: "se", x: shape.x + shape.width, y: shape.y + shape.height },
        { handle: "s", x: shape.x + shape.width / 2, y: shape.y + shape.height },
        { handle: "sw", x: shape.x, y: shape.y + shape.height },
        { handle: "w", x: shape.x, y: shape.y + shape.height / 2 },
      ];

      return (
        <g key={`${shape.id}-selection`}>
          <rect
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            fill="none"
            stroke="#7fb2ff"
            strokeWidth={1.5 / zoom}
            strokeDasharray={`${6 / zoom} ${4 / zoom}`}
            pointerEvents="none"
          />
          {handles.map((item) => (
            <circle
              key={item.handle}
              cx={item.x}
              cy={item.y}
              r={6 / zoom}
              fill="#0d152d"
              stroke="#7fb2ff"
              strokeWidth={1.5 / zoom}
              onPointerDown={(event) => startResize(event, shape, item.handle)}
              style={{
                cursor: resizeCursor(item.handle),
              }}
            />
          ))}
          {shape.locked ? (
            <text
              x={shape.x + shape.width - 14 / zoom}
              y={shape.y - 8 / zoom}
              fontSize={12 / zoom}
              fill="#ffce7a"
            >
              🔒
            </text>
          ) : null}
        </g>
      );
    },
    [selectedIds, startResize, zoom]
  );

  const gridLines = useMemo(() => {
    const worldLeft = -panX / zoom;
    const worldTop = -panY / zoom;
    const worldRight = worldLeft + canvasSize.width / zoom;
    const worldBottom = worldTop + canvasSize.height / zoom;

    const lines: React.ReactNode[] = [];

    const startX = Math.floor(worldLeft / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(worldTop / GRID_SIZE) * GRID_SIZE;

    for (let x = startX; x <= worldRight + GRID_SIZE; x += GRID_SIZE) {
      lines.push(
        <line
          key={`gx-${x}`}
          x1={x}
          y1={worldTop - GRID_SIZE}
          x2={x}
          y2={worldBottom + GRID_SIZE}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={1 / zoom}
        />
      );
    }

    for (let y = startY; y <= worldBottom + GRID_SIZE; y += GRID_SIZE) {
      lines.push(
        <line
          key={`gy-${y}`}
          x1={worldLeft - GRID_SIZE}
          y1={y}
          x2={worldRight + GRID_SIZE}
          y2={y}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={1 / zoom}
        />
      );
    }

    return lines;
  }, [canvasSize.height, canvasSize.width, panX, panY, zoom]);

  if (!loaded) {
    return <div style={styles.loading}>Загрузка проекта...</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <Link href="/" style={styles.backLink}>
            ← Проекты
          </Link>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={() => commitHistory(shapes, cadAssets)}
            style={styles.projectName}
          />
        </div>

        <div style={styles.toolbar}>
          <button style={tool === "select" ? styles.btnActive : styles.btn} onClick={() => setTool("select")}>
            Select
          </button>
          <button style={tool === "rectangle" ? styles.btnActive : styles.btn} onClick={() => setTool("rectangle")}>
            Rectangle
          </button>
          <button style={tool === "circle" ? styles.btnActive : styles.btn} onClick={() => setTool("circle")}>
            Circle
          </button>
          <button style={tool === "line" ? styles.btnActive : styles.btn} onClick={() => setTool("line")}>
            Line
          </button>
          <button style={tool === "cable" ? styles.btnActive : styles.btn} onClick={() => setTool("cable")}>
            Cable
          </button>
          <button style={tool === "socket" ? styles.btnActive : styles.btn} onClick={() => setTool("socket")}>
            Socket
          </button>
          <button style={tool === "switch" ? styles.btnActive : styles.btn} onClick={() => setTool("switch")}>
            Switch
          </button>
          <button style={styles.btn} onClick={() => setShowLibrary(true)}>
            Библиотека
          </button>
          <button style={styles.btn} onClick={() => importInputRef.current?.click()}>
            Импорт чертежа
          </button>
          <button
            style={styles.btn}
            onClick={() => setShapeLocked(selectedIds, !selectedShapes.every((s) => s.locked))}
            disabled={!selectedIds.length}
          >
            {selectedShapes.every((s) => s.locked) ? "Разблокировать" : "Заблокировать"}
          </button>
          <button style={styles.btn} onClick={undo}>
            Undo
          </button>
          <button style={styles.btn} onClick={redo}>
            Redo
          </button>
          <button style={styles.btnDanger} onClick={deleteSelected} disabled={!selectedIds.length}>
            Delete
          </button>

          <input
            ref={importInputRef}
            type="file"
            accept=".dwg,.dxf,.pdf,.png,.jpg,.jpeg"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                await importDrawingFile(file);
              }
              e.currentTarget.value = "";
            }}
          />
        </div>

        <div style={styles.status}>{status}</div>
      </div>

      <div style={styles.main}>
        <div
          ref={boardRef}
          style={styles.board}
          onPointerDown={handleBoardPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishInteraction}
          onPointerLeave={finishInteraction}
          onWheel={handleWheel}
        >
          <svg ref={svgRef} width="100%" height="100%" style={styles.svg}>
            <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
              {gridLines}

              {guideLines.map((guide, index) =>
                guide.orientation === "vertical" ? (
                  <line
                    key={`guide-v-${index}`}
                    x1={guide.value}
                    y1={-50000}
                    x2={guide.value}
                    y2={50000}
                    stroke="#7fb2ff"
                    strokeWidth={1.2 / zoom}
                    strokeDasharray={`${8 / zoom} ${6 / zoom}`}
                    opacity={0.95}
                  />
                ) : (
                  <line
                    key={`guide-h-${index}`}
                    x1={-50000}
                    y1={guide.value}
                    x2={50000}
                    y2={guide.value}
                    stroke="#7fb2ff"
                    strokeWidth={1.2 / zoom}
                    strokeDasharray={`${8 / zoom} ${6 / zoom}`}
                    opacity={0.95}
                  />
                )
              )}

              {shapes.map(renderShape)}
              {shapes.map(renderSelectionBox)}
            </g>
          </svg>
        </div>

        <aside style={styles.sidebar}>
          <div style={styles.sidebarSection}>
            <div style={styles.sidebarTitle}>Выделение</div>
            <div style={styles.readonlyValue}>Объектов: {selectedIds.length}</div>
            <div style={styles.readonlyValue}>
              Режим мультивыбора: <b>Shift + click</b>
            </div>
          </div>

          {primarySelected ? (
            <>
              <div style={styles.sidebarSection}>
                <div style={styles.sidebarTitle}>Свойства</div>

                <label style={styles.label}>Label</label>
                <input
                  value={primarySelected.label}
                  onChange={(e) =>
                    pushShapes(
                      (prev) =>
                        prev.map((shape) =>
                          shape.id === primarySelected.id
                            ? { ...shape, label: e.target.value }
                            : shape
                        ),
                      { commit: true }
                    )
                  }
                  style={styles.input}
                />

                {"x" in primarySelected ? (
                  <>
                    <label style={styles.label}>X</label>
                    <input
                      value={round2(primarySelected.x)}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (!Number.isFinite(value)) return;
                        pushShapes(
                          (prev) =>
                            prev.map((shape) =>
                              shape.id === primarySelected.id ? { ...shape, x: value } : shape
                            ),
                          { commit: true }
                        );
                      }}
                      style={styles.input}
                    />

                    <label style={styles.label}>Y</label>
                    <input
                      value={round2(primarySelected.y)}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (!Number.isFinite(value)) return;
                        pushShapes(
                          (prev) =>
                            prev.map((shape) =>
                              shape.id === primarySelected.id ? { ...shape, y: value } : shape
                            ),
                          { commit: true }
                        );
                      }}
                      style={styles.input}
                    />
                  </>
                ) : null}

                {primarySelected.type !== "line" && primarySelected.type !== "cable" ? (
                  <>
                    <label style={styles.label}>Width</label>
                    <input
                      value={round2(primarySelected.width)}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (!Number.isFinite(value)) return;
                        pushShapes(
                          (prev) =>
                            prev.map((shape) =>
                              shape.id === primarySelected.id && shape.type !== "line" && shape.type !== "cable"
                                ? { ...shape, width: Math.max(MIN_SIZE, value) }
                                : shape
                            ),
                          { commit: true }
                        );
                      }}
                      style={styles.input}
                    />

                    <label style={styles.label}>Height</label>
                    <input
                      value={round2(primarySelected.height)}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (!Number.isFinite(value)) return;
                        pushShapes(
                          (prev) =>
                            prev.map((shape) =>
                              shape.id === primarySelected.id && shape.type !== "line" && shape.type !== "cable"
                                ? { ...shape, height: Math.max(MIN_SIZE, value) }
                                : shape
                            ),
                          { commit: true }
                        );
                      }}
                      style={styles.input}
                    />
                  </>
                ) : null}

                <label style={styles.rowCheckbox}>
                  <input
                    type="checkbox"
                    checked={!!primarySelected.locked}
                    onChange={(e) => setShapeLocked([primarySelected.id], e.target.checked)}
                  />
                  Заблокировать перемещение
                </label>
              </div>

              {primarySelected.type === "cad" ? (
                <>
                  <div style={styles.sidebarSection}>
                    <div style={styles.sidebarTitle}>CAD</div>
                    <div style={styles.readonlyValue}>Артикул: {primarySelected.article}</div>
                    <div style={styles.readonlyValue}>Серия: {primarySelected.series}</div>
                    <div style={styles.readonlyValue}>Категория: {primarySelected.categoryLabel}</div>
                    <div style={styles.readonlyValue}>
                      Источник:{" "}
                      {selectedCadAsset
                        ? selectedCadAsset.importMode === "drawing-import"
                          ? `${selectedCadAsset.sourceName || "Imported drawing"} (${selectedCadAsset.sourceFormat.toUpperCase()})`
                          : `${selectedCadAsset.sourceLabel || "Library"} (${selectedCadAsset.sourceFormat.toUpperCase()})`
                        : "-"}
                    </div>
                  </div>

                  {selectedCadAsset ? (
                    <div style={styles.sidebarSection}>
                      <div style={styles.sidebarTitle}>Слои CAD</div>
                      <div style={styles.layerList}>
                        {selectedCadAsset.layers.map((layer) => {
                          const checked = primarySelected.layerState[layer.id] ?? true;
                          return (
                            <label key={layer.id} style={styles.layerItem}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  updateCadLayerVisibility(primarySelected.id, layer.id, e.target.checked)
                                }
                              />
                              <span
                                style={{
                                  ...styles.layerColor,
                                  background: layer.color || "#9db1da",
                                }}
                              />
                              <span>{layer.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <div style={styles.sidebarSection}>
              <div style={styles.sidebarTitle}>Подсказки</div>
              <div style={styles.tip}>Shift + click — добавить объект в выделение.</div>
              <div style={styles.tip}>Тяните за угол — resize с сохранением пропорций.</div>
              <div style={styles.tip}>Тяните за сторону — свободный resize.</div>
              <div style={styles.tip}>Пунктирные линии показывают выравнивание.</div>
              <div style={styles.tip}>Заблокированный объект нельзя двигать, но можно настраивать.</div>
            </div>
          )}
        </aside>
      </div>

      <DeviceLibraryModal
  open={showLibrary}
  initialCountry={libraryCountry}
  onCountryChange={setLibraryCountry}
  onClose={() => setShowLibrary(false)}
  onAdd={(item, drawingAsset) => addCadFromLibrary(item, drawingAsset)}
/>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#0b1020",
    color: "#edf3ff",
  },
  loading: {
    height: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#0b1020",
    color: "#edf3ff",
  },
  header: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    gap: 12,
    alignItems: "center",
    padding: "10px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(10, 14, 26, 0.96)",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  backLink: {
    color: "#9ec1ff",
    textDecoration: "none",
    fontSize: 14,
  },
  projectName: {
    background: "rgba(255,255,255,0.06)",
    color: "#eef4ff",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: "8px 10px",
    minWidth: 220,
  },
  toolbar: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  btn: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.05)",
    color: "#edf3ff",
    borderRadius: 10,
    padding: "8px 12px",
    cursor: "pointer",
  },
  btnActive: {
    border: "1px solid rgba(127,178,255,0.8)",
    background: "rgba(127,178,255,0.18)",
    color: "#edf3ff",
    borderRadius: 10,
    padding: "8px 12px",
    cursor: "pointer",
  },
  btnDanger: {
    border: "1px solid rgba(255,120,120,0.55)",
    background: "rgba(255,120,120,0.12)",
    color: "#ffdede",
    borderRadius: 10,
    padding: "8px 12px",
    cursor: "pointer",
  },
  status: {
    fontSize: 13,
    color: "#c3d6ff",
    textAlign: "right",
    minWidth: 180,
  },
  main: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "1fr 320px",
    minHeight: 0,
  },
  board: {
    position: "relative",
    minHeight: 0,
    overflow: "hidden",
    background:
      "radial-gradient(circle at top, rgba(59,88,164,0.18), rgba(8,11,20,0.96) 38%), #080b14",
  },
  svg: {
    display: "block",
    width: "100%",
    height: "100%",
    touchAction: "none",
    userSelect: "none",
  },
  sidebar: {
    borderLeft: "1px solid rgba(255,255,255,0.08)",
    background: "#0d1326",
    padding: 14,
    overflow: "auto",
  },
  sidebarSection: {
    padding: 12,
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 14,
    background: "rgba(255,255,255,0.03)",
    marginBottom: 12,
  },
  sidebarTitle: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 10,
  },
  label: {
    display: "block",
    fontSize: 12,
    color: "#9eb4df",
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    width: "100%",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    color: "#edf3ff",
    padding: "8px 10px",
  },
  readonlyValue: {
    fontSize: 13,
    color: "#dce8ff",
    marginBottom: 6,
  },
  rowCheckbox: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginTop: 12,
    fontSize: 13,
  },
  layerList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  layerItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
  },
  layerColor: {
    width: 10,
    height: 10,
    borderRadius: 999,
    display: "inline-block",
  },
  tip: {
    fontSize: 13,
    color: "#d4e1ff",
    marginBottom: 8,
    lineHeight: 1.4,
  },
};
