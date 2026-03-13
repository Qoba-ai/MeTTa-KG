import { Component, Show } from "solid-js";
import styles from "../Editor.module.scss";

interface ConfirmModalProps {
  ref: HTMLDialogElement | ((el: HTMLDialogElement) => void);
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: Component<ConfirmModalProps> = (props) => {
  return (
    <dialog ref={props.ref}>
      <form onsubmit={(e) => e.preventDefault()}>
        <h2>{props.title}</h2>
        <p>{props.message}</p>
        <div class={styles.ModalButtonBar}>
          <button
            type="button"
            class={styles.TextButton}
            onclick={props.onCancel}
          >
            Cancel
          </button>
          <div class={styles.Spacer}></div>
          <button
            type="button"
            class={styles.Button}
            onclick={(e) => {
              e.preventDefault();
              props.onConfirm();
            }}
          >
            Confirm
          </button>
        </div>
      </form>
    </dialog>
  );
};
