import type { Component } from "solid-js";
import { Show } from "solid-js";
import { useTokens } from "./hooks/useTokens";
import { RootTokenForm } from "./components/RootTokenForm";
import { CreateTokenForm } from "./components/CreateTokenForm";
import { TokenTable } from "./components/TokenTable";
import { CommandCard } from "~/components/common/CommandCard";
import { ToastViewport } from "~/components/ui/Toast";
import { Button } from "~/components/ui/Button";
import { TextField, TextFieldInput } from "~/components/ui/TextField";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "~/components/ui/Dialog";
import Trash2 from "lucide-solid/icons/trash-2";
import RefreshCw from "lucide-solid/icons/refresh-cw";

export const TokensPage: Component = () => {
  const {
    rootTokenCode,
    setRootTokenCode,
    mutateTokens,
    filteredAndSortedTokens,
    selectedTokens,
    handleRefresh,
    handleDelete,
    setNamespaceFilter,
    setDescriptionFilter,
    sortState,
    handleSort,
    handleSelectAll,
    handleSelectToken,
    isTokenSelected,
  } = useTokens();

  const isRootTokenSelected = () =>
    selectedTokens().some((t) => t.code === rootTokenCode());

  return (
    <div class="ml-10 mt-8 space-y-8">
      <CommandCard
        title="Token Management"
        description="Manage access by creating, viewing, and revoking tokens."
      >
        <RootTokenForm
          initialToken={rootTokenCode()}
          onLoad={setRootTokenCode}
        />
      </CommandCard>

      <Show when={rootTokenCode()}>
        <CommandCard
          title="Create New Token"
          description="Define a namespace, description, and permissions for a new token."
        >
          <CreateTokenForm
            rootToken={rootTokenCode()!}
            onTokenCreated={(token) =>
              mutateTokens((prev) => [...(prev || []), token])
            }
          />
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
                    onInput={(e) => setNamespaceFilter(e.currentTarget.value)}
                  />
                </TextField>
                <TextField>
                  <TextFieldInput
                    placeholder="Filter by description..."
                    onInput={(e) => setDescriptionFilter(e.currentTarget.value)}
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
                    <RefreshCw class="mr-2" size={16} /> Refresh (
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
                      <Button variant="destructive" onClick={handleRefresh}>
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
                    <Trash2 class="mr-2" size={16} /> Delete (
                    {selectedTokens().length})
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
                      <Button variant="destructive" onClick={handleDelete}>
                        Confirm Deletion
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <TokenTable
              tokens={filteredAndSortedTokens()}
              sortState={sortState}
              onSort={handleSort}
              onSelectAll={handleSelectAll}
              onSelectToken={handleSelectToken}
              isTokenSelected={isTokenSelected}
            />
          </div>
        </CommandCard>
      </Show>
      <ToastViewport />
    </div>
  );
};

export default TokensPage;
