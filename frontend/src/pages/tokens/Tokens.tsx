import { Component, Show } from "solid-js";
import { CommandCard } from "~/components/common/CommandCard";
import { RootTokenForm } from "./components/RootTokenForm";
import { CreateTokenForm } from "./components/CreateTokenForm";
import { TokenTable } from "./components/TokenTable";
import { Button } from "~/components/ui/Button";

import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/TextField";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/Dialog";
import {
  rootTokenCode,
  setRootTokenCode,
  mutateTokens,
  filteredAndSortedTokens,
  selectedTokens,
  handleRefresh,
  handleDelete,
  setNamespaceFilter,
  setDescriptionFilter,
  sortColumn,
  sortDirection,
  handleSort,
  handleSelectAll,
  handleSelectToken,
  isTokenSelected,
} from "./lib";

export const TokensPage: Component = () => {
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
          title="Existing Tokens"
          description="View and manage your current tokens."
        >
          <div class="space-y-4">
            {/* ✅ Combined row with filters and buttons */}
            <div class="flex gap-4 items-end">
              <TextField class="flex-1">
                <TextFieldLabel>Filter by Namespace</TextFieldLabel>
                <TextFieldInput
                  placeholder="Enter namespace..."
                  onInput={(e) => setNamespaceFilter(e.currentTarget.value)}
                />
              </TextField>
              <TextField class="flex-1">
                <TextFieldLabel>Filter by Description</TextFieldLabel>
                <TextFieldInput
                  placeholder="Enter description..."
                  onInput={(e) => setDescriptionFilter(e.currentTarget.value)}
                />
              </TextField>

              {/* Buttons aligned to bottom */}
              <div class="flex gap-2">
                <Dialog>
                  <DialogTrigger
                    as={Button}
                    disabled={selectedTokens().length === 0}
                  >
                    Refresh ({selectedTokens().length})
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Refresh Tokens</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to refresh{" "}
                        {selectedTokens().length} token(s)? This will generate
                        new codes for the selected tokens.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={(e) =>
                          e.currentTarget.closest("dialog")?.close()
                        }
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={async () => {
                          await handleRefresh();
                          document.querySelector("dialog")?.close();
                        }}
                      >
                        Refresh
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog>
                  <DialogTrigger
                    as={Button}
                    disabled={
                      selectedTokens().length === 0 || isRootTokenSelected()
                    }
                    variant="destructive"
                  >
                    Delete ({selectedTokens().length})
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete Tokens</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to delete{" "}
                        {selectedTokens().length} token(s)? This action cannot
                        be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={(e) =>
                          e.currentTarget.closest("dialog")?.close()
                        }
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          await handleDelete();
                          document.querySelector("dialog")?.close();
                        }}
                      >
                        Delete
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <TokenTable
              tokens={filteredAndSortedTokens()}
              sortState={{ column: sortColumn, direction: sortDirection }}
              onSort={handleSort}
              onSelectAll={handleSelectAll}
              onSelectToken={handleSelectToken}
              isTokenSelected={isTokenSelected}
            />
          </div>
        </CommandCard>
      </Show>
    </div>
  );
};

export default TokensPage;
