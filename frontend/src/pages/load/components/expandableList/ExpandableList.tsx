import {
  For,
  Show,
  createSignal,
  createMemo,
  createEffect,
  onMount,
  on,
} from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import type { SpaceNode } from "~/lib/space";
import { formatedNamespace } from "~/lib/state";
import ExpressionListItem, { type FlatNode } from "./ExpressionListItem";
import {
  expandedNodes,
  childrenMap,
  cursorLine,
  setCursorLine,
  isExpanding,
  expandAll,
  collapseToRoot,
  isExpandable,
  createFlattenedNodes,
  toggleNode,
  expandToFillViewport,
  handleNamespaceChange,
} from "./lib";
import { showToast } from "~/components/ui/Toast";

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

  const [isFocused, setIsFocused] = createSignal<boolean>(false);

  const flattenedNodes = createMemo<FlatNode[]>(() => {
    return createFlattenedNodes(props.data);
  });

  createEffect(
    on(formatedNamespace, async (current, prev) => {
      if (prev !== undefined) {
        await handleNamespaceChange();
      }

      await new Promise((resolve) => setTimeout(resolve, 50));

      if (!scrollRef) return;

      if (!props.data?.nodes || props.data.nodes.length === 0) {
        return;
      }

      const viewportHeight = scrollRef.clientHeight;
      const estimatedItemHeight = 24;
      const targetCount = Math.ceil(viewportHeight / estimatedItemHeight);

      try {
        await expandToFillViewport(targetCount, props.pattern, () =>
          flattenedNodes()
        );
      } catch (error) {
        showToast({
          title: "Expansion Error",
          description: `Failed to Expand nodes consider reloading the page\n ${error}`,
          variant: "destructive",
        });
      }
    })
  );

  if (props.ref) {
    props.ref({ expandAll, collapseToRoot });
  }

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

  const handleToggleNode = async (flatNode: FlatNode) => {
    setCursorLine(flattenedNodes().indexOf(flatNode));
    await toggleNode(flatNode, props.pattern, props.onNodeClick, scrollRef);
  };

  onMount(async () => {
    containerRef?.focus();
    if (scrollRef) {
      const viewportHeight = scrollRef.clientHeight;
      const estimatedItemHeight = 24;
      const targetCount = Math.ceil(viewportHeight / estimatedItemHeight);
      expandToFillViewport(targetCount, props.pattern, () => flattenedNodes());
    }
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
                    onClick={() => handleToggleNode(flatNode)}
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
