import Network from "lucide-solid/icons/network";
import { Accessor } from "solid-js";
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
  return (
    <>
      <div
        class="relative flex flex-col w-64 h-full dot-grid"
        style={{
          background: "var(--sidebar-bg, #080c18)",
          "border-right":
            "1px solid var(--sidebar-border, rgba(0,212,255,0.1))",
        }}
      >
        {/* Subtle top gradient accent */}
        <div
          class="absolute top-0 left-0 right-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, #00d4ff 50%, transparent)",
          }}
        />

        {/* Logo */}
        <div
          class="px-4 pt-5 pb-4 border-b"
          style={{ "border-color": "rgba(0,212,255,0.08)" }}
        >
          <div class="flex items-center gap-3">
            <div
              class="flex items-center justify-center w-9 h-9 rounded-lg animate-glow-pulse"
              style={{
                background: "rgba(0,212,255,0.08)",
                border: "1px solid rgba(0,212,255,0.3)",
              }}
            >
              <Network class="h-5 w-5" style={{ color: "#00d4ff" }} />
            </div>
            <div>
              <h1
                class="font-bold text-base tracking-widest neon-text"
                style={{ "font-family": "Inter, sans-serif" }}
              >
                METTA-KG
              </h1>
              <div class="flex items-center gap-1.5 mt-0.5">
                <span
                  class="w-1.5 h-1.5 rounded-full animate-status-pulse"
                  style={{ background: "#00b894" }}
                />
                <p class="text-xs tracking-wider" style={{ color: "#4a5568" }}>
                  VERSION 0.1.0
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-hide">
          {sidebarSections.map(
            (
              section: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
            ) => (
              <div>
                <h3
                  class="text-xs font-semibold uppercase tracking-widest mb-2 px-2"
                  style={{ color: "rgba(0,212,255,0.45)" }}
                >
                  {section.title}
                </h3>
                <div
                  class="h-px mb-3 mx-2"
                  style={{ background: "rgba(0,212,255,0.07)" }}
                />
                <div class="space-y-0.5">
                  {section.items.map(
                    (
                      item: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
                    ) => {
                      const Icon = item.icon;
                      const isActive = () => activeTab() === item.id;
                      return (
                        <A href={item.to}>
                          <button
                            class={`
                              w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm
                              transition-all duration-200 cursor-pointer
                              ${
                                isActive()
                                  ? "sidebar-nav-active"
                                  : "text-[#8892a4] hover:text-[#c4cfdf] hover:bg-[rgba(0,212,255,0.04)]"
                              }
                            `}
                            style={
                              isActive()
                                ? {
                                    "border-left": "2px solid #00d4ff",
                                    color: "#00d4ff",
                                  }
                                : { "border-left": "2px solid transparent" }
                            }
                            onClick={() => setActiveTab(item.id)}
                          >
                            <span
                              class="flex items-center justify-center w-4 h-4 flex-shrink-0"
                              style={isActive() ? { color: "#00d4ff" } : {}}
                            >
                              {typeof Icon === "function" &&
                              Icon.name === undefined ? (
                                <Icon />
                              ) : (
                                <Icon class="h-4 w-4" />
                              )}
                            </span>
                            <span class="flex-1 text-left uppercase tracking-wide text-xs font-medium">
                              {item.label}
                            </span>
                            {isActive() && (
                              <span
                                class="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{
                                  background: "#00d4ff",
                                  "box-shadow": "0 0 6px #00d4ff",
                                }}
                              />
                            )}
                          </button>
                        </A>
                      );
                    }
                  )}
                </div>
              </div>
            )
          )}
        </nav>

        {/* Footer */}
        <div
          class="px-4 py-3 border-t"
          style={{ "border-color": "rgba(0,212,255,0.08)" }}
        >
          <p
            class="text-xs text-center"
            style={{ color: "rgba(0,212,255,0.25)" }}
          >
            MeTTa Knowledge Graph
          </p>
        </div>
      </div>
    </>
  );
}
