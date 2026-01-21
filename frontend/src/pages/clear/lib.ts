import { createSignal } from "solid-js";
import { showToast } from "~/components/ui/Toast";
import { clearSpace } from "~/lib/api";
import { refreshSpace } from "../load/lib";

export const [expression, setExpression] = createSignal("$x \n \n \n");
export const [isLoading, setIsLoading] = createSignal(false);

export const handleClear = async (spacePath: string) => {
  if (!expression().trim()) {
    showToast({
      title: "Input Required",
      description: "Please enter an expression to clear.",
      variant: "destructive",
    });
    return;
  }

  setIsLoading(true);

  try {
    const success = await clearSpace(spacePath);

    if (success) {
      showToast({
        title: "Cleared Successfully",
        description: `Space "${spacePath}" has been cleared.`,
      });
      refreshSpace();
    } else {
      showToast({
        title: "Clear Operation Failed",
        description: `Could not clear space "${spacePath}". Check server logs for details.`,
        variant: "destructive",
      });
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    showToast({
      title: "API Error",
      description: errorMessage,
      variant: "destructive",
    });
  } finally {
    setIsLoading(false);
  }
};
