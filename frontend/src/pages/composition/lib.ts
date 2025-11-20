import { createSignal } from "solid-js";
import { composition, isPathClear } from "~/lib/api";
import { showToast } from "~/components/ui/Toast";
import { refreshSpace } from "../load/lib";

export const [isLoading, setIsLoading] = createSignal(false);
export const [isPolling, setIsPolling] = createSignal(false);

export type setOperationInput = {
  source: string[];
  target: string[];
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
          title: "Composition Completed",
          description: "successfully completed composition operation",
        });
        refreshSpace();
      }
    } catch {
      showToast({
        title: "Polling Error",
        description: "Failed to fetch composition status.",
        variant: "destructive",
      });
      stopPolling();
    }
  }, 3000);
};

export const executeComposition = async (
  compositionQuery: setOperationInput,
  spacePath: string
) => {
  if (compositionQuery.source.length < 2) {
    showToast({
      title: "Error",
      description: "Please enter at least two source namespaces",
      variant: "destructive",
    });
    return;
  }

  if (compositionQuery.target.length !== 1) {
    showToast({
      title: "Error",
      description: "Please enter a single target namespace",
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

    const success = await composition(compositionQuery);

    if (success) {
      showToast({
        title: "Composition Initiated",
        description: "Waiting for results...",
      });
      startPolling(spacePath);
    } else {
      showToast({
        title: "Composition Failed",
        description: "Could not initiate the composition.",
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
