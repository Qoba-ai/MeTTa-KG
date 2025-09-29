import MettaEditor from "~/components/space/MettaEditor";
import ZoomControls from "~/components/controls/ZoomControls";
import MinimizeControls from "~/components/controls/MinimizeControls";
import SpaceGraph from "~/components/space/SpaceGraph";
import {
  For,
  Show,
  Suspense,
  createEffect,
  createResource,
  createSignal,
} from "solid-js";
import { ParseError, LayoutState } from "../types";
import { HiOutlineMinus, HiOutlinePlus } from "solid-icons/hi";
import { initNodesFromApiResponse, SpaceNode } from "~/lib/space";
import { CytoscapeCanvasHandle } from "~/components/space/SpaceGraph";

// Import the required CSS for the editor
import "../styles/variables.css";
import "../styles/components.css";
import { exploreSpace } from "~/lib/api";
import { namespace } from "~/lib/state";

const LoadPage = () => {
  // Editor state
  const [mettaText, setMettaText] = createSignal("$x");
  const [parseErrors, _setParseErrors] = createSignal<ParseError[]>([]);
  const [isMinimized, setIsMinimized] = createSignal(true);
  const [pattern, setPattern] = createSignal("$x");

  // UI Controls state
  const [_isControlsMinimized, setIsControlsMinimized] = createSignal(true);
  const [_layoutState] = createSignal<LayoutState>({
    isAnimating: false,
    progress: 0,
    algorithm: "force-directed",
    startTime: 0,
    duration: 0,
  });
  let canvas!: CytoscapeCanvasHandle;
  let setSpaceGraph: (eles: SpaceNode[]) => void;

  const [subSpace] = createResource(
    () => ({
      path: namespace(),
      expr: pattern(),
      token: Uint8Array.from([]),
    }),
    async ({ path, expr, token }) => {
      // Destructure the object
      const pathStr = `/${path.join("/")}`;
      let res = await exploreSpace(pathStr, expr, token);
      res = JSON.parse(
        res as any /* eslint-disable-line @typescript-eslint/no-explicit-any */
      );
      return res;
    }
  );

  createEffect(() => {
    if (subSpace() && setSpaceGraph) {
      setSpaceGraph(initNodesFromApiResponse(subSpace()!));
    }
  });

  // Editor event handlers
  const handleTextChange = (text: string) => {
    setMettaText(text);
  };

  function handlePatternLoad(pattern: string) {
    setPattern(pattern);
  }

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized());
  };

  // Zoom Controls event handlers
  function handleZoomIn() {
    canvas.zoomIn();
  }

  function handleZoomOut() {
    canvas.zoomOut();
  }

  const handleRecenter = () => {
    canvas.recenter();
  };

  // Minimize Controls event handlers
  const handleMinimizeAll = () => {
    setIsMinimized(true);
    setIsControlsMinimized(true);
  };

  const handleMaximizeAll = () => {
    setIsMinimized(false);
    setIsControlsMinimized(false);
  };

  function handleToggleCard() {
    if (isMinimized()) {
      handleMaximizeAll();
    } else {
      handleMinimizeAll();
    }
  }

  // Setup event listeners on mount
  //const cleanup = setupEventListeners();
  return (
    <div class="relative w-full h-full">
      {/* MettaEditor - Always floating on the left */}
      <div
        class={`ui-card ${isMinimized() ? "minimized" : "metta-editor-card"} top-left`}
        style={
          isMinimized() ? "width: 300px; height: auto; z-index: 1001;" : ""
        }
      >
        <div class="card-header">
          <h3>Pattern</h3>
          <button class="minimize-btn" onClick={toggleMinimize}>
            {isMinimized() ? (
              <HiOutlinePlus class="w-4 h-4" />
            ) : (
              <HiOutlineMinus class="w-4 h-4" />
            )}
          </button>
        </div>

        <Show when={!isMinimized()}>
          <div class="card-content">
            <MettaEditor
              initialText={mettaText()}
              onTextChange={handleTextChange}
              onPatternLoad={handlePatternLoad}
              parseErrors={parseErrors()}
            />
          </div>
        </Show>
      </div>

      {/* Zoom Controls - Top Right */}
      <ZoomControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onRecenter={handleRecenter}
      />

      {/* Minimize Controls - Top Right Secondary (next to zoom controls) */}
      <MinimizeControls onToggleCards={handleToggleCard} />

      {/* UI Controls - Floating on bottom right */}
      {/* <div class={`ui-card ${isControlsMinimized() ? 'minimized' : ''} bottom-right-lower`} style={isControlsMinimized() ? "width: 200px; height: auto; z-index: 1001;" : ""}>
				<div class="card-header">
					<h3>Controls</h3>
					<button class="minimize-btn" onClick={toggleControlsMinimize}>
						{isControlsMinimized() ? <HiOutlinePlus class="w-4 h-4" /> : <HiOutlineMinus class="w-4 h-4" />}
					</button>
				</div>

				<Show when={!isControlsMinimized()}>
					<div class="card-content">
						<UIControls
							onExportPDF={handleExportPDF}
							onExportPNG={handleExportPNG}
							showLabels={showLabels()}
							onToggleLabels={handleToggleLabels}
							onApplyLayout={handleApplyLayout}
							layoutState={layoutState()}
							onStopLayout={handleStopLayout}
						/>
					</div>
				</Show>
			</div> */}

      {/* Cytoscape Canvas - Main Background */}
      <div class="absolute inset-0 w-full h-full" style="z-index: 0;">
        <Suspense
          fallback={
            <div
              class="flex items-center justify-center h-full"
              style="color: hsl(var(--muted-foreground));"
            >
              <div class="text-lg">Loading graph...</div>
            </div>
          }
        >
          <Show
            when={subSpace()}
            fallback={
              <div
                class="flex items-center justify-center h-full"
                style="color: hsl(var(--destructive));"
              >
                <div class="text-center p-8">
                  <div class="text-lg mb-2">Error loading space data</div>
                  <div class="text-sm opacity-70">
                    Check server logs for details
                  </div>
                </div>
              </div>
            }
          >
            <Show
              when={subSpace()!.length > 0}
              fallback={
                <div
                  class="flex items-center justify-center h-full"
                  style="color: hsl(var(--muted-foreground));"
                >
                  <span class="text-lg">
                    No data loaded on this path/namespace
                  </span>
                </div>
              }
            >
              <SpaceGraph
                pattern={pattern}
                rootNodes={() => initNodesFromApiResponse(subSpace()!)}
                ref={(c, s) => {
                  canvas = c;
                  setSpaceGraph = s;
                }}
              />
            </Show>
          </Show>
        </Suspense>
      </div>

      {/* Data Panel - Optional overlay for debugging */}
      <Show when={false}>
        <div
          class="absolute bottom-4 left-1/2 transform -translate-x-1/2 max-w-lg"
          style="z-index: 500;"
        >
          <div class="space-data-item opacity-90 backdrop-blur-sm">
            <div
              class="text-xs font-semibold mb-2"
              style="color: hsl(var(--muted-foreground));"
            >
              Graph Data ({subSpace()!.length} items)
            </div>
            <div class="max-h-20 overflow-y-auto">
              <For each={subSpace()!.slice(0, 3)}>
                {(item) => (
                  <div class="text-xs mb-1">
                    <span class="expression-value">{item.expr}</span>
                  </div>
                )}
              </For>
              {subSpace()!.length > 3 && (
                <div class="text-xs opacity-60">
                  ...and {subSpace()!.length - 3} more
                </div>
              )}
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default LoadPage;
