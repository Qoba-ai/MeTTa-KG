import { createSignal, onCleanup } from "solid-js";
import { transform, isPathClear } from "../lib/api";
import { Transformation } from "../lib/types";
import { showToast } from "~/components/ui/Toast";
import { parseTransformExpression } from "../utils/s-expression";

export function useTransform(spacePath: () => string) {
  const [isLoading, setIsLoading] = createSignal(false);
  const [isPolling, setIsPolling] = createSignal(false);

  let pollingIntervalId: NodeJS.Timeout | null = null;

  const stopPolling = () => {
    if (pollingIntervalId) clearInterval(pollingIntervalId);
    pollingIntervalId = null;
    setIsPolling(false);
  };

  onCleanup(stopPolling);

  const startPolling = () => {
    setIsPolling(true);
    pollingIntervalId = setInterval(async () => {
      try {
        const isClear = await isPathClear(spacePath());
        if (isClear) {
          stopPolling();
          showToast({
            title: "Transform Completed",
            description: "The space has been successfully transformed.",
          });
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

  const executeTransform = async (sExpr: string) => {
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
      if (!(await isPathClear(spacePath()))) {
        showToast({
          title: "Space Busy",
          description: "The space is currently busy. Please wait.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      const { patterns, templates } = parseTransformExpression(sExpr);
      const transformation: Transformation = {
        space: spacePath(),
        patterns,
        templates,
      };
      const success = await transform(transformation);

      if (success) {
        showToast({
          title: "Transform Initiated",
          description: "Waiting for results...",
        });
        startPolling();
      } else {
        showToast({
          title: "Transform Failed",
          description: "Could not initiate the transformation.",
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.";
      showToast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return { isLoading, isPolling, executeTransform };
}
