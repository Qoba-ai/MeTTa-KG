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
            class="bg-primary/20 text-primary font-semibold rounded px-0.5"
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
        <div class="rounded-xl ring-1 ring-white/10 bg-neutral-900/95 backdrop-blur-xl overflow-hidden">
          {/* Compact Search Row */}
          <div class="flex items-center gap-2 px-3 py-3 border-b border-neutral-800/80 bg-neutral-950/40">
            <Database class="h-4 w-4 shrink-0 text-neutral-400" />
            <CommandInput
              placeholder="Search commands..."
              class="border-0 focus:ring-0 shadow-none bg-transparent placeholder:text-neutral-500"
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
            <div class="ml-auto text-[11px] text-neutral-500 flex items-center gap-1">
              <kbd class="px-1.5 py-0.5 bg-neutral-800 rounded text-[10px]">
                ↵
              </kbd>
              <kbd class="px-1.5 py-0.5 bg-neutral-800 rounded text-[10px]">
                Esc
              </kbd>
            </div>
          </div>

          {/* List */}
          <CommandList class="max-h-[360px] overflow-y-auto">
            <CommandEmpty class="py-8 text-center text-sm text-neutral-400">
              No commands found.
            </CommandEmpty>
            <div class="p-2">
              <For each={commands}>
                {(command) => (
                  <CommandItem
                    value={`${command.label} ${command.description} ${command.keywords.join(" ")}`.toLowerCase()}
                    onSelect={() => handleSelectCommand(command)}
                    class="group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors hover:bg-neutral-800/70 focus:bg-neutral-800/70"
                  >
                    <div class="flex items-center justify-center w-8 h-8 rounded bg-neutral-800 text-neutral-300 group-hover:text-white transition-colors">
                      {command.icon()}
                    </div>
                    <div class="flex flex-col flex-1 min-w-0">
                      <div class="font-medium text-white truncate">
                        {highlight(command.label, query())}
                      </div>
                      <div class="text-xs text-neutral-200 truncate">
                        {highlight(command.description, query())}
                      </div>
                    </div>
                    <div class="text-[11px] text-neutral-500 font-mono">↵</div>
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
          <DialogContent class="w-[90vw] md:w-[75vw] max-w-[900px] h-[86vh] bg-neutral-950 backdrop-blur-xl border border-neutral-800 ring-1 ring-white/10 shadow-2xl rounded-2xl overflow-hidden flex flex-col">
            {/* Compact Header */}
            <DialogHeader class="border-b border-neutral-800 px-5 py-3 bg-gradient-to-b from-neutral-950 to-neutral-950/80 flex-shrink-0">
              <div class="flex items-center gap-3">
                <div class="flex items-center justify-center w-8 h-8 rounded bg-primary/10 text-primary flex-shrink-0">
                  {selectedCommand()?.icon()}
                </div>
                <div class="flex-1 min-w-0">
                  <DialogTitle class="text-base font-medium text-white m-0 leading-tight">
                    {selectedCommand()?.label}
                  </DialogTitle>
                  <div class="text-xs text-neutral-400 leading-tight">
                    {selectedCommand()?.description}
                  </div>
                </div>
                <kbd class="px-2 py-1 bg-neutral-800 rounded text-[10px] text-neutral-500 font-mono flex-shrink-0">
                  Esc
                </kbd>
              </div>
            </DialogHeader>

            {/* Adaptive Content Wrapper */}
            <div class="flex-1 overflow-hidden min-h-0 relative">
              <Show
                when={selectedCommand()?.id === "load"}
                fallback={
                  <div class="absolute inset-0 overflow-y-auto scrollbar-thin scrollbar-track-neutral-950 scrollbar-thumb-neutral-700">
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
