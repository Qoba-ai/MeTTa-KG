import Network from "lucide-solid/icons/network";
import ChevronsLeft from "lucide-solid/icons/chevron-left";
import ChevronsRight from "lucide-solid/icons/chevron-right";
import { Accessor, createSignal } from "solid-js";
import { Button } from "~/components/ui/Button";
import { A } from "@solidjs/router";

interface SidbarProps {
  activeTab: Accessor<string>;
  setActiveTab: (tab: string) => void;
  sidebarSections: any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  sidebarSections,
}: SidbarProps) {
  // const [activeTab, setActiveTab] = createSignal("explore")
  const [isCollapsed, setIsCollapsed] = createSignal(true);

  return (
    <>
      <div
        class={`relative transition-all duration-300 ease-in-out ${
          isCollapsed() ? "w-16" : "w-80"
        } bg-neutral-900 border-r border-neutral-700`}
      >
        <Button
          variant="ghost"
          class="absolute top-5 -right-4 z-10 h-8 w-8 rounded-full p-0 flex items-center justify-center bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-orange-500"
          onClick={() => setIsCollapsed(!isCollapsed())}
        >
          {isCollapsed() ? (
            <ChevronsRight class="h-5 w-5" />
          ) : (
            <ChevronsLeft class="h-5 w-5" />
          )}
        </Button>
        <div class={`p-6 ${isCollapsed() ? "px-3" : ""}`}>
          <div
            class={`flex items-center gap-2 mb-8 ${
              isCollapsed() ? "justify-center" : ""
            }`}
          >
            <Network class="h-8 w-8 text-orange-500" />
            {!isCollapsed() && (
              <div>
                <h1 class="text-orange-500 font-bold text-lg tracking-wider">
                  METTA-KG
                </h1>
                <p class="text-neutral-500 text-xs">VERSION 0.1.0</p>
              </div>
            )}
          </div>

          {/* <ScrollArea class="h-[calc(100vh-120px)]"> */}
          <nav class="space-y-6">
            {sidebarSections.map(
              (
                section: any /* eslint-disable-line @typescript-eslint/no-explicit-any */,
                index: number
              ) => (
                <div>
                  {isCollapsed() ? (
                    index > 0 && <div class="my-3 border-t border-border" />
                  ) : (
                    <h3 class="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3 px-2">
                      {section.title}
                    </h3>
                  )}
                  <div class="space-y-1">
                    {section.items.map(
                      (
                        item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
                      ) => {
                        const Icon = item.icon;
                        return (
                          <A href={item.to}>
                            <Button
                              // key={item.id}
                              variant={
                                activeTab() === item.id ? "default" : "ghost"
                              }
                              class={`w-full gap-3 h-auto py-2 px-3 ${
                                isCollapsed()
                                  ? "justify-center"
                                  : "justify-start"
                              } ${
                                activeTab() === item.id
                                  ? "bg-orange-500 text-white"
                                  : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                              }`}
                              onClick={() => setActiveTab(item.id)}
                            >
                              <div class="flex items-center justify-center w-4 h-4">
                                {typeof Icon === "function" &&
                                Icon.name === undefined ? (
                                  <Icon />
                                ) : (
                                  <Icon class="h-4 w-4" />
                                )}
                              </div>
                              {!isCollapsed() && (
                                <div class="flex-1 text-left">
                                  <div class="flex items-center gap-2 uppercase">
                                    {item.label}
                                  </div>
                                  {item.description && (
                                    <div class="text-xs text-neutral-500 mt-0.5">
                                      {item.description}
                                    </div>
                                  )}
                                </div>
                              )}
                            </Button>
                          </A>
                        );
                      }
                    )}
                  </div>
                </div>
              )
            )}
          </nav>
          {/* </ScrollArea> */}
        </div>
      </div>
    </>
  );
}
