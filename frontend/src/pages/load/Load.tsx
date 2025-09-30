import { Show, Suspense } from "solid-js";
import MettaEditor from "~/components/common/MettaEditor";
import ZoomControls from "./components/ZoomControls";
import MinimizeControls from "./components/MinimizeControls";
import SpaceGraph from "~/pages/load/components/SpaceGraph";
import { HiOutlineMinus, HiOutlinePlus } from "solid-icons/hi";
import { initNodesFromApiResponse } from "~/lib/space";
import { ToastViewport } from "~/components/ui/Toast";
import { useSpaceGraph } from "./hooks/useSpaceGraph";

import "../../styles/variables.css";
import "../../styles/components.css";

const LoadPage = () => {
  const {
    mettaText,
    handleTextChange,
    parseErrors,
    isMinimized,
    toggleMinimize,
    pattern,
    handlePatternLoad,
    subSpace,
    handleZoomIn,
    handleZoomOut,
    handleRecenter,
    handleToggleCard,
    setupGraphRefs,
  } = useSpaceGraph();

  return (
    <div class="relative w-full h-full">
      {/* This is the UI for the Pattern Editor Card from the original file */}
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

      <ZoomControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onRecenter={handleRecenter}
      />

      <MinimizeControls onToggleCards={handleToggleCard} />

      <div class="absolute inset-0 w-full h-full" style="z-index: 0;">
        <Suspense
          fallback={
            <div class="flex items-center justify-center h-full text-lg text-muted-foreground">
              Loading graph...
            </div>
          }
        >
          <Show
            when={subSpace()}
            fallback={
              <div class="flex items-center justify-center h-full text-destructive">
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
                <div class="flex items-center justify-center h-full text-lg text-muted-foreground">
                  No data loaded on this path/namespace
                </div>
              }
            >
              <SpaceGraph
                pattern={pattern}
                rootNodes={() => initNodesFromApiResponse(subSpace()!)}
                ref={setupGraphRefs}
              />
            </Show>
          </Show>
        </Suspense>
      </div>

      <ToastViewport />
    </div>
  );
};

export default LoadPage;
