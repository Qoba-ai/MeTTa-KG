import type { Component, JSX, ResourceFetcherInfo } from "solid-js";
import { createResource, createSignal, For, onMount, Show } from "solid-js";
import { A } from "@solidjs/router";
import { BACKEND_URL } from "./urls";
import { AiOutlineCopy } from "solid-icons/ai";
import styles from "./Tokens.module.scss";
import toast, { Toaster } from "solid-toast";

interface Token {
  id: number;
  code: string;
  description: string;
  namespace: string;
  creation_timestamp: string;
  permission_read: boolean;
  permission_write: boolean;
  permission_share_read: boolean;
  permission_share_write: boolean;
  permission_share_share: boolean;
  parent: number | null;
}

enum SortableColumns {
  TIMESTAMP,
  NAMESPACE,
  READ,
  WRITE,
  SHARE_READ,
  SHARE_WRITE,
  SHARE_SHARE,
}

const fetchTokens = async (
  root: string | null,
  info: ResourceFetcherInfo<Token[], boolean>
): Promise<Token[]> => {
  localStorage.setItem("rootToken", root ?? "");

  if (!root) {
    return [];
  }

  try {
    const resp = await fetch(`${BACKEND_URL}/tokens`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: root },
    });

    const tokens = await resp.json();

    toast(`Loaded ${tokens.length} tokens.`);

    return tokens;
  } catch (e) {
    toast(`Failed to fetch tokens`);
    return [];
  }
};

const createToken = async (
  root: string | null,
  description: string,
  namespace: string,
  read: boolean,
  write: boolean
): Promise<Token> => {
  if (root === null) {
    console.error(`Tried creating token without root`);
    throw new Error("No root token");
  }

  // note: most of these values will be ignored by the backend, such as
  // id and code (these are generated upon insertion)
  const newToken: Token = {
    id: 0,
    code: "",
    description: description,
    namespace: namespace,
    creation_timestamp: new Date().toISOString().split("Z")[0],
    permission_read: read,
    permission_write: write,
    permission_share_read: false,
    permission_share_write: false,
    permission_share_share: false,
    parent: 0,
  };

  const resp = await fetch(`${BACKEND_URL}/tokens`, {
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
  if (!root) {
    return [];
  }

  const promises = tokens.map((t) =>
    fetch(`${BACKEND_URL}/tokens/${t.id}`, {
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
  if (!root) {
    return;
  }

  await fetch(`${BACKEND_URL}/tokens`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: root },
    body: JSON.stringify(tokens.map((t) => t.id)),
  });
};

const Tokens: Component = () => {
  let rootTokenForm: HTMLFormElement;
  let rootTokenFormInput: HTMLInputElement;

  let newTokenForm: HTMLFormElement;
  let newTokenDescriptionInput: HTMLInputElement;
  let newTokenNamespaceInput: HTMLInputElement;
  let newTokenReadCheckbox: HTMLInputElement;
  let newTokenWriteCheckbox: HTMLInputElement;
  let newTokenShareReadCheckbox: HTMLInputElement;
  let newTokenShareWriteCheckbox: HTMLInputElement;

  let tokenTableSelectAllCheckbox: HTMLInputElement;

  let namespaceSearch: HTMLDivElement;
  let namespaceSearchInput: HTMLInputElement;

  let descriptionSearch: HTMLDivElement;
  let descriptionSearchInput: HTMLInputElement;

  let createdTokenModel: HTMLDialogElement;
  let refreshTokensModel: HTMLDialogElement;
  let deleteTokensModel: HTMLDialogElement;

  const [rootTokenCode, setRootTokenCode] = createSignal<string | null>(
    localStorage.getItem("rootToken")
  );

  const [rootTokenCodeInputValue, setRootTokenCodeInputValue] = createSignal<
    string | null
  >(localStorage.getItem("rootToken"));

  // TODO: refactor into separate component
  const [selectedTokens, setSelectedTokens] = createSignal<Token[]>([]);
  const [sortColumn, setSortColumn] = createSignal<SortableColumns>(
    SortableColumns.TIMESTAMP
  );
  const [sortDirectionDescending, setSortDirectionDescending] =
    createSignal<boolean>(true);
  const [namespaceSearchRegex, setNamespaceSearchRegex] = createSignal<
    string | null
  >(null);
  const [descriptionSearchRegex, setDescriptionSearchRegex] = createSignal<
    string | null
  >(null);
  const [copiedToken, setCopiedToken] = createSignal<Token | null>();

  const [tokens, { refetch: refetchTokens, mutate: mutateTokens }] =
    createResource<Token[], string, boolean>(rootTokenCode, fetchTokens, {
      initialValue: [],
    });

  onMount(() => {
    rootTokenForm.onsubmit = (event) => {
      event.preventDefault();

      const newRootToken = rootTokenFormInput.value.trim();

      setRootTokenCode(newRootToken);
    };

    newTokenForm.onsubmit = async (event) => {
      event.preventDefault();

      const description = newTokenDescriptionInput.value;
      const namespace = newTokenNamespaceInput.value;
      const read = newTokenReadCheckbox.checked;
      const write = newTokenWriteCheckbox.checked;

      try {
        const newToken = await createToken(
          rootTokenCode(),
          description,
          namespace,
          read,
          write
        );

        mutateTokens((v) => [...v, newToken]);

        // bit of a hack
        // signals propagate: the mutateTokens call above causes newTokenNamespaceInput to re-render
        newTokenNamespaceInput.value = namespace;

        toast.success(
          (t) => (
            <div>
              <span>Successfully created token.</span>
              <br />
              <button
                class={styles.ToastButton}
                onclick={() => navigator.clipboard.writeText(newToken.code)}
              >
                Copy Code
              </button>
            </div>
          ),
          {
            duration: 1000 * 10,
          }
        );
      } catch (e) {
        toast(`Failed to create new token.`);
      }
    };
  });

  const handleTableHeadCellClick = (column: SortableColumns) => {
    setSortColumn(column);
    setSortDirectionDescending(!sortDirectionDescending());
  };

  const handleRefreshTokensButtonClick = async () => {
    const results = await refreshCodes(rootTokenCode(), selectedTokens());

    const oldRootToken = selectedTokens().find(
      (t) => t.code === rootTokenCode()
    );

    if (oldRootToken) {
      const newCode =
        results.find((t) => t.id === oldRootToken.id)?.code ?? null;

      setRootTokenCode(newCode);
      setRootTokenCodeInputValue(newCode);
    }

    const selectedTokenIDs = selectedTokens().map((t) => t.id);

    mutateTokens((v) => [
      ...v.filter((t) => !selectedTokenIDs.includes(t.id)),
      ...results,
    ]);

    setSelectedTokens(tokens().filter((t) => selectedTokenIDs.includes(t.id)));

    toast(`Refreshed code for ${results.length} tokens.`);
  };

  const handleDeleteTokensButtonClick = async () => {
    const selectedTokenIDs = selectedTokens().map((t) => t.id);
    const count = selectedTokens().length;

    try {
      await deleteTokens(rootTokenCode(), selectedTokens());
      setSelectedTokens([]);

      mutateTokens((v) => v.filter((t) => !selectedTokenIDs.includes(t.id)));

      tokenTableSelectAllCheckbox.checked = false;

      toast(`Deleted ${count} tokens.`);
    } catch (e) {
      toast(`Failed to delete tokens.`);
    }
  };

  const handleSelectAllTokensChecked: JSX.ChangeEventHandlerUnion<
    HTMLInputElement,
    Event
  > = (e) => {
    if (e.target.checked) {
      setSelectedTokens(tokens());
    } else {
      setSelectedTokens([]);
    }
  };

  const handleSelectTokenChecked = (token: Token, checked: boolean) => {
    if (checked) {
      setSelectedTokens([...selectedTokens(), token]);
      tokenTableSelectAllCheckbox.checked = true;
    } else {
      setSelectedTokens(selectedTokens().filter((t) => t.id !== token.id));

      if (selectedTokens().length === 0) {
        tokenTableSelectAllCheckbox.checked = false;
      }
    }
  };

  const onTokenInputChanged: JSX.ChangeEventHandler<HTMLInputElement, Event> = (
    e
  ) => {};

  const sortTokens = (a: Token, b: Token) => {
    let result = 0;

    if (sortColumn() === SortableColumns.NAMESPACE) {
      if (a.namespace.startsWith(b.namespace)) {
        result = 1;
      } else if (b.namespace.startsWith(a.namespace)) {
        result = -1;
      } else {
        result = 0;
      }
    } else if (sortColumn() === SortableColumns.TIMESTAMP) {
      result =
        Date.parse(a.creation_timestamp) - Date.parse(b.creation_timestamp);
    } else if (sortColumn() === SortableColumns.READ) {
      result = a.permission_read && !b.permission_read ? 1 : -1;
    } else if (sortColumn() === SortableColumns.WRITE) {
      result = a.permission_write && !b.permission_write ? 1 : -1;
    } else if (sortColumn() === SortableColumns.SHARE_READ) {
      result = a.permission_share_read && !b.permission_share_read ? 1 : -1;
    } else if (sortColumn() === SortableColumns.SHARE_WRITE) {
      result = a.permission_share_write && !b.permission_share_write ? 1 : -1;
    } else if (sortColumn() === SortableColumns.SHARE_SHARE) {
      result = a.permission_share_share && !b.permission_share_share ? 1 : -1;
    }

    if (sortDirectionDescending()) {
      return result;
    } else {
      return -result;
    }
  };

  return (
    <div class={styles.Page}>
      <div class={styles.Navbar}>
        <span class={styles.NavbarTitle}>MeTTa KG</span>
        <div class={styles.NavbarContent}>
          <A href="/" class={styles.LoginButton}>
            Editor
          </A>
        </div>
      </div>
      <div class={styles.ContentWrapper}>
        <div class={styles.RootTokenFormWrapper}>
          <h1>Manage Access</h1>
          <form class={styles.RootTokenForm} ref={rootTokenForm!}>
            <input
              ref={rootTokenFormInput!}
              type="search"
              class={styles.TokenInput}
              placeholder="Token"
              value={rootTokenCodeInputValue() ?? ""}
              onchange={(e) =>
                setRootTokenCodeInputValue(e.target.value.trim())
              }
              pattern={
                "(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)"
              }
            />
            <div class={styles.RootTokenFormActions}>
              <input type="submit" value={"Submit"} />
            </div>
          </form>
        </div>
        <div class={styles.InnerContentWrapper}>
          <div class={styles.TokenTableWrapper}>
            <table class={styles.TokenTable}>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      onchange={handleSelectAllTokensChecked}
                      ref={tokenTableSelectAllCheckbox!}
                    />
                  </th>
                  <th
                    onclick={() =>
                      handleTableHeadCellClick(SortableColumns.TIMESTAMP)
                    }
                  >
                    <span>Creation</span>
                    <Show
                      when={
                        sortColumn() === SortableColumns.TIMESTAMP &&
                        sortDirectionDescending()
                      }
                    >
                      ↓
                    </Show>
                    <Show
                      when={
                        sortColumn() === SortableColumns.TIMESTAMP &&
                        !sortDirectionDescending()
                      }
                    >
                      ↑
                    </Show>
                  </th>
                  <th>Code</th>
                  <th
                    onclick={(e) => {
                      if (e.target !== namespaceSearchInput) {
                        handleTableHeadCellClick(SortableColumns.NAMESPACE);
                      }
                    }}
                  >
                    <span>Namespace</span>
                    <Show
                      when={
                        sortColumn() === SortableColumns.NAMESPACE &&
                        sortDirectionDescending()
                      }
                    >
                      ↓
                    </Show>
                    <Show
                      when={
                        sortColumn() === SortableColumns.NAMESPACE &&
                        !sortDirectionDescending()
                      }
                    >
                      ↑
                    </Show>
                    <div ref={namespaceSearch!}>
                      <input
                        class={styles.NamespaceSearchRegexInput}
                        ref={namespaceSearchInput!}
                        placeholder="Search Pattern"
                        onchange={(e) =>
                          setNamespaceSearchRegex(e.target.value)
                        }
                      />
                    </div>
                  </th>
                  <th>
                    <span>Description</span>
                    <div ref={descriptionSearch!}>
                      <input
                        class={styles.DescriptionSearchRegexInput}
                        ref={descriptionSearchInput!}
                        placeholder="Search Pattern"
                        onchange={(e) =>
                          setDescriptionSearchRegex(e.target.value)
                        }
                      />
                    </div>
                  </th>
                  <th
                    onClick={(e) =>
                      handleTableHeadCellClick(SortableColumns.READ)
                    }
                  >
                    <span>Read</span>
                    <Show
                      when={
                        sortColumn() === SortableColumns.READ &&
                        sortDirectionDescending()
                      }
                    >
                      ↓
                    </Show>
                    <Show
                      when={
                        sortColumn() === SortableColumns.READ &&
                        !sortDirectionDescending()
                      }
                    >
                      ↑
                    </Show>
                  </th>
                  <th
                    onClick={(e) =>
                      handleTableHeadCellClick(SortableColumns.WRITE)
                    }
                  >
                    <span>Write</span>
                    <Show
                      when={
                        sortColumn() === SortableColumns.WRITE &&
                        sortDirectionDescending()
                      }
                    >
                      ↓
                    </Show>
                    <Show
                      when={
                        sortColumn() === SortableColumns.WRITE &&
                        !sortDirectionDescending()
                      }
                    >
                      ↑
                    </Show>
                  </th>
                  <th
                    onClick={(e) =>
                      handleTableHeadCellClick(SortableColumns.SHARE_READ)
                    }
                  >
                    <span>Share Read</span>
                    <Show
                      when={
                        sortColumn() === SortableColumns.SHARE_READ &&
                        sortDirectionDescending()
                      }
                    >
                      ↓
                    </Show>
                    <Show
                      when={
                        sortColumn() === SortableColumns.SHARE_READ &&
                        !sortDirectionDescending()
                      }
                    >
                      ↑
                    </Show>
                  </th>
                  <th
                    onClick={(e) =>
                      handleTableHeadCellClick(SortableColumns.SHARE_WRITE)
                    }
                  >
                    <span>Share Write</span>
                    <Show
                      when={
                        sortColumn() === SortableColumns.SHARE_WRITE &&
                        sortDirectionDescending()
                      }
                    >
                      ↓
                    </Show>
                    <Show
                      when={
                        sortColumn() === SortableColumns.SHARE_WRITE &&
                        !sortDirectionDescending()
                      }
                    >
                      ↑
                    </Show>
                  </th>
                  <th
                    onClick={(e) =>
                      handleTableHeadCellClick(SortableColumns.SHARE_SHARE)
                    }
                  >
                    <span>Recursive Share</span>
                    <Show
                      when={
                        sortColumn() === SortableColumns.SHARE_SHARE &&
                        sortDirectionDescending()
                      }
                    >
                      ↓
                    </Show>
                    <Show
                      when={
                        sortColumn() === SortableColumns.SHARE_SHARE &&
                        !sortDirectionDescending()
                      }
                    >
                      ↑
                    </Show>
                  </th>
                </tr>
              </thead>
              <tbody>
                <For
                  each={tokens()
                    .filter((t) =>
                      t.namespace.match(namespaceSearchRegex() ?? ".*")
                    )
                    .filter((t) =>
                      t.description.match(descriptionSearchRegex() ?? ".*")
                    )
                    .sort(sortTokens)}
                >
                  {(token) => (
                    <Show when={true}>
                      <tr
                        class={
                          selectedTokens().includes(token)
                            ? styles.SelectedToken
                            : styles.UnselectedToken
                        }
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedTokens().includes(token)}
                            onchange={(e) =>
                              handleSelectTokenChecked(token, e.target.checked)
                            }
                          />
                        </td>
                        <td>
                          {new Date(token.creation_timestamp).toLocaleString()}
                        </td>
                        <td>
                          <div
                            class={
                              styles.TokenTableCodeCell +
                              " " +
                              (copiedToken() ? styles.Copied : "")
                            }
                            onclick={(e) => {
                              navigator.clipboard.writeText(token.code);
                              e.currentTarget.classList.add("Copied");
                              setCopiedToken(token);

                              setTimeout(() => {
                                e.target.classList.remove("Copied");
                                setCopiedToken(null);
                              }, 1000 * 1);
                            }}
                            onPointerLeave={(e) => {}}
                          >
                            <div class={styles.TokenTableCellCode}>
                              <span>{token.code}</span>
                            </div>
                            <div>
                              <AiOutlineCopy
                                class={styles.TokenTableCodeCellIcon}
                              />
                              <Show when={copiedToken() === token}>
                                <div
                                  class={styles.TokenTableCodeCellCopyTooltip}
                                >
                                  Code copied to clipboard
                                </div>
                              </Show>
                            </div>
                          </div>
                        </td>
                        <td>{token.namespace}</td>
                        <td>{token.description}</td>
                        <td>
                          <div class={styles.PermissionIcon}>
                            {token.permission_read ? "✅" : "❌"}
                          </div>
                        </td>
                        <td>
                          <div class={styles.PermissionIcon}>
                            {token.permission_write ? "✅" : "❌"}
                          </div>
                        </td>
                        <td>
                          <div class={styles.PermissionIcon}>
                            {token.permission_share_read ? "✅" : "❌"}
                          </div>
                        </td>
                        <td>
                          <div class={styles.PermissionIcon}>
                            {token.permission_share_write ? "✅" : "❌"}
                          </div>
                        </td>
                        <td>
                          <div class={styles.PermissionIcon}>
                            {token.permission_share_share ? "✅" : "❌"}
                          </div>
                        </td>
                      </tr>
                    </Show>
                  )}
                </For>
              </tbody>
            </table>
            <Show when={tokens()?.length === 0}>
              <div class={styles.TokenTableNoData}>
                <span>No Tokens Available</span>
              </div>
            </Show>
            <div class={styles.TableButtonBar}>
              <button
                disabled={selectedTokens().length === 0}
                onclick={() => refreshTokensModel.showModal()}
              >
                Refresh Code
              </button>
              <button
                disabled={
                  selectedTokens().length === 0 ||
                  selectedTokens().findIndex(
                    (t) => t.code === rootTokenCode()
                  ) !== -1
                }
                onclick={() => deleteTokensModel.showModal()}
              >
                Delete
              </button>
              <div style={{ "flex-grow": 1 }}> </div>
            </div>
          </div>
          <div class={styles.NewTokenFormWrapper}>
            <h2>Create Token</h2>
            <form class={styles.NewTokenForm} ref={newTokenForm!}>
              <label>Namespace</label>
              <br />
              <input
                ref={newTokenNamespaceInput!}
                type="text"
                placeholder="Namespace"
                required
                pattern={"^/(([a-zA-Z0-9])+([a-zA-Z0-9]|-|_)*([a-zA-Z0-9])/)*$"}
                disabled={!tokens().find((t) => t.code === rootTokenCode())}
                value={
                  tokens().find((t) => t.code === rootTokenCode())?.namespace ??
                  ""
                }
              />
              <br />
              <label>Description</label>
              <br />
              <input
                ref={newTokenDescriptionInput!}
                type="text"
                required
                placeholder="Description"
                disabled={!tokens().find((t) => t.code === rootTokenCode())}
              />
              <br />
              <div class={styles.NewTokenPermissions}>
                <fieldset>
                  <legend>Permissions</legend>
                  <label>Read</label>
                  <input
                    ref={newTokenReadCheckbox!}
                    onchange={(e) => {
                      if (!e.target.checked) {
                        newTokenWriteCheckbox.checked = false;
                        newTokenShareReadCheckbox.checked = false;
                        newTokenShareWriteCheckbox.checked = false;
                      }
                    }}
                    type="checkbox"
                    checked={true}
                    disabled={
                      !rootTokenCode() ||
                      !tokens().find((t) => t.code === rootTokenCode())
                        ?.permission_share_read
                    }
                  />
                  <br />
                  <label>Write</label>
                  <input
                    ref={newTokenWriteCheckbox!}
                    onchange={(e) => {
                      if (e.target.checked) {
                        newTokenReadCheckbox.checked = true;
                      } else {
                        newTokenShareWriteCheckbox.checked = false;
                      }
                    }}
                    type="checkbox"
                    disabled={
                      !rootTokenCode() ||
                      !tokens().find((t) => t.code === rootTokenCode())
                        ?.permission_share_write
                    }
                  />
                  <br />
                  <label>Share read</label>
                  <input
                    ref={newTokenShareReadCheckbox!}
                    onchange={(e) => {
                      if (e.target.checked) {
                        newTokenReadCheckbox.checked = true;
                      } else {
                        newTokenShareWriteCheckbox.checked = false;
                      }
                    }}
                    type="checkbox"
                    disabled={
                      !rootTokenCode() ||
                      !tokens().find((t) => t.code === rootTokenCode())
                        ?.permission_share_share
                    }
                  />
                  <br />
                  <label>Share write</label>
                  <input
                    ref={newTokenShareWriteCheckbox!}
                    onchange={(e) => {
                      if (e.target.checked) {
                        newTokenReadCheckbox.checked = true;
                        newTokenWriteCheckbox.checked = true;
                        newTokenShareReadCheckbox.checked = true;
                      }
                    }}
                    type="checkbox"
                    disabled={
                      !rootTokenCode() ||
                      !tokens().find((t) => t.code === rootTokenCode())
                        ?.permission_share_share
                    }
                  />
                </fieldset>
              </div>
              <input type="submit" value={"Create"} />
            </form>
          </div>
        </div>
      </div>
      <dialog ref={refreshTokensModel!} class={styles.RefreshTokensModal}>
        <h2>Refresh codes?</h2>
        <span>
          Selected codes will no longer give access to the associated
          namespaces.
        </span>
        <div class={styles.ButtonBar}>
          <button
            class={styles.ConfirmButton}
            onclick={() => {
              handleRefreshTokensButtonClick();
              refreshTokensModel.close();
            }}
          >
            Confirm
          </button>
          <button class={styles.CancelButton}>Cancel</button>
        </div>
      </dialog>
      <dialog ref={deleteTokensModel!} class={styles.deleteTokensModal}>
        <h2>Delete tokens?</h2>
        <span>
          Selected tokens will be deleted permanently. Sub-tokens will be
          deleted recursively.
        </span>
        <div class={styles.ButtonBar}>
          <button
            class={styles.ConfirmButton}
            onclick={() => {
              handleDeleteTokensButtonClick();
              deleteTokensModel.close();
            }}
          >
            Confirm
          </button>
          <button class={styles.CancelButton}>Cancel</button>
        </div>
      </dialog>
      <Toaster />
    </div>
  );
};

export default Tokens;
