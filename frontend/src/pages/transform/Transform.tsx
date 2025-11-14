import {
  Component,
  createSignal,
  Show,
  onCleanup,
  For,
  Index,
  createMemo,
} from "solid-js";
import { CommandCard } from "~/components/common/CommandCard";
import { Button } from "~/components/ui/Button";
import {
  TextField,
  TextFieldTextArea,
  TextFieldLabel,
} from "~/components/ui/TextField";
import NameSpace from "~/pages/index/components/NameSpace";
import { formatedNamespace } from "~/lib/state";
import { isLoading, isPolling, executeTransform, stopPolling } from "./lib";

interface TransformInput {
  patterns: string[];
  templates: string[];
}

const TransformPage: Component = () => {
  const [showGeneratedTransform, setShowGeneratedTransform] =
    createSignal(false);
  const [patterns, setPatterns] = createSignal<string[]>(["$x"]);
  const [templates, setTemplates] = createSignal<string[]>(["$x"]);

  const transformInput = createMemo(() => ({
    patterns: patterns(),
    templates: templates(),
  }));

  onCleanup(stopPolling);

  const buildTransformSExpr = (patterns: string[], templates: string[]) => {
    const patternExprs = patterns.map((p) => `(, ${p})`).join(" ");
    const templateExprs = templates.map((t) => `(, ${t})`).join(" ");
    return `(transform ${patternExprs} ${templateExprs})`;
  };

  const handleTransform = () => {
    const sExpr = buildTransformSExpr(patterns(), templates());
    executeTransform(sExpr, formatedNamespace());
  };

  const addPattern = () => {
    setPatterns((prev) => [...prev, ""]);
  };

  const removePattern = (index: number) => {
    setPatterns((prev) => prev.filter((_, i) => i !== index));
  };

  const updatePattern = (index: number, value: string) => {
    setPatterns((prev) => {
      const newPatterns = [...prev];
      newPatterns[index] = value;
      return newPatterns;
    });
  };

  const addTemplate = () => {
    setTemplates((prev) => [...prev, ""]);
  };

  const removeTemplate = (index: number) => {
    setTemplates((prev) => prev.filter((_, i) => i !== index));
  };

  const updateTemplate = (index: number, value: string) => {
    setTemplates((prev) => {
      const newTemplates = [...prev];
      newTemplates[index] = value;
      return newTemplates;
    });
  };

  const canTransform = () => {
    return (
      patterns().some((p) => p.trim()) && templates().some((t) => t.trim())
    );
  };

  return (
    <div class="ml-10 mt-8">
      <CommandCard
        title="Transform Data"
        description="Apply templates to matched patterns. Add patterns and templates separately to create transform rules."
      >
        <div class="space-y-6">
          {/* Two-Column Layout */}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Patterns */}
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-semibold text-foreground">Patterns</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addPattern}
                  class="text-xs"
                >
                  Add Pattern
                </Button>
              </div>

              {/* Namespace Selector for Patterns */}
              <div class="p-3 bg-muted/50 rounded-md">
                <div class="flex items-center gap-3">
                  <span class="text-sm text-muted-foreground min-w-fit">
                    Pattern Namespace:
                  </span>
                  <div class="flex-1">
                    <NameSpace />
                  </div>
                </div>
              </div>

              {/* Pattern Inputs */}
              <div class="space-y-2">
                <For each={patterns()}>
                  {(pattern, index) => (
                    <div class="flex gap-2">
                      <TextField class="flex-1">
                        <TextFieldLabel class="text-sm text-muted-foreground">
                          Pattern {index() + 1}
                        </TextFieldLabel>
                        <TextFieldTextArea
                          value={pattern}
                          onInput={(e) =>
                            updatePattern(index(), e.currentTarget.value)
                          }
                          placeholder="Enter pattern (e.g., $x, ($y $z))"
                          class="min-h-[60px] text-sm font-mono"
                        />
                      </TextField>
                      <Show when={patterns().length > 1}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePattern(index())}
                          class="mt-6 text-destructive hover:text-destructive"
                        >
                          Remove
                        </Button>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </div>

            {/* Right Column - Templates */}
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-semibold text-foreground">Templates</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addTemplate}
                  class="text-xs"
                >
                  Add Template
                </Button>
              </div>

              {/* Namespace Selector for Templates */}
              <div class="p-3 bg-muted/50 rounded-md">
                <div class="flex items-center gap-3">
                  <span class="text-sm text-muted-foreground min-w-fit">
                    Template Namespace:
                  </span>
                  <div class="flex-1">
                    <NameSpace />
                  </div>
                </div>
              </div>

              {/* Template Inputs */}
              <div class="space-y-2">
                <For each={templates()}>
                  {(template, index) => (
                    <div class="flex gap-2">
                      <TextField class="flex-1">
                        <TextFieldLabel class="text-sm text-muted-foreground">
                          Template {index() + 1}
                        </TextFieldLabel>
                        <TextFieldTextArea
                          value={template}
                          onInput={(e) =>
                            updateTemplate(index(), e.currentTarget.value)
                          }
                          placeholder="Enter template (e.g., $x, ($z $y))"
                          class="min-h-[60px] text-sm font-mono"
                        />
                      </TextField>
                      <Show when={templates().length > 1}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeTemplate(index())}
                          class="mt-6 text-destructive hover:text-destructive"
                        >
                          Remove
                        </Button>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>

          {/* Generated S-Expression Preview - Behind Feature Flag */}
          <Show when={showGeneratedTransform()}>
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-semibold text-foreground">
                  Generated Transform
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowGeneratedTransform(false)}
                  class="text-xs text-muted-foreground"
                >
                  Hide
                </Button>
              </div>
              <div class="p-3 bg-muted rounded-md">
                <code class="text-xs font-mono text-muted-foreground break-all">
                  {buildTransformSExpr(patterns(), templates())}
                </code>
              </div>
            </div>
          </Show>

          {/* Show Generated Transform Button */}
          <Show when={!showGeneratedTransform()}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowGeneratedTransform(true)}
              class="text-xs"
            >
              Show Generated Transform
            </Button>
          </Show>
        </div>

        <Button
          onClick={handleTransform}
          disabled={isLoading() || isPolling() || !canTransform()}
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
              <Show when={isPolling()} fallback={"Run Transform"}>
                Waiting for results...
              </Show>
            }
          >
            Transforming...
          </Show>
        </Button>
      </CommandCard>
    </div>
  );
};

export default TransformPage;
