import { Component, createSignal, For, Show } from "solid-js";
import styles from "./Editor.module.scss";
import { VsChevronRight, VsChevronDown, VsSymbolEnum, VsTrash, VsFolderOpened } from "solid-icons/vs";

export interface TrieNode {
  children: { [key: string]: TrieNode };
  isDeletable: boolean;
}

interface TrieExplorerProps {
  content: string;
  onDelete?: (path: string) => void;
  onOpenSubspace?: (path: string) => void;
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

}> = (props) => {

  const [isOpen, setIsOpen] = createSignal(props.depth < 1);

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



  return (

    <div style={{ "margin-left": `${props.depth > 0 ? 16 : 0}px` }}>

      <div 

        class={styles.TrieNode} 

        onClick={() => !isLeaf() && setIsOpen(!isOpen())}

        style={{ cursor: isLeaf() ? "default" : "pointer" }}

      >

        <Show when={!isLeaf()} fallback={<div style={{ width: "16px" }} />}>

          {isOpen() ? <VsChevronDown size={14} /> : <VsChevronRight size={14} />}

        </Show>

        <VsSymbolEnum size={14} class={isLeaf() ? styles.TrieLeafIcon : styles.TrieBranchIcon} />

        <span class={isLeaf() ? styles.TrieLeafText : styles.TrieBranchText}>{props.name}</span>

        

        <div class={styles.TrieActions}>

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
          {([childName, childNode]) => (
            <TrieBranch 
                name={childName} 
                node={childNode} 
                depth={props.depth + 1} 
                path={`${props.path}${childName}/`}
                onDelete={props.onDelete}
                onOpenSubspace={props.onOpenSubspace}
            />
          )}
        </For>
      </Show>
    </div>
  );
};

export const TrieExplorer: Component<TrieExplorerProps> = (props) => {
  const trie = () => buildTrie(props.content);
  const rootPath = () => props.rootPath || "/";

  return (
    <div class={styles.TrieExplorer}>
      <h3>Trie Explorer</h3>
      <div class={styles.TrieContent}>
        <For each={Object.entries(trie().children)}>
          {([name, node]) => (
            <TrieBranch 
                name={name} 
                node={node} 
                depth={0} 
                path={`${rootPath()}${name}/`}
                onDelete={props.onDelete}
                onOpenSubspace={props.onOpenSubspace}
            />
          )}
        </For>
        <Show when={Object.keys(trie().children).length === 0}>
          <div class={styles.TrieEmpty}>No data to display</div>
        </Show>
      </div>
    </div>
  );
};
