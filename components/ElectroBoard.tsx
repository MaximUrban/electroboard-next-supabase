"use client";

import React, { useMemo, useRef, useState } from "react";

type Tool =
  | "select"
  | "rectangle"
  | "circle"
  | "line"
  | "cable"
  | "socket"
  | "switch"
  | "calibrate";

type BaseShape = {
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

type LineShape = BaseShape & {
  type: "line" | "cable";
  x: number;
  y: number;
  x2: number;
  y2: number;
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
  | RectangleShape
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || "plans";

export default function ElectroBoard() {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [projectId] = useState<string>(() => crypto.randomUUID());
  const [projectName, setProjectName] = useState("Новый проект");
  const [tool, setTool] = useState<Tool>("select");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftLine, setDraftLine] = useState<LineShape | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [calibrationPoints, setCalibrationPoints] = useState<CalibrationPoint[]>([]);
  const [metersPerPixel, setMetersPerPixel] = useState<number>(0);
  const [calibrationDistanceMeters, setCalibrationDistanceMeters] = useState<string>("1");
  const [planUrl, setPlanUrl] = useState<string>("");
  const [planPath, setPlanPath] = useState<string>("");
  const [planMime, setPlanMime] = useState<string>("");
  const [status, setStatus] = useState<string>("Готово");
  const [canvasSize] = useState({ width: 1400, height: 900 });

  const selectedShape = useMemo(
    () => shapes.find((s) => s.id === selectedId) || null,
    [shapes, selectedId]
  );

  const estimate = useMemo(() => buildEstimate(shapes, metersPerPixel), [shapes, metersPerPixel]);

  function setShapePatch(id: string, patch: Partial<Shape>) {
    setShapes((prev) => prev.map((s) => (s.id === id ? ({ ...s, ...patch } as Shape) : s)));
  }

  function getSvgPoint(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };

    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * canvasSize.width;
    const y = ((clientY - rect.top) / rect.height) * canvasSize.height;

    return { x, y };
  }

  function handleCanvasMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    const point = getSvgPoint(e.clientX, e.clientY);

    if (tool === "calibrate") {
      const next = [...calibrationPoints, point].slice(-2);
      setCalibrationPoints(next);

      if (next.length === 2) {
        const px = distance(next[0].x, next[0].y, next[1].x, next[1].y);
        const meters = Number(calibrationDistanceMeters);

        if (px > 0 && meters > 0) {
          setMetersPerPixel(meters / px);
          setStatus(`Масштаб задан: ${meters.toFixed(2)} м на ${px.toFixed(0)} px`);
        } else {
          setStatus("Не удалось задать масштаб");
        }
      }
      return;
    }

    if (tool === "select") {
      const hit = [...shapes].reverse().find((shape) => isPointOnShape(point.x, point.y, shape));

      if (hit) {
        setSelectedId(hit.id);

        if (hit.type !== "line" && hit.type !== "cable") {
          setDragOffset({ dx: point.x - hit.x, dy: point.y - hit.y });
        } else {
          setDragOffset({ dx: point.x - hit.x, dy: point.y - hit.y });
        }
      } else {
        setSelectedId(null);
        setDragOffset(null);
      }
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
      };
      setShapes((prev) => [...prev, shape]);
      setSelectedId(shape.id);
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
      };
      setShapes((prev) => [...prev, shape]);
      setSelectedId(shape.id);
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
      };
      setShapes((prev) => [...prev, shape]);
      setSelectedId(shape.id);
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
      };
      setShapes((prev) => [...prev, shape]);
      setSelectedId(shape.id);
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
        groupName: "",
        cableType: tool === "cable" ? "ВВГнг 3x2.5" : "",
      };
      setDraftLine(shape);
      setSelectedId(shape.id);
    }
  }

  function handleCanvasMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const point = getSvgPoint(e.clientX, e.clientY);

    if (draftLine) {
      setDraftLine((prev) => (prev ? { ...prev, x2: point.x, y2: point.y } : null));
      return;
    }

    if (tool === "select" && selectedShape && dragOffset) {
      setShapes((prev) =>
        prev.map((shape) => {
          if (shape.id !== selectedShape.id) return shape;

          if (shape.type === "line" || shape.type === "cable") {
            const dx = point.x - dragOffset.dx - shape.x;
            const dy = point.y - dragOffset.dy - shape.y;
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
              x: point.x - dragOffset.dx,
              y: point.y - dragOffset.dy,
            };
          }

          return {
            ...shape,
            x: point.x - dragOffset.dx,
            y: point.y - dragOffset.dy,
          };
        })
      );
    }
  }

  function handleCanvasMouseUp() {
    if (draftLine) {
      setShapes((prev) => [...prev, draftLine]);
      setDraftLine(null);
      setTool("select");
    }
    setDragOffset(null);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setShapes((prev) => prev.filter((s) => s.id !== selectedId));
    setSelectedId(null);
  }

  function clearAll() {
    setShapes([]);
    setSelectedId(null);
    setDraftLine(null);
    setCalibrationPoints([]);
    setStatus("Холст очищен");
  }

  async function handlePlanUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("Загрузка плана...");

    const localUrl = URL.createObjectURL(file);
    setPlanUrl(localUrl);
    setPlanMime(file.type);

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setStatus("Файл открыт локально. Supabase ключи не заданы.");
      return;
    }

    try {
      const ext = file.name.split(".").pop() || "bin";
      const objectPath = `plans/${projectId}-${Date.now()}.${ext}`;

      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${objectPath}`,
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "x-upsert": "true",
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        }
      );

      if (!uploadRes.ok) {
        const txt = await uploadRes.text();
        throw new Error(txt || "Ошибка загрузки файла");
      }

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${objectPath}`;
      setPlanPath(objectPath);
      setPlanUrl(publicUrl);
      setStatus("План загружен");
    } catch (error) {
      console.error(error);
      setStatus("Файл загружен локально, но не сохранён в Storage");
    }
  }

  async function saveProject() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setStatus("Не заданы переменные окружения Supabase");
      return;
    }

    setStatus("Сохранение проекта...");

    const payload = {
      id: projectId,
      name: projectName,
      plan_path: planPath || null,
      data: {
        shapes,
        metersPerPixel,
        calibrationPoints,
        estimate,
        planUrl,
        planMime,
      },
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/projects`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Не удалось сохранить проект");
      }

      setStatus("Проект сохранён в Supabase");
    } catch (error) {
      console.error(error);
      setStatus("Ошибка сохранения проекта");
    }
  }

  function exportJson() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            projectId,
            projectName,
            planPath,
            planUrl,
            planMime,
            metersPerPixel,
            calibrationPoints,
            shapes,
            estimate,
          },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(projectName || "project")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        setProjectName(parsed.projectName || "Импортированный проект");
        setPlanPath(parsed.planPath || "");
        setPlanUrl(parsed.planUrl || "");
        setPlanMime(parsed.planMime || "");
        setCalibrationPoints(parsed.calibrationPoints || []);
        setMetersPerPixel(parsed.metersPerPixel || 0);
        setShapes(parsed.shapes || []);
        setSelectedId(null);
        setStatus("JSON импортирован");
      } catch (error) {
        console.error(error);
        setStatus("Не удалось импортировать JSON");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={styles.leftBlock}>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            style={styles.projectInput}
            placeholder="Название проекта"
          />
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
        </div>

        <div style={styles.leftBlock}>
          <label style={styles.fileLabel}>
            План
            <input type="file" accept=".png,.jpg,.jpeg,.pdf" onChange={handlePlanUpload} style={{ display: "none" }} />
          </label>
          <button style={styles.btn} onClick={saveProject}>
            Сохранить
          </button>
          <button style={styles.btn} onClick={exportJson}>
            Экспорт JSON
          </button>
          <label style={styles.fileLabel}>
            Импорт JSON
            <input type="file" accept=".json" onChange={importJson} style={{ display: "none" }} />
          </label>
          <button style={styles.btnDanger} onClick={deleteSelected}>
            Удалить
          </button>
          <button style={styles.btnDanger} onClick={clearAll}>
            Очистить
          </button>
        </div>
      </div>

      <div style={styles.main}>
        <div style={styles.canvasWrap}>
          <div style={styles.statusBar}>
            <span>{status}</span>
            <span>
              Масштаб:{" "}
              {metersPerPixel > 0 ? `${metersPerPixel.toFixed(5)} м / px` : "не задан"}
            </span>
          </div>

          <div style={styles.board}>
            {planUrl ? (
              planMime.includes("pdf") ? (
                <iframe src={planUrl} style={styles.planFrame} />
              ) : (
                <img src={planUrl} alt="План" style={styles.planImage} />
              )
            ) : null}

            <svg
              ref={svgRef}
              viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
              style={styles.svg}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
            >
              <defs>
                <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
                  <path d="M 25 0 L 0 0 0 25" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect x="0" y="0" width={canvasSize.width} height={canvasSize.height} fill="url(#grid)" />

              {shapes.map((shape) => renderShape(shape, selectedId === shape.id, shapes))}

              {draftLine ? renderShape(draftLine, true, shapes) : null}

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
            </svg>
          </div>
        </div>

        <div style={styles.sidebar}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Калибровка</div>
            <div style={styles.field}>
              <label style={styles.label}>Реальное расстояние, м</label>
              <input
                value={calibrationDistanceMeters}
                onChange={(e) => setCalibrationDistanceMeters(e.target.value)}
                style={styles.input}
                type="number"
                step="0.01"
              />
            </div>
            <div style={styles.hint}>
              Выберите инструмент <b>Масштаб</b>, затем кликните по двум точкам на плане.
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>Свойства объекта</div>

            {!selectedShape ? (
              <div style={styles.hint}>Ничего не выбрано</div>
            ) : (
              <>
                <div style={styles.field}>
                  <label style={styles.label}>Тип</label>
                  <input value={selectedShape.type} readOnly style={styles.input} />
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Название</label>
                  <input
                    value={selectedShape.label}
                    onChange={(e) => setShapePatch(selectedShape.id, { label: e.target.value })}
                    style={styles.input}
                  />
                </div>

                <div style={styles.field}>
                  <label style={styles.label}>Группа</label>
                  <input
                    value={selectedShape.groupName || ""}
                    onChange={(e) => setShapePatch(selectedShape.id, { groupName: e.target.value })}
                    style={styles.input}
                    placeholder="A1, P1..."
                  />
                </div>

                {(selectedShape.type === "cable" || selectedShape.type === "line") ? (
                  <div style={styles.field}>
                    <label style={styles.label}>Тип кабеля</label>
                    <input
                      value={selectedShape.cableType || ""}
                      onChange={(e) => setShapePatch(selectedShape.id, { cableType: e.target.value })}
                      style={styles.input}
                      placeholder="ВВГнг 3x2.5"
                    />
                  </div>
                ) : null}

                {selectedShape.type === "rectangle" && (
                  <>
                    <div style={styles.field}>
                      <label style={styles.label}>X</label>
                      <input
                        type="number"
                        value={selectedShape.x}
                        onChange={(e) => setShapePatch(selectedShape.id, { x: Number(e.target.value) })}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.field}>
                      <label style={styles.label}>Y</label>
                      <input
                        type="number"
                        value={selectedShape.y}
                        onChange={(e) => setShapePatch(selectedShape.id, { y: Number(e.target.value) })}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.field}>
                      <label style={styles.label}>Ширина</label>
                      <input
                        type="number"
                        value={selectedShape.width}
                        onChange={(e) => setShapePatch(selectedShape.id, { width: Number(e.target.value) })}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.field}>
                      <label style={styles.label}>Высота</label>
                      <input
                        type="number"
                        value={selectedShape.height}
                        onChange={(e) => setShapePatch(selectedShape.id, { height: Number(e.target.value) })}
                        style={styles.input}
                      />
                    </div>
                  </>
                )}

                {selectedShape.type === "circle" && (
                  <>
                    <div style={styles.field}>
                      <label style={styles.label}>X</label>
                      <input
                        type="number"
                        value={selectedShape.x}
                        onChange={(e) => setShapePatch(selectedShape.id, { x: Number(e.target.value) })}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.field}>
                      <label style={styles.label}>Y</label>
                      <input
                        type="number"
                        value={selectedShape.y}
                        onChange={(e) => setShapePatch(selectedShape.id, { y: Number(e.target.value) })}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.field}>
                      <label style={styles.label}>Радиус</label>
                      <input
                        type="number"
                        value={selectedShape.radius}
                        onChange={(e) => setShapePatch(selectedShape.id, { radius: Number(e.target.value) })}
                        style={styles.input}
                      />
                    </div>
                  </>
                )}

                {(selectedShape.type === "socket" || selectedShape.type === "switch") && (
                  <>
                    <div style={styles.field}>
                      <label style={styles.label}>X</label>
                      <input
                        type="number"
                        value={selectedShape.x}
                        onChange={(e) => setShapePatch(selectedShape.id, { x: Number(e.target.value) })}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.field}>
                      <label style={styles.label}>Y</label>
                      <input
                        type="number"
                        value={selectedShape.y}
                        onChange={(e) => setShapePatch(selectedShape.id, { y: Number(e.target.value) })}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.field}>
                      <label style={styles.label}>Ширина</label>
                      <input
                        type="number"
                        value={selectedShape.width}
                        onChange={(e) => setShapePatch(selectedShape.id, { width: Number(e.target.value) })}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.field}>
                      <label style={styles.label}>Высота</label>
                      <input
                        type="number"
                        value={selectedShape.height}
                        onChange={(e) => setShapePatch(selectedShape.id, { height: Number(e.target.value) })}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.hint}>
                      Привязка к кабелю определяется автоматически по ближайшей кабельной линии той же группы.
                    </div>
                  </>
                )}

                {(selectedShape.type === "line" || selectedShape.type === "cable") && (
                  <>
                    <div style={styles.field}>
                      <label style={styles.label}>X1</label>
                      <input
                        type="number"
                        value={selectedShape.x}
                        onChange={(e) => setShapePatch(selectedShape.id, { x: Number(e.target.value) })}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.field}>
                      <label style={styles.label}>Y1</label>
                      <input
                        type="number"
                        value={selectedShape.y}
                        onChange={(e) => setShapePatch(selectedShape.id, { y: Number(e.target.value) })}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.field}>
                      <label style={styles.label}>X2</label>
                      <input
                        type="number"
                        value={selectedShape.x2}
                        onChange={(e) => setShapePatch(selectedShape.id, { x2: Number(e.target.value) })}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.field}>
                      <label style={styles.label}>Y2</label>
                      <input
                        type="number"
                        value={selectedShape.y2}
                        onChange={(e) => setShapePatch(selectedShape.id, { y2: Number(e.target.value) })}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.hint}>
                      Длина: {lineLengthMeters(selectedShape, metersPerPixel).toFixed(2)} м
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>Смета кабеля</div>
            {estimate.length === 0 ? (
              <div style={styles.hint}>Нет кабельных линий</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
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
        </div>
      </div>
    </div>
  );
}

function renderShape(shape: Shape, selected: boolean, allShapes: Shape[]) {
  const stroke = selected ? "#79a6ff" : "#d9e4ff";
  const strokeWidth = selected ? 3 : 2;
  const labelY = ("radius" in shape ? shape.y - shape.radius - 10 : shape.y - 12);

  if (shape.type === "rectangle") {
    return (
      <g key={shape.id}>
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          fill="rgba(75,112,255,.12)"
          stroke={stroke}
          strokeWidth={strokeWidth}
          rx="6"
        />
        <text x={shape.x + 6} y={labelY} fill="#f2f6ff" fontSize="14">
          {shape.label}
        </text>
      </g>
    );
  }

  if (shape.type === "circle") {
    return (
      <g key={shape.id}>
        <circle
          cx={shape.x}
          cy={shape.y}
          r={shape.radius}
          fill="rgba(75,112,255,.12)"
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <text x={shape.x + shape.radius + 6} y={labelY} fill="#f2f6ff" fontSize="14">
          {shape.label}
        </text>
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
        <text
          x={(shape.x + shape.x2) / 2 + 6}
          y={(shape.y + shape.y2) / 2 - 6}
          fill="#f2f6ff"
          fontSize="14"
        >
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

function getLinkedCableId(shape: SocketShape | SwitchShape, allShapes: Shape[]) {
  const groupName = (shape.groupName || "").trim();
  const cables = allShapes.filter((s): s is LineShape => s.type === "cable");

  const filtered = groupName
    ? cables.filter((c) => (c.groupName || "").trim() === groupName)
    : cables;

  if (filtered.length === 0) return null;

  let bestId: string | null = null;
  let bestDist = Infinity;

  for (const cable of filtered) {
    const d = distancePointToSegment(shape.x, shape.y, cable.x, cable.y, cable.x2, cable.y2);
    if (d < bestDist) {
      bestDist = d;
      bestId = cable.id;
    }
  }

  return bestId;
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9а-яё_-]+/gi, "")
    .replace(/-+/g, "-");
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0b1020",
    color: "#f2f6ff",
    padding: 16,
    boxSizing: "border-box",
    fontFamily: "Inter, Arial, sans-serif",
  },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  leftBlock: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  projectInput: {
    background: "#121937",
    color: "#fff",
    border: "1px solid #27305f",
    borderRadius: 10,
    padding: "10px 12px",
    minWidth: 220,
  },
  btn: {
    background: "#1a234a",
    color: "#fff",
    border: "1px solid #33407a",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
  },
  btnActive: {
    background: "#2948c7",
    color: "#fff",
    border: "1px solid #7aa0ff",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
  },
  btnDanger: {
    background: "#4a1d24",
    color: "#fff",
    border: "1px solid #8a3f4d",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
  },
  fileLabel: {
    background: "#1a234a",
    color: "#fff",
    border: "1px solid #33407a",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
  },
  main: {
    display: "grid",
    gridTemplateColumns: "1fr 340px",
    gap: 16,
  },
  canvasWrap: {
    minWidth: 0,
  },
  statusBar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    background: "#121937",
    border: "1px solid #26305b",
    borderRadius: 12,
    padding: "10px 12px",
    marginBottom: 12,
    flexWrap: "wrap",
  },
  board: {
    position: "relative",
    width: "100%",
    aspectRatio: "1400 / 900",
    border: "1px solid #26305b",
    borderRadius: 14,
    overflow: "hidden",
    background: "#0f1630",
  },
  planImage: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    opacity: 0.65,
    pointerEvents: "none",
  },
  planFrame: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    border: "none",
    opacity: 0.85,
    pointerEvents: "none",
    background: "#fff",
  },
  svg: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    cursor: "crosshair",
  },
  sidebar: {
    display: "grid",
    gap: 16,
    alignContent: "start",
  },
  card: {
    background: "#121937",
    border: "1px solid #26305b",
    borderRadius: 14,
    padding: 14,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 12,
  },
  field: {
    display: "grid",
    gap: 6,
    marginBottom: 10,
  },
  label: {
    fontSize: 13,
    color: "#b9c7ef",
  },
  input: {
    background: "#0c1330",
    color: "#fff",
    border: "1px solid #2a376f",
    borderRadius: 10,
    padding: "10px 12px",
    width: "100%",
    boxSizing: "border-box",
  },
  hint: {
    color: "#b9c7ef",
    fontSize: 13,
    lineHeight: 1.5,
  },
  estimateRow: {
    display: "grid",
    gap: 4,
    background: "#0c1330",
    border: "1px solid #26305b",
    borderRadius: 10,
    padding: 10,
  },
};
