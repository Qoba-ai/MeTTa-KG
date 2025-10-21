import { createSignal, For, Show } from "solid-js";
import type { Component } from "solid-js";
import { Token } from "~/lib/types";
import { SortableColumns } from "../lib";
import { Button } from "~/components/ui/Button";
import { showToast } from "~/components/ui/Toast";
import Copy from "lucide-solid/icons/copy";
import ArrowUp from "lucide-solid/icons/arrow-up";
import ArrowDown from "lucide-solid/icons/arrow-down";
import Check from "lucide-solid/icons/check";
import X from "lucide-solid/icons/x";

interface TokenTableProps {
  tokens: Token[];
  sortState: { column: () => SortableColumns; direction: () => "asc" | "desc" };
  onSort: (column: SortableColumns) => void;
  onSelectAll: (checked: boolean) => void;
  onSelectToken: (token: Token, checked: boolean) => void;
  isTokenSelected: (token: Token) => boolean;
}

export const TokenTable: Component<TokenTableProps> = (props) => {
  const [copiedTokenId, setCopiedTokenId] = createSignal<number | null>(null);

  const handleCopyToken = (token: Token) => {
    navigator.clipboard.writeText(token.code);
    setCopiedTokenId(token.id);
    showToast({
      title: "Success",
      description: "Token code copied to clipboard!",
    });
    setTimeout(() => setCopiedTokenId(null), 2000);
  };

  const SortableHeader: Component<{
    column: SortableColumns;
    title: string;
  }> = (hProps) => (
    <th
      class="p-3 text-left font-medium cursor-pointer"
      onClick={() => props.onSort(hProps.column)}
    >
      {hProps.title}{" "}
      <Show when={props.sortState.column() === hProps.column}>
        {props.sortState.direction() === "desc" ? (
          <ArrowDown class="inline w-4 h-4" />
        ) : (
          <ArrowUp class="inline w-4 h-4" />
        )}
      </Show>
    </th>
  );

  return (
    <div class="border rounded-lg overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-muted">
          <tr class="border-b">
            <th class="p-3 w-10 text-left">
              <input
                type="checkbox"
                class="rounded"
                onChange={(e) => props.onSelectAll(e.currentTarget.checked)}
              />
            </th>
            <SortableHeader
              column={SortableColumns.TIMESTAMP}
              title="Created"
            />
            <th class="p-3 text-left font-medium">Code</th>
            <SortableHeader
              column={SortableColumns.NAMESPACE}
              title="Namespace"
            />
            <th class="p-3 text-left font-medium">Description</th>
            <th class="p-3 text-center font-medium">R</th>
            <th class="p-3 text-center font-medium">W</th>
            <th class="p-3 text-center font-medium">SR</th>
            <th class="p-3 text-center font-medium">SW</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.tokens}>
            {(token) => (
              <tr class="border-b last:border-none hover:bg-muted/50">
                <td class="p-3">
                  <input
                    type="checkbox"
                    class="rounded"
                    checked={props.isTokenSelected(token)}
                    onChange={(e) =>
                      props.onSelectToken(token, e.currentTarget.checked)
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
                        fallback={<Copy size={16} />}
                      >
                        <Check class="text-green-500" size={16} />
                      </Show>
                    </Button>
                  </div>
                </td>
                <td class="p-3 max-w-[150px]">
                  <span class="block truncate" title={token.namespace}>
                    {token.namespace}
                  </span>
                </td>
                <td class="p-3 text-muted-foreground max-w-[150px]">
                  <span class="block truncate" title={token.description}>
                    {token.description}
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
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Show when={props.tokens.length === 0}>
        <div class="p-6 text-center text-muted-foreground">
          No tokens found.
        </div>
      </Show>
    </div>
  );
};
