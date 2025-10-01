import { Component, Show } from "solid-js";
import { Button } from "~/components/ui/Button";
import { CommandCard } from "~/components/common/CommandCard";
import MettaEditor from "~/components/common/MettaEditor";
import Loader2 from "lucide-solid/icons/loader-2";
import { formatedNamespace } from "~/lib/state";
import {
  expression,
  setExpression,
  isLoading,
  handleClear,
} from "./clear.state";

const ClearPage: Component = () => {
  return (
    <div class="ml-10 mt-8">
      <CommandCard
        title="Clear Data"
        description="Removes data matching an expression from the current space. Default is '$x' (everything)."
      >
        <div class="space-y-4">
          <MettaEditor
            initialText={expression()}
            onTextChange={setExpression}
            showActionButtons={false}
            onPatternLoad={() => {}}
            parseErrors={[]}
          />

          <div class="flex items-center gap-4 pt-2">
            <Button
              onClick={() => handleClear(formatedNamespace())}
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
