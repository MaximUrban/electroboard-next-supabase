import { Calibration, LineShape, ProjectData, Shape } from "./types";

export function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(bx - ax, by - ay);
}

export function lineLengthMeters(shape: LineShape, calibration: Calibration) {
  const px = distance(shape.x, shape.y, shape.x2, shape.y2);
  if (!calibration.pixelsPerMeter) return 0;
  return px / calibration.pixelsPerMeter;
}

export function pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const cx = x1 + clamped * dx;
  const cy = y1 + clamped * dy;
  return Math.hypot(px - cx, py - cy);
}

export function getLinkedCableId(device: Shape, shapes: Shape[]) {
  if (device.type !== "socket" && device.type !== "switch") return null;
  const cables = shapes.filter((s): s is LineShape => s.type === "cable");
  const sameGroup = cables.filter((c) => c.groupName && c.groupName === device.groupName);
  const pool = sameGroup.length ? sameGroup : cables;
  if (!pool.length) return null;
  let winner: { id: string; dist: number } | null = null;
  for (const cable of pool) {
    const dist = pointToSegmentDistance(device.x, device.y, cable.x, cable.y, cable.x2, cable.y2);
    if (!winner || dist < winner.dist) {
      winner = { id: cable.id, dist };
    }
  }
  return winner?.id ?? null;
}

export function buildEstimate(project: ProjectData) {
  const estimate = new Map<string, { groupName: string; cableType: string; totalMeters: number; lines: number }>();
  for (const shape of project.shapes) {
    if (shape.type !== "cable") continue;
    const meters = lineLengthMeters(shape, project.calibration);
    const groupName = shape.groupName || "Без группы";
    const cableType = shape.cableType || "Без типа";
    const key = `${groupName}__${cableType}`;
    const current = estimate.get(key) || { groupName, cableType, totalMeters: 0, lines: 0 };
    current.totalMeters += meters;
    current.lines += 1;
    estimate.set(key, current);
  }
  return [...estimate.values()].sort((a, b) => a.groupName.localeCompare(b.groupName));
}
