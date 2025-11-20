import { Component, Show, onCleanup, createUniqueId } from "solid-js";
import { createStore, produce, Store } from "solid-js/store";
import { CommandCard } from "~/components/common/CommandCard";
import { Button } from "~/components/ui/Button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/Card";
import { formatedNamespace } from "~/lib/state";
import { getAllTokens } from "~/lib/api";
import { rootToken, tokenRootNamespace } from "~/lib/state";
import {
  isLoading,
  isPolling,
  executeComposition,
  stopPolling,
  setOperationInput,
} from "./lib";
import { Copy, Check } from "lucide-solid";
import {
  Item,
  CompositionInput as CompositionInputComponent,
} from "./components/CompositionInput";

interface AppState {
  sources: Item[];
  target: Item[];
  copied: boolean;
}

const CompositionPage: Component = () => {
  const [state, setState] = createStore({
    sources: [{ id: createUniqueId(), namespace: ["/"] }],
    target: [{ id: createUniqueId(), namespace: ["/"] }],
    copied: false,
  });

  onCleanup(stopPolling);

  const buildCompositionSExpr = (sources: Item[], target: Item[]) => {
    const sourceExprs: string[] = [];
    const targetExprs: string[] = [];

    sources.forEach((_, index) => {
      const letter = String.fromCharCode(97 + index); // a, b, c...
      sourceExprs.push(`(<source-${(index + 1).toString()}> $${letter})`);
      targetExprs.push(`$${letter}`);
    });

    const targetName = target.length > 0 ? "<target>" : "<target>";

    return `(transform\n (, ${sourceExprs.join(" ")})\n (, (${targetName} ${targetExprs.join(" ")}))\n)`;
  };

  const buildCompositionSetInput = (state: Store<AppState>) => {
    const source: string[] = [];
    const target: string[] = [];

    const normalizeNamespace = (ns: string[]): string[] => {
      return ns.length > 1 && ns[0] === "/" ? ns.slice(1) : ns;
    };

    state.sources.forEach((s) => {
      source.push(normalizeNamespace(s.namespace).join("/"));
    });

    state.target.forEach((t) => {
      target.push(normalizeNamespace(t.namespace).join("/"));
    });
    return {
      source,
      target,
    };
  };

  const handleComposition = () => {
    const compositionQueryInput: setOperationInput =
      buildCompositionSetInput(state);
    executeComposition(compositionQueryInput, formatedNamespace());
  };

  const addSource = () => {
    setState("sources", (prev) => [
      ...prev,
      { id: createUniqueId(), namespace: ["/"] },
    ]);
  };

  const removeSource = (id: string) => {
    setState("sources", (prev) => prev.filter((s) => s.id !== id));
  };

  const updateSource = (id: string, field: "namespace", value: string[]) => {
    setState(
      "sources",
      produce((sources) => {
        const item = sources.find((s) => s.id === id);
        if (item) item[field] = value;
      })
    );
  };

  const removeTarget = (_id: string) => {
    // Don't allow removing the last target
  };

  const updateTarget = (id: string, field: "namespace", value: string[]) => {
    setState(
      "target",
      produce((target) => {
        const item = target.find((t) => t.id === id);
        if (item) item[field] = value;
      })
    );
  };

  const canCompose = () => {
    return state.target.length === 1;
  };

  const copyExpression = () => {
    navigator.clipboard.writeText(
      buildCompositionSExpr(state.sources, state.target)
    );
    setState("copied", true);
    setTimeout(() => setState("copied", false), 2000);
  };

  return (
    <div class="ml-10 mt-8">
      <CommandCard
        title="Composition Builder"
        description="Compose multiple namespaces into a single target namespace"
      >
        <div class="space-y-6">
          {/* Responsive Layout */}
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Builder - 2/3 */}
            <div class="lg:col-span-2 space-y-6">
              <CompositionInputComponent
                type="sources"
                items={state.sources}
                addItem={addSource}
                removeItem={removeSource}
                updateItem={updateSource}
                accentColor="primary"
                rootToken={rootToken()}
                tokenRootNamespace={tokenRootNamespace}
                getAllTokens={getAllTokens}
              />

              <CompositionInputComponent
                type="target"
                items={state.target}
                addItem={() => {}}
                removeItem={removeTarget}
                updateItem={updateTarget}
                accentColor="primary"
                rootToken={rootToken()}
                tokenRootNamespace={tokenRootNamespace}
                getAllTokens={getAllTokens}
              />
            </div>

            {/* Preview - 1/3 */}
            <div class="lg:col-span-1">
              <Card class="sticky top-4">
                <CardHeader>
                  <CardTitle>S-Expression Preview</CardTitle>
                  <CardDescription>
                    Live output of your composition
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <pre class="text-sm font-mono bg-muted p-3 rounded overflow-auto">
                    {buildCompositionSExpr(state.sources, state.target)}
                  </pre>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={copyExpression}
                    class="w-full mt-4"
                  >
                    {state.copied ? (
                      <Check class="w-4 h-4 mr-2" />
                    ) : (
                      <Copy class="w-4 h-4 mr-2" />
                    )}
                    {state.copied ? "Copied!" : "Copy Expression"}
                  </Button>
                  <div class="mt-4 p-3 bg-muted/50 rounded text-sm text-muted-foreground">
                    Composition combines sources into target using variables.
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <Button
          onClick={handleComposition}
          disabled={isLoading() || isPolling() || !canCompose()}
          class="inline-flex items-center justify-center w-[180px] h-10 mt-4"
        >
          <Show when={isLoading() || isPolling()}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="animate-spin mr-2 h-4 w-4"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </Show>
          <Show
            when={isLoading()}
            fallback={
              <Show when={isPolling()} fallback={"Run Composition"}>
                Waiting for results...
              </Show>
            }
          >
            Performing Composition...
          </Show>
        </Button>
      </CommandCard>
    </div>
  );
};

export default CompositionPage;
