import { createSignal, onMount, Show, For, JSX } from "solid-js";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from "~/components/ui/Command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/Dialog";
import LoadPage from "~/pages/load/Load";
import UploadPage from "~/pages/upload/Upload";
import ExportPage from "~/pages/export/Export";
import ClearPage from "~/pages/clear/Clear";
import TransformPage from "~/pages/transform/Transform";
import TokensPage from "~/pages/tokens/Tokens";

import Database from "lucide-solid/icons/database";
import Upload from "lucide-solid/icons/upload";
import Download from "lucide-solid/icons/download";
import Trash2 from "lucide-solid/icons/trash-2";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import Key from "lucide-solid/icons/key";

interface Command {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  icon: () => JSX.Element;
  component: () => JSX.Element;
}

const commands: Command[] = [
  {
    id: "load",
    label: "Explore",
    description: "Explore and load spaces",
    keywords: ["load", "explore", "space", "namespace", "browse"],
    icon: () => <Database class="w-4 h-4" />,
    component: () => <LoadPage />,
  },
  {
    id: "upload",
    label: "Import",
    description: "Upload data to spaces",
    keywords: ["upload", "import", "data", "file", "text", "url"],
    icon: () => <Upload class="w-4 h-4" />,
    component: () => <UploadPage />,
  },
  {
    id: "export",
    label: "Export",
    description: "Export spaces as files",
    keywords: ["export", "download", "save", "file"],
    icon: () => <Download class="w-4 h-4" />,
    component: () => <ExportPage />,
  },
  {
    id: "clear",
    label: "Clear",
    description: "Clear spaces",
    keywords: ["clear", "delete", "remove", "space"],
    icon: () => <Trash2 class="w-4 h-4" />,
    component: () => <ClearPage />,
  },
  {
    id: "transform",
    label: "Transform",
    description: "Transform spaces",
    keywords: ["transform", "convert", "modify"],
    icon: () => <RotateCcw class="w-4 h-4" />,
    component: () => <TransformPage />,
  },
  {
    id: "tokens",
    label: "Tokens",
    description: "Manage tokens",
    keywords: ["tokens", "auth", "authentication", "security"],
    icon: () => <Key class="w-4 h-4" />,
    component: () => <TokensPage />,
  },
];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const highlight = (text: string, query: string) => {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "ig"));
  return (
    <>
      {parts.map((part) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            class="bg-[rgba(0,212,255,0.15)] text-[#00d4ff] font-bold rounded px-0.5 shadow-[0_0_8px_rgba(0,212,255,0.2)]"
            data-highlighted
            part="match"
          >
            {part}
          </mark>
        ) : (
          <span>{part}</span>
        )
      )}
    </>
  );
};

export default function CommandPalette() {
  const [isOpen, setIsOpen] = createSignal(false);
  const [selectedCommand, setSelectedCommand] = createSignal<Command | null>(
    null
  );
  const [query, setQuery] = createSignal("");

  const handleSelectCommand = (command: Command) => {
    setSelectedCommand(command);
    setIsOpen(false);
  };
  const closeCommandDialog = () => setIsOpen(false);
  const closeComponentDialog = () => setSelectedCommand(null);

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        if (selectedCommand()) closeComponentDialog();
        else if (isOpen()) closeCommandDialog();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <>
      {/* Command Search Dialog */}
      <CommandDialog open={isOpen()} onOpenChange={closeCommandDialog}>
        <div class="rounded-xl border border-[rgba(0,212,255,0.15)] bg-[#07091a]/95 backdrop-blur-xl overflow-hidden shadow-[0_0_40px_rgba(0,212,255,0.1)]">
          {/* Compact Search Row */}
          <div class="flex items-center gap-3 px-4 py-3 border-b border-[rgba(0,212,255,0.1)] bg-[#0a0e1a]/60">
            <Database class="h-4 w-4 shrink-0 text-[#00d4ff] animate-pulse" />
            <CommandInput
              placeholder="Search MeTTa-KG commands..."
              class="border-0 focus:ring-0 shadow-none bg-transparent placeholder:text-[#5a6a85] text-[#e2e8f0] text-sm"
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
            <div class="ml-auto text-[11px] text-[#5a6a85] flex items-center gap-2 font-mono">
              <kbd class="px-2 py-0.5 bg-[rgba(0,212,255,0.05)] border border-[rgba(0,212,255,0.15)] rounded text-[#00d4ff]">
                ↵
              </kbd>
              <kbd class="px-2 py-0.5 bg-[rgba(0,212,255,0.05)] border border-[rgba(0,212,255,0.15)] rounded text-[#00d4ff]">
                Esc
              </kbd>
            </div>
          </div>

          {/* List */}
          <CommandList class="max-h-[360px] overflow-y-auto scrollbar-thin scrollbar-thumb-navy scrollbar-track-transparent">
            <CommandEmpty class="py-10 text-center text-sm text-[#8892a4]">
              No commands found. Try another search.
            </CommandEmpty>
            <div class="p-2 space-y-0.5">
              <For each={commands}>
                {(command) => (
                  <CommandItem
                    value={`${command.label} ${command.description} ${command.keywords.join(" ")}`.toLowerCase()}
                    onSelect={() => handleSelectCommand(command)}
                    class="group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 outline-none hover:bg-[rgba(0,212,255,0.08)] focus:bg-[rgba(0,212,255,0.08)] aria-selected:bg-[rgba(0,212,255,0.08)]"
                  >
                    <div class="flex items-center justify-center w-8 h-8 rounded-md bg-[#0d1120] text-[#00b894] border border-[rgba(0,212,255,0.1)] group-hover:border-[rgba(0,212,255,0.3)] group-hover:shadow-[0_0_12px_rgba(0,212,255,0.2)] group-hover:text-[#00d4ff] transition-all">
                      {command.icon()}
                    </div>
                    <div class="flex flex-col flex-1 min-w-0">
                      <div class="font-medium text-[#c4cfdf] truncate group-hover:text-[#00d4ff] transition-colors">
                        {highlight(command.label, query())}
                      </div>
                      <div class="text-[11px] text-[#5a6a85] truncate">
                        {highlight(command.description, query())}
                      </div>
                    </div>
                    <div class="text-[11px] text-[#00d4ff] opacity-0 group-hover:opacity-100 transition-opacity font-mono">
                      ↵
                    </div>
                  </CommandItem>
                )}
              </For>
            </div>
          </CommandList>
        </div>
      </CommandDialog>

      {/* Page Dialog - Adaptive sizing */}
      <Show when={selectedCommand()}>
        <Dialog open={true} onOpenChange={closeComponentDialog}>
          <DialogContent class="w-[90vw] md:w-[75vw] max-w-[900px] h-[86vh] bg-[#07091a] backdrop-blur-3xl border border-[rgba(0,212,255,0.2)] shadow-[0_0_60px_rgba(0,212,255,0.1)] rounded-2xl overflow-hidden flex flex-col p-0">
            {/* Compact Header */}
            <DialogHeader class="border-b border-[rgba(0,212,255,0.15)] px-6 py-4 bg-gradient-to-b from-[#0a0e1a] to-[#07091a] flex-shrink-0">
              <div class="flex items-center gap-4">
                <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-[rgba(0,212,255,0.08)] text-[#00d4ff] border border-[rgba(0,212,255,0.2)] shadow-[0_0_15px_rgba(0,212,255,0.15)] flex-shrink-0 animate-glow-pulse">
                  {selectedCommand()?.icon()}
                </div>
                <div class="flex-1 min-w-0">
                  <DialogTitle class="text-base font-bold text-[#e2e8f0] m-0 mb-1 leading-tight tracking-widest uppercase">
                    {selectedCommand()?.label}
                  </DialogTitle>
                  <div class="text-xs text-[#8892a4] leading-tight flex items-center gap-2">
                    <span class="w-1.5 h-1.5 rounded-full bg-[#00b894] animate-pulse"></span>
                    {selectedCommand()?.description}
                  </div>
                </div>
                <kbd class="px-2 py-1 bg-[rgba(0,212,255,0.05)] border border-[rgba(0,212,255,0.15)] shadow-[0_0_8px_rgba(0,212,255,0.1)] rounded text-[10px] text-[#00d4ff] font-mono flex-shrink-0">
                  Esc
                </kbd>
              </div>
            </DialogHeader>

            {/* Adaptive Content Wrapper */}
            <div class="flex-1 overflow-hidden min-h-0 relative">
              <Show
                when={selectedCommand()?.id === "load"}
                fallback={
                  <div class="absolute inset-0 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-navy">
                    <div class="p-4 md:p-6 min-h-full flex justify-center">
                      <div class="w-full max-w-3xl">
                        {selectedCommand()?.component()}
                      </div>
                    </div>
                  </div>
                }
              >
                <div class="absolute inset-0">
                  {selectedCommand()?.component()}
                </div>
              </Show>
            </div>
          </DialogContent>
        </Dialog>
      </Show>
    </>
  );
}
