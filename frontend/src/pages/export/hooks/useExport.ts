import { createSignal } from "solid-js";
import { showToast } from "~/components/ui/Toast";
import { exportSpace } from "../lib/api";
import { ExportInput } from "../lib/types";

export function useExport(spacePath: () => string) {
  const [uri, setUri] = createSignal("");
  const [format, setFormat] = createSignal("metta");
  const [isLoading, setIsLoading] = createSignal(false);
  const [pattern, setPattern] = createSignal("$x\n\n\n");
  const [template, setTemplate] = createSignal("$x\n\n\n");
  const [result, setResult] = createSignal<string | null>(null);
  const [exportError, setExportError] = createSignal<Error | null>(null); // Add error state

  const handleExport = async () => {
    const exportInput: ExportInput = {
      pattern: pattern().trim() || "$x",
      template: template().trim() || "$x",
    };

    setIsLoading(true);
    setResult(null);
    setExportError(null);

    try {
      const exportResponse = await exportSpace(spacePath(), exportInput);
      setResult(exportResponse || "()");
      showToast({
        title: "Export Complete 📂",
        description: `Exported data with pattern: ${exportInput.pattern}`,
      });
    } catch (e) {
      const error = e instanceof Error ? e : new Error("Failed to export data");
      setExportError(error);
      setResult(error.message);
      showToast({
        title: "Error ☹️",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return {
    uri,
    setUri,
    format,
    setFormat,
    isLoading,
    pattern,
    setPattern,
    template,
    setTemplate,
    result,
    exportError,
    handleExport,
  };
}
