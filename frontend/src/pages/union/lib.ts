import { createSignal } from "solid-js";
import { union, isPathClear } from "~/lib/api";
import { showToast } from "~/components/ui/Toast";

export const [isLoading, setIsLoading] = createSignal(false);
export const [isPolling, setIsPolling] = createSignal(false);

export type setOperationInput = {
  pattern: string[];
  template: string[];
};
let pollingIntervalId: NodeJS.Timeout | null = null;

export const stopPolling = () => {
  if (pollingIntervalId) clearInterval(pollingIntervalId);
  pollingIntervalId = null;
  setIsPolling(false);
};

export const executeUnion = async (
  unionQuery: setOperationInput,
  spacePath: string
) => {
  if (unionQuery.pattern.length < 1) {
    showToast({
      title: "Error",
      description: "Please enter more than one patterns",
      variant: "destructive",
    });
    return;
  }

  if (unionQuery.template.length > 1) {
    showToast({
      title: "Error",
      description: "Please enter single template namespace",
      variant: "destructive",
    });
    return;
  }

  setIsLoading(true);
  stopPolling();
  try {
    if (!(await isPathClear(spacePath))) {
      showToast({
        title: "Space Busy",
        description: "The space is currently busy. Please wait.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    showToast({
      title: "Unification Initiated",
      description: "Waiting for results...",
    });

    const success = await union(unionQuery);

    setIsLoading(false);
    if (success) {
      showToast({
        title: "Unification Complete",
        description: "Operation completed successfully!",
      });
    } else {
      showToast({
        title: "Unification Failed",
        description: "Could not initiate the unification.",
        variant: "destructive",
      });
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    showToast({
      title: "Error",
      description: errorMessage,
      variant: "destructive",
    });
  } finally {
    setIsLoading(false);
  }
};
