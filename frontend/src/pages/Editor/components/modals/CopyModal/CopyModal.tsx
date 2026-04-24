import { Component, createSignal } from "solid-js";
import styles from "./CopyModal.module.scss";
import commonStyles from "../../../../../styles/Common.module.scss";
import { NamespaceSelector } from "../../NamespaceSelector/NamespaceSelector";

interface CopyModalProps {
  ref: HTMLDialogElement | ((el: HTMLDialogElement) => void);
  initialSrc: string;
  onConfirm: (src: string, dst: string) => void;
  onCancel: () => void;
  fetchExploreResults: (path: string) => Promise<any[]>;
}

export const CopyModal: Component<CopyModalProps> = (props) => {
  const [src, setSrc] = createSignal(props.initialSrc);
  const [dst, setDst] = createSignal("");

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const s = src().trim();
    const d = dst().trim();
    if (s && d) {
      props.onConfirm(s, d);
    }
  };

  return (
    <dialog ref={props.ref}>
      <form onsubmit={handleSubmit}>
        <button type="button" autofocus style="position:absolute;opacity:0;pointer-events:none;width:0;height:0;padding:0;border:0;" />
        <h2>Copy Space</h2>
        <div class={styles.FieldGroup}>
          <label>Source</label>
          <NamespaceSelector
            value={src()}
            onInput={setSrc}
            fetchExploreResults={props.fetchExploreResults}
            placeholder="/source/space/"
          />
        </div>
        <div class={styles.FieldGroup}>
          <label>Destination</label>
          <NamespaceSelector
            value={dst()}
            onInput={setDst}
            fetchExploreResults={props.fetchExploreResults}
            placeholder="/destination/space/"
          />
        </div>
        <div class={commonStyles.ModalButtonBar}>
          <button
            type="button"
            class={commonStyles.TextButton}
            onclick={() => {
              setDst("");
              props.onCancel();
            }}
          >
            Cancel
          </button>
          <div class={commonStyles.Spacer}></div>
          <button
            class={commonStyles.Button}
            type="submit"
            disabled={!src().trim() || !dst().trim()}
          >
            Copy Space
          </button>
        </div>
      </form>
    </dialog>
  );
};
