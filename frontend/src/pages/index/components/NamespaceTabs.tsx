import { Component, For } from "solid-js";
import {
  tabs,
  activeTabId,
  setActiveTabId,
  closeTab,
  addTab,
  type NamespaceTab,
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
      class={`flex items-center bg-neutral-900 border-b border-neutral-700 ${props.class || ""}`}
    >
      {/* Container with fixed width constraints */}
      <div class="flex-1 w-0 overflow-hidden relative">
        <div class="flex items-center overflow-x-auto scrollbar-hide hover:scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-600/50 hover:scrollbar-thumb-neutral-500/70">
          <For each={tabs()}>
            {(tab) => (
              <button
                onClick={() => setActiveTabId(tab.id)}
                class={`
                  flex items-center gap-2 px-4 py-2 text-sm whitespace-nowrap border-r border-neutral-700
                  transition-colors min-w-0 max-w-[200px] group flex-shrink-0
                  ${
                    activeTabId() === tab.id
                      ? "bg-neutral-800 text-white border-b-2 border-primary"
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50"
                  }
                `}
              >
                <span class="truncate">{tab.label}</span>
                {tabs().length > 1 && (
                  <X
                    class="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400 flex-shrink-0"
                    onClick={(e) => handleCloseTab(e, tab.id)}
                  />
                )}
              </button>
            )}
          </For>
        </div>

        {/* Fade effect at right edge */}
        <div
          class="absolute top-0 right-0 h-full w-12 pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, transparent, rgb(23, 23, 23) 80%)",
          }}
        ></div>
      </div>

      {/* Static content that doesn't scroll */}
      <div class="flex items-center flex-shrink-0">
        {/* Add Tab Button */}
        <button
          onClick={handleAddTab}
          class="flex items-center justify-center w-10 h-10 text-neutral-400 hover:text-primary hover:bg-neutral-800 transition-colors border-r border-neutral-700 flex-shrink-0"
          title="New tab"
        >
          <Plus class="w-4 h-4" />
        </button>

        {/* Links Section */}
        <div class="flex items-center gap-4 px-6 flex-shrink-0">
          <a
            href="https://github.com/trueagi-io/MORK"
            class="uppercase text-neutral-400 hover:text-primary hover:underline text-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            MORK
          </a>
          <span class="text-primary">·</span>
          <a
            href="https://github.com/trueagi-io/MORK/wiki"
            class="uppercase text-neutral-400 hover:text-primary hover:underline text-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            DOCS
          </a>
          <span class="text-primary">·</span>
          <a
            href="https://chat.singularitynet.io/chat/channels/mork"
            class="uppercase text-neutral-400 hover:text-primary hover:underline text-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            COMMUNITY
          </a>
        </div>
      </div>
    </div>
  );
};

export default NamespaceTabs;
