import { Show, Suspense } from "solid-js";
import MettaEditor from "~/components/common/MettaEditor";
import ZoomControls from "./components/ZoomControls";
import MinimizeControls from "./components/MinimizeControls";
import SpaceGraph from "./components/SpaceGraph";
import { HiOutlineMinus, HiOutlinePlus } from "solid-icons/hi";
import { initNodesFromApiResponse } from "~/lib/space";
import { ToastViewport } from "~/components/ui/Toast";
import {
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
} from "./lib";

import "../../styles/variables.css";
import "../../styles/components.css";

const LoadPage = () => {
  return (
    <div class="relative h-full w-full bg-background">
      {/* Pattern Editor Card */}
      <div
        class={`
          absolute top-2.5 left-2.5 z-[1001] p-3
          rounded border border-neutral-700 bg-neutral-900 text-white
          transition-all duration-300 ease-in-out
          ${
            isMinimized()
              ? "h-auto w-[300px] max-h-[50px] resize-none"
              : "flex h-[calc(100vh-80px)] min-h-[200px] w-[320px] min-w-[250px] max-w-[50vw] resize flex-col overflow-hidden"
          }
        `}
      >
        <div class="mb-3 -m-3 flex items-center justify-between border-b border-neutral-700 bg-neutral-800 p-3">
          <h3 class="text-sm font-medium text-neutral-300 tracking-wider uppercase">
            PATTERN
          </h3>
          <button
            class="flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-neutral-400 transition-all duration-200 hover:border-orange-500 hover:bg-neutral-800 hover:text-orange-500"
            onClick={toggleMinimize}
          >
            {isMinimized() ? (
              <HiOutlinePlus class="h-4 w-4" />
            ) : (
              <HiOutlineMinus class="h-4 w-4" />
            )}
          </button>
        </div>

        <Show when={!isMinimized()}>
          <div class="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
            <MettaEditor
              initialText={mettaText()}
              onTextChange={handleTextChange}
              onPatternLoad={handlePatternLoad}
              parseErrors={parseErrors()}
            />
          </div>
        </Show>
      </div>

      {/* Zoom Controls */}
      <div class="absolute top-2.5 right-2.5 z-10">
        <ZoomControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onRecenter={handleRecenter}
        />
      </div>

      {/* Minimize Controls */}
      <div class="absolute top-2.5 right-[74px] z-10">
        <MinimizeControls onToggleCards={handleToggleCard} />
      </div>

      {/* Cytoscape Canvas */}
      <div class="absolute inset-0 z-0 h-full w-full">
        <Suspense
          fallback={
            <div class="flex h-full items-center justify-center text-lg text-neutral-400">
              LOADING GRAPH...
            </div>
          }
        >
          <Show
            when={subSpace()}
            fallback={
              <div class="flex h-full items-center justify-center text-red-500">
                <div class="p-8 text-center">
                  <div class="mb-2 text-lg">ERROR LOADING SPACE DATA</div>
                  <div class="text-sm text-neutral-400">
                    CHECK SERVER LOGS FOR DETAILS
                  </div>
                </div>
              </div>
            }
          >
            <Show
              when={subSpace()!.length > 0}
              fallback={
                <div class="flex h-full items-center justify-center text-lg text-neutral-400">
                  NO DATA LOADED ON THIS PATH/NAMESPACE
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
