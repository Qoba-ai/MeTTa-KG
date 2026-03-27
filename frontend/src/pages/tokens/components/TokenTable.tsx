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
      class="p-3 text-left font-semibold cursor-pointer text-[#00d4ff] uppercase tracking-widest text-xs hover:text-[#e2e8f0] transition-colors"
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
    <div class="rounded-xl border border-[rgba(0,212,255,0.15)] overflow-x-auto bg-[#07091a]/40 shadow-[0_0_20px_rgba(0,212,255,0.05)]">
      <table class="w-full text-sm text-[#c4cfdf]">
        <thead class="bg-[rgba(0,212,255,0.04)]">
          <tr class="border-b border-[rgba(0,212,255,0.15)]">
            <th class="p-4 w-10 text-left">
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
            <th class="p-3 text-left font-semibold text-[#00d4ff] uppercase tracking-widest text-xs">
              Code
            </th>
            <SortableHeader
              column={SortableColumns.NAMESPACE}
              title="Namespace"
            />
            <th class="p-3 text-left font-semibold text-[#00d4ff] uppercase tracking-widest text-xs">
              Description
            </th>
            <th class="p-3 text-center font-semibold text-[#00d4ff] uppercase tracking-widest text-xs">
              R
            </th>
            <th class="p-3 text-center font-semibold text-[#00d4ff] uppercase tracking-widest text-xs">
              W
            </th>
            <th class="p-3 text-center font-semibold text-[#00d4ff] uppercase tracking-widest text-xs">
              SR
            </th>
            <th class="p-3 text-center font-semibold text-[#00d4ff] uppercase tracking-widest text-xs">
              SW
            </th>
          </tr>
        </thead>
        <tbody>
          <For each={props.tokens}>
            {(token) => (
              <tr class="border-b border-[rgba(0,212,255,0.08)] last:border-none hover:bg-[rgba(0,212,255,0.06)] transition-colors">
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
                <td class="p-4 text-[#8892a4] whitespace-nowrap text-xs">
                  {new Date(token.creation_timestamp).toLocaleString()}
                </td>
                <td class="p-3">
                  <div class="flex items-center gap-2 font-mono">
                    <span>{token.code}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyToken(token)}
                    >
                      <Show
                        when={copiedTokenId() === token.id}
                        fallback={<Copy size={16} class="text-[#00d4ff]" />}
                      >
                        <Check class="text-[#00b894]" size={16} />
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
        <div class="p-8 text-center text-[#8892a4] font-medium tracking-wide">
          No tokens found.
        </div>
      </Show>
    </div>
  );
};
