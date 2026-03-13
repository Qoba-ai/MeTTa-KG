import { Component } from "solid-js";
import styles from "../Editor.module.scss";
import { NamespaceSelector } from "../NamespaceSelector";

interface TransformModalProps {
  ref: HTMLDialogElement | ((el: HTMLDialogElement) => void);
  inputSpace: () => string;
  setInputSpace: (v: string) => void;
  outputSpace: () => string;
  setOutputSpace: (v: string) => void;
  pattern: () => string;
  setPattern: (v: string) => void;
  template: () => string;
  setTemplate: (v: string) => void;
  fetchExploreResults: (path: string) => Promise<any[]>;
  onTransform: () => void;
  onCancel: () => void;
}

export const TransformModal: Component<TransformModalProps> = (props) => {
  return (
    <dialog ref={props.ref} class={styles.TransformModal}>
      <form
        onsubmit={(e) => {
          e.preventDefault();
          props.onTransform();
        }}
      >
        <h2>MeTTa Knowledge Transformation</h2>
        <div class={styles.TransformIOSpaces}>
          <div class={styles.FieldGroup}>
            <label>Source Space</label>
            <NamespaceSelector
              value={props.inputSpace()}
              onInput={props.setInputSpace}
              fetchExploreResults={props.fetchExploreResults}
              placeholder="/source/path/"
            />
          </div>
          <div class={styles.FieldGroup}>
            <label>Target Space</label>
            <NamespaceSelector
              value={props.outputSpace()}
              onInput={props.setOutputSpace}
              fetchExploreResults={props.fetchExploreResults}
              placeholder="/target/path/"
            />
          </div>
        </div>

        <div class={styles.TransformPatterns}>
          <div class={styles.FieldGroup}>
            <label>Match Expression</label>
            <input
              class={styles.SelectSpaces}
              value={props.pattern()}
              placeholder="(pattern $x)"
              onInput={(ev) => props.setPattern(ev.target.value)}
              required
            />
          </div>
          <div class={styles.FieldGroup}>
            <label>Map Template</label>
            <input
              class={styles.SelectSpaces}
              value={props.template()}
              placeholder="(template $x)"
              onInput={(ev) => props.setTemplate(ev.target.value)}
              required
            />
          </div>
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
          <button class={styles.Button} type="submit">
            Apply Transformation
          </button>
        </div>
      </form>
    </dialog>
  );
};
