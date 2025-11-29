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
  expandingNodeId: string | null;
  namespace: string;
  initialExpansionDone: boolean;
}

const [state, setState] = createStore<TreeState>({
  expandedNodes: new Set(),
  childrenMap: new Map(),
  cursorLine: 0,
  isExpanding: false,
  expandingNodeId: null,
  namespace: "",
  initialExpansionDone: false,
});

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

const fetchChildrenNodes = async (node: SpaceNode, pattern: string) => {
  const response = await exploreSpace(
    formatedNamespace(),
    pattern,
    node.remoteData.token
  );
  const parsed = JSON.parse(response) as ExploreResponse[];

  if (parsed?.length > 0) {
    let processedData = initNodesFromApiResponse(parsed, node.remoteData.expr);
    processedData = await pullUpDuplicates(
      processedData,
      node.remoteData.expr,
      pattern
    );
    return processedData.nodes;
  }
  return [];
};

const fetchChildrenBatch = async (
  items: { id: string; node: SpaceNode }[],
  pattern: string
) => {
  const results = await Promise.allSettled(
    items.map(async (item) => {
      const children = await fetchChildrenNodes(item.node, pattern);
      return { id: item.id, children };
    })
  );

  return results
    .filter((r) => r.status === "fulfilled")
    .map(
      (r) =>
        (r as PromiseFulfilledResult<{ id: string; children: SpaceNode[] }>)
          .value
    );
};

export const treeStore = {
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
  get expandingNodeId() {
    return state.expandingNodeId;
  },
  get namespace() {
    return state.namespace;
  },
  get initialExpansionDone() {
    return state.initialExpansionDone;
  },

  saveScroll,
  restoreScroll,

  getNodeId,
  isExpandable,
  createFlattenedNodes: (data: { nodes: SpaceNode[]; prefix: string[] }) =>
    createFlattenedNodes(data, state.expandedNodes, state.childrenMap),

  setScrollRef(ref: HTMLDivElement | null) {
    scrollRef = ref;
  },
  setExpanding(value: boolean) {
    setState("isExpanding", value);
  },
  setCursor(line: number) {
    setState("cursorLine", line);
  },
  setNamespace(ns: string) {
    setState("namespace", ns);
  },

  reset() {
    setState({
      expandedNodes: new Set(),
      childrenMap: new Map(),
      cursorLine: 0,
      isExpanding: false,
      expandingNodeId: null,
      namespace: "",
      initialExpansionDone: false,
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

  async toggleNode(
    flatNode: FlatNode,
    pattern: string,
    onNodeClick?: (node: SpaceNode) => void
  ) {
    const { node, id: nodePath } = flatNode;
    saveScroll();

    if (state.expandedNodes.has(nodePath)) {
      setState("expandedNodes", (prev) => {
        const next = new Set(prev);
        next.delete(nodePath);
        return next;
      });
      restoreScroll();
      return;
    }

    if (!isExpandable(node)) {
      onNodeClick?.(node);
      return;
    }

    try {
      const children = await fetchChildrenNodes(node, pattern);
      batch(() => {
        setState("childrenMap", (prev) =>
          new Map(prev).set(nodePath, children)
        );
        setState("expandedNodes", (prev) => new Set(prev).add(nodePath));
      });
    } catch (error) {
      const msg =
        error instanceof Error && error.message === "noRootToken"
          ? "Please set the token in the Tokens page."
          : `Failed to expand node: ${error}`;
      showToast({ title: "Error", description: msg, variant: "destructive" });
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

      const successful = await fetchChildrenBatch(
        nodesToExpand.map((n) => ({ id: n.id, node: n.node })),
        pattern
      );

      if (successful.length === 0) {
        staleAttempts++;
        continue;
      }

      const newChildren = new Map(state.childrenMap);
      const newExpanded = new Set(state.expandedNodes);

      for (const { id, children } of successful) {
        newChildren.set(id, children);
        newExpanded.add(id);
      }

      batch(() => {
        setState("childrenMap", newChildren);
        setState("expandedNodes", newExpanded);
      });

      const newCount = getFlattenedNodes().length;
      staleAttempts = newCount === currentCount ? staleAttempts + 1 : 0;
      currentCount = newCount;
    }

    setState("initialExpansionDone", true);

    restoreScroll();
  },

  async expandToLeaf(flatNode: FlatNode, pattern: string) {
    const { node, id: startPath } = flatNode;
    if (state.expandingNodeId) return;

    setState("expandingNodeId", startPath);
    saveScroll();

    const newChildrenMap = new Map<string, SpaceNode[]>();
    const newExpandedSet = new Set<string>();

    try {
      const queue: { id: string; node: SpaceNode }[] = [
        { id: startPath, node },
      ];
      let count = 0;
      const MAX_NODES = 1000;
      const CONCURRENT_BATCH_SIZE = 5;

      while (queue.length > 0 && count < MAX_NODES) {
        const batchItems = queue.splice(0, CONCURRENT_BATCH_SIZE);

        const itemsToFetch = batchItems.filter((item) => {
          if (!isExpandable(item.node)) return false;

          const hasChildren =
            state.childrenMap.has(item.id) || newChildrenMap.has(item.id);

          if (hasChildren) {
            const children =
              state.childrenMap.get(item.id) ||
              newChildrenMap.get(item.id) ||
              [];
            newExpandedSet.add(item.id);
            children.forEach((child, idx) => {
              queue.push({
                id: `${item.id}/${getNodeId(child)}#${idx}`,
                node: child,
              });
            });
            return false;
          }
          return true;
        });

        if (itemsToFetch.length === 0) continue;

        const successful = await fetchChildrenBatch(itemsToFetch, pattern);

        for (const { id, children } of successful) {
          newChildrenMap.set(id, children);
          newExpandedSet.add(id);
          count++;

          children.forEach((child, idx) => {
            queue.push({ id: `${id}/${getNodeId(child)}#${idx}`, node: child });
          });
        }
      }

      if (count >= MAX_NODES) {
        showToast({
          title: "Expansion Limit",
          description: "Stopped expanding after 1000 nodes.",
        });
      }

      batch(() => {
        if (newChildrenMap.size > 0) {
          setState("childrenMap", (prev) => {
            const next = new Map(prev);
            for (const [key, val] of newChildrenMap) next.set(key, val);
            return next;
          });
        }
        if (newExpandedSet.size > 0) {
          setState("expandedNodes", (prev) => {
            const next = new Set(prev);
            for (const key of newExpandedSet) next.add(key);
            return next;
          });
        }
      });
    } catch (e) {
      showToast({
        title: "Expansion Error",
        description: `Failed to expand recursively.\n ${e}`,
        variant: "destructive",
      });
    } finally {
      setState("expandingNodeId", null);
      restoreScroll();
    }
  },
};
