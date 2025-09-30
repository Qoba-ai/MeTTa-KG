import { Component, createSignal, Show } from "solid-js";
import {
  LayoutAlgorithm,
  LayoutOptions,
  UIControlsProps,
} from "../../../types";

const UIControls: Component<UIControlsProps> = (props) => {
  const [showLayoutOptions, setShowLayoutOptions] = createSignal(false);
  const [layoutOptions, setLayoutOptions] = createSignal<LayoutOptions>({
    iterations: 300,
    springLength: 200,
    springStrength: 0.1,
    repulsionStrength: 1000,
    damping: 0.9,
    animationDuration: 1500,
    centerForce: 0.01,
  });

  const handleApplyLayout = (algorithm: LayoutAlgorithm) => {
    props.onApplyLayout(algorithm, layoutOptions());
  };

  const updateLayoutOption = (key: keyof LayoutOptions, value: number) => {
    setLayoutOptions((prev) => ({ ...prev, [key]: value }));
  };

  // Base classes for reuse
  const baseButtonClass =
    "w-full text-left text-xs font-medium px-3 py-2 border border-border rounded transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-muted";
  const activeButtonClass = "bg-primary border-primary text-primary-foreground";
  const defaultButtonClass =
    "bg-background hover:bg-accent hover:border-primary";

  return (
    <div class="flex flex-col gap-4 text-sm">
      {/* Layout Controls */}
      <div class="space-y-3 border-b border-border pb-3">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-foreground">
          Layout
        </h3>
        <div class="flex flex-col gap-1.5">
          <button
            onClick={() => handleApplyLayout("force-directed")}
            disabled={props.layoutState.isAnimating}
            class={`${baseButtonClass} ${props.layoutState.algorithm === "force-directed" && !props.layoutState.isAnimating ? activeButtonClass : defaultButtonClass}`}
          >
            Force-Directed
          </button>
          <button
            onClick={() => handleApplyLayout("hierarchical")}
            disabled={props.layoutState.isAnimating}
            class={`${baseButtonClass} ${props.layoutState.algorithm === "hierarchical" && !props.layoutState.isAnimating ? activeButtonClass : defaultButtonClass}`}
          >
            Hierarchical
          </button>
          <button
            onClick={() => handleApplyLayout("circular")}
            disabled={props.layoutState.isAnimating}
            class={`${baseButtonClass} ${props.layoutState.algorithm === "circular" && !props.layoutState.isAnimating ? activeButtonClass : defaultButtonClass}`}
          >
            Circular
          </button>
          <Show when={props.layoutState.isAnimating}>
            <button
              onClick={props.onStopLayout}
              class={`${baseButtonClass} bg-destructive border-destructive text-destructive-foreground hover:bg-destructive/80`}
            >
              Stop
            </button>
          </Show>
        </div>

        <button
          onClick={() => setShowLayoutOptions(!showLayoutOptions())}
          class="w-full text-xs font-medium px-2 py-1.5 border border-border rounded-sm bg-muted text-muted-foreground transition-colors hover:bg-accent hover:border-primary"
        >
          {showLayoutOptions() ? "Hide" : "Show"} Options
        </button>

        <Show when={showLayoutOptions()}>
          <div class="space-y-3 rounded-md border border-border bg-muted/50 p-3">
            {/* Range Input Option Group */}
            <div class="space-y-1">
              <div class="flex justify-between items-center">
                <label class="text-[11px] font-semibold uppercase text-muted-foreground">
                  Animation (ms)
                </label>
                <span class="text-xs font-medium text-foreground">
                  {layoutOptions().animationDuration || 1500}ms
                </span>
              </div>
              <input
                type="range"
                min="500"
                max="3000"
                step="100"
                class="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-border accent-primary"
                value={layoutOptions().animationDuration || 1500}
                onInput={(e) =>
                  updateLayoutOption(
                    "animationDuration",
                    parseInt(e.currentTarget.value)
                  )
                }
              />
            </div>
            {/* Add other option groups similarly */}
          </div>
        </Show>

        <Show when={props.layoutState.isAnimating}>
          <div class="flex items-center gap-2 pt-1">
            <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
              <div
                class="h-full rounded-full bg-primary transition-all duration-100"
                style={`width: ${props.layoutState.progress * 100}%`}
              />
            </div>
            <span class="min-w-[35px] text-right text-xs font-semibold text-foreground">
              {Math.round(props.layoutState.progress * 100)}%
            </span>
          </div>
        </Show>
      </div>

      {/* Display Controls */}
      <div class="space-y-3 border-b border-border pb-3">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-foreground">
          Display
        </h3>
        <label class="flex cursor-pointer items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            class="h-4 w-4 cursor-pointer rounded-sm border-border bg-background text-primary focus:ring-primary"
            checked={props.showLabels}
            onChange={(e) => props.onToggleLabels(e.currentTarget.checked)}
          />
          Show Labels
        </label>
      </div>

      {/* Export Controls */}
      <div class="space-y-3">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-foreground">
          Export
        </h3>
        <div class="flex gap-2">
          <button
            onClick={props.onExportPDF}
            class={`${baseButtonClass} ${defaultButtonClass} text-center`}
          >
            PDF
          </button>
          <button
            onClick={props.onExportPNG}
            class={`${baseButtonClass} ${defaultButtonClass} text-center`}
          >
            PNG
          </button>
        </div>
      </div>
    </div>
  );
};

export default UIControls;
