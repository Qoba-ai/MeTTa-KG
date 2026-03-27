import { Component, For } from "solid-js";
import {
  tabs,
  activeTabId,
  setActiveTabId,
  closeTab,
  addTab,
} from "~/lib/state";
import X from "lucide-solid/icons/x";
import Plus from "lucide-solid/icons/plus";
import { tokenRootNamespace } from "~/lib/state";

interface NamespaceTabsProps {
  class?: string;
}

const NamespaceTabs: Component<NamespaceTabsProps> = (props) => {
  const handleCloseTab = (e: Event, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  const handleAddTab = () => {
    addTab(tokenRootNamespace());
  };

  return (
    <div
      class={`flex items-center h-9 ${props.class || ""}`}
      style={{
        background: "var(--tab-bg, #080c18)",
        "border-bottom": "1px solid rgba(0,212,255,0.1)",
      }}
    >
      {/* Scrollable tab area */}
      <div class="flex-1 w-0 overflow-hidden relative h-full">
        <div class="flex items-center overflow-x-auto scrollbar-hide h-full">
          <For each={tabs()}>
            {(tab) => (
              <button
                onClick={() => setActiveTabId(tab.id)}
                class={`
                  flex items-center gap-2 px-5 text-xs font-medium tracking-wide
                  transition-all duration-200 min-w-[120px] max-w-[220px]
                  group flex-shrink-0 h-full border-r uppercase
                  ${
                    activeTabId() === tab.id
                      ? ""
                      : "text-[#4a5568] hover:text-[#c4cfdf]"
                  }
                `}
                style={
                  activeTabId() === tab.id
                    ? {
                        "border-top": "2px solid #00d4ff",
                        "border-right": "1px solid rgba(0,212,255,0.15)",
                        background: "rgba(0,212,255,0.06)",
                        color: "#e2e8f0",
                        "box-shadow": "inset 0 1px 0 rgba(0,212,255,0.1)",
                      }
                    : {
                        "border-top": "2px solid transparent",
                        "border-right": "1px solid rgba(0,212,255,0.08)",
                        background: "transparent",
                      }
                }
              >
                <span class="flex-1 text-center truncate">{tab.label}</span>
                {tabs().length > 1 && (
                  <X
                    class="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity hover:opacity-100 flex-shrink-0"
                    color="#00d4ff"
                    onClick={(e) => handleCloseTab(e, tab.id)}
                  />
                )}
              </button>
            )}
          </For>
        </div>

        {/* Fade at right edge */}
        <div
          class="absolute top-0 right-0 h-full w-8 pointer-events-none"
          style={{
            background: "linear-gradient(to right, transparent, #080c18 85%)",
          }}
        />
      </div>

      {/* Add tab */}
      <button
        onClick={handleAddTab}
        class="flex items-center justify-center w-9 h-full transition-all duration-200 flex-shrink-0"
        style={{
          color: "#4a5568",
          "border-left": "1px solid rgba(0,212,255,0.08)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = "#00d4ff";
          (e.currentTarget as HTMLElement).style.background =
            "rgba(0,212,255,0.06)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = "#4a5568";
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
        title="New tab"
      >
        <Plus class="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default NamespaceTabs;
