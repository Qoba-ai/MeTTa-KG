import { Component, createSignal, For, Show } from "solid-js";
import styles from "./Editor.module.scss";
import { VsChevronRight, VsChevronDown, VsSymbolEnum, VsTrash, VsFolderOpened, VsReplace, VsAdd, VsRemove } from "solid-icons/vs";

export interface TrieNode {
  children: { [key: string]: TrieNode };
  isDeletable: boolean;
}

interface TrieExplorerProps {
  content: string;
  onDelete?: (path: string) => void;
  onOpenSubspace?: (path: string) => void;
  onConfigureTransform?: (paths: string[]) => void;
  rootPath?: string;
}

const tokenize = (s: string): string[] => {
  return s.match(/\(|\)|"[^"]*"|[^\s()]+/g) || [];
};

const parseSExprs = (tokens: string[]): any[] => {
  const exprs: any[] = [];
  while (tokens.length > 0) {
    if (tokens[0] === ")") {
      break;
    }
    const token = tokens.shift();
    if (token === "(") {
      exprs.push(parseSExprs(tokens));
      tokens.shift(); // remove ")"
    } else {
      exprs.push(token);
    }
  }
  return exprs;
};

const addToTrie = (node: TrieNode, expr: any) => {
  if (Array.isArray(expr)) {
    if (expr.length === 2) {
      const [left, right] = expr;
      const key = (Array.isArray(left) ? JSON.stringify(left) : String(left)).replace(/^"|"$/g, "");
      if (!node.children[key]) {
        node.children[key] = { children: {}, isDeletable: true };
      }
      addToTrie(node.children[key], right);
    } else {
      for (const item of expr) {
        if (Array.isArray(item)) {
          addToTrie(node, item);
        } else {
          const key = String(item).replace(/^"|"$/g, "");
          if (!node.children[key]) {
            node.children[key] = { children: {}, isDeletable: false };
          }
        }
      }
    }
  } else {
    const key = String(expr).replace(/^"|"$/g, "");
    if (!node.children[key]) {
      node.children[key] = { children: {}, isDeletable: false };
    }
  }
};

export const buildTrie = (content: string): TrieNode => {
  const root: TrieNode = { children: {}, isDeletable: false };
  const tokens = tokenize(content);
  const exprs = parseSExprs(tokens);

  for (const expr of exprs) {
    addToTrie(root, expr);
  }
  return root;
};

const TrieBranch: Component<{ 

    name: string; 

    node: TrieNode; 

    depth: number; 

    path: string;

    onDelete?: (path: string) => void;

    onOpenSubspace?: (path: string) => void;

    isSelected: boolean;

    selectionCount: number;

    onAddSelect: (path: string) => void;

    onRemoveSelect: (path: string) => void;

    onIsSelected: (path: string) => boolean;

    onGetSelectionCount: (path: string) => number;

}> = (props) => {

  const [isOpen, setIsOpen] = createSignal(props.depth <= 0);

  const isLeaf = () => Object.keys(props.node.children).length === 0;



  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    if (props.onDelete) {
        props.onDelete(props.path);
    }
  };

  const handleOpen = (e: MouseEvent) => {
    e.stopPropagation();
    if (props.onOpenSubspace) {
        props.onOpenSubspace(props.path);
    }
  };

  const handleAdd = (e: MouseEvent) => {
    e.stopPropagation();
    if (!isLeaf()) props.onAddSelect(props.path);
  }

  const handleRemove = (e: MouseEvent) => {
    e.stopPropagation();
    if (!isLeaf()) props.onRemoveSelect(props.path);
  }

  return (
    <div style={{ "margin-left": `${props.depth > 0 ? 16 : 0}px` }}>
      <div 
        class={`${styles.TrieNode} ${props.isSelected ? styles.SelectedNode : ""}`} 
        onClick={handleAdd}
        style={{ cursor: isLeaf() ? "default" : "pointer" }}
      >
        <Show when={!isLeaf()} fallback={<div style={{ width: "16px" }} />}>
          <div onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen()); }}>
            {isOpen() ? <VsChevronDown size={14} /> : <VsChevronRight size={14} />}
          </div>
        </Show>
        <VsSymbolEnum size={14} class={isLeaf() ? styles.TrieLeafIcon : styles.TrieBranchIcon} />
        <span class={isLeaf() ? styles.TrieLeafText : styles.TrieBranchText}>{props.name}</span>
        
        <Show when={props.selectionCount > 0}>
            <span style={{ "font-size": "0.7rem", background: "var(--rp-love)", color: "var(--rp-base)", "padding": "0 4px", "border-radius": "4px", "margin-left": "4px" }}>
                {props.selectionCount}
            </span>
        </Show>

        <div class={styles.TrieActions}>
            <Show when={!isLeaf()}>
                <button 
                    class={styles.TrieActionBtn} 
                    onClick={handleAdd}
                    title="Add to selection"
                >
                    <VsAdd size={12} />
                </button>
                <Show when={props.selectionCount > 0}>
                    <button 
                        class={styles.TrieActionBtn} 
                        onClick={handleRemove}
                        title="Remove from selection"
                    >
                        <VsRemove size={12} />
                    </button>
                </Show>
            </Show>
            <Show when={props.onOpenSubspace && !isLeaf()}>
                <button 
                    class={styles.TrieActionBtn} 
                    onClick={handleOpen}
                    title="Open subspace in new tab"
                >
                    <VsFolderOpened size={12} />
                </button>
            </Show>
            <Show when={props.onDelete && props.node.isDeletable}>
                <button 
                    class={`${styles.TrieActionBtn} ${styles.TrieDeleteBtn}`} 
                    onClick={handleDelete}
                    title="Delete subspace"
                >
                    <VsTrash size={12} />
                </button>
            </Show>
        </div>
      </div>


      <Show when={isOpen() && !isLeaf()}>
        <For each={Object.entries(props.node.children)}>
          {([childName, childNode]) => {
            const childPath = `${props.path}${childName}/`;
            return (
              <TrieBranch 
                  name={childName} 
                  node={childNode} 
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
              />
            );
          }}
        </For>
      </Show>
    </div>
  );
};

export const TrieExplorer: Component<TrieExplorerProps> = (props) => {
  const trie = () => buildTrie(props.content);
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
            depth={0} 
            path={rootPath()}
            onDelete={undefined} // Root cannot be deleted
            onOpenSubspace={props.onOpenSubspace}
            isSelected={isSelected(rootPath())}
            selectionCount={getSelectionCount(rootPath())}
            onAddSelect={addSelect}
            onRemoveSelect={removeSelect}
            onIsSelected={isSelected}
            onGetSelectionCount={getSelectionCount}
        />
        <Show when={Object.keys(trie().children).length === 0}>
          <div class={styles.TrieEmpty}>No data to display</div>
        </Show>
      </div>

      <button 
        class={styles.TrieConfigTransform}
        disabled={selectedPaths().length < 2}
        onClick={() => props.onConfigureTransform?.(selectedPaths())}
      >
        <VsReplace size={16} />
        Configure Transformation
      </button>
    </div>
  );
};
