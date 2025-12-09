import { For, Show } from "solid-js";
import type { createVirtualizer } from "@tanstack/solid-virtual";
import type { FlatNode } from "./store";

export interface ExpressionListItemProps {
  virtualItem: ReturnType<
    ReturnType<typeof createVirtualizer>["getVirtualItems"]
  >[0];
  flatNode: FlatNode;
  isExpanded: boolean;
  canExpand: boolean;
  isLeaf: boolean;
  isCursor: boolean;
  isIndented: boolean;
  isExpandingToLeaf?: boolean;
  onClick: (e: MouseEvent) => void;
}

export default function ExpressionListItem(props: ExpressionListItemProps) {
  return (
    <div
      data-index={props.virtualItem.index}
      data-key={props.flatNode.id}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: `${props.virtualItem.size}px`,
        transform: `translateY(${props.virtualItem.start}px)`,
        "background-color": props.isCursor ? "#2a2d2e" : "transparent",
        "border-left": props.isCursor
          ? "2px solid #007acc"
          : "2px solid transparent",
      }}
      class="flex items-center cursor-pointer hover:bg-[#2a2d2e] transition-colors"
      onClick={(e) => props.onClick(e)}
    >
      {/* Line number gutter */}
      <div
        class="flex-shrink-0 text-right pr-2 select-none text-xs leading-6"
        style={{
          width: "40px",
          color: props.isCursor ? "#c6c6c6" : "#858585",
        }}
      >
        {props.virtualItem.index + 1}
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
          "padding-left": props.isIndented
            ? `${props.flatNode.depth * 16 + 20}px`
            : "8px",
        }}
      >
        {/* Indentation guides */}
        <Show when={props.isIndented && props.flatNode.depth > 0}>
          <For each={Array.from({ length: props.flatNode.depth })}>
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
          <Show when={props.canExpand && !props.isLeaf}>
            <svg
              class="w-3 h-3 transition-transform"
              style={{
                color: "#c5c5c5",
                transform: props.isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              }}
              fill="currentColor"
              viewBox="0 0 16 16"
            >
              <path d="M6 4l4 4-4 4V4z" />
            </svg>
          </Show>
          <Show when={!props.canExpand || props.isLeaf}>
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
          class="flex-1 text-sm leading-6 truncate"
          style={{
            color: props.canExpand ? "#4ec9b0" : "#9cdcfe",
            "font-size": "13px",
          }}
        >
          {props.flatNode.node.label}
        </div>

        {/* Expanding to leaf spinner */}
        <Show when={props.isExpandingToLeaf}>
          <div class="flex-shrink-0 ml-2 flex items-center">
            <div
              class="w-3 h-3 border border-t-transparent rounded-full animate-spin"
              style={{
                "border-color": "#4ec9b0",
                "border-top-color": "transparent",
              }}
            />
            <span class="ml-1 text-xs" style={{ color: "#4ec9b0" }}>
              Expanding...
            </span>
          </div>
        </Show>
      </div>
    </div>
  );
}
