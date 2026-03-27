import { createSignal, For, Show } from "solid-js";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "~/components/ui/Breadcrumb";
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/Command";
import { addTab } from "~/lib/state";

import Folder from "lucide-solid/icons/folder";
import Home from "lucide-solid/icons/home";
import ChevronRight from "lucide-solid/icons/chevron-right";

type TreeNode = {
  name: string;
  fullPath: string;
  linePrefix: string;
  description: string;
};

type NamespaceTreeNode = Map<string, NamespaceTreeNode>;

type Token = {
  namespace: string;
  description: string;
};

interface NameSpaceProps {
  namespace: string[];
  setNamespace: (ns: string[]) => void;
  rootToken: boolean;
  tokenRootNamespace: () => string[];
  getAllTokens: () => Promise<Token[]>;
}

export default function NameSpace(props: NameSpaceProps) {
  const [isExploring, setIsExploring] = createSignal(false);
  const [availablePaths, setAvailablePaths] = createSignal<TreeNode[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    path: string;
  } | null>(null);
  const [modifierKeyPressed, setModifierKeyPressed] = createSignal(false);

  const navigateTo = (index: number) => {
    const minIndex = props.tokenRootNamespace().length - 1;
    const targetIndex = Math.max(index, minIndex);
    const newNamespace = props.namespace.slice(0, targetIndex + 1);
    props.setNamespace(newNamespace);
    setContextMenu(null);
  };

  const discoverPaths = async () => {
    if (!props.rootToken) return;
    setIsExploring(true);
    setIsLoading(true);
    try {
      const allTokens = await props.getAllTokens();
      const currentPath =
        props.namespace.length <= 1
          ? "/"
          : "/" + props.namespace.slice(1).join("/");

      const normalizePath = (p: string) =>
        p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;

      const descriptionMap = new Map(
        allTokens.map((t) => [normalizePath(t.namespace), t.description])
      );

      const treeRoot = new Map<string, NamespaceTreeNode>();
      const descendantPaths = new Set<string>();
      for (const t of allTokens) {
        if (
          t.namespace.startsWith(currentPath) &&
          t.namespace !== currentPath
        ) {
          descendantPaths.add(t.namespace);
        }
      }

      descendantPaths.forEach((path) => {
        const relativePath = path
          .substring(currentPath.length)
          .replace(/^\//, "");
        let currentNode = treeRoot;
        const parts = relativePath.split("/").filter((p) => p.length > 0);
        parts.forEach((part) => {
          if (!currentNode.has(part)) {
            currentNode.set(part, new Map<string, NamespaceTreeNode>());
          }
          currentNode = currentNode.get(part)!;
        });
      });

      const flattenedTree: TreeNode[] = [];
      const flatten = (
        node: NamespaceTreeNode,
        path: string[],
        parentPrefix: string
      ) => {
        const childrenArray = Array.from(node.entries());
        childrenArray.forEach(([name, children], index) => {
          const isLast = index === childrenArray.length - 1;
          const connector = isLast ? "└── " : "├── ";
          const newPath = [...path, name];
          const fullPath = "/" + newPath.join("/");

          flattenedTree.push({
            name,
            fullPath,
            linePrefix: parentPrefix + connector,
            description: descriptionMap.get(normalizePath(fullPath)) || "",
          });

          const nextParentPrefix = parentPrefix + (isLast ? "    " : "│   ");
          flatten(children, newPath, nextParentPrefix);
        });
      };

      const basePath = props.namespace.slice(1);
      flatten(treeRoot, basePath, "");

      setAvailablePaths(flattenedTree);
    } catch (error) {
      console.error("Failed to discover paths:", error);
      setAvailablePaths([]);
    } finally {
      setIsLoading(false);
    }
  };

  const selectPath = (fullPath: string) => {
    const pathArray = fullPath.split("/").filter((p) => p.length > 0);
    if (modifierKeyPressed()) {
      addTab(["", ...pathArray]);
    } else {
      props.setNamespace(["", ...pathArray]);
    }
    setIsExploring(false);
    setModifierKeyPressed(false);
  };

  const handleRightClick = (e: MouseEvent, fullPath: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, path: fullPath });
  };

  const openInNewTab = (fullPath: string) => {
    const pathArray = fullPath.split("/").filter((p) => p.length > 0);
    addTab(["", ...pathArray]);
    setContextMenu(null);
  };

  const closeContextMenu = () => setContextMenu(null);

  return (
    <>
      <div>
        <Show when={props.rootToken}>
          <Breadcrumb>
            <BreadcrumbList class="flex items-center gap-0.5">
              <For each={props.namespace}>
                {(ns, index) => (
                  <>
                    <BreadcrumbItem>
                      <BreadcrumbLink
                        as="button"
                        onClick={() => navigateTo(index())}
                        class="transition-all duration-200 max-w-[150px] truncate flex items-center gap-1 px-2 py-1 rounded text-xs font-medium uppercase tracking-wider"
                        style={{
                          color:
                            index() === props.namespace.length - 1
                              ? "#00d4ff"
                              : "#8892a4",
                          background: "transparent",
                        }}
                        onMouseEnter={(e: MouseEvent) => {
                          (e.currentTarget as HTMLElement).style.color =
                            "#00d4ff";
                          (e.currentTarget as HTMLElement).style.background =
                            "rgba(0,212,255,0.06)";
                        }}
                        onMouseLeave={(e: MouseEvent) => {
                          (e.currentTarget as HTMLElement).style.color =
                            index() === props.namespace.length - 1
                              ? "#00d4ff"
                              : "#8892a4";
                          (e.currentTarget as HTMLElement).style.background =
                            "transparent";
                        }}
                        title={index() === 0 ? "Spaces" : ns}
                      >
                        {index() === 0 ? (
                          <Home
                            class="inline-block w-3.5 h-3.5"
                            color="#00d4ff"
                          />
                        ) : (
                          ns
                        )}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator>
                      <ChevronRight
                        class="w-3 h-3"
                        color="rgba(0,212,255,0.3)"
                      />
                    </BreadcrumbSeparator>
                  </>
                )}
              </For>
              <BreadcrumbItem>
                <button
                  onClick={discoverPaths}
                  class="px-1.5 py-0.5 rounded text-xs font-mono transition-all duration-200"
                  style={{ color: "rgba(0,212,255,0.45)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "#00d4ff";
                    (e.currentTarget as HTMLElement).style.background =
                      "rgba(0,212,255,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color =
                      "rgba(0,212,255,0.45)";
                    (e.currentTarget as HTMLElement).style.background =
                      "transparent";
                  }}
                  title="Show available subspaces"
                  aria-label="Show available subspaces"
                >
                  ···
                </button>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Show>

        <CommandDialog open={isExploring()} onOpenChange={setIsExploring}>
          <CommandInput placeholder="Filter spaces..." />
          <CommandList>
            <Show
              when={!isLoading()}
              fallback={<CommandEmpty>Loading spaces...</CommandEmpty>}
            >
              <CommandEmpty>No further spaces found.</CommandEmpty>
              <For each={availablePaths()}>
                {(item) => (
                  <CommandItem
                    class="flex justify-between items-center w-full"
                    onSelect={() => selectPath(item.fullPath)}
                    onMouseDown={(e: MouseEvent) => {
                      setModifierKeyPressed(e.ctrlKey || e.metaKey);
                    }}
                    onContextMenu={(e) => handleRightClick(e, item.fullPath)}
                  >
                    <div class="flex items-center font-mono text-sm whitespace-pre">
                      <span style={{ color: "rgba(0,212,255,0.35)" }}>
                        {item.linePrefix}
                      </span>
                      <Folder
                        class="mr-2 h-3.5 w-3.5 flex-shrink-0"
                        color="#00b894"
                      />
                      <span class="font-sans text-xs">{item.name}</span>
                    </div>
                    <span
                      class="text-xs truncate ml-4"
                      style={{ color: "#8892a4" }}
                      title={item.description}
                    >
                      {item.description.length > 20
                        ? item.description.slice(0, 25) + "…"
                        : item.description}
                    </span>
                  </CommandItem>
                )}
              </For>
            </Show>
          </CommandList>
        </CommandDialog>

        {/* Context Menu */}
        <Show when={contextMenu()}>
          {(menu) => (
            <div
              class="fixed rounded-lg shadow-2xl z-50 py-1 overflow-hidden glass-card"
              style={{
                left: `${menu().x}px`,
                top: `${menu().y}px`,
                "min-width": "160px",
              }}
            >
              <button
                class="block w-full px-4 py-2 text-left text-xs font-medium uppercase tracking-wide transition-all duration-150"
                style={{ color: "#c4cfdf" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#00d4ff";
                  (e.currentTarget as HTMLElement).style.background =
                    "rgba(0,212,255,0.06)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#c4cfdf";
                  (e.currentTarget as HTMLElement).style.background =
                    "transparent";
                }}
                onClick={() => openInNewTab(menu().path)}
              >
                Open in New Tab
              </button>
            </div>
          )}
        </Show>

        <Show when={contextMenu()}>
          <div class="fixed inset-0 z-40" onClick={closeContextMenu} />
        </Show>
      </div>
    </>
  );
}
