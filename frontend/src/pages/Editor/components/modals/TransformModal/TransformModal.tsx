import { Component, Index, createSignal, createEffect } from "solid-js";
import styles from "./TransformModal.module.scss";
import commonStyles from "../../../../../styles/Common.module.scss";
import { NamespaceSelector } from "../../NamespaceSelector/NamespaceSelector";
import { handleAutoClose, isBalancedSexpr } from "../../../lib/editorUtils";
import { VsAdd, VsTrash } from "solid-icons/vs";

export interface SpaceConfig {
  path: string;
  type: 'input' | 'output';
  patternOrTemplate: string;
}

interface SpaceGroupProps {
  type: 'input' | 'output';
  configs: () => SpaceConfig[];
  updateConfig: (index: number, patch: Partial<SpaceConfig>) => void;
  removeSpace: (index: number) => void;
  fetchExploreResults: (path: string) => Promise<any[]>;
}

const SpaceGroup: Component<SpaceGroupProps> = (props) => {
  const entries = () => props.configs()
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.type === props.type)

  return (
    <div>
      <div style={{ "font-size": "0.75rem", "font-weight": 700, "text-transform": "uppercase", "letter-spacing": "0.07em", color: props.type === 'input' ? "var(--foam)" : "var(--gold)", "margin-bottom": "8px" }}>
        {props.type === 'input' ? 'Input Spaces' : 'Output Spaces'}
      </div>
      {entries().length === 0 ? (
        <div style={{ "font-size": "0.8rem", color: "var(--muted)", "font-style": "italic", padding: "8px 0" }}>
          No {props.type} spaces added
        </div>
      ) : (
        <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
          <Index each={entries()}>
            {(entry) => {
              const i = entry().i
              const config = () => props.configs()[i]
              return (
                <div class={styles.ImportSettingsContainer} style={{ display: "flex", "flex-direction": "column", gap: "12px", position: "relative" }}>
                  <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
                    <div style={{ flex: 1 }}>
                      <NamespaceSelector
                        value={config().path}
                        onInput={(val) => props.updateConfig(i, { path: val })}
                        fetchExploreResults={props.fetchExploreResults}
                      />
                    </div>
                    <button
                      type="button"
                      class={styles.TrieActionBtn}
                      onClick={() => props.removeSpace(i)}
                      title="Remove Space"
                      style={{ color: entries().length === 1 ? undefined : "var(--love)" }}
                      disabled={entries().length === 1}
                    >
                      <VsTrash size={18} />
                    </button>
                  </div>
                  <div class={styles.FieldGroup}>
                    <label>{props.type === 'input' ? 'Pattern (S-expression)' : 'Template (S-expression)'}</label>
                    <input
                      value={config().patternOrTemplate}
                      placeholder={props.type === 'input' ? "(pattern $x)" : "(template $x)"}
                      onInput={(e) => props.updateConfig(i, { patternOrTemplate: (e.target as HTMLInputElement).value })}
                      onKeyDown={handleAutoClose}
                      style={config().patternOrTemplate.trim() !== "" && !isBalancedSexpr(config().patternOrTemplate)
                        ? { border: "1px solid var(--love)" }
                        : {}}
                      required
                    />
                    {config().patternOrTemplate.trim() !== "" && !isBalancedSexpr(config().patternOrTemplate) && (
                      <span style={{ color: "var(--love)", "font-size": "0.75rem" }}>Unbalanced parentheses</span>
                    )}
                  </div>
                </div>
              )
            }}
          </Index>
        </div>
      )}
    </div>
  )
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

  const addSpace = (type: 'input' | 'output') => {
    setLocalConfigs([...localConfigs(), { path: '/', type, patternOrTemplate: '' }]);
  };

  const removeSpace = (index: number) => {
    setLocalConfigs(localConfigs().filter((_, i) => i !== index));
  };

  const isValid = () => {
    const configs = localConfigs();
    const hasInput = configs.some(c => c.type === 'input');
    const hasOutput = configs.some(c => c.type === 'output');
    const allFilled = configs.every(c => c.patternOrTemplate.trim() !== "" && c.path.trim() !== "");
    const allBalanced = configs.every(c => isBalancedSexpr(c.patternOrTemplate));
    return hasInput && hasOutput && allFilled && allBalanced && configs.length >= 2;
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
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" class={commonStyles.Button} onClick={() => addSpace('input')} style={{ display: "flex", "align-items": "center", gap: "6px" }}>
              <VsAdd size={16} />
              Add Input
            </button>
            <button type="button" class={commonStyles.Button} onClick={() => addSpace('output')} style={{ display: "flex", "align-items": "center", gap: "6px" }}>
              <VsAdd size={16} />
              Add Output
            </button>
          </div>
        </div>

        <div style={{ "overflow": "visible", "display": "flex", "flex-direction": "column", "gap": "20px", "padding-bottom": "8px" }}>
          <SpaceGroup type="input" configs={localConfigs} updateConfig={updateConfig} removeSpace={removeSpace} fetchExploreResults={props.fetchExploreResults} />
          <SpaceGroup type="output" configs={localConfigs} updateConfig={updateConfig} removeSpace={removeSpace} fetchExploreResults={props.fetchExploreResults} />
        </div>

        <div class={commonStyles.ModalButtonBar}>
          <button
            type="button"
            class={commonStyles.TextButton}
            onclick={props.onCancel}
          >
            Cancel
          </button>
          <div class={commonStyles.Spacer}></div>
          <button class={commonStyles.Button} type="submit" disabled={!isValid()}>
            Transform
          </button>
        </div>
      </form>
    </dialog>
  );
};
