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
import { getAllTokens } from "~/lib/api";
import {
  rootToken,
  namespace,
  setNamespace,
  tokenRootNamespace,
} from "~/lib/state";

import Folder from "lucide-solid/icons/folder";
import Home from "lucide-solid/icons/home";

type TreeNode = {
  name: string;
  fullPath: string;
  linePrefix: string;
  description: string;
};

export default function NameSpace() {
  const [isExploring, setIsExploring] = createSignal(false);
  const [availablePaths, setAvailablePaths] = createSignal<TreeNode[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);

  const navigateTo = (index: number) => {
    const minIndex = tokenRootNamespace().length - 1;
    const targetIndex = Math.max(index, minIndex);
    setNamespace((ns) => ns.slice(0, targetIndex + 1));
  };
  const discoverPaths = async () => {
    if (!rootToken()) return;

    setIsExploring(true);
    setIsLoading(true);

    try {
      const allTokens = await getAllTokens();
      const currentPath =
        namespace().length <= 1 ? "/" : "/" + namespace().slice(1).join("/");

      const normalizePath = (p: string) =>
        p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;

      const descriptionMap = new Map(
        allTokens.map((t) => [normalizePath(t.namespace), t.description])
      );

      const treeRoot = new Map<
        string,
        any /* eslint-disable-line @typescript-eslint/no-explicit-any */
      >();
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
            currentNode.set(
              part,
              new Map<
                string,
                any /* eslint-disable-line @typescript-eslint/no-explicit-any */
              >()
            );
          }
          currentNode = currentNode.get(part)!;
        });
      });

      const flattenedTree: TreeNode[] = [];
      const flatten = (
        node: Map<
          string,
          any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        >,
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
            // Look up the description using the same normalization
            description: descriptionMap.get(normalizePath(fullPath)) || "",
          });

          const nextParentPrefix = parentPrefix + (isLast ? "    " : "│   ");
          flatten(children, newPath, nextParentPrefix);
        });
      };

      const basePath = namespace().slice(1);
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
    setNamespace(["", ...pathArray]);
    setIsExploring(false);
  };

  return (
    <>
      <div>
        <Show when={rootToken()}>
          <Breadcrumb>
            <BreadcrumbList class="flex items-center">
              <For each={namespace()}>
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
      </div>
    </>
  );
}
