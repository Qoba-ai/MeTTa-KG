import type { Component, JSX, ResourceFetcherInfo } from "solid-js";
import { createResource, createSignal, For, onMount, Show } from "solid-js";
import { A } from "@solidjs/router";
import { BACKEND_URL } from "./urls";
import {
  AiOutlineCopy,
  AiOutlineGithub,
} from "solid-icons/ai";
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
  write: boolean,
  shareRead: boolean,
  shareWrite: boolean,
  shareShare: boolean
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
    permission_share_read: shareRead,
    permission_share_write: shareWrite,
    permission_share_share: shareShare,
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

  let refreshTokensModel: HTMLDialogElement;
  let deleteTokensModal: HTMLDialogElement;

  const [rootTokenCode, setRootTokenCode] = createSignal<string | null>(
    localStorage.getItem("rootToken")
  );

  const [rootTokenCodeInputValue, setRootTokenCodeInputValue] = createSignal<
    string | null
  >(localStorage.getItem("rootToken"));

  const [newTokenReadEnabled, setNewTokenReadEnabled] =
    createSignal<boolean>(true);

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
      const newRootToken = rootTokenFormInput.value.trim();

      setRootTokenCode(newRootToken);
    };

    newTokenForm.onsubmit = async (event) => {
      event.preventDefault();

      const description = newTokenDescriptionInput.value;
      const namespace = newTokenNamespaceInput.value;
      const read = newTokenReadCheckbox.checked;
      const write = newTokenWriteCheckbox.checked;
      const shareRead = newTokenShareReadCheckbox.checked;
      const shareWrite = newTokenShareWriteCheckbox.checked;
      const shareShare = false;

      try {
        const newToken = await createToken(
          rootTokenCode(),
          description,
          namespace,
          read,
          write,
          shareRead,
          shareWrite,
          shareShare
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

  const handleTableHeadCellClick = (
    e: MouseEvent & { currentTarget: HTMLTableCellElement },
    column: SortableColumns
  ) => {
    setSortColumn(column);
    setSortDirectionDescending(!sortDirectionDescending());

    e.currentTarget.focus();
  };

  const handleTableHeadCellKeyPress = (
    e: KeyboardEvent,
    column: SortableColumns
  ) => {
    if (e.code === "Enter") {
      setSortColumn(column);
      setSortDirectionDescending(!sortDirectionDescending());
    }
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
        <a
          class={styles.NavbarGithubLink}
          href="https://github.com/Qoba-ai/MeTTa-KG"
        >
          <AiOutlineGithub size={24} />
        </a>
        <div class={styles.NavbarContent}>
          <A href="/" class={styles.LoginButton}>
            Editor
          </A>
        </div>
      </div>
      <div class={styles.ContentWrapper}>
        <div class={styles.RootTokenFormWrapper}>
          <form class={styles.RootTokenForm} ref={rootTokenForm!}>
            <h1>Manage Access</h1>
            <input
              ref={rootTokenFormInput!}
              type="search"
              class={styles.TokenInput}
              placeholder="Token"
              oninvalid={() =>
                rootTokenFormInput.setCustomValidity(
                  "Please enter a valid UUIDv4"
                )
              }
              value={rootTokenCodeInputValue() ?? ""}
              onchange={(e) => {
                setRootTokenCodeInputValue(e.target.value.trim());
                rootTokenFormInput.setCustomValidity("");
              }}
              pattern={
                "(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)"
              }
            />
            <div class={styles.RootTokenFormActions}>
              <input type="submit" value={"Submit"} />
            </div>
          </form>
        </div>
        <div class={styles.NewTokenFormWrapper}>
          <form class={styles.NewTokenForm} ref={newTokenForm!}>
            <h2>Create Token</h2>
            <label>Namespace</label>
            <input
              ref={newTokenNamespaceInput!}
              type="text"
              placeholder="Namespace"
              required
              pattern={"^/(([a-zA-Z0-9])+([a-zA-Z0-9]|-|_)*([a-zA-Z0-9])/)*$"}
              disabled={!tokens().find((t) => t.code === rootTokenCode())}
              onchange={() => newTokenNamespaceInput.setCustomValidity("")}
              oninvalid={() =>
                newTokenNamespaceInput.setCustomValidity(
                  "Namespaces start with '/' followed by 2 or more alphanumeric characters and end with '/'."
                )
              }
              value={
                tokens().find((t) => t.code === rootTokenCode())?.namespace ??
                ""
              }
            />
            <label>Description</label>
            <input
              ref={newTokenDescriptionInput!}
              type="text"
              required
              placeholder="Description"
              disabled={!tokens().find((t) => t.code === rootTokenCode())}
            />
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

                    setNewTokenReadEnabled(e.target.checked);
                  }}
                  type="checkbox"
                  checked={newTokenReadEnabled()}
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
                      ?.permission_share_read
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
                      ?.permission_share_write
                  }
                />
              </fieldset>
            </div>
            <input type="submit" value={"Create"} />
            <Show when={!newTokenReadEnabled()}>
              <div class={styles.NewTokenNoPermissionsWarning}>
                <span>Token has no permissions</span>
              </div>
            </Show>
          </form>
        </div>
        <div class={styles.TokenTableWrapper}>
          <div class={styles.TokenTableInnerWrapper}>
            <table class={styles.TokenTable}>
              <thead>
                <tr>
                  <th class={styles.TableHeaderCell} tabIndex={0}>
                    <input
                      type="checkbox"
                      onchange={handleSelectAllTokensChecked}
                      ref={tokenTableSelectAllCheckbox!}
                    />
                  </th>
                  <th
                    class={styles.TableHeaderCell}
                    tabIndex={0}
                    onclick={(e) =>
                      handleTableHeadCellClick(e, SortableColumns.TIMESTAMP)
                    }
                    onkeypress={(e) =>
                      handleTableHeadCellKeyPress(e, SortableColumns.TIMESTAMP)
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
                  <th class={styles.TableHeaderCell} tabIndex={0}>
                    Code
                  </th>
                  <th
                    class={styles.TableHeaderCell}
                    tabIndex={0}
                    onclick={(e) => {
                      if (e.target !== namespaceSearchInput) {
                        handleTableHeadCellClick(e, SortableColumns.NAMESPACE);
                      }
                    }}
                    onkeypress={(e) =>
                      handleTableHeadCellKeyPress(e, SortableColumns.NAMESPACE)
                    }
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
                        placeholder="Search Regex Pattern"
                        onchange={(e) =>
                          setNamespaceSearchRegex(e.target.value)
                        }
                      />
                    </div>
                  </th>
                  <th class={styles.TableHeaderCell} tabIndex={0}>
                    <span>Description</span>
                    <div ref={descriptionSearch!}>
                      <input
                        class={styles.DescriptionSearchRegexInput}
                        ref={descriptionSearchInput!}
                        placeholder="Search Regex Pattern"
                        onchange={(e) =>
                          setDescriptionSearchRegex(e.target.value)
                        }
                      />
                    </div>
                  </th>
                  <th
                    class={styles.TableHeaderCell}
                    tabIndex={0}
                    onClick={(e) =>
                      handleTableHeadCellClick(e, SortableColumns.READ)
                    }
                    onkeypress={(e) =>
                      handleTableHeadCellKeyPress(e, SortableColumns.READ)
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
                    class={styles.TableHeaderCell}
                    tabIndex={0}
                    onClick={(e) =>
                      handleTableHeadCellClick(e, SortableColumns.WRITE)
                    }
                    onkeypress={(e) =>
                      handleTableHeadCellKeyPress(e, SortableColumns.WRITE)
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
                    class={styles.TableHeaderCell}
                    tabIndex={0}
                    onClick={(e) =>
                      handleTableHeadCellClick(e, SortableColumns.SHARE_READ)
                    }
                    onkeypress={(e) =>
                      handleTableHeadCellKeyPress(e, SortableColumns.SHARE_READ)
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
                    class={styles.TableHeaderCell}
                    tabIndex={0}
                    onClick={(e) =>
                      handleTableHeadCellClick(e, SortableColumns.SHARE_WRITE)
                    }
                    onkeypress={(e) =>
                      handleTableHeadCellKeyPress(
                        e,
                        SortableColumns.SHARE_WRITE
                      )
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
                    class={styles.TableHeaderCell}
                    tabIndex={0}
                    onClick={(e) =>
                      handleTableHeadCellClick(e, SortableColumns.SHARE_SHARE)
                    }
                    onkeypress={(e) =>
                      handleTableHeadCellKeyPress(
                        e,
                        SortableColumns.SHARE_SHARE
                      )
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
                        onkeypress={(e) => {
                          if (
                            e.code === "Enter" &&
                            selectedTokens().includes(token)
                          ) {
                            navigator.clipboard.writeText(token.code);

                            const codeCell = e.currentTarget.querySelector(
                              styles.TokenTableCodeCell
                            );

                            if (codeCell) {
                              codeCell.classList.add("Copied");
                            }

                            setCopiedToken(token);

                            setTimeout(() => {
                              if (codeCell) {
                                codeCell.classList.remove("Copied");
                              }

                              setCopiedToken(null);
                            }, 1000 * 1);
                          }
                        }}
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
                            <div class={styles.TokenTableCellCode}>
                              <span class={styles.TokenTableCode}>
                                {token.code}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td class={styles.TokenTableNamespace}>
                          {token.namespace}
                        </td>
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
                onclick={() => deleteTokensModal.showModal()}
              >
                Delete
              </button>
              <div style={{ "flex-grow": 1 }}> </div>
            </div>
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
          <button
            class={styles.CancelButton}
            onclick={() => refreshTokensModel.close()}
          >
            Cancel
          </button>
        </div>
      </dialog>
      <dialog ref={deleteTokensModal!} class={styles.deleteTokensModal}>
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
              deleteTokensModal.close();
            }}
          >
            Confirm
          </button>
          <button
            class={styles.CancelButton}
            onclick={() => deleteTokensModal.close()}
          >
            Cancel
          </button>
        </div>
      </dialog>
      <Toaster />
    </div>
  );
};

export default Tokens;
