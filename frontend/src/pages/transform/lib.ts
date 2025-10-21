import { createSignal } from "solid-js";
import { transform, isPathClear } from "~/lib/api";
import { Mm2Input } from "~/lib/types";
import { showToast } from "~/components/ui/Toast";
import { parseTransformExpression } from "~/lib/utils";
import { refreshSpace } from "../load/lib";

export const [isLoading, setIsLoading] = createSignal(false);
export const [isPolling, setIsPolling] = createSignal(false);

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
          title: "Transform Completed",
          description: "The space has been successfully transformed.",
        });
        refreshSpace();
      }
    } catch {
      showToast({
        title: "Polling Error",
        description: "Failed to fetch transformation status.",
        variant: "destructive",
      });
      stopPolling();
    }
  }, 3000);
};

export const executeTransform = async (sExpr: string, spacePath: string) => {
  if (!sExpr.trim()) {
    showToast({
      title: "Error",
      description: "Please enter a transform expression.",
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

    const { patterns, templates } = parseTransformExpression(sExpr);
    const transformation: Mm2Input = {
      pattern: patterns,
      template: templates,
    };
    const success = await transform(spacePath, transformation);

    if (success) {
      showToast({
        title: "Transform Initiated",
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
