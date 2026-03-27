import { Show } from "solid-js";
import MettaEditor from "~/components/common/MettaEditor";
import ZoomControls from "./components/ZoomControls";
import MinimizeControls from "./components/MinimizeControls";
import ExpressionList from "./components/expandableList/ExpandableList";
import Plus from "lucide-solid/icons/plus";
import Minus from "lucide-solid/icons/minus";
import Activity from "lucide-solid/icons/activity";
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
  isIndented,
  handleToggleIndent,
} from "./lib";

import "../../styles/variables.css";
import "../../styles/components.css";

const LoadPage = () => {
  return (
    <div
      class="relative h-full w-full"
      style={{ background: "var(--bg-primary, #0a0e1a)" }}
    >
      {/* Pattern Editor Card — glass overlay in bottom-right */}
      <div
        class={`
          absolute bottom-3 right-3 z-[1001]
          rounded-xl glass-card
          transition-all duration-300 ease-in-out overflow-hidden
          ${
            isMinimized()
              ? "w-[260px]"
              : "flex flex-col h-[55vh] min-h-[180px] w-[300px] min-w-[240px] max-w-[45vw] resize"
          }
        `}
      >
        {/* Card header */}
        <div
          class="flex items-center justify-between px-3 py-2 border-b flex-shrink-0"
          style={{
            background: "rgba(0,212,255,0.04)",
            "border-color": "rgba(0,212,255,0.12)",
          }}
        >
          <div class="flex items-center gap-2">
            <Activity class="w-3.5 h-3.5" color="#00d4ff" />
            <h3
              class="text-xs font-semibold tracking-widest uppercase"
              style={{ color: "#00d4ff" }}
            >
              Pattern
            </h3>
          </div>
          <button
            class="flex h-5 w-5 cursor-pointer items-center justify-center rounded transition-all duration-200"
            style={{ color: "#8892a4" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#00d4ff";
              (e.currentTarget as HTMLElement).style.background =
                "rgba(0,212,255,0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#8892a4";
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
            onClick={toggleMinimize}
          >
            {isMinimized() ? (
              <Plus class="h-3.5 w-3.5" />
            ) : (
              <Minus class="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        <Show when={!isMinimized()}>
          <div class="min-h-0 flex-1 overflow-y-auto">
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
      <div class="absolute top-3 right-3 z-10">
        <ZoomControls
          onZoomIn={handleExpandAll}
          onZoomOut={handleCollapseToRoot}
        />
      </div>

      {/* Minimize Controls */}
      <div class="absolute top-3 right-[58px] z-10">
        <MinimizeControls
          onToggleCards={handleToggleCard}
          onToggleIndent={handleToggleIndent}
        />
      </div>

      {/* Expandable list / graph view */}
      <div class="absolute inset-0 w-full h-full flex" style="z-index: 0;">
        <Show
          when={subSpace() && subSpace()!.length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center h-full w-full gap-4">
              {/* Glowing icon */}
              <div
                class="w-16 h-16 rounded-2xl flex items-center justify-center animate-glow-pulse"
                style={{
                  background: "rgba(0,212,255,0.06)",
                  border: "1px solid rgba(0,212,255,0.2)",
                }}
              >
                <Activity class="w-7 h-7" color="#00d4ff" />
              </div>
              <div class="text-center">
                <p
                  class="text-sm font-semibold uppercase tracking-widest mb-1"
                  style={{ color: "#00d4ff" }}
                >
                  No Data Loaded
                </p>
                <p class="text-xs" style={{ color: "#8892a4" }}>
                  Enter a MeTTa pattern above and press Load
                </p>
              </div>
            </div>
          }
        >
          <ExpressionList
            data={initNodesFromApiResponse(subSpace()!)}
            pattern={pattern()}
            ref={setupGraphApi}
            isIndented={isIndented()}
          />
        </Show>
      </div>
    </div>
  );
};

export default LoadPage;
