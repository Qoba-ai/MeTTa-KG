import { Component, createSignal, createMemo, For, Show } from "solid-js";
import styles from "./Editor.module.scss";
import { VsChevronRight, VsChevronDown, VsSymbolEnum, VsTrash, VsFolderOpened, VsReplace, VsAdd, VsRemove } from "solid-icons/vs";

export interface TrieNode {
  children: { [key: string]: TrieNode };
  terminals: string[];
  isDeletable: boolean;
  isFringe?: boolean;
}

interface TrieExplorerProps {
  content: string;
  originalContent?: string;
  onDelete?: (path: string) => void;
  onOpenSubspace?: (path: string) => void;
  onConfigureTransform?: (paths: string[]) => void;
  rootPath?: string;
  collapsedPaths?: () => Set<string>;
  onCollapse?: (path: string) => void;
  onExpand?: (path: string) => void;
}

const tokenize = (s: string): string[] => {
  return s.match(/\(|\)|"[^"]*"|[^\s()]+/g) || [];
};

const parseSExprs = (tokens: string[]): any[] => {
  let i = 0;
  const parse = (): any[] => {
    const exprs: any[] = [];
    while (i < tokens.length) {
      if (tokens[i] === ")") {
        break;
      }
      const token = tokens[i++];
      if (token === "(") {
        exprs.push(parse());
        i++; // skip ")"
      } else {
        exprs.push(token);
      }
    }
    return exprs;
  };
  return parse();
};

// Stringify any parsed expression back to MeTTa notation.
const exprToString = (expr: any): string => {
  if (Array.isArray(expr)) return `(${expr.map(exprToString).join(' ')})`;
  return String(expr).replace(/^"|"$/g, '');
};

// A 2-ary tuple `(key value)` where key is a plain symbol creates a namespace
// segment. Everything else (scalars, n-ary tuples for n≠2, or 2-ary tuples
// whose first element is itself a complex expression) is a terminal value
// stored on the parent node.
const addToTrie = (node: TrieNode, expr: any) => {
  if (Array.isArray(expr) && expr.length === 2 && !Array.isArray(expr[0])) {
    const key = String(expr[0]).replace(/^"|"$/g, "");
    if (!node.children[key]) {
      node.children[key] = { children: {}, terminals: [], isDeletable: true };
    }
    addToTrie(node.children[key], expr[1]);
  } else {
    const val = exprToString(expr);
    if (val === "|$|") {
      node.isFringe = true;
    } else {
      node.terminals.push(val);
    }
  }
};

export const buildTrie = (content: string): TrieNode => {
  const root: TrieNode = { children: {}, terminals: [], isDeletable: false };
  const tokens = tokenize(content);
  const exprs = parseSExprs(tokens);
  for (const expr of exprs) {
    addToTrie(root, expr);
  }
  return root;
};

const TerminalLeaf: Component<{ value: string }> = (props) => (
  <div style={{ "margin-left": "16px" }}>
    <div class={styles.TrieNode}>
      <div style={{ width: "16px" }} />
      <VsSymbolEnum size={16} class={styles.TrieLeafIcon} />
      <span class={styles.TrieLeafText}>{props.value}</span>
    </div>
  </div>
);

const TrieBranch: Component<{
    name: string;
    node: TrieNode;
    depth: number;
    diffState: "added" | "removed" | "unchanged" | "modified";
    originalNode?: TrieNode;
    path: string;
    onDelete?: (path: string) => void;
    onOpenSubspace?: (path: string) => void;
    isSelected: boolean;
    selectionCount: number;
    onAddSelect: (path: string) => void;
    onRemoveSelect: (path: string) => void;
    onIsSelected: (path: string) => boolean;
    onGetSelectionCount: (path: string) => number;
    collapsedPaths?: () => Set<string>;
    onCollapse?: (path: string) => void;
    onExpand?: (path: string) => void;
}> = (props) => {

  const [localOpen, setLocalOpen] = createSignal(false);
  const isOpen = () => {
    // If it's a fringe node with no actual children (unexplored), it should appear closed
    if (props.node.isFringe && Object.keys(props.node.children).length === 0 && props.node.terminals.length === 0) {
      return false;
    }
    return props.collapsedPaths ? !props.collapsedPaths().has(props.path) : localOpen();
  };

  const toggleOpen = (e: MouseEvent) => {
    e.stopPropagation();
    if (props.onCollapse && props.onExpand) {
      if (isOpen()) props.onCollapse(props.path);
      else props.onExpand(props.path);
    } else {
      setLocalOpen(!localOpen());
    }
  };

  // A node is a leaf only if it has no navigable children AND no terminals, and is not a fringe boundary.
  const isLeaf = () =>
    Object.keys(props.node.children).length === 0 &&
    props.node.terminals.length === 0 &&
    !props.node.isFringe;

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    if (props.onDelete) props.onDelete(props.path);
  };

  const handleOpen = (e: MouseEvent) => {
    e.stopPropagation();
    if (props.onOpenSubspace) props.onOpenSubspace(props.path);
  };

  const handleAdd = (e: MouseEvent) => {
    e.stopPropagation();
    if (!isLeaf()) props.onAddSelect(props.path);
  };

  const handleRemove = (e: MouseEvent) => {
    e.stopPropagation();
    if (!isLeaf()) props.onRemoveSelect(props.path);
  };

  const getBgColor = () => {
    if (props.diffState === "added") return "rgba(156, 207, 216, 0.15)";
    if (props.diffState === "removed") return "rgba(235, 111, 146, 0.15)";
    if (props.diffState === "modified") return "rgba(246, 193, 119, 0.15)";
    return "";
  };

  const getBorderColor = () => {
    if (props.diffState === "added") return "2px solid var(--rp-foam)";
    return "";
  };

  return (
    <div style={{ "margin-left": `${props.depth > 0 ? 16 : 0}px` }}>
      <div
        class={`${styles.TrieNode} ${props.isSelected ? styles.SelectedNode : ""}`}
        style={{
          cursor: "default",
          "background-color": getBgColor(),
          "border-left": getBorderColor(),
          "opacity": props.diffState === "removed" ? 0.6 : 1,
          "text-decoration": props.diffState === "removed" ? "line-through" : "none"
        }}
      >
        <Show when={!isLeaf()} fallback={<div style={{ width: "16px" }} />}>
          <div
            onClick={toggleOpen}
            data-testid="trie-toggle"
            data-trie-path={props.path}
            data-trie-open={isOpen() ? "true" : "false"}
            data-trie-fringe={props.node.isFringe ? "true" : "false"}
          >
            {isOpen() ? <VsChevronDown size={18} /> : <VsChevronRight size={18} />}
          </div>
        </Show>
        <VsSymbolEnum size={16} class={isLeaf() ? styles.TrieLeafIcon : styles.TrieBranchIcon} />
        <span class={isLeaf() ? styles.TrieLeafText : styles.TrieBranchText}>{props.name}</span>

        <Show when={props.selectionCount > 0}>
          <span style={{ "font-size": "0.7rem", background: "var(--rp-love)", color: "var(--rp-base)", "padding": "0 4px", "border-radius": "2px", "margin-left": "4px" }}>
            {props.selectionCount}
          </span>
        </Show>

        <div class={styles.TrieActions}>
          <Show when={props.onOpenSubspace && !isLeaf()}>
            <button
              class={styles.TrieActionBtn}
              onClick={handleOpen}
              title="Open subspace in new tab"
            >
              <VsFolderOpened size={14} />
            </button>
          </Show>
          <Show when={!isLeaf()}>
            <button
              class={styles.TrieActionBtn}
              onClick={handleAdd}
              title="Add to selection"
            >
              <VsAdd size={14} />
            </button>
            <button
              class={`${styles.TrieActionBtn} ${props.selectionCount === 0 ? styles.Hidden : ''}`}
              onClick={handleRemove}
              title="Remove from selection"
            >
              <VsRemove size={14} />
            </button>
          </Show>
          <Show when={props.onDelete && props.node.isDeletable}>
            <button
              class={`${styles.TrieActionBtn} ${styles.TrieDeleteBtn}`}
              onClick={handleDelete}
              title="Delete subspace"
            >
              <VsTrash size={14} />
            </button>
          </Show>
        </div>
      </div>

      <Show when={isOpen() && !isLeaf()}>
        {/* Navigable sub-namespace children */}
        <For each={
          Array.from(new Set([
            ...Object.keys(props.node.children),
            ...(props.originalNode ? Object.keys(props.originalNode.children) : [])
          ])).sort()
        }>
          {(childName) => {
            const childPath = `${props.path}${childName}/`;
            return (
              <Show when={props.node.children[childName] || props.originalNode?.children?.[childName]}>
                <TrieBranch
                  name={childName}
                  node={props.node.children[childName] || props.originalNode!.children[childName]}
                  originalNode={props.originalNode?.children?.[childName]}
                  diffState={
                    (props.node.children[childName] && !props.originalNode?.children?.[childName]) ? "added" :
                    (!props.node.children[childName] && props.originalNode?.children?.[childName]) ? "removed" :
                    (props.node.children[childName] && props.originalNode?.children?.[childName] && (
                      Object.keys(props.node.children[childName].children).length !== Object.keys(props.originalNode!.children[childName].children).length ||
                      props.node.children[childName].terminals.length !== props.originalNode!.children[childName].terminals.length
                    )) ? "modified" : "unchanged"
                  }
                  depth={props.depth + 1}
                  path={childPath}
                  onDelete={props.onDelete}
                onOpenSubspace={props.onOpenSubspace}
                isSelected={props.onIsSelected(childPath)}
                selectionCount={props.onGetSelectionCount(childPath)}
                onAddSelect={props.onAddSelect}
                onRemoveSelect={props.onRemoveSelect}
                onIsSelected={props.onIsSelected}
                onGetSelectionCount={props.onGetSelectionCount}
                collapsedPaths={props.collapsedPaths}
                onCollapse={props.onCollapse}
                onExpand={props.onExpand}
              />
              </Show>
            );
          }}
        </For>

        {/* Terminal (leaf) values at this node */}
        <For each={props.node.terminals}>
          {(terminal) => <TerminalLeaf value={terminal} />}
        </For>

        {/* Fringe indicator - clickable to expand unexplored subspace */}
        <Show when={props.node.isFringe}>
          <div style={{ "margin-left": "16px" }}>
            <div
              class={styles.TrieNode}
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                if (props.onExpand) props.onExpand(props.path);
              }}
              data-testid="trie-fringe"
              data-trie-path={props.path}
            >
              <VsChevronRight size={18} />
              <VsSymbolEnum size={16} class={styles.TrieFringeIcon} />
              <span class={styles.TrieFringeText}>$</span>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
};

export const TrieExplorer: Component<TrieExplorerProps> = (props) => {
  const trie = createMemo(() => buildTrie(props.content));
  const originalTrie = createMemo(() => props.originalContent !== undefined ? buildTrie(props.originalContent) : buildTrie(props.content));
  const rootPath = () => props.rootPath || "/";
  const [selectedPaths, setSelectedPaths] = createSignal<string[]>([]);

  const addSelect = (path: string) => {
    setSelectedPaths(prev => [...prev, path]);
  };

  const removeSelect = (path: string) => {
    setSelectedPaths(prev => {
      const index = prev.lastIndexOf(path);
      if (index !== -1) {
        const next = [...prev];
        next.splice(index, 1);
        return next;
      }
      return prev;
    });
  };

  const clearSelection = () => {
    setSelectedPaths([]);
  };

  const isSelected = (path: string) => selectedPaths().includes(path);
  const getSelectionCount = (path: string) => selectedPaths().filter(p => p === path).length;

  return (
    <div class={styles.TrieExplorer}>
      <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "border-bottom": "1px solid var(--rp-highlight-low)", "padding-bottom": "10px" }}>
        <h3 style={{ border: "none", padding: 0 }}>Trie Explorer</h3>
        <Show when={selectedPaths().length > 0}>
          <button
            class={styles.TrieActionBtn}
            onClick={clearSelection}
            title="Clear all selections"
            style={{ color: "var(--rp-love)", padding: "4px 8px", background: "var(--rp-highlight-low)" }}
          >
            Clear ({selectedPaths().length})
          </button>
        </Show>
      </div>
      <div class={styles.TrieContent}>
        <TrieBranch
          name={rootPath().replace(/^\/|\/$/g, "") || "/"}
          node={trie()}
          originalNode={originalTrie()}
          diffState={"unchanged"}
          depth={0}
          path={rootPath()}
          onDelete={undefined}
          onOpenSubspace={props.onOpenSubspace}
          isSelected={isSelected(rootPath())}
          selectionCount={getSelectionCount(rootPath())}
          onAddSelect={addSelect}
          onRemoveSelect={removeSelect}
          onIsSelected={isSelected}
          onGetSelectionCount={getSelectionCount}
          collapsedPaths={props.collapsedPaths}
          onCollapse={props.onCollapse}
          onExpand={props.onExpand}
        />
        <Show when={Object.keys(trie().children).length === 0 && trie().terminals.length === 0 &&
                    Object.keys(originalTrie().children).length === 0 && originalTrie().terminals.length === 0}>
          <div class={styles.TrieEmpty}>No data to display</div>
        </Show>
      </div>

      <Show when={selectedPaths().length >= 2}>
        <button
          class={styles.TrieConfigTransform}
          onClick={() => props.onConfigureTransform?.(selectedPaths())}
        >
          <VsReplace size={16} />
          Configure Transformation
        </button>
      </Show>
    </div>
  );
};
