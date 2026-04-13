import type { Component, JSX, ResourceFetcherInfo } from 'solid-js'
import { createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { BACKEND_URL } from '../../urls'
import { AiOutlineCopy, AiOutlineGithub } from 'solid-icons/ai'
import { VsSettings, VsSignOut } from 'solid-icons/vs'
import styles from './Tokens.module.scss'
import commonStyles from '../../styles/Common.module.scss'
import { Toaster } from 'solid-toast'
import { notify } from '../../notify'
import { useTheme } from '../../ThemeContext'
import { Token } from '../../types'
import { Navbar } from '../../components/Navbar/Navbar'
import { wsService } from '../../websocket'

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
    localStorage.setItem('rootToken', root ?? '')

    if (!root) {
        return []
    }

    try {
        const resp = await fetch(`${BACKEND_URL}/tokens`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                Authorization: root,
            },
        })

        const tokens = await resp.json()

        notify.success(`Loaded ${tokens.length} tokens.`)

        return tokens
    } catch (e) {
        notify.error(`Failed to fetch tokens`)
        return []
    }
}

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
        console.error(`Tried creating token without root`)
        throw new Error('No root token')
    }

    // note: most of these values will be ignored by the backend, such as
    // id and code (these are generated upon insertion)
    const newToken: Token = {
        id: 0,
        code: '',
        description: description,
        namespace: namespace,
        creation_timestamp: new Date().toISOString().split('Z')[0],
        permission_read: read,
        permission_write: write,
        permission_share_read: shareRead,
        permission_share_write: shareWrite,
        permission_share_share: shareShare,
        parent: 0,
    }

    const resp = await fetch(`${BACKEND_URL}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: root },
        body: JSON.stringify(newToken),
    })

    return await resp.json()
}

const refreshCodes = async (
    root: string | null,
    tokens: Token[]
): Promise<Token[]> => {
    if (!root) {
        return []
    }

    const promises = tokens.map((t) =>
        fetch(`${BACKEND_URL}/tokens/${t.id}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: root,
            },
        }).then((r) => r.json())
    )

    return Promise.all(promises)
}

const deleteTokens = async (
    root: string | null,
    tokens: Token[]
): Promise<void> => {
    if (!root) {
        return
    }

    await fetch(`${BACKEND_URL}/tokens`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: root },
        body: JSON.stringify(tokens.map((t) => t.id)),
    })
}

interface NamespaceNode {
    namespace: string
    subnamespaces: NamespaceNode[] | null
}

const parseNamespaceTree = (node: NamespaceNode): string[] => {
    const results: string[] = []

    // The namespace is already a fully qualified path from the backend
    if (node.namespace) {
        // Add trailing slash if not present
        const fullPath = node.namespace.endsWith('/')
            ? node.namespace
            : node.namespace + '/'
        results.push(fullPath)
    }

    // Recursively process all subnamespaces
    if (node.subnamespaces) {
        for (const child of node.subnamespaces) {
            results.push(...parseNamespaceTree(child))
        }
    }

    return results
}

const fetchNamespaces = async (
    root: string | null
): Promise<string[]> => {
    if (!root) {
        return []
    }

    try {
        const resp = await fetch(`${BACKEND_URL}/namespaces/`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                Authorization: root,
            },
        })

        if (resp.ok) {
            const tree: NamespaceNode = await resp.json()
            const namespaces = parseNamespaceTree(tree)
            return namespaces
        }
        return []
    } catch (e) {
        console.error('Failed to fetch namespaces:', e)
        return []
    }
}

const Tokens: Component = () => {
    let rootTokenForm: HTMLFormElement
    let rootTokenFormInput: HTMLInputElement

    let newTokenForm: HTMLFormElement
    let newTokenDescriptionInput: HTMLInputElement
    let newTokenNamespaceInput: HTMLInputElement
    let newTokenReadCheckbox: HTMLInputElement
    let newTokenWriteCheckbox: HTMLInputElement
    let newTokenShareReadCheckbox: HTMLInputElement
    let newTokenShareWriteCheckbox: HTMLInputElement

    let tokenTableSelectAllCheckbox: HTMLInputElement

    let namespaceSearch: HTMLDivElement
    let namespaceSearchInput: HTMLInputElement

    let descriptionSearch: HTMLDivElement
    let descriptionSearchInput: HTMLInputElement

    let refreshTokensModel: HTMLDialogElement
    let deleteTokensModal: HTMLDialogElement

    const [rootTokenCode, setRootTokenCode] = createSignal<string | null>(
        localStorage.getItem('rootToken')
    )

    const [rootTokenCodeInputValue, setRootTokenCodeInputValue] = createSignal<
        string | null
    >(localStorage.getItem('rootToken'))

    const [newTokenReadEnabled, setNewTokenReadEnabled] =
        createSignal<boolean>(true)

    const [selectedTokens, setSelectedTokens] = createSignal<Token[]>([])
    const [sortColumn, setSortColumn] = createSignal<SortableColumns>(
        SortableColumns.TIMESTAMP
    )
    const [sortDirectionDescending, setSortDirectionDescending] =
        createSignal<boolean>(true)
    const [namespaceSearchRegex, setNamespaceSearchRegex] = createSignal<
        string | null
    >(null)
    const [descriptionSearchRegex, setDescriptionSearchRegex] = createSignal<
        string | null
    >(null)
    const [showNamespaceFilter, setShowNamespaceFilter] = createSignal(false)
    const [showDescriptionFilter, setShowDescriptionFilter] = createSignal(false)
    const [copiedToken, setCopiedToken] = createSignal<Token | null>()
    const [online, setOnline] = createSignal(false)
    const [namespaceSuggestions, setNamespaceSuggestions] = createSignal<string[]>([])
    const [showNamespaceSuggestions, setShowNamespaceSuggestions] = createSignal(false)
    const [namespaceInputValue, setNamespaceInputValue] = createSignal('')

    const [tokens, { refetch: refetchTokens, mutate: mutateTokens }] =
        createResource<Token[], string, boolean>(rootTokenCode, fetchTokens, {
            initialValue: [],
        })

    onMount(async () => {
        wsService.connectPing()
        const unsubOnline = wsService.onOnlineChange(setOnline)

        // Fetch namespace suggestions
        const namespaces = await fetchNamespaces(rootTokenCode())
        setNamespaceSuggestions(namespaces)

        onCleanup(() => {
            unsubOnline()
        })

        // dismiss import dialog when clicking on backdrop
        // TODO: put this in separate component
        refreshTokensModel.addEventListener('click', function (event) {
            const rect = refreshTokensModel.getBoundingClientRect()
            const isInDialog =
                rect.top <= event.clientY &&
                event.clientY <= rect.top + rect.height &&
                rect.left <= event.clientX &&
                event.clientX <= rect.left + rect.width

            if (!isInDialog) {
                event.stopPropagation()
                refreshTokensModel.close()
            }
        })

        // dismiss import dialog when clicking on backdrop
        // TODO: put this in separate component
        deleteTokensModal.addEventListener('click', function (event) {
            const rect = deleteTokensModal.getBoundingClientRect()
            const isInDialog =
                rect.top <= event.clientY &&
                event.clientY <= rect.top + rect.height &&
                rect.left <= event.clientX &&
                event.clientX <= rect.left + rect.width

            if (!isInDialog) {
                event.stopPropagation()
                deleteTokensModal.close()
            }
        })

        if (rootTokenForm) {
            rootTokenForm.onsubmit = (event) => {
                event.preventDefault()

                const newRootToken = rootTokenFormInput.value.trim()

                setRootTokenCode(newRootToken)
            }
        }

        if (newTokenForm) {
            newTokenForm.onsubmit = async (event) => {
                event.preventDefault()

                const description = newTokenDescriptionInput.value
                const namespace = newTokenNamespaceInput.value
                const read = newTokenReadCheckbox.checked
                const write = newTokenWriteCheckbox.checked
                const shareRead = newTokenShareReadCheckbox.checked
                const shareWrite = newTokenShareWriteCheckbox.checked
                const shareShare = false

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
                    )

                    mutateTokens((v) => [...v, newToken])

                    // bit of a hack
                    // signals propagate: the mutateTokens call above causes newTokenNamespaceInput to re-render
                    newTokenNamespaceInput.value = namespace

                    notify.custom(
                        (t) => (
                            <div>
                                <span>Successfully created token.</span>
                                <br />
                                <button
                                    onclick={() =>
                                        navigator.clipboard.writeText(newToken.code)
                                    }
                                >
                                    Copy Code
                                </button>
                            </div>
                        ),
                        {
                            duration: 1000 * 10,
                        }
                    )
                } catch (e) {
                    notify.error(`Failed to create new token.`)
                }
            }
        }
    })

    const handleTableHeadCellClick = (
        e: MouseEvent & { currentTarget: HTMLTableCellElement },
        column: SortableColumns
    ) => {
        setSortColumn(column)
        setSortDirectionDescending(!sortDirectionDescending())

        e.currentTarget.focus()
    }

    const handleTableHeadCellKeyPress = (
        e: KeyboardEvent,
        column: SortableColumns
    ) => {
        if (e.code === 'Enter') {
            setSortColumn(column)
            setSortDirectionDescending(!sortDirectionDescending())
        }
    }

    const handleRefreshTokensButtonClick = async () => {
        const results = await refreshCodes(rootTokenCode(), selectedTokens())

        const oldRootToken = selectedTokens().find(
            (t) => t.code === rootTokenCode()
        )

        if (oldRootToken) {
            const newCode =
                results.find((t) => t.id === oldRootToken.id)?.code ?? null

            setRootTokenCode(newCode)
            setRootTokenCodeInputValue(newCode)
        }

        const selectedTokenIDs = selectedTokens().map((t) => t.id)

        mutateTokens((v) => [
            ...v.filter((t) => !selectedTokenIDs.includes(t.id)),
            ...results,
        ])

        setSelectedTokens(
            tokens().filter((t) => selectedTokenIDs.includes(t.id))
        )

        notify.success(`Refreshed code for ${results.length} tokens.`)
    }

    const handleDeleteTokensButtonClick = async () => {
        const selectedTokenIDs = selectedTokens().map((t) => t.id)
        const count = selectedTokens().length

        try {
            await deleteTokens(rootTokenCode(), selectedTokens())
            setSelectedTokens([])

            mutateTokens((v) =>
                v.filter((t) => !selectedTokenIDs.includes(t.id))
            )

            tokenTableSelectAllCheckbox.checked = false

            notify.success(`Deleted ${count} tokens.`)
        } catch (e) {
            notify.error(`Failed to delete tokens.`)
        }
    }

    const handleSelectAllTokensChecked: JSX.ChangeEventHandlerUnion<
        HTMLInputElement,
        Event
    > = (e) => {
        if (e.target.checked) {
            setSelectedTokens(tokens())
        } else {
            setSelectedTokens([])
        }
    }

    const handleSelectTokenChecked = (token: Token, checked: boolean) => {
        if (checked) {
            setSelectedTokens([...selectedTokens(), token])
            tokenTableSelectAllCheckbox.checked = true
        } else {
            setSelectedTokens(selectedTokens().filter((t) => t.id !== token.id))

            if (selectedTokens().length === 0) {
                tokenTableSelectAllCheckbox.checked = false
            }
        }
    }

    const sortTokens = (a: Token, b: Token) => {
        let result = 0

        if (sortColumn() === SortableColumns.NAMESPACE) {
            if (a.namespace.startsWith(b.namespace)) {
                result = 1
            } else if (b.namespace.startsWith(a.namespace)) {
                result = -1
            } else {
                result = 0
            }
        } else if (sortColumn() === SortableColumns.TIMESTAMP) {
            result =
                Date.parse(a.creation_timestamp) -
                Date.parse(b.creation_timestamp)
        } else if (sortColumn() === SortableColumns.READ) {
            result = a.permission_read && !b.permission_read ? 1 : -1
        } else if (sortColumn() === SortableColumns.WRITE) {
            result = a.permission_write && !b.permission_write ? 1 : -1
        } else if (sortColumn() === SortableColumns.SHARE_READ) {
            result =
                a.permission_share_read && !b.permission_share_read ? 1 : -1
        } else if (sortColumn() === SortableColumns.SHARE_WRITE) {
            result =
                a.permission_share_write && !b.permission_share_write ? 1 : -1
        } else if (sortColumn() === SortableColumns.SHARE_SHARE) {
            result =
                a.permission_share_share && !b.permission_share_share ? 1 : -1
        }

        if (sortDirectionDescending()) {
            return result
        } else {
            return -result
        }
    }

    return (
        <div class={styles.MainLayout}>
            <Navbar title="MeTTa KG Tokens" currentPage="tokens" />
            <main class={styles.Main}>
                <Show when={!rootTokenCode()}>
                    <div class={styles.RootTokenSection}>
                        <form
                            class={styles.RootTokenForm}
                            ref={rootTokenForm!}
                            role="search"
                        >
                            <h2>Manage Access</h2>
                            <p class={styles.FormDescription}>
                                Enter your root token to manage access tokens and permissions
                            </p>
                            <input
                                id="root-token"
                                ref={rootTokenFormInput!}
                                type="search"
                                class={styles.TokenInput}
                                placeholder="Enter your root token (UUID)"
                                oninvalid={() =>
                                    rootTokenFormInput.setCustomValidity(
                                        'Please enter a valid UUIDv4'
                                    )
                                }
                                value={rootTokenCodeInputValue() ?? ''}
                                onchange={(e) => {
                                    setRootTokenCodeInputValue(e.target.value.trim())
                                    rootTokenFormInput.setCustomValidity('')
                                }}
                                pattern={
                                    '(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)'
                                }
                            />
                            <input type="submit" value={'Connect'} />
                        </form>
                    </div>
                </Show>

                <Show
                    when={rootTokenCode() && tokens().length >= 0}
                    fallback={
                        <div class={styles.EmptyState}>
                            <div class={styles.EmptyStateContent}>
                                <h3>No Token Connected</h3>
                                <p>Enter your root token above to view and manage access tokens for your namespaces.</p>
                                <div class={styles.EmptyStateHints}>
                                    <div class={styles.Hint}>
                                        <strong>🔑 Root Token</strong>
                                        <span>Your root token grants you permission to create and manage sub-tokens</span>
                                    </div>
                                    <div class={styles.Hint}>
                                        <strong>🔒 Permissions</strong>
                                        <span>Control read, write, and share permissions for each namespace</span>
                                    </div>
                                    <div class={styles.Hint}>
                                        <strong>🌳 Hierarchical</strong>
                                        <span>Create tokens for specific namespaces with granular access control</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    }
                >
                    <div class={styles.TokenManagementSection}>
                        <div class={styles.TokenListSection}>
                            <h2 class={styles.SectionTitle}>Token List</h2>
                            <div class={styles.TokenTableWrapper}>
                                <div class={styles.TokenTableInnerWrapper}>
                                    <table class={styles.TokenTable}>
                                        <thead>
                                <tr>
                                    <th tabIndex={0}>
                                        <input
                                            type="checkbox"
                                            onchange={
                                                handleSelectAllTokensChecked
                                            }
                                            ref={tokenTableSelectAllCheckbox!}
                                        />
                                    </th>
                                    <th
                                        tabIndex={0}
                                        onclick={(e) =>
                                            handleTableHeadCellClick(
                                                e,
                                                SortableColumns.TIMESTAMP
                                            )
                                        }
                                        onkeypress={(e) =>
                                            handleTableHeadCellKeyPress(
                                                e,
                                                SortableColumns.TIMESTAMP
                                            )
                                        }
                                    >
                                        <span>Creation</span>
                                        <Show
                                            when={
                                                sortColumn() ===
                                                    SortableColumns.TIMESTAMP &&
                                                sortDirectionDescending()
                                            }
                                        >
                                            <span class={styles.SortIcon}>
                                                ↓
                                            </span>
                                        </Show>
                                        <Show
                                            when={
                                                sortColumn() ===
                                                    SortableColumns.TIMESTAMP &&
                                                !sortDirectionDescending()
                                            }
                                        >
                                            <span class={styles.SortIcon}>
                                                ↑
                                            </span>
                                        </Show>
                                    </th>
                                    <th tabIndex={0}>Code</th>
                                    <th
                                        tabIndex={0}
                                        onclick={(e) => {
                                            if (
                                                e.target !==
                                                namespaceSearchInput
                                            ) {
                                                handleTableHeadCellClick(
                                                    e,
                                                    SortableColumns.NAMESPACE
                                                )
                                            }
                                        }}
                                        onkeypress={(e) =>
                                            handleTableHeadCellKeyPress(
                                                e,
                                                SortableColumns.NAMESPACE
                                            )
                                        }
                                    >
                                        <div class={styles.HeaderWithFilter}>
                                            <div class={styles.HeaderContent}>
                                                <span>Namespace</span>
                                                <Show
                                                    when={
                                                        sortColumn() ===
                                                            SortableColumns.NAMESPACE &&
                                                        sortDirectionDescending()
                                                    }
                                                >
                                                    <span class={styles.SortIcon}>
                                                        ↓
                                                    </span>
                                                </Show>
                                                <Show
                                                    when={
                                                        sortColumn() ===
                                                            SortableColumns.NAMESPACE &&
                                                        !sortDirectionDescending()
                                                    }
                                                >
                                                    <span class={styles.SortIcon}>
                                                        ↑
                                                    </span>
                                                </Show>
                                                <button
                                                    class={`${styles.FilterToggle} ${namespaceSearchRegex() ? styles.FilterActive : ''}`}
                                                    onclick={(e) => {
                                                        e.stopPropagation()
                                                        setShowNamespaceFilter(!showNamespaceFilter())
                                                    }}
                                                    title="Toggle filter"
                                                >
                                                    🔍
                                                </button>
                                            </div>
                                            <Show when={showNamespaceFilter()}>
                                                <div ref={namespaceSearch!} class={styles.FilterInputWrapper}>
                                                    <input
                                                        class={styles.FilterInput}
                                                        ref={namespaceSearchInput!}
                                                        placeholder="Filter by regex..."
                                                        value={namespaceSearchRegex() ?? ''}
                                                        onchange={(e) =>
                                                            setNamespaceSearchRegex(
                                                                e.target.value || null
                                                            )
                                                        }
                                                        onclick={(e) => e.stopPropagation()}
                                                    />
                                                    <Show when={namespaceSearchRegex()}>
                                                        <button
                                                            class={styles.ClearFilter}
                                                            onclick={(e) => {
                                                                e.stopPropagation()
                                                                setNamespaceSearchRegex(null)
                                                                namespaceSearchInput.value = ''
                                                            }}
                                                            title="Clear filter"
                                                        >
                                                            ✕
                                                        </button>
                                                    </Show>
                                                </div>
                                            </Show>
                                        </div>
                                    </th>
                                    <th tabIndex={0}>
                                        <div class={styles.HeaderWithFilter}>
                                            <div class={styles.HeaderContent}>
                                                <span>Description</span>
                                                <button
                                                    class={`${styles.FilterToggle} ${descriptionSearchRegex() ? styles.FilterActive : ''}`}
                                                    onclick={(e) => {
                                                        e.stopPropagation()
                                                        setShowDescriptionFilter(!showDescriptionFilter())
                                                    }}
                                                    title="Toggle filter"
                                                >
                                                    🔍
                                                </button>
                                            </div>
                                            <Show when={showDescriptionFilter()}>
                                                <div ref={descriptionSearch!} class={styles.FilterInputWrapper}>
                                                    <input
                                                        class={styles.FilterInput}
                                                        ref={descriptionSearchInput!}
                                                        placeholder="Filter by regex..."
                                                        value={descriptionSearchRegex() ?? ''}
                                                        onchange={(e) =>
                                                            setDescriptionSearchRegex(
                                                                e.target.value || null
                                                            )
                                                        }
                                                        onclick={(e) => e.stopPropagation()}
                                                    />
                                                    <Show when={descriptionSearchRegex()}>
                                                        <button
                                                            class={styles.ClearFilter}
                                                            onclick={(e) => {
                                                                e.stopPropagation()
                                                                setDescriptionSearchRegex(null)
                                                                descriptionSearchInput.value = ''
                                                            }}
                                                            title="Clear filter"
                                                        >
                                                            ✕
                                                        </button>
                                                    </Show>
                                                </div>
                                            </Show>
                                        </div>
                                    </th>
                                    <th tabIndex={0}>
                                        <span>Permissions</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <For
                                    each={tokens()
                                        .filter((t) =>
                                            t.namespace.match(
                                                namespaceSearchRegex() ?? '.*'
                                            )
                                        )
                                        .filter((t) =>
                                            t.description.match(
                                                descriptionSearchRegex() ?? '.*'
                                            )
                                        )
                                        .sort(sortTokens)}
                                >
                                    {(token) => (
                                        <Show when={true}>
                                            <tr
                                                onkeypress={(e) => {
                                                    if (
                                                        e.code === 'Enter' &&
                                                        selectedTokens().includes(
                                                            token
                                                        )
                                                    ) {
                                                        navigator.clipboard.writeText(
                                                            token.code
                                                        )

                                                        const codeCell =
                                                            e.currentTarget.querySelector(
                                                                styles.TokenTableCodeCell
                                                            )

                                                        if (codeCell) {
                                                            codeCell.classList.add(
                                                                'Copied'
                                                            )
                                                        }

                                                        setCopiedToken(token)

                                                        setTimeout(() => {
                                                            if (codeCell) {
                                                                codeCell.classList.remove(
                                                                    'Copied'
                                                                )
                                                            }

                                                            setCopiedToken(null)
                                                        }, 1000 * 1)
                                                    }
                                                }}
                                            >
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedTokens().includes(
                                                            token
                                                        )}
                                                        onchange={(e) =>
                                                            handleSelectTokenChecked(
                                                                token,
                                                                e.target.checked
                                                            )
                                                        }
                                                    />
                                                </td>
                                                <td>
                                                    {new Date(
                                                        token.creation_timestamp
                                                    ).toLocaleString()}
                                                </td>
                                                <td>
                                                    <div
                                                        class={
                                                            styles.CodeCell +
                                                            ' ' +
                                                            (copiedToken()
                                                                ? styles.Copied
                                                                : '')
                                                        }
                                                        onclick={(e) => {
                                                            navigator.clipboard.writeText(
                                                                token.code
                                                            )
                                                            e.currentTarget.classList.add(
                                                                'Copied'
                                                            )
                                                            setCopiedToken(
                                                                token
                                                            )

                                                            setTimeout(() => {
                                                                e.target.classList.remove(
                                                                    'Copied'
                                                                )
                                                                setCopiedToken(
                                                                    null
                                                                )
                                                            }, 1000 * 1)
                                                        }}
                                                        onPointerLeave={(
                                                            e
                                                        ) => {}}
                                                    >
                                                        <div>
                                                            <AiOutlineCopy
                                                                class={
                                                                    styles.CodeCellIcon
                                                                }
                                                            />
                                                            <Show
                                                                when={
                                                                    copiedToken() ===
                                                                    token
                                                                }
                                                            >
                                                                <div
                                                                    class={
                                                                        styles.CopyTooltip
                                                                    }
                                                                >
                                                                    Copied code
                                                                    to
                                                                    clipboard!
                                                                </div>
                                                            </Show>
                                                        </div>
                                                        <div
                                                            class={
                                                                styles.CodeCellContent
                                                            }
                                                            title={token.code}
                                                        >
                                                            {token.code}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td
                                                    class={styles.NamespaceCell}
                                                    title={token.namespace}
                                                >
                                                    {token.namespace}
                                                </td>
                                                <td title={token.description}>{token.description}</td>
                                                <td>
                                                    <div class={styles.PermissionChips}>
                                                        <Show when={token.permission_read}>
                                                            <span class={`${styles.PermissionChip} ${styles.PermissionRead}`}>R</span>
                                                        </Show>
                                                        <Show when={token.permission_write}>
                                                            <span class={`${styles.PermissionChip} ${styles.PermissionWrite}`}>W</span>
                                                        </Show>
                                                        <Show when={token.permission_share_read}>
                                                            <span class={`${styles.PermissionChip} ${styles.PermissionShareRead}`}>SR</span>
                                                        </Show>
                                                        <Show when={token.permission_share_write}>
                                                            <span class={`${styles.PermissionChip} ${styles.PermissionShareWrite}`}>SW</span>
                                                        </Show>
                                                        <Show when={!token.permission_read && !token.permission_write && !token.permission_share_read && !token.permission_share_write}>
                                                            <span class={styles.NoPermissions}>None</span>
                                                        </Show>
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
                                </div>
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
                                </div>
                            </div>
                        </div>

                        <div class={styles.CreateTokenSection}>
                            <h2 class={styles.SectionTitle}>Create New Token</h2>
                            <form class={styles.NewTokenForm} ref={newTokenForm!}>
                                <label class={styles.NamespaceInputContainer}>
                                    Namespace
                                    <div class={styles.AutocompleteWrapper}>
                                        <input
                                            ref={newTokenNamespaceInput!}
                                            type="text"
                                            placeholder="Namespace (e.g., /myproject/)"
                                            required
                                            pattern={
                                                '^/(([a-zA-Z0-9])+([a-zA-Z0-9]|-|_)*([a-zA-Z0-9])/)*$'
                                            }
                                            disabled={
                                                !tokens().find(
                                                    (t) => t.code === rootTokenCode()
                                                )
                                            }
                                            oninput={(e) => {
                                                const value = e.currentTarget.value
                                                setNamespaceInputValue(value)
                                                setShowNamespaceSuggestions(true)
                                                newTokenNamespaceInput.setCustomValidity('')
                                            }}
                                            onfocus={() => setShowNamespaceSuggestions(true)}
                                            onblur={() => {
                                                // Delay to allow clicking on suggestions
                                                setTimeout(() => setShowNamespaceSuggestions(false), 200)
                                            }}
                                            oninvalid={() =>
                                                newTokenNamespaceInput.setCustomValidity(
                                                    "Namespaces start with '/' followed by 2 or more alphanumeric characters and end with '/'."
                                                )
                                            }
                                            value={
                                                namespaceInputValue() ||
                                                (tokens().find((t) => t.code === rootTokenCode())
                                                    ?.namespace ?? '')
                                            }
                                        />
                                        <Show when={showNamespaceSuggestions() && namespaceSuggestions().length > 0}>
                                            <div class={styles.SuggestionsList}>
                                                <For each={namespaceSuggestions().filter(ns =>
                                                    namespaceInputValue() === '' ||
                                                    ns.toLowerCase().includes(namespaceInputValue().toLowerCase())
                                                ).slice(0, 8)}>
                                                    {(namespace) => (
                                                        <div
                                                            class={styles.SuggestionItem}
                                                            onmousedown={(e) => {
                                                                e.preventDefault()
                                                                newTokenNamespaceInput.value = namespace
                                                                setNamespaceInputValue(namespace)
                                                                setShowNamespaceSuggestions(false)
                                                            }}
                                                        >
                                                            <span class={styles.SuggestionNamespace}>{namespace}</span>
                                                        </div>
                                                    )}
                                                </For>
                                            </div>
                                        </Show>
                                    </div>
                                </label>
                                <label>
                                    Description
                                    <input
                                        ref={newTokenDescriptionInput!}
                                        type="text"
                                        required
                                        placeholder="Description"
                                        disabled={
                                            !tokens().find(
                                                (t) => t.code === rootTokenCode()
                                            )
                                        }
                                    />
                                </label>
                                <div class={styles.NewTokenPermissions}>
                                    <label>
                                        <input
                                            ref={newTokenReadCheckbox!}
                                            onchange={(e) => {
                                                if (!e.target.checked) {
                                                    newTokenWriteCheckbox.checked = false
                                                    newTokenShareReadCheckbox.checked = false
                                                    newTokenShareWriteCheckbox.checked = false
                                                }
                                                setNewTokenReadEnabled(e.target.checked)
                                            }}
                                            type="checkbox"
                                            checked={newTokenReadEnabled()}
                                            disabled={
                                                !rootTokenCode() ||
                                                !tokens().find(
                                                    (t) => t.code === rootTokenCode()
                                                )?.permission_share_read
                                            }
                                        />
                                        Read
                                    </label>
                                    <label>
                                        <input
                                            ref={newTokenWriteCheckbox!}
                                            onchange={(e) => {
                                                if (e.target.checked) {
                                                    setNewTokenReadEnabled(true)
                                                } else {
                                                    newTokenShareWriteCheckbox.checked = false
                                                }
                                            }}
                                            type="checkbox"
                                            disabled={
                                                !rootTokenCode() ||
                                                !tokens().find(
                                                    (t) => t.code === rootTokenCode()
                                                )?.permission_share_write
                                            }
                                        />
                                        Write
                                    </label>
                                    <label>
                                        <input
                                            ref={newTokenShareReadCheckbox!}
                                            onchange={(e) => {
                                                if (e.target.checked) {
                                                    setNewTokenReadEnabled(true)
                                                } else {
                                                    newTokenShareWriteCheckbox.checked = false
                                                }
                                            }}
                                            type="checkbox"
                                            disabled={
                                                !rootTokenCode() ||
                                                !tokens().find(
                                                    (t) => t.code === rootTokenCode()
                                                )?.permission_share_read
                                            }
                                        />
                                        Share read
                                    </label>
                                    <label>
                                        <input
                                            ref={newTokenShareWriteCheckbox!}
                                            onchange={(e) => {
                                                if (e.target.checked) {
                                                    setNewTokenReadEnabled(true)
                                                    newTokenWriteCheckbox.checked = true
                                                    newTokenShareReadCheckbox.checked = true
                                                }
                                            }}
                                            type="checkbox"
                                            disabled={
                                                !rootTokenCode() ||
                                                !tokens().find(
                                                    (t) => t.code === rootTokenCode()
                                                )?.permission_share_write
                                            }
                                        />
                                        Share write
                                    </label>
                                </div>
                                <input type="submit" value={'Create'} />
                                <Show when={!newTokenReadEnabled()}>
                                    <span class={styles.NewTokenNoPermissionsWarningLarge}>
                                        Token has no permissions!
                                    </span>
                                </Show>
                            </form>
                        </div>
                    </div>
                </Show>
            </main>
            <dialog ref={refreshTokensModel!} class={styles.RefreshTokensModal}>
                <form onsubmit={(ev) => {
                    ev.preventDefault()
                    handleRefreshTokensButtonClick()
                    refreshTokensModel.close()
                }}>
                    <h2>Refresh Tokens?</h2>
                    <p>
                        Selected tokens will no longer give access to the
                        associated namespaces.
                    </p>
                    <div class={styles.ModalButtonBar}>
                        <button
                            type="button"
                            class={styles.TextButton}
                            onclick={() => refreshTokensModel.close()}
                        >
                            Cancel
                        </button>
                        <div class={styles.Spacer}></div>
                        <button
                            type="submit"
                            class={styles.Button}
                        >
                            Confirm
                        </button>
                    </div>
                </form>
            </dialog>
            <dialog ref={deleteTokensModal!} class={styles.deleteTokensModal}>
                <form onsubmit={(ev) => {
                    ev.preventDefault()
                    handleDeleteTokensButtonClick()
                    deleteTokensModal.close()
                }}>
                    <h2>Delete tokens?</h2>
                    <p>
                        Selected tokens will be deleted permanently. Sub-tokens
                        will be deleted recursively.
                    </p>
                    <div class={styles.ModalButtonBar}>
                        <button
                            type="button"
                            class={styles.TextButton}
                            onclick={() => deleteTokensModal.close()}
                        >
                            Cancel
                        </button>
                        <div class={styles.Spacer}></div>
                        <button
                            type="submit"
                            class={styles.Button}
                        >
                            Confirm
                        </button>
                    </div>
                </form>
            </dialog>
            <Toaster
                toastOptions={{ className: styles.Toaster }}
                containerStyle={{ 'margin-top': '60px' }}
            />
        </div>
    )
}

export default Tokens
