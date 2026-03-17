import { Component, Index, createSignal, createEffect } from "solid-js";
import styles from "../Editor.module.scss";
import { NamespaceSelector } from "../NamespaceSelector";
import { handleAutoClose } from "../utils/editorUtils";
import { VsAdd, VsTrash } from "solid-icons/vs";

export interface SpaceConfig {
  path: string;
  type: 'input' | 'output';
  patternOrTemplate: string;
}

interface TransformModalProps {
  ref: HTMLDialogElement | ((el: HTMLDialogElement) => void);
  configs: () => SpaceConfig[];
  setConfigs: (c: SpaceConfig[]) => void;
  onTransform: (configs: SpaceConfig[]) => void;
  onCancel: () => void;
  fetchExploreResults: (path: string) => Promise<any[]>;
}

export const TransformModal: Component<TransformModalProps> = (props) => {
  const [localConfigs, setLocalConfigs] = createSignal<SpaceConfig[]>([]);

  // Sync with props when modal opens or configs change from outside
  createEffect(() => {
    setLocalConfigs(JSON.parse(JSON.stringify(props.configs())));
  });

  const updateConfig = (index: number, patch: Partial<SpaceConfig>) => {
    const newConfigs = [...localConfigs()];
    newConfigs[index] = { ...newConfigs[index], ...patch };
    setLocalConfigs(newConfigs);
  };

  const addSpace = () => {
    setLocalConfigs([...localConfigs(), { path: '/', type: 'input', patternOrTemplate: '' }]);
  };

  const removeSpace = (index: number) => {
    setLocalConfigs(localConfigs().filter((_, i) => i !== index));
  };

  const isValid = () => {
    const configs = localConfigs();
    const hasInput = configs.some(c => c.type === 'input');
    const hasOutput = configs.some(c => c.type === 'output');
    const allFilled = configs.every(c => c.patternOrTemplate.trim() !== "" && c.path.trim() !== "");
    return hasInput && hasOutput && allFilled && configs.length >= 2;
  };

  return (
    <dialog ref={props.ref} class={styles.TransformModal} style={{ width: "800px" }}>
      <form
        onsubmit={(e) => {
          e.preventDefault();
          if (isValid()) {
              props.setConfigs(localConfigs());
              props.onTransform(localConfigs());
          }
        }}
      >
        <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "20px" }}>
            <h2 style={{ margin: 0 }}>Configure Transformation</h2>
            <button type="button" class={styles.Button} onClick={addSpace} style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                <VsAdd size={16} />
                Add Space
            </button>
        </div>
        
        <div style={{ "max-height": "60vh", "display": "flex", "flex-direction": "column", "gap": "16px", "padding-bottom": "150px" }}>
          <Index each={localConfigs()}>
            {(config, i) => {
              return (
                <div class={styles.ImportSettingsContainer} style={{ display: "flex", "flex-direction": "column", gap: "12px", position: "relative" }}>
                  <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
                    <div style={{ flex: 1 }}>
                      <NamespaceSelector 
                          value={config().path}
                          onInput={(val) => updateConfig(i, { path: val })}
                          fetchExploreResults={props.fetchExploreResults}
                      />
                    </div>
                    <select 
                      value={config().type} 
                      onchange={(e) => updateConfig(i, { type: (e.target as HTMLSelectElement).value as 'input' | 'output' })}
                      style={{ padding: "8px", "border-radius": "6px", background: "var(--rp-surface)", color: "var(--rp-text)", border: "1px solid var(--rp-highlight-low)" }}
                    >
                      <option value="input">Input (Pattern)</option>
                      <option value="output">Output (Template)</option>
                    </select>
                    <button 
                      type="button" 
                      class={styles.TrieActionBtn} 
                      onClick={() => removeSpace(i)}
                      title="Remove Space"
                      style={{ color: "var(--rp-love)" }}
                    >
                      <VsTrash size={18} />
                    </button>
                  </div>
                  <div class={styles.FieldGroup}>
                    <label>{config().type === 'input' ? 'Pattern (S-expression)' : 'Template (S-expression)'}</label>
                    <input
                      value={config().patternOrTemplate}
                      placeholder={config().type === 'input' ? "(pattern $x)" : "(template $x)"}
                      onInput={(e) => updateConfig(i, { patternOrTemplate: (e.target as HTMLInputElement).value })}
                      onKeyDown={handleAutoClose}
                      required
                    />
                  </div>
                </div>
              );
            }}
          </Index>
        </div>

        <div class={styles.ModalButtonBar}>
          <button
            type="button"
            class={styles.TextButton}
            onclick={props.onCancel}
          >
            Cancel
          </button>
          <div class={styles.Spacer}></div>
          <button class={styles.Button} type="submit" disabled={!isValid()}>
            Transform
          </button>
        </div>
      </form>
    </dialog>
  );
};
