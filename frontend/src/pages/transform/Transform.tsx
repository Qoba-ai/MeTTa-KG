import { Component, createSignal, Show, onCleanup, For, Index } from "solid-js";
import { CommandCard } from "~/components/common/CommandCard";
import { Button } from "~/components/ui/Button";
import {
  TextField,
  TextFieldTextArea,
  TextFieldLabel,
} from "~/components/ui/TextField";
import { formatedNamespace } from "~/lib/state";
import { isLoading, isPolling, executeTransform, stopPolling } from "./lib";

interface TransformInput {
  patterns: string[];
  templates: string[];
}

const TransformPage: Component = () => {
  const [transformInput, setTransformInput] = createSignal<TransformInput>({
    patterns: ["$x"],
    templates: ["$x"],
  });

  onCleanup(stopPolling);

  const buildTransformSExpr = (patterns: string[], templates: string[]) => {
    const patternExprs = patterns.map((p) => `(, ${p})`).join(" ");
    const templateExprs = templates.map((t) => `(, ${t})`).join(" ");
    return `(transform ${patternExprs} ${templateExprs})`;
  };

  const handleTransform = () => {
    const sExpr = buildTransformSExpr(
      transformInput().patterns,
      transformInput().templates
    );
    executeTransform(sExpr, formatedNamespace());
  };

  const addPattern = () => {
    setTransformInput((prev) => ({
      ...prev,
      patterns: [...prev.patterns, ""],
    }));
  };

  const removePattern = (index: number) => {
    setTransformInput((prev) => ({
      ...prev,
      patterns: prev.patterns.filter((_, i) => i !== index),
    }));
  };

  const updatePattern = (index: number, value: string) => {
    setTransformInput((prev) => ({
      ...prev,
      patterns: prev.patterns.map((p, i) => (i === index ? value : p)),
    }));
  };

  const addTemplate = () => {
    setTransformInput((prev) => ({
      ...prev,
      templates: [...prev.templates, ""],
    }));
  };

  const removeTemplate = (index: number) => {
    setTransformInput((prev) => ({
      ...prev,
      templates: prev.templates.filter((_, i) => i !== index),
    }));
  };

  const updateTemplate = (index: number, value: string) => {
    setTransformInput((prev) => ({
      ...prev,
      templates: prev.templates.map((t, i) => (i === index ? value : t)),
    }));
  };

  const canTransform = () => {
    const input = transformInput();
    return (
      input.patterns.some((p) => p.trim()) &&
      input.templates.some((t) => t.trim())
    );
  };

  return (
    <div class="ml-10 mt-8">
      <CommandCard
        title="Transform Data"
        description="Apply templates to matched patterns. Add patterns and templates separately to create transform rules."
      >
        <div class="space-y-6">
          {/* Patterns Section */}
          <div class="space-y-3">
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
            <div class="space-y-2">
              <For each={transformInput().patterns}>
                {(pattern, index) => (
                  <div class="flex gap-2">
                    <TextField class="flex-1">
                      <TextFieldLabel class="text-xs text-muted-foreground">
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
                    <Show when={transformInput().patterns.length > 1}>
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

          {/* Templates Section */}
          <div class="space-y-3">
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
            <div class="space-y-2">
              <For each={transformInput().templates}>
                {(template, index) => (
                  <div class="flex gap-2">
                    <TextField class="flex-1">
                      <TextFieldLabel class="text-xs text-muted-foreground">
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
                    <Show when={transformInput().templates.length > 1}>
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

          {/* Generated S-Expression Preview */}
          <div class="space-y-2">
            <h3 class="text-sm font-semibold text-foreground">
              Generated Transform
            </h3>
            <div class="p-3 bg-muted rounded-md">
              <code class="text-xs font-mono text-muted-foreground break-all">
                {buildTransformSExpr(
                  transformInput().patterns,
                  transformInput().templates
                )}
              </code>
            </div>
          </div>
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
