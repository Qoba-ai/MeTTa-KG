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
import { setNamespace, addTab } from "~/lib/state";

import Folder from "lucide-solid/icons/folder";
import Home from "lucide-solid/icons/home";

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

    setNamespace(newNamespace);

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
      setNamespace(["", ...pathArray]);
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
            <BreadcrumbList class="flex items-center">
              <For each={props.namespace}>
                {(ns, index) => (
                  <>
                    <BreadcrumbItem>
                      <BreadcrumbLink
                        as="button"
                        onClick={() => navigateTo(index())}
                        class="text-neutral-300 hover:text-primary transition-colors max-w-[150px] truncate flex items-center"
                        title={index() === 0 ? "Spaces" : ns}
                      >
                        {index() === 0 ? (
                          <Home class="inline-block w-4 h-4" />
                        ) : (
                          ns
                        )}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                  </>
                )}
              </For>
              <BreadcrumbItem>
                <button
                  onClick={discoverPaths}
                  class="ml-1 p-1 rounded text-neutral-400 hover:bg-neutral-800 hover:text-primary transition-colors"
                  title="Show available subspaces"
                  aria-label="Show available subspaces"
                >
                  ...
                </button>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Show>

        <CommandDialog open={isExploring()} onOpenChange={setIsExploring}>
          <CommandInput placeholder="Type to filter or select a space..." />
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
                      <span class="text-muted-foreground">
                        {item.linePrefix}
                      </span>
                      <Folder class="mr-2 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <span class="font-sans">{item.name}</span>
                    </div>
                    <span
                      class="text-xs text-muted-foreground truncate ml-4"
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
              class="fixed bg-neutral-800 border border-neutral-700 rounded-md shadow-lg z-50 py-1"
              style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
            >
              <button
                class="block w-full px-4 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white"
                onClick={() => openInNewTab(menu().path)}
              >
                Open in New Tab
              </button>
            </div>
          )}
        </Show>

        {/* Click outside to close context menu */}
        <Show when={contextMenu()}>
          <div class="fixed inset-0 z-40" onClick={closeContextMenu} />
        </Show>
      </div>
    </>
  );
}
