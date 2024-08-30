import type { Component, JSX } from "solid-js";
import { createResource, createSignal, For, onMount, Show } from "solid-js";
import { A } from "@solidjs/router";
import { BACKEND_URL } from "./urls";
import styles from "./Tokens.module.scss";

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
}

const fetchTokens = async (root: string | null): Promise<Token[]> => {
  if (!root) {
    return [];
  }

  localStorage.setItem("rootToken", root);

  const resp = await fetch(`${BACKEND_URL}/tokens`, {
    method: "GET",
    headers: { "Content-Type": "application/json", Authorization: root },
  });

  return await resp.json();
};

const createToken = async (
  root: string | null,
  description: string,
  namespace: string,
  read: boolean,
  write: boolean
): Promise<void> => {
  if (root === null) {
    console.error(`Tried creating token without root`);
    return;
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

  const promises = tokens.map((t) =>
    fetch(`${BACKEND_URL}/tokens/${t.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: root },
    })
  );

  await Promise.all(promises);
};

const Tokens: Component = () => {
  let rootTokenForm: HTMLFormElement;
  let rootTokenFormInput: HTMLInputElement;

  let newTokenForm: HTMLFormElement;
  let newTokenDescriptionInput: HTMLInputElement;
  let newTokenNamespaceInput: HTMLInputElement;
  let newTokenReadCheckbox: HTMLInputElement;
  let newTokenWriteCheckbox: HTMLInputElement;

  let namespaceSearchPopper: HTMLDivElement;
  let namespaceSearchInput: HTMLInputElement;
  let namespacePopperButton: HTMLAnchorElement;

  const [rootTokenCode, setRootTokenCode] = createSignal<string | null>(
    localStorage.getItem("rootToken")
  );

  // TODO: refactor into separate component
  const [selectedTokens, setSelectedTokens] = createSignal<Token[]>([]);
  const [sortColumn, setSortColumn] = createSignal<SortableColumns>(
    SortableColumns.TIMESTAMP
  );
  const [sortDirectionDescending, setSortDirectionDescending] =
    createSignal<boolean>(true);
  const [isNamespaceSearchPopperOpen, setIsNamespaceSearchPopperOpen] =
    createSignal(false);
  const [regex, setRegex] = createSignal<string | null>(null);

  const [tokens, { refetch: refetchTokens }] = createResource(
    rootTokenCode,
    fetchTokens,
    {
      initialValue: [],
    }
  );

  onMount(() => {
    rootTokenForm.onsubmit = (event) => {
      event.preventDefault();

      const newRootToken = rootTokenFormInput.value.trim();

      setRootTokenCode(newRootToken);
      refetchTokens();
    };

    newTokenForm.onsubmit = (event) => {
      event.preventDefault();

      const description = newTokenDescriptionInput.value;
      const namespace = newTokenNamespaceInput.value;
      const read = newTokenReadCheckbox.checked;
      const write = newTokenWriteCheckbox.checked;

      createToken(rootTokenCode(), description, namespace, read, write);
      refetchTokens();
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
      setRootTokenCode(
        results.find((t) => t.id === oldRootToken.id)?.code ?? null
      );
    }

    setSelectedTokens([]);
    refetchTokens();
  };

  const handleDeleteTokensButtonClick = async () => {
    await deleteTokens(rootTokenCode(), selectedTokens());
    setSelectedTokens([]);
    refetchTokens();
  };

  const handleSelectAllTokensChecked: JSX.ChangeEventHandlerUnion<
    HTMLInputElement,
    Event
  > = (e) => {
    if (e.target?.checked) {
      setSelectedTokens(tokens());
    } else {
      setSelectedTokens([]);
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
          <h1>Access Token</h1>
          <form class={styles.RootTokenForm} ref={rootTokenForm!}>
            <input
              ref={rootTokenFormInput!}
              type="text"
              class={styles.TokenInput}
              placeholder="Token"
              value={rootTokenCode() ?? ""}
            />
            <input type="submit" />
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
                    />
                  </th>
                  <th
                    onclick={() =>
                      handleTableHeadCellClick(SortableColumns.TIMESTAMP)
                    }
                  >
                    Timestamp
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
                      if (e.target !== namespacePopperButton) {
                        handleTableHeadCellClick(SortableColumns.NAMESPACE);
                      }
                    }}
                  >
                    Namespace{" "}
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
                    <a
                      ref={namespacePopperButton!}
                      onclick={() =>
                        setIsNamespaceSearchPopperOpen(
                          !isNamespaceSearchPopperOpen()
                        )
                      }
                    >
                      🔎
                    </a>
                    <Show when={isNamespaceSearchPopperOpen()}>
                      <div ref={namespaceSearchPopper!}>
                        <input
                          ref={namespaceSearchInput!}
                          placeholder="Regex"
                          onchange={(e) => setRegex(e.target.value)}
                        />
                      </div>
                    </Show>
                  </th>
                  <th>Description</th>
                  <th>Read</th>
                  <th>Write</th>
                  <th>Share read</th>
                  <th>Share write</th>
                  <th>Recursive share</th>
                </tr>
              </thead>
              <tbody>
                <For
                  each={tokens()
                    .filter((t) => t.namespace.match(regex() ?? ".*"))
                    .sort(sortTokens)}
                >
                  {(token) => (
                    <Show when={true}>
                      <tr>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedTokens().includes(token)}
                            onchange={(e) => {
                              if (e.target.checked) {
                                setSelectedTokens([...selectedTokens(), token]);
                              } else {
                                setSelectedTokens(
                                  selectedTokens().filter(
                                    (t) => t.id !== token.id
                                  )
                                );
                              }
                            }}
                          />
                        </td>
                        <td>{token.creation_timestamp}</td>
                        <td>{token.code}</td>
                        <td>{token.namespace}</td>
                        <td>{token.description}</td>
                        <td>{token.permission_read ? "✅" : "❌"}</td>
                        <td>{token.permission_write ? "✅" : "❌"}</td>
                        <td>{token.permission_share_read ? "✅" : "❌"}</td>
                        <td>{token.permission_share_write ? "✅" : "❌"}</td>
                        <td>{token.permission_share_share ? "✅" : "❌"}</td>
                      </tr>
                    </Show>
                  )}
                </For>
              </tbody>
            </table>
            <div class={styles.TableButtonBar}>
              <button
                disabled={selectedTokens().length === 0}
                onclick={handleRefreshTokensButtonClick}
              >
                Refresh Code
              </button>
              <button
                disabled={selectedTokens().length === 0}
                onclick={handleDeleteTokensButtonClick}
              >
                Delete
              </button>
              <div style={{ "flex-grow": 1 }}> </div>
            </div>
            <Show when={tokens()?.length === 0}>
              <div class={styles.TokenTableNoData}>
                <span>No Tokens Available</span>
              </div>
            </Show>
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
                disabled={!rootTokenCode()}
                onchange={(e) => {}}
                value={
                  tokens().find((t) => t.code === rootTokenCode())?.namespace
                }
              />
              <br />
              <label>Description</label>
              <br />
              <input
                ref={newTokenDescriptionInput!}
                type="text"
                placeholder="Description"
                disabled={!rootTokenCode()}
              />
              <br />
              <label>Read</label>
              <input
                ref={newTokenReadCheckbox!}
                onchange={(e) => {
                  if (!e.target.checked) {
                    newTokenWriteCheckbox.checked = false;
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
              <label>Write</label>
              <input
                ref={newTokenWriteCheckbox!}
                onchange={(e) => {
                  if (e.target.checked) {
                    newTokenReadCheckbox.checked = true;
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
              <input type="submit" />
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tokens;
