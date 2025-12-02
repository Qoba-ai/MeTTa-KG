import { createSignal, batch } from "solid-js";
import type { SpaceNode, ExploreResponse } from "~/lib/space";
import { exploreSpace } from "~/lib/api";
import { formatedNamespace } from "~/lib/state";
import { showToast } from "~/components/ui/Toast";
import { initNodesFromApiResponse } from "~/lib/space";
import type { FlatNode } from "./ExpressionListItem";

// Global state that persists across navigation
export const [expandedNodes, setExpandedNodes] = createSignal<Set<string>>(
  new Set<string>()
);

export const [childrenMap, setChildrenMap] = createSignal<
  Map<string, SpaceNode[]>
>(new Map());

export const [cursorLine, setCursorLine] = createSignal<number>(0);
export const [isExpanding, setIsExpanding] = createSignal(false);

// Track scroll position to preserve it during expansions
let savedScrollTop = 0;

// Helper functions
export const resetExpandableListState = () => {
  setExpandedNodes(new Set<string>());
  setChildrenMap(new Map());
  setCursorLine(0);
  setIsExpanding(false);
};

export const expandAll = () => {
  const allExpandableIds = new Set<string>();
  const children = childrenMap();
  for (const [id, childNodes] of children.entries()) {
    if (childNodes.length > 0) {
      allExpandableIds.add(id);
    }
  }
  setExpandedNodes(allExpandableIds);
};

export const collapseToRoot = () => setExpandedNodes(new Set<string>());

export const getNodeId = (node: SpaceNode) =>
  node.remoteData.token
    ? Array.from(node.remoteData.token).join(",")
    : node.label;

export const isExpandable = (node: SpaceNode) => {
  if (!node.remoteData.token || node.remoteData.token.length === 0) {
    return false;
  }

  if (node.remoteData.token.length === 1 && node.remoteData.token[0] === -1) {
    return false;
  }

  const allMinusOne = Array.from(node.remoteData.token).every(
    (val) => val === -1
  );
  if (allMinusOne) {
    return false;
  }

  return true;
};

export const createFlattenedNodes = (data: {
  nodes: SpaceNode[];
  prefix: string[];
}): FlatNode[] => {
  const result: FlatNode[] = [];
  const expanded = expandedNodes();
  const children = childrenMap();
  const visited = new Set<string>();

  const addNode = (node: SpaceNode, depth: number, path: string) => {
    if (visited.has(path)) {
      return;
    }
    visited.add(path);

    result.push({ node, id: path, depth });

    if (expanded.has(path) && children.has(path)) {
      const nodeChildren = children.get(path)!;
      nodeChildren.forEach((child, index) => {
        const childPath = `${path}/${getNodeId(child)}#${index}`;
        addNode(child, depth + 1, childPath);
      });
    }
  };

  data.nodes.forEach((node, index) => {
    const rootPath = `${getNodeId(node)}#${index}`;
    addNode(node, 0, rootPath);
  });

  return result;
};

export const toggleNode = async (
  flatNode: FlatNode,
  pattern: string,
  onNodeClick?: (node: SpaceNode) => void,
  scrollRef?: HTMLDivElement
) => {
  const { node, id: nodePath } = flatNode;
  const expanded = expandedNodes();

  // Save scroll position before any state changes
  if (scrollRef) {
    savedScrollTop = scrollRef.scrollTop;
  }

  if (expanded.has(nodePath)) {
    const newExpanded = new Set(expanded);
    newExpanded.delete(nodePath);
    setExpandedNodes(newExpanded);
    queueMicrotask(() => {
      if (scrollRef) {
        scrollRef.scrollTop = savedScrollTop;
      }
    });
    return;
  }

  if (!isExpandable(node)) {
    onNodeClick?.(node);
    return;
  }

  try {
    const response = await exploreSpace(
      formatedNamespace(),
      pattern,
      node.remoteData.token
    );

    const parsed = JSON.parse(response) as ExploreResponse[];

    if (parsed && parsed.length > 0) {
      let processedData = initNodesFromApiResponse(
        parsed,
        node.remoteData.expr
      );

      let pullUpDepth = 0;
      const MAX_PULL_UP_DEPTH = 100;
      while (
        pullUpDepth < MAX_PULL_UP_DEPTH &&
        processedData.nodes.length > 0 &&
        processedData.nodes[0].remoteData.expr === node.remoteData.expr
      ) {
        const remainingSiblings = processedData.nodes.slice(1);
        const currentChildCount = remainingSiblings.length;

        try {
          const token = processedData.nodes[0].remoteData.token;
          const duplicateChildResponse = await exploreSpace(
            formatedNamespace(),
            pattern,
            token
          );
          const parsed = JSON.parse(
            duplicateChildResponse
          ) as ExploreResponse[];
          const grandchildren = initNodesFromApiResponse(
            parsed,
            node.remoteData.expr
          );

          if (grandchildren.nodes.length === 0) {
            processedData = {
              nodes: remainingSiblings,
              prefix: processedData.prefix,
            };
            break;
          }

          processedData = {
            nodes: [...grandchildren.nodes, ...remainingSiblings],
            prefix: processedData.prefix,
          };

          if (processedData.nodes.length <= currentChildCount) {
            break;
          }
        } catch {
          processedData = {
            nodes: remainingSiblings,
            prefix: processedData.prefix,
          };
          break;
        }

        pullUpDepth++;
      }

      if (processedData.nodes.length > 0) {
        setChildrenMap(
          new Map(childrenMap()).set(nodePath, processedData.nodes)
        );
        setExpandedNodes(new Set(expanded).add(nodePath));
      } else {
        setChildrenMap(new Map(childrenMap()).set(nodePath, []));
      }
    } else {
      setChildrenMap(new Map(childrenMap()).set(nodePath, []));
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
        description: `An error occurred expanding the node. \n ${error}`,
        variant: "destructive",
      });
    }
  }
  queueMicrotask(() => {
    if (scrollRef) {
      scrollRef.scrollTop = savedScrollTop;
    }
  });
};

export const expandToFillViewport = async (
  targetCount: number,
  pattern: string,
  getFlattenedNodes: () => FlatNode[]
) => {
  setIsExpanding(true);
  const BATCH_SIZE = 5;
  const MAX_PULL_UP_DEPTH = 100;

  let currentCount = getFlattenedNodes().length;
  let attemptsWithoutProgress = 0;
  const maxAttemptsWithoutProgress = 10;

  while (
    currentCount < targetCount &&
    attemptsWithoutProgress < maxAttemptsWithoutProgress
  ) {
    const currentFlattened = getFlattenedNodes();
    const nodesToExpand = currentFlattened
      .filter((fn) => isExpandable(fn.node) && !expandedNodes().has(fn.id))
      .slice(0, BATCH_SIZE);

    if (nodesToExpand.length === 0) {
      break;
    }

    // Prepare parallel fetches
    const fetchPromises = nodesToExpand.map(async (nodeToExpand) => {
      const token = nodeToExpand.node.remoteData.token;
      const response = await exploreSpace(formatedNamespace(), pattern, token);
      const parsed = JSON.parse(response) as ExploreResponse[];
      return { nodeToExpand, parsed };
    });

    const results = await Promise.allSettled(fetchPromises);
    const successfulResults = results
      .filter((r) => r.status === "fulfilled")
      .map(
        (r) =>
          (
            r as PromiseFulfilledResult<{
              nodeToExpand: FlatNode;
              parsed: ExploreResponse[];
            }>
          ).value
      );

    if (successfulResults.length === 0) {
      attemptsWithoutProgress++;
      continue;
    }

    const newChildrenMap = new Map(childrenMap());
    const newExpandedNodes = new Set(expandedNodes());

    for (const { nodeToExpand, parsed } of successfulResults) {
      if (parsed?.length > 0) {
        let processedData = initNodesFromApiResponse(
          parsed,
          nodeToExpand.node.remoteData.expr
        );

        let pullUpDepth = 0;
        while (
          pullUpDepth < MAX_PULL_UP_DEPTH &&
          processedData.nodes.length > 0 &&
          processedData.nodes[0].remoteData.expr ===
            nodeToExpand.node.remoteData.expr
        ) {
          const remainingSiblings = processedData.nodes.slice(1);
          const currentChildCount = remainingSiblings.length;

          try {
            const token = processedData.nodes[0].remoteData.token;
            const duplicateChildResponse = await exploreSpace(
              formatedNamespace(),
              pattern,
              token
            );
            const parsed = JSON.parse(
              duplicateChildResponse
            ) as ExploreResponse[];
            const grandchildren = initNodesFromApiResponse(
              parsed,
              nodeToExpand.node.remoteData.expr
            );

            if (grandchildren.nodes.length === 0) {
              processedData = {
                nodes: remainingSiblings,
                prefix: processedData.prefix,
              };
              break;
            }

            processedData = {
              nodes: [...grandchildren.nodes, ...remainingSiblings],
              prefix: processedData.prefix,
            };

            if (processedData.nodes.length <= currentChildCount) {
              break;
            }
          } catch {
            processedData = {
              nodes: remainingSiblings,
              prefix: processedData.prefix,
            };
            break;
          }

          pullUpDepth++;
        }

        newChildrenMap.set(nodeToExpand.id, processedData.nodes);
      } else {
        newChildrenMap.set(nodeToExpand.id, []);
      }

      newExpandedNodes.add(nodeToExpand.id);
    }

    batch(() => {
      setChildrenMap(newChildrenMap);
      setExpandedNodes(newExpandedNodes);
    });

    const newCount = getFlattenedNodes().length;
    if (newCount === currentCount) {
      attemptsWithoutProgress++;
    } else {
      attemptsWithoutProgress = 0;
      currentCount = newCount;
    }
  }
  setIsExpanding(false);
};

// Reset state when namespace changes
export const handleNamespaceChange = async () => {
  batch(() => {
    resetExpandableListState();
  });
};
