import { createSignal, Show } from "solid-js";
import type { Component } from "solid-js";
import { createToken } from "../lib/api";
import type { Token } from "../lib/types";
import { Button } from "~/components/ui/Button";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/TextField";
import { showToast } from "~/components/ui/Toast";
import AlertTriangle from "lucide-solid/icons/alert-triangle";

interface CreateTokenFormProps {
  rootToken: string;
  onTokenCreated: (token: Token) => void;
}

export const CreateTokenForm: Component<CreateTokenFormProps> = (props) => {
  const permissionKeys = [
    "permission_read",
    "permission_write",
    "permission_share_read",
    "permission_share_write",
    "permission_share_share",
  ] as const;
  type PermissionKey = (typeof permissionKeys)[number];

  const [newToken, setNewToken] = createSignal({
    description: "",
    namespace: "",
    permission_read: true,
    permission_write: false,
    permission_share_read: false,
    permission_share_write: false,
    permission_share_share: false,
  });

  const [namespaceError, setNamespaceError] = createSignal("");
  const namespaceRegex = new RegExp(
    `^/(([a-zA-Z0-9])+([a-zA-Z0-9]|[-_])*([a-zA-Z0-9])/)*$`
  );

  // FIX: Update the logic to handle the full property names
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
      if (perm === "permission_share_share") {
        next.permission_share_share = checked;
        if (checked) {
          next.permission_read = true;
          next.permission_write = true;
          next.permission_share_read = true;
          next.permission_share_write = true;
        }
      }
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

  const handleCreateToken = async (e: Event) => {
    e.preventDefault();
    if (namespaceError()) return;
    try {
      // FIX: Destructure the newToken object and pass properties as individual arguments
      // This exactly mirrors the logic from the original Tokens.tsx file.
      const {
        description,
        namespace,
        permission_read,
        permission_write,
        permission_share_read,
        permission_share_write,
        permission_share_share,
      } = newToken();

      const created = await createToken(
        props.rootToken,
        description,
        namespace,
        permission_read,
        permission_write,
        permission_share_read,
        permission_share_write,
        permission_share_share
      );

      props.onTokenCreated(created);
      showToast({
        title: "Success",
        description: "Token created successfully!",
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
              setNewToken((p) => ({ ...p, description: e.currentTarget.value }))
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
                {`Can ${p
                  .replace("permission_", "")
                  .replace(/([A-Z])/g, " $1")
                  .toLowerCase()}`}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" class="w-full">
          Create Token
        </Button>
      </div>
    </form>
  );
};
