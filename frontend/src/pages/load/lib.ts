import { createSignal, createResource } from "solid-js";
import { formatedNamespace } from "~/lib/state";
import { ParseError } from "~/types";
import { exploreSpace } from "~/lib/api";
import { showToast } from "~/components/ui/Toast";

type ExploreResponse = {
  id: string;
  name: string;
  children: ExploreResponse[];
};

let graphApi: {
  expandAll?: () => void;
  collapseToRoot?: () => void;
} = {};

export const [mettaText, setMettaText] = createSignal("$x");
export const [parseErrors, setParseErrors] = createSignal<ParseError[]>([]);
export const [isMinimized, setIsMinimized] = createSignal(true);
export const [pattern, setPattern] = createSignal("$x");

export const [subSpace, { refetch: refetchSubSpace }] = createResource(
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
      if (e instanceof Error && e.message === "noRootToken") {
        showToast({
          title: "Error",
          description: "No token found, please add one in the Tokens page",
          variant: "destructive",
        });
        return;
      }

      showToast({
        title: "Error",
        description: "Failed to load space data.",
        variant: "destructive",
      });
      return;
    }
  }
);

export const refreshSpace = () => {
  refetchSubSpace();
};

export const handleTextChange = (text: string) => setMettaText(text);
export const handlePatternLoad = (newPattern: string) => setPattern(newPattern);
export const toggleMinimize = () => setIsMinimized(!isMinimized());
export const handleToggleCard = () => setIsMinimized((prev) => !prev);

// New handlers for expand/collapse
export const handleExpandAll = () => graphApi.expandAll?.();
export const handleCollapseToRoot = () => graphApi.collapseToRoot?.();

// Function to register the graph's API
export const setupGraphApi = (api: typeof graphApi) => {
  graphApi = api;
};
