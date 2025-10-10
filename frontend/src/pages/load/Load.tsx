import { Show } from "solid-js";
import MettaEditor from "~/components/common/MettaEditor";
import ZoomControls from "./components/ZoomControls";
import MinimizeControls from "./components/MinimizeControls";
import D3TreeGraph from "./components/D3SpaceGraph";
import Plus from "lucide-solid/icons/plus";
import Minus from "lucide-solid/icons/minus";
import { initNodesFromApiResponse } from "~/lib/space";
import {
  mettaText,
  handleTextChange,
  parseErrors,
  isMinimized,
  handlePatternLoad,
  toggleMinimize,
  pattern,
  subSpace,
  handleExpandAll,
  handleCollapseToRoot,
  setupGraphApi,
  handleToggleCard,
} from "./lib";

import "../../styles/variables.css";
import "../../styles/components.css";

const LoadPage = () => {
  return (
    <div class="relative h-full w-full bg-background">
      {/* Pattern Editor Card */}
      <div
        class={`
          absolute bottom-2.5 right-2.5 z-[1001] p-3
          rounded border border-neutral-700 bg-neutral-900 text-white
          transition-all duration-300 ease-in-out
          ${
            isMinimized()
              ? "h-auto w-[300px] max-h-[50px] resize-none"
              : "flex h-[60vh] min-h-[200px] w-[320px] min-w-[250px] max-w-[50vw] resize flex-col overflow-hidden"
          }
        `}
      >
        <div class="mb-3 -m-3 flex items-center justify-between border-b border-neutral-700 bg-neutral-800 p-3">
          <h3 class="text-sm font-medium text-neutral-300 tracking-wider uppercase">
            PATTERN
          </h3>
          <button
            class="flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-neutral-400 transition-all duration-200 hover:border-primary hover:bg-neutral-800 hover:text-primary"
            onClick={toggleMinimize}
          >
            {isMinimized() ? (
              <Plus class="h-4 w-4" />
            ) : (
              <Minus class="h-4 w-4" />
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
          onZoomIn={handleExpandAll}
          onZoomOut={handleCollapseToRoot}
        />
      </div>
      {/* Minimize Controls */}
      <div class="absolute top-2.5 right-[74px] z-10">
        <MinimizeControls onToggleCards={handleToggleCard} />
      </div>
      {/* D3 Tree Canvas */}
      <div class="absolute inset-0 w-full h-full flex" style="z-index: 0;">
        <Show
          when={subSpace() && subSpace()!.length > 0}
          fallback={
            <div class="flex items-center justify-center h-full w-full">
              <span class="text-lg">NO DATA LOADED</span>
            </div>
          }
        >
          <D3TreeGraph
            data={initNodesFromApiResponse(subSpace()!)}
            pattern={pattern()}
            ref={setupGraphApi}
          />
        </Show>
      </div>
    </div>
  );
};

export default LoadPage;
