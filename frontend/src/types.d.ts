interface Token {
  id: number;
  code: string;
  description: string;
  namespace: string;
  creation_timestamp: string;
  permission_read: boolean;
  permission_write: boolean;
  permission_share_read: boolean;
  permission_share_write: boolean;
  permission_share_share: boolean;
  parent: number | null;
}

export enum EditorMode {
  DEFAULT,
  IMPORT,
  EDIT,
}

export enum ImportFormat {
  CSV = "csv",
  N3 = "n3",
  JSONLD = "jsonld",
  NTRIPLES = "nt",
}

export enum ImportCSVDirection {
  ROW = "Row",
  COLUMN = "Column",
  CELL_LABELED = "CellLabeled",
  CELL_UNLABELED = "CellUnlabeled",
}

export enum CSVParseDirection {
  Row = 1,
  Column = 2,
  CellUnlabeled = 3,
  CellLabeled = 4,
}

export interface CSVParserParameters {
  direction: CSVParseDirection;
  delimiter: string;
}

export type ParserParameters =
  | CSVParserParameters
  | NTParserParameters
  | N3ParserParameters
  | JSONLDParserParameters;

export interface NTParserParameters {
  dummy: string;
}

export interface N3ParserParameters {
  dummy: string;
}

export interface JSONLDParserParameters {
  dummy: string;
}

export interface ParseError {
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning";
}

// export interface LegendProps {
//   graphData: GraphData;
// }

export interface UIControlsProps {
  onExportPDF: () => void;
  onExportPNG: () => void;
  showLabels: boolean;
  onToggleLabels: (show: boolean) => void;
  onStopLayout: () => void;
  onApplyLayout: (algorithm: LayoutAlgorithm, options?: LayoutOptions) => void;
  layoutState: LayoutState;
}

// export interface ContextMenuProps {
//   node: GraphNode | null;
//   position: { x: number; y: number } | null;
//   onIsolate: (node: GraphNode) => void;
//   onCopyLabel: (node: GraphNode) => void;
//   onClose: () => void;
// }

export interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
}

export interface MinimizeControlsProps {
  onMinimizeAll: () => void;
  onMaximizeAll: () => void;
}

export interface FloatingCardProps {
  title: string;
  isMinimized: boolean;
  onToggleMinimize: () => void;
  position?:
    | "top-left"
    | "top-right"
    | "bottom-right-upper"
    | "bottom-right-lower"
    | "top-center"
    | "top-right-secondary";
  width?: string;
  height?: string;
  children?: any;
  className?: string;
}

// Layout Types
export type LayoutAlgorithm = "force-directed" | "hierarchical" | "circular";

export interface LayoutOptions {
  iterations?: number;
  springLength?: number;
  springStrength?: number;
  repulsionStrength?: number;
  damping?: number;
  animationDuration?: number;
  centerForce?: number;
}

export interface LayoutState {
  algorithm: LayoutAlgorithm;
  isAnimating: boolean;
  progress: number;
  startTime?: number;
  duration?: number;
}
