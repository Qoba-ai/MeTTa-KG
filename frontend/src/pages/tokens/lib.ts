import { createResource, createSignal, createMemo } from "solid-js";
import {
  fetchTokens,
  refreshCodes,
  deleteTokens,
  deleteToken,
} from "~/lib/api";
import { Token } from "~/lib/types";
import { showToast } from "~/components/ui/Toast";
import { rootToken } from "~/lib/state";

export enum SortableColumns {
  TIMESTAMP,
  NAMESPACE,
  READ,
  WRITE,
  SHARE_READ,
  SHARE_WRITE,
  SHARE_SHARE,
}

import { setNamespace, setTokenRootNamespace } from "~/lib/state";

export const [tokens, { mutate: mutateTokens, refetch: refetchTokens }] =
  createResource(
    () => (rootToken() ? rootToken() : null),
    async (token) => {
      try {
        const fetchedTokens = await fetchTokens(token);

        // Find current token and update namespace
        const currentToken = fetchedTokens.find((t) => t.code === token);
        if (currentToken) {
          const namespaceParts = currentToken.namespace
            .split("/")
            .filter((part) => part.length > 0);
          const rootNs = ["", ...namespaceParts];

          // Store for page reload
          localStorage.setItem("tokenNamespace", JSON.stringify(rootNs));

          setTokenRootNamespace(rootNs);
          setNamespace(rootNs);
        }

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
  const root = rootToken();
  if (!root || selectedTokens().length === 0) return;
  try {
    const refreshed = await refreshCodes(
      root,
      selectedTokens().map((t) => t.id)
    );

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
  const root = rootToken();
  if (!root || selectedTokens().length === 0) return;

  try {
    const selected = selectedTokens();
    const idsToDelete = selected.map((t) => t.id);

    if (selected.length === 1) {
      await deleteToken(root, selected[0].id);
    } else {
      await deleteTokens(root, idsToDelete);
    }

    mutateTokens(
      (current) => current?.filter((t) => !idsToDelete.includes(t.id)) || []
    );

    showToast({
      title: "Success",
      description: `Deleted ${idsToDelete.length} token(s).`,
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
