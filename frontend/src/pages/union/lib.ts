import { createSignal } from "solid-js";
import { union, isPathClear } from "~/lib/api";
import { showToast } from "~/components/ui/Toast";
import { refreshSpace } from "../load/lib";

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

export const startPolling = (spacePath: string) => {
  setIsPolling(true);
  pollingIntervalId = setInterval(async () => {
    try {
      const isClear = await isPathClear(spacePath);
      if (isClear) {
        stopPolling();
        showToast({
          title: "Union Completed",
          description: "successfully completed union operation",
        });
        refreshSpace();
      }
    } catch {
      showToast({
        title: "Polling Error",
        description: "Failed to fetch union status.",
        variant: "destructive",
      });
      stopPolling();
    }
  }, 3000);
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

    const success = await union(unionQuery);

    if (success) {
      showToast({
        title: "Unification Initiated",
        description: "Waiting for results...",
      });
      startPolling(spacePath);
    } else {
      showToast({
        title: "Transform Failed",
        description: "Could not initiate the transformation.",
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
