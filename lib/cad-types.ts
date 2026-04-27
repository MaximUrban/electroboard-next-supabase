export type CadLayer = {
  id: string;
  name: string;
  visible: boolean;
  color?: string;
  locked?: boolean;
};

export type CadLinePrimitive = {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layerId: string;
  stroke?: string;
  strokeWidth?: number;
};

export type CadPolylinePrimitive = {
  type: "polyline";
  points: { x: number; y: number }[];
  closed?: boolean;
  layerId: string;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
};

export type CadCirclePrimitive = {
  type: "circle";
  cx: number;
  cy: number;
  r: number;
  layerId: string;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
};

export type CadTextPrimitive = {
  type: "text";
  x: number;
  y: number;
  text: string;
  size?: number;
  rotation?: number;
  layerId: string;
  fill?: string;
};

export type CadPrimitive =
  | CadLinePrimitive
  | CadPolylinePrimitive
  | CadCirclePrimitive
  | CadTextPrimitive;

export type CadAsset = {
  id: string;
  sourceFormat: "dwg" | "dxf" | "pdf" | "jpg" | "png";
  sourceUrl?: string;
  sourceLabel?: string;
  previewUrl?: string;
  layers: CadLayer[];
  primitives: CadPrimitive[];
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};
