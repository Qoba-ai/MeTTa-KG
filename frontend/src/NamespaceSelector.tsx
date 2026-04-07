import { Component, createSignal, For, Show, onCleanup } from "solid-js";
import styles from "./Editor.module.scss";
import { VsFolder } from "solid-icons/vs";
import { handleAutoClose } from "./utils/editorUtils";

interface NamespaceSelectorProps {
  value: string;
  onInput: (val: string) => void;
  onCommit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  fetchExploreResults: (path: string) => Promise<any[]>;
}

export const NamespaceSelector: Component<NamespaceSelectorProps> = (props) => {
  const [isExploring, setIsExploring] = createSignal(false);
  const [exploreResults, setExploreResults] = createSignal<any[]>([]);
  const [exploreFocusIndex, setExploreFocusIndex] = createSignal(-1);
  let inputRef: HTMLInputElement | undefined;

  const handleInput = async (e: any) => {
    let val = e.target.value;
    if (val === "" || !val.startsWith("/")) {
      val = "/" + val.replace(/^\/+/, "");
    }
    props.onInput(val);
    setIsExploring(true);
    setExploreFocusIndex(-1);
    const results = await props.fetchExploreResults(val);
    setExploreResults(results);
  };

  const handleFocus = async () => {
    setIsExploring(true);
    setExploreFocusIndex(-1);
    const results = await props.fetchExploreResults(props.value);
    setExploreResults(results);
  };

  const handleBlur = () => {
    setTimeout(() => setIsExploring(false), 200);
  };

  const handleKeyDown = async (e: KeyboardEvent) => {
    handleAutoClose(e);

    if (!isExploring()) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        handleFocus();
      } else if (e.key === "Enter") {
        e.preventDefault();
        props.onCommit?.();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setExploreFocusIndex((prev) =>
        Math.min(prev + 1, exploreResults().length - 1)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setExploreFocusIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Tab" || e.key === "ArrowRight") {
      if (exploreFocusIndex() >= 0 && exploreFocusIndex() < exploreResults().length) {
        e.preventDefault();
        const res = exploreResults()[exploreFocusIndex()];
        props.onInput(res.path);
        setExploreFocusIndex(-1);
        const nextResults = await props.fetchExploreResults(res.path);
        setExploreResults(nextResults);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (exploreFocusIndex() >= 0 && exploreFocusIndex() < exploreResults().length) {
        const res = exploreResults()[exploreFocusIndex()];
        props.onInput(res.path);
      }
      setIsExploring(false);
      setExploreFocusIndex(-1);
      props.onCommit?.();
    }
  };

  return (
    <div class={styles.NamespaceSelector}>
      <input
        ref={inputRef}
        type="text"
        placeholder={props.placeholder || "Namespace"}
        autocomplete="off"
        prop:value={props.value}
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={props.disabled}
      />
      <Show when={isExploring()}>
        <div class={styles.ExploreDropdown}>
          <For each={exploreResults()}>
            {(res, index) => (
              <div
                class={`${styles.ExploreItem} ${
                  exploreFocusIndex() === index() ? styles.ExploreItemFocused : ""
                }`}
                onClick={() => {
                  props.onInput(res.path);
                  setIsExploring(false);
                }}
              >
                <div class={styles.ExploreItemMain}>
                  <VsFolder size={18} class={styles.ExploreIcon} />
                  <span class={styles.ExploreItemPath}>{res.path}</span>
                </div>
                <span class={styles.ExploreItemHint}>{res.expr}</span>
              </div>
            )}
          </For>
          <Show when={exploreResults().length === 0}>
            <div class={styles.ExploreItemEmpty}>No sub-spaces found</div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
