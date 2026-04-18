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
    METTA = 'metta',
}

enum ImportSource {
    FILE = 'file',
    URL = 'url',
    TEXT = 'text',
    EXAMPLES = 'examples',
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

interface OpLogImport {
    id: number
    op_log_id: number
    path: string
    uri: string
    operation_id?: string
}

interface OpLogClear {
    id: number
    op_log_id: number
    path: string
    operation_id?: string
}

interface OpLogCopy {
    id: number
    op_log_id: number
    src: string
    dst: string
    operation_id?: string
}

interface OpLogTransform {
    id: number
    op_log_id: number
    input_spaces: unknown
    output_spaces: unknown
    operation_id?: string
}

interface OpLogEntry {
    id: number
    op_type: string
    created_at: string
    rolled_back_at?: string
    token_id?: number
    sealed_at?: string
    import?: OpLogImport
    clear?: OpLogClear
    copy?: OpLogCopy
    transform?: OpLogTransform
}

export {
    type Token,
    EditorMode,
    ImportFormat,
    ImportSource,
    ImportCSVDirection,
    type ParserParameters,
    type CSVParserParameters,
    type NTParserParameters,
    type N3ParserParameters,
    type JSONLDParserParameters,
    type OpLogEntry,
    type OpLogImport,
    type OpLogClear,
    type OpLogCopy,
    type OpLogTransform,
}