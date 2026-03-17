import { Component, createSignal, Show } from "solid-js";
import styles from "../Editor.module.scss";
import { VsCloudUpload, VsFile, VsLink, VsSymbolString } from "solid-icons/vs";
import { ImportFormat, ImportSource, ImportCSVDirection } from "../types";
import { NamespaceSelector } from "../NamespaceSelector";

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

  const handleFileChange = (e: any) => {
    e.stopPropagation();
    const file = e.target.files?.[0];
    if (file) props.onFileSelect(file);
  };

  const isImportEnabled = () => {
    if (props.isTranslating()) return false;
    const src = props.importSource();
    if (src === ImportSource.FILE) return !!props.activeFile() && !!props.format();
    if (src === ImportSource.URL) return !!props.importUrl().trim() && !!props.format();
    if (src === ImportSource.TEXT) return !!props.importText().trim() && !!props.format();
    return false;
  };

  const importButtonLabel = () => {
    if (props.isTranslating()) {
      return props.format() === ImportFormat.METTA ? "Importing..." : "Translating...";
    }
    return props.format() === ImportFormat.METTA ? "Import" : "Translate and Import";
  };

  return (
    <dialog ref={props.ref} class={styles.ImportModalWide}>
      <form onsubmit={(e) => { e.preventDefault(); props.onImport(); }}>
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
                  <VsFile size={24} color="var(--rp-gold)" />
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
              <div class={styles.ImportFieldGroup}>
                <label>URL</label>
                <input
                  class={styles.ImportInput}
                  type="url"
                  placeholder="https://example.com/data.metta"
                  value={props.importUrl()}
                  onInput={(e) => props.setImportUrl(e.currentTarget.value)}
                />
              </div>
              <FormatSettings
                format={props.format}
                setManualFormat={props.setManualFormat}
                csvDirection={props.csvDirection}
                setCsvDirection={props.setCsvDirection}
                csvDelimiter={props.csvDelimiter}
                setCsvDelimiter={props.setCsvDelimiter}
                showAutoDetect={false}
              />
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
                  placeholder={props.format() === ImportFormat.CSV ? "col1,col2\nval1,val2" : "(MyAtom (has value))"}
                  value={props.importText()}
                  onInput={(e) => props.setImportText(e.currentTarget.value)}
                />
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

        <div class={styles.ModalButtonBar}>
          <button type="button" class={styles.TextButton} onclick={props.onCancel}>
            Cancel
          </button>
          <div class={styles.Spacer} />
          <button class={styles.Button} type="submit" disabled={!isImportEnabled()}>
            {importButtonLabel()}
          </button>
        </div>
      </form>
    </dialog>
  );
};
