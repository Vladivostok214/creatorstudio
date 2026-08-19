export interface WordMark {
  text: string;
  startMs: number;
  endMs: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ClickCoords {
  x: number;
  y: number;
}

export interface ElementPosition {
  x: number; // Normalizado 0.0 a 1.0 (Canvas 1920x1080)
  y: number;
}

export interface MockupTransform {
  offsetX?: number; // Offset en píxeles (-500 a 500)
  offsetY?: number; // Offset en píxeles (-300 a 300)
  scale?: number;   // Multiplicador de escala (0.5 a 1.5)
}

export interface StepItem {
  id: string;
  type: 'section' | 'click';
  title?: string;
  transcript: string;
  audio?: string | null;
  screenshot?: string | null;
  duration: number; // in ms
  pageTitle?: string;
  enableZoom?: boolean;
  boundingBox?: BoundingBox;
  clickCoords?: ClickCoords;
  marks: WordMark[];
  subtitlePos?: ElementPosition;
  mockupTransform?: MockupTransform;
}

export interface HeaderStyle {
  text: string;
  fontSize: number; // in px
  color: string;
  hasShadow: boolean;
  shadowColor: string;
  hasBackground: boolean;
  backgroundColor: string;
  backgroundPadding: number; // in px
  borderRadius: number; // in px
}

export interface ProjectSettings {
  resolution: { width: number; height: number };
  fps: number;
  theme: string;
  background: string;
  zoomFactor: number;
  clickAnimationDurationMs: number;
  headerStyle?: HeaderStyle;
  fontFamily?: string;
  subtitleBgColor?: string;
  subtitleTextColor?: string;
  subtitleBorderRadius?: number;
}

export interface ProjectData {
  title: string;
  settings: ProjectSettings;
  steps: StepItem[];
}

