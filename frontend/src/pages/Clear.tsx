import { Component, createSignal, Show } from "solid-js";
import { Button } from "~/components/ui/Button";
import { CommandCard } from "~/components/upload/CommandCard";
import { showToast } from "~/components/ui/Toast";
import Loader2 from "lucide-solid/icons/loader-2";
import { formatedNamespace } from "~/lib/state";
import { clearSpace } from "~/lib/api";
import MettaEditor from "~/components/space/MettaEditor";

const ClearPage: Component = () => {
  const [isLoading, setIsLoading] = createSignal(false);
  const [expression, setExpression] = createSignal("$x \n \n \n");

  const handleClear = async () => {
    if (!expression().trim()) {
      showToast({
        title: "Input Required",
        description: "Please enter an expression to clear.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const pathToClear = formatedNamespace();

    try {
      const success = await clearSpace(pathToClear);

      if (success) {
        showToast({
          title: "Cleared Successfully 🧹",
          description: `Space "${pathToClear}" has been cleared.`,
        });
      } else {
        showToast({
          title: "Clear Operation Failed ☹️",
          description: `Could not clear space "${pathToClear}". Check server logs for details.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.";
      showToast({
        title: "API Error ☹️",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div class="ml-10 mt-8">
      <CommandCard
        title="Clear Data"
        description="Removes data matching an expression from the current space. Default is '$x' (everything)."
      >
        <div class="space-y-4">
          {/* Use MettaEditor */}
          <MettaEditor
            initialText={expression()}
            onTextChange={setExpression}
            showActionButtons={false}
            onPatternLoad={() => {}}
            parseErrors={[]}
          />

          <div class="flex items-center gap-4 pt-2">
            <Button
              onClick={handleClear}
              disabled={isLoading() || !expression().trim()}
              variant="destructive"
              class="w-36"
            >
              <Show when={isLoading()} fallback={"Clear Data"}>
                <Loader2 class="animate-spin mr-2" />
                Clearing...
              </Show>
            </Button>
            <p class="text-sm text-muted-foreground">
              This will permanently delete all matching data.
            </p>
          </div>
        </div>
      </CommandCard>
    </div>
  );
};

export default ClearPage;
