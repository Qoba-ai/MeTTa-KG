import { createStore } from "solid-js/store";
import { batch } from "solid-js";
import type { SpaceNode, ExploreResponse } from "~/lib/space";
import { exploreSpace } from "~/lib/api";
import { formatedNamespace } from "~/lib/state";
import { showToast } from "~/components/ui/Toast";
import { initNodesFromApiResponse } from "~/lib/space";

export interface FlatNode {
  node: SpaceNode;
  id: string;
  depth: number;
}

interface TreeState {
  expandedNodes: Set<string>;
  childrenMap: Map<string, SpaceNode[]>;
  cursorLine: number;
  isExpanding: boolean;
}

const [state, setState] = createStore<TreeState>({
  expandedNodes: new Set(),
  childrenMap: new Map(),
  cursorLine: 0,
  isExpanding: false,
});

// Scroll position tracking (outside store to avoid reactivity overhead)
let scrollRef: HTMLDivElement | null = null;
let savedScrollTop = 0;

const saveScroll = () => {
  if (scrollRef) savedScrollTop = scrollRef.scrollTop;
};

const restoreScroll = () => {
  queueMicrotask(() => {
    if (scrollRef) scrollRef.scrollTop = savedScrollTop;
  });
};

// Helper
const getNodeId = (node: SpaceNode) =>
  node.remoteData.token
    ? Array.from(node.remoteData.token).join(",")
    : node.label;

const isExpandable = (node: SpaceNode) => {
  const token = node.remoteData.token;
  if (!token || token.length === 0) return false;
  if (token.length === 1 && token[0] === -1) return false;
  return !Array.from(token).every((val) => val === -1);
};

// Flattening logic
const createFlattenedNodes = (
  data: { nodes: SpaceNode[]; prefix: string[] },
  expanded: Set<string>,
  children: Map<string, SpaceNode[]>
): FlatNode[] => {
  const result: FlatNode[] = [];
  const visited = new Set<string>();

  const addNode = (node: SpaceNode, depth: number, path: string) => {
    if (visited.has(path)) return;
    visited.add(path);
    result.push({ node, id: path, depth });

    if (expanded.has(path) && children.has(path)) {
      children.get(path)!.forEach((child, index) => {
        addNode(child, depth + 1, `${path}/${getNodeId(child)}#${index}`);
      });
    }
  };

  data.nodes.forEach((node, index) => {
    addNode(node, 0, `${getNodeId(node)}#${index}`);
  });

  return result;
};

// Pull-up logic for duplicate expressions
const pullUpDuplicates = async (
  processedData: { nodes: SpaceNode[]; prefix: string[] },
  parentExpr: string,
  pattern: string
): Promise<{ nodes: SpaceNode[]; prefix: string[] }> => {
  const MAX_DEPTH = 100;
  let result = processedData;
  let depth = 0;

  while (
    depth < MAX_DEPTH &&
    result.nodes.length > 0 &&
    result.nodes[0].remoteData.expr === parentExpr
  ) {
    const remainingSiblings = result.nodes.slice(1);
    const currentCount = remainingSiblings.length;

    try {
      const response = await exploreSpace(
        formatedNamespace(),
        pattern,
        result.nodes[0].remoteData.token
      );
      const parsed = JSON.parse(response) as ExploreResponse[];
      const grandchildren = initNodesFromApiResponse(parsed, parentExpr);

      if (grandchildren.nodes.length === 0) {
        return { nodes: remainingSiblings, prefix: result.prefix };
      }

      result = {
        nodes: [...grandchildren.nodes, ...remainingSiblings],
        prefix: result.prefix,
      };

      if (result.nodes.length <= currentCount) break;
    } catch {
      return { nodes: remainingSiblings, prefix: result.prefix };
    }
    depth++;
  }

  return result;
};

// Store actions
export const treeStore = {
  // Getters
  get expandedNodes() {
    return state.expandedNodes;
  },
  get childrenMap() {
    return state.childrenMap;
  },
  get cursorLine() {
    return state.cursorLine;
  },
  get isExpanding() {
    return state.isExpanding;
  },

  // Helpers exposed for components
  getNodeId,
  isExpandable,
  createFlattenedNodes: (data: { nodes: SpaceNode[]; prefix: string[] }) =>
    createFlattenedNodes(data, state.expandedNodes, state.childrenMap),

  // Register scroll element
  setScrollRef(ref: HTMLDivElement | null) {
    scrollRef = ref;
  },

  // Mutations
  setExpanding(value: boolean) {
    setState("isExpanding", value);
  },

  setCursor(line: number) {
    setState("cursorLine", line);
  },

  reset() {
    setState({
      expandedNodes: new Set(),
      childrenMap: new Map(),
      cursorLine: 0,
      isExpanding: false,
    });
    savedScrollTop = 0;
  },

  expandAll() {
    saveScroll();
    const allExpandable = new Set<string>();
    for (const [id, children] of state.childrenMap.entries()) {
      if (children.length > 0) allExpandable.add(id);
    }
    setState("expandedNodes", allExpandable);
    restoreScroll();
  },

  collapseToRoot() {
    saveScroll();
    setState("expandedNodes", new Set());
    restoreScroll();
  },

  // Async actions
  async toggleNode(
    flatNode: FlatNode,
    pattern: string,
    onNodeClick?: (node: SpaceNode) => void
  ) {
    const { node, id: nodePath } = flatNode;

    saveScroll();

    // Collapse if expanded
    if (state.expandedNodes.has(nodePath)) {
      setState("expandedNodes", (prev) => {
        const next = new Set(prev);
        next.delete(nodePath);
        return next;
      });
      restoreScroll();
      return;
    }

    // Non-expandable: trigger click callback
    if (!isExpandable(node)) {
      onNodeClick?.(node);
      return;
    }

    // Fetch children
    try {
      const response = await exploreSpace(
        formatedNamespace(),
        pattern,
        node.remoteData.token
      );
      const parsed = JSON.parse(response) as ExploreResponse[];

      if (parsed?.length > 0) {
        let processedData = initNodesFromApiResponse(
          parsed,
          node.remoteData.expr
        );
        processedData = await pullUpDuplicates(
          processedData,
          node.remoteData.expr,
          pattern
        );

        batch(() => {
          setState("childrenMap", (prev) =>
            new Map(prev).set(nodePath, processedData.nodes)
          );
          setState("expandedNodes", (prev) => new Set(prev).add(nodePath));
        });
      } else {
        setState("childrenMap", (prev) => new Map(prev).set(nodePath, []));
      }
    } catch (error) {
      if (error instanceof Error && error.message === "noRootToken") {
        showToast({
          title: "Token Not Set",
          description: "Please set the token in the Tokens page.",
          variant: "destructive",
        });
      } else {
        showToast({
          title: "Error",
          description: `Failed to expand node: ${error}`,
          variant: "destructive",
        });
      }
    }

    restoreScroll();
  },

  async expandToFillViewport(
    targetCount: number,
    pattern: string,
    getFlattenedNodes: () => FlatNode[]
  ) {
    saveScroll();

    const BATCH_SIZE = 5;
    let currentCount = getFlattenedNodes().length;
    let staleAttempts = 0;

    while (currentCount < targetCount && staleAttempts < 10) {
      const nodesToExpand = getFlattenedNodes()
        .filter(
          (fn) => isExpandable(fn.node) && !state.expandedNodes.has(fn.id)
        )
        .slice(0, BATCH_SIZE);

      if (nodesToExpand.length === 0) break;

      const results = await Promise.allSettled(
        nodesToExpand.map(async (n) => {
          const response = await exploreSpace(
            formatedNamespace(),
            pattern,
            n.node.remoteData.token
          );
          return { node: n, parsed: JSON.parse(response) as ExploreResponse[] };
        })
      );

      const successful = results
        .filter((r) => r.status === "fulfilled")
        .map(
          (r) =>
            (
              r as PromiseFulfilledResult<{
                node: FlatNode;
                parsed: ExploreResponse[];
              }>
            ).value
        );

      if (successful.length === 0) {
        staleAttempts++;
        continue;
      }

      const newChildren = new Map(state.childrenMap);
      const newExpanded = new Set(state.expandedNodes);

      for (const { node: flatNode, parsed } of successful) {
        if (parsed?.length > 0) {
          let processedData = initNodesFromApiResponse(
            parsed,
            flatNode.node.remoteData.expr
          );
          processedData = await pullUpDuplicates(
            processedData,
            flatNode.node.remoteData.expr,
            pattern
          );
          newChildren.set(flatNode.id, processedData.nodes);
        } else {
          newChildren.set(flatNode.id, []);
        }
        newExpanded.add(flatNode.id);
      }

      batch(() => {
        setState("childrenMap", newChildren);
        setState("expandedNodes", newExpanded);
      });

      const newCount = getFlattenedNodes().length;
      staleAttempts = newCount === currentCount ? staleAttempts + 1 : 0;
      currentCount = newCount;
    }

    restoreScroll();
  },
};
