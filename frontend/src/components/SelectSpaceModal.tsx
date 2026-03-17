import { Component, createSignal } from "solid-js";
import styles from "../Editor.module.scss";
import { NamespaceSelector } from "../NamespaceSelector";

interface SelectSpaceModalProps {
  ref: HTMLDialogElement | ((el: HTMLDialogElement) => void);
  onSelect: (path: string) => void;
  onCancel: () => void;
  fetchExploreResults: (path: string) => Promise<any[]>;
  initialValue: string;
}

export const SelectSpaceModal: Component<SelectSpaceModalProps> = (props) => {
  const [selectedPath, setSelectedPath] = createSignal(props.initialValue);

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (selectedPath().trim()) {
      props.onSelect(selectedPath().trim());
    }
  };

  return (
    <dialog ref={props.ref} class={styles.LoadSpaceModal}>
      <form onsubmit={handleSubmit}>
        <button type="button" autofocus style="position:absolute;opacity:0;pointer-events:none;width:0;height:0;padding:0;border:0;" />
        <h2>Select MeTTa Space</h2>
        <div class={styles.FieldGroup}>
          <label>Space Path</label>
          <NamespaceSelector 
            value={selectedPath()}
            onInput={setSelectedPath}
            fetchExploreResults={props.fetchExploreResults}
            placeholder="/path/to/space/"
          />
        </div>
        <div class={styles.ModalButtonBar} style={{ "margin-top": "20px" }}>
          <button
            type="button"
            class={styles.TextButton}
            onclick={props.onCancel}
          >
            Cancel
          </button>
          <div class={styles.Spacer}></div>
          <button
            class={styles.Button}
            type="submit"
            disabled={selectedPath() === ""}
          >
            Load Space
          </button>
        </div>
      </form>
    </dialog>
  );
};
