import type { Component } from "solid-js";
import { AiOutlineGithub, AiOutlineImport } from "solid-icons/ai";
import { createSignal, onMount, Show } from "solid-js";

import styles from "./App.module.scss";
import { A } from "@solidjs/router";
import toast, { Toaster } from "solid-toast";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

enum EditorMode {
  IMPORT,
  EDIT,
}

enum ImportFormat {
  CSV,
  N3,
  JSONLD,
  NTRIPLES,
}

enum ImportCSVDirection {
  ROW = "Row",
  COLUMN = "Column",
  CELL = "Cell",
}

const translate = async (
  file: File,
  direction: string,
  delimiter: string
): Promise<string> => {
  const resp = await fetch(
    `${BACKEND_URL}/translations?direction=${direction}&delimiter=${delimiter}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "text/csv",
      },
      body: file,
    }
  );

  const data = await resp.json();

  return data;
};

const App: Component = () => {
  let popperButton: HTMLButtonElement;
  let importFileButton: HTMLButtonElement;
  let importFileModalPage1: HTMLDialogElement;
  let popper: HTMLDivElement;
  let importFileForm: HTMLFormElement;
  let importFileFormFileInput: HTMLInputElement;
  let commitImportForm: HTMLFormElement;

  const [isNewSession, setIsNewSession] = createSignal(true);
  const [isCreateNewPopperOpen, setIsCreateNewPopperOpen] = createSignal(false);
  const [contents, setContents] = createSignal("");
  const [importFile, setImportFile] = createSignal<File | null>(null);
  const [importFormat, setImportFormat] = createSignal<ImportFormat | null>(
    null
  );
  const [editorMode, setEditorMode] = createSignal<EditorMode>(EditorMode.EDIT);

  const [importCSVDirection, setImportCSVDirection] =
    createSignal<ImportCSVDirection | null>(null);
  const [importCSVDelimiter, setImportCSVDelimiter] =
    createSignal<string>("%20");

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
      importFileModalPage1 &&
      !importFileModalPage1.contains(event.target as Node) &&
      importFileButton &&
      !importFileButton.contains(event.target as Node) &&
      importFileModalPage1.open
    ) {
      importFileModalPage1.close();
    }
  };

  onMount(() => {
    document.addEventListener("click", handleMouseClick);

    importFileModalPage1.addEventListener("click", function (event) {
      var rect = importFileModalPage1.getBoundingClientRect();
      var isInDialog =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!isInDialog) {
        importFileModalPage1.close();
      }
    });

    importFileForm.onsubmit = async (event) => {
      event.preventDefault();

      const files = importFileFormFileInput.files;

      if (files?.length !== 1) {
        return event.preventDefault();
      }

      const metta = await translate(files[0], "Row", "%20");

      setContents(metta);
      importFileModalPage1.close();
      setIsNewSession(false);

      setEditorMode(EditorMode.IMPORT);
    };

    importFileModalPage1.addEventListener("close", function (event) {
      importFileFormFileInput.value = "";
    });

    if (commitImportForm) {
      commitImportForm.onsubmit = async (event) => {
        event.preventDefault();
      };
    }
  });

  return (
    <div class={styles.Page}>
      <div class={styles.Navbar}>
        <span class={styles.NavbarTitle}>MeTTa KG</span>
        <a
          class={styles.NavbarGithubLink}
          href="https://github.com/Qoba-ai/MeTTa-KG"
        >
          <AiOutlineGithub size={24} />
        </a>
        <div class={styles.NavbarContent}>
          <A href="/tokens" class={styles.LoginButton}>
            Tokens
          </A>
        </div>
      </div>
      <div class={styles.ContentWrapper}>
        <div class={styles.MettaInputWrapper}>
          <textarea class={styles.MettaInput} readonly>
            {contents()}
          </textarea>
          <Show when={isNewSession()}>
            <div class={styles.NewSessionDiv}>
              <button
                ref={popperButton!}
                onClick={() => importFileModalPage1.showModal()}
                class={styles.ImportButton}
              >
                <AiOutlineImport color={"white"} size={36} />
                <span>Import</span>
              </button>
            </div>
          </Show>
        </div>
        <Show when={editorMode() === EditorMode.IMPORT}>
          <div class={styles.ImportParametersFormWrapper}>
            <form class={styles.ImportParametersForm} ref={commitImportForm!}>
              <h2>
                Import ({ImportFormat[importFormat() ?? ImportFormat.CSV]})
              </h2>
              <Show when={importFormat() === ImportFormat.CSV}>
                <label>Direction</label>
                <select
                  name="direction"
                  onChange={async (e) => {
                    setImportCSVDirection(e.target.value as ImportCSVDirection);

                    const file = importFile();

                    if (file) {
                      try {
                        const metta = await translate(
                          file,
                          e.target.value as ImportCSVDirection,
                          importCSVDelimiter()
                        );

                        setContents(metta);
                      } catch (e) {
                        toast(
                          `Failed to translate, verify the parameters and try again.`
                        );
                      }
                    }
                  }}
                >
                  <option value={"Row"}>Row</option>
                  <option value={"Column"}>Column</option>
                  <option value={"Cell"}>Cell</option>
                </select>
                <label>Delimiter</label>
                <select
                  name="delimiter"
                  onChange={async (e) => {
                    setImportCSVDelimiter(e.target.value);

                    const file = importFile();
                    const direction = importCSVDirection();

                    if (file && direction) {
                      try {
                        const metta = await translate(
                          file,
                          direction,
                          e.target.value
                        );

                        setContents(metta);
                      } catch (e) {
                        toast(
                          `Failed to translate, verify the parameters and try again.`
                        );
                      }
                    }
                  }}
                >
                  <option value="%20">Space (' ')</option>
                  <option value="%09">Tab ('\t')</option>
                </select>
              </Show>
              <input type="submit" value={"Import"} />
            </form>
          </div>
        </Show>
      </div>
      <dialog ref={importFileModalPage1!} class={styles.ImportCSVModal}>
        <form ref={importFileForm!}>
          <h2>Select File</h2>
          <p>The following formats are supported:</p>
          <ul>
            <li>CSV (.csv)</li>
            <li>N3 (.nt3)</li>
            <li>JSON-LD (.jsonld)</li>
            <li>N-Triples (.nt)</li>
          </ul>
          <p>
            Files with extensions other than the ones listed above will not be
            recognized.
          </p>
          <input
            ref={importFileFormFileInput!}
            type="file"
            required
            onchange={(e) => {
              if (e.target?.files?.[0]) {
                setImportFile(e.target.files[0]);
                // TODO: support other imported formats
                setImportFormat(ImportFormat.CSV);
              }
            }}
          />
          <div class={styles.ButtonBar}>
            <button
              class={styles.ConfirmButton}
              disabled={importFile() === null}
              onclick={(e) => {}}
            >
              Import
            </button>
            <button
              class={styles.CancelButton}
              onclick={() => importFileModalPage1.close()}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
      <Toaster />
    </div>
  );
};

export default App;
