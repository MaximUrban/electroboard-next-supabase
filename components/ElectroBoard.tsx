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

type StrokeStyle = "solid" | "dashed";

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

const defaultStyle: ShapeStyle = {
  strokeColor: "#7fa7ff",
  fillColor: "#4b70ff",
  strokeWidth: 2,
  strokeStyle: "solid",
  opacity: 0.18,
  rotation: 0,
};

export default function ElectroBoard() {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [projectName, setProjectName] = useState("Новый проект");
  const [tool, setTool] = useState<Tool>("select");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftLine, setDraftLine] = useState<LineShape | null>(null);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [calibrationPoints, setCalibrationPoints] = useState<CalibrationPoint[]>([]);
  const [metersPerPixel, setMetersPerPixel] = useState<number>(0);
  const [calibrationDistanceMeters, setCalibrationDistanceMeters] = useState("1");
  const [status, setStatus] = useState("Готово");
  const [showStyleModal, setShowStyleModal] = useState(false);
  const [canvasSize] = useState({ width: 1400, height: 900 });

  const selectedShape = useMemo(
    () => shapes.find((s) => s.id === selectedId) || null,
    [shapes, selectedId]
  );

  const estimate = useMemo(
    () => buildEstimate(shapes, metersPerPixel),
    [shapes, metersPerPixel]
  );

  function getSvgPoint(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvasSize.width,
      y: ((clientY - rect.top) / rect.height) * canvasSize.height,
    };
  }

  function setShapePatch(id: string, patch: Partial<Shape>) {
    setShapes((prev) => applyAttachments(prev.map((s) => (s.id === id ? ({ ...s, ...patch } as Shape) : s))));
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
        }
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
            initialShape: cloneShape(selectedShape),
          });
          return;
        }
      }

      const hit = [...shapes].reverse().find((shape) => isPointOnShape(point.x, point.y, shape));
      if (hit) {
        setSelectedId(hit.id);
        setShowStyleModal(false);
        setInteraction({
          mode: "move",
          shapeId: hit.id,
          startPointer: point,
          initialShape: cloneShape(hit),
        });
        return;
      }

      setSelectedId(null);
      setShowStyleModal(false);
      setInteraction(null);
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
      setShapes((prev) => [...prev, shape]);
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
      setShapes((prev) => [...prev, shape]);
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
      setShapes((prev) => [...prev, shape]);
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
      setShapes((prev) => [...prev, shape]);
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
    const point = getSvgPoint(e.clientX, e.clientY);

    if (draftLine) {
      setDraftLine((prev) => (prev ? { ...prev, x2: point.x, y2: point.y } : null));
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
      setShapes((prev) => [...prev, draftLine!]);
      setDraftLine(null);
      setTool("select");
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

        return applyAttachments(updated);
      });
    } else {
      setShapes((prev) => applyAttachments(prev));
    }

    setInteraction(null);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setShapes((prev) => prev.filter((s) => s.id !== selectedId));
    setSelectedId(null);
    setShowStyleModal(false);
  }

  function clearAll() {
    setShapes([]);
    setSelectedId(null);
    setDraftLine(null);
    setCalibrationPoints([]);
    setInteraction(null);
    setShowStyleModal(false);
    setStatus("Холст очищен");
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={styles.leftBlock}>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            style={styles.projectInput}
          />
          <button style={tool === "select" ? styles.btnActive : styles.btn} onClick={() => setTool("select")}>Выбор</button>
          <button style={tool === "rectangle" ? styles.btnActive : styles.btn} onClick={() => setTool("rectangle")}>Прямоугольник</button>
          <button style={tool === "circle" ? styles.btnActive : styles.btn} onClick={() => setTool("circle")}>Окружность</button>
          <button style={tool === "line" ? styles.btnActive : styles.btn} onClick={() => setTool("line")}>Линия</button>
          <button style={tool === "cable" ? styles.btnActive : styles.btn} onClick={() => setTool("cable")}>Кабель</button>
          <button style={tool === "socket" ? styles.btnActive : styles.btn} onClick={() => setTool("socket")}>Розетка</button>
          <button style={tool === "switch" ? styles.btnActive : styles.btn} onClick={() => setTool("switch")}>Выключатель</button>
          <button style={tool === "calibrate" ? styles.btnActive : styles.btn} onClick={() => setTool("calibrate")}>Масштаб</button>
        </div>

        <div style={styles.leftBlock}>
          <button style={selectedShape ? styles.btn : styles.btnDisabled} disabled={!selectedShape} onClick={() => setShowStyleModal((v) => !v)}>Стиль</button>
          <button style={styles.btnDanger} onClick={deleteSelected}>Удалить</button>
          <button style={styles.btnDanger} onClick={clearAll}>Очистить</button>
        </div>
      </div>

      <div style={styles.main}>
        <div style={styles.canvasWrap}>
          <div style={styles.statusBar}>
            <span>{status}</span>
            <span>Масштаб: {metersPerPixel > 0 ? `${metersPerPixel.toFixed(5)} м / px` : "не задан"}</span>
          </div>

          <div style={styles.board}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
              style={styles.svg}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
            >
              <defs>
                <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
                  <path d="M 25 0 L 0 0 0 25" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect x="0" y="0" width={canvasSize.width} height={canvasSize.height} fill="url(#grid)" />

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
                  <text x={p.x + 8} y={p.y - 8} fill="#fff" fontSize="14">T{i + 1}</text>
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

            {showStyleModal && selectedShape ? (
              <div style={styles.styleModal}>
                <div style={styles.modalTitle}>Стиль объекта</div>

                <div style={styles.field}>
                  <label style={styles.label}>Цвет линии</label>
                  <input
                    type="color"
                    value={safeColor(selectedShape.strokeColor)}
                    onChange={(e) => setShapePatch(selectedShape.id, { strokeColor: e.target.value })}
                    style={styles.colorInput}
                  />
                </div>

                {selectedShape.type !== "line" && selectedShape.type !== "cable" ? (
                  <div style={styles.field}>
                    <label style={styles.label}>Цвет заливки</label>
                    <input
                      type="color"
                      value={safeColor(selectedShape.fillColor)}
                      onChange={(e) => setShapePatch(selectedShape.id, { fillColor: e.target.value })}
                      style={styles.colorInput}
                    />
                  </div>
                ) : null}

                <div style={styles.field}>
                  <label style={styles.label}>Толщина линии: {selectedShape.strokeWidth}</label>
                  <input
                    type="range"
                    min={1}
                    max={12}
                    value={selectedShape.strokeWidth}
                    onChange={(e) => setShapePatch(selectedShape.id, { strokeWidth: Number(e.target.value) })}
                  />
                </div>

                <div style={styles.field}>
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

                <div style={styles.field}>
                  <label style={styles.label}>Тип линии</label>
                  <select
                    value={selectedShape.strokeStyle}
                    onChange={(e) =>
                      setShapePatch(selectedShape.id, { strokeStyle: e.target.value as StrokeStyle })
                    }
                    style={styles.input}
                  >
                    <option value="solid">Сплошная</option>
                    <option value="dashed">Пунктир</option>
                  </select>
                </div>

                {selectedShape.type !== "circle" &&
                selectedShape.type !== "line" &&
                selectedShape.type !== "cable" ? (
                  <div style={styles.field}>
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

                <button style={styles.btn} onClick={() => setShowStyleModal(false)}>Закрыть</button>
              </div>
            ) : null}
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
            <div style={styles.hint}>Выберите инструмент <b>Масштаб</b>, затем кликните по двум точкам.</div>
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
                  />
                </div>

                {(selectedShape.type === "line" || selectedShape.type === "cable") ? (
                  <>
                    <div style={styles.field}>
                      <label style={styles.label}>Тип кабеля</label>
                      <input
                        value={selectedShape.cableType || ""}
                        onChange={(e) => setShapePatch(selectedShape.id, { cableType: e.target.value })}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.hint}>
                      Длина: {lineLengthMeters(selectedShape, metersPerPixel).toFixed(2)} м
                    </div>
                  </>
                ) : null}
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
        <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} rx="6" />
        <text x={shape.x + 6} y={shape.y - 10} fill="#f2f6ff" fontSize="14">{shape.label}</text>
      </g>
    );
  }

  if (shape.type === "circle") {
    return (
      <g>
        <circle cx={shape.x} cy={shape.y} r={shape.radius} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />
        <text x={shape.x + shape.radius + 6} y={shape.y - shape.radius - 10} fill="#f2f6ff" fontSize="14">{shape.label}</text>
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
        <text x={shape.x + 28} y={shape.y + 4} fill="#f2f6ff" fontSize="14">{shape.label} {shape.groupName || ""}</text>
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
        <line x1={shape.x - 10} y1={shape.y - 12} x2={shape.x + 10} y2={shape.y + 12} stroke={stroke} strokeWidth={Math.max(2, sw)} strokeLinecap="round" />
        <text x={shape.x + 28} y={shape.y + 4} fill="#f2f6ff" fontSize="14">{shape.label} {shape.groupName || ""}</text>
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
        {anchors.map((a) => <circle key={a.id} cx={a.x} cy={a.y} r="4" fill="#9ec1ff" stroke="#fff" strokeWidth="1.5" />)}
        <circle cx={shape.x + shape.radius} cy={shape.y} r="8" fill="#fff" stroke="#3d63ff" strokeWidth="3" />
      </g>
    );
  }

  if (shape.type === "rectangle" || shape.type === "socket" || shape.type === "switch") {
    const box = getSelectionBox(shape);
    const rotateHandle = { x: box.cx, y: box.y - 28 };
    return (
      <g>
        {anchors.map((a) => <circle key={a.id} cx={a.x} cy={a.y} r="4" fill="#9ec1ff" stroke="#fff" strokeWidth="1.5" />)}
        <circle cx={box.x + box.width} cy={box.y + box.height} r="8" fill="#fff" stroke="#3d63ff" strokeWidth="3" />
        <line x1={box.cx} y1={box.y} x2={rotateHandle.x} y2={rotateHandle.y} stroke="#79a6ff" strokeWidth="2" />
        <circle cx={rotateHandle.x} cy={rotateHandle.y} r="8" fill="#fff" stroke="#3d63ff" strokeWidth="3" />
      </g>
    );
  }

  return null;
}

function transformShape(shape: Shape, interaction: InteractionState, point: { x: number; y: number }): Shape {
  const dx = point.x - interaction.startPointer.x;
  const dy = point.y - interaction.startPointer.y;
  const initial = interaction.initialShape;

  if (interaction.mode === "move") {
    if (shape.type === "line" || shape.type === "cable") {
      const s = initial as LineShape;
      return { ...shape, x: s.x + dx, y: s.y + dy, x2: s.x2 + dx, y2: s.y2 + dy };
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
    return { ...shape, x: point.x, y: point.y, startAttachment: undefined };
  }

  if (interaction.mode === "line-end" && (shape.type === "line" || shape.type === "cable")) {
    return { ...shape, x2: point.x, y2: point.y, endAttachment: undefined };
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
    const box = getSelectionBox(shape);
    const rotateHandle = { x: box.cx, y: box.y - 28 };
    const resizeHandle = { x: box.x + box.width, y: box.y + box.height };
    if (distance(px, py, rotateHandle.x, rotateHandle.y) <= 12) return "rotate";
    if (distance(px, py, resizeHandle.x, resizeHandle.y) <= 12) return "resize-se";
  }

  return null;
}

function getSelectionBox(shape: RectangleShape | SocketShape | SwitchShape) {
  if (shape.type === "rectangle") {
    return {
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      cx: shape.x + shape.width / 2,
      cy: shape.y + shape.height / 2,
    };
  }

  return {
    x: shape.x - shape.width / 2,
    y: shape.y - shape.height / 2,
    width: shape.width,
    height: shape.height,
    cx: shape.x,
    cy: shape.y,
  };
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
    return [
      { id: "center", x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 },
      { id: "top", x: shape.x + shape.width / 2, y: shape.y },
      { id: "right", x: shape.x + shape.width, y: shape.y + shape.height / 2 },
      { id: "bottom", x: shape.x + shape.width / 2, y: shape.y + shape.height },
      { id: "left", x: shape.x, y: shape.y + shape.height / 2 },
    ];
  }

  if (shape.type === "socket" || shape.type === "switch") {
    return [
      { id: "center", x: shape.x, y: shape.y },
      { id: "top", x: shape.x, y: shape.y - shape.height / 2 },
      { id: "right", x: shape.x + shape.width / 2, y: shape.y },
      { id: "bottom", x: shape.x, y: shape.y + shape.height / 2 },
      { id: "left", x: shape.x - shape.width / 2, y: shape.y },
    ];
  }

  return [];
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

function getAnchorPosition(shape: Shape, anchorId: string) {
  const anchor = getShapeAnchors(shape).find((a) => a.id === anchorId);
  return anchor ? { x: anchor.x, y: anchor.y } : null;
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

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function angleDeg(cx: number, cy: number, px: number, py: number) {
  return (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
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

function cloneShape<T extends Shape>(shape: T): T {
  return JSON.parse(JSON.stringify(shape));
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
  btnDisabled: {
    background: "#151b33",
    color: "#68749b",
    border: "1px solid #2a3153",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "not-allowed",
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
  styleModal: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 280,
    background: "#121937",
    border: "1px solid #33407a",
    borderRadius: 14,
    padding: 14,
    zIndex: 30,
    boxShadow: "0 10px 30px rgba(0,0,0,.35)",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 10,
  },
  colorInput: {
    width: "100%",
    height: 42,
    background: "#0c1330",
    border: "1px solid #2a376f",
    borderRadius: 10,
    padding: 4,
  },
};
