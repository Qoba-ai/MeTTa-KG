import { Component, createSignal, createEffect, For, Show } from "solid-js";
import styles from "./NamespaceSelector.module.scss";
import { VsFolder } from "solid-icons/vs";
import { handleAutoClose } from "../../lib/editorUtils";

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
  let itemRefs: (HTMLDivElement | undefined)[] = [];

  createEffect(() => {
    const idx = exploreFocusIndex();
    if (idx >= 0) itemRefs[idx]?.scrollIntoView({ block: "nearest" });
  });

  // Fetch suggestions for a given value. When the user is mid-segment (path
  // doesn't end with "/"), query the parent directory and filter client-side so
  // that e.g. "/h" or "/ho" still surfaces "/home/".
  const fetchSuggestions = async (val: string): Promise<any[]> => {
    if (val.endsWith("/")) {
      return props.fetchExploreResults(val);
    }
    const lastSlash = val.lastIndexOf("/");
    const parentPath = lastSlash >= 0 ? val.slice(0, lastSlash + 1) : "/";
    const results = await props.fetchExploreResults(parentPath);
    return results.filter((r: any) =>
      (r.path as string).toLowerCase().startsWith(val.toLowerCase())
    );
  };

  const handleInput = async (e: any) => {
    let val = e.target.value;
    if (val === "" || !val.startsWith("/")) {
      val = "/" + val.replace(/^\/+/, "");
    }
    props.onInput(val);
    setIsExploring(true);
    setExploreFocusIndex(-1);
    const results = await fetchSuggestions(val);
    setExploreResults(results);
  };

  const handleFocus = async () => {
    setIsExploring(true);
    setExploreFocusIndex(-1);
    const results = await fetchSuggestions(props.value);
    setExploreResults(results);
  };

  const handleBlur = () => {
    setTimeout(() => setIsExploring(false), 200);
  };

  const navigateUp = async () => {
    const val = props.value;
    const trimmed = val.endsWith("/") ? val.slice(0, -1) : val;
    const lastSlash = trimmed.lastIndexOf("/");
    const parent = lastSlash >= 0 ? trimmed.slice(0, lastSlash + 1) : "/";
    props.onInput(parent);
    setExploreFocusIndex(-1);
    const results = await props.fetchExploreResults(parent);
    setExploreResults(results);
  };

  const navigateInto = async (path: string) => {
    const target = path.endsWith("/") ? path : path + "/";
    props.onInput(target);
    setExploreFocusIndex(-1);
    const results = await props.fetchExploreResults(target);
    setExploreResults(results);
    setIsExploring(true);
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
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      navigateUp();
    } else if (e.key === "Tab" || e.key === "ArrowRight") {
      e.preventDefault();
      const idx = exploreFocusIndex();
      if (idx >= 0 && idx < exploreResults().length) {
        navigateInto(exploreResults()[idx].path);
      } else {
        navigateInto(props.value);
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
                ref={el => itemRefs[index()] = el}
                class={`${styles.ExploreItem} ${
                  exploreFocusIndex() === index() ? styles.ExploreItemFocused : ""
                }`}
                onClick={() => {
                  props.onInput(res.path);
                  setIsExploring(false);
                  props.onCommit?.();
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
