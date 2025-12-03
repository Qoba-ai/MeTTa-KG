import { Component, Show, onCleanup, createUniqueId } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { CommandCard } from "~/components/common/CommandCard";
import { Button } from "~/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "~/components/ui/Card";
import {
  IntersectionInput as IntersectionInputComponent,
  Item,
} from "./components/IntersectionInput";
import { getAllTokens } from "~/lib/api";
import { rootToken, tokenRootNamespace } from "~/lib/state";
import { Copy, Check } from "lucide-solid";
import { isLoading, isPolling, executeIntersection, stopPolling } from "./lib";

const IntersectionPage: Component = () => {
  const [state, setState] = createStore({
    patterns: [
      { id: createUniqueId(), namespace: [""] },
      { id: createUniqueId(), namespace: [""] },
    ],
    templates: [{ id: createUniqueId(), namespace: [""] }],
    copied: false,
  });

  onCleanup(stopPolling);

  const addPattern = () => {
    setState("patterns", (prev) => [
      ...prev,
      { id: createUniqueId(), namespace: [""], value: "" },
    ]);
  };
  const removePattern = (id: string) => {
    setState("patterns", (prev) =>
      prev.length > 2 ? prev.filter((p) => p.id !== id) : prev
    );
  };
  const updatePattern = (id: string, value: string[]) => {
    setState(
      "patterns",
      produce((patterns: Item[]) => {
        const item = patterns.find((p) => p.id === id);
        if (item) {
          item.namespace = value;
        }
      })
    );
  };

  const addTemplate = () => {
    setState("templates", (prev) => [
      ...prev,
      { id: createUniqueId(), namespace: [""], value: "" },
    ]);
  };
  const removeTemplate = (id: string) => {
    setState("templates", (prev) => prev.filter((t) => t.id !== id));
  };
  const updateTemplate = (id: string, value: string[]) => {
    setState(
      "templates",
      produce((templates: Item[]) => {
        const item = templates.find((t) => t.id === id);
        if (item) {
          item.namespace = value;
        }
      })
    );
  };

  const canSubmit = () => {
    // Match Transform behavior: require at least one pattern value and one template value
    const hasPatternValue = state.patterns.length >= 2;
    const hasTemplateValue = state.templates.length === 1;

    return hasPatternValue && hasTemplateValue;
  };

  const buildTransformPreview = (patterns: Item[]) => {
    const patternExprs: string[] = [];
    const templatesExprs: string[] = [];

    patterns.forEach((_, index) => {
      // convert name space path to stringsItem
      const p_key = `<source-${(index + 1).toString()}> $${index.toString()}`;
      const t_key = `<target-0> $${index.toString()}`;
      patternExprs.push(`(${p_key})`);
      templatesExprs.push(`($${t_key})`);
    });

    return `(transform\n (, ${patternExprs.join(" ")})\n (, ${templatesExprs.join(" ")})\n)`;
  };

  const copyExpression = () => {
    const expr = buildTransformPreview(state.patterns);
    navigator.clipboard.writeText(expr);
    setState("copied", true);
    setTimeout(() => setState("copied", false), 2000);
  };

  const handleIntersection = async () => {
    const sources = state.patterns.map((p: Item) => p.namespace);
    const target = state.templates[0]?.namespace || [""];
    await executeIntersection(sources, target);
  };

  return (
    <div class="ml-10 mt-8">
      <CommandCard
        title="Intersection"
        description="Compute intersection across source namespaces into a target namespace"
      >
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 space-y-6">
            <IntersectionInputComponent
              type="patterns"
              items={state.patterns as Item[]}
              addItem={addPattern}
              removeItem={removePattern}
              updateItem={updatePattern}
              accentColor="primary"
              rootToken={!!rootToken()}
              tokenRootNamespace={tokenRootNamespace}
              getAllTokens={getAllTokens}
              description="Define patterns to intersect"
            />

            <IntersectionInputComponent
              type="templates"
              items={state.templates as Item[]}
              addItem={addTemplate}
              removeItem={removeTemplate}
              updateItem={updateTemplate}
              accentColor="primary"
              rootToken={!!rootToken()}
              tokenRootNamespace={tokenRootNamespace}
              getAllTokens={getAllTokens}
              description="Define templates for intersection"
            />
          </div>

          <div class="lg:col-span-1">
            <Card class="sticky top-4">
              <CardHeader>
                <CardTitle>S-Expression Preview</CardTitle>
                <CardDescription>
                  Conceptual transform for intersection
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre class="text-sm font-mono bg-muted p-3 rounded overflow-auto">
                  {buildTransformPreview(state.patterns)}
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
              </CardContent>
            </Card>
          </div>
          <Button
            class="w-full mt-4"
            disabled={!canSubmit() || isLoading() || isPolling()}
            onClick={handleIntersection}
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
                <Show when={isPolling()} fallback={"Run Intersection"}>
                  Waiting for results...
                </Show>
              }
            >
              Processing...
            </Show>
          </Button>
        </div>
      </CommandCard>
    </div>
  );
};

export default IntersectionPage;
