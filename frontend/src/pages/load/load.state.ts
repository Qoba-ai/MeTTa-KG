import { createSignal, createResource, createEffect } from "solid-js";
import { formatedNamespace } from "~/lib/state";
import { initNodesFromApiResponse, SpaceNode } from "~/lib/space";
import { CytoscapeCanvasHandle } from "./components/SpaceGraph";
import { ParseError } from "~/types";
import { exploreSpace } from "~/lib/api";
import { showToast } from "~/components/ui/Toast";

type ExploreResponse = {
  id: string;
  name: string;
  children: ExploreResponse[];
};

export const [mettaText, setMettaText] = createSignal("$x");
export const [parseErrors, setParseErrors] = createSignal<ParseError[]>([]);
export const [isMinimized, setIsMinimized] = createSignal(true);
export const [pattern, setPattern] = createSignal("$x");

let canvas: CytoscapeCanvasHandle | undefined;
let setSpaceGraphFn: ((eles: SpaceNode[]) => void) | undefined;

export const [subSpace] = createResource(
  () => ({
    path: formatedNamespace(),
    expr: pattern(),
    token: Uint8Array.from([]),
  }),
  async ({ path, expr, token }) => {
    try {
      const responseString = await exploreSpace(path, expr);
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
  if (subSpace() && !subSpace.error && setSpaceGraphFn) {
    setSpaceGraphFn(initNodesFromApiResponse(subSpace()!));
  }
});

export const handleTextChange = (text: string) => setMettaText(text);
export const handlePatternLoad = (newPattern: string) => setPattern(newPattern);
export const toggleMinimize = () => setIsMinimized(!isMinimized());
export const handleZoomIn = () => canvas?.zoomIn();
export const handleZoomOut = () => canvas?.zoomOut();
export const handleRecenter = () => canvas?.recenter();
export const handleToggleCard = () => setIsMinimized((prev) => !prev);

export const setupGraphRefs = (
  canvasHandle: CytoscapeCanvasHandle,
  setGraphFn: (eles: SpaceNode[]) => void
) => {
  canvas = canvasHandle;
  setSpaceGraphFn = setGraphFn;
};
