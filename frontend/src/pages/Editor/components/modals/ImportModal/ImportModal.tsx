import { Component, createSignal, For, Show } from "solid-js";
import styles from "./ImportModal.module.scss";
import commonStyles from "../../../../../styles/Common.module.scss";
import { VsCloudUpload, VsFile, VsLink, VsSymbolString, VsChevronRight, VsChevronDown } from "solid-icons/vs";
import { AiOutlineFolder, AiOutlineFolderOpen, AiOutlineFile } from "solid-icons/ai";
import { ImportFormat, ImportSource, ImportCSVDirection } from "../../../../../types";
import { NamespaceSelector } from "../../NamespaceSelector/NamespaceSelector";
import { isBalancedSexpr } from "../../../lib/editorUtils";

function validateMetta(text: string): string | null {
    if (!isBalancedSexpr(text)) return "Unbalanced parentheses";
    return null;
}

function validateCSV(text: string, delimiter: string): string | null {
    const lines = text.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) return null;

    const parseRow = (line: string): string[] => {
        const result: string[] = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
                else inQuotes = !inQuotes;
            } else if (ch === delimiter && !inQuotes) {
                result.push(current); current = "";
            } else {
                current += ch;
            }
        }
        result.push(current);
        return result;
    };

    const counts = lines.map((l) => parseRow(l).length);
    const expected = counts[0];
    const bad = counts.findIndex((c, i) => i > 0 && c !== expected);
    if (bad >= 0)
        return `Line ${bad + 1}: expected ${expected} column(s), got ${counts[bad]}`;
    return null;
}

function validateJSONLD(text: string): string | null {
    try {
        const parsed = JSON.parse(text);
        if (typeof parsed !== "object" || parsed === null)
            return "JSON-LD must be a JSON object or array";
        return null;
    } catch (e: any) {
        return `Invalid JSON: ${e.message}`;
    }
}

function validateNTriples(text: string): string | null {
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith("#")) continue;
        if (!line.endsWith("."))
            return `Line ${i + 1}: triple must end with '.'`;
        const content = line.slice(0, -1).trim();
        const subjMatch = content.match(/^(<[^>]+>|_:\S+)\s+/);
        if (!subjMatch)
            return `Line ${i + 1}: invalid subject (expected IRI or blank node)`;
        const afterSubj = content.slice(subjMatch[0].length);
        const predMatch = afterSubj.match(/^<[^>]+>\s+/);
        if (!predMatch)
            return `Line ${i + 1}: invalid predicate (expected IRI)`;
        const obj = afterSubj.slice(predMatch[0].length).trim();
        if (!obj.match(/^(<[^>]+>|_:\S+|")/))
            return `Line ${i + 1}: invalid object`;
    }
    return null;
}

function validateN3(text: string): string | null {
    let braces = 0, brackets = 0;
    let inString = false, inLineComment = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inLineComment) { if (ch === "\n") inLineComment = false; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === "#") { inLineComment = true; continue; }
        if (ch === "{") braces++;
        else if (ch === "}") { braces--; if (braces < 0) return "Unexpected '}'"; }
        else if (ch === "[") brackets++;
        else if (ch === "]") { brackets--; if (brackets < 0) return "Unexpected ']'"; }
    }
    if (braces !== 0) return "Unbalanced curly braces '{'";
    if (brackets !== 0) return "Unbalanced square brackets '['";
    return null;
}

function validateImportText(text: string, format: ImportFormat, delimiter: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    switch (format) {
        case ImportFormat.METTA:    return validateMetta(trimmed);
        case ImportFormat.CSV:      return validateCSV(trimmed, delimiter);
        case ImportFormat.JSONLD:   return validateJSONLD(trimmed);
        case ImportFormat.NTRIPLES: return validateNTriples(trimmed);
        case ImportFormat.N3:       return validateN3(trimmed);
        default:                    return null;
    }
}

const GITHUB_TREE_URL =
    "https://api.github.com/repos/trueagi-io/metta-examples/git/trees/main?recursive=1";

interface ExampleNode {
    name: string;
    path: string;
    isFile: boolean;
    children: ExampleNode[];
}

function buildExampleTree(items: Array<{ path: string; type: string }>): ExampleNode[] {
    const dirMap = new Map<string, ExampleNode>();
    const root: ExampleNode[] = [];

    const getOrCreateDir = (path: string): ExampleNode => {
        if (dirMap.has(path)) return dirMap.get(path)!;
        const parts = path.split("/");
        const name = parts[parts.length - 1];
        const parentPath = parts.slice(0, -1).join("/");
        const node: ExampleNode = { name, path, isFile: false, children: [] };
        dirMap.set(path, node);
        if (parentPath) {
            getOrCreateDir(parentPath).children.push(node);
        } else {
            root.push(node);
        }
        return node;
    };

    for (const item of items) {
        if (item.type === "tree") getOrCreateDir(item.path);
    }

    for (const item of items) {
        if (item.type === "blob" && item.path.endsWith(".metta")) {
            const parts = item.path.split("/");
            const name = parts[parts.length - 1];
            const parentPath = parts.slice(0, -1).join("/");
            const node: ExampleNode = { name, path: item.path, isFile: true, children: [] };
            if (parentPath && dirMap.has(parentPath)) {
                dirMap.get(parentPath)!.children.push(node);
            } else if (!parentPath) {
                root.push(node);
            }
        }
    }

    const pruneEmpty = (nodes: ExampleNode[]): ExampleNode[] =>
        nodes
            .map((n) => ({ ...n, children: pruneEmpty(n.children) }))
            .filter((n) => n.isFile || n.children.length > 0);

    return pruneEmpty(root);
}

const TreeNode: Component<{
    node: ExampleNode;
    selectedPath: () => string;
    onSelect: (path: string) => void;
}> = (props) => {
    const [open, setOpen] = createSignal(false);

    if (props.node.isFile) {
        const isSelected = () => props.selectedPath() === props.node.path;
        return (
            <div
                class={`${styles.ExampleTreeFile} ${isSelected() ? styles.ExampleTreeFileSelected : ""}`}
                onClick={() => props.onSelect(props.node.path)}
                title={props.node.path}
            >
                <AiOutlineFile size={13} />
                {props.node.name}
            </div>
        );
    }

    return (
        <div>
            <div class={styles.ExampleTreeDir} onClick={() => setOpen((v) => !v)}>
                {open() ? <VsChevronDown size={12} /> : <VsChevronRight size={12} />}
                {open() ? <AiOutlineFolderOpen size={14} /> : <AiOutlineFolder size={14} />}
                {props.node.name}
            </div>
            <Show when={open()}>
                <div class={styles.ExampleTreeChildren}>
                    <For each={props.node.children}>
                        {(child) => (
                            <TreeNode
                                node={child}
                                selectedPath={props.selectedPath}
                                onSelect={props.onSelect}
                            />
                        )}
                    </For>
                </div>
            </Show>
        </div>
    );
};

interface ImportModalProps {
    ref: HTMLDialogElement | ((el: HTMLDialogElement) => void);

    // Source selection
    importSource: () => ImportSource;
    setImportSource: (s: ImportSource) => void;

    // Destination namespace
    importNamespace: () => string;
    setImportNamespace: (ns: string) => void;
    fetchExploreResults: (path: string) => Promise<any[]>;

    // File source
    activeFile: () => File | undefined;
    onFileSelect: (file: File) => void;
    isDraggingOver: () => boolean;
    setIsDraggingOver: (val: boolean) => void;

    // URL source
    importUrl: () => string;
    setImportUrl: (u: string) => void;

    // Text source
    importText: () => string;
    setImportText: (t: string) => void;

    // Examples source
    importExamplePath: () => string;
    setImportExamplePath: (p: string) => void;

    // Format settings (shared)
    format: () => ImportFormat | undefined;
    setManualFormat: (f: ImportFormat) => void;
    csvDirection: () => ImportCSVDirection;
    setCsvDirection: (d: ImportCSVDirection) => void;
    csvDelimiter: () => string;
    setCsvDelimiter: (d: string) => void;

    // Actions
    onImport: () => void;
    onCancel: () => void;
    isTranslating: () => boolean;
}

const FormatSettings: Component<{
    format: () => ImportFormat | undefined;
    setManualFormat: (f: ImportFormat) => void;
    csvDirection: () => ImportCSVDirection;
    setCsvDirection: (d: ImportCSVDirection) => void;
    csvDelimiter: () => string;
    setCsvDelimiter: (d: string) => void;
    showAutoDetect?: boolean;
}> = (props) => (
    <div class={styles.ImportSettingsGrid}>
        <div class={styles.ImportFieldGroup}>
            <label>{props.showAutoDetect ? "Override Format" : "Format"}</label>
            <select
                value={props.format() || ""}
                onchange={(e) => props.setManualFormat(e.target.value as ImportFormat)}
            >
                {props.showAutoDetect && <option value="">Auto-detect</option>}
                <option value={ImportFormat.METTA}>MeTTa (.metta)</option>
                <option value={ImportFormat.CSV}>CSV</option>
                <option value={ImportFormat.NTRIPLES}>N-Triples (.nt)</option>
                <option value={ImportFormat.N3}>N3</option>
                <option value={ImportFormat.JSONLD}>JSON-LD</option>
            </select>
        </div>

        <Show when={props.format() === ImportFormat.CSV}>
            <div class={styles.ImportFieldGroup}>
                <label>CSV Scheme</label>
                <select
                    value={props.csvDirection()}
                    onchange={(e) => props.setCsvDirection(e.target.value as ImportCSVDirection)}
                >
                    <option value={ImportCSVDirection.ROW}>Row</option>
                    <option value={ImportCSVDirection.COLUMN}>Column</option>
                    <option value={ImportCSVDirection.CELL_LABELED}>Labeled Cell</option>
                    <option value={ImportCSVDirection.CELL_UNLABELED}>Unlabeled Cell</option>
                </select>
            </div>
            <div class={styles.ImportFieldGroup}>
                <label>Delimiter</label>
                <select
                    value={props.csvDelimiter()}
                    onchange={(e) => props.setCsvDelimiter(e.target.value)}
                >
                    <option value={"\u002C"}>Comma (',')</option>
                    <option value={"\u0020"}>Space (' ')</option>
                    <option value={"\u0009"}>Tab ('\t')</option>
                </select>
            </div>
        </Show>
    </div>
);

export const ImportModal: Component<ImportModalProps> = (props) => {
    let fileInputRef: HTMLInputElement | undefined;

    const [exampleTree, setExampleTree] = createSignal<ExampleNode[]>([]);
    const [isLoadingExamples, setIsLoadingExamples] = createSignal(false);
    const [exampleError, setExampleError] = createSignal<string>("");

    const loadExamples = async () => {
        if (exampleTree().length > 0 || isLoadingExamples()) return;
        setIsLoadingExamples(true);
        setExampleError("");
        try {
            const resp = await fetch(GITHUB_TREE_URL);
            if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`);
            const data = await resp.json();
            setExampleTree(buildExampleTree(data.tree ?? []));
        } catch (e) {
            setExampleError("Failed to load examples from GitHub.");
        } finally {
            setIsLoadingExamples(false);
        }
    };

    const handleFileChange = (e: any) => {
        e.stopPropagation();
        const file = e.target.files?.[0];
        if (file) props.onFileSelect(file);
    };

    const textValidationError = () => {
        const fmt = props.format();
        const text = props.importText();
        if (!fmt || !text.trim()) return null;
        return validateImportText(text, fmt, props.csvDelimiter());
    };

    const isImportEnabled = () => {
        if (props.isTranslating()) return false;
        const src = props.importSource();
        if (src === ImportSource.FILE) return !!props.activeFile() && !!props.format();
        if (src === ImportSource.URL) return !!props.importUrl().trim() && !!props.format();
        if (src === ImportSource.TEXT) return !!props.importText().trim() && !!props.format() && !textValidationError();
        if (src === ImportSource.EXAMPLES) return !!props.importExamplePath();
        return false;
    };

    const importButtonLabel = () => {
        if (props.isTranslating()) return "Importing...";
        if (props.importSource() === ImportSource.EXAMPLES) return "Import";
        return props.format() === ImportFormat.METTA ? "Import" : "Translate and Import";
    };

    return (
        <dialog ref={props.ref} class={styles.ImportModalWide}>
            <form onsubmit={(e) => { e.preventDefault(); props.onImport(); }}>
                <button type="button" autofocus style="position:absolute;opacity:0;pointer-events:none;width:0;height:0;padding:0;border:0;" />
                <h2>Import</h2>

                <div class={styles.ImportModalContent}>
                    {/* Source selector */}
                    <div class={styles.ImportSourceTabs}>
                        <button
                            type="button"
                            class={`${styles.ImportSourceTab} ${props.importSource() === ImportSource.FILE ? styles.ImportSourceTabActive : ""}`}
                            onClick={() => props.setImportSource(ImportSource.FILE)}
                        >
                            <VsCloudUpload size={14} style={{ "margin-right": "6px" }} />
                            File
                        </button>
                        <button
                            type="button"
                            class={`${styles.ImportSourceTab} ${props.importSource() === ImportSource.URL ? styles.ImportSourceTabActive : ""}`}
                            onClick={() => props.setImportSource(ImportSource.URL)}
                        >
                            <VsLink size={14} style={{ "margin-right": "6px" }} />
                            URL
                        </button>
                        <button
                            type="button"
                            class={`${styles.ImportSourceTab} ${props.importSource() === ImportSource.TEXT ? styles.ImportSourceTabActive : ""}`}
                            onClick={() => props.setImportSource(ImportSource.TEXT)}
                        >
                            <VsSymbolString size={14} style={{ "margin-right": "6px" }} />
                            Text
                        </button>
                        <button
                            type="button"
                            class={`${styles.ImportSourceTab} ${props.importSource() === ImportSource.EXAMPLES ? styles.ImportSourceTabActive : ""}`}
                            onClick={() => { props.setImportSource(ImportSource.EXAMPLES); loadExamples(); }}
                        >
                            <AiOutlineFolder size={14} style={{ "margin-right": "6px" }} />
                            Examples
                        </button>
                    </div>

                    {/* Destination namespace */}
                    <div class={styles.ImportFieldGroup}>
                        <label>Destination Namespace</label>
                        <NamespaceSelector
                            value={props.importNamespace()}
                            onInput={props.setImportNamespace}
                            fetchExploreResults={props.fetchExploreResults}
                            placeholder="/"
                        />
                    </div>

                    {/* File source */}
                    <Show when={props.importSource() === ImportSource.FILE}>
                        <div
                            class={`${styles.DropZone} ${props.isDraggingOver() ? styles.DropZoneActive : ""} ${props.activeFile() ? styles.DropZoneSmall : ""}`}
                            onClick={(e) => { e.stopPropagation(); fileInputRef?.click(); }}
                            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); props.setIsDraggingOver(true); }}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); props.setIsDraggingOver(true); }}
                            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); props.setIsDraggingOver(false); }}
                            onDrop={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                props.setIsDraggingOver(false);
                                const file = e.dataTransfer?.files?.[0];
                                if (file) props.onFileSelect(file);
                            }}
                        >
                            <VsCloudUpload size={props.activeFile() ? 32 : 48} class={styles.DropZoneIcon} />
                            <div class={styles.DropZoneText}>
                                {props.activeFile() ? "Change Selection" : "Click or drag file to upload"}
                            </div>
                            <Show when={!props.activeFile()}>
                                <div class={styles.DropZoneHint}>Accepted: .csv, .n3, .jsonld, .nt, .metta</div>
                            </Show>
                        </div>

                        <Show when={props.activeFile()}>
                            <div class={styles.ImportSettingsContainer}>
                                <div class={styles.ActiveFileDisplay}>
                                    <VsFile size={24} color="var(--gold)" />
                                    <span>{props.activeFile()?.name}</span>
                                </div>
                                <FormatSettings
                                    format={props.format}
                                    setManualFormat={props.setManualFormat}
                                    csvDirection={props.csvDirection}
                                    setCsvDirection={props.setCsvDirection}
                                    csvDelimiter={props.csvDelimiter}
                                    setCsvDelimiter={props.setCsvDelimiter}
                                    showAutoDetect={true}
                                />
                                <Show when={!props.format()}>
                                    <p class={styles.ImportWarning}>Warning: Format not recognized. Please select manual override.</p>
                                </Show>
                            </div>
                        </Show>
                    </Show>

                    {/* URL source */}
                    <Show when={props.importSource() === ImportSource.URL}>
                        <div class={styles.ImportSettingsContainer}>
                            <FormatSettings
                                format={props.format}
                                setManualFormat={props.setManualFormat}
                                csvDirection={props.csvDirection}
                                setCsvDirection={props.setCsvDirection}
                                csvDelimiter={props.csvDelimiter}
                                setCsvDelimiter={props.setCsvDelimiter}
                                showAutoDetect={false}
                            />
                            <div class={styles.ImportFieldGroup}>
                                <label>URL</label>
                                <input
                                    class={styles.ImportInput}
                                    type="url"
                                    placeholder={`https://example.com/data.${props.format() ?? 'metta'}`}
                                    value={props.importUrl()}
                                    onInput={(e) => props.setImportUrl(e.currentTarget.value)}
                                />
                            </div>
                        </div>
                    </Show>

                    {/* Text source */}
                    <Show when={props.importSource() === ImportSource.TEXT}>
                        <div class={styles.ImportSettingsContainer}>
                            <FormatSettings
                                format={props.format}
                                setManualFormat={props.setManualFormat}
                                csvDirection={props.csvDirection}
                                setCsvDirection={props.setCsvDirection}
                                csvDelimiter={props.csvDelimiter}
                                setCsvDelimiter={props.setCsvDelimiter}
                                showAutoDetect={false}
                            />
                            <div class={styles.ImportFieldGroup}>
                                <label>Content</label>
                                <textarea
                                    class={styles.ImportTextArea}
                                    placeholder={
                                        props.format() === ImportFormat.CSV ? "col1,col2\nval1,val2" :
                                        props.format() === ImportFormat.NTRIPLES ? "<http://example.org/subject> <http://example.org/predicate> <http://example.org/object> ." :
                                        props.format() === ImportFormat.N3 ? "@prefix ex: <http://example.org/> .\nex:subject ex:predicate ex:object ." :
                                        props.format() === ImportFormat.JSONLD ? '{\n  "@context": "http://schema.org/",\n  "@type": "Thing",\n  "name": "Example"\n}' :
                                        "(MyAtom (has value))"
                                    }
                                    value={props.importText()}
                                    onInput={(e) => props.setImportText(e.currentTarget.value)}
                                    style={textValidationError() ? { border: "1px solid var(--love)" } : {}}
                                />
                                <Show when={textValidationError()}>
                                    <span style={{ color: "var(--love)", "font-size": "0.75rem" }}>{textValidationError()}</span>
                                </Show>
                            </div>
                        </div>
                    </Show>

                    {/* Examples source */}
                    <Show when={props.importSource() === ImportSource.EXAMPLES}>
                        <div class={styles.ImportSettingsContainer}>
                            <div class={styles.ExampleBrowser}>
                                <Show when={isLoadingExamples()}>
                                    <div class={styles.ExampleTreeLoading}>Loading examples...</div>
                                </Show>
                                <Show when={exampleError()}>
                                    <div class={styles.ExampleTreeError}>{exampleError()}</div>
                                </Show>
                                <Show when={!isLoadingExamples() && exampleTree().length > 0}>
                                    <div class={styles.ExampleTree}>
                                        <For each={exampleTree()}>
                                            {(node) => (
                                                <TreeNode
                                                    node={node}
                                                    selectedPath={props.importExamplePath}
                                                    onSelect={props.setImportExamplePath}
                                                />
                                            )}
                                        </For>
                                    </div>
                                </Show>
                                <Show when={props.importExamplePath()}>
                                    <div class={styles.ExampleSelectedFile}>
                                        <VsFile size={14} />
                                        <span>{props.importExamplePath()}</span>
                                    </div>
                                </Show>
                            </div>
                        </div>
                    </Show>
                </div>

                <input
                    style={{ display: "none" }}
                    ref={fileInputRef}
                    type="file"
                    onchange={handleFileChange}
                />

                <div class={commonStyles.ModalButtonBar}>
                    <button type="button" class={commonStyles.TextButton} onclick={props.onCancel}>
                        Cancel
                    </button>
                    <div class={commonStyles.Spacer} />
                    <button class={commonStyles.Button} type="submit" disabled={!isImportEnabled()}>
                        {importButtonLabel()}
                    </button>
                </div>
            </form>
        </dialog>
    );
};
