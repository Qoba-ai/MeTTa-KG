import { For, createSignal, Show, createMemo, createEffect } from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import type { SpaceNode } from "~/lib/space";
import { exploreSpace } from "~/lib/api";
import { formatedNamespace } from "~/lib/state";
import { showToast } from "~/components/ui/Toast";
import { initNodesFromApiResponse } from "~/lib/space";

interface ExpressionListProps {
  data: { nodes: SpaceNode[]; prefix: string[] };
  pattern: string;
  onNodeClick?: (node: SpaceNode) => void;
  ref?: (api: {
    expandAll: () => void;
    collapseAll: () => void;
    collapseToRoot: () => void; // Add collapseToRoot to the API
  }) => void;
}

interface FlatNode {
  node: SpaceNode;
  id: string;
  depth: number;
  // parentId is not used, so it can be removed.
}

export default function ExpressionList(props: ExpressionListProps) {
  let scrollRef: HTMLDivElement;
  
  const [expandedNodes, setExpandedNodes] = createSignal<Set<string>>(new Set<string>());
  const [childrenMap, setChildrenMap] = createSignal<Map<string, SpaceNode[]>>(new Map());
  // The loadingNodes signal is no longer needed.

  const expandAll = () => {
    const allExpandableIds = new Set<string>();
    const children = childrenMap();
    for (const [id, childNodes] of children.entries()) {
      // Only expand nodes that have children
      if (childNodes.length > 0) {
        allExpandableIds.add(id);
      }
    }
    setExpandedNodes(allExpandableIds);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set<string>());
  };

  // This function will collapse all nodes back to the root level.
  const collapseToRoot = () => {
    setExpandedNodes(new Set<string>());
  };

  // Expose the API via the ref prop
  if (props.ref) {
    props.ref({ expandAll, collapseAll, collapseToRoot });
  }

  const getNodeId = (node: SpaceNode) =>
    node.remoteData.token ? Array.from(node.remoteData.token).join(',') : node.label;
  
  const isExpandable = (node: SpaceNode) => {

    // No token = not expandable
    if (!node.remoteData.token || node.remoteData.token.length === 0) {
      return false;
    }
    
    // Token is [-1] = leaf marker, not expandable
    if (node.remoteData.token.length === 1 && node.remoteData.token[0] === -1) {
      return false;
    }
    
    // Check if all values in token are -1
    const allMinusOne = Array.from(node.remoteData.token).every(val => val === -1);
    if (allMinusOne) {
      return false;
    }
    
    // If has valid token (not -1), it's expandable even if it has expr
    // The expr is just metadata that gets displayed, doesn't prevent expansion
    return true;
  };

  // Use createMemo to cache the flattened nodes
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

  // Use createMemo for the virtualizer
  const virtualizer = createMemo(() => createVirtualizer({
    get count() {
      return flattenedNodes().length;
    },
    getScrollElement: () => scrollRef,
    estimateSize: () => 36, // Reduced line height
    overscan: 10,
    getItemKey: (index) => flattenedNodes()[index]?.id ?? index,
  }));

  const toggleNode = async (flatNode: FlatNode) => {
    const { node, id: nodePath } = flatNode;
    const expanded = expandedNodes();
    
    // If already expanded, collapse it
    if (expanded.has(nodePath)) {
      const newExpanded = new Set(expanded);
      newExpanded.delete(nodePath);
      setExpandedNodes(newExpanded);
      return;
    }

    // If children already loaded, just expand
    if (childrenMap().has(nodePath)) {
      setExpandedNodes(new Set(expanded).add(nodePath));
      return;
    }

    // Check if node is expandable
    if (!isExpandable(node)) {
      // Not expandable, trigger click handler if provided
      props.onNodeClick?.(node);
      return;
    }

    // Fetch children from API
    // The setLoadingNodes call is removed.
    
    try {
      const response = await exploreSpace(
        formatedNamespace(),
        props.pattern,
        node.remoteData.token
      );
      
      const parsed = JSON.parse(response as any);
      
      if (parsed && parsed.length > 0) {
        // Process the API response using your existing logic
        const processedData = initNodesFromApiResponse(parsed);
        
        if (processedData.nodes.length > 0) {
          // Store children using the unique path as the key
          setChildrenMap(new Map(childrenMap()).set(nodePath, processedData.nodes));
          setExpandedNodes(new Set(expanded).add(nodePath));
        } else {
          // No valid children - it's a leaf node
          // Mark it by storing empty array so we don't try to fetch again
          setChildrenMap(new Map(childrenMap()).set(nodePath, []));
          showToast({
            title: "Leaf Node",
            description: "This node has no children to expand.",
            variant: "default",
          });
        }
      } else {
        // Empty response - it's a leaf node
        // Mark it by storing empty array
        setChildrenMap(new Map(childrenMap()).set(nodePath, []));
        showToast({
          title: "Leaf Node",
          description: "This node has no children to expand.",
          variant: "default",
        });
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
          description: "An error occurred expanding the node.",
          variant: "destructive",
        });
      }
    } 
  };

  return (
    <div
      ref={scrollRef!}
      class="w-full h-full overflow-auto custom-scrollbar bg-card rounded-lg border border-border shadow-sm font-mono" // Use mono font for the whole container
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
            const { node, id: nodeId, depth } = flatNode;
            const isExpanded = expandedNodes().has(nodeId);
            // The isLoading constant is removed.
            const canExpand = isExpandable(node);
            const hasChildren = childrenMap().has(nodeId);
            const childCount = hasChildren ? childrenMap().get(nodeId)!.length : 0;
            const isLeaf = hasChildren && childCount === 0;

            return (
              <div
                data-index={virtualItem.index}
                data-key={nodeId}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                // Use classList for dynamic classes, including zebra striping
                classList={{
                  "flex items-center gap-2 pr-4 hover:bg-green-800/40 cursor-pointer": true,
                  "bg-muted/20": true, 
                }}
                onClick={() => toggleNode(flatNode)}
              >
                {/* Line Number */}
                <div class="w-10 flex-shrink-0 text-right pr-3 text-xs text-muted-foreground/50 select-none">
                  {virtualItem.index + 1}
                </div>

                {/* Indentation guides and content container */}
                <div class="relative flex-1 flex items-center gap-2 min-w-0 h-full">
                  {/* Toggle icon */}
                  <div class="flex-shrink-0 w-4 h-4 flex items-center justify-center z-10 bg-transparent">
                    {/* The Show component for the loading spinner is removed. */}
                    <Show when={canExpand && !isLeaf}>
                      <svg
                        class="w-3 h-3 text-muted-foreground transition-transform"
                        classList={{ "rotate-90": isExpanded }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </Show>
                    <Show when={!canExpand || isLeaf}>
                      <div class="w-2 h-2 rounded-full bg-muted-foreground opacity-40" />
                    </Show>
                  </div>

                  {/* Node content */}
                  <div class="flex-1 min-w-0">
                    <div class="text-sm text-foreground truncate"> {/* Reduced font size */}
                      {node.label}
                    </div>
                  </div>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}