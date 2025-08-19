interface Token {
    id: number
    code: string
    description: string
    namespace: string
    creation_timestamp: string
    permission_read: boolean
    permission_write: boolean
    permission_share_read: boolean
    permission_share_write: boolean
    permission_share_share: boolean
    parent: number | null
}

enum EditorMode {
    DEFAULT,
    IMPORT,
    EDIT,
}

enum ImportFormat {
    CSV = 'csv',
    N3 = 'n3',
    JSONLD = 'jsonld',
    NTRIPLES = 'nt',
}

enum ImportCSVDirection {
    ROW = 'Row',
    COLUMN = 'Column',
    CELL_LABELED = 'CellLabeled',
    CELL_UNLABELED = 'CellUnlabeled',
}

type ParserParameters = CSVParserParameters | NTParserParameters | N3ParserParameters | JSONLDParserParameters

interface CSVParserParameters {
    direction: ImportCSVDirection
    delimiter: string
}

interface NTParserParameters {
    dummy: string
}

interface N3ParserParameters {
    dummy: string
}

interface JSONLDParserParameters {
    dummy: string
}

export interface ParseError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

// Component Prop Interfaces
export interface MettaEditorProps {
  initialText: string;
  onTextChange: (text: string) => void;
  onFileUpload: (file: File) => void;
  parseErrors: ParseError[];
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
  showLabels: boolean;
  onToggleLabels: (show: boolean) => void;
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
    | 'top-left'
    | 'top-right'
    | 'bottom-right-upper'
    | 'bottom-right-lower'
    | 'top-center'
    | 'top-right-secondary';
  width?: string;
  height?: string;
  children?: any;
  className?: string;
}

// Layout Types
export type LayoutAlgorithm = 'force-directed' | 'hierarchical' | 'circular';

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

export {
    type Token,
    EditorMode,
    ImportFormat,
    ImportCSVDirection,
    type ParserParameters,
    type CSVParserParameters,
    type NTParserParameters,
    type N3ParserParameters,
    type JSONLDParserParameters,
}