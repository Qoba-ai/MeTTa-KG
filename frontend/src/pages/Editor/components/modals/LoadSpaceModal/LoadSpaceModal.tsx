import { Component, createSignal } from "solid-js";
import styles from "./LoadSpaceModal.module.scss";
import commonStyles from "../../../../../styles/Common.module.scss";

interface LoadSpaceModalProps {
  ref: HTMLDialogElement | ((el: HTMLDialogElement) => void);
  onLoad: (token: string) => void;
  onCancel: () => void;
}

export const LoadSpaceModal: Component<LoadSpaceModalProps> = (props) => {
  const [tokenToOpen, setTokenToOpen] = createSignal("");
  let inputRef: HTMLInputElement | undefined;

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (tokenToOpen().trim()) {
      props.onLoad(tokenToOpen().trim());
    }
  };

  return (
    <dialog ref={props.ref} class={styles.LoadSpaceModal}>
      <form onsubmit={handleSubmit}>
        <h2>Open MeTTa Space</h2>
        <label>
          Space Token
          <input
            ref={inputRef}
            type="text"
            required
            placeholder="uuid-v4-token"
            oninvalid={() =>
              inputRef?.setCustomValidity("Please enter a valid UUIDv4")
            }
            value={tokenToOpen()}
            onInput={(e) => {
              setTokenToOpen(e.target.value);
              inputRef?.setCustomValidity("");
            }}
            pattern="(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)"
          />
        </label>
        <div class={commonStyles.ModalButtonBar}>
          <button
            type="button"
            class={commonStyles.TextButton}
            onclick={props.onCancel}
          >
            Cancel
          </button>
          <div class={commonStyles.Spacer}></div>
          <button
            class={commonStyles.Button}
            type="submit"
            disabled={tokenToOpen() === ""}
          >
            Open Space
          </button>
        </div>
      </form>
    </dialog>
  );
};
