import { For, createSignal, Show, createMemo, createEffect, onMount } from "solid-js";
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
    collapseToRoot: () => void;
  }) => void;
  isIndented: boolean;
}

interface FlatNode {
  node: SpaceNode;
  id: string;
  depth: number;
}

export default function ExpressionList(props: ExpressionListProps) {
  let scrollRef: HTMLDivElement;
  let containerRef: HTMLDivElement;
  
  const [expandedNodes, setExpandedNodes] = createSignal<Set<string>>(new Set<string>());
  const [childrenMap, setChildrenMap] = createSignal<Map<string, SpaceNode[]>>(new Map());
  const [cursorLine, setCursorLine] = createSignal<number>(0);
  const [isFocused, setIsFocused] = createSignal<boolean>(false);
  
  // Track scroll position to preserve it during expansions
  let savedScrollTop = 0;

  const expandAll = () => {
    // Save scroll position
    if (scrollRef) {
      savedScrollTop = scrollRef.scrollTop;
    }
    
    const allExpandableIds = new Set<string>();
    const children = childrenMap();
    for (const [id, childNodes] of children.entries()) {
      if (childNodes.length > 0) {
        allExpandableIds.add(id);
      }
    }
    setExpandedNodes(allExpandableIds);
    
    // Restore scroll position after DOM update
    queueMicrotask(() => {
      if (scrollRef) {
        scrollRef.scrollTop = savedScrollTop;
      }
    });
  };

  const collapseAll = () => {
    // Save scroll position
    if (scrollRef) {
      savedScrollTop = scrollRef.scrollTop;
    }
    
    setExpandedNodes(new Set<string>());
    
    // Restore scroll position after DOM update
    queueMicrotask(() => {
      if (scrollRef) {
        scrollRef.scrollTop = savedScrollTop;
      }
    });
  };

  const collapseToRoot = () => {
    // Save scroll position
    if (scrollRef) {
      savedScrollTop = scrollRef.scrollTop;
    }
    
    setExpandedNodes(new Set<string>());
    
    // Restore scroll position after DOM update
    queueMicrotask(() => {
      if (scrollRef) {
        scrollRef.scrollTop = savedScrollTop;
      }
    });
  };

  if (props.ref) {
    props.ref({ expandAll, collapseAll, collapseToRoot });
  }

  const getNodeId = (node: SpaceNode) =>
    node.remoteData.token ? Array.from(node.remoteData.token).join(',') : node.label;
  
  const isExpandable = (node: SpaceNode) => {
    if (!node.remoteData.token || node.remoteData.token.length === 0) {
      return false;
    }
    
    if (node.remoteData.token.length === 1 && node.remoteData.token[0] === -1) {
      return false;
    }
    
    const allMinusOne = Array.from(node.remoteData.token).every(val => val === -1);
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
  
  const virtualizer = createMemo(() => createVirtualizer({
    get count() {
      return flattenedNodes().length;
    },
    getScrollElement: () => scrollRef,
    estimateSize: () => 24,
    overscan: 10,
    getItemKey: (index) => flattenedNodes()[index]?.id ?? index,
  }));

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
      
      // Restore scroll position after DOM update
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
      
      const parsed = JSON.parse(response as any);
      
      if (parsed && parsed.length > 0) {
        const processedData = initNodesFromApiResponse(parsed);
        
        if (processedData.nodes.length > 0) {
          setChildrenMap(new Map(childrenMap()).set(nodePath, processedData.nodes));
          setExpandedNodes(new Set(expanded).add(nodePath));
          
          // Restore scroll position after expansion
          queueMicrotask(() => {
            if (scrollRef) {
              scrollRef.scrollTop = savedScrollTop;
            }
          });
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
  };

  // Keyboard navigation
//   const handleKeyDown = (e: KeyboardEvent) => {
//     const maxLine = flattenedNodes().length - 1;
//     const current = cursorLine();

//     switch (e.key) {
//       case "ArrowDown":
//         e.preventDefault();
//         if (current < maxLine) {
//           setCursorLine(current + 1);
//           scrollToLine(current + 1);
//         }
//         break;
//       case "ArrowUp":
//         e.preventDefault();
//         if (current > 0) {
//           setCursorLine(current - 1);
//           scrollToLine(current - 1);
//         }
//         break;
//       case "ArrowRight":
//       case "Enter":
//         e.preventDefault();
//         const flatNode = flattenedNodes()[current];
//         if (flatNode) {
//           toggleNode(flatNode);
//         }
//         break;
//       case "ArrowLeft":
//         e.preventDefault();
//         const currentFlatNode = flattenedNodes()[current];
//         if (currentFlatNode && expandedNodes().has(currentFlatNode.id)) {
//           const expanded = expandedNodes();
//           const newExpanded = new Set(expanded);
//           newExpanded.delete(currentFlatNode.id);
//           setExpandedNodes(newExpanded);
//         }
//         break;
//     }
//   };

//   const scrollToLine = (index: number) => {
//     const items = virtualizer().getVirtualItems();
//     const item = items.find(i => i.index === index);
//     if (item && scrollRef) {
//       const itemTop = item.start;
//       const itemBottom = item.start + item.size;
//       const scrollTop = scrollRef.scrollTop;
//       const scrollBottom = scrollTop + scrollRef.clientHeight;

//       if (itemTop < scrollTop) {
//         scrollRef.scrollTop = itemTop;
//       } else if (itemBottom > scrollBottom) {
//         scrollRef.scrollTop = itemBottom - scrollRef.clientHeight;
//       }
//     }
//   };

  onMount(() => {
    containerRef?.focus();
  });

  return (
    <div
      ref={containerRef!}
      tabIndex={0}
      class="w-full h-full overflow-hidden relative focus:outline-none"
      style={{
        "background-color": "#1e1e1e",
        "font-family": "'Consolas', 'Courier New', monospace",
      }}
    //   onKeyDown={handleKeyDown}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    >
      {/* Editor header bar */}
      <div
        class="h-8 flex items-center px-4 border-b text-xs"
        style={{
          "background-color": "#2d2d2d",
          "border-color": "#3e3e3e",
          "color": "#cccccc",
        }}
      >
        <span class="opacity-60">Code Explorer</span>
      </div>

      {/* Main editor area */}
      <div
        ref={scrollRef!}
        class="w-full overflow-auto"
        style={{
          height: "calc(100% - 2rem)",
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
              
              const { node, id: nodeId, depth } = flatNode;
              const isExpanded = expandedNodes().has(nodeId);
              const canExpand = isExpandable(node);
              const hasChildren = childrenMap().has(nodeId);
              const childCount = hasChildren ? childrenMap().get(nodeId)!.length : 0;
              const isLeaf = hasChildren && childCount === 0;
              const isCursor = cursorLine() === virtualItem.index;

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
                    "background-color": isCursor ? "#2a2d2e" : "transparent",
                    "border-left": isCursor ? "2px solid #007acc" : "2px solid transparent",
                  }}
                  class="flex items-center cursor-pointer hover:bg-[#2a2d2e] transition-colors"
                  onClick={() => {
                    setCursorLine(virtualItem.index);
                    toggleNode(flatNode);
                  }}
                >
                  {/* Line number gutter */}
                  <div
                    class="flex-shrink-0 text-right pr-4 pl-4 select-none text-xs leading-6"
                    style={{
                      width: "60px",
                      color: isCursor ? "#c6c6c6" : "#858585",
                      "background-color": "#1e1e1e",
                    }}
                  >
                    {virtualItem.index + 1}
                  </div>

                  {/* Vertical line separator */}
                  <div
                    class="w-px flex-shrink-0"
                    style={{
                      height: "100%",
                      "background-color": "#3e3e3e",
                    }}
                  />

                  {/* Code content area */}
                  <div 
                    class="flex-1 flex items-center h-full px-2"
                    style={{
                      "padding-left": props.isIndented ? `${depth * 16 + 8}px` : '8px',
                    }}
                  >
                    {/* Indentation guides */}
                    <Show when={props.isIndented}>
                      <For each={Array.from({ length: depth })}>
                        {(_, i) => (
                          <div
                            class="absolute h-full"
                            style={{
                              left: `${60 + i() * 16 + 8}px`,
                              width: "1px",
                              "background-color": "#404040",
                            }}
                          />
                        )}
                      </For>
                    </Show>

                    {/* Expand/collapse icon */}
                    <div class="flex-shrink-0 w-4 h-4 flex items-center justify-center mr-1">
                      <Show when={canExpand && !isLeaf}>
                        <svg
                          class="w-3 h-3 transition-transform"
                          style={{
                            color: "#c5c5c5",
                            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                          }}
                          fill="currentColor"
                          viewBox="0 0 16 16"
                        >
                          <path d="M6 4l4 4-4 4V4z" />
                        </svg>
                      </Show>
                      <Show when={!canExpand || isLeaf}>
                        <div
                          class="w-1 h-1 rounded-full"
                          style={{
                            "background-color": "#6e6e6e",
                          }}
                        />
                      </Show>
                    </div>

                    {/* Node label with syntax-like coloring */}
                    <div
                      class="flex-1 truncate text-sm leading-6"
                      style={{
                        color: canExpand ? "#4ec9b0" : "#9cdcfe",
                        "font-size": "13px",
                      }}
                    >
                      {node.label}
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
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
