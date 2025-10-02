import { createResource, createSignal, createMemo } from "solid-js";
import { fetchTokens, refreshCodes, deleteTokens } from "~/lib/api";
import { Token } from "~/lib/types";
import { showToast } from "~/components/ui/Toast";

export enum SortableColumns {
  TIMESTAMP,
  NAMESPACE,
  READ,
  WRITE,
  SHARE_READ,
  SHARE_WRITE,
  SHARE_SHARE,
}

export const [rootTokenCode, setRootTokenCode] = createSignal<string | null>(
  localStorage.getItem("rootToken")
);

export const [tokens, { mutate: mutateTokens, refetch: refetchTokens }] =
  createResource(
    () => (rootTokenCode() ? rootTokenCode() : null),
    async (token) => {
      try {
        const fetchedTokens = await fetchTokens(token);
        showToast({
          title: "Success",
          description: `Loaded ${fetchedTokens.length} tokens.`,
        });
        return fetchedTokens;
      } catch (e) {
        showToast({
          title: "Error",
          description: `Failed to fetch tokens. \n${e}`,
          variant: "destructive",
        });
        return [];
      }
    },
    { initialValue: [] }
  );

export const [selectedTokens, setSelectedTokens] = createSignal<Token[]>([]);
export const [sortColumn, setSortColumn] = createSignal<SortableColumns>(
  SortableColumns.TIMESTAMP
);
export const [sortDirection, setSortDirection] = createSignal<"asc" | "desc">(
  "desc"
);
export const [namespaceFilter, setNamespaceFilter] = createSignal("");
export const [descriptionFilter, setDescriptionFilter] = createSignal("");

export const filteredAndSortedTokens = createMemo(() => {
  const nsRegex = new RegExp(namespaceFilter(), "i");
  const descRegex = new RegExp(descriptionFilter(), "i");
  return tokens()
    .filter((t) => nsRegex.test(t.namespace) && descRegex.test(t.description))
    .sort((a, b) => {
      let result = 0;
      switch (sortColumn()) {
        case SortableColumns.TIMESTAMP:
          result =
            Date.parse(a.creation_timestamp) - Date.parse(b.creation_timestamp);
          break;
        case SortableColumns.NAMESPACE:
          result = a.namespace.localeCompare(b.namespace);
          break;
      }
      return sortDirection() === "desc" ? -result : result;
    });
});

export const handleSort = (column: SortableColumns) => {
  if (sortColumn() === column) {
    setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
  } else {
    setSortColumn(column);
    setSortDirection("desc");
  }
};

export const handleRefresh = async () => {
  const root = rootTokenCode();
  if (!root || selectedTokens().length === 0) return;
  try {
    const refreshed = await refreshCodes(root, selectedTokens());

    const idsRefreshed = refreshed.map((t) => t.id);
    mutateTokens((current) => [
      ...(current?.filter((t) => !idsRefreshed.includes(t.id)) || []),
      ...refreshed,
    ]);

    showToast({
      title: "Success",
      description: `Refreshed ${refreshed.length} tokens.`,
    });
    setSelectedTokens([]);
  } catch {
    showToast({
      title: "Error",
      description: "Failed to refresh tokens.",
      variant: "destructive",
    });
  }
};

export const handleDelete = async () => {
  const root = rootTokenCode();
  if (!root || selectedTokens().length === 0) return;
  try {
    const idsToDelete = selectedTokens().map((t) => t.id);

    await deleteTokens(root, selectedTokens());

    mutateTokens(
      (current) => current?.filter((t) => !idsToDelete.includes(t.id)) || []
    );
    showToast({
      title: "Success",
      description: `Deleted ${idsToDelete.length} tokens.`,
    });
    setSelectedTokens([]);
  } catch {
    showToast({
      title: "Error",
      description: "Failed to delete tokens.",
      variant: "destructive",
    });
  }
};

export const handleSelectAll = (checked: boolean) => {
  setSelectedTokens(checked ? [...filteredAndSortedTokens()] : []);
};

export const handleSelectToken = (token: Token, checked: boolean) => {
  setSelectedTokens((prev) =>
    checked ? [...prev, token] : prev.filter((t) => t.id !== token.id)
  );
};

export const isTokenSelected = (token: Token) =>
  selectedTokens().some((t) => t.id === token.id);
