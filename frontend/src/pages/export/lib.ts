import { createSignal } from "solid-js";
import { showToast } from "~/components/ui/Toast";
import { exportSpace } from "~/lib/api";
import { Mm2Input } from "~/lib/types";

export const [uri, setUri] = createSignal("");
export const [format, setFormat] = createSignal("metta");
export const [isLoading, setIsLoading] = createSignal(false);
export const [pattern, setPattern] = createSignal("$x\n\n\n");
export const [template, setTemplate] = createSignal("$x\n\n\n");
export const [result, setResult] = createSignal<string | null>(null);
export const [exportError, setExportError] = createSignal<Error | null>(null);

export const handleExport = async (spacePath: string) => {
  const exportInput: Mm2Input = {
    pattern: pattern().trim() || "$x",
    template: template().trim() || "$x",
  };

  setIsLoading(true);
  setResult(null);
  setExportError(null);

  try {
    if (format() !== "metta") {
      showToast({
        title: "Format Not Supported Yet",
        description: `${format()} format not supported yet. Please use metta format.`,
        variant: "destructive",
      });
      return;
    }
    const exportResponse = await exportSpace(spacePath, exportInput);
    setResult(exportResponse || "()");
    showToast({
      title: "Export Complete",
      description: `Exported data with pattern: ${exportInput.pattern}`,
    });
  } catch (e) {
    const error = e instanceof Error ? e : new Error("Failed to export data");
    setExportError(error);
    setResult(error.message);
    showToast({
      title: "Error",
      description: error.message,
      variant: "destructive",
    });
  } finally {
    setIsLoading(false);
  }
};
