"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { bucketName, supabase } from "@/lib/supabase";
import { buildEstimate, distance, getLinkedCableId } from "@/lib/utils";
import type { Calibration, LineShape, ProjectData, Shape, Tool } from "@/lib/types";

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1000;

const defaultCalibration: Calibration = {
  pixelsPerMeter: 0,
  pointA: null,
  pointB: null,
  realDistanceMeters: 1
};

const defaultProject: ProjectData = {
  name: "Новый проект",
  shapes: [],
  calibration: defaultCalibration,
  canvasWidth: CANVAS_WIDTH,
  canvasHeight: CANVAS_HEIGHT,
  planUrl: null,
  planPath: null,
  planMimeType: null
};

export default function ElectroBoard() {
  const [project, setProject] = useState<ProjectData>(defaultProject);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftLine, setDraftLine] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [status, setStatus] = useState("Готово");
  const [projectSlug, setProjectSlug] = useState("");
  const [loadingProject, setLoadingProject] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = project.shapes.find((s) => s.id === selectedId) || null;

  const estimateRows = useMemo(() => buildEstimate(project), [project]);
  const deviceLinks = useMemo(() => {
    return project.shapes
      .filter((s) => s.type === "socket" || s.type === "switch")
      .map((device) => ({
        deviceId: device.id,
        label: device.label || (device.type === "socket" ? "Розетка" : "Выключатель"),
        groupName: device.groupName || "Без группы",
        cableId: getLinkedCableId(device, project.shapes)
      }));
  }, [project.shapes]);

  useEffect(() => {
    const saved = localStorage.getItem("electroboard-local");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ProjectData;
        setProject({ ...defaultProject, ...parsed });
        setProjectSlug(parsed.id || "");
      } catch {
        // ignore broken local cache
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("electroboard-local", JSON.stringify(project));
  }, [project]);

  async function toBackgroundUrl(file: File) {
    if (file.type === "application/pdf") {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      const bytes = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas context недоступен");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
      return canvas.toDataURL("image/png");
    }
    return URL.createObjectURL(file);
  }

  async function handlePlanUpload(file: File) {
    try {
      setStatus("Обрабатываю план...");
      const previewUrl = await toBackgroundUrl(file);

      let planPath: string | null = null;
      let publicUrl: string | null = previewUrl;

      if (supabase) {
        const ext = file.name.split(".").pop() || "bin";
        const filename = `plans/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const uploaded = await supabase.storage.from(bucketName).upload(filename, file, {
          upsert: true,
          contentType: file.type
        });
        if (uploaded.error) throw uploaded.error;
        planPath = uploaded.data.path;
        const pub = supabase.storage.from(bucketName).getPublicUrl(filename);
        publicUrl = file.type === "application/pdf" ? previewUrl : pub.data.publicUrl;
      }

      setProject((prev) => ({
        ...prev,
        planUrl: publicUrl,
        planPath,
        planMimeType: file.type
      }));
      setStatus("План загружен");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ошибка загрузки плана");
    }
  }

  function getPoint(evt: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY
    };
  }

  function updateShape(id: string, patch: Partial<Shape>) {
    setProject((prev) => ({
      ...prev,
      shapes: prev.shapes.map((shape) => (shape.id === id ? ({ ...shape, ...patch } as Shape) : shape))
    }));
  }

  function onCanvasPointerDown(evt: React.PointerEvent<SVGSVGElement>) {
    const p = getPoint(evt);

    if (tool === "rectangle") {
      const shape: Shape = {
        id: uuid(),
        type: "rectangle",
        x: p.x,
        y: p.y,
        width: 140,
        height: 80,
        label: "Прямоугольник",
        groupName: "",
        cableType: ""
      };
      setProject((prev) => ({ ...prev, shapes: [...prev.shapes, shape] }));
      setSelectedId(shape.id);
      return;
    }

    if (tool === "circle") {
      const shape: Shape = {
        id: uuid(),
        type: "circle",
        x: p.x,
        y: p.y,
        radius: 40,
        label: "Окружность",
        groupName: "",
        cableType: ""
      };
      setProject((prev) => ({ ...prev, shapes: [...prev.shapes, shape] }));
      setSelectedId(shape.id);
      return;
    }

    if (tool === "socket" || tool === "switch") {
      const shape: Shape = {
        id: uuid(),
        type: tool,
        x: p.x,
        y: p.y,
        width: 44,
        height: 44,
        label: tool === "socket" ? "Розетка" : "Выключатель",
        groupName: "",
        cableType: ""
      };
      setProject((prev) => ({ ...prev, shapes: [...prev.shapes, shape] }));
      setSelectedId(shape.id);
      return;
    }

    if (tool === "line" || tool === "cable") {
      setDraftLine({ x: p.x, y: p.y, x2: p.x, y2: p.y });
      return;
    }

    if (tool === "calibrate") {
      setProject((prev) => {
        const hasFirst = prev.calibration.pointA && !prev.calibration.pointB;
        if (!prev.calibration.pointA || !hasFirst) {
          return {
            ...prev,
            calibration: { ...prev.calibration, pointA: p, pointB: null }
          };
        }
        return {
          ...prev,
          calibration: { ...prev.calibration, pointB: p }
        };
      });
      return;
    }

    if (tool === "select") {
      const hit = [...project.shapes].reverse().find((shape) => isPointOnShape(p.x, p.y, shape));
      setSelectedId(hit?.id ?? null);
      if (hit) setDragOffset({ dx: p.x - hit.x, dy: p.y - hit.y });
    }
  }

  function onCanvasPointerMove(evt: React.PointerEvent<SVGSVGElement>) {
    const p = getPoint(evt);
    if (draftLine) {
      setDraftLine((prev) => (prev ? { ...prev, x2: p.x, y2: p.y } : null));
      return;
    }
    if (tool === "select" && selectedId && dragOffset) {
      updateShape(selectedId, { x: p.x - dragOffset.dx, y: p.y - dragOffset.dy });
    }
  }

  function onCanvasPointerUp() {
    if (draftLine && (tool === "line" || tool === "cable")) {
      const line: Shape = {
        id: uuid(),
        type: tool,
        x: draftLine.x,
        y: draftLine.y,
        x2: draftLine.x2,
        y2: draftLine.y2,
        label: tool === "cable" ? "Кабель" : "Линия",
        groupName: "",
        cableType: tool === "cable" ? "ВВГнг-LS 3x2.5" : "",
      };
      setProject((prev) => ({ ...prev, shapes: [...prev.shapes, line] }));
      setSelectedId(line.id);
    }
    setDraftLine(null);
    setDragOffset(null);
  }

  function applyCalibration() {
    setProject((prev) => {
      const { pointA, pointB, realDistanceMeters } = prev.calibration;
      if (!pointA || !pointB || !realDistanceMeters) return prev;
      const px = distance(pointA.x, pointA.y, pointB.x, pointB.y);
      const ppm = px / realDistanceMeters;
      return { ...prev, calibration: { ...prev.calibration, pixelsPerMeter: ppm } };
    });
  }

  async function saveProject() {
    if (!supabase) {
      setStatus("Нет подключения к Supabase. Локальное сохранение уже работает в браузере.");
      return;
    }
    try {
      setStatus("Сохраняю проект...");
      const payload = {
        name: project.name,
        data: project,
        plan_path: project.planPath,
        plan_mime_type: project.planMimeType
      };

      if (projectSlug) {
        const updated = await supabase.from("projects").update(payload).eq("id", projectSlug).select("id").single();
        if (updated.error) throw updated.error;
      } else {
        const inserted = await supabase.from("projects").insert(payload).select("id").single();
        if (inserted.error) throw inserted.error;
        setProjectSlug(inserted.data.id);
        setProject((prev) => ({ ...prev, id: inserted.data.id }));
      }
      setStatus("Проект сохранён в Supabase");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ошибка сохранения");
    }
  }

  async function loadProject() {
    if (!supabase || !projectSlug.trim()) {
      setStatus("Укажите ID проекта и проверьте переменные Supabase");
      return;
    }
    try {
      setLoadingProject(true);
      setStatus("Загружаю проект...");
      const response = await supabase.from("projects").select("id,name,data").eq("id", projectSlug.trim()).single();
      if (response.error) throw response.error;
      const data = response.data.data as ProjectData;
      setProject({ ...defaultProject, ...data, id: response.data.id, name: response.data.name || data.name });
      setSelectedId(null);
      setStatus("Проект загружен");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      setLoadingProject(false);
    }
  }

  function resetProject() {
    setProject(defaultProject);
    setSelectedId(null);
    setDraftLine(null);
    setProjectSlug("");
    setStatus("Создан новый пустой проект");
  }

  return (
    <div className="page">
      <div className="topbar">
        <span className="badge">ElectroBoard MVP</span>
        <div className="field" style={{ margin: 0, minWidth: 240 }}>
          <label>Название проекта</label>
          <input value={project.name} onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))} />
        </div>
        <button className="primary" onClick={saveProject}>Сохранить в Supabase</button>
        <div className="field" style={{ margin: 0, minWidth: 220 }}>
          <label>ID проекта</label>
          <input value={projectSlug} onChange={(e) => setProjectSlug(e.target.value)} placeholder="появится после сохранения" />
        </div>
        <button className="secondary" onClick={loadProject} disabled={loadingProject}>Загрузить</button>
        <button className="secondary" onClick={() => localStorage.setItem("electroboard-export", JSON.stringify(project))}>Экспорт в localStorage</button>
        <button className="danger" onClick={resetProject}>Новый проект</button>
        <span className="muted">{status}</span>
      </div>

      <div className="layout">
        <aside className="panel">
          <div className="section">
            <h3>Инструменты</h3>
            <div className="toolbox">
              {[
                ["select", "Выбор"],
                ["rectangle", "Прямоугольник"],
                ["circle", "Окружность"],
                ["line", "Линия"],
                ["cable", "Кабель"],
                ["socket", "Розетка"],
                ["switch", "Выключатель"],
                ["calibrate", "Калибровка"]
              ].map(([value, title]) => (
                <button
                  key={value}
                  className={`toolbtn ${tool === value ? "active" : ""}`}
                  onClick={() => setTool(value as Tool)}
                >
                  {title}
                </button>
              ))}
            </div>
          </div>

          <div className="section">
            <h3>План помещения</h3>
            <div className="field">
              <label>Файл JPG / PNG / PDF</label>
              <input
                ref={inputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePlanUpload(file);
                }}
              />
            </div>
            <p className="muted">
              Для PDF в фоне показывается первая страница. Сам оригинальный файл тоже можно хранить в Supabase Storage.
            </p>
          </div>

          <div className="section">
            <h3>Масштаб</h3>
            <div className="field">
              <label>Реальный размер между 2 точками, м</label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={project.calibration.realDistanceMeters}
                onChange={(e) =>
                  setProject((prev) => ({
                    ...prev,
                    calibration: { ...prev.calibration, realDistanceMeters: Number(e.target.value) || 1 }
                  }))
                }
              />
            </div>
            <button className="secondary" onClick={applyCalibration}>Применить калибровку</button>
            <p className="muted">
              Выберите инструмент “Калибровка”, поставьте две точки на плане, затем нажмите кнопку.
            </p>
            <div className="card">
              <div className="kv"><span>pixelsPerMeter</span><strong>{project.calibration.pixelsPerMeter.toFixed(2)}</strong></div>
              <div className="kv"><span>Точка A</span><strong>{project.calibration.pointA ? "есть" : "нет"}</strong></div>
              <div className="kv"><span>Точка B</span><strong>{project.calibration.pointB ? "есть" : "нет"}</strong></div>
            </div>
          </div>

          <div className="section">
            <h3>Подсказка</h3>
            <p className="muted">
              Длина кабеля считается только для объектов типа “Кабель”. Розетки и выключатели связываются с ближайшим кабелем той же группы.
            </p>
          </div>
        </aside>

        <main className="canvasWrap">
          <div className="canvasInner">
            {project.planUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="План помещения" className="planImage" src={project.planUrl} />
            ) : null}
            <svg
              ref={svgRef}
              className="planCanvas"
              viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onPointerLeave={onCanvasPointerUp}
            >
              {project.calibration.pointA && (
                <circle cx={project.calibration.pointA.x} cy={project.calibration.pointA.y} r="6" fill="#00e7a7" />
              )}
              {project.calibration.pointB && (
                <circle cx={project.calibration.pointB.x} cy={project.calibration.pointB.y} r="6" fill="#00e7a7" />
              )}
              {project.calibration.pointA && project.calibration.pointB && (
                <line
                  x1={project.calibration.pointA.x}
                  y1={project.calibration.pointA.y}
                  x2={project.calibration.pointB.x}
                  y2={project.calibration.pointB.y}
                  stroke="#00e7a7"
                  strokeWidth="3"
                  strokeDasharray="8 6"
                />
              )}

              {project.shapes.map((shape) => renderShape(shape, shape.id === selectedId, project.shapes))}
              {draftLine && (
                <line
                  x1={draftLine.x}
                  y1={draftLine.y}
                  x2={draftLine.x2}
                  y2={draftLine.y2}
                  stroke="#ffd34d"
                  strokeWidth="4"
                  strokeDasharray="10 8"
                />
              )}
            </svg>
          </div>
        </main>

        <aside className="panel right">
          <div className="section">
            <h3>Свойства объекта</h3>
            {!selected ? (
              <p className="empty">Выберите объект на холсте.</p>
            ) : (
              <div>
                <div className="field">
                  <label>Название</label>
                  <input value={selected.label} onChange={(e) => updateShape(selected.id, { label: e.target.value })} />
                </div>
                <div className="row">
                  <div className="field" style={{ flex: 1 }}>
                    <label>X</label>
                    <input type="number" value={Math.round(selected.x)} onChange={(e) => updateShape(selected.id, { x: Number(e.target.value) })} />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Y</label>
                    <input type="number" value={Math.round(selected.y)} onChange={(e) => updateShape(selected.id, { y: Number(e.target.value) })} />
                  </div>
                </div>

                {"width" in selected && (
                  <div className="row">
                    <div className="field" style={{ flex: 1 }}>
                      <label>Ширина</label>
                      <input type="number" value={selected.width} onChange={(e) => updateShape(selected.id, { width: Number(e.target.value) } as Partial<Shape>)} />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label>Высота</label>
                      <input type="number" value={selected.height} onChange={(e) => updateShape(selected.id, { height: Number(e.target.value) } as Partial<Shape>)} />
                    </div>
                  </div>
                )}

                {"radius" in selected && (
                  <div className="field">
                    <label>Радиус</label>
                    <input type="number" value={selected.radius} onChange={(e) => updateShape(selected.id, { radius: Number(e.target.value) } as Partial<Shape>)} />
                  </div>
                )}

                {"x2" in selected && (
                  <div className="row">
                    <div className="field" style={{ flex: 1 }}>
                      <label>X2</label>
                      <input type="number" value={Math.round(selected.x2)} onChange={(e) => updateShape(selected.id, { x2: Number(e.target.value) } as Partial<Shape>)} />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label>Y2</label>
                      <input type="number" value={Math.round(selected.y2)} onChange={(e) => updateShape(selected.id, { y2: Number(e.target.value) } as Partial<Shape>)} />
                    </div>
                  </div>
                )}

                <div className="field">
                  <label>Группа</label>
                  <input value={selected.groupName} onChange={(e) => updateShape(selected.id, { groupName: e.target.value })} placeholder="A1, P1..." />
                </div>
                {(selected.type === "cable" || selected.type === "line") && (
                  <div className="field">
                    <label>Тип кабеля</label>
                    <input value={selected.cableType} onChange={(e) => updateShape(selected.id, { cableType: e.target.value })} placeholder="ВВГнг-LS 3x2.5" />
                  </div>
                )}
                {selected.type === "cable" && (
                  <div className="card small">
                    Длина:{" "}
                    <strong>
                      {(project.calibration.pixelsPerMeter
                        ? distance(selected.x, selected.y, selected.x2, selected.y2) / project.calibration.pixelsPerMeter
                        : 0
                      ).toFixed(2)} м
                    </strong>
                  </div>
                )}
                <button
                  className="danger"
                  onClick={() => {
                    setProject((prev) => ({ ...prev, shapes: prev.shapes.filter((s) => s.id !== selected.id) }));
                    setSelectedId(null);
                  }}
                >
                  Удалить объект
                </button>
              </div>
            )}
          </div>

          <div className="section">
            <h3>Смета по кабелю</h3>
            <div className="list">
              {estimateRows.length ? (
                estimateRows.map((row) => (
                  <div key={`${row.groupName}-${row.cableType}`} className="card">
                    <div><strong>{row.groupName}</strong></div>
                    <div className="muted">{row.cableType}</div>
                    <div className="kv"><span>Линий</span><strong>{row.lines}</strong></div>
                    <div className="kv"><span>Метраж</span><strong>{row.totalMeters.toFixed(2)} м</strong></div>
                  </div>
                ))
              ) : (
                <p className="empty">Пока нет кабельных линий.</p>
              )}
            </div>
          </div>

          <div className="section">
            <h3>Привязка розеток и выключателей</h3>
            <div className="list">
              {deviceLinks.length ? (
                deviceLinks.map((item) => (
                  <div key={item.deviceId} className="card">
                    <div><strong>{item.label}</strong></div>
                    <div className="muted">Группа: {item.groupName}</div>
                    <div className="muted">Кабель: {item.cableId || "не найден"}</div>
                  </div>
                ))
              ) : (
                <p className="empty">Нет устройств для привязки.</p>
              )}
            </div>
          </div>

          <p className="footerNote">
            Масштабирование объектов в MVP сделано через панель свойств справа. Это проще и надёжнее для первого релиза.
          </p>
        </aside>
      </div>
    </div>
  );
}

function renderShape(shape: Shape, selected: boolean, allShapes: Shape[]) {
  const stroke = selected ? "#79a6ff" : "#d9e4ff";
  const strokeWidth = selected ? 3 : 2;
  const labelY = shape.y - 12;

  if (shape.type === "rectangle") {
    return (
      <g key={shape.id}>
        <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} fill="rgba(75,112,255,.12)" stroke={stroke} strokeWidth={strokeWidth} rx="6" />
        <text x={shape.x + 6} y={labelY} fill="#f2f6ff" fontSize="14">{shape.label}</text>
      </g>
    );
  }

  if (shape.type === "circle") {
    return (
      <g key={shape.id}>
        <circle cx={shape.x} cy={shape.y} r={shape.radius} fill="rgba(75,112,255,.12)" stroke={stroke} strokeWidth={strokeWidth} />
        <text x={shape.x + shape.radius + 6} y={labelY} fill="#f2f6ff" fontSize="14">{shape.label}</text>
      </g>
    );
  }

  if (shape.type === "line" || shape.type === "cable") {
    return (
      <g key={shape.id}>
        <line
          x1={shape.x}
          y1={shape.y}
          x2={shape.x2}
          y2={shape.y2}
          stroke={shape.type === "cable" ? "#ffbf47" : stroke}
          strokeWidth={shape.type === "cable" ? 4 : strokeWidth}
          strokeDasharray={shape.type === "cable" ? "0" : "9 7"}
        />
        <text x={(shape.x + shape.x2) / 2 + 6} y={(shape.y + shape.y2) / 2 - 6} fill="#f2f6ff" fontSize="14">
          {shape.label} {shape.groupName ? `(${shape.groupName})` : ""}
        </text>
      </g>
    );
  }

  if (shape.type === "socket") {
  const linkedCableId = getLinkedCableId(shape, allShapes);
  return (
    <g key={shape.id}>
      <rect
        x={shape.x - shape.width / 2}
        y={shape.y - shape.height / 2}
        width={shape.width}
        height={shape.height}
        rx="10"
        fill="rgba(0,231,167,.10)"
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <circle cx={shape.x - 8} cy={shape.y} r="4" fill={stroke} />
      <circle cx={shape.x + 8} cy={shape.y} r="4" fill={stroke} />
      <text x={shape.x + 28} y={shape.y + 4} fill="#f2f6ff" fontSize="14">
        {shape.label} {shape.groupName || ""}
      </text>
      {linkedCableId ? (
        <text x={shape.x + 28} y={shape.y + 20} fill="#92a6d8" fontSize="12">
          кабель: {linkedCableId.slice(0, 8)}
        </text>
      ) : null}
    </g>
  );
}

if (shape.type === "switch") {
  return (
    <g key={shape.id}>
      <rect
        x={shape.x - shape.width / 2}
        y={shape.y - shape.height / 2}
        width={shape.width}
        height={shape.height}
        rx="6"
        fill="rgba(255,115,0,.10)"
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <line
        x1={shape.x - 10}
        y1={shape.y - 12}
        x2={shape.x + 10}
        y2={shape.y + 12}
        stroke={stroke}
        strokeWidth="3"
      />
      <text x={shape.x + 28} y={shape.y + 4} fill="#f2f6ff" fontSize="14">
        {shape.label} {shape.groupName || ""}
      </text>
    </g>
  );
}

return null;

function isPointOnShape(px: number, py: number, shape: Shape) {
  if (shape.type === "rectangle") {
    return px >= shape.x && px <= shape.x + shape.width && py >= shape.y && py <= shape.y + shape.height;
  }
  if (shape.type === "circle") {
    return Math.hypot(px - shape.x, py - shape.y) <= shape.radius;
  }
  if (shape.type === "line" || shape.type === "cable") {
    const line = shape as LineShape;
    const threshold = 12;
    const dx = line.x2 - line.x;
    const dy = line.y2 - line.y;
    const lenSq = dx * dx + dy * dy;
    if (!lenSq) return false;
    const t = ((px - line.x) * dx + (py - line.y) * dy) / lenSq;
    const clamped = Math.max(0, Math.min(1, t));
    const cx = line.x + clamped * dx;
    const cy = line.y + clamped * dy;
    return Math.hypot(px - cx, py - cy) <= threshold;
  }
  return (
    px >= shape.x - shape.width / 2 &&
    px <= shape.x + shape.width / 2 &&
    py >= shape.y - shape.height / 2 &&
    py <= shape.y + shape.height / 2
  );
}
