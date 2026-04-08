import { Component } from "solid-js";
import commonStyles from "../../styles/Common.module.scss";

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
            type="button"
            class={commonStyles.Button}
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
