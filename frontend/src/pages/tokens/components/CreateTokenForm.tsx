import { createSignal, Show, For, createEffect } from "solid-js";
import type { Component } from "solid-js";
import { createToken } from "~/lib/api";
import type { Token } from "~/lib/types";
import { Button } from "~/components/ui/Button";
import {
  TextField,
  TextFieldLabel,
  TextFieldInput,
} from "~/components/ui/TextField";
import { showToast } from "~/components/ui/Toast";
import AlertTriangle from "lucide-solid/icons/alert-triangle";
import ChevronDown from "lucide-solid/icons/chevron-down";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/DropdownMenu";

interface CreateTokenFormProps {
  rootToken: string;
  tokens: Token[];
  onTokenCreated: (token: Token) => void;
}

export const CreateTokenForm: Component<CreateTokenFormProps> = (props) => {
  const permissionKeys = [
    "permission_read",
    "permission_write",
    "permission_share_read",
    "permission_share_write",
  ] as const;
  type PermissionKey = (typeof permissionKeys)[number];

  // Find the current root token to get its namespace
  const currentToken = () =>
    props.tokens.find((t) => t.code === props.rootToken);

  // Get available parent tokens (tokens with share permissions)
  const availableParents = () =>
    props.tokens.filter(
      (t) => t.permission_share_read || t.permission_share_write
    );

  const [selectedParentToken, setSelectedParentToken] =
    createSignal<Token | null>(currentToken() || null);
  const [childNamespace, setChildNamespace] = createSignal("");

  const [newToken, setNewToken] = createSignal({
    description: "",
    permission_read: true,
    permission_write: false,
    permission_share_read: false,
    permission_share_write: false,
    permission_share_share: false,
  });

  const [namespaceError, setNamespaceError] = createSignal("");
  const namespaceSegmentRegex = new RegExp(
    `^([a-zA-Z0-9]+([a-zA-Z0-9]|[-_])*([a-zA-Z0-9]))?$`
  );

  createEffect(() => {
    if (!selectedParentToken() && currentToken()) {
      setSelectedParentToken(currentToken()!);
    }
  });

  const getFullNamespace = () => {
    const parent = selectedParentToken();
    if (!parent) return "/";
    const child = childNamespace().trim();
    if (!child) return parent.namespace;
    return `${parent.namespace}${child}/`;
  };

  const handlePermissionChange = (perm: PermissionKey, checked: boolean) => {
    setNewToken((prev) => {
      const next = { ...prev };
      if (perm === "permission_read") {
        next.permission_read = checked;
        if (!checked) {
          next.permission_write = false;
          next.permission_share_read = false;
          next.permission_share_write = false;
          next.permission_share_share = false;
        }
      }
      if (perm === "permission_write") {
        next.permission_write = checked;
        if (checked && !next.permission_read) next.permission_read = true;
      }
      if (perm === "permission_share_read") {
        next.permission_share_read = checked;
        if (checked && !next.permission_read) next.permission_read = true;
      }
      if (perm === "permission_share_write") {
        next.permission_share_write = checked;
        if (checked) {
          next.permission_read = true;
          next.permission_write = true;
          next.permission_share_read = true;
        }
      }
      return next;
    });
  };

  const handleChildNamespaceInput = (value: string) => {
    setChildNamespace(value);

    if (value && !namespaceSegmentRegex.test(value)) {
      setNamespaceError(
        "Invalid format. Segment must start/end with a letter/number"
      );
    } else {
      setNamespaceError("");
    }
  };

  const handleSelectParent = (token: Token) => {
    console.log("Selecting parent token:", token);
    setSelectedParentToken(token);
    setChildNamespace("");
    setNamespaceError("");
  };

  const handleCreateToken = async (e: Event) => {
    e.preventDefault();
    if (namespaceError()) return;

    const parent = selectedParentToken();
    if (!parent) {
      showToast({
        title: "Error",
        description: "Please select a parent namespace.",
        variant: "destructive",
      });
      return;
    }

    try {
      const token = newToken();
      const fullNamespace = getFullNamespace();
      console.log("Creating token with parent code:", parent.code);
      const created = await createToken(
        parent.code,
        token.description,
        fullNamespace,
        token.permission_read,
        token.permission_write,
        token.permission_share_read,
        token.permission_share_write,
        token.permission_share_share
      );

      props.onTokenCreated(created);
      showToast({
        title: "Success",
        description: "Token created successfully!",
      });

      setChildNamespace("");
      setNewToken({
        description: "",
        permission_read: true,
        permission_write: false,
        permission_share_read: false,
        permission_share_write: false,
        permission_share_share: false,
      });
    } catch {
      showToast({
        title: "Error",
        description: "Failed to create token.",
        variant: "destructive",
      });
    }
  };

  return (
    <form onSubmit={handleCreateToken} class="space-y-4">
      <div class="space-y-4">
        <TextField>
          <TextFieldLabel>Parent Namespace</TextFieldLabel>
          <DropdownMenu>
            <DropdownMenuTrigger
              as="button"
              type="button"
              class="w-full flex items-center justify-between px-3 py-2 border rounded-md bg-background hover:bg-accent"
            >
              <span class="text-sm">
                {selectedParentToken()?.namespace || "Select parent namespace"}
              </span>
              <ChevronDown class="h-4 w-4 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-full max-h-60 overflow-y-auto">
              <For each={availableParents()}>
                {(token) => (
                  <DropdownMenuItem
                    onSelect={() => handleSelectParent(token)}
                    class="flex flex-col items-start"
                  >
                    <span class="font-medium">{token.namespace}</span>
                    <Show when={token.description}>
                      <span class="text-xs text-muted-foreground">
                        {token.description}
                      </span>
                    </Show>
                  </DropdownMenuItem>
                )}
              </For>
            </DropdownMenuContent>
          </DropdownMenu>
        </TextField>

        <Show when={selectedParentToken()}>
          <TextField>
            <TextFieldLabel>Child Namespace</TextFieldLabel>
            <div class="flex items-center gap-2 w-full">
              <span class="text-sm text-muted-foreground px-3 py-2 border rounded-md bg-muted max-w-[150px] truncate">
                {selectedParentToken()?.namespace}
              </span>
              <div class="relative flex-1">
                <TextFieldInput
                  placeholder="child"
                  value={childNamespace()}
                  onInput={(e) =>
                    handleChildNamespaceInput(e.currentTarget.value)
                  }
                  class="w-full pr-6"
                />
                <span class="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none select-none">
                  /
                </span>
              </div>
            </div>
            <Show when={namespaceError()}>
              <p class="text-xs text-destructive flex items-center gap-2 pt-1">
                <AlertTriangle size={14} /> {namespaceError()}
              </p>
            </Show>
            <p class="text-xs text-muted-foreground pt-1">
              Full namespace:{" "}
              <span class="font-mono">{getFullNamespace()}</span>
            </p>
          </TextField>
        </Show>

        <TextField>
          <TextFieldLabel>Description</TextFieldLabel>
          <TextFieldInput
            placeholder="e.g., Read-only access for team member"
            value={newToken().description}
            onInput={(e) =>
              setNewToken((p) => ({ ...p, description: e.currentTarget.value }))
            }
          />
        </TextField>

        <fieldset>
          <legend class="text-sm font-medium mb-2">Permissions</legend>
          <div class="grid grid-cols-2 gap-4">
            <For each={permissionKeys}>
              {(p) => (
                <label class="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    class="rounded"
                    checked={newToken()[p]}
                    onInput={(e) =>
                      handlePermissionChange(p, e.currentTarget.checked)
                    }
                  />
                  {`Can ${p
                    .replace("permission_", "")
                    .replace(/([A-Z])/g, " $1")
                    .toLowerCase()}`}
                </label>
              )}
            </For>
          </div>
        </fieldset>
        <Button type="submit" class="w-full">
          Create Token
        </Button>
      </div>
    </form>
  );
};
