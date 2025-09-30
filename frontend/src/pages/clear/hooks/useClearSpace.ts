import { createSignal } from "solid-js";
import { showToast } from "~/components/ui/Toast";
import { clearSpace } from "../lib/api";

export function useClearSpace(spacePath: () => string) {
  const [isLoading, setIsLoading] = createSignal(false);

  const executeClear = async (expression: string) => {
    if (!expression.trim()) {
      showToast({
        title: "Input Required",
        description: "Please enter an expression to clear.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const success = await clearSpace(spacePath());

      if (success) {
        showToast({
          title: "Cleared Successfully 🧹",
          description: `Space "${spacePath()}" has been cleared.`,
        });
      } else {
        showToast({
          title: "Clear Operation Failed ☹️",
          description: `Could not clear space "${spacePath()}". Check server logs for details.`,
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

  return { isLoading, executeClear };
}
