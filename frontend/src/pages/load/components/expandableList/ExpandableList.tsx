import {
  For,
  Show,
  createSignal,
  createMemo,
  createEffect,
  onMount,
  on,
  batch,
} from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import type { ExploreResponse, SpaceNode } from "~/lib/space";
import { exploreSpace } from "~/lib/api";
import { formatedNamespace } from "~/lib/state";
import { showToast } from "~/components/ui/Toast";
import { initNodesFromApiResponse } from "~/lib/space";
import ExpressionListItem, { type FlatNode } from "./ExpressionListItem";

interface ExpressionListProps {
  data: { nodes: SpaceNode[]; prefix: string[] };
  pattern: string;
  onNodeClick?: (node: SpaceNode) => void;
  ref?: (api: { expandAll: () => void; collapseToRoot: () => void }) => void;
  isIndented: boolean;
}

export default function ExpressionList(props: ExpressionListProps) {
  let scrollRef: HTMLDivElement | undefined;
  let containerRef: HTMLDivElement | undefined;

  const [expandedNodes, setExpandedNodes] = createSignal<Set<string>>(
    new Set<string>()
  );
  const [childrenMap, setChildrenMap] = createSignal<Map<string, SpaceNode[]>>(
    new Map()
  );

  const [isExpanding, setIsExpanding] = createSignal(false);

  createEffect(
    on(formatedNamespace, async () => {
      batch(() => {
        setExpandedNodes(new Set<string>());
        setChildrenMap(new Map());
      });
      if (scrollRef) {
        const viewportHeight = scrollRef.clientHeight;
        const estimatedItemHeight = 24;
        const targetCount = Math.ceil(viewportHeight / estimatedItemHeight);

        await expandToFillViewport(targetCount);
      }
    })
  );

  const [cursorLine, setCursorLine] = createSignal<number>(0);
  const [isFocused, setIsFocused] = createSignal<boolean>(false);

  // Track scroll position to preserve it during expansions
  let savedScrollTop = 0;

  const expandAll = () => {
    const allExpandableIds = new Set<string>();
    const children = childrenMap();
    for (const [id, childNodes] of children.entries()) {
      if (childNodes.length > 0) {
        allExpandableIds.add(id);
      }
    }
    setExpandedNodes(allExpandableIds);
  };

  const collapseToRoot = () => setExpandedNodes(new Set<string>());

  if (props.ref) {
    props.ref({ expandAll, collapseToRoot });
  }

  const getNodeId = (node: SpaceNode) =>
    node.remoteData.token
      ? Array.from(node.remoteData.token).join(",")
      : node.label;

  const isExpandable = (node: SpaceNode) => {
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

  const flattenedNodes = createMemo<FlatNode[]>(() => {
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

    props.data.nodes.forEach((node, index) => {
      const rootPath = `${getNodeId(node)}#${index}`;
      addNode(node, 0, rootPath);
    });

    return result;
  });

  const virtualizer = createMemo(() =>
    createVirtualizer({
      get count() {
        return flattenedNodes().length;
      },
      getScrollElement: () => scrollRef || null,
      estimateSize: () => 24,
      overscan: 20,
      getItemKey: (index) => flattenedNodes()[index]?.id ?? index,
    })
  );

  const toggleNode = async (flatNode: FlatNode) => {
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
      props.onNodeClick?.(node);
      return;
    }

    try {
      const response = await exploreSpace(
        formatedNamespace(),
        props.pattern,
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
              props.pattern,
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

  onMount(async () => {
    containerRef?.focus();
  });

  const expandToFillViewport = async (targetCount: number) => {
    setIsExpanding(true);
    const BATCH_SIZE = 5;
    const MAX_PULL_UP_DEPTH = 100;

    let currentCount = flattenedNodes().length;
    let attemptsWithoutProgress = 0;
    const maxAttemptsWithoutProgress = 10;

    while (
      currentCount < targetCount &&
      attemptsWithoutProgress < maxAttemptsWithoutProgress
    ) {
      const currentFlattened = flattenedNodes();
      const nodesToExpand = currentFlattened
        .filter((fn) => isExpandable(fn.node) && !expandedNodes().has(fn.id))
        .slice(0, BATCH_SIZE);

      if (nodesToExpand.length === 0) {
        break;
      }

      // Prepare parallel fetches
      const fetchPromises = nodesToExpand.map(async (nodeToExpand) => {
        const token = nodeToExpand.node.remoteData.token;
        const response = await exploreSpace(
          formatedNamespace(),
          props.pattern,
          token
        );
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
                props.pattern,
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

      const newCount = flattenedNodes().length;
      if (newCount === currentCount) {
        attemptsWithoutProgress++;
      } else {
        attemptsWithoutProgress = 0;
        currentCount = newCount;
      }
    }
    setIsExpanding(false);
  };

  return (
    <div
      ref={containerRef!}
      tabIndex={0}
      class="w-full h-full overflow-hidden relative focus:outline-none"
      style={{
        "background-color": "#1e1e1e",
        "font-family": "'Consolas', 'Courier New', monospace",
      }}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    >
      {/* Editor header bar */}
      <div
        class="h-8 flex items-center px-4 border-b text-xs"
        style={{
          "background-color": "#2d2d2d",
          "border-color": "#3e3e3e",
          color: "#cccccc",
        }}
      >
        <span class="opacity-60">Code Explorer</span>
      </div>

      {/* Main editor area with relative positioning */}
      <div class="relative" style={{ height: "calc(100% - 2rem)" }}>
        <div
          ref={scrollRef!}
          class="w-full h-full overflow-auto"
          style={{
            "scrollbar-width": "thin",
            "scrollbar-color": "#424242 #1e1e1e",
          }}
        >
          <div
            style={{
              height: `${virtualizer().getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            <For each={virtualizer().getVirtualItems()}>
              {(virtualItem) => {
                const flatNode = flattenedNodes()[virtualItem.index];
                if (!flatNode) return null;

                const isExpanded = expandedNodes().has(flatNode.id);
                const canExpand = isExpandable(flatNode.node);
                const hasChildren = childrenMap().has(flatNode.id);
                const childCount = hasChildren
                  ? childrenMap().get(flatNode.id)!.length
                  : 0;
                const isLeaf = hasChildren && childCount === 0;
                const isCursor = cursorLine() === virtualItem.index;

                return (
                  <ExpressionListItem
                    virtualItem={virtualItem}
                    flatNode={flatNode}
                    isExpanded={isExpanded}
                    canExpand={canExpand}
                    isLeaf={isLeaf}
                    isCursor={isCursor}
                    isIndented={props.isIndented}
                    onClick={() => {
                      setCursorLine(virtualItem.index);
                      toggleNode(flatNode);
                    }}
                  />
                );
              }}
            </For>
          </div>
        </div>

        {/* Loading overlay */}
        <Show when={isExpanding()}>
          <div class="absolute inset-0 flex flex-col items-center justify-center bg-[#1e1e1e] z-10">
            <div class="animate-ping rounded-full h-8 w-8 border-t-2 border-b-2 mb-4"></div>
            <span class="text-white text-sm">Expanding...</span>
          </div>
        </Show>
      </div>

      {/* Cursor indicator when focused */}
      <Show when={isFocused()}>
        <div
          class="absolute left-0 w-0.5 h-6 animate-pulse"
          style={{
            top: `${2 + cursorLine() * 24}rem`,
            "background-color": "#007acc",
          }}
        />
      </Show>
    </div>
  );
}
