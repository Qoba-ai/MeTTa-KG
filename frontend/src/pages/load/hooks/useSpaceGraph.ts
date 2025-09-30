import { createSignal, createResource, createEffect } from "solid-js";
import { formatedNamespace } from "~/lib/state";
import { initNodesFromApiResponse, SpaceNode } from "~/lib/space";
import { CytoscapeCanvasHandle } from "~/pages/load/components/SpaceGraph";
import { ParseError } from "~/types";
import { exploreSpace } from "../lib/api";
import { showToast } from "~/components/ui/Toast";

// Define the type for the response data
type ExploreResponse = {
  id: string;
  name: string;
  children: ExploreResponse[];
};

export function useSpaceGraph() {
  const [mettaText, setMettaText] = createSignal("$x");
  const [parseErrors, _setParseErrors] = createSignal<ParseError[]>([]);
  const [isMinimized, setIsMinimized] = createSignal(true);
  const [pattern, setPattern] = createSignal("$x");

  let canvas: CytoscapeCanvasHandle | undefined;
  let setSpaceGraph: ((eles: SpaceNode[]) => void) | undefined;

  const [subSpace] = createResource(
    () => ({
      path: formatedNamespace(),
      expr: pattern(),
      token: Uint8Array.from([]),
    }),
    async ({ path, expr, token }) => {
      try {
        const responseString = await exploreSpace(path, expr, token);
        const data: ExploreResponse[] = JSON.parse(responseString);
        showToast({
          title: "Success",
          description: `Loaded ${data.length} nodes.`,
        });
        return data;
      } catch (e) {
        showToast({
          title: "Error",
          description: "Failed to load space data.",
          variant: "destructive",
        });
        throw e;
      }
    }
  );

  createEffect(() => {
    if (subSpace() && !subSpace.error && setSpaceGraph) {
      setSpaceGraph(initNodesFromApiResponse(subSpace()!));
    }
  });

  const handleTextChange = (text: string) => setMettaText(text);
  const handlePatternLoad = (newPattern: string) => setPattern(newPattern);
  const toggleMinimize = () => setIsMinimized(!isMinimized());
  const handleZoomIn = () => canvas?.zoomIn();
  const handleZoomOut = () => canvas?.zoomOut();
  const handleRecenter = () => canvas?.recenter();
  const handleToggleCard = () => setIsMinimized((prev) => !prev);

  const setupGraphRefs = (
    canvasHandle: CytoscapeCanvasHandle,
    setGraphFn: (eles: SpaceNode[]) => void
  ) => {
    canvas = canvasHandle;
    setSpaceGraph = setGraphFn;
  };

  return {
    mettaText,
    handleTextChange,
    parseErrors,
    isMinimized,
    toggleMinimize,
    pattern,
    handlePatternLoad,
    subSpace,
    handleZoomIn,
    handleZoomOut,
    handleRecenter,
    handleToggleCard,
    setupGraphRefs,
  };
}
