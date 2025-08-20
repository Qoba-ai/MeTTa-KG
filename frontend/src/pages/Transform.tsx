import { Component, createSignal, onCleanup, Show } from 'solid-js';

// UI Components from provided files
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import MettaEditor from '../components/space/MettaEditor';

// Assumed API functions
// import { transformData, isPathClear } from '@/lib/mork-api';

/**
 * A simple component to display formatted output, styled with Tailwind CSS.
 */
const OutputViewer: Component<{ title: string; data: any; status: 'success' | 'error' }> = (props) => {
  const dataString = typeof props.data === 'string' ? props.data : JSON.stringify(props.data, null, 2);
  const titleColorClass = props.status === 'error' ? 'text-destructive' : 'text-foreground';
  const borderColorClass = props.status === 'error' ? 'border-destructive' : 'border-border';

  return (
    <div class="mt-4">
      <h3 class={`font-semibold text-sm mb-2 ${titleColorClass}`}>
        {props.title}
      </h3>
      <pre class={`bg-muted border rounded-md p-3 text-xs text-muted-foreground whitespace-pre-wrap break-all ${borderColorClass}`}>
        <code>{dataString}</code>
      </pre>
    </div>
  );
};

/**
 * The main TransformCommand component, now styled using Tailwind CSS.
 */
const Transform: Component<{ isUnderConstruction?: boolean }> = (props) => {
  const [sExpr, setSExpr] = createSignal("(Node Node) \n \n \n \n \n \n \n");
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

  const startPolling = (expr: string) => {
    setIsPolling(true);
    pollingIntervalId = setInterval(async () => {
      try {
        const isClear = await isPathClear(expr);
        if (isClear) {
          stopPolling();
          setResult("Successfully transformed the space 🎉");
        }
      } catch (error) {
        console.error("Status polling error:", error);
        setResult({ error: "Failed to fetch transformation status." });
        stopPolling();
      }
    }, 3000);
  };

  const handleTransform = async () => {
    setIsLoading(true);
    setResult(null);
    stopPolling();

    try {
      const response = await transformData(sExpr());
      if (response.status === "success") {
        console.log("Transformation Initiated:", response.message);
        startPolling(sExpr());
      } else {
        setResult({ error: response.message || "Failed to initiate transformation." });
      }
    } catch (error) {
      console.error("Unknown Transform Error:", error);
      setResult({ error: "An unexpected error occurred." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (file: File) => {
    console.log("File upload not implemented.", file.name);
  };

  return (
    <Card class="max-w-4xl">
      <CardHeader>
        <CardTitle>Transform Data</CardTitle>
        <CardDescription>
          Apply templates to matched patterns. Input S-Expression.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
};

export default Transform;