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
import { TransformInput as TransformInputComponent } from "~/pages/transform/components/TransformInput";
import { getAllTokens } from "~/lib/api";
import { rootToken, tokenRootNamespace, namespace } from "~/lib/state";
import { Copy, Check } from "lucide-solid";
import { isLoading, isPolling, executeIntersection, stopPolling } from "./lib";

interface Item {
  id: string;
  namespace: string[];
  value: string;
}

const IntersectionPage: Component = () => {
  const [state, setState] = createStore({
    patterns: [
      { id: createUniqueId(), namespace: [...namespace()], value: "" },
      { id: createUniqueId(), namespace: [...namespace()], value: "" },
    ],
    templates: [
      { id: createUniqueId(), namespace: [...namespace()], value: "" },
    ],
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
    setState("patterns", (prev) => (prev.length > 2 ? prev.filter((p) => p.id !== id) : prev));
  };
  const updatePattern = (
    id: string,
    field: "namespace" | "value",
    value: string | string[]
  ) => {
    setState(
      "patterns",
      produce((patterns: Item[]) => {
        const item = patterns.find((p) => p.id === id);
        if (item) {
          if (field === "namespace") item.namespace = value as string[];
          else item.value = value as string;
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
  const updateTemplate = (
    id: string,
    field: "namespace" | "value",
    value: string | string[]
  ) => {
    setState(
      "templates",
      produce((templates: Item[]) => {
        const item = templates.find((t) => t.id === id);
        if (item) {
          if (field === "namespace") item.namespace = value as string[];
          else item.value = value as string;
        }
      })
    );
  };

  const canSubmit = () => {
    // Match Transform behavior: require at least one pattern value and one template value
    const hasPatternValue = state.patterns.some(
      (p: Item) => (p.value || "").trim().length > 0
    );
    const hasTemplateValue = state.templates.some(
      (t: Item) => (t.value || "").trim().length > 0
    );
    return hasPatternValue && hasTemplateValue;
  };

  const buildTransformPreview = () => {
    const patterns = state.patterns
      .map((p: Item) => `(, ${p.value || ""})`)
      .join(" ");
    const templates = state.templates
      .map((t: Item) => `(, ${t.value || ""})`)
      .join(" ");
    return `(transform\n    ${patterns}\n    ${templates}\n)`;
  };

  const copyExpression = () => {
    const expr = buildTransformPreview();
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
      <CommandCard title="Intersection" description="Compute intersection across source namespaces into a target namespace">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 space-y-6">
            <TransformInputComponent
              type="patterns"
              items={state.patterns as Item[]}
              addItem={addPattern}
              removeItem={removePattern}
              updateItem={updatePattern as any}
              accentColor="primary"
              rootToken={!!rootToken()}
              tokenRootNamespace={tokenRootNamespace}
              getAllTokens={getAllTokens}
              description="Define patterns to intersect"
            />

            <TransformInputComponent
              type="templates"
              items={state.templates as Item[]}
              addItem={addTemplate}
              removeItem={removeTemplate}
              updateItem={updateTemplate as any}
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
                <CardDescription>Conceptual transform for intersection</CardDescription>
              </CardHeader>
              <CardContent>
                <pre class="text-sm font-mono bg-muted p-3 rounded overflow-auto">
                  {buildTransformPreview()}
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
                  Intersection runs server-side using selected namespaces.
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
                    fallback={<Show when={isPolling()} fallback={"Run Intersection"}>Waiting for results...</Show>}
                  >
                    Processing...
                  </Show>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </CommandCard>
    </div>
  );
};

export default IntersectionPage;
