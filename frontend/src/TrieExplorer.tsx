import { Component, createSignal, createMemo, For, Show } from "solid-js";
import styles from "./Editor.module.scss";
import { VsChevronRight, VsChevronDown, VsSymbolEnum, VsTrash, VsFolderOpened, VsReplace, VsAdd, VsRemove, VsArrowDown } from "solid-icons/vs";

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
  focusTokens?: () => Map<string, string[]>;
  onLoadMore?: (path: string) => void;
  onNodeClick?: (expression: string) => void;
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

const TerminalLeaf: Component<{ value: string; depth?: number; onNodeClick?: (expression: string) => void }> = (props) => {
  const depth = props.depth || 0;

  const handleClick = () => {
    console.log('TerminalLeaf clicked:', props.value);
    if (props.onNodeClick) {
      props.onNodeClick(props.value);
    }
  };

  return (
    <div style={{
      "margin-left": `${depth > 0 ? 24 : 0}px`,
      "border-left": depth > 0 ? "2px solid var(--rp-highlight-low)" : "none",
      "padding-left": depth > 0 ? "8px" : "0"
    }}>
      <div style={{ "margin-left": "16px" }}>
        <div
          class={styles.TrieNode}
          onClick={handleClick}
          style={{ cursor: "pointer" }}
        >
          <div style={{ width: "16px" }} />
          <VsSymbolEnum size={16} class={styles.TrieLeafIcon} />
          <span class={styles.TrieLeafText}>
            {props.value}
          </span>
        </div>
      </div>
    </div>
  );
};

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
    focusTokens?: () => Map<string, string[]>;
    onLoadMore?: (path: string) => void;
    onNodeClick?: (expression: string) => void;
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

  const handleNodeClick = () => {
    console.log('TrieBranch handleNodeClick called', props.path, props.onNodeClick);
    if (props.onNodeClick && props.path) {
      // Reconstruct the expression from the path
      // Path looks like "/a/b/c/", we want "(a (b (c ...)))"
      const pathParts = props.path.split('/').filter(p => p.length > 0);
      console.log('Path parts:', pathParts);
      if (pathParts.length > 0) {
        // Build nested expression
        let expr = pathParts[pathParts.length - 1];
        for (let i = pathParts.length - 2; i >= 0; i--) {
          expr = `(${pathParts[i]} ${expr})`;
        }
        console.log('Calling onNodeClick with expression:', expr);
        props.onNodeClick(expr);
      }
    }
  };

  const hasMoreToLoad = () => {
    if (!props.focusTokens) return false;
    const tokens = props.focusTokens();
    const pathNormalized = props.path.endsWith('/') ? props.path : props.path + '/';
    const tokensForPath = tokens.get(pathNormalized) || [];
    return tokensForPath.length > 0;
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
    <div style={{
      "margin-left": `${props.depth > 0 ? 24 : 0}px`,
      "border-left": props.depth > 0 ? "2px solid var(--rp-highlight-low)" : "none",
      "padding-left": props.depth > 0 ? "8px" : "0"
    }}>
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
            style={{ cursor: "pointer" }}
          >
            {isOpen() ? <VsChevronDown size={18} /> : <VsChevronRight size={18} />}
          </div>
        </Show>
        <VsSymbolEnum size={16} class={isLeaf() ? styles.TrieLeafIcon : styles.TrieBranchIcon} />
        <span class={isLeaf() ? styles.TrieLeafText : styles.TrieBranchText}>
          {props.name}
        </span>

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
          <Show when={hasMoreToLoad() && props.onLoadMore}>
            <button
              class={styles.TrieActionBtn}
              onClick={(e) => {
                e.stopPropagation();
                props.onLoadMore?.(props.path);
              }}
              title="Load more expressions"
            >
              <VsArrowDown size={14} />
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
                focusTokens={props.focusTokens}
                onLoadMore={props.onLoadMore}
                onNodeClick={props.onNodeClick}
              />
              </Show>
            );
          }}
        </For>

        {/* Terminal (leaf) values at this node */}
        <For each={props.node.terminals}>
          {(terminal) => <TerminalLeaf value={terminal} depth={props.depth + 1} onNodeClick={props.onNodeClick} />}
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
      <h3>
        <span>Trie Explorer</span>
        <Show when={selectedPaths().length > 0}>
          <button
            class={styles.TrieActionBtn}
            onClick={clearSelection}
            title="Clear all selections"
            style={{ color: "var(--rp-love)", padding: "4px 8px", background: "var(--rp-highlight-low)", "margin-left": "auto" }}
          >
            Clear ({selectedPaths().length})
          </button>
        </Show>
      </h3>
      <div class={styles.TrieContent}>
        {/* Render children directly without root wrapper */}
        <For each={
          Array.from(new Set([
            ...Object.keys(trie().children),
            ...(originalTrie() ? Object.keys(originalTrie().children) : [])
          ])).sort()
        }>
          {(childName) => {
            const childPath = `${rootPath()}${childName}/`;
            return (
              <Show when={trie().children[childName] || originalTrie()?.children?.[childName]}>
                <TrieBranch
                  name={childName}
                  node={trie().children[childName] || originalTrie()!.children[childName]}
                  originalNode={originalTrie()?.children?.[childName]}
                  diffState={
                    (trie().children[childName] && !originalTrie()?.children?.[childName]) ? "added" :
                    (!trie().children[childName] && originalTrie()?.children?.[childName]) ? "removed" :
                    (trie().children[childName] && originalTrie()?.children?.[childName] && (
                      Object.keys(trie().children[childName].children).length !== Object.keys(originalTrie()!.children[childName].children).length ||
                      trie().children[childName].terminals.length !== originalTrie()!.children[childName].terminals.length
                    )) ? "modified" : "unchanged"
                  }
                  depth={0}
                  path={childPath}
                  onDelete={props.onDelete}
                  onOpenSubspace={props.onOpenSubspace}
                  isSelected={isSelected(childPath)}
                  selectionCount={getSelectionCount(childPath)}
                  onAddSelect={addSelect}
                  onRemoveSelect={removeSelect}
                  onIsSelected={isSelected}
                  onGetSelectionCount={getSelectionCount}
                  collapsedPaths={props.collapsedPaths}
                  onCollapse={props.onCollapse}
                  onExpand={props.onExpand}
                  focusTokens={props.focusTokens}
                  onLoadMore={props.onLoadMore}
                  onNodeClick={props.onNodeClick}
                />
              </Show>
            );
          }}
        </For>

        {/* Render terminal values at root level */}
        <For each={trie().terminals}>
          {(terminal) => <TerminalLeaf value={terminal} onNodeClick={props.onNodeClick} />}
        </For>

        {/* Show "Load More" button at root level if needed */}
        <Show when={(() => {
          if (!props.focusTokens) return false;
          const tokens = props.focusTokens();
          const pathNormalized = rootPath().endsWith('/') ? rootPath() : rootPath() + '/';
          const tokensForPath = tokens.get(pathNormalized) || [];
          return tokensForPath.length > 0;
        })()}>
          <div style={{ "margin-top": "8px" }}>
            <button
              class={styles.TrieLoadMoreBtn}
              onClick={() => props.onLoadMore?.(rootPath())}
              title="Load more expressions"
            >
              Load More...
            </button>
          </div>
        </Show>

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
