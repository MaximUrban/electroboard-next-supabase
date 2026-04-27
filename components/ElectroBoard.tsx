"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getProjectById, saveProject } from "@/lib/projects";

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
  type: "rectangle" | "circle" | "line" | "cable" | "socket" | "switch";
  label: string;
  groupName?: string;
  cableType?: string;
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

type Shape =
  | Shape
  | CircleShape
  | LineShape
  | SocketShape
  | SwitchShape;

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

type HistoryState = {
  shapes: Shape[];
  calibrationPoints: CalibrationPoint[];
  metersPerPixel: number;
  projectName: string;
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

  const [projectName, setProjectName] = useState("Project");
  const [tool, setTool] = useState<Tool>("select");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftLine, setDraftLine] = useState<LineShape | null>(null);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [calibrationPoints, setCalibrationPoints] = useState<CalibrationPoint[]>([]);
  const [metersPerPixel, setMetersPerPixel] = useState<number>(0);
  const [calibrationDistanceMeters, setCalibrationDistanceMeters] = useState("1");
  const [status, setStatus] = useState("Готово");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 1 });
  const [panState, setPanState] = useState<PanState | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [canvasSize] = useState({ width: 1400, height: 900 });

  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const selectedShape = useMemo(
    () => shapes.find((s) => s.id === selectedId) || null,
    [shapes, selectedId]
  );

  const estimate = useMemo(
    () => buildEstimate(shapes, metersPerPixel),
    [shapes, metersPerPixel]
  );

  useEffect(() => {
    const saved = getProjectById(projectId);

    if (saved) {
      const nextShapes = saved.data?.shapes || [];
      const nextMPP = saved.data?.metersPerPixel || 0;
      const nextCalibration = saved.data?.calibrationPoints || [];

      setProjectName(saved.name || "Project");
      setShapes(nextShapes);
      setMetersPerPixel(nextMPP);
      setCalibrationPoints(nextCalibration);
      setLastSavedAt(saved.updatedAt || null);

      const initial: HistoryState = {
        shapes: nextShapes,
        metersPerPixel: nextMPP,
        calibrationPoints: nextCalibration,
        projectName: saved.name || "Project",
      };
      setHistory([cloneDeep(initial)]);
      setHistoryIndex(0);
    } else {
      const initial: HistoryState = {
        shapes: [],
        metersPerPixel: 0,
        calibrationPoints: [],
        projectName: "Project",
      };
      setHistory([cloneDeep(initial)]);
      setHistoryIndex(0);
    }

    setCamera({
      x: canvasSize.width / 2,
      y: canvasSize.height / 2,
      zoom: 1,
    });

    setLoaded(true);
  }, [projectId, canvasSize.width, canvasSize.height]);

  useEffect(() => {
    if (!loaded) return;

    const onBeforeUnload = () => {
      persistProjectData(
        {
          shapes,
          metersPerPixel,
          calibrationPoints,
          projectName,
        },
        false
      );
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [loaded, shapes, metersPerPixel, calibrationPoints, projectName, projectId]);

  useEffect(() => {
    if (!loaded) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const isTyping =
        tag === "input" || tag === "textarea" || (e.target as HTMLElement | null)?.isContentEditable;

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
        metersPerPixel: data.metersPerPixel,
        calibrationPoints: data.calibrationPoints,
      },
    });

    setLastSavedAt(now);
    setSaveState("saved");
    setStatus("Сохранено");

    if (animate) {
      window.setTimeout(() => {
        setStatus("Готово");
      }, 700);
    }
  }

  function persistCurrent() {
    persistProjectData({
      shapes,
      metersPerPixel,
      calibrationPoints,
      projectName,
    });
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
    nextCalibrationPoints?: CalibrationPoint[],
    nextMetersPerPixel?: number,
    nextProjectName?: string
  ) {
    const nextState: HistoryState = {
      shapes: cloneDeep(nextShapes ?? shapes),
      calibrationPoints: cloneDeep(nextCalibrationPoints ?? calibrationPoints),
      metersPerPixel: nextMetersPerPixel ?? metersPerPixel,
      projectName: nextProjectName ?? projectName,
    };

    pushHistory(nextState);
    persistProjectData(nextState);
  }

  function applyHistoryState(state: HistoryState) {
    setShapes(cloneDeep(state.shapes));
    setCalibrationPoints(cloneDeep(state.calibrationPoints));
    setMetersPerPixel(state.metersPerPixel);
    setProjectName(state.projectName);
    setSelectedId(null);
    setInteraction(null);
    setDraftLine(null);
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

  function setShapePatch(id: string, patch: Partial<Shape>) {
    setShapes((prev) => {
      const next = applyAttachments(prev.map((s) => (s.id === id ? ({ ...s, ...patch } as Shape) : s)));
      window.setTimeout(() => commitHistory(next), 0);
      return next;
    });
  }

  function nudgeSelected(dx: number, dy: number) {
    if (!selectedId) return;

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
          const nextMeters = meters / px;
          setMetersPerPixel(nextMeters);
          setStatus(`Масштаб задан: ${meters.toFixed(2)} м на ${px.toFixed(0)} px`);
          window.setTimeout(() => commitHistory(shapes, next, nextMeters), 0);
        }
      } else {
        window.setTimeout(() => commitHistory(shapes, next), 0);
      }
      return;
    }

    if (tool === "select") {
      if (selectedShape) {
        const handle = hitTestHandle(point.x, point.y, selectedShape);
        if (handle) {
          setInteraction({
            mode: handle,
            shapeId: selectedShape.id,
            startPointer: point,
            initialShape: cloneDeep(selectedShape),
          });
          return;
        }
      }

      const hit = [...shapes].reverse().find((shape) => isPointOnShape(point.x, point.y, shape));

      if (hit) {
        if (e.altKey) {
          const duplicated = duplicateShapeWithoutAttachments(hit);
          setShapes((prev) => {
            const next = [...prev, duplicated];
            window.setTimeout(() => commitHistory(next), 0);
            return next;
          });
          setSelectedId(duplicated.id);
          setInteraction({
            mode: "move",
            shapeId: duplicated.id,
            startPointer: point,
            initialShape: cloneDeep(duplicated),
          });
          return;
        }

        setSelectedId(hit.id);
        setInteraction({
          mode: "move",
          shapeId: hit.id,
          startPointer: point,
          initialShape: cloneDeep(hit),
        });
        return;
      }

      setSelectedId(null);
      setInteraction(null);
      setPanState({
        startScreen: screenPoint,
        startCamera: camera,
      });
      return;
    }

    if (tool === "") {
      const shape: Shape = {
        id: crypto.randomUUID(),
        type: "",
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
      const shape: LineShape = {
        id: crypto.randomUUID(),
        type: tool,
        x: point.x,
        y: point.y,
        x2: point.x + 1,
        y2: point.y + 1,
        label: tool === "cable" ? "Кабель" : "Линия",
        cableType: tool === "cable" ? "ВВГнг 3x2.5" : "",
        groupName: "",
        ...defaultStyle,
        fillColor: "transparent",
        opacity: 1,
        strokeColor: tool === "cable" ? "#ffbf47" : "#7fa7ff",
        strokeWidth: tool === "cable" ? 4 : 2,
      };
      setDraftLine(shape);
      setSelectedId(shape.id);
    }
  }

  function handleCanvasMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const screenPoint = getScreenPoint(e.clientX, e.clientY);
    const point = screenToWorld(screenPoint.x, screenPoint.y);

    if (panState) {
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
      const snapped = orthogonalSnap({ x: draftLine.x, y: draftLine.y }, point, 2);
      setDraftLine((prev) => (prev ? { ...prev, x2: snapped.x, y2: snapped.y } : null));
      return;
    }

    if (!interaction) return;

    setShapes((prev) => {
      const updated = prev.map((shape) =>
        shape.id === interaction.shapeId ? transformShape(shape, interaction, point) : shape
      );
      return applyAttachments(updated);
    });
  }

  function handleCanvasMouseUp() {
    if (draftLine) {
      setShapes((prev) => {
        const next = [...prev, draftLine];
        window.setTimeout(() => commitHistory(next), 0);
        return next;
      });
      setDraftLine(null);
      setTool("select");
      setPanState(null);
      return;
    }

    if (interaction && (interaction.mode === "line-start" || interaction.mode === "line-end")) {
      setShapes((prev) => {
        const updated = prev.map((shape) => {
          if (shape.id !== interaction.shapeId) return shape;
          if (shape.type !== "line" && shape.type !== "cable") return shape;

          const point =
            interaction.mode === "line-start"
              ? { x: shape.x, y: shape.y }
              : { x: shape.x2, y: shape.y2 };

          const snap = findClosestAnchor(prev, point, 22, shape.id);

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
  }

  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const screen = getScreenPoint(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    zoomAtScreenPoint(screen.x, screen.y, factor);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setShapes((prev) => {
      const next = prev.filter((s) => s.id !== selectedId);
      window.setTimeout(() => commitHistory(next), 0);
      return next;
    });
    setSelectedId(null);
  }

  function clearAllConfirmed() {
    setShapes([]);
    setSelectedId(null);
    setDraftLine(null);
    setCalibrationPoints([]);
    setInteraction(null);
    setPanState(null);
    setShowClearConfirm(false);
    setStatus("Проект очищен");
    window.setTimeout(() => commitHistory([], [], 0), 0);
  }

  const objectTypeOptions = selectedShape
    ? selectedShape.type === "line" || selectedShape.type === "cable"
      ? [
          { value: "line", label: "Линия" },
          { value: "cable", label: "Кабель" },
        ]
      : [
          { value: "", label: "Прямоугольник" },
          { value: "circle", label: "Окружность" },
          { value: "socket", label: "Розетка" },
          { value: "switch", label: "Выключатель" },
        ]
    : [];

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={styles.leftBlock}>
          <Link href="/" style={styles.backLink}>
            ← Ко всем проектам
          </Link>

          <input
            value={projectName}
            onChange={(e) => {
              const value = e.target.value;
              setProjectName(value);
              window.setTimeout(() => commitHistory(shapes, calibrationPoints, metersPerPixel, value), 0);
            }}
            style={styles.projectInput}
          />
        </div>

        <div style={styles.leftBlock}>
          <button style={tool === "select" ? styles.btnActive : styles.btn} onClick={() => setTool("select")}>Выбор</button>
          <button style={tool === "" ? styles.btnActive : styles.btn} onClick={() => setTool("")}>Прямоугольник</button>
          <button style={tool === "circle" ? styles.btnActive : styles.btn} onClick={() => setTool("circle")}>Окружность</button>
          <button style={tool === "line" ? styles.btnActive : styles.btn} onClick={() => setTool("line")}>Линия</button>
          <button style={tool === "cable" ? styles.btnActive : styles.btn} onClick={() => setTool("cable")}>Кабель</button>
          <button style={tool === "socket" ? styles.btnActive : styles.btn} onClick={() => setTool("socket")}>Розетка</button>
          <button style={tool === "switch" ? styles.btnActive : styles.btn} onClick={() => setTool("switch")}>Выключатель</button>
          <button style={tool === "calibrate" ? styles.btnActive : styles.btn} onClick={() => setTool("calibrate")}>Масштаб</button>

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
                cursor: panState ? "grabbing" : "grab",
              }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
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
                    {renderShape(shape, selectedId === shape.id)}
                    {selectedId === shape.id ? renderSelectionOverlay(shape) : null}
                  </React.Fragment>
                ))}

                {draftLine ? renderShape(draftLine, true) : null}

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
                    <span style={{ ...styles.colorSwatch, background: safeColor(selectedShape.strokeColor) }} />
                  </label>

                  {selectedShape.type !== "line" && selectedShape.type !== "cable" ? (
                    <label style={styles.colorSwatchLabel} title="Цвет заливки">
                      <input
                        type="color"
                        value={safeColor(selectedShape.fillColor)}
                        onChange={(e) => setShapePatch(selectedShape.id, { fillColor: e.target.value })}
                        style={styles.hiddenColorInput}
                      />
                      <span style={{ ...styles.colorSwatch, background: safeColor(selectedShape.fillColor) }} />
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

          <div style={styles.card}>
            <div style={styles.cardTitle}>Смета</div>
            {estimate.length === 0 ? (
              <div style={styles.hintCompact}>Нет кабельных линий</div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {estimate.map((row, idx) => (
                  <div key={`${row.groupName}-${row.cableType}-${idx}`} style={styles.estimateRow}>
                    <div><b>{row.groupName || "Без группы"}</b></div>
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

  const viewLeft = (-camera.x) / camera.zoom;
  const viewTop = (-camera.y) / camera.zoom;
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

          if (shape.type === "") {
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

function renderShape(shape: Shape, selected: boolean) {
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
        />
        <text x={shape.x + 6} y={shape.y - 10} fill="#f2f6ff" fontSize="14">
          {shape.label}
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
        />
        <text x={shape.x + shape.radius + 6} y={shape.y - shape.radius - 10} fill="#f2f6ff" fontSize="14">
          {shape.label}
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
        />
        <text x={(shape.x + shape.x2) / 2 + 6} y={(shape.y + shape.y2) / 2 - 6} fill="#f2f6ff" fontSize="14">
          {shape.label} {shape.groupName ? `(${shape.groupName})` : ""}
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
        />
        <circle cx={shape.x - 8} cy={shape.y} r="4" fill={stroke} />
        <circle cx={shape.x + 8} cy={shape.y} r="4" fill={stroke} />
        <text x={shape.x + 28} y={shape.y + 4} fill="#f2f6ff" fontSize="14">
          {shape.label} {shape.groupName || ""}
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
          {shape.label} {shape.groupName || ""}
        </text>
      </g>
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
        <circle cx={shape.x} cy={shape.y} r="8" fill="#fff" stroke="#3d63ff" strokeWidth="3" />
        <circle cx={shape.x2} cy={shape.y2} r="8" fill="#fff" stroke="#3d63ff" strokeWidth="3" />
        <circle cx={midX} cy={midY} r="7" fill="#3d63ff" stroke="#fff" strokeWidth="2" />
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
        <circle cx={shape.x + shape.radius} cy={shape.y} r="8" fill="#fff" stroke="#3d63ff" strokeWidth="3" />
      </g>
    );
  }

  if (shape.type === "rectangle" || shape.type === "socket" || shape.type === "switch") {
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
        <circle cx={geometry.resizeHandle.x} cy={geometry.resizeHandle.y} r="8" fill="#fff" stroke="#3d63ff" strokeWidth="3" />
        <circle cx={geometry.rotateHandle.x} cy={geometry.rotateHandle.y} r="8" fill="#fff" stroke="#3d63ff" strokeWidth="3" />
      </g>
    );
  }

  return null;
}

function convertShapeType(shape: Shape, nextType: Shape["type"]): Shape {
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
    const radius =
      shape.type === "circle"
        ? shape.radius
        : Math.max(18, ("width" in shape ? shape.width : 36) / 2, ("height" in shape ? shape.height : 36) / 2);

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
  const width = shape.type === "circle" ? Math.max(36, shape.radius * 2) : Math.max(24, shape.width);
  const height = shape.type === "circle" ? Math.max(36, shape.radius * 2) : Math.max(24, shape.height);

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

function getShapeCenter(shape: Shape) {
  if (shape.type === "rectangle") {
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

function getSelectionGeometry(shape: RectangleShape | SocketShape | SwitchShape) {
  if (shape.type === "rectangle") {
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;

    const resizeHandle = rotatePoint(shape.x + shape.width, shape.y + shape.height, cx, cy, shape.rotation);
    const topCenter = rotatePoint(shape.x + shape.width / 2, shape.y, cx, cy, shape.rotation);
    const rotateHandle = rotatePoint(topCenter.x, topCenter.y - 28, topCenter.x, topCenter.y, shape.rotation);

    return { center: { x: cx, y: cy }, resizeHandle, rotateHandle };
  }

  const cx = shape.x;
  const cy = shape.y;
  const resizeHandle = rotatePoint(shape.x + shape.width / 2, shape.y + shape.height / 2, cx, cy, shape.rotation);
  const topCenter = rotatePoint(shape.x, shape.y - shape.height / 2, cx, cy, shape.rotation);
  const rotateHandle = rotatePoint(topCenter.x, topCenter.y - 28, topCenter.x, topCenter.y, shape.rotation);

  return { center: { x: cx, y: cy }, resizeHandle, rotateHandle };
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
        best = { shapeId: shape.id, anchorId: anchor.id, x: anchor.x, y: anchor.y };
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

    if (existing) existing.meters += meters;
    else acc.set(key, { groupName, cableType, meters });
  }

  return [...acc.values()].sort((a, b) => a.groupName.localeCompare(b.groupName));
}

function lineLengthMeters(shape: LineShape, metersPerPixel: number) {
  const px = distance(shape.x, shape.y, shape.x2, shape.y2);
  return metersPerPixel > 0 ? px * metersPerPixel : px;
}

function isPointOnShape(px: number, py: number, shape: Shape) {
  if (shape.type === "rectangle") {
    return px >= shape.x && px <= shape.x + shape.width && py >= shape.y && py <= shape.y + shape.height;
  }

  if (shape.type === "circle") {
    return distance(px, py, shape.x, shape.y) <= shape.radius;
  }

  if (shape.type === "line" || shape.type === "cable") {
    return distancePointToSegment(px, py, shape.x, shape.y, shape.x2, shape.y2) <= 8;
  }

  if (shape.type === "socket" || shape.type === "switch") {
    return (
      px >= shape.x - shape.width / 2 &&
      px <= shape.x + shape.width / 2 &&
      py >= shape.y - shape.height / 2 &&
      py <= shape.y + shape.height / 2
    );
  }

  return false;
}

function transformShape(shape: Shape, interaction: InteractionState, point: { x: number; y: number }): Shape {
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
    const s = initial as SocketShape | SwitchShape;
    return { ...shape, x: s.x + dx, y: s.y + dy };
  }

  if (interaction.mode === "line-start" && (shape.type === "line" || shape.type === "cable")) {
    const snapped = orthogonalSnap({ x: shape.x2, y: shape.y2 }, point, 2);
    return { ...shape, x: snapped.x, y: snapped.y, startAttachment: undefined };
  }

  if (interaction.mode === "line-end" && (shape.type === "line" || shape.type === "cable")) {
    const snapped = orthogonalSnap({ x: shape.x, y: shape.y }, point, 2);
    return { ...shape, x2: snapped.x, y2: snapped.y, endAttachment: undefined };
  }

  if (interaction.mode === "resize-circle" && shape.type === "circle") {
    return { ...shape, radius: Math.max(10, distance(shape.x, shape.y, point.x, point.y)) };
  }

  if (interaction.mode === "resize-se") {
    if (shape.type === "rectangle") {
      const s = initial as RectangleShape;
      return { ...shape, width: Math.max(20, s.width + dx), height: Math.max(20, s.height + dy) };
    }
    if (shape.type === "socket" || shape.type === "switch") {
      const s = initial as SocketShape | SwitchShape;
      return { ...shape, width: Math.max(16, s.width + dx), height: Math.max(16, s.height + dy) };
    }
  }

  if (interaction.mode === "rotate") {
    if (shape.type === "rectangle") {
      const s = initial as RectangleShape;
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
  if (shape.type === "line" || shape.type === "cable") {
    const midX = (shape.x + shape.x2) / 2;
    const midY = (shape.y + shape.y2) / 2;
    if (distance(px, py, shape.x, shape.y) <= 12) return "line-start";
    if (distance(px, py, shape.x2, shape.y2) <= 12) return "line-end";
    if (distance(px, py, midX, midY) <= 12) return "move";
    return null;
  }

  if (shape.type === "circle") {
    if (distance(px, py, shape.x + shape.radius, shape.y) <= 12) return "resize-circle";
    return null;
  }

  if (shape.type === "rectangle" || shape.type === "socket" || shape.type === "switch") {
    const geometry = getSelectionGeometry(shape);
    if (distance(px, py, geometry.rotateHandle.x, geometry.rotateHandle.y) <= 12) return "rotate";
    if (distance(px, py, geometry.resizeHandle.x, geometry.resizeHandle.y) <= 12) return "resize-se";
  }

  return null;
}

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function distancePointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
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
    background:
      "repeating-linear-gradient(to right, #dce7ff 0 6px, transparent 6px 10px)",
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
};
