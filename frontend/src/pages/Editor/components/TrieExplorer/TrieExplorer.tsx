import { Component, createSignal, createMemo, For, Show, onMount, onCleanup } from "solid-js";
import styles from "./TrieExplorer.module.scss";
import { VsChevronRight, VsChevronDown, VsSymbolEnum, VsTrash, VsFolderOpened, VsReplace } from "solid-icons/vs";

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
  isLoadingMore?: () => boolean;
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

const TerminalLeaf: Component<{
  value: string;
  depth?: number;
  onNodeClick?: (expression: string) => void;
  onDelete?: (value: string) => void;
  shiftPressed: () => boolean;
  treePrefix?: string;
  isLast?: boolean;
}> = (props) => {
  const depth = props.depth || 0;
  const [isHovering, setIsHovering] = createSignal(false);

  const handleDoubleClick = () => {
    console.log('TerminalLeaf double-clicked:', props.value);
    if (props.onNodeClick) {
      props.onNodeClick(props.value);
    }
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    if (props.onDelete) {
      props.onDelete(props.value);
    }
  };

  const showActions = () => isHovering() && props.shiftPressed();

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", "align-items": "center" }}>
        <Show when={depth > 0}>
          <span class={styles.TreePrefix}>{props.treePrefix || ""}{props.isLast ? "└─" : "├─"}</span>
        </Show>
        <div
          class={styles.TrieNode}
          onDblClick={handleDoubleClick}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          style={{ cursor: "pointer", flex: 1 }}
        >
          <div style={{ width: "16px" }} />
          <VsSymbolEnum size={14} class={styles.TrieLeafIcon} />
          <span class={styles.TrieLeafText}>
            {props.value}
          </span>
          <Show when={showActions() && props.onDelete}>
            <div class={styles.TrieActions}>
              <button
                class={`${styles.TrieActionBtn} ${styles.TrieDeleteBtn}`}
                onClick={handleDelete}
                title="Delete terminal"
              >
                <VsTrash size={12} />
              </button>
            </div>
          </Show>
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
  shiftPressed: () => boolean;
  onDeleteTerminal?: (value: string) => void;
  treePrefix?: string;
  isLast?: boolean;
}> = (props) => {

  const [localOpen, setLocalOpen] = createSignal(false);
  const [isHovering, setIsHovering] = createSignal(false);
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
    props.onAddSelect(props.path);
  };

  const handleRemove = (e: MouseEvent) => {
    e.stopPropagation();
    props.onRemoveSelect(props.path);
  };

  const handleDoubleClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (props.onOpenSubspace) {
      props.onOpenSubspace(props.path);
    }
  };

  const handleClick = (e: MouseEvent) => {
    if (props.shiftPressed()) {
      e.stopPropagation();
      // Shift+click toggles selection
      if (props.isSelected) {
        props.onRemoveSelect(props.path);
      } else {
        props.onAddSelect(props.path);
      }
    }
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
    if (props.diffState === "added") return "2px solid var(--foam)";
    return "";
  };

  const showActions = () => isHovering() && props.shiftPressed();

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", "align-items": "center" }}>
        <Show when={props.depth > 0}>
          <span class={styles.TreePrefix}>{props.treePrefix || ""}{props.isLast ? "└─" : "├─"}</span>
        </Show>
        <div
          class={`${styles.TrieNode} ${props.isSelected ? styles.SelectedNode : ""}`}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          onDblClick={handleDoubleClick}
          onClick={handleClick}
          style={{
            cursor: props.shiftPressed() ? "pointer" : "default",
            "background-color": getBgColor(),
            "border-left": getBorderColor(),
            "opacity": props.diffState === "removed" ? 0.6 : 1,
            "text-decoration": props.diffState === "removed" ? "line-through" : "none",
            flex: 1
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
              {isOpen() ? <VsChevronDown size={16} /> : <VsChevronRight size={16} />}
            </div>
          </Show>
          <VsSymbolEnum size={14} class={isLeaf() ? styles.TrieLeafIcon : styles.TrieBranchIcon} />
          <span class={isLeaf() ? styles.TrieLeafText : styles.TrieBranchText}>
            {props.name}
          </span>

          <Show when={props.selectionCount > 0}>
            <span style={{ "font-size": "0.65rem", background: "var(--love)", color: "var(--base)", "padding": "0 3px", "border-radius": "2px", "margin-left": "4px" }}>
              {props.selectionCount}
            </span>
          </Show>

          <Show when={showActions()}>
            <div class={styles.TrieActions}>
              <Show when={props.onOpenSubspace}>
                <button
                  class={styles.TrieActionBtn}
                  onClick={handleOpen}
                  title="Open subspace in new tab"
                >
                  <VsFolderOpened size={12} />
                </button>
              </Show>
              <Show when={props.onDelete}>
                <button
                  class={`${styles.TrieActionBtn} ${styles.TrieDeleteBtn}`}
                  onClick={handleDelete}
                  title="Delete subspace"
                >
                  <VsTrash size={12} />
                </button>
              </Show>
            </div>
          </Show>
        </div>
      </div>

      <Show when={isOpen() && !isLeaf()}>
        <div style={{ width: "100%" }}>
          {/* Navigable sub-namespace children (branches) - always shown first */}
          <For each={
            Array.from(new Set([
              ...Object.keys(props.node.children),
              ...(props.originalNode ? Object.keys(props.originalNode.children) : [])
            ])).sort()
          }>
            {(childName, index) => {
              const childPath = `${props.path}${childName}/`;
              const allBranches = Array.from(new Set([
                ...Object.keys(props.node.children),
                ...(props.originalNode ? Object.keys(props.originalNode.children) : [])
              ])).sort();
              // A child is last only if it's the last branch AND there are no terminals
              const isLastChild = index() === allBranches.length - 1 && props.node.terminals.length === 0;
              const newPrefix = (props.treePrefix || "") + (props.isLast ? "  " : "│ ");

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
                    shiftPressed={props.shiftPressed}
                    onDeleteTerminal={props.onDeleteTerminal}
                    treePrefix={newPrefix}
                    isLast={isLastChild}
                  />
                </Show>
              );
            }}
          </For>

          {/* Terminal (leaf) values at this node - always shown after branches */}
          <For each={props.node.terminals.slice().sort()}>
            {(terminal, index) => {
              const sortedTerminals = props.node.terminals.slice().sort();
              const isLastTerminal = index() === sortedTerminals.length - 1;
              const newPrefix = (props.treePrefix || "") + (props.isLast ? "  " : "│ ");

              return <TerminalLeaf
                value={terminal}
                depth={props.depth + 1}
                onNodeClick={props.onNodeClick}
                onDelete={props.onDeleteTerminal}
                shiftPressed={props.shiftPressed}
                treePrefix={newPrefix}
                isLast={isLastTerminal}
              />;
            }}
          </For>

          {/* Fringe indicator - clickable to expand unexplored subspace */}
          <Show when={props.node.isFringe}>
            <div style={{ width: "100%" }}>
              <div style={{ display: "flex", "align-items": "center" }}>
                <Show when={props.depth >= 0}>
                  <span class={styles.TreePrefix}>{(props.treePrefix || "") + (props.isLast ? "  " : "│ ")}└─</span>
                </Show>
                <div
                  class={styles.TrieNode}
                  style={{ cursor: "pointer", flex: 1 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (props.onExpand) props.onExpand(props.path);
                  }}
                  data-testid="trie-fringe"
                  data-trie-path={props.path}
                >
                  <VsChevronRight size={16} />
                  <VsSymbolEnum size={14} class={styles.TrieFringeIcon} />
                  <span class={styles.TrieFringeText}>$</span>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export const TrieExplorer: Component<TrieExplorerProps> = (props) => {
  const trie = createMemo(() => buildTrie(props.content));
  const originalTrie = createMemo(() => props.originalContent !== undefined ? buildTrie(props.originalContent) : buildTrie(props.content));
  const rootPath = () => props.rootPath || "/";
  const [selectedPaths, setSelectedPaths] = createSignal<string[]>([]);
  const [shiftPressed, setShiftPressed] = createSignal(false);
  const [loadingPaths, setLoadingPaths] = createSignal<Set<string>>(new Set());
  const [lastLoadedTokens, setLastLoadedTokens] = createSignal<Map<string, string>>(new Map());

  let trieContentRef: HTMLDivElement | undefined;
  let scrollCheckTimeout: number | undefined;

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftPressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Scroll listener for infinite scroll
    const handleScroll = async () => {
      if (!trieContentRef) return;

      // Clear existing timeout
      if (scrollCheckTimeout) {
        clearTimeout(scrollCheckTimeout);
      }

      // Debounce scroll checks
      scrollCheckTimeout = window.setTimeout(async () => {
        const scrollTop = trieContentRef.scrollTop;
        const scrollHeight = trieContentRef.scrollHeight;
        const clientHeight = trieContentRef.clientHeight;

        // Check if we're near the bottom (within 200px)
        if (scrollHeight - scrollTop - clientHeight < 200) {
          const tokens = props.focusTokens?.();
          if (!tokens) return;

          const pathNormalized = rootPath().endsWith('/') ? rootPath() : rootPath() + '/';
          const tokensForPath = tokens.get(pathNormalized) || [];

          // Check if there are tokens and neither the trie nor editor is already loading
          if (tokensForPath.length > 0 && !loadingPaths().has(pathNormalized) && !props.isLoadingMore?.()) {
            // Lock both components immediately
            setLoadingPaths(prev => new Set(prev).add(pathNormalized));

            // Save scroll position before load. The trie is sorted, so new nodes can be
            // inserted anywhere (including above the viewport). Chrome's scroll anchoring
            // would then adjust scrollTop to compensate, keeping distance-from-bottom the
            // same and causing the next check to immediately retrigger. Restoring the saved
            // scrollTop bypasses anchoring: the saved position is now in the middle of the
            // new (longer) content, so distance-from-bottom = height of new content > 200px.
            const savedScrollTop = trieContentRef.scrollTop;

            try {
              await props.onLoadMore?.(rootPath());

              const newTokens = props.focusTokens?.();
              const newTokensForPath = newTokens?.get(pathNormalized) || [];
              const newToken = newTokensForPath[0] || '';
              setLastLoadedTokens(prev => new Map(prev).set(pathNormalized, newToken));
            } catch (e) {
              console.error('Load more failed in tree explorer:', e);
            } finally {
              setLoadingPaths(prev => {
                const next = new Set(prev);
                next.delete(pathNormalized);
                return next;
              });
              // Restore pre-load scroll position after DOM has updated
              requestAnimationFrame(() => {
                if (!trieContentRef) return;
                trieContentRef.scrollTop = savedScrollTop;
              });
            }
          }
        }
      }, 100);
    };

    if (trieContentRef) {
      trieContentRef.addEventListener('scroll', handleScroll);
    }

    onCleanup(() => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (trieContentRef) {
        trieContentRef.removeEventListener('scroll', handleScroll);
      }
      if (scrollCheckTimeout) {
        clearTimeout(scrollCheckTimeout);
      }
    });
  });

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

  const handleDeleteTerminal = (value: string) => {
    // Terminal deletion: just the literal value
    if (props.onDelete) {
      props.onDelete(value);
    }
  };

  return (
    <div class={styles.TrieExplorer}>
      <h3>
        <span>Tree Explorer</span>
        <Show when={selectedPaths().length > 0}>
          <button
            class={styles.TrieActionBtn}
            onClick={clearSelection}
            title="Clear all selections"
            style={{ color: "var(--love)", padding: "4px 8px", background: "var(--highlight-low)", "margin-left": "auto" }}
          >
            Clear ({selectedPaths().length})
          </button>
        </Show>
      </h3>
      <div class={styles.TrieContent} ref={trieContentRef}>
        {/* Render branch nodes first (parents/navigable children) */}
        <For each={
          Array.from(new Set([
            ...Object.keys(trie().children),
            ...(originalTrie() ? Object.keys(originalTrie().children) : [])
          ])).sort()
        }>
          {(childName, index) => {
            const childPath = `${rootPath()}${childName}/`;
            const allBranches = Array.from(new Set([
              ...Object.keys(trie().children),
              ...(originalTrie() ? Object.keys(originalTrie().children) : [])
            ])).sort();
            // Last branch only if there are no terminals after it
            const isLastChild = index() === allBranches.length - 1 && trie().terminals.length === 0;

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
                  shiftPressed={shiftPressed}
                  onDeleteTerminal={handleDeleteTerminal}
                  treePrefix=""
                  isLast={isLastChild}
                />
              </Show>
            );
          }}
        </For>

        {/* Render terminal values at root level - always after branches */}
        <For each={trie().terminals.slice().sort()}>
          {(terminal, index) => {
            const sortedTerminals = trie().terminals.slice().sort();
            const isLastTerminal = index() === sortedTerminals.length - 1;

            return <TerminalLeaf
              value={terminal}
              onNodeClick={props.onNodeClick}
              onDelete={handleDeleteTerminal}
              shiftPressed={shiftPressed}
              treePrefix=""
              isLast={isLastTerminal}
            />;
          }}
        </For>

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
