import { Component, createSignal, Show } from "solid-js";
import styles from "../Editor.module.scss";
import { VsCloudUpload, VsFile } from "solid-icons/vs";
import { ImportFormat, ImportCSVDirection } from "../types";

interface ImportModalProps {
  ref: HTMLDialogElement | ((el: HTMLDialogElement) => void);
  activeFile: () => File | undefined;
  onFileSelect: (file: File) => void;
  onCancel: () => void;
  isDraggingOver: () => boolean;
  setIsDraggingOver: (val: boolean) => void;
  
  // Settings props
  format: () => ImportFormat | undefined;
  setManualFormat: (f: ImportFormat) => void;
  csvDirection: () => ImportCSVDirection;
  setCsvDirection: (d: ImportCSVDirection) => void;
  csvDelimiter: () => string;
  setCsvDelimiter: (d: string) => void;
  
  // Action props
  onImport: () => void;
  isTranslating: () => boolean;
}

export const ImportModal: Component<ImportModalProps> = (props) => {
  let fileInputRef: HTMLInputElement | undefined;

  const handleFileChange = (e: any) => {
    e.stopPropagation();
    const file = e.target.files?.[0];
    if (file) props.onFileSelect(file);
  };

  return (
    <dialog ref={props.ref} class={styles.ImportModalWide}>
      <form onsubmit={(e) => { e.preventDefault(); props.onImport(); }}>
        <h2>Import Data Source</h2>
        
        <div class={styles.ImportModalContent}>
          <div
            class={`${styles.DropZone} ${
              props.isDraggingOver() ? styles.DropZoneActive : ""
            } ${props.activeFile() ? styles.DropZoneSmall : ""}`}
            onClick={(e) => { e.stopPropagation(); fileInputRef?.click(); }}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              props.setIsDraggingOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              props.setIsDraggingOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              props.setIsDraggingOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              props.setIsDraggingOver(false);
              const file = e.dataTransfer?.files?.[0];
              if (file) {
                props.onFileSelect(file);
              }
            }}
          >
            <VsCloudUpload size={props.activeFile() ? 32 : 48} class={styles.DropZoneIcon} />
            <div class={styles.DropZoneText}>
              {props.activeFile()
                ? "Change Selection"
                : "Click or drag file to upload"}
            </div>
            <Show when={!props.activeFile()}>
                <div class={styles.DropZoneHint}>
                    Accepted: .csv, .n3, .jsonld, .nt, .metta
                </div>
            </Show>
          </div>

          <Show when={props.activeFile()}>
            <div class={styles.ImportSettingsContainer}>
              <div class={styles.ActiveFileDisplay}>
                <VsFile size={24} color="var(--rp-gold)" />
                <span>{props.activeFile()?.name}</span>
              </div>

              <div class={styles.ImportSettingsGrid}>
                <div class={styles.FieldGroup}>
                  <label>Override Format</label>
                  <select 
                    value={props.format() || ""} 
                    onchange={(e) => props.setManualFormat(e.target.value as ImportFormat)}
                  >
                    <option value="">Auto-detect</option>
                    <option value={ImportFormat.CSV}>CSV</option>
                    <option value={ImportFormat.NTRIPLES}>N-Triples (.nt)</option>
                    <option value={ImportFormat.N3}>N3</option>
                    <option value={ImportFormat.JSONLD}>JSON-LD</option>
                    <option value={ImportFormat.METTA}>MeTTa (.metta)</option>
                  </select>
                </div>

                <Show when={props.format() === ImportFormat.CSV}>
                  <div class={styles.FieldGroup}>
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
                  <div class={styles.FieldGroup}>
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
              
              <Show when={!props.format()}>
                <p class={styles.ImportWarning}>Warning: Format not recognized. Please select manual override.</p>
              </Show>
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
          <button
            type="button"
            class={styles.TextButton}
            onclick={props.onCancel}
          >
            Cancel
          </button>
          <div class={styles.Spacer} />
          <button 
            class={styles.Button} 
            type="submit" 
            disabled={!props.activeFile() || !props.format() || props.isTranslating()}
          >
            <Show when={props.format() === ImportFormat.METTA} fallback={
                props.isTranslating() ? "Translating..." : "Translate and Import"
            }>
                {props.isTranslating() ? "Importing..." : "Import"}
            </Show>
          </button>
        </div>
      </form>
    </dialog>
  );
};
