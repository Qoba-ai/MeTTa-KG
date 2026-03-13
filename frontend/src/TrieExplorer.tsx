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

const addToTrie = (root: TrieNode, expr: any) => {
  if (!Array.isArray(expr)) return;
  
  const isBinary = expr.length === 2;
  const first = expr[0];
  const second = expr[1];

  let current = root;
  
  // Handle first element
  const firstName = Array.isArray(first) ? "[nested]" : String(first);
  if (!current.children[firstName]) {
    current.children[firstName] = { children: {}, isDeletable: false };
  }
  if (isBinary) {
    current.children[firstName].isDeletable = true;
  }
  
  // Recursively handle elements
  if (Array.isArray(first)) {
    addToTrie(root, first); // This might not be perfectly correct for flattening, but we follow the flat trie logic
  }
  
  // The current UI flattens everything. (A (B C)) becomes A -> B -> C.
  // Let's implement that flattening while tracking deletability.
  
  const parts: string[] = [];
  const flatten = (e: any) => {
    if (Array.isArray(e)) {
      e.forEach(flatten);
    } else {
      parts.push(String(e));
    }
  };
  flatten(expr);

  current = root;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!current.children[part]) {
      current.children[part] = { children: {}, isDeletable: false };
    }
    // If this part is the first element of a binary expression, mark it as deletable
    // Note: this is tricky with flattening. 
    // In (A (B C)), A is binary-left. B is also binary-left (inside the nested expr).
    // So both A and B should be deletable.
    current = current.children[part];
  }
};

// Re-implementing addToTrie to correctly handle nested binary-lefts in a flat trie
const processExpr = (root: TrieNode, expr: any) => {
    if (!Array.isArray(expr)) return;
    
    const isBinary = expr.length === 2;
    const first = expr[0];
    
    if (typeof first === 'string') {
        if (!root.children[first]) {
            root.children[first] = { children: {}, isDeletable: false };
        }
        if (isBinary) {
            root.children[first].isDeletable = true;
        }
        
        // If binary, the children of 'first' come from the second element
        if (isBinary) {
            populateChildren(root.children[first], expr[1]);
        } else {
            // If not binary, we still add other elements as children but they won't be "deletable" from here
            for (let i = 1; i < expr.length; i++) {
                populateChildren(root.children[first], expr[i]);
            }
        }
    } else if (Array.isArray(first)) {
        processExpr(root, first);
        for (let i = 1; i < expr.length; i++) {
            processExpr(root, expr[i]);
        }
    }
};

const populateChildren = (node: TrieNode, expr: any) => {
    if (typeof expr === 'string') {
        if (!node.children[expr]) {
            node.children[expr] = { children: {}, isDeletable: false };
        }
    } else if (Array.isArray(expr)) {
        const isBinary = expr.length === 2;
        const first = expr[0];
        if (typeof first === 'string') {
            if (!node.children[first]) {
                node.children[first] = { children: {}, isDeletable: false };
            }
            if (isBinary) node.children[first].isDeletable = true;
            if (isBinary) {
                populateChildren(node.children[first], expr[1]);
            } else {
                for (let i = 1; i < expr.length; i++) {
                    populateChildren(node.children[first], expr[i]);
                }
            }
        } else {
            expr.forEach(child => populateChildren(node, child));
        }
    }
}

export const buildTrie = (content: string): TrieNode => {
  const root: TrieNode = { children: {}, isDeletable: false };
  const tokens = tokenize(content);
  const exprs = parseSExprs(tokens);

  for (const expr of exprs) {
    processExpr(root, expr);
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
