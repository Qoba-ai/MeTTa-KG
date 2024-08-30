import type { Component } from "solid-js";
import { AiOutlineImport } from "solid-icons/ai";
import { createSignal, onMount, Show } from "solid-js";

import styles from "./App.module.scss";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

const App: Component = () => {
  let popperButton: HTMLButtonElement;
  let importCSVButton: HTMLButtonElement;
  let importCSVModal: HTMLDialogElement;
  let popper: HTMLDivElement;
  let importCSVForm: HTMLFormElement;
  let importCSVFormFileInput: HTMLInputElement;

  const [isNewSession, setIsNewSession] = createSignal(true);
  const [isCreateNewPopperOpen, setIsCreateNewPopperOpen] = createSignal(false);
  const [contents, setContents] = createSignal("");

  const handleMouseClick = (event: MouseEvent) => {
    if (
      popper &&
      !popper.contains(event.target as Node) &&
      !popperButton.contains(event.target as Node) &&
      isCreateNewPopperOpen()
    ) {
      setIsCreateNewPopperOpen(false);
    }

    if (
      importCSVModal &&
      !importCSVModal.contains(event.target as Node) &&
      importCSVButton &&
      !importCSVButton.contains(event.target as Node) &&
      importCSVModal.open
    ) {
      importCSVModal.close();
    }
  };

  onMount(() => {
    document.addEventListener("click", handleMouseClick);

    importCSVModal.addEventListener("click", function (event) {
      var rect = importCSVModal.getBoundingClientRect();
      var isInDialog =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!isInDialog) {
        importCSVModal.close();
      }
    });

    importCSVForm.onsubmit = (event) => {
      event.preventDefault();

      const files = importCSVFormFileInput.files;

      if (files?.length !== 1) {
        return event.preventDefault();
      }

      fetch(`${BACKEND_URL}/translations?file_type=csv`, {
        method: "POST",
        headers: {
          "Content-Type": "text/csv",
        },
        body: files[0],
      })
        .then((r) => r.json())
        .then((r) => {
          setContents(r);
          importCSVModal.close();
          setIsNewSession(false);
        });
    };
  });

  return (
    <div class={styles.Page}>
      <div class={styles.Navbar}>
        <div class={styles.NavbarTitle}>
          <span class={styles.NavbarTitle}>MeTTa Editor</span>
        </div>
        <div class={styles.NavbarContent}>
          <div>
            <button class={styles.LoginButton}>Tokens</button>
          </div>
        </div>
      </div>
      <div class={styles.Editor}>
        <div></div>
        <div class={styles.MettaInputWrapper}>
          <textarea class={styles.MettaInput} readonly>
            {contents()}
          </textarea>
          <Show when={isNewSession()}>
            <div class={styles.NewSessionDiv}>
              <button
                ref={popperButton!}
                onClick={() =>
                  setIsCreateNewPopperOpen(!isCreateNewPopperOpen())
                }
                class={styles.ImportButton}
              >
                <AiOutlineImport color={"white"} size={36} />
                <span>Import</span>
              </button>
              <Show when={isCreateNewPopperOpen()}>
                <div ref={popper!} class={styles.CreateNewKGPopOver}>
                  <button class={styles.ImportCSVButton}>Import ND</button>
                  <button
                    ref={importCSVButton!}
                    onClick={() => {
                      importCSVModal.showModal();
                      setIsCreateNewPopperOpen(false);
                    }}
                    class={styles.ImportCSVButton}
                  >
                    Import CSV
                  </button>
                </div>
              </Show>
            </div>
          </Show>
        </div>
        <dialog ref={importCSVModal!} class={styles.ImportCSVModal}>
          <form ref={importCSVForm!}>
            <h4>Import CSV</h4>
            <input ref={importCSVFormFileInput!} type="file" />
            <input type="submit" />
          </form>
        </dialog>
      </div>
    </div>
  );
};

export default App;
