import { createSignal, createResource } from "solid-js";
import { formatedNamespace } from "~/lib/state";
import { ParseError } from "~/types";
import { exploreSpace } from "~/lib/api";
import { showToast } from "~/components/ui/Toast";
import { treeStore } from "./components/expandableList/store";

type ExploreResponse = {
  id: string;
  name: string;
  children: ExploreResponse[];
};

let graphApi: {
  expandAll?: () => void;
  collapseToRoot?: () => void;
  expandToFillViewport?: () => Promise<void>;
} = {};

export const [mettaText, setMettaText] = createSignal("$x");
export const [parseErrors, setParseErrors] = createSignal<ParseError[]>([]);
export const [isMinimized, setIsMinimized] = createSignal(true);
export const [pattern, setPattern] = createSignal("$x");
export const [shouldFillViewport, setShouldFillViewport] = createSignal(false);
export const [isIndented, setIsIndented] = createSignal(false);

export const handleToggleIndent = () => setIsIndented((p) => !p);

export const [subSpace, { refetch: refetchSubSpace, mutate: mutateSubSpace }] =
  createResource(
    () => ({
      path: formatedNamespace(),
      expr: pattern(),
      token: Uint8Array.from([]),
    }),
    async ({ path, expr, token }) => {
      try {
        const data = JSON.parse(
          await exploreSpace(path, expr, token)
        ) as ExploreResponse[];
        showToast({
          title: "Success",
          description: `Loaded ${data.length} nodes.`,
        });
        return data;
      } catch (e) {
        const msg =
          e instanceof Error && e.message === "noRootToken"
            ? "No token found, please add one in the Tokens page"
            : "Failed to load space data.";
        showToast({ title: "Error", description: msg, variant: "destructive" });
        return [];
      }
    }
  );

export const refreshSpace = () => {
  mutateSubSpace([]);
  treeStore.reset();
  return refetchSubSpace();
};

export const handleTextChange = (text: string) => setMettaText(text);

export const handlePatternLoad = (newPattern: string) => {
  treeStore.reset();
  setPattern(newPattern);
  setShouldFillViewport(true);
};

export const toggleMinimize = () => setIsMinimized(!isMinimized());
export const handleToggleCard = () => setIsMinimized((p) => !p);
export const handleExpandAll = () => {
  treeStore.expandAll();
  graphApi.expandAll?.();
};
export const handleCollapseToRoot = () => {
  treeStore.collapseToRoot();
  graphApi.collapseToRoot?.();
};
export const triggerViewportFill = async () => {
  await graphApi.expandToFillViewport?.();
};
export const setupGraphApi = (api: typeof graphApi) => {
  graphApi = api;
};
