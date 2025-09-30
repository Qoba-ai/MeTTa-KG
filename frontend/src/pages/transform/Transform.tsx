import { Component, createSignal, Show } from "solid-js";
import MettaEditor from "../../components/common/MettaEditor";
import { CommandCard } from "~/components/common/CommandCard";
import { formatedNamespace } from "~/lib/state";
import { useTransform } from "./hooks/useTransform";

const TransformPage: Component = () => {
  const [sExpr, setSExpr] = createSignal(`(transform 
  (, $x)
  (, $x)
)`);

  //   const spacePath = formatedNamespace();
  const { isLoading, isPolling, executeTransform } =
    useTransform(formatedNamespace);

  const handleTransform = () => {
    executeTransform(sExpr());
  };
  const handleFileUpload = (_file: File) => {};

  return (
    <div class="ml-10 mt-8">
      <CommandCard
        title="Transform Data"
        description="Apply templates to matched patterns. Input S-Expression like: (transform (, (pattern)) (, (template)))"
      >
        <div class="space-y-4">
          <MettaEditor
            initialText={sExpr()}
            onTextChange={setSExpr}
            onFileUpload={handleFileUpload}
            parseErrors={[]}
            showActionButtons={false}
          />
        </div>

        <button
          onClick={handleTransform}
          disabled={isLoading() || isPolling() || !sExpr().trim()}
          class="inline-flex items-center justify-center w-[180px] h-10 mt-4 px-4 bg-primary text-primary-foreground font-medium text-sm rounded-md transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:hover:bg-muted"
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
        </button>
      </CommandCard>
    </div>
  );
};

export default TransformPage;
