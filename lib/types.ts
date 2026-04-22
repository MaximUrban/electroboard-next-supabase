export type Tool =
  | "select"
  | "rectangle"
  | "circle"
  | "line"
  | "cable"
  | "socket"
  | "switch"
  | "calibrate";

export type ShapeType =
  | "rectangle"
  | "circle"
  | "line"
  | "cable"
  | "socket"
  | "switch";

export interface BaseShape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  label: string;
  groupName: string;
  cableType: string;
}

export interface RectangleShape extends BaseShape {
  type: "rectangle";
  width: number;
  height: number;
}

export interface CircleShape extends BaseShape {
  type: "circle";
  radius: number;
}

export interface LineShape extends BaseShape {
  type: "line" | "cable";
  x2: number;
  y2: number;
}

export interface DeviceShape extends BaseShape {
  type: "socket" | "switch";
  width: number;
  height: number;
}

export type Shape = RectangleShape | CircleShape | LineShape | DeviceShape;

export interface Calibration {
  pixelsPerMeter: number;
  pointA: { x: number; y: number } | null;
  pointB: { x: number; y: number } | null;
  realDistanceMeters: number;
}

export interface ProjectData {
  id?: string;
  name: string;
  planUrl?: string | null;
  planPath?: string | null;
  planMimeType?: string | null;
  shapes: Shape[];
  calibration: Calibration;
  canvasWidth: number;
  canvasHeight: number;
  createdAt?: string;
}
