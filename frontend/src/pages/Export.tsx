import { createSignal, Show, Component } from "solid-js";
import { Button } from "~/components/ui/button";
import { CommandCard } from "~/components/upload/commandCard";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { OutputViewer } from "~/components/upload/outputViewer";
import { showToast } from "~/components/ui/toast";
import Loader2 from "lucide-solid/icons/loader-2";
import Download from "lucide-solid/icons/download";
import MettaEditor from "~/components/space/MettaEditor";
import { exportSpace, ExportInput } from "~/lib/api";
import { formatedNamespace } from "~/lib/state";

const ExportPage: Component = () => {
  const [uri, setUri] = createSignal("");
  const [format, setFormat] = createSignal("metta");
  const [isLoading, setIsLoading] = createSignal(false);
  const [pattern, setPattern] = createSignal("$x\n\n\n");
  const [template, setTemplate] = createSignal("$x\n\n\n");
  const [result, setResult] =
    createSignal<any /* eslint-disable-line @typescript-eslint/no-explicit-any */>(
      null
    );

  const handleExport = async () => {
    const spacePath = formatedNamespace();

    // Create the export input with pattern and template
    const exportInput: ExportInput = {
      pattern: pattern().trim() || "$x", // Use user input or default
      template: template().trim() || "$x", // Use user input or default
    };

    setIsLoading(true);
    setResult(null);

    try {
      const exportResponse = await exportSpace(spacePath, exportInput);
      setResult(exportResponse || "()");
      showToast({
        title: "Export Complete 📂",
        description: `Exported data with pattern: ${exportInput.pattern}`,
      });
    } catch {
      showToast({
        title: "Error ☹️",
        description: "Failed to export data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div class="ml-10 mt-8">
      <CommandCard
        title="Export Data"
        description="Export data to a file in the specified format. Supports local files and remote URLs."
      >
        <div class="space-y-4">
          <div class="space-y-4">
            <TextField>
              <TextFieldLabel>Patterns</TextFieldLabel>
              <MettaEditor
                initialText={pattern()}
                onTextChange={setPattern}
                onPatternLoad={() => {}}
                parseErrors={[]}
                showActionButtons={false}
              />
            </TextField>
            <TextField>
              <TextFieldLabel>Templates</TextFieldLabel>
              <MettaEditor
                initialText={template()}
                onPatternLoad={() => {}}
                onTextChange={setTemplate}
                parseErrors={[]}
                showActionButtons={false}
              />
            </TextField>
          </div>

          <TextField class="space-y-2">
            <TextFieldLabel for="export-uri">Export URI</TextFieldLabel>
            <TextFieldInput
              id="export-uri"
              value={uri()}
              onChange={(e) => setUri(e.target.value)}
              placeholder="file:///..."
              disabled={isLoading()}
            />
          </TextField>

          <TextField class="space-y-2">
            <TextFieldLabel for="export-format">Format</TextFieldLabel>
            <Select
              options={["metta", "json", "csv", "raw"]}
              value={format()}
              onChange={setFormat}
              disabled={isLoading()}
              placeholder="Select a format"
              itemComponent={(props) => (
                <SelectItem item={props.item}>
                  {props.item.rawValue.toUpperCase()}
                </SelectItem>
              )}
            >
              <SelectTrigger id="export-format">
                <SelectValue<string>>
                  {(state) => state.selectedOption()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>
          </TextField>
        </div>

        <div class="mt-4">
          <Button
            onClick={handleExport}
            disabled={isLoading() || !pattern().trim() || !template().trim()}
            class="w-36"
          >
            <Show
              when={isLoading()}
              fallback={
                <>
                  <Download class="mr-2 h-4 w-4" />
                  Export Data
                </>
              }
            >
              <Loader2 class="mr-2 h-4 w-4 animate-spin" />
              Exporting...
            </Show>
          </Button>
        </div>

        <Show when={result()}>
          <div class="mt-4">
            <OutputViewer
              title="Export Result"
              data={result()}
              status={!result()?.error ? "success" : "error"}
            />
          </div>
        </Show>
      </CommandCard>
    </div>
  );
};

export default ExportPage;
