"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  | "switch"
  | "calibrate";

type StrokeStyle = "solid" | "dashed";
type SaveState = "saved" | "saving";

type ShapeStyle = {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  opacity: number;
  rotation: number;
};

type BaseShape = ShapeStyle & {
  id: string;
  type:
    | "rectangle"
    | "circle"
    | "line"
    | "cable"
    | "socket"
    | "switch"
    | "cad";
  label: string;
  groupName?: string;
  cableType?: string;
  locked?: boolean;
};

type RectangleShape = BaseShape & {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
};

type CircleShape = BaseShape & {
  type: "circle";
  x: number;
  y: number;
  radius: number;
};

type Attachment = {
  shapeId: string;
  anchorId: string;
};

type LineShape = BaseShape & {
  type: "line" | "cable";
  x: number;
  y: number;
  x2: number;
  y2: number;
  startAttachment?: Attachment;
  endAttachment?: Attachment;
};

type SocketShape = BaseShape & {
  type: "socket";
  x: number;
  y: number;
  width: number;
  height: number;
};

type SwitchShape = BaseShape & {
  type: "switch";
  x: number;
  y: number;
  width: number;
  height: number;
};

type CadShape = BaseShape & {
  type: "cad";
  x: number;
  y: number;
  width: number;
  height: number;
  assetId: string;
  article: string;
  brand: string;
  series: string;
  modules: number;
  categoryLabel: string;
  country: LibraryCountry;
  layerState: Record<string, boolean>;
};

type Shape =
  | RectangleShape
  | CircleShape
  | LineShape
  | SocketShape
  | SwitchShape
  | CadShape;

type CalibrationPoint = {
  x: number;
  y: number;
};

type EstimateRow = {
  groupName: string;
  cableType: string;
  meters: number;
};

type AnchorPoint = {
  id: string;
  x: number;
  y: number;
};

type HandleType =
  | "move"
  | "resize-n"
  | "resize-s"
  | "resize-e"
  | "resize-w"
  | "resize-nw"
  | "resize-ne"
  | "resize-sw"
  | "resize-se"
  | "resize-circle"
  | "rotate"
  | "line-start"
  | "line-end";

type InteractionState = {
  mode: HandleType;
  shapeId: string;
  startPointer: { x: number; y: number };
  initialShape: Shape;
};

type PendingInteractionState = {
  candidateMode: HandleType;
  shapeId: string;
  startPointer: { x: number; y: number };
  startScreen: { x: number; y: number };
  initialShape: Shape;
};

type HistoryState = {
  shapes: Shape[];
  cadAssets: CadAsset[];
  calibrationPoints: CalibrationPoint[];
  metersPerPixel: number;
  projectName: string;
  camera: CameraState;
};

type CameraState = {
  x: number;
  y: number;
  zoom: number;
};

type PanState = {
  startScreen: { x: number; y: number };
  startCamera: CameraState;
};

type HoverAnchorState = {
  shapeId: string;
  anchors: AnchorPoint[];
  snap?: {
    shapeId: string;
    anchorId: string;
    x: number;
    y: number;
  } | null;
};
type AlignmentGuide = {
  orientation: "vertical" | "horizontal";
  worldValue: number;
};

const defaultStyle: ShapeStyle = {
  strokeColor: "#7fa7ff",
  fillColor: "#4b70ff",
  strokeWidth: 2,
  strokeStyle: "solid",
  opacity: 0.18,
  rotation: 0,
};

const WORLD_BOUNDS = {
  x: -20000,
  y: -20000,
  width: 40000,
  height: 40000,
};

export default function ElectroBoard({ projectId }: { projectId: string }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [projectName, setProjectName] = useState("Project");
  const [tool, setTool] = useState<Tool>("select");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [cadAssets, setCadAssets] = useState<CadAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, setTransformModeId] = useState<string | null>(null);
  const [pendingInteraction, setPendingInteraction] = useState<PendingInteractionState | null>(null);
  const [draftLine, setDraftLine] = useState<LineShape | null>(null);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [calibrationPoints, setCalibrationPoints] = useState<CalibrationPoint[]>([]);
  const [metersPerPixel, setMetersPerPixel] = useState(0);
  const [calibrationDistanceMeters, setCalibrationDistanceMeters] = useState("1");
  const [status, setStatus] = useState("Готово");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 1 });
  const [panState, setPanState] = useState<PanState | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryCountry, setLibraryCountry] = useState<LibraryCountry>("FR");
  const [hoverAnchorState, setHoverAnchorState] = useState<HoverAnchorState | null>(null);
const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
const [canvasSize] = useState({ width: 1400, height: 900 });
  const [canvasCursor, setCanvasCursor] = useState<React.CSSProperties["cursor"]>("grab");
  const [cadStrokeScale, setCadStrokeScale] = useState(1.8);

  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const selectedShape = useMemo(
    () => shapes.find((s) => s.id === selectedId) || null,
    [shapes, selectedId]
  );

  const selectedCadAsset = useMemo(() => {
    if (!selectedShape || selectedShape.type !== "cad") return null;
    return cadAssets.find((asset) => asset.id === selectedShape.assetId) || null;
  }, [selectedShape, cadAssets]);

  const estimate = useMemo(
    () => buildEstimate(shapes, metersPerPixel),
    [shapes, metersPerPixel]
  );

  useEffect(() => {
    const saved = getProjectById(projectId);

    const savedCamera = saved?.data?.camera as CameraState | undefined;

    const fallbackCamera: CameraState = {
      x: canvasSize.width / 2,
      y: canvasSize.height / 2,
      zoom: 1,
    };

    const nextCamera =
      savedCamera &&
      typeof savedCamera.x === "number" &&
      typeof savedCamera.y === "number" &&
      typeof savedCamera.zoom === "number"
        ? savedCamera
        : fallbackCamera;

    if (saved) {
      const nextShapes = (saved.data?.shapes || []) as Shape[];
      const nextCadAssets = (saved.data?.cadAssets || []) as CadAsset[];
      const nextMetersPerPixel = Number(saved.data?.metersPerPixel || 0);
      const nextCalibration = (saved.data?.calibrationPoints || []) as CalibrationPoint[];

      setProjectName(saved.name || "Project");
      setShapes(nextShapes);
      setCadAssets(nextCadAssets);
      setMetersPerPixel(nextMetersPerPixel);
      setCalibrationPoints(nextCalibration);
      setLibraryCountry((saved.data?.libraryCountry as LibraryCountry) || "FR");
      setLastSavedAt(saved.updatedAt || null);

      const initial: HistoryState = {
        shapes: cloneDeep(nextShapes),
        cadAssets: cloneDeep(nextCadAssets),
        calibrationPoints: cloneDeep(nextCalibration),
        metersPerPixel: nextMetersPerPixel,
        projectName: saved.name || "Project",
        camera: cloneDeep(nextCamera),
      };

      setHistory([initial]);
      setHistoryIndex(0);
      setCamera(nextCamera);
    } else {
      const initial: HistoryState = {
        shapes: [],
        cadAssets: [],
        calibrationPoints: [],
        metersPerPixel: 0,
        projectName: "Project",
        camera: {
          x: canvasSize.width / 2,
          y: canvasSize.height / 2,
          zoom: 1,
        },
      };
      setHistory([initial]);
      setHistoryIndex(0);
      setCamera({
        x: canvasSize.width / 2,
        y: canvasSize.height / 2,
        zoom: 1,
      });
    }

    setLoaded(true);
  }, [projectId, canvasSize.width, canvasSize.height]);

  useEffect(() => {
    if (!loaded) return;

    const onBeforeUnload = () => {
      persistProjectData(
        {
          shapes,
          cadAssets,
          calibrationPoints,
          metersPerPixel,
          projectName,
          camera,
        },
        false
      );
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [loaded, projectId, shapes, cadAssets, calibrationPoints, metersPerPixel, projectName, libraryCountry, camera]);

  useEffect(() => {
    if (!loaded) return;

    persistProjectData(
      {
        shapes,
        cadAssets,
        calibrationPoints,
        metersPerPixel,
        projectName,
        camera,
      },
      false
    );
  }, [camera, loaded]);

  useEffect(() => {
    if (!loaded) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping =
        tag === "input" || tag === "textarea" || target?.isContentEditable;

      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      if ((mod && e.shiftKey && e.key.toLowerCase() === "z") || (mod && e.key.toLowerCase() === "y")) {
        e.preventDefault();
        redo();
        return;
      }

      if (isTyping) return;

      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteSelected();
        return;
      }

      if (!selectedId) return;

      const step = e.shiftKey ? 10 : 1;

      if (e.key === "ArrowUp") {
        e.preventDefault();
        nudgeSelected(0, -step);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nudgeSelected(0, step);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudgeSelected(-step, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudgeSelected(step, 0);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loaded, selectedId, history, historyIndex]);

  function persistProjectData(data: HistoryState, animate = true) {
    if (!loaded) return;

    setSaveState("saving");

    const existing = getProjectById(projectId);
    const now = Date.now();

    saveProject({
      id: projectId,
      name: data.projectName,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      data: {
        shapes: data.shapes,
        cadAssets: data.cadAssets,
        metersPerPixel: data.metersPerPixel,
        calibrationPoints: data.calibrationPoints,
        camera: data.camera,
        libraryCountry,
      },
    });

    setLastSavedAt(now);
    setSaveState("saved");
    setStatus("Сохранено");

    if (animate) {
      window.setTimeout(() => {
        setStatus("Готово");
      }, 600);
    }
  }

  function persistCurrent() {
    persistProjectData(
      {
        shapes,
        cadAssets,
        calibrationPoints,
        metersPerPixel,
        projectName,
        camera,
      },
      true
    );
  }

  function pushHistory(next: HistoryState) {
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      const last = trimmed[trimmed.length - 1];

      if (last && JSON.stringify(last) === JSON.stringify(next)) {
        return prev;
      }

      const updated = [...trimmed, cloneDeep(next)];
      const capped = updated.slice(-100);
      setHistoryIndex(capped.length - 1);
      return capped;
    });
  }

  function commitHistory(
    nextShapes?: Shape[],
    nextCadAssets?: CadAsset[],
    nextCalibrationPoints?: CalibrationPoint[],
    nextMetersPerPixel?: number,
    nextProjectName?: string,
    nextCamera?: CameraState
  ) {
    const nextState: HistoryState = {
      shapes: cloneDeep(nextShapes ?? shapes),
      cadAssets: cloneDeep(nextCadAssets ?? cadAssets),
      calibrationPoints: cloneDeep(nextCalibrationPoints ?? calibrationPoints),
      metersPerPixel: nextMetersPerPixel ?? metersPerPixel,
      projectName: nextProjectName ?? projectName,
      camera: cloneDeep(nextCamera ?? camera),
    };

    pushHistory(nextState);
    persistProjectData(nextState);
  }

  function applyHistoryState(state: HistoryState) {
    setShapes(cloneDeep(state.shapes));
    setCadAssets(cloneDeep(state.cadAssets));
    setCalibrationPoints(cloneDeep(state.calibrationPoints));
    setMetersPerPixel(state.metersPerPixel);
    setProjectName(state.projectName);
    setCamera(cloneDeep(state.camera));
    setSelectedId(null);
    setTransformModeId(null);
    setInteraction(null);
    setDraftLine(null);
    setHoverAnchorState(null);
    setPendingInteraction(null);
    persistProjectData(state, false);
    setStatus("История применена");
  }

  function undo() {
    setHistoryIndex((prevIndex) => {
      const nextIndex = Math.max(0, prevIndex - 1);
      const state = history[nextIndex];
      if (state) applyHistoryState(state);
      return nextIndex;
    });
  }

  function redo() {
    setHistoryIndex((prevIndex) => {
      const nextIndex = Math.min(history.length - 1, prevIndex + 1);
      const state = history[nextIndex];
      if (state) applyHistoryState(state);
      return nextIndex;
    });
  }

  function getScreenPoint(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };

    const rect = svg.getBoundingClientRect();

    return {
      x: ((clientX - rect.left) / rect.width) * canvasSize.width,
      y: ((clientY - rect.top) / rect.height) * canvasSize.height,
    };
  }

  function screenToWorld(screenX: number, screenY: number) {
    return {
      x: (screenX - camera.x) / camera.zoom,
      y: (screenY - camera.y) / camera.zoom,
    };
  }
  

  function updateHoverAnchors(point: { x: number; y: number }, excludeLineId?: string) {
    const targetShape = [...shapes]
      .reverse()
      .find((shape) => {
        if (shape.id === excludeLineId) return false;
        if (shape.type === "line" || shape.type === "cable") return false;
        return isPointOnShape(point.x, point.y, shape);
      });

    if (!targetShape) {
      setHoverAnchorState(null);
      return;
    }

    const anchors = getShapeAnchors(targetShape);
    const snap = findClosestAnchor(shapes, point, 26, excludeLineId);

    setHoverAnchorState({
      shapeId: targetShape.id,
      anchors,
      snap: snap && snap.shapeId === targetShape.id ? snap : null,
    });
  }

  function clearHoverAnchors() {
    setHoverAnchorState(null);
  }

  function setShapePatch(id: string, patch: Partial<Shape>) {
    setShapes((prev) => {
      const next = applyAttachments(
        prev.map((s) => (s.id === id ? ({ ...s, ...patch } as Shape) : s))
      );
      window.setTimeout(() => commitHistory(next), 0);
      return next;
    });
  }

  function setCadLayerVisibility(shapeId: string, layerId: string, visible: boolean) {
    setShapes((prev) => {
      const next = prev.map((shape) => {
        if (shape.id !== shapeId) return shape;
        if (shape.type !== "cad") return shape;

        return {
          ...shape,
          layerState: {
            ...shape.layerState,
            [layerId]: visible,
          },
        };
      });

      window.setTimeout(() => commitHistory(next), 0);
      return next;
    });
  }

  function renameCadLayer(shapeId: string, layerId: string, nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed) return;

    const shape = shapes.find((item) => item.id === shapeId);
    if (!shape || shape.type !== "cad") return;

    setCadAssets((prevAssets) => {
      const nextAssets = prevAssets.map((asset) => {
        if (asset.id !== shape.assetId) return asset;

        return {
          ...asset,
          layers: asset.layers.map((layer) =>
            layer.id === layerId ? { ...layer, name: trimmed } : layer
          ),
        };
      });

      window.setTimeout(() => commitHistory(shapes, nextAssets), 0);
      return nextAssets;
    });
  }

  function deleteCadLayer(shapeId: string, layerId: string) {
    const shape = shapes.find((item) => item.id === shapeId);
    if (!shape || shape.type !== "cad") return;

    setCadAssets((prevAssets) => {
      const nextAssets = prevAssets.map((asset) => {
        if (asset.id !== shape.assetId) return asset;

        return {
          ...asset,
          layers: asset.layers.filter((layer) => layer.id !== layerId),
          primitives: asset.primitives.filter((primitive) => primitive.layerId !== layerId),
        };
      });

      setShapes((prevShapes) => {
        const nextShapes = prevShapes.map((item) => {
          if (item.id !== shapeId) return item;
          if (item.type !== "cad") return item;

          const nextLayerState = { ...item.layerState };
          delete nextLayerState[layerId];

          return {
            ...item,
            layerState: nextLayerState,
          };
        });

        window.setTimeout(() => commitHistory(nextShapes, nextAssets), 0);
        return nextShapes;
      });

      return nextAssets;
    });
  }

  function nudgeSelected(dx: number, dy: number) {
    if (!selectedId) return;

    const selected = shapes.find((shape) => shape.id === selectedId);
    if (isShapeLocked(selected)) return;

    setShapes((prev) => {
      const next = applyAttachments(
        prev.map((shape) => {
          if (shape.id !== selectedId) return shape;

          if (shape.type === "line" || shape.type === "cable") {
            return {
              ...shape,
              x: shape.x + dx,
              y: shape.y + dy,
              x2: shape.x2 + dx,
              y2: shape.y2 + dy,
            };
          }

          if (shape.type === "circle") {
            return { ...shape, x: shape.x + dx, y: shape.y + dy };
          }

          return { ...shape, x: shape.x + dx, y: shape.y + dy } as Shape;
        })
      );

      window.setTimeout(() => commitHistory(next), 0);
      return next;
    });
  }

  function duplicateShapeWithoutAttachments(shape: Shape): Shape {
    const copy = cloneDeep(shape);
    copy.id = crypto.randomUUID();

    if (copy.type === "line" || copy.type === "cable") {
      copy.startAttachment = undefined;
      copy.endAttachment = undefined;
      copy.x += 20;
      copy.y += 20;
      copy.x2 += 20;
      copy.y2 += 20;
      return copy;
    }

    if (copy.type === "circle") {
      copy.x += 20;
      copy.y += 20;
      return copy;
    }

    if (copy.type === "cad") {
      copy.x += 20;
      copy.y += 20;
      return copy;
    }

    copy.x += 20;
    copy.y += 20;
    return copy;
  }

  function zoomAtScreenPoint(screenX: number, screenY: number, factor: number) {
    const worldBefore = screenToWorld(screenX, screenY);
    const nextZoom = Math.max(0.2, Math.min(4, camera.zoom * factor));

    const nextCameraX = screenX - worldBefore.x * nextZoom;
    const nextCameraY = screenY - worldBefore.y * nextZoom;

    setCamera({
      x: nextCameraX,
      y: nextCameraY,
      zoom: nextZoom,
    });
  }

  function zoomIn() {
    zoomAtScreenPoint(canvasSize.width / 2, canvasSize.height / 2, 1.15);
  }

  function zoomOut() {
    zoomAtScreenPoint(canvasSize.width / 2, canvasSize.height / 2, 0.85);
  }

  function resetView() {
    setCamera({
      x: canvasSize.width / 2,
      y: canvasSize.height / 2,
      zoom: 1,
    });
  }

  function convertSelectedShapeType(nextType: Shape["type"]) {
    if (!selectedShape) return;
    if (selectedShape.type === nextType) return;

    setShapes((prev) => {
      const next = prev.map((shape) => {
        if (shape.id !== selectedShape.id) return shape;
        return convertShapeType(shape, nextType);
      });

      const applied = applyAttachments(next);
      window.setTimeout(() => commitHistory(applied), 0);
      return applied;
    });
  }

  function addCadFromLibrary(item: DeviceLibraryItem, drawingAsset: DrawingAsset) {
    const cadAsset = createMockCadAssetFromDrawing(item, drawingAsset);

    const centerWorld = screenToWorld(canvasSize.width / 2, canvasSize.height / 2);
    const width = cadAsset.bounds.width;
    const height = cadAsset.bounds.height;

    const layerState = Object.fromEntries(
      cadAsset.layers.map((layer) => [layer.id, layer.visible])
    );

    const shape: CadShape = {
      id: crypto.randomUUID(),
      type: "cad",
      x: centerWorld.x - width / 2,
      y: centerWorld.y - height / 2,
      width,
      height,
      assetId: cadAsset.id,
      article: item.article,
      brand: item.brand,
      series: item.series,
      modules: item.modules,
      categoryLabel: item.categoryLabel,
      country: item.country,
      layerState,
      label: item.name,
      groupName: "",
      cableType: "",
      ...defaultStyle,
      fillColor: "#1b2347",
      opacity: 1,
    };

    setCadAssets((prevAssets) => {
      const nextAssets = [...prevAssets, cadAsset];

      setShapes((prevShapes) => {
        const nextShapes = [...prevShapes, shape];
        window.setTimeout(() => commitHistory(nextShapes, nextAssets), 0);
        return nextShapes;
      });

      return nextAssets;
    });

    setSelectedId(shape.id);
    setShowLibrary(false);
  }

  function placeImportedCadAsset(cadAsset: CadAsset, displayName: string) {
    const fitWidth = 900;
    const scale = fitWidth / Math.max(1, cadAsset.bounds.width);
    const width = cadAsset.bounds.width * scale;
    const height = cadAsset.bounds.height * scale;

    const centerWorld = screenToWorld(canvasSize.width / 2, canvasSize.height / 2);

    const layerState = Object.fromEntries(
      cadAsset.layers.map((layer) => [layer.id, layer.visible])
    );

    const shape: CadShape = {
      id: crypto.randomUUID(),
      type: "cad",
      x: centerWorld.x - width / 2,
      y: centerWorld.y - height / 2,
      width,
      height,
      assetId: cadAsset.id,
      article: displayName,
      brand: "Imported",
      series: "Drawing",
      modules: 0,
      categoryLabel: "Imported drawing",
      country: "TR",
      layerState,
      label: displayName,
      groupName: "",
      cableType: "",
      ...defaultStyle,
      fillColor: "#1b2347",
      opacity: 1,
    };

    setCadAssets((prevAssets) => {
      const nextAssets = [...prevAssets, cadAsset];

      setShapes((prevShapes) => {
        const nextShapes = [...prevShapes, shape];
        window.setTimeout(() => commitHistory(nextShapes, nextAssets), 0);
        return nextShapes;
      });

      return nextAssets;
    });

    setSelectedId(shape.id);
  }

  async function importDrawingFile(file: File) {
    try {
      const lower = file.name.toLowerCase();
      const isDxf = lower.endsWith(".dxf");
      const isDwg = lower.endsWith(".dwg");

      setStatus(`Импорт: ${file.name}...`);

      if (isDwg) {
        const result = await importDwgOnServer(file);

        if (result.ok) {
          placeImportedCadAsset(result.asset, file.name);
          setStatus(`DWG импортирован: ${file.name}`);
          return;
        }

        const shouldFallbackToMock =
          result.status === 501 ||
          result.error.toLowerCase().includes("конвертер") ||
          result.error.toLowerCase().includes("not connected") ||
          result.error.toLowerCase().includes("not configured");

        if (!shouldFallbackToMock) {
          setStatus(`DWG не импортирован: ${result.error}`);
          alert(
            result.details ? `${result.error}\n\n${result.details}` : result.error
          );
          return;
        }

        const cadAsset = await createMockCadAssetFromImportedFile(file);
        placeImportedCadAsset(cadAsset, file.name);
        setStatus(`DWG импортирован во временном mock-режиме: ${file.name}`);
        return;
      }

      const cadAsset = await createMockCadAssetFromImportedFile(file);
      placeImportedCadAsset(cadAsset, file.name);

      if (isDxf) {
        setStatus(`DXF импортирован: ${file.name}`);
      } else {
        setStatus(`Импортирован mock-чертёж: ${file.name}`);
      }
    } catch (error) {
      console.error(error);
      setStatus(`Ошибка импорта: ${file.name}`);
      alert("Ошибка импорта файла");
    }
  }

  function handleCanvasMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    const screenPoint = getScreenPoint(e.clientX, e.clientY);
    const point = screenToWorld(screenPoint.x, screenPoint.y);

    if (tool === "calibrate") {
      const next = [...calibrationPoints, point].slice(-2);
      setCalibrationPoints(next);

      if (next.length === 2) {
        const px = distance(next[0].x, next[0].y, next[1].x, next[1].y);
        const meters = Number(calibrationDistanceMeters);
        if (px > 0 && meters > 0) {
          const nextMetersPerPixel = meters / px;
          setMetersPerPixel(nextMetersPerPixel);
          setStatus(`Масштаб задан: ${meters.toFixed(2)} м на ${px.toFixed(0)} px`);
          window.setTimeout(() => commitHistory(shapes, cadAssets, next, nextMetersPerPixel), 0);
        }
      } else {
        window.setTimeout(() => commitHistory(shapes, cadAssets, next), 0);
      }
      return;
    }

    if (tool === "select") {
      if (selectedShape && !isShapeLocked(selectedShape)) {
        const handle = hitTestHandleScreen(screenPoint, selectedShape, camera);
        if (handle) {
          setPendingInteraction({
            candidateMode: handle,
            shapeId: selectedShape.id,
            startPointer: point,
            startScreen: screenPoint,
            initialShape: cloneDeep(selectedShape),
          });

          if (handle === "line-start" || handle === "line-end") {
            updateHoverAnchors(point, selectedShape.id);
          }
          return;
        }
      }

      const hit = [...shapes]
        .reverse()
        .find((shape) => hitTestShapeScreen(screenPoint, shape, camera));

      if (hit) {
        if (e.altKey && !isShapeLocked(hit)) {
          const duplicated = duplicateShapeWithoutAttachments(hit);
          setShapes((prev) => {
            const next = [...prev, duplicated];
            window.setTimeout(() => commitHistory(next), 0);
            return next;
          });
          setSelectedId(duplicated.id);
          setTransformModeId(null);
          setPendingInteraction(null);
          setInteraction({
            mode: "move",
            shapeId: duplicated.id,
            startPointer: point,
            initialShape: cloneDeep(duplicated),
          });
          return;
        }

        setSelectedId(hit.id);
        setTransformModeId(null);

        if (isShapeLocked(hit)) {
          setPendingInteraction(null);
          setInteraction(null);
          return;
        }

        setPendingInteraction({
          candidateMode: "move",
          shapeId: hit.id,
          startPointer: point,
          startScreen: screenPoint,
          initialShape: cloneDeep(hit),
        });
        setInteraction(null);
        return;
      }

      setSelectedId(null);
      setTransformModeId(null);
      setPendingInteraction(null);
      setInteraction(null);
      setPanState({
        startScreen: screenPoint,
        startCamera: camera,
      });
      return;
    }

    if (tool === "rectangle") {
      const shape: RectangleShape = {
        id: crypto.randomUUID(),
        type: "rectangle",
        x: point.x,
        y: point.y,
        width: 140,
        height: 80,
        label: "Прямоугольник",
        ...defaultStyle,
      };
      setShapes((prev) => {
        const next = [...prev, shape];
        window.setTimeout(() => commitHistory(next), 0);
        return next;
      });
      setSelectedId(shape.id);
      setTool("select");
      return;
    }

    if (tool === "circle") {
      const shape: CircleShape = {
        id: crypto.randomUUID(),
        type: "circle",
        x: point.x,
        y: point.y,
        radius: 40,
        label: "Окружность",
        ...defaultStyle,
      };
      setShapes((prev) => {
        const next = [...prev, shape];
        window.setTimeout(() => commitHistory(next), 0);
        return next;
      });
      setSelectedId(shape.id);
      setTool("select");
      return;
    }

    if (tool === "socket") {
      const shape: SocketShape = {
        id: crypto.randomUUID(),
        type: "socket",
        x: point.x,
        y: point.y,
        width: 36,
        height: 36,
        label: "Розетка",
        groupName: "",
        ...defaultStyle,
        fillColor: "#00e7a7",
      };
      setShapes((prev) => {
        const next = [...prev, shape];
        window.setTimeout(() => commitHistory(next), 0);
        return next;
      });
      setSelectedId(shape.id);
      setTool("select");
      return;
    }

    if (tool === "switch") {
      const shape: SwitchShape = {
        id: crypto.randomUUID(),
        type: "switch",
        x: point.x,
        y: point.y,
        width: 36,
        height: 36,
        label: "Выключатель",
        groupName: "",
        ...defaultStyle,
        fillColor: "#ff7300",
      };
      setShapes((prev) => {
        const next = [...prev, shape];
        window.setTimeout(() => commitHistory(next), 0);
        return next;
      });
      setSelectedId(shape.id);
      setTool("select");
      return;
    }

    if (tool === "line" || tool === "cable") {
      const startSnap = findClosestAnchor(shapes, point, 26);

      const startX = startSnap ? startSnap.x : point.x;
      const startY = startSnap ? startSnap.y : point.y;

      const shape: LineShape = {
        id: crypto.randomUUID(),
        type: tool,
        x: startX,
        y: startY,
        x2: startX + 1,
        y2: startY + 1,
        label: tool === "cable" ? "Кабель" : "Линия",
        cableType: tool === "cable" ? "ВВГнг 3x2.5" : "",
        groupName: "",
        ...defaultStyle,
        fillColor: "transparent",
        opacity: 1,
        strokeColor: tool === "cable" ? "#ffbf47" : "#7fa7ff",
        strokeWidth: tool === "cable" ? 4 : 2,
        startAttachment: startSnap
          ? { shapeId: startSnap.shapeId, anchorId: startSnap.anchorId }
          : undefined,
      };

      setDraftLine(shape);
      setSelectedId(shape.id);
      updateHoverAnchors(point, shape.id);
    }
  }

  function handleCanvasMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const screenPoint = getScreenPoint(e.clientX, e.clientY);
    const point = screenToWorld(screenPoint.x, screenPoint.y);

    if (panState) {
      setCanvasCursor("grabbing");
      const dx = screenPoint.x - panState.startScreen.x;
      const dy = screenPoint.y - panState.startScreen.y;

      setCamera({
        ...panState.startCamera,
        x: panState.startCamera.x + dx,
        y: panState.startCamera.y + dy,
      });
      return;
    }

    if (draftLine) {
      setCanvasCursor("crosshair");
      updateHoverAnchors(point, draftLine.id);

      const snappedOrtho = orthogonalSnap({ x: draftLine.x, y: draftLine.y }, point, 2);
      const snap = findClosestAnchor(shapes, snappedOrtho, 26, draftLine.id);

      setDraftLine((prev) =>
        prev
          ? {
              ...prev,
              x2: snap ? snap.x : snappedOrtho.x,
              y2: snap ? snap.y : snappedOrtho.y,
              endAttachment: snap
                ? { shapeId: snap.shapeId, anchorId: snap.anchorId }
                : undefined,
            }
          : null
      );
      return;
    }

    let activeInteraction = interaction;

    if (!activeInteraction && pendingInteraction) {
      const dxScreen = screenPoint.x - pendingInteraction.startScreen.x;
      const dyScreen = screenPoint.y - pendingInteraction.startScreen.y;
      const dragDistance = Math.hypot(dxScreen, dyScreen);
      const dragThresholdPx = 6;

      if (dragDistance < dragThresholdPx) {
        setCanvasCursor(getCursorByHandle(pendingInteraction.candidateMode));
        return;
      }

      const resolvedMode = resolveIntentHandle(
        pendingInteraction.candidateMode,
        dxScreen,
        dyScreen
      );

      activeInteraction = {
        mode: resolvedMode,
        shapeId: pendingInteraction.shapeId,
        startPointer: pendingInteraction.startPointer,
        initialShape: pendingInteraction.initialShape,
      };

      setInteraction(activeInteraction);
      setPendingInteraction(null);
    }

    if (!activeInteraction) {
      if (selectedShape && !isShapeLocked(selectedShape)) {
        const hoveredHandle = hitTestHandleScreen(screenPoint, selectedShape, camera);
        if (hoveredHandle) {
          setCanvasCursor(getCursorByHandle(hoveredHandle));
        } else {
          const hit = [...shapes]
            .reverse()
            .find((shape) => hitTestShapeScreen(screenPoint, shape, camera));
          setCanvasCursor(hit && !isShapeLocked(hit) ? "move" : "grab");
        }
      } else {
        const hit = [...shapes]
          .reverse()
          .find((shape) => hitTestShapeScreen(screenPoint, shape, camera));
        setCanvasCursor(hit && !isShapeLocked(hit) ? "move" : "grab");
      }

      if (tool === "line" || tool === "cable") {
        updateHoverAnchors(point);
      } else {
        clearHoverAnchors();
      }

      return;
    }

    setCanvasCursor(getCursorByHandle(activeInteraction.mode));

    if (activeInteraction.mode === "line-start" || activeInteraction.mode === "line-end") {
      updateHoverAnchors(point, activeInteraction.shapeId);
    } else {
      clearHoverAnchors();
    }

    setShapes((prev) => {
      let updated = prev.map((shape) =>
        shape.id === activeInteraction!.shapeId
          ? transformShape(shape, activeInteraction!, point, prev)
          : shape
      );

      if (activeInteraction!.mode === "move") {
        const movingShape = updated.find((shape) => shape.id === activeInteraction!.shapeId);

        if (
          movingShape &&
          movingShape.type !== "line" &&
          movingShape.type !== "cable"
        ) {
          const snapped = computeSnappedMove(
            movingShape,
            updated,
            activeInteraction!.shapeId,
            camera
          );

          updated = updated.map((shape) =>
            shape.id === activeInteraction!.shapeId ? snapped.shape : shape
          );

          setAlignmentGuides(snapped.guides);
        } else {
          setAlignmentGuides([]);
        }
      } else {
        setAlignmentGuides([]);
      }

      return applyAttachments(updated);
    });
  }

  function handleCanvasMouseUp() {
    if (draftLine) {
      const finalized = applyAttachments(
        shapes.concat(draftLine).map((shape) => {
          if (shape.id !== draftLine.id) return shape;
          if (shape.type !== "line" && shape.type !== "cable") return shape;

          const snap = findClosestAnchor(
            shapes,
            { x: shape.x2, y: shape.y2 },
            26,
            shape.id
          );

          return snap
            ? {
                ...shape,
                x2: snap.x,
                y2: snap.y,
                endAttachment: { shapeId: snap.shapeId, anchorId: snap.anchorId },
              }
            : shape;
        })
      );

      setShapes(finalized);
      window.setTimeout(() => commitHistory(finalized), 0);
      setDraftLine(null);
      setTool("select");
      setPendingInteraction(null);
      setPanState(null);
      clearHoverAnchors();
      return;
    }

    if (interaction && (interaction.mode === "line-start" || interaction.mode === "line-end")) {
      setShapes((prev) => {
        const updated = prev.map((shape) => {
          if (shape.id !== interaction.shapeId) return shape;
          if (shape.type !== "line" && shape.type !== "cable") return shape;

          const endpoint =
            interaction.mode === "line-start"
              ? { x: shape.x, y: shape.y }
              : { x: shape.x2, y: shape.y2 };

          const snap = findClosestAnchor(prev, endpoint, 26, shape.id);

          if (!snap) {
            return interaction.mode === "line-start"
              ? { ...shape, startAttachment: undefined }
              : { ...shape, endAttachment: undefined };
          }

          return interaction.mode === "line-start"
            ? {
                ...shape,
                x: snap.x,
                y: snap.y,
                startAttachment: { shapeId: snap.shapeId, anchorId: snap.anchorId },
              }
            : {
                ...shape,
                x2: snap.x,
                y2: snap.y,
                endAttachment: { shapeId: snap.shapeId, anchorId: snap.anchorId },
              };
        });

        const next = applyAttachments(updated);
        window.setTimeout(() => commitHistory(next), 0);
        return next;
      });
    } else if (interaction) {
      setShapes((prev) => {
        const next = applyAttachments(prev);
        window.setTimeout(() => commitHistory(next), 0);
        return next;
      });
    }

    setInteraction(null);
setPanState(null);
clearHoverAnchors();
setAlignmentGuides([]);
setCanvasCursor("grab");
  }

  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const screen = getScreenPoint(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    zoomAtScreenPoint(screen.x, screen.y, factor);
  }

  function reorderSelectedShape(
    direction: "backward" | "forward" | "to-back" | "to-front"
  ) {
    if (!selectedId) return;

    setShapes((prev) => {
      const next = moveShapeInStack(prev, selectedId, direction);
      window.setTimeout(() => commitHistory(next), 0);
      return next;
    });
  }

  function deleteSelected() {
    if (!selectedId) return;
    setShapes((prev) => {
      const next = prev.filter((s) => s.id !== selectedId);
      window.setTimeout(() => commitHistory(next), 0);
      return next;
    });
    setSelectedId(null);
    setTransformModeId(null);
    setPendingInteraction(null);
  }

  function clearAllConfirmed() {
    setShapes([]);
    setCadAssets([]);
    setSelectedId(null);
    setTransformModeId(null);
    setDraftLine(null);
    setCalibrationPoints([]);
    setPendingInteraction(null);
    setInteraction(null);
    setPanState(null);
    setHoverAnchorState(null);
    setPendingInteraction(null);
    setShowClearConfirm(false);
    setStatus("Проект очищен");
    window.setTimeout(() => commitHistory([], [], [], 0), 0);
  }

  const objectTypeOptions =
    selectedShape == null
      ? []
      : selectedShape.type === "line" || selectedShape.type === "cable"
        ? [
            { value: "line", label: "Линия" },
            { value: "cable", label: "Кабель" },
          ]
        : selectedShape.type === "cad"
          ? [{ value: "cad", label: "CAD объект" }]
          : [
              { value: "rectangle", label: "Прямоугольник" },
              { value: "circle", label: "Окружность" },
              { value: "socket", label: "Розетка" },
              { value: "switch", label: "Выключатель" },
            ];

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={styles.leftBlock}>
          <Link href="/" style={styles.backLink}>
            ← Ко всем проектам
          </Link>

          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            style={styles.projectInput}
          />
        </div>

        <div style={styles.leftBlock}>
          <button style={tool === "select" ? styles.btnActive : styles.btn} onClick={() => setTool("select")}>
            Выбор
          </button>
          <button style={tool === "rectangle" ? styles.btnActive : styles.btn} onClick={() => setTool("rectangle")}>
            Прямоугольник
          </button>
          <button style={tool === "circle" ? styles.btnActive : styles.btn} onClick={() => setTool("circle")}>
            Окружность
          </button>
          <button style={tool === "line" ? styles.btnActive : styles.btn} onClick={() => setTool("line")}>
            Линия
          </button>
          <button style={tool === "cable" ? styles.btnActive : styles.btn} onClick={() => setTool("cable")}>
            Кабель
          </button>
          <button style={tool === "socket" ? styles.btnActive : styles.btn} onClick={() => setTool("socket")}>
            Розетка
          </button>
          <button style={tool === "switch" ? styles.btnActive : styles.btn} onClick={() => setTool("switch")}>
            Выключатель
          </button>
          <button style={tool === "calibrate" ? styles.btnActive : styles.btn} onClick={() => setTool("calibrate")}>
            Масштаб
          </button>

          <button style={styles.btn} onClick={() => setShowLibrary(true)}>
            Библиотека
          </button>
          <button
            style={styles.btn}
            onClick={() => importInputRef.current?.click()}
          >
            Импорт чертежа
          </button>

          <input
            ref={importInputRef}
            type="file"
            accept=".dwg,.dxf,.pdf,.png,.jpg,.jpeg"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                importDrawingFile(file);
              }
              e.currentTarget.value = "";
            }}
          />

          <button style={styles.iconBtn} onClick={undo} title="Undo">
            <IconUndo />
          </button>
          <button style={styles.iconBtn} onClick={redo} title="Redo">
            <IconRedo />
          </button>
          <button style={styles.iconBtn} onClick={() => setShowHelp(true)} title="Помощь">
            <IconHelp />
          </button>
        </div>
      </div>

      <div style={styles.main}>
        <div style={styles.canvasWrap}>
          <div style={styles.statusBar}>
            <span>{status}</span>
            <span>
              Масштаб: {metersPerPixel > 0 ? `${metersPerPixel.toFixed(5)} м / px` : "не задан"} | Zoom: {camera.zoom.toFixed(2)}x
            </span>
          </div>

          <div style={styles.board}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
              style={{
  ...styles.svg,
  cursor: panState
    ? "grabbing"
    : interaction
      ? getCursorByHandle(interaction.mode)
      : canvasCursor,
}}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={() => {
              handleCanvasMouseUp();
              clearHoverAnchors();
              setAlignmentGuides([]);
              setCanvasCursor("grab");
}}
              onWheel={handleWheel}
            >
              <defs>
                <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
                  <path d="M 25 0 L 0 0 0 25" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
                </pattern>
              </defs>

              <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
                <rect
                  x={WORLD_BOUNDS.x}
                  y={WORLD_BOUNDS.y}
                  width={WORLD_BOUNDS.width}
                  height={WORLD_BOUNDS.height}
                  fill="url(#grid)"
                />

                {shapes.map((shape) => (
  <React.Fragment key={shape.id}>
    {renderShape(shape, selectedId === shape.id, cadAssets, cadStrokeScale)}
  </React.Fragment>
))}

                {draftLine ? renderShape(draftLine, true, cadAssets, cadStrokeScale) : null}

                {hoverAnchorState ? (
                  <g pointerEvents="none">
                    {hoverAnchorState.anchors.map((anchor) => {
                      const active =
                        hoverAnchorState.snap &&
                        hoverAnchorState.snap.anchorId === anchor.id &&
                        hoverAnchorState.snap.shapeId === hoverAnchorState.shapeId;

                      return (
                        <circle
                          key={`${hoverAnchorState.shapeId}-${anchor.id}`}
                          cx={anchor.x}
                          cy={anchor.y}
                          r={active ? 8 : 5}
                          fill={active ? "#00e7a7" : "#9ec1ff"}
                          stroke="#ffffff"
                          strokeWidth={active ? 2.5 : 1.5}
                          opacity={active ? 1 : 0.92}
                        />
                      );
                    })}
                  </g>
                ) : null}

                {calibrationPoints.map((p, i) => (
                  <g key={`${p.x}-${p.y}-${i}`}>
                    <circle cx={p.x} cy={p.y} r="6" fill="#00e7a7" />
                    <text x={p.x + 8} y={p.y - 8} fill="#fff" fontSize="14">
                      T{i + 1}
                    </text>
                  </g>
                ))}

                {calibrationPoints.length === 2 ? (
                  <line
                    x1={calibrationPoints[0].x}
                    y1={calibrationPoints[0].y}
                    x2={calibrationPoints[1].x}
                    y2={calibrationPoints[1].y}
                    stroke="#00e7a7"
                    strokeWidth="3"
                  />
                ) : null}
              </g>
{renderAlignmentGuidesScreen(alignmentGuides, camera, canvasSize)}
{selectedShape && !isShapeLocked(selectedShape)
  ? renderSelectionOverlayScreen(selectedShape, camera)
  : null}
            </svg>

            <div style={styles.zoomControls}>
              <button style={styles.zoomBtn} onClick={zoomIn} title="Приблизить">
                +
              </button>
              <button style={styles.zoomBtn} onClick={zoomOut} title="Отдалить">
                −
              </button>
              <button style={styles.zoomResetBtn} onClick={resetView} title="Сбросить вид">
                reset
              </button>
            </div>

            <MiniMap
              shapes={shapes}
              camera={camera}
              canvasSize={canvasSize}
              onJump={(worldX, worldY) => {
                setCamera({
                  x: canvasSize.width / 2 - worldX * camera.zoom,
                  y: canvasSize.height / 2 - worldY * camera.zoom,
                  zoom: camera.zoom,
                });
              }}
            />
          </div>
        </div>

        <div style={styles.sidebar}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Калибровка</div>
            <div style={styles.compactField}>
              <label style={styles.label}>Реальное расстояние, м</label>
              <input
                value={calibrationDistanceMeters}
                onChange={(e) => setCalibrationDistanceMeters(e.target.value)}
                style={styles.inputCompact}
                type="number"
                step="0.01"
              />
            </div>
            <div style={styles.hintCompact}>
              Выберите <b>Масштаб</b> и нажмите две точки.
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>CAD отображение</div>

            <div style={styles.compactField}>
              <label style={styles.label}>
                Толщина CAD: {cadStrokeScale.toFixed(1)}x
              </label>
              <input
                type="range"
                min={1}
                max={4}
                step={0.1}
                value={cadStrokeScale}
                onChange={(e) => setCadStrokeScale(Number(e.target.value))}
              />
            </div>

            <div style={styles.hintCompact}>
              Меняет читаемость импортированного чертежа на экране.
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>Объект</div>

            {!selectedShape ? (
              <div style={styles.hintCompact}>Ничего не выбрано</div>
            ) : (
              <>
                <div style={styles.compactField}>
                  <label style={styles.label}>Тип</label>
                  <select
                    value={selectedShape.type}
                    onChange={(e) => convertSelectedShapeType(e.target.value as Shape["type"])}
                    style={styles.inputCompact}
                  >
                    {objectTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={styles.compactField}>
                  <label style={styles.label}>Название</label>
                  <input
                    value={selectedShape.label}
                    onChange={(e) => setShapePatch(selectedShape.id, { label: e.target.value })}
                    style={styles.inputCompact}
                  />
                </div>

                <div style={styles.compactField}>
                  <label style={styles.label}>Фиксация</label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      color: "#dce7ff",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(selectedShape.locked)}
                      onChange={(e) =>
                        setShapePatch(selectedShape.id, { locked: e.target.checked })
                      }
                    />
                    Зафиксировать элемент
                  </label>
                </div>

                <div style={styles.compactField}>
                  <label style={styles.label}>Расположение</label>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 6,
                    }}
                  >
                    <button
                      type="button"
                      style={styles.btn}
                      onClick={() => reorderSelectedShape("backward")}
                    >
                      Назад
                    </button>

                    <button
                      type="button"
                      style={styles.btn}
                      onClick={() => reorderSelectedShape("forward")}
                    >
                      Вперед
                    </button>

                    <button
                      type="button"
                      style={styles.btn}
                      onClick={() => reorderSelectedShape("to-back")}
                    >
                      На задний план
                    </button>

                    <button
                      type="button"
                      style={styles.btn}
                      onClick={() => reorderSelectedShape("to-front")}
                    >
                      На передний план
                    </button>
                  </div>
                </div>

                {selectedShape.type === "cad" ? (
                  <>
                    <div style={styles.compactField}>
                      <label style={styles.label}>Артикул</label>
                      <input value={selectedShape.article} readOnly style={styles.inputCompact} />
                    </div>

                    <div style={styles.compactField}>
                      <label style={styles.label}>Серия</label>
                      <input value={selectedShape.series} readOnly style={styles.inputCompact} />
                    </div>

                    <div style={styles.compactField}>
                      <label style={styles.label}>Модули</label>
                      <input value={String(selectedShape.modules)} readOnly style={styles.inputCompact} />
                    </div>

                    <div style={styles.compactField}>
                      <label style={styles.label}>Страна каталога</label>
                      <input value={selectedShape.country} readOnly style={styles.inputCompact} />
                    </div>

                    <div style={styles.compactField}>
                      <label style={styles.label}>Источник CAD</label>
                      <input
                        value={
                          selectedCadAsset
                            ? selectedCadAsset.importMode === "drawing-import"
                              ? `${selectedCadAsset.sourceName || "Imported drawing"} (${selectedCadAsset.sourceFormat.toUpperCase()})`
                              : `${selectedCadAsset.sourceLabel || ""} (${selectedCadAsset.sourceFormat.toUpperCase()})`
                            : ""
                        }
                        readOnly
                        style={styles.inputCompact}
                      />
                    </div>
                  </>
                ) : null}

                <div style={styles.compactField}>
                  <label style={styles.label}>Группа</label>
                  <input
                    value={selectedShape.groupName || ""}
                    onChange={(e) => setShapePatch(selectedShape.id, { groupName: e.target.value })}
                    style={styles.inputCompact}
                  />
                </div>

                {(selectedShape.type === "line" || selectedShape.type === "cable") && (
                  <div style={styles.compactField}>
                    <label style={styles.label}>Кабель</label>
                    <input
                      value={selectedShape.cableType || ""}
                      onChange={(e) => setShapePatch(selectedShape.id, { cableType: e.target.value })}
                      style={styles.inputCompact}
                    />
                  </div>
                )}

                <div style={styles.rowLabel}>Стиль</div>

                <div style={styles.styleRow}>
                  <label style={styles.colorSwatchLabel} title="Цвет линии">
                    <input
                      type="color"
                      value={safeColor(selectedShape.strokeColor)}
                      onChange={(e) => setShapePatch(selectedShape.id, { strokeColor: e.target.value })}
                      style={styles.hiddenColorInput}
                    />
                    <span
                      style={{
                        ...styles.colorSwatch,
                        background: safeColor(selectedShape.strokeColor),
                      }}
                    />
                  </label>

                  {selectedShape.type !== "line" && selectedShape.type !== "cable" ? (
                    <label style={styles.colorSwatchLabel} title="Цвет заливки">
                      <input
                        type="color"
                        value={safeColor(selectedShape.fillColor)}
                        onChange={(e) => setShapePatch(selectedShape.id, { fillColor: e.target.value })}
                        style={styles.hiddenColorInput}
                      />
                      <span
                        style={{
                          ...styles.colorSwatch,
                          background: safeColor(selectedShape.fillColor),
                        }}
                      />
                    </label>
                  ) : (
                    <span style={styles.colorSwatchGhost} />
                  )}

                  <button
                    type="button"
                    style={selectedShape.strokeStyle === "solid" ? styles.lineStyleBtnActive : styles.lineStyleBtn}
                    onClick={() => setShapePatch(selectedShape.id, { strokeStyle: "solid" })}
                    title="Сплошная"
                  >
                    <span style={styles.solidPreview} />
                  </button>

                  <button
                    type="button"
                    style={selectedShape.strokeStyle === "dashed" ? styles.lineStyleBtnActive : styles.lineStyleBtn}
                    onClick={() => setShapePatch(selectedShape.id, { strokeStyle: "dashed" })}
                    title="Пунктир"
                  >
                    <span style={styles.dashedPreview} />
                  </button>
                </div>

                <div style={styles.compactField}>
                  <label style={styles.label}>Толщина: {selectedShape.strokeWidth}</label>
                  <input
                    type="range"
                    min={1}
                    max={12}
                    value={selectedShape.strokeWidth}
                    onChange={(e) => setShapePatch(selectedShape.id, { strokeWidth: Number(e.target.value) })}
                  />
                </div>

                <div style={styles.compactField}>
                  <label style={styles.label}>Прозрачность: {selectedShape.opacity.toFixed(2)}</label>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={selectedShape.opacity}
                    onChange={(e) => setShapePatch(selectedShape.id, { opacity: Number(e.target.value) })}
                  />
                </div>

                {selectedShape.type !== "circle" &&
                selectedShape.type !== "line" &&
                selectedShape.type !== "cable" ? (
                  <div style={styles.compactField}>
                    <label style={styles.label}>Поворот: {Math.round(selectedShape.rotation)}°</label>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      value={selectedShape.rotation}
                      onChange={(e) => setShapePatch(selectedShape.id, { rotation: Number(e.target.value) })}
                    />
                  </div>
                ) : null}

                {(selectedShape.type === "line" || selectedShape.type === "cable") && (
                  <div style={styles.hintCompact}>
                    Длина: {lineLengthMeters(selectedShape, metersPerPixel).toFixed(2)} м
                  </div>
                )}

                <button style={styles.deleteBtn} onClick={deleteSelected}>
                  Удалить объект
                </button>
              </>
            )}
          </div>

          {selectedShape?.type === "cad" && selectedCadAsset ? (
            <div style={styles.card}>
              <div style={styles.cardTitle}>Слои CAD</div>

              <div style={{ display: "grid", gap: 8 }}>
                {selectedCadAsset.layers.map((layer) => {
                  const visible = selectedShape.layerState[layer.id] ?? layer.visible;

                  return (
                    <div key={layer.id} style={styles.layerRowEditable}>
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={(e) =>
                          setCadLayerVisibility(selectedShape.id, layer.id, e.target.checked)
                        }
                      />

                      <input
                        value={layer.name}
                        onChange={(e) =>
                          renameCadLayer(selectedShape.id, layer.id, e.target.value)
                        }
                        style={styles.layerNameInput}
                      />

                      <button
                        type="button"
                        style={styles.layerDeleteBtn}
                        onClick={() => deleteCadLayer(selectedShape.id, layer.id)}
                        title="Удалить слой"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div style={styles.card}>
            <div style={styles.cardTitle}>Смета</div>
            {estimate.length === 0 ? (
              <div style={styles.hintCompact}>Нет кабельных линий</div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {estimate.map((row, idx) => (
                  <div
                    key={`${row.groupName}-${row.cableType}-${idx}`}
                    style={styles.estimateRow}
                  >
                    <div>
                      <b>{row.groupName || "Без группы"}</b>
                    </div>
                    <div>{row.cableType || "Без типа"}</div>
                    <div>{row.meters.toFixed(2)} м</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button style={styles.clearBtn} onClick={() => setShowClearConfirm(true)}>
            Очистить проект
          </button>
        </div>
      </div>

      <button style={styles.saveBadge} onClick={persistCurrent} title="Сохранить сейчас">
        <span
          style={{
            ...styles.saveDot,
            transform: saveState === "saving" ? "scale(1.25)" : "scale(1)",
            opacity: saveState === "saving" ? 1 : 0.75,
          }}
        />
        <span style={styles.saveText}>
          {saveState === "saving" ? "Сохранение..." : "Сохранить"}
        </span>
        <span style={styles.saveTime}>
          {lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString() : ""}
        </span>
      </button>

      <DeviceLibraryModal
        open={showLibrary}
        initialCountry={libraryCountry}
        onClose={() => setShowLibrary(false)}
        onCountryChange={setLibraryCountry}
        onAdd={addCadFromLibrary}
      />

      {showHelp ? (
        <Modal title="Горячие клавиши" onClose={() => setShowHelp(false)}>
          <div style={styles.modalList}>
            <div>Delete / Backspace — удалить выбранное</div>
            <div>Ctrl/Cmd + Z — назад</div>
            <div>Ctrl/Cmd + Shift + Z или Ctrl/Cmd + Y — вперед</div>
            <div>Стрелки — сдвиг на 1px</div>
            <div>Shift + стрелки — сдвиг на 10px</div>
            <div>Alt + drag — дублирование без привязок</div>
            <div>Колесо мыши — zoom</div>
            <div>Тянуть пустое место — перемещение полотна</div>
          </div>
        </Modal>
      ) : null}

      {showClearConfirm ? (
        <Modal title="Очистить проект?" onClose={() => setShowClearConfirm(false)}>
          <div style={styles.modalText}>
            Все объекты на текущем проекте будут удалены.
          </div>
          <div style={styles.modalActions}>
            <button style={styles.modalBtn} onClick={() => setShowClearConfirm(false)}>
              Отмена
            </button>
            <button style={styles.modalBtnDanger} onClick={clearAllConfirmed}>
              Очистить
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function MiniMap({
  shapes,
  camera,
  canvasSize,
  onJump,
}: {
  shapes: Shape[];
  camera: CameraState;
  canvasSize: { width: number; height: number };
  onJump: (worldX: number, worldY: number) => void;
}) {
  const miniWidth = 220;
  const miniHeight = 150;

  const scaleX = miniWidth / WORLD_BOUNDS.width;
  const scaleY = miniHeight / WORLD_BOUNDS.height;

  const viewLeft = -camera.x / camera.zoom;
  const viewTop = -camera.y / camera.zoom;
  const viewWidth = canvasSize.width / camera.zoom;
  const viewHeight = canvasSize.height / camera.zoom;

  function worldToMini(x: number, y: number) {
    return {
      x: (x - WORLD_BOUNDS.x) * scaleX,
      y: (y - WORLD_BOUNDS.y) * scaleY,
    };
  }

  function handleMiniMapClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = ((e.clientX - rect.left) / rect.width) * miniWidth;
    const localY = ((e.clientY - rect.top) / rect.height) * miniHeight;

    const worldX = WORLD_BOUNDS.x + localX / scaleX;
    const worldY = WORLD_BOUNDS.y + localY / scaleY;

    onJump(worldX, worldY);
  }

  return (
    <div style={styles.minimapWrap}>
      <svg
        viewBox={`0 0 ${miniWidth} ${miniHeight}`}
        style={styles.minimapSvg}
        onClick={handleMiniMapClick}
      >
        <rect x={0} y={0} width={miniWidth} height={miniHeight} fill="#0c1330" />

        {shapes.map((shape) => {
          if (shape.type === "line" || shape.type === "cable") {
            const a = worldToMini(shape.x, shape.y);
            const b = worldToMini(shape.x2, shape.y2);

            return (
              <line
                key={shape.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={shape.strokeColor}
                strokeWidth={Math.max(1, shape.strokeWidth * 0.4)}
                opacity={0.9}
              />
            );
          }

          if (shape.type === "circle") {
            const p = worldToMini(shape.x, shape.y);
            return (
              <circle
                key={shape.id}
                cx={p.x}
                cy={p.y}
                r={Math.max(2, shape.radius * scaleX)}
                fill={shape.fillColor}
                stroke={shape.strokeColor}
                strokeWidth={1}
                opacity={0.9}
              />
            );
          }

          if (shape.type === "rectangle" || shape.type === "cad") {
            const p = worldToMini(shape.x, shape.y);
            return (
              <rect
                key={shape.id}
                x={p.x}
                y={p.y}
                width={Math.max(2, shape.width * scaleX)}
                height={Math.max(2, shape.height * scaleY)}
                fill={shape.fillColor}
                stroke={shape.strokeColor}
                strokeWidth={1}
                opacity={0.9}
              />
            );
          }

          if (shape.type === "socket" || shape.type === "switch") {
            const p = worldToMini(shape.x - shape.width / 2, shape.y - shape.height / 2);
            return (
              <rect
                key={shape.id}
                x={p.x}
                y={p.y}
                width={Math.max(2, shape.width * scaleX)}
                height={Math.max(2, shape.height * scaleY)}
                fill={shape.fillColor}
                stroke={shape.strokeColor}
                strokeWidth={1}
                opacity={0.95}
              />
            );
          }

          return null;
        })}

        <rect
          x={(viewLeft - WORLD_BOUNDS.x) * scaleX}
          y={(viewTop - WORLD_BOUNDS.y) * scaleY}
          width={viewWidth * scaleX}
          height={viewHeight * scaleY}
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>{title}</div>
          <button style={styles.iconBtnSmall} onClick={onClose}>
            <IconClose />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function renderShape(
  shape: Shape,
  selected: boolean,
  cadAssets: CadAsset[],
  cadStrokeScale: number
) {
  const stroke = shape.strokeColor;
  const fill =
    shape.type === "line" || shape.type === "cable"
      ? "transparent"
      : hexToRgba(shape.fillColor, shape.opacity);
  const dash = shape.strokeStyle === "dashed" ? "8 6" : undefined;
  const sw = selected ? shape.strokeWidth + 0.5 : shape.strokeWidth;

  if (shape.type === "rectangle") {
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    return (
      <g transform={`rotate(${shape.rotation} ${cx} ${cy})`}>
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          strokeDasharray={dash}
          rx="6"
          style={{ cursor: "move" }}
        />
        <text x={shape.x + 6} y={shape.y - 10} fill="#f2f6ff" fontSize="14">
          {shape.label} {shape.locked ? "🔒" : ""}
        </text>
      </g>
    );
  }

  if (shape.type === "circle") {
    return (
      <g>
        <circle
          cx={shape.x}
          cy={shape.y}
          r={shape.radius}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          strokeDasharray={dash}
          style={{ cursor: "move" }}
        />
        <text x={shape.x + shape.radius + 6} y={shape.y - shape.radius - 10} fill="#f2f6ff" fontSize="14">
          {shape.label} {shape.locked ? "🔒" : ""}
        </text>
      </g>
    );
  }

  if (shape.type === "line" || shape.type === "cable") {
    return (
      <g>
        <line
          x1={shape.x}
          y1={shape.y}
          x2={shape.x2}
          y2={shape.y2}
          stroke={stroke}
          strokeWidth={sw}
          strokeDasharray={dash}
          opacity={shape.opacity}
          strokeLinecap="round"
          style={{ cursor: "move" }}
        />
        <text x={(shape.x + shape.x2) / 2 + 6} y={(shape.y + shape.y2) / 2 - 6} fill="#f2f6ff" fontSize="14">
          {shape.label} {shape.groupName ? `(${shape.groupName})` : ""} {shape.locked ? "🔒" : ""}
        </text>
      </g>
    );
  }

  if (shape.type === "socket") {
    return (
      <g transform={`rotate(${shape.rotation} ${shape.x} ${shape.y})`}>
        <rect
          x={shape.x - shape.width / 2}
          y={shape.y - shape.height / 2}
          width={shape.width}
          height={shape.height}
          rx="10"
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          strokeDasharray={dash}
          style={{ cursor: "move" }}
        />
        <circle cx={shape.x - 8} cy={shape.y} r="4" fill={stroke} />
        <circle cx={shape.x + 8} cy={shape.y} r="4" fill={stroke} />
        <text x={shape.x + 28} y={shape.y + 4} fill="#f2f6ff" fontSize="14">
          {shape.label} {shape.groupName || ""} {shape.locked ? "🔒" : ""}
        </text>
      </g>
    );
  }

  if (shape.type === "switch") {
    return (
      <g transform={`rotate(${shape.rotation} ${shape.x} ${shape.y})`}>
        <rect
          x={shape.x - shape.width / 2}
          y={shape.y - shape.height / 2}
          width={shape.width}
          height={shape.height}
          rx="6"
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          strokeDasharray={dash}
          style={{ cursor: "move" }}
        />
        <line
          x1={shape.x - 10}
          y1={shape.y - 12}
          x2={shape.x + 10}
          y2={shape.y + 12}
          stroke={stroke}
          strokeWidth={Math.max(2, sw)}
          strokeLinecap="round"
        />
        <text x={shape.x + 28} y={shape.y + 4} fill="#f2f6ff" fontSize="14">
          {shape.label} {shape.groupName || ""} {shape.locked ? "🔒" : ""}
        </text>
      </g>
    );
  }

  if (shape.type === "cad") {
    const asset = cadAssets.find((item) => item.id === shape.assetId);
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;

    if (!asset) {
      return (
        <g transform={`rotate(${shape.rotation} ${cx} ${cy})`}>
          <rect
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            rx="10"
            fill="rgba(255,255,255,0.03)"
            stroke={stroke}
            strokeWidth={sw}
            style={{ cursor: "move" }}
          />
          <text x={shape.x + 8} y={shape.y + 20} fill="#f2f6ff" fontSize="12">
            CAD asset not found
          </text>
        </g>
      );
    }

    const scaleX = shape.width / Math.max(1, asset.bounds.width);
    const scaleY = shape.height / Math.max(1, asset.bounds.height);
    const previewVisible = shape.layerState["preview"] ?? true;

    return (
      <g transform={`rotate(${shape.rotation} ${cx} ${cy})`}>
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          rx="10"
          fill="rgba(255,255,255,0.02)"
          stroke={selected ? "#9ec1ff" : "rgba(255,255,255,0.18)"}
          strokeWidth={selected ? 2 : 1}
          style={{ cursor: "move" }}
        />

        {asset.previewUrl && previewVisible ? (
          <image
            href={asset.previewUrl}
            x={shape.x + 6}
            y={shape.y + 6}
            width={shape.width - 12}
            height={shape.height - 12}
            preserveAspectRatio="xMidYMid meet"
            opacity={0.28}
          />
        ) : null}

        <g transform={`translate(${shape.x} ${shape.y}) scale(${scaleX} ${scaleY})`}>
          {asset.primitives.map((primitive, index) =>
            renderCadPrimitive(
              primitive,
              `${shape.id}-${index}`,
              shape.layerState[primitive.layerId] ?? true,
              cadStrokeScale
            )
          )}
        </g>

        <text x={shape.x} y={shape.y - 10} fill="#f2f6ff" fontSize="14">
          {shape.label} {shape.locked ? "🔒" : ""}
        </text>
      </g>
    );
  }

  return null;
}

function renderCadPrimitive(
  primitive: CadPrimitive,
  key: string,
  visible: boolean,
  cadStrokeScale: number
) {
  if (!visible) return null;

  const baseStrokeWidth =
    primitive.type === "line" ||
    primitive.type === "polyline" ||
    primitive.type === "circle"
      ? primitive.strokeWidth || 1
      : 1;

  const boostedStrokeWidth = Math.max(baseStrokeWidth * cadStrokeScale, 2.2);

  if (primitive.type === "line") {
    return (
      <line
        key={key}
        x1={primitive.x1}
        y1={primitive.y1}
        x2={primitive.x2}
        y2={primitive.y2}
        stroke={primitive.stroke || "#e6eeff"}
        strokeWidth={boostedStrokeWidth}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        shapeRendering="geometricPrecision"
      />
    );
  }

  if (primitive.type === "polyline") {
    const points = primitive.points.map((p) => `${p.x},${p.y}`).join(" ");
    return (
      <polyline
        key={key}
        points={points}
        fill={primitive.closed ? primitive.fill || "none" : "none"}
        stroke={primitive.stroke || "#e6eeff"}
        strokeWidth={boostedStrokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        shapeRendering="geometricPrecision"
      />
    );
  }

  if (primitive.type === "circle") {
    return (
      <circle
        key={key}
        cx={primitive.cx}
        cy={primitive.cy}
        r={primitive.r}
        fill={primitive.fill || "none"}
        stroke={primitive.stroke || "#e6eeff"}
        strokeWidth={boostedStrokeWidth}
        vectorEffect="non-scaling-stroke"
        shapeRendering="geometricPrecision"
      />
    );
  }

  if (primitive.type === "text") {
    return (
      <text
        key={key}
        x={primitive.x}
        y={primitive.y}
        fill={primitive.fill || "#f2f6ff"}
        fontSize={Math.max(primitive.size || 12, 13)}
      >
        {primitive.text}
      </text>
    );
  }

  return null;
}

function renderSelectionOverlay(shape: Shape) {
  if (shape.type === "line" || shape.type === "cable") {
    const midX = (shape.x + shape.x2) / 2;
    const midY = (shape.y + shape.y2) / 2;

    return (
      <g>
        <circle cx={shape.x} cy={shape.y} r="10" fill="#fff" stroke="#3d63ff" strokeWidth="3" style={{ cursor: "move" }} />
        <circle cx={shape.x2} cy={shape.y2} r="10" fill="#fff" stroke="#3d63ff" strokeWidth="3" style={{ cursor: "move" }} />
        <circle cx={midX} cy={midY} r="8" fill="#3d63ff" stroke="#fff" strokeWidth="2" style={{ cursor: "move" }} />
      </g>
    );
  }

  const anchors = getShapeAnchors(shape);

  if (shape.type === "circle") {
    return (
      <g>
        {anchors.map((a) => (
          <circle key={a.id} cx={a.x} cy={a.y} r="4" fill="#9ec1ff" stroke="#fff" strokeWidth="1.5" />
        ))}

        <circle
          cx={shape.x + shape.radius}
          cy={shape.y}
          r="10"
          fill="#fff"
          stroke="#3d63ff"
          strokeWidth="3"
          style={{ cursor: "ew-resize" }}
        />
      </g>
    );
  }

  if (
    shape.type === "rectangle" ||
    shape.type === "socket" ||
    shape.type === "switch" ||
    shape.type === "cad"
  ) {
    const geometry = getSelectionGeometry(shape);

    return (
      <g>
        {anchors.map((a) => (
          <circle key={a.id} cx={a.x} cy={a.y} r="4" fill="#9ec1ff" stroke="#fff" strokeWidth="1.5" />
        ))}

        <line
          x1={geometry.center.x}
          y1={geometry.center.y}
          x2={geometry.rotateHandle.x}
          y2={geometry.rotateHandle.y}
          stroke="#79a6ff"
          strokeWidth="2"
          opacity="0.7"
        />

        <circle cx={geometry.corners.nw.x} cy={geometry.corners.nw.y} r="10" fill="#fff" stroke="#3d63ff" strokeWidth="3" style={{ cursor: "nwse-resize" }} />
        <circle cx={geometry.corners.ne.x} cy={geometry.corners.ne.y} r="10" fill="#fff" stroke="#3d63ff" strokeWidth="3" style={{ cursor: "nesw-resize" }} />
        <circle cx={geometry.corners.se.x} cy={geometry.corners.se.y} r="10" fill="#fff" stroke="#3d63ff" strokeWidth="3" style={{ cursor: "nwse-resize" }} />
        <circle cx={geometry.corners.sw.x} cy={geometry.corners.sw.y} r="10" fill="#fff" stroke="#3d63ff" strokeWidth="3" style={{ cursor: "nesw-resize" }} />

        <circle cx={geometry.sides.n.x} cy={geometry.sides.n.y} r="9" fill="#dfe8ff" stroke="#3d63ff" strokeWidth="2.5" style={{ cursor: "ns-resize" }} />
        <circle cx={geometry.sides.e.x} cy={geometry.sides.e.y} r="9" fill="#dfe8ff" stroke="#3d63ff" strokeWidth="2.5" style={{ cursor: "ew-resize" }} />
        <circle cx={geometry.sides.s.x} cy={geometry.sides.s.y} r="9" fill="#dfe8ff" stroke="#3d63ff" strokeWidth="2.5" style={{ cursor: "ns-resize" }} />
        <circle cx={geometry.sides.w.x} cy={geometry.sides.w.y} r="9" fill="#dfe8ff" stroke="#3d63ff" strokeWidth="2.5" style={{ cursor: "ew-resize" }} />

        <circle
          cx={geometry.rotateHandle.x}
          cy={geometry.rotateHandle.y}
          r="10"
          fill="#fff"
          stroke="#3d63ff"
          strokeWidth="3"
          style={{ cursor: "crosshair" }}
        />
      </g>
    );
  }

  return null;
}

function convertShapeType(shape: Shape, nextType: Shape["type"]): Shape {
  if (shape.type === "cad" || nextType === "cad") {
    return shape;
  }

  if (shape.type === nextType) return shape;

  if ((shape.type === "line" || shape.type === "cable") && (nextType === "line" || nextType === "cable")) {
    return {
      ...shape,
      type: nextType,
      label: nextType === "cable" ? "Кабель" : "Линия",
      cableType: nextType === "cable" ? shape.cableType || "ВВГнг 3x2.5" : "",
      strokeColor: nextType === "cable" ? "#ffbf47" : shape.strokeColor,
      strokeWidth: nextType === "cable" ? Math.max(shape.strokeWidth, 4) : Math.min(shape.strokeWidth, 4),
    };
  }

  if (shape.type === "line" || shape.type === "cable") {
    return shape;
  }

  const center = getShapeCenter(shape);

  if (nextType === "circle") {
    let radius = 40;

    if (shape.type === "circle") {
      radius = shape.radius;
    } else if (
      shape.type === "rectangle" ||
      shape.type === "socket" ||
      shape.type === "switch"
    ) {
      radius = Math.max(18, shape.width / 2, shape.height / 2);
    }

    return {
      id: shape.id,
      type: "circle",
      x: center.x,
      y: center.y,
      radius,
      label: shape.label,
      groupName: shape.groupName,
      cableType: shape.cableType,
      strokeColor: shape.strokeColor,
      fillColor: shape.fillColor,
      strokeWidth: shape.strokeWidth,
      strokeStyle: shape.strokeStyle,
      opacity: shape.opacity,
      rotation: 0,
    };
  }

  if (nextType === "rectangle") {
    let width = 80;
    let height = 80;

    if (shape.type === "circle") {
      width = shape.radius * 2;
      height = shape.radius * 2;
    } else if (
      shape.type === "rectangle" ||
      shape.type === "socket" ||
      shape.type === "switch"
    ) {
      width = shape.width;
      height = shape.height;
    }

    return {
      id: shape.id,
      type: "rectangle",
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
      label: shape.label,
      groupName: shape.groupName,
      cableType: shape.cableType,
      strokeColor: shape.strokeColor,
      fillColor: shape.fillColor,
      strokeWidth: shape.strokeWidth,
      strokeStyle: shape.strokeStyle,
      opacity: shape.opacity,
      rotation: shape.rotation,
    };
  }

  if (nextType === "socket" || nextType === "switch") {
    let width = 36;
    let height = 36;

    if (shape.type === "circle") {
      width = Math.max(36, shape.radius * 2);
      height = Math.max(36, shape.radius * 2);
    } else if (
      shape.type === "rectangle" ||
      shape.type === "socket" ||
      shape.type === "switch"
    ) {
      width = Math.max(24, shape.width);
      height = Math.max(24, shape.height);
    }

    return {
      id: shape.id,
      type: nextType,
      x: center.x,
      y: center.y,
      width,
      height,
      label: nextType === "socket" ? "Розетка" : "Выключатель",
      groupName: shape.groupName,
      cableType: shape.cableType,
      strokeColor: shape.strokeColor,
      fillColor: nextType === "socket" ? shape.fillColor || "#00e7a7" : shape.fillColor || "#ff7300",
      strokeWidth: shape.strokeWidth,
      strokeStyle: shape.strokeStyle,
      opacity: shape.opacity,
      rotation: shape.rotation,
    };
  }

  return shape;
}

function getShapeBounds(shape: Shape) {
  if (shape.type === "rectangle" || shape.type === "cad") {
    const geometry = getSelectionGeometry(shape);
    const points = [
      geometry.corners.nw,
      geometry.corners.ne,
      geometry.corners.se,
      geometry.corners.sw,
    ];

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);

    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
      centerX: geometry.center.x,
      centerY: geometry.center.y,
    };
  }

  if (shape.type === "circle") {
    return {
      left: shape.x - shape.radius,
      right: shape.x + shape.radius,
      top: shape.y - shape.radius,
      bottom: shape.y + shape.radius,
      centerX: shape.x,
      centerY: shape.y,
    };
  }

  if (shape.type === "socket" || shape.type === "switch") {
    const geometry = getSelectionGeometry(shape);
    const points = [
      geometry.corners.nw,
      geometry.corners.ne,
      geometry.corners.se,
      geometry.corners.sw,
    ];

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);

    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
      centerX: geometry.center.x,
      centerY: geometry.center.y,
    };
  }

  return null;
}

function moveShapeBy(shape: Shape, dx: number, dy: number): Shape {
  if (shape.type === "line" || shape.type === "cable") {
    return {
      ...shape,
      x: shape.x + dx,
      y: shape.y + dy,
      x2: shape.x2 + dx,
      y2: shape.y2 + dy,
    };
  }

  if (shape.type === "circle") {
    return {
      ...shape,
      x: shape.x + dx,
      y: shape.y + dy,
    };
  }

  if (
    shape.type === "rectangle" ||
    shape.type === "cad" ||
    shape.type === "socket" ||
    shape.type === "switch"
  ) {
    return {
      ...shape,
      x: shape.x + dx,
      y: shape.y + dy,
    };
  }

  return shape;
}

function getAlignmentCandidates(shape: Shape) {
  const bounds = getShapeBounds(shape);
  if (!bounds) return null;

  return {
    vertical: [
      { key: "left", value: bounds.left },
      { key: "centerX", value: bounds.centerX },
      { key: "right", value: bounds.right },
    ],
    horizontal: [
      { key: "top", value: bounds.top },
      { key: "centerY", value: bounds.centerY },
      { key: "bottom", value: bounds.bottom },
    ],
  };
}

function computeSnappedMove(
  movingShape: Shape,
  allShapes: Shape[],
  movingId: string,
  camera: CameraState
): { shape: Shape; guides: AlignmentGuide[] } {
  const movingCandidates = getAlignmentCandidates(movingShape);
  if (!movingCandidates) {
    return { shape: movingShape, guides: [] };
  }

  const thresholdPx = 10;
  const thresholdWorld = thresholdPx / Math.max(camera.zoom, 0.0001);

  let bestVertical: { delta: number; target: number } | null = null;
  let bestHorizontal: { delta: number; target: number } | null = null;

  for (const other of allShapes) {
    if (other.id === movingId) continue;
    if (other.type === "line" || other.type === "cable") continue;

    const otherCandidates = getAlignmentCandidates(other);
    if (!otherCandidates) continue;

    for (const own of movingCandidates.vertical) {
      for (const target of otherCandidates.vertical) {
        const delta = target.value - own.value;
        const absDelta = Math.abs(delta);

        if (absDelta <= thresholdWorld) {
          if (!bestVertical || absDelta < Math.abs(bestVertical.delta)) {
            bestVertical = {
              delta,
              target: target.value,
            };
          }
        }
      }
    }

    for (const own of movingCandidates.horizontal) {
      for (const target of otherCandidates.horizontal) {
        const delta = target.value - own.value;
        const absDelta = Math.abs(delta);

        if (absDelta <= thresholdWorld) {
          if (!bestHorizontal || absDelta < Math.abs(bestHorizontal.delta)) {
            bestHorizontal = {
              delta,
              target: target.value,
            };
          }
        }
      }
    }
  }

  const dx = bestVertical ? bestVertical.delta : 0;
  const dy = bestHorizontal ? bestHorizontal.delta : 0;

  const snappedShape = moveShapeBy(movingShape, dx, dy);

  const guides: AlignmentGuide[] = [];
  if (bestVertical) {
    guides.push({
      orientation: "vertical",
      worldValue: bestVertical.target,
    });
  }
  if (bestHorizontal) {
    guides.push({
      orientation: "horizontal",
      worldValue: bestHorizontal.target,
    });
  }

  return {
    shape: snappedShape,
    guides,
  };
}
function getShapeCenter(shape: Shape) {
  if (shape.type === "rectangle" || shape.type === "cad") {
    return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
  }
  if (shape.type === "circle") {
    return { x: shape.x, y: shape.y };
  }
  if (shape.type === "socket" || shape.type === "switch") {
    return { x: shape.x, y: shape.y };
  }
  return { x: (shape.x + shape.x2) / 2, y: (shape.y + shape.y2) / 2 };
}

function transformShape(
  shape: Shape,
  interaction: InteractionState,
  point: { x: number; y: number },
  allShapes: Shape[]
): Shape {
  if (isShapeLocked(shape)) return shape;
  const dx = point.x - interaction.startPointer.x;
  const dy = point.y - interaction.startPointer.y;
  const initial = interaction.initialShape;

  if (interaction.mode === "move") {
    if (shape.type === "line" || shape.type === "cable") {
      const s = initial as LineShape;
      return {
        ...shape,
        x: s.x + dx,
        y: s.y + dy,
        x2: s.x2 + dx,
        y2: s.y2 + dy,
      };
    }

    if (shape.type === "circle") {
      const s = initial as CircleShape;
      return { ...shape, x: s.x + dx, y: s.y + dy };
    }

    if (shape.type === "rectangle") {
      const s = initial as RectangleShape;
      return { ...shape, x: s.x + dx, y: s.y + dy };
    }

    if (shape.type === "cad") {
      const s = initial as CadShape;
      return { ...shape, x: s.x + dx, y: s.y + dy };
    }

    const s = initial as SocketShape | SwitchShape;
    return { ...shape, x: s.x + dx, y: s.y + dy };
  }

  if (interaction.mode === "line-start" && (shape.type === "line" || shape.type === "cable")) {
    const snapped = orthogonalSnap({ x: shape.x2, y: shape.y2 }, point, 2);
    const snap = findClosestAnchor(allShapes, snapped, 26, shape.id);
    return {
      ...shape,
      x: snap ? snap.x : snapped.x,
      y: snap ? snap.y : snapped.y,
      startAttachment: snap
        ? { shapeId: snap.shapeId, anchorId: snap.anchorId }
        : undefined,
    };
  }

  if (interaction.mode === "line-end" && (shape.type === "line" || shape.type === "cable")) {
    const snapped = orthogonalSnap({ x: shape.x, y: shape.y }, point, 2);
    const snap = findClosestAnchor(allShapes, snapped, 26, shape.id);
    return {
      ...shape,
      x2: snap ? snap.x : snapped.x,
      y2: snap ? snap.y : snapped.y,
      endAttachment: snap
        ? { shapeId: snap.shapeId, anchorId: snap.anchorId }
        : undefined,
    };
  }

  if (interaction.mode === "resize-circle" && shape.type === "circle") {
    return {
      ...shape,
      radius: Math.max(10, distance(shape.x, shape.y, point.x, point.y)),
    };
  }

  const isRectLike =
    shape.type === "rectangle" ||
    shape.type === "socket" ||
    shape.type === "switch" ||
    shape.type === "cad";

  if ((isCornerResizeHandle(interaction.mode) || isSideResizeHandle(interaction.mode)) && isRectLike) {
    const s = initial as RectangleShape | SocketShape | SwitchShape | CadShape;

    let left: number;
    let top: number;
    let width: number;
    let height: number;

    if (s.type === "rectangle" || s.type === "cad") {
      left = s.x;
      top = s.y;
      width = s.width;
      height = s.height;
    } else {
      left = s.x - s.width / 2;
      top = s.y - s.height / 2;
      width = s.width;
      height = s.height;
    }

    let nextLeft = left;
    let nextTop = top;
    let nextWidth = width;
    let nextHeight = height;

    if (isCornerResizeHandle(interaction.mode)) {
      const ratio = width / Math.max(height, 1);

      if (interaction.mode === "resize-se") {
        const size = Math.max(width + dx, (height + dy) * ratio, 16);
        nextWidth = size;
        nextHeight = size / ratio;
      }

      if (interaction.mode === "resize-sw") {
        const size = Math.max(width - dx, (height + dy) * ratio, 16);
        nextWidth = size;
        nextHeight = size / ratio;
        nextLeft = left + (width - nextWidth);
      }

      if (interaction.mode === "resize-ne") {
        const size = Math.max(width + dx, (height - dy) * ratio, 16);
        nextWidth = size;
        nextHeight = size / ratio;
        nextTop = top + (height - nextHeight);
      }

      if (interaction.mode === "resize-nw") {
        const size = Math.max(width - dx, (height - dy) * ratio, 16);
        nextWidth = size;
        nextHeight = size / ratio;
        nextLeft = left + (width - nextWidth);
        nextTop = top + (height - nextHeight);
      }
    }

    if (isSideResizeHandle(interaction.mode)) {
      if (interaction.mode === "resize-e") {
        nextWidth = Math.max(16, width + dx);
      }
      if (interaction.mode === "resize-w") {
        nextWidth = Math.max(16, width - dx);
        nextLeft = left + (width - nextWidth);
      }
      if (interaction.mode === "resize-s") {
        nextHeight = Math.max(16, height + dy);
      }
      if (interaction.mode === "resize-n") {
        nextHeight = Math.max(16, height - dy);
        nextTop = top + (height - nextHeight);
      }
    }

    if (shape.type === "rectangle") {
      return {
        ...shape,
        x: nextLeft,
        y: nextTop,
        width: nextWidth,
        height: nextHeight,
      };
    }

    if (shape.type === "cad") {
      return {
        ...shape,
        x: nextLeft,
        y: nextTop,
        width: nextWidth,
        height: nextHeight,
      };
    }

    return {
      ...shape,
      x: nextLeft + nextWidth / 2,
      y: nextTop + nextHeight / 2,
      width: nextWidth,
      height: nextHeight,
    };
  }

  if (interaction.mode === "rotate") {
    if (shape.type === "rectangle") {
      const s = initial as RectangleShape;
      const cx = s.x + s.width / 2;
      const cy = s.y + s.height / 2;
      return { ...shape, rotation: angleDeg(cx, cy, point.x, point.y) + 90 };
    }

    if (shape.type === "cad") {
      const s = initial as CadShape;
      const cx = s.x + s.width / 2;
      const cy = s.y + s.height / 2;
      return { ...shape, rotation: angleDeg(cx, cy, point.x, point.y) + 90 };
    }

    if (shape.type === "socket" || shape.type === "switch") {
      const s = initial as SocketShape | SwitchShape;
      return { ...shape, rotation: angleDeg(s.x, s.y, point.x, point.y) + 90 };
    }
  }

  return shape;
}

function hitTestHandle(px: number, py: number, shape: Shape): HandleType | null {
  const cornerRadius = 20;
  const sideRadius = 18;
  const rotateRadius = 18;
  const lineRadius = 14;
  const moveRadius = 16;

  if (shape.type === "line" || shape.type === "cable") {
    const midX = (shape.x + shape.x2) / 2;
    const midY = (shape.y + shape.y2) / 2;

    if (distance(px, py, shape.x, shape.y) <= lineRadius) return "line-start";
    if (distance(px, py, shape.x2, shape.y2) <= lineRadius) return "line-end";
    if (distance(px, py, midX, midY) <= moveRadius) return "move";

    return null;
  }

  if (shape.type === "circle") {
    if (distance(px, py, shape.x + shape.radius, shape.y) <= cornerRadius) {
      return "resize-circle";
    }
    return null;
  }

  if (
    shape.type === "rectangle" ||
    shape.type === "socket" ||
    shape.type === "switch" ||
    shape.type === "cad"
  ) {
    const geometry = getSelectionGeometry(shape);

    if (distance(px, py, geometry.rotateHandle.x, geometry.rotateHandle.y) <= rotateRadius) {
      return "rotate";
    }

    if (distance(px, py, geometry.corners.nw.x, geometry.corners.nw.y) <= cornerRadius) return "resize-nw";
    if (distance(px, py, geometry.corners.ne.x, geometry.corners.ne.y) <= cornerRadius) return "resize-ne";
    if (distance(px, py, geometry.corners.se.x, geometry.corners.se.y) <= cornerRadius) return "resize-se";
    if (distance(px, py, geometry.corners.sw.x, geometry.corners.sw.y) <= cornerRadius) return "resize-sw";

    if (distance(px, py, geometry.sides.n.x, geometry.sides.n.y) <= sideRadius) return "resize-n";
    if (distance(px, py, geometry.sides.e.x, geometry.sides.e.y) <= sideRadius) return "resize-e";
    if (distance(px, py, geometry.sides.s.x, geometry.sides.s.y) <= sideRadius) return "resize-s";
    if (distance(px, py, geometry.sides.w.x, geometry.sides.w.y) <= sideRadius) return "resize-w";
  }

  return null;
}

function getSelectionGeometry(
  shape: RectangleShape | SocketShape | SwitchShape | CadShape
) {
  if (shape.type === "rectangle" || shape.type === "cad") {
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;

    const corners = {
      nw: rotatePoint(shape.x, shape.y, cx, cy, shape.rotation),
      ne: rotatePoint(shape.x + shape.width, shape.y, cx, cy, shape.rotation),
      se: rotatePoint(shape.x + shape.width, shape.y + shape.height, cx, cy, shape.rotation),
      sw: rotatePoint(shape.x, shape.y + shape.height, cx, cy, shape.rotation),
    };

    const sides = {
      n: rotatePoint(shape.x + shape.width / 2, shape.y, cx, cy, shape.rotation),
      e: rotatePoint(shape.x + shape.width, shape.y + shape.height / 2, cx, cy, shape.rotation),
      s: rotatePoint(shape.x + shape.width / 2, shape.y + shape.height, cx, cy, shape.rotation),
      w: rotatePoint(shape.x, shape.y + shape.height / 2, cx, cy, shape.rotation),
    };

    const topCenter = sides.n;
    const rotateHandle = {
      x: topCenter.x,
      y: topCenter.y - 28,
    };

    return {
      center: { x: cx, y: cy },
      corners,
      sides,
      rotateHandle,
    };
  }

  const left = shape.x - shape.width / 2;
  const top = shape.y - shape.height / 2;
  const cx = shape.x;
  const cy = shape.y;

  const corners = {
    nw: rotatePoint(left, top, cx, cy, shape.rotation),
    ne: rotatePoint(left + shape.width, top, cx, cy, shape.rotation),
    se: rotatePoint(left + shape.width, top + shape.height, cx, cy, shape.rotation),
    sw: rotatePoint(left, top + shape.height, cx, cy, shape.rotation),
  };

  const sides = {
    n: rotatePoint(shape.x, top, cx, cy, shape.rotation),
    e: rotatePoint(left + shape.width, shape.y, cx, cy, shape.rotation),
    s: rotatePoint(shape.x, top + shape.height, cx, cy, shape.rotation),
    w: rotatePoint(left, shape.y, cx, cy, shape.rotation),
  };

  const rotateHandle = {
    x: sides.n.x,
    y: sides.n.y - 28,
  };

  return {
    center: { x: cx, y: cy },
    corners,
    sides,
    rotateHandle,
  };
}

function isScreenPointInsideCenteredSquare(
  screenPoint: { x: number; y: number },
  target: { x: number; y: number },
  size: number
) {
  const half = size / 2;
  return (
    screenPoint.x >= target.x - half &&
    screenPoint.x <= target.x + half &&
    screenPoint.y >= target.y - half &&
    screenPoint.y <= target.y + half
  );
}

function getSquareHandleDistance(
  screenPoint: { x: number; y: number },
  target: { x: number; y: number }
) {
  return distance(screenPoint.x, screenPoint.y, target.x, target.y);
}

function hitTestHandleScreen(
  screenPoint: { x: number; y: number },
  shape: Shape,
  camera: CameraState
): HandleType | null {
  const cornerSizePx = 18;
  const sideSizePx = 16;
  const rotateSizePx = 18;
  const lineEndSizePx = 18;
  const lineMidSizePx = 16;
  const circleHandleSizePx = 18;

  const worldToScreen = (worldX: number, worldY: number) =>
    projectWorldToScreen(worldX, worldY, camera);

  if (shape.type === "line" || shape.type === "cable") {
    const start = worldToScreen(shape.x, shape.y);
    const end = worldToScreen(shape.x2, shape.y2);
    const mid = worldToScreen((shape.x + shape.x2) / 2, (shape.y + shape.y2) / 2);

    const candidates: Array<{
      type: HandleType;
      point: { x: number; y: number };
      size: number;
    }> = [
      { type: "line-start", point: start, size: lineEndSizePx },
      { type: "line-end", point: end, size: lineEndSizePx },
      { type: "move", point: mid, size: lineMidSizePx },
    ];

    const nearest = candidates
      .filter((candidate) =>
        isScreenPointInsideCenteredSquare(screenPoint, candidate.point, candidate.size)
      )
      .sort(
        (a, b) =>
          getSquareHandleDistance(screenPoint, a.point) -
          getSquareHandleDistance(screenPoint, b.point)
      )[0];

    return nearest ? nearest.type : null;
  }

  if (shape.type === "circle") {
    const handle = worldToScreen(shape.x + shape.radius, shape.y);

    if (isScreenPointInsideCenteredSquare(screenPoint, handle, circleHandleSizePx)) {
      return "resize-circle";
    }

    return null;
  }

  if (
    shape.type === "rectangle" ||
    shape.type === "socket" ||
    shape.type === "switch" ||
    shape.type === "cad"
  ) {
    const geometry = getSelectionGeometry(shape);

    const rotateHandle = worldToScreen(geometry.rotateHandle.x, geometry.rotateHandle.y);
    if (isScreenPointInsideCenteredSquare(screenPoint, rotateHandle, rotateSizePx)) {
      return "rotate";
    }

    const cornerCandidates: Array<{ type: HandleType; point: { x: number; y: number } }> = [
      {
        type: "resize-nw",
        point: worldToScreen(geometry.corners.nw.x, geometry.corners.nw.y),
      },
      {
        type: "resize-ne",
        point: worldToScreen(geometry.corners.ne.x, geometry.corners.ne.y),
      },
      {
        type: "resize-se",
        point: worldToScreen(geometry.corners.se.x, geometry.corners.se.y),
      },
      {
        type: "resize-sw",
        point: worldToScreen(geometry.corners.sw.x, geometry.corners.sw.y),
      },
    ];

    const nearestCorner = cornerCandidates
      .filter((candidate) =>
        isScreenPointInsideCenteredSquare(screenPoint, candidate.point, cornerSizePx)
      )
      .sort(
        (a, b) =>
          getSquareHandleDistance(screenPoint, a.point) -
          getSquareHandleDistance(screenPoint, b.point)
      )[0];

    if (nearestCorner) {
      return nearestCorner.type;
    }

    const sideCandidates: Array<{ type: HandleType; point: { x: number; y: number } }> = [
      {
        type: "resize-n",
        point: worldToScreen(geometry.sides.n.x, geometry.sides.n.y),
      },
      {
        type: "resize-e",
        point: worldToScreen(geometry.sides.e.x, geometry.sides.e.y),
      },
      {
        type: "resize-s",
        point: worldToScreen(geometry.sides.s.x, geometry.sides.s.y),
      },
      {
        type: "resize-w",
        point: worldToScreen(geometry.sides.w.x, geometry.sides.w.y),
      },
    ];

    const nearestSide = sideCandidates
      .filter((candidate) =>
        isScreenPointInsideCenteredSquare(screenPoint, candidate.point, sideSizePx)
      )
      .sort(
        (a, b) =>
          getSquareHandleDistance(screenPoint, a.point) -
          getSquareHandleDistance(screenPoint, b.point)
      )[0];

    if (nearestSide) {
      return nearestSide.type;
    }
  }

  return null;
}
  
function renderSelectionOverlayScreen(shape: Shape, camera: CameraState) {
  const mainSize = 18;
  const sideSize = 16;
  const lineEndSize = 18;
  const lineMidSize = 16;
  const anchorR = 4;

  const renderSquareHandle = (
    x: number,
    y: number,
    size: number,
    fill: string,
    stroke: string,
    strokeWidth: number
  ) => (
    <rect
      x={x - size / 2}
      y={y - size / 2}
      width={size}
      height={size}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      rx="2"
    />
  );

  if (shape.type === "line" || shape.type === "cable") {
    const a = projectWorldToScreen(shape.x, shape.y, camera);
    const b = projectWorldToScreen(shape.x2, shape.y2, camera);
    const mid = projectWorldToScreen((shape.x + shape.x2) / 2, (shape.y + shape.y2) / 2, camera);

    return (
      <g pointerEvents="none">
        {renderSquareHandle(a.x, a.y, lineEndSize, "#fff", "#3d63ff", 3)}
        {renderSquareHandle(b.x, b.y, lineEndSize, "#fff", "#3d63ff", 3)}
        {renderSquareHandle(mid.x, mid.y, lineMidSize, "#3d63ff", "#fff", 2)}
      </g>
    );
  }

  const anchors = getShapeAnchors(shape).map((a) => ({
    ...a,
    ...projectWorldToScreen(a.x, a.y, camera),
  }));

  if (shape.type === "circle") {
    const handle = projectWorldToScreen(shape.x + shape.radius, shape.y, camera);

    return (
      <g pointerEvents="none">
        {anchors.map((a) => (
          <circle
            key={a.id}
            cx={a.x}
            cy={a.y}
            r={anchorR}
            fill="#9ec1ff"
            stroke="#fff"
            strokeWidth="1.5"
          />
        ))}

        {renderSquareHandle(handle.x, handle.y, mainSize, "#fff", "#3d63ff", 3)}
      </g>
    );
  }

  if (
    shape.type === "rectangle" ||
    shape.type === "socket" ||
    shape.type === "switch" ||
    shape.type === "cad"
  ) {
    const geometry = getSelectionGeometry(shape);

    const center = projectWorldToScreen(geometry.center.x, geometry.center.y, camera);
    const rotateHandle = projectWorldToScreen(
      geometry.rotateHandle.x,
      geometry.rotateHandle.y,
      camera
    );

    const corners = {
      nw: projectWorldToScreen(geometry.corners.nw.x, geometry.corners.nw.y, camera),
      ne: projectWorldToScreen(geometry.corners.ne.x, geometry.corners.ne.y, camera),
      se: projectWorldToScreen(geometry.corners.se.x, geometry.corners.se.y, camera),
      sw: projectWorldToScreen(geometry.corners.sw.x, geometry.corners.sw.y, camera),
    };

    const sides = {
      n: projectWorldToScreen(geometry.sides.n.x, geometry.sides.n.y, camera),
      e: projectWorldToScreen(geometry.sides.e.x, geometry.sides.e.y, camera),
      s: projectWorldToScreen(geometry.sides.s.x, geometry.sides.s.y, camera),
      w: projectWorldToScreen(geometry.sides.w.x, geometry.sides.w.y, camera),
    };

    return (
      <g pointerEvents="none">
        {anchors.map((a) => (
          <circle
            key={a.id}
            cx={a.x}
            cy={a.y}
            r={anchorR}
            fill="#9ec1ff"
            stroke="#fff"
            strokeWidth="1.5"
          />
        ))}

        <line
          x1={center.x}
          y1={center.y}
          x2={rotateHandle.x}
          y2={rotateHandle.y}
          stroke="#79a6ff"
          strokeWidth="2"
          opacity="0.7"
        />

        {renderSquareHandle(corners.nw.x, corners.nw.y, mainSize, "#fff", "#3d63ff", 3)}
        {renderSquareHandle(corners.ne.x, corners.ne.y, mainSize, "#fff", "#3d63ff", 3)}
        {renderSquareHandle(corners.se.x, corners.se.y, mainSize, "#fff", "#3d63ff", 3)}
        {renderSquareHandle(corners.sw.x, corners.sw.y, mainSize, "#fff", "#3d63ff", 3)}

        {renderSquareHandle(sides.n.x, sides.n.y, sideSize, "#dfe8ff", "#3d63ff", 2.5)}
        {renderSquareHandle(sides.e.x, sides.e.y, sideSize, "#dfe8ff", "#3d63ff", 2.5)}
        {renderSquareHandle(sides.s.x, sides.s.y, sideSize, "#dfe8ff", "#3d63ff", 2.5)}
        {renderSquareHandle(sides.w.x, sides.w.y, sideSize, "#dfe8ff", "#3d63ff", 2.5)}

        {renderSquareHandle(rotateHandle.x, rotateHandle.y, mainSize, "#fff", "#3d63ff", 3)}
      </g>
    );
  }

  return null;
}
function renderAlignmentGuidesScreen(
  guides: AlignmentGuide[],
  camera: CameraState,
  canvasSize: { width: number; height: number }
) {
  if (guides.length === 0) return null;

  return (
    <g pointerEvents="none">
      {guides.map((guide, index) => {
        if (guide.orientation === "vertical") {
          const p = projectWorldToScreen(guide.worldValue, 0, camera);
          return (
            <line
              key={`guide-v-${index}`}
              x1={p.x}
              y1={0}
              x2={p.x}
              y2={canvasSize.height}
              stroke="#00e7a7"
              strokeWidth="1.5"
              strokeDasharray="6 6"
              opacity="0.95"
            />
          );
        }

        const p = projectWorldToScreen(0, guide.worldValue, camera);
        return (
          <line
            key={`guide-h-${index}`}
            x1={0}
            y1={p.y}
            x2={canvasSize.width}
            y2={p.y}
            stroke="#00e7a7"
            strokeWidth="1.5"
            strokeDasharray="6 6"
            opacity="0.95"
          />
        );
      })}
    </g>
  );
}
function worldToScreenPoint(
  worldX: number,
  worldY: number,
  camera: CameraState
) {
  return {
    x: camera.x + worldX * camera.zoom,
    y: camera.y + worldY * camera.zoom,
  };
}
function projectWorldToScreen(
  worldX: number,
  worldY: number,
  camera: CameraState
) {
  return {
    x: camera.x + worldX * camera.zoom,
    y: camera.y + worldY * camera.zoom,
  };
}
function screenToWorldPoint(
  screenX: number,
  screenY: number,
  camera: CameraState
) {
  return {
    x: (screenX - camera.x) / camera.zoom,
    y: (screenY - camera.y) / camera.zoom,
  };
}

function rotatePoint(px: number, py: number, cx: number, cy: number, angleDegValue: number) {
  const angle = (angleDegValue * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = px - cx;
  const dy = py - cy;

  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

function angleDeg(cx: number, cy: number, px: number, py: number) {
  return (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
}

function isCornerResizeHandle(handle: HandleType) {
  return (
    handle === "resize-nw" ||
    handle === "resize-ne" ||
    handle === "resize-sw" ||
    handle === "resize-se"
  );
}

function isSideResizeHandle(handle: HandleType) {
  return (
    handle === "resize-n" ||
    handle === "resize-s" ||
    handle === "resize-e" ||
    handle === "resize-w"
  );
}
function isShapeLocked(shape: Shape | null | undefined) {
  return Boolean(shape?.locked);
}

function moveShapeInStack(
  shapes: Shape[],
  shapeId: string,
  direction: "backward" | "forward" | "to-back" | "to-front"
) {
  const index = shapes.findIndex((shape) => shape.id === shapeId);
  if (index === -1) return shapes;

  const next = [...shapes];
  const [item] = next.splice(index, 1);

  if (direction === "to-back") {
    next.unshift(item);
    return next;
  }

  if (direction === "to-front") {
    next.push(item);
    return next;
  }

  if (direction === "backward") {
    const targetIndex = Math.max(0, index - 1);
    next.splice(targetIndex, 0, item);
    return next;
  }

  const targetIndex = Math.min(next.length, index + 1);
  next.splice(targetIndex, 0, item);
  return next;
}

function getCursorByHandle(handle: HandleType): React.CSSProperties["cursor"] {
  switch (handle) {
    case "move":
      return "move";
    case "resize-n":
    case "resize-s":
      return "ns-resize";
    case "resize-e":
    case "resize-w":
      return "ew-resize";
    case "resize-nw":
    case "resize-se":
      return "nwse-resize";
    case "resize-ne":
    case "resize-sw":
      return "nesw-resize";
    case "resize-circle":
      return "ew-resize";
    case "rotate":
      return "crosshair";
    case "line-start":
    case "line-end":
      return "move";
    default:
      return "grab";
  }
}

function resolveIntentHandle(
  candidateMode: HandleType,
  dxScreen: number,
  dyScreen: number
): HandleType {
  const absX = Math.abs(dxScreen);
  const absY = Math.abs(dyScreen);

  if (
    candidateMode === "resize-nw" ||
    candidateMode === "resize-ne" ||
    candidateMode === "resize-se" ||
    candidateMode === "resize-sw" ||
    candidateMode === "rotate" ||
    candidateMode === "line-start" ||
    candidateMode === "line-end"
  ) {
    return candidateMode;
  }

  if (candidateMode === "resize-circle") {
    return absX >= absY * 0.85 ? "resize-circle" : "move";
  }

  if (candidateMode === "resize-e" || candidateMode === "resize-w") {
    return absX >= Math.max(4, absY * 0.85) ? candidateMode : "move";
  }

  if (candidateMode === "resize-n" || candidateMode === "resize-s") {
    return absY >= Math.max(4, absX * 0.85) ? candidateMode : "move";
  }

  return "move";
}

function orthogonalSnap(from: { x: number; y: number }, to: { x: number; y: number }, tolerance = 2) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) <= tolerance) return { x: from.x, y: to.y };
  if (Math.abs(dy) <= tolerance) return { x: to.x, y: from.y };

  return to;
}

function getShapeAnchors(shape: Shape): AnchorPoint[] {
  if (shape.type === "line" || shape.type === "cable") return [];

  if (shape.type === "circle") {
    return [
      { id: "center", x: shape.x, y: shape.y },
      { id: "top", x: shape.x, y: shape.y - shape.radius },
      { id: "right", x: shape.x + shape.radius, y: shape.y },
      { id: "bottom", x: shape.x, y: shape.y + shape.radius },
      { id: "left", x: shape.x - shape.radius, y: shape.y },
    ];
  }

  if (shape.type === "rectangle") {
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    const raw = [
      { id: "center", x: cx, y: cy },
      { id: "top", x: shape.x + shape.width / 2, y: shape.y },
      { id: "right", x: shape.x + shape.width, y: shape.y + shape.height / 2 },
      { id: "bottom", x: shape.x + shape.width / 2, y: shape.y + shape.height },
      { id: "left", x: shape.x, y: shape.y + shape.height / 2 },
    ];

    return raw.map((a) =>
      a.id === "center" ? a : { id: a.id, ...rotatePoint(a.x, a.y, cx, cy, shape.rotation) }
    );
  }

  if (shape.type === "cad") {
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    const raw = [
      { id: "center", x: cx, y: cy },
      { id: "top", x: shape.x + shape.width / 2, y: shape.y },
      { id: "right", x: shape.x + shape.width, y: shape.y + shape.height / 2 },
      { id: "bottom", x: shape.x + shape.width / 2, y: shape.y + shape.height },
      { id: "left", x: shape.x, y: shape.y + shape.height / 2 },
    ];

    return raw.map((a) =>
      a.id === "center" ? a : { id: a.id, ...rotatePoint(a.x, a.y, cx, cy, shape.rotation) }
    );
  }

  if (shape.type === "socket" || shape.type === "switch") {
    const cx = shape.x;
    const cy = shape.y;
    const raw = [
      { id: "center", x: shape.x, y: shape.y },
      { id: "top", x: shape.x, y: shape.y - shape.height / 2 },
      { id: "right", x: shape.x + shape.width / 2, y: shape.y },
      { id: "bottom", x: shape.x, y: shape.y + shape.height / 2 },
      { id: "left", x: shape.x - shape.width / 2, y: shape.y },
    ];

    return raw.map((a) =>
      a.id === "center" ? a : { id: a.id, ...rotatePoint(a.x, a.y, cx, cy, shape.rotation) }
    );
  }

  return [];
}

function getAnchorPosition(shape: Shape, anchorId: string) {
  const anchor = getShapeAnchors(shape).find((a) => a.id === anchorId);
  return anchor ? { x: anchor.x, y: anchor.y } : null;
}

function findClosestAnchor(
  shapes: Shape[],
  point: { x: number; y: number },
  maxDistance = 20,
  excludeLineId?: string
): { shapeId: string; anchorId: string; x: number; y: number } | null {
  let best: { shapeId: string; anchorId: string; x: number; y: number } | null = null;
  let bestDist = Infinity;

  for (const shape of shapes) {
    if (shape.id === excludeLineId) continue;
    if (shape.type === "line" || shape.type === "cable") continue;

    for (const anchor of getShapeAnchors(shape)) {
      const d = distance(point.x, point.y, anchor.x, anchor.y);
      if (d < bestDist && d <= maxDistance) {
        bestDist = d;
        best = {
          shapeId: shape.id,
          anchorId: anchor.id,
          x: anchor.x,
          y: anchor.y,
        };
      }
    }
  }

  return best;
}

function applyAttachments(shapes: Shape[]): Shape[] {
  return shapes.map((shape) => {
    if (shape.type !== "line" && shape.type !== "cable") return shape;

    const next = { ...shape };

    if (shape.startAttachment) {
      const target = shapes.find((s) => s.id === shape.startAttachment!.shapeId);
      if (target) {
        const p = getAnchorPosition(target, shape.startAttachment.anchorId);
        if (p) {
          next.x = p.x;
          next.y = p.y;
        }
      }
    }

    if (shape.endAttachment) {
      const target = shapes.find((s) => s.id === shape.endAttachment!.shapeId);
      if (target) {
        const p = getAnchorPosition(target, shape.endAttachment.anchorId);
        if (p) {
          next.x2 = p.x;
          next.y2 = p.y;
        }
      }
    }

    return next;
  });
}

function buildEstimate(shapes: Shape[], metersPerPixel: number): EstimateRow[] {
  const acc = new Map<string, EstimateRow>();

  for (const shape of shapes) {
    if (shape.type !== "cable") continue;

    const meters = lineLengthMeters(shape, metersPerPixel);
    const groupName = shape.groupName || "Без группы";
    const cableType = shape.cableType || "Без типа";
    const key = `${groupName}__${cableType}`;
    const existing = acc.get(key);

    if (existing) {
      existing.meters += meters;
    } else {
      acc.set(key, { groupName, cableType, meters });
    }
  }

  return [...acc.values()].sort((a, b) => a.groupName.localeCompare(b.groupName));
}

function lineLengthMeters(shape: LineShape, metersPerPixel: number) {
  const px = distance(shape.x, shape.y, shape.x2, shape.y2);
  return metersPerPixel > 0 ? px * metersPerPixel : px;
}

function pointInRotatedRectWorld(
  px: number,
  py: number,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  rotation: number,
  padding = 0
) {
  const angle = (-rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = px - centerX;
  const dy = py - centerY;

  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  return (
    Math.abs(localX) <= width / 2 + padding &&
    Math.abs(localY) <= height / 2 + padding
  );
}

function screenPaddingToWorld(camera: CameraState, px: number) {
  return px / Math.max(camera.zoom, 0.0001);
}

function hitTestShapeScreen(
  screenPoint: { x: number; y: number },
  shape: Shape,
  camera: CameraState
) {
  const worldPoint = screenToWorldPoint(screenPoint.x, screenPoint.y, camera);
  const worldPadding = screenPaddingToWorld(camera, 12);

  if (shape.type === "rectangle" || shape.type === "cad") {
    return pointInRotatedRectWorld(
      worldPoint.x,
      worldPoint.y,
      shape.x + shape.width / 2,
      shape.y + shape.height / 2,
      shape.width,
      shape.height,
      shape.rotation,
      worldPadding
    );
  }

  if (shape.type === "socket" || shape.type === "switch") {
    return pointInRotatedRectWorld(
      worldPoint.x,
      worldPoint.y,
      shape.x,
      shape.y,
      shape.width,
      shape.height,
      shape.rotation,
      worldPadding
    );
  }

  if (shape.type === "circle") {
    return distance(worldPoint.x, worldPoint.y, shape.x, shape.y) <= shape.radius + worldPadding;
  }

  if (shape.type === "line" || shape.type === "cable") {
    const a = projectWorldToScreen(shape.x, shape.y, camera);
    const b = projectWorldToScreen(shape.x2, shape.y2, camera);
    return distancePointToSegment(screenPoint.x, screenPoint.y, a.x, a.y, b.x, b.y) <= 12;
  }

  return false;
}

function isPointOnShape(px: number, py: number, shape: Shape) {
  if (shape.type === "rectangle" || shape.type === "cad") {
    return pointInRotatedRectWorld(
      px,
      py,
      shape.x + shape.width / 2,
      shape.y + shape.height / 2,
      shape.width,
      shape.height,
      shape.rotation
    );
  }

  if (shape.type === "circle") {
    return distance(px, py, shape.x, shape.y) <= shape.radius;
  }

  if (shape.type === "line" || shape.type === "cable") {
    return distancePointToSegment(px, py, shape.x, shape.y, shape.x2, shape.y2) <= 8;
  }

  if (shape.type === "socket" || shape.type === "switch") {
    return pointInRotatedRectWorld(
      px,
      py,
      shape.x,
      shape.y,
      shape.width,
      shape.height,
      shape.rotation
    );
  }

  return false;
}

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function distancePointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) return distance(px, py, x1, y1);

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return distance(px, py, projX, projY);
}

function hexToRgba(hex: string, opacity: number) {
  const safe = safeColor(hex).replace("#", "");
  const normalized = safe.length === 3 ? safe.split("").map((c) => c + c).join("") : safe;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function safeColor(value: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  return "#4b70ff";
}

function cloneDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function IconUndo() {
  return (
    <svg viewBox="0 0 24 24" style={styles.iconSvg}>
      <path d="M9 7H4v5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 17a8 8 0 0 0-8-8H4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRedo() {
  return (
    <svg viewBox="0 0 24 24" style={styles.iconSvg}>
      <path d="M15 7h5v5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17a8 8 0 0 1 8-8h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconHelp() {
  return (
    <svg viewBox="0 0 24 24" style={styles.iconSvg}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2.2-2.5 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" style={styles.iconSvg}>
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: "100vh",
    overflow: "hidden",
    background: "#0b1020",
    color: "#f2f6ff",
    padding: 12,
    boxSizing: "border-box",
    fontFamily: "Inter, Arial, sans-serif",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: 10,
  },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    minHeight: 0,
  },
  leftBlock: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  backLink: {
    color: "#d6e2ff",
    textDecoration: "none",
    background: "#121937",
    border: "1px solid #26305b",
    borderRadius: 10,
    padding: "9px 12px",
  },
  projectInput: {
    background: "#121937",
    color: "#fff",
    border: "1px solid #27305f",
    borderRadius: 10,
    padding: "9px 12px",
    minWidth: 220,
    height: 38,
    boxSizing: "border-box",
  },
  btn: {
    background: "#1a234a",
    color: "#fff",
    border: "1px solid #33407a",
    borderRadius: 10,
    padding: "9px 12px",
    cursor: "pointer",
    height: 38,
  },
  btnActive: {
    background: "#2948c7",
    color: "#fff",
    border: "1px solid #7aa0ff",
    borderRadius: 10,
    padding: "9px 12px",
    cursor: "pointer",
    height: 38,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: "1px solid #33407a",
    background: "#1a234a",
    color: "#fff",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    padding: 0,
  },
  iconBtnSmall: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: "1px solid #33407a",
    background: "#1a234a",
    color: "#fff",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    padding: 0,
  },
  iconSvg: {
    width: 18,
    height: 18,
    display: "block",
  },
  main: {
    display: "grid",
    gridTemplateColumns: "1fr 248px",
    gap: 10,
    minHeight: 0,
    overflow: "hidden",
  },
  canvasWrap: {
    minWidth: 0,
    minHeight: 0,
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: 10,
  },
  statusBar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    background: "#121937",
    border: "1px solid #26305b",
    borderRadius: 12,
    padding: "10px 12px",
    flexWrap: "wrap",
  },
  board: {
    position: "relative",
    minWidth: 0,
    minHeight: 0,
    width: "100%",
    height: "100%",
    border: "1px solid #26305b",
    borderRadius: 14,
    overflow: "hidden",
    background: "#0f1630",
  },
  svg: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
  },
  sidebar: {
    display: "grid",
    gap: 8,
    alignContent: "start",
    minHeight: 0,
    overflowY: "auto",
    paddingRight: 2,
  },
  card: {
    background: "#121937",
    border: "1px solid #26305b",
    borderRadius: 12,
    padding: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 8,
  },
  compactField: {
    display: "grid",
    gap: 4,
    marginBottom: 7,
  },
  label: {
    fontSize: 11,
    color: "#b9c7ef",
  },
  inputCompact: {
    background: "#0c1330",
    color: "#fff",
    border: "1px solid #2a376f",
    borderRadius: 9,
    padding: "8px 9px",
    width: "100%",
    boxSizing: "border-box",
    fontSize: 13,
    height: 34,
  },
  hintCompact: {
    color: "#b9c7ef",
    fontSize: 11,
    lineHeight: 1.4,
  },
  rowLabel: {
    fontSize: 11,
    color: "#b9c7ef",
    marginBottom: 6,
    marginTop: 2,
  },
  styleRow: {
    display: "grid",
    gridTemplateColumns: "34px 34px 1fr 1fr",
    gap: 6,
    marginBottom: 8,
    alignItems: "center",
  },
  colorSwatchLabel: {
    position: "relative",
    display: "block",
    width: 34,
    height: 34,
    cursor: "pointer",
  },
  hiddenColorInput: {
    position: "absolute",
    inset: 0,
    opacity: 0,
    cursor: "pointer",
  },
  colorSwatch: {
    display: "block",
    width: 34,
    height: 34,
    borderRadius: 9,
    border: "1px solid #33407a",
    boxSizing: "border-box",
  },
  colorSwatchGhost: {
    display: "block",
    width: 34,
    height: 34,
  },
  lineStyleBtn: {
    height: 34,
    borderRadius: 9,
    border: "1px solid #33407a",
    background: "#0c1330",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    padding: 0,
  },
  lineStyleBtnActive: {
    height: 34,
    borderRadius: 9,
    border: "1px solid #7aa0ff",
    background: "#18244f",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    padding: 0,
  },
  solidPreview: {
    display: "block",
    width: 26,
    height: 2,
    background: "#dce7ff",
    borderRadius: 999,
  },
  dashedPreview: {
    display: "block",
    width: 26,
    height: 2,
    background: "repeating-linear-gradient(to right, #dce7ff 0 6px, transparent 6px 10px)",
    borderRadius: 999,
  },
  estimateRow: {
    display: "grid",
    gap: 3,
    background: "#0c1330",
    border: "1px solid #26305b",
    borderRadius: 10,
    padding: 8,
    fontSize: 12,
  },
  deleteBtn: {
    background: "#4a1d24",
    color: "#fff",
    border: "1px solid #8a3f4d",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
    width: "100%",
    marginTop: 4,
  },
  clearBtn: {
    background: "#4a1d24",
    color: "#fff",
    border: "1px solid #8a3f4d",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
  },
  saveBadge: {
    position: "fixed",
    right: 16,
    bottom: 16,
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "rgba(12,19,48,.96)",
    border: "1px solid #2a376f",
    borderRadius: 999,
    padding: "8px 12px",
    zIndex: 100,
    boxShadow: "0 8px 24px rgba(0,0,0,.3)",
    cursor: "pointer",
    color: "#dce7ff",
  },
  saveDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#00e7a7",
    transition: "all .35s ease",
    flex: "0 0 auto",
  },
  saveText: {
    fontSize: 12,
    fontWeight: 600,
  },
  saveTime: {
    fontSize: 11,
    opacity: 0.75,
  },
  zoomControls: {
    position: "absolute",
    right: 14,
    top: 14,
    display: "flex",
    gap: 8,
    zIndex: 20,
  },
  zoomBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    border: "1px solid #33407a",
    background: "rgba(18,25,55,.95)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 22,
    lineHeight: 1,
  },
  zoomResetBtn: {
    height: 36,
    borderRadius: 10,
    border: "1px solid #33407a",
    background: "rgba(18,25,55,.95)",
    color: "#fff",
    cursor: "pointer",
    padding: "0 12px",
    fontSize: 13,
  },
  minimapWrap: {
    position: "absolute",
    right: 14,
    bottom: 14,
    width: 220,
    height: 150,
    borderRadius: 12,
    overflow: "hidden",
    border: "1px solid #33407a",
    background: "rgba(18,25,55,.96)",
    zIndex: 20,
    boxShadow: "0 8px 24px rgba(0,0,0,.28)",
  },
  minimapSvg: {
    width: "100%",
    height: "100%",
    display: "block",
    cursor: "pointer",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(5,8,18,.68)",
    display: "grid",
    placeItems: "center",
    zIndex: 200,
    padding: 20,
  },
  modalCard: {
    width: "min(420px, 100%)",
    background: "#121937",
    border: "1px solid #33407a",
    borderRadius: 14,
    padding: 14,
    boxShadow: "0 16px 40px rgba(0,0,0,.35)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 700,
  },
  modalText: {
    fontSize: 14,
    color: "#dce7ff",
    lineHeight: 1.5,
  },
  modalList: {
    display: "grid",
    gap: 8,
    fontSize: 14,
    color: "#dce7ff",
    lineHeight: 1.5,
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 14,
  },
  modalBtn: {
    background: "#1a234a",
    color: "#fff",
    border: "1px solid #33407a",
    borderRadius: 10,
    padding: "9px 12px",
    cursor: "pointer",
  },
  modalBtnDanger: {
    background: "#4a1d24",
    color: "#fff",
    border: "1px solid #8a3f4d",
    borderRadius: 10,
    padding: "9px 12px",
    cursor: "pointer",
  },
  layerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#dce7ff",
  },
  layerRowEditable: {
    display: "grid",
    gridTemplateColumns: "16px 1fr 30px",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#dce7ff",
  },
  layerNameInput: {
    background: "#0c1330",
    color: "#fff",
    border: "1px solid #2a376f",
    borderRadius: 8,
    padding: "6px 8px",
    width: "100%",
    boxSizing: "border-box",
    fontSize: 12,
    height: 30,
  },
  layerDeleteBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid #8a3f4d",
    background: "#4a1d24",
    color: "#fff",
    cursor: "pointer",
    padding: 0,
    lineHeight: 1,
  },
};
