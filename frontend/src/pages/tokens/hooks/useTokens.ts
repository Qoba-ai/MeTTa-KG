import { createResource, createSignal, createMemo } from "solid-js";
import { fetchTokens, refreshCodes, deleteTokens } from "../lib/api";
import { SortableColumns, Token } from "../lib/types";
import { showToast } from "~/components/ui/Toast";

export function useTokens() {
  const [rootTokenCode, setRootTokenCode] = createSignal<string | null>(
    localStorage.getItem("rootToken")
  );

  const [tokens, { mutate, refetch }] = createResource(
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

  const [selectedTokens, setSelectedTokens] = createSignal<Token[]>([]);
  const [sortColumn, setSortColumn] = createSignal<SortableColumns>(
    SortableColumns.TIMESTAMP
  );
  const [sortDirection, setSortDirection] = createSignal<"asc" | "desc">(
    "desc"
  );
  const [namespaceFilter, setNamespaceFilter] = createSignal("");
  const [descriptionFilter, setDescriptionFilter] = createSignal("");

  const filteredAndSortedTokens = createMemo(() => {
    const nsRegex = new RegExp(namespaceFilter(), "i");
    const descRegex = new RegExp(descriptionFilter(), "i");
    return tokens()
      .filter((t) => nsRegex.test(t.namespace) && descRegex.test(t.description))
      .sort((a, b) => {
        let result = 0;
        switch (sortColumn()) {
          case SortableColumns.TIMESTAMP:
            result =
              Date.parse(a.creation_timestamp) -
              Date.parse(b.creation_timestamp);
            break;
          case SortableColumns.NAMESPACE:
            result = a.namespace.localeCompare(b.namespace);
            break;
        }
        return sortDirection() === "desc" ? -result : result;
      });
  });

  const handleSort = (column: SortableColumns) => {
    if (sortColumn() === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const handleRefresh = async () => {
    const root = rootTokenCode();
    if (!root || selectedTokens().length === 0) return;
    try {
      const refreshed = await refreshCodes(root, selectedTokens());

      const idsRefreshed = refreshed.map((t) => t.id);
      mutate((current) => [
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

  const handleDelete = async () => {
    const root = rootTokenCode();
    if (!root || selectedTokens().length === 0) return;
    try {
      const idsToDelete = selectedTokens().map((t) => t.id);

      await deleteTokens(root, selectedTokens());

      mutate(
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

  const handleSelectAll = (checked: boolean) => {
    setSelectedTokens(checked ? [...filteredAndSortedTokens()] : []);
  };

  const handleSelectToken = (token: Token, checked: boolean) => {
    setSelectedTokens((prev) =>
      checked ? [...prev, token] : prev.filter((t) => t.id !== token.id)
    );
  };

  const isTokenSelected = (token: Token) =>
    selectedTokens().some((t) => t.id === token.id);

  return {
    rootTokenCode,
    setRootTokenCode,
    tokens,
    mutateTokens: mutate,
    refetchTokens: refetch,
    filteredAndSortedTokens,
    selectedTokens,
    setSelectedTokens,
    sortState: { column: sortColumn, direction: sortDirection },
    handleSort,
    setNamespaceFilter,
    setDescriptionFilter,
    handleRefresh,
    handleDelete,
    handleSelectAll,
    handleSelectToken,
    isTokenSelected,
  };
}
