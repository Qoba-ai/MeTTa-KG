import { Component, createSignal, onCleanup, Show } from 'solid-js';
import MettaEditor from '../components/space/MettaEditor';
import { OutputViewer } from "~/components/upload/outputViewer";
import { CommandCard } from "~/components/upload/commandCard";
import { transform, isPathClear, Transformation } from '~/lib/api';
import { namespace } from "~/lib/state";
import toast from 'solid-toast';

const TransformPage: Component = () => {
  const [sExpr, setSExpr] = createSignal(`(transform 
  (, (pattern $x))
  (, (template $x))
)`);
  const [isLoading, setIsLoading] = createSignal(false);
  const [isPolling, setIsPolling] = createSignal(false);
  const [result, setResult] = createSignal<any>(null);
  
  let pollingIntervalId: NodeJS.Timeout | null = null;

  const stopPolling = () => {
    if (pollingIntervalId) clearInterval(pollingIntervalId);
    pollingIntervalId = null;
    setIsPolling(false);
  };
  
  onCleanup(stopPolling);

  const startPolling = (spacePath: string) => {
    setIsPolling(true);
    pollingIntervalId = setInterval(async () => {
      try {
        const isClear = await isPathClear(spacePath);
        if (isClear) {
          stopPolling();
          setResult("Successfully transformed the space 🎉");
          toast.success("Transform completed!");
        }
      } catch (error) {
        setResult({ error: "Failed to fetch transformation status." });
        toast.error("Polling failed.");
        stopPolling();
      }
    }, 3000);
  };

  const handleTransform = async () => {
    if (!sExpr().trim()) {
      toast.error("Please enter a transform expression.");
      return;
    }
    
    
    setIsLoading(true);
    setResult(null);
    stopPolling();

    let spacePath = namespace().join("/");
    
    const filteredNamespace = namespace().filter(part => part.trim() !== "");
    if (filteredNamespace.length === 0) {
      // Use root space if no namespace is set
      spacePath = "";
    } else {
      spacePath = filteredNamespace.join("/");
    }

    try {
      const pathIsClear = await isPathClear(spacePath);
      
      if (!pathIsClear) {
        toast.error("The space is currently busy. Please wait.");
        setResult({ error: "The space is currently busy. Please wait." });
        setIsLoading(false);
        return;
      }

      // Create transformation using existing API structure
      const transformation: Transformation = {
        space: spacePath,
        patterns: [sExpr()],
        templates: [sExpr()]
      };


      const success = await transform(transformation);
      
      if (success) {
        toast.success("Transform initiated successfully");
        setResult("Transformation in progress...");
        startPolling(spacePath);
      } else {
        setResult({ error: "Failed to initiate transformation." });
        toast.error("Transform failed");
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
      setResult({ error: errorMessage });
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (file: File) => {
  };

  return (
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
          <Show when={isLoading()} fallback={
            <Show when={isPolling()} fallback={"Run Transform"}>
              Waiting for results...
            </Show>
          }>
            Transforming...
          </Show>
        </button>

        <Show when={result()}>
          {(res) => (
            <OutputViewer
              title="Transform Results"
              data={res()}
              status={res().error ? 'error' : 'success'}
            />
          )}
        </Show>
    </CommandCard>
  );
};

export default TransformPage;