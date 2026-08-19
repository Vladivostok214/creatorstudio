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
}

export interface ProjectData {
  title: string;
  settings: ProjectSettings;
  steps: StepItem[];
}
