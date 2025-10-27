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

type ParserParameters =
    | CSVParserParameters
    | NTParserParameters
    | N3ParserParameters
    | JSONLDParserParameters

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
