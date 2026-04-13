import { Component, createSignal } from "solid-js";
import commonStyles from "../../../../../styles/Common.module.scss";

interface ClearModalProps {
  ref: HTMLDialogElement | ((el: HTMLDialogElement) => void);
  namespace: string;
  onConfirm: (pattern?: string) => void;
  onCancel: () => void;
}

export const ClearModal: Component<ClearModalProps> = (props) => {
  const [pattern, setPattern] = createSignal("");

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const trimmedPattern = pattern().trim();
    props.onConfirm(trimmedPattern || undefined);
    setPattern(""); // Reset for next time
  };

  return (
    <dialog ref={props.ref}>
      <form onsubmit={handleSubmit}>
        <h2>Clear Space</h2>
        <p>
          Are you sure you want to clear the space <strong>'{props.namespace}'</strong>?
        </p>
        <div class={commonStyles.ModalButtonBar}>
          <button
            type="button"
            class={commonStyles.TextButton}
            onclick={() => {
              setPattern("");
              props.onCancel();
            }}
          >
            Cancel
          </button>
          <div class={commonStyles.Spacer}></div>
          <button
            class={commonStyles.Button}
            type="submit"
          >
            Clear Space
          </button>
        </div>
      </form>
    </dialog>
  );
};
