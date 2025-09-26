import type { Component, JSX } from "solid-js";
import { createResource, createSignal, For, onMount, Show } from "solid-js";
import { A } from "@solidjs/router";
import { showToast, ToastViewport } from "~/components/ui/toast";

// Import UI Components
import { Button } from "~/components/ui/button";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { CommandCard } from "~/components/upload/commandCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "~/components/ui/dialog";

import Copy from "lucide-solid/icons/copy";
import Trash2 from "lucide-solid/icons/trash-2";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import ArrowUp from "lucide-solid/icons/arrow-up";
import ArrowDown from "lucide-solid/icons/arrow-down";
import Check from "lucide-solid/icons/check";
import X from "lucide-solid/icons/x";
import Eye from "lucide-solid/icons/eye";
import EyeOff from "lucide-solid/icons/eye-off";
import AlertTriangle from "lucide-solid/icons/alert-triangle";

import { API_URL } from "../lib/api";
import { Token } from "../types";

// Enums and API functions from original Tokens.tsx
enum SortableColumns {
  TIMESTAMP,
  NAMESPACE,
  READ,
  WRITE,
  SHARE_READ,
  SHARE_WRITE,
  SHARE_SHARE,
}

const fetchTokens = async (root: string | null): Promise<Token[]> => {
  localStorage.setItem("rootToken", root ?? "");
  if (!root) return [];
  try {
    const resp = await fetch(`${API_URL}/tokens`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: root },
    });
    const tokens = await resp.json();
    showToast({
      title: "Success",
      description: `Loaded ${tokens.length} tokens.`,
    });
    return tokens;
  } catch (e) {
    showToast({
      title: "Error",
      description: "Failed to fetch tokens",
      variant: "destructive",
    });
    return [];
  }
};

const createToken = async (
  root: string | null,
  description: string,
  namespace: string,
  read: boolean,
  write: boolean,
  shareRead: boolean,
  shareWrite: boolean,
  shareShare: boolean
): Promise<Token> => {
  if (!root) throw new Error("No root token");
  const newToken: Token = {
    id: 0,
    code: "",
    description: description,
    namespace: namespace,
    creation_timestamp: new Date().toISOString().split("Z")[0],
    permission_read: read,
    permission_write: write,
    permission_share_read: shareRead,
    permission_share_write: shareWrite,
    permission_share_share: shareShare,
    parent: 0,
  };
  const resp = await fetch(`${API_URL}/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: root },
    body: JSON.stringify(newToken),
  });
  return await resp.json();
};

const refreshCodes = async (
  root: string | null,
  tokens: Token[]
): Promise<Token[]> => {
  if (!root) return [];
  const promises = tokens.map((t) =>
    fetch(`${API_URL}/tokens/${t.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: root },
    }).then((r) => r.json())
  );
  return Promise.all(promises);
};

const deleteTokens = async (
  root: string | null,
  tokens: Token[]
): Promise<void> => {
  if (!root) return;
  await fetch(`${API_URL}/tokens`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: root },
    body: JSON.stringify(tokens.map((t) => t.id)),
  });
};

export const TokensPage: Component = () => {
  const permissionKeys = ["read", "write", "shareRead", "shareWrite"] as const; // removed "shareShare"
  type PermissionKey = (typeof permissionKeys)[number];

  // State Signals
  const [rootTokenCode, setRootTokenCode] = createSignal<string | null>(
    localStorage.getItem("rootToken")
  );
  const [newToken, setNewToken] = createSignal({
    description: "",
    namespace: "",
    read: true,
    write: false,
    shareRead: false,
    shareWrite: false,
    shareShare: false,
  });
  const [selectedTokens, setSelectedTokens] = createSignal<Token[]>([]);
  const [sortColumn, setSortColumn] = createSignal<SortableColumns>(
    SortableColumns.TIMESTAMP
  );
  const [sortDirectionDescending, setSortDirectionDescending] =
    createSignal<boolean>(true);
  const [namespaceSearchRegex, setNamespaceSearchRegex] =
    createSignal<string>("");
  const [descriptionSearchRegex, setDescriptionSearchRegex] =
    createSignal<string>("");
  const [copiedTokenId, setCopiedTokenId] = createSignal<number | null>(null);
  const [showRootToken, setShowRootToken] = createSignal(false);
  const namespaceRegex = new RegExp(
    `^/(([a-zA-Z0-9])+([a-zA-Z0-9]|[-_])*([a-zA-Z0-9])/)*$`
  );
  const [namespaceError, setNamespaceError] = createSignal("");

  // Resource for fetching tokens
  const [tokens, { refetch: refetchTokens, mutate: mutateTokens }] =
    createResource(rootTokenCode, fetchTokens, { initialValue: [] });

  const filteredAndSortedTokens = () => {
    const nsRegex = new RegExp(namespaceSearchRegex(), "i");
    const descRegex = new RegExp(descriptionSearchRegex(), "i");

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
          // Add other sort cases here
        }
        return sortDirectionDescending() ? -result : result;
      });
  };

  // Event Handlers
  const handleRootTokenSubmit = (e: Event) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const input = form.querySelector("#root-token-input") as HTMLInputElement;
    setRootTokenCode(input.value.trim());
  };

  const handleCreateToken = async (e: Event) => {
    e.preventDefault();
    const {
      description,
      namespace,
      read,
      write,
      shareRead,
      shareWrite,
      shareShare,
    } = newToken();
    try {
      const created = await createToken(
        rootTokenCode(),
        description,
        namespace,
        read,
        write,
        shareRead,
        shareWrite,
        shareShare
      );
      mutateTokens((prev) => [...(prev || []), created]);
      showToast({
        title: "Success",
        description: "Token created successfully!",
      });
    } catch (error) {
      showToast({
        title: "Error",
        description: "Failed to create token.",
        variant: "destructive",
      });
    }
  };

  const handleRefreshTokens = async () => {
    const results = await refreshCodes(rootTokenCode(), selectedTokens());
    const selectedIds = new Set(selectedTokens().map((t) => t.id));
    mutateTokens((currentTokens) => [
      ...(currentTokens?.filter((t) => !selectedIds.has(t.id)) || []),
      ...results,
    ]);
    showToast({
      title: "Success",
      description: `Refreshed ${results.length} tokens.`,
    });
    setSelectedTokens([]);
  };

  const handleDeleteTokens = async () => {
    const selectedIds = new Set(selectedTokens().map((t) => t.id));
    try {
      await deleteTokens(rootTokenCode(), selectedTokens());
      mutateTokens(
        (currentTokens) =>
          currentTokens?.filter((t) => !selectedIds.has(t.id)) || []
      );
      showToast({
        title: "Success",
        description: `Deleted ${selectedTokens().length} tokens.`,
      });
      setSelectedTokens([]);
    } catch (error) {
      showToast({
        title: "Error",
        description: "Failed to delete tokens.",
        variant: "destructive",
      });
    }
  };

  const handleCopyToken = (token: Token) => {
    navigator.clipboard.writeText(token.code);
    setCopiedTokenId(token.id);
    showToast({
      title: "Success",
      description: "Token code copied to clipboard!",
    });
    setTimeout(() => setCopiedTokenId(null), 2000);
  };

  const handleSort = (column: SortableColumns) => {
    if (sortColumn() === column) {
      setSortDirectionDescending(!sortDirectionDescending());
    } else {
      setSortColumn(column);
      setSortDirectionDescending(true);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedTokens(checked ? [...tokens()] : []);
  };

  const handleSelectToken = (token: Token, checked: boolean) => {
    setSelectedTokens((prev) =>
      checked ? [...prev, token] : prev.filter((t) => t.id !== token.id)
    );
  };

  const handlePermissionChange = (perm: PermissionKey, checked: boolean) => {
    setNewToken((prev) => {
      const next = { ...prev };

      if (perm === "read") {
        next.read = checked;
        if (!checked) {
          next.write = false;
          next.shareRead = false;
          next.shareWrite = false;
          next.shareShare = false;
        }
      }
      if (perm === "write") {
        next.write = checked;
        if (checked && !next.read) next.read = true;
      }
      if (perm === "shareRead") {
        next.shareRead = checked;
        if (checked && !next.read) next.read = true;
      }
      if (perm === "shareWrite") {
        next.shareWrite = checked;
        if (checked) {
          next.read = true;
          next.write = true;
          next.shareRead = true;
        }
      }
      // if (perm === "shareShare") {
      //     next.shareShare = checked;
      //     if (checked) {
      //         next.read = true;
      //         next.write = true;
      //         next.shareRead = true;
      //         next.shareWrite = true;
      //     }
      // }
      return next;
    });
  };

  const handleNamespaceInput = (value: string) => {
    setNewToken((p) => ({ ...p, namespace: value }));
    if (value && !namespaceRegex.test(value)) {
      setNamespaceError(
        "Invalid format. Each segment must start/end with a letter/number and the path must end with a '/'"
      );
    } else {
      setNamespaceError("");
    }
  };

  const isTokenSelected = (token: Token) =>
    selectedTokens().some((t) => t.id === token.id);
  const isRootTokenSelected = () =>
    selectedTokens().some((t) => t.code === rootTokenCode());

  return (
    <div class="ml-10 mt-8 space-y-8">
      <CommandCard
        title="Token Management"
        description="Manage access by creating, viewing, and revoking tokens."
      >
        <form onSubmit={handleRootTokenSubmit} class="flex items-end gap-4">
          <div class="flex-grow">
            <TextField>
              <TextFieldLabel for="root-token-input">
                Access Token
              </TextFieldLabel>
              <div class="relative">
                <TextFieldInput
                  id="root-token-input"
                  type={showRootToken() ? "text" : "password"}
                  placeholder="Enter your root token to manage other tokens"
                  value={rootTokenCode() ?? ""}
                />
                <button
                  type="button"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  tabindex="-1"
                  onClick={() => setShowRootToken((v) => !v)}
                >
                  {showRootToken() ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </TextField>
          </div>
          <Button type="submit">Load Tokens</Button>
        </form>
      </CommandCard>

      <Show when={rootTokenCode()}>
        <CommandCard
          title="Create New Token"
          description="Define a namespace, description, and permissions for a new token."
        >
          <form
            onSubmit={handleCreateToken}
            class="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            <div class="space-y-4">
              <TextField>
                <TextFieldLabel for="namespace">Namespace</TextFieldLabel>
                <TextFieldInput
                  id="namespace"
                  placeholder="/my-project/data/"
                  required
                  value={newToken().namespace}
                  onInput={(e) => handleNamespaceInput(e.currentTarget.value)}
                />
                <Show when={namespaceError()}>
                  <p class="text-xs text-destructive flex items-center gap-2 pt-1">
                    <AlertTriangle size={14} /> {namespaceError()}
                  </p>
                </Show>
              </TextField>
              <TextField>
                <TextFieldLabel for="description">Description</TextFieldLabel>
                <TextFieldInput
                  id="description"
                  placeholder="e.g., Read-only access for team member"
                  onInput={(e) =>
                    setNewToken((p) => ({
                      ...p,
                      description: e.currentTarget.value,
                    }))
                  }
                />
              </TextField>
            </div>
            <div class="space-y-4">
              <fieldset>
                <legend class="text-sm font-medium mb-2">Permissions</legend>
                <div class="grid grid-cols-2 gap-4">
                  {permissionKeys.map((p) => (
                    <label class="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        class="rounded"
                        checked={newToken()[p]}
                        onInput={(e) =>
                          handlePermissionChange(p, e.currentTarget.checked)
                        }
                      />
                      {`Can ${p.replace(/([A-Z])/g, " $1").toLowerCase()}`}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button type="submit" class="w-full">
                Create Token
              </Button>
            </div>
          </form>
        </CommandCard>

        <CommandCard
          title="Available Tokens"
          description="A list of all tokens accessible with your current root token."
        >
          <div class="space-y-4">
            <div class="flex justify-between items-center">
              <div class="flex gap-4">
                <TextField>
                  <TextFieldInput
                    placeholder="Filter by namespace..."
                    onInput={(e) =>
                      setNamespaceSearchRegex(e.currentTarget.value)
                    }
                  />
                </TextField>
                <TextField>
                  <TextFieldInput
                    placeholder="Filter by description..."
                    onInput={(e) =>
                      setDescriptionSearchRegex(e.currentTarget.value)
                    }
                  />
                </TextField>
              </div>
              <div class="flex gap-2">
                <Dialog>
                  <DialogTrigger
                    as={Button}
                    variant="outline"
                    disabled={
                      selectedTokens().length === 0 || isRootTokenSelected()
                    }
                  >
                    <RefreshCw class="mr-2" /> Refresh (
                    {selectedTokens().length})
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Refresh Selected Tokens?</DialogTitle>
                      <DialogDescription>
                        This will invalidate the old token codes and generate
                        new ones. This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="destructive"
                        onClick={handleRefreshTokens}
                      >
                        Confirm Refresh
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Dialog>
                  <DialogTrigger
                    as={Button}
                    variant="destructive"
                    disabled={
                      selectedTokens().length === 0 || isRootTokenSelected()
                    }
                  >
                    <Trash2 class="mr-2" /> Delete ({selectedTokens().length})
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete Selected Tokens?</DialogTitle>
                      <DialogDescription>
                        This will permanently delete the selected tokens and any
                        sub-tokens. This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="destructive"
                        onClick={handleDeleteTokens}
                      >
                        Confirm Deletion
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div class="border rounded-lg overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-muted">
                  <tr class="border-b">
                    <th class="p-3 w-10 text-left">
                      <input
                        type="checkbox"
                        class="rounded"
                        onChange={(e) =>
                          handleSelectAll(e.currentTarget.checked)
                        }
                      />
                    </th>
                    {/* Add other headers here, for example: */}
                    <th
                      class="p-3 text-left font-medium cursor-pointer"
                      onClick={() => handleSort(SortableColumns.TIMESTAMP)}
                    >
                      Created{" "}
                      <Show when={sortColumn() === SortableColumns.TIMESTAMP}>
                        {sortDirectionDescending() ? (
                          <ArrowDown />
                        ) : (
                          <ArrowUp />
                        )}
                      </Show>
                    </th>
                    <th class="p-3 text-left font-medium">Code</th>
                    <th
                      class="p-3 text-left font-medium cursor-pointer"
                      onClick={() => handleSort(SortableColumns.NAMESPACE)}
                    >
                      Namespace{" "}
                      <Show when={sortColumn() === SortableColumns.NAMESPACE}>
                        {sortDirectionDescending() ? (
                          <ArrowDown />
                        ) : (
                          <ArrowUp />
                        )}
                      </Show>
                    </th>
                    <th class="p-3 text-left font-medium">Description</th>
                    <th class="p-3 text-center font-medium">R</th>
                    <th class="p-3 text-center font-medium">W</th>
                    <th class="p-3 text-center font-medium">SR</th>
                    <th class="p-3 text-center font-medium">SW</th>
                    <th class="p-3 text-center font-medium">SS</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={filteredAndSortedTokens()}>
                    {(token) => (
                      <tr class="border-b last:border-none hover:bg-muted/50">
                        <td class="p-3">
                          <input
                            type="checkbox"
                            class="rounded"
                            checked={isTokenSelected(token)}
                            onChange={(e) =>
                              handleSelectToken(token, e.currentTarget.checked)
                            }
                          />
                        </td>
                        <td class="p-3 text-muted-foreground">
                          {new Date(token.creation_timestamp).toLocaleString()}
                        </td>
                        <td class="p-3">
                          <div class="flex items-center gap-2 font-mono">
                            <span>{token.code.substring(0, 8)}...</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCopyToken(token)}
                            >
                              <Show
                                when={copiedTokenId() === token.id}
                                fallback={<Copy />}
                              >
                                <Check class="text-green-500" />
                              </Show>
                            </Button>
                          </div>
                        </td>
                        <td class="p-3">{token.namespace}</td>
                        <td class="p-3 text-muted-foreground">
                          <span title={token.description}>
                            {token.description.length > 12
                              ? token.description.slice(0, 12) + "…"
                              : token.description}
                          </span>
                        </td>
                        <td class="p-3 text-center">
                          {token.permission_read ? (
                            <Check class="text-green-500 mx-auto" />
                          ) : (
                            <X class="text-red-500 mx-auto" />
                          )}
                        </td>
                        <td class="p-3 text-center">
                          {token.permission_write ? (
                            <Check class="text-green-500 mx-auto" />
                          ) : (
                            <X class="text-red-500 mx-auto" />
                          )}
                        </td>
                        <td class="p-3 text-center">
                          {token.permission_share_read ? (
                            <Check class="text-green-500 mx-auto" />
                          ) : (
                            <X class="text-red-500 mx-auto" />
                          )}
                        </td>
                        <td class="p-3 text-center">
                          {token.permission_share_write ? (
                            <Check class="text-green-500 mx-auto" />
                          ) : (
                            <X class="text-red-500 mx-auto" />
                          )}
                        </td>
                        <td class="p-3 text-center">
                          {token.permission_share_share ? (
                            <Check class="text-green-500 mx-auto" />
                          ) : (
                            <X class="text-red-500 mx-auto" />
                          )}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
              <Show when={tokens().length === 0}>
                <div class="p-6 text-center text-muted-foreground">
                  No tokens found.
                </div>
              </Show>
            </div>
          </div>
        </CommandCard>
      </Show>
      <ToastViewport />
    </div>
  );
};

export default TokensPage;
