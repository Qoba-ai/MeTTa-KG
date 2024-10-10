import type { Component } from 'solid-js'
import {
    AiFillCaretDown,
    AiFillFileMarkdown,
    AiFillFolderOpen,
    AiOutlineGithub,
    AiOutlineImport,
} from 'solid-icons/ai'
import { VsRunAll } from 'solid-icons/vs'
import { createSignal, onMount, Show } from 'solid-js'
import styles from './App.module.scss'
import { A } from '@solidjs/router'
import toast, { Toaster } from 'solid-toast'
import { BACKEND_URL } from './urls'
import hljs from 'highlight.js/lib/core'
import 'highlight.js/styles/panda-syntax-dark.css'
import {
    bracketMatching,
    foldGutter,
    foldKeymap,
    indentOnInput,
    syntaxHighlighting,
} from '@codemirror/language'
import { commonLisp } from '@codemirror/legacy-modes/mode/commonlisp'
import { StreamLanguage } from '@codemirror/language'
import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { EditorState } from '@codemirror/state'
import {
    crosshairCursor,
    drawSelection,
    dropCursor,
    EditorView,
    highlightActiveLine,
    highlightActiveLineGutter,
    highlightSpecialChars,
    keymap,
    lineNumbers,
    rectangularSelection,
} from '@codemirror/view'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands'
import { lintKeymap } from '@codemirror/lint'
import {
    autocompletion,
    closeBrackets,
    closeBracketsKeymap,
    completionKeymap,
} from '@codemirror/autocomplete'
import { Token } from './types'

enum EditorMode {
    DEFAULT,
    IMPORT,
    EDIT,
}

enum ImportFormat {
    CSV = 'csv',
    N3 = 'n3',
    JSONLD = 'jsonld',
    NTRIPLES = 'nt',
}

enum ImportCSVDirection {
    ROW = 'Row',
    COLUMN = 'Column',
    CELL_LABELED = 'CellLabeled',
    CELL_UNLABELED = 'CellUnlabeled',
}

const App: Component = () => {
    let importFileModal: HTMLDialogElement
    let importFileForm: HTMLFormElement
    let importFileFormInput: HTMLInputElement
    let commitImportForm: HTMLFormElement
    let mettaEditor: HTMLDivElement
    let rootTokenFormInput: HTMLInputElement
    let loadSpaceModal: HTMLDialogElement
    let loadSpaceForm: HTMLFormElement
    let loadSpaceFormInput: HTMLInputElement

    const [rootTokenCodeInputValue, setRootTokenCodeInputValue] = createSignal<
        string | null
    >(localStorage.getItem('rootToken'))
    const [availableTokens, setAvailableTokens] = createSignal<Token[]>([])
    const [mettaContent, setMettaContent] = createSignal('')
    const [fileToImport, setFileToImport] = createSignal<File | null>(null)
    const [fileToImportFormat, setFileToImportFormat] =
        createSignal<ImportFormat | null>(null)
    const [editorMode, setEditorMode] = createSignal<EditorMode>(
        EditorMode.DEFAULT
    )
    const [output, setOutput] = createSignal('')
    const [tokenToOpen, setTokenToOpen] = createSignal('')
    const [token, setToken] = createSignal<Token | null>(null)
    const [namespace, setNamespace] = createSignal('')
    const [editorView, setEditorView] = createSignal<EditorView>()

    // CSV-specific import parameters
    const [importCSVDirection, setImportCSVDirection] =
        createSignal<ImportCSVDirection>(ImportCSVDirection.CELL_LABELED)
    const [importCSVDelimiter, setImportCSVDelimiter] =
        createSignal<string>('\u002C')

    const editorTheme = EditorView.theme(
        {
            '&': {
                backgroundColor: 'var(--rp-moon-base)',
                color: 'var(--rp-moon-text)',
                maxHeight: '600px',
            },
            '.cm-content': {
                caretColor: 'var(--rp-moon-highlight-low)',
                maxHeight: '600px',
            },
            '.cm-cursor, .cm-dropCursor': {
                borderLeftColor: 'var(--rp-moon-highlight-low)',
            },
            '&.cm-focused .cm-selectionBackgroundm .cm-selectionBackground, .cm-content ::selection':
                {
                    backgroundColor: 'var(--rp-moon-highlight-med)',
                },
            '.cm-activeLine': {
                backgroundColor: 'var(--rp-moon-highlight-med)',
            },
            '.cm-gutters': {
                backgroundColor: 'var(--rp-moon-highlight-high)',
                color: 'var(--rp-moon-subtle)',
            },
            '.cm-activeLineGutter': {
                backgroundColor: 'var(--rp-moon-rose)',
            },
        },
        {
            dark: true,
        }
    )

    const editorState = EditorState.create({
        extensions: [
            StreamLanguage.define(commonLisp),
            // editorTheme,
            editorTheme,
            highlightActiveLineGutter(),
            highlightSpecialChars(),
            history(),
            foldGutter(),
            drawSelection(),
            dropCursor(),
            EditorState.allowMultipleSelections.of(true),
            indentOnInput(),
            bracketMatching(),
            closeBrackets(),
            autocompletion(),
            rectangularSelection(),
            crosshairCursor(),
            highlightActiveLine(),
            highlightSelectionMatches(),
            EditorView.lineWrapping,
            keymap.of([
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
                ...foldKeymap,
                ...completionKeymap,
                ...lintKeymap,
            ]),
            syntaxHighlighting(
                HighlightStyle.define([
                    {
                        tag: tags.comment,
                        color: 'gray',
                    },
                    {
                        tag: tags.number,
                        color: '#ea9a97',
                    },
                    {
                        tag: tags.string,
                        color: '#ea9a97',
                    },
                    {
                        tag: tags.name,
                        color: '#ea9a97',
                    },
                ])
            ),
            EditorView.updateListener.of((update) =>
                setMettaContent(update.state.doc.toString())
            ),
        ],
    })

    const updateMettaContents = () => {
        const transaction = editorView().state.update({
            changes: {
                from: 0,
                to: editorView().state.doc.length,
                insert: mettaContent(),
            },
        })

        editorView().dispatch(transaction)
    }

    onMount(() => {
        // TODO: put this in separate component
        // dismiss import dialog when clicking on backdrop
        importFileModal.addEventListener('click', function (event) {
            const rect = importFileModal.getBoundingClientRect()
            const isInDialog =
                rect.top <= event.clientY &&
                event.clientY <= rect.top + rect.height &&
                rect.left <= event.clientX &&
                event.clientX <= rect.left + rect.width

            if (!isInDialog) {
                importFileModal.close()
            }
        })

        // TODO: put this in separate component
        // dismiss import dialog when clicking on backdrop
        loadSpaceModal.addEventListener('click', function (event) {
            const rect = loadSpaceModal.getBoundingClientRect()
            const isInDialog =
                rect.top <= event.clientY &&
                event.clientY <= rect.top + rect.height &&
                rect.left <= event.clientX &&
                event.clientX <= rect.left + rect.width

            if (!isInDialog) {
                loadSpaceModal.close()
            }
        })

        // perform translation and set editor into import mode
        importFileForm.onsubmit = async (event) => {
            // prevent page refresh on submit
            event.preventDefault()

            const files = importFileFormInput.files

            if (files?.length === 1) {
                await translate()

                importFileModal.close()
                setEditorMode(EditorMode.IMPORT)
            }
        }

        loadSpaceForm.onsubmit = async (event) => {
            event.preventDefault()

            fetchTokens(tokenToOpen())
            setEditorMode(EditorMode.EDIT)

            loadSpaceModal.close()
        }

        // clear file input after closing modal
        importFileModal.addEventListener('close', function (event) {
            importFileFormInput.value = ''
        })

        // TODO: remove
        /**
        setFileToImport(
            new File(
                [
                    `Index,Name,Phone,Website
1,Alice Johnson,384.555.0192x123,http://www.alicejservices.com/
2,Michael Smith,(512)987-6543x56789,http://www.msmithtech.net/
3,Emily Davis,+1-310-555-6789,http://www.emilydavisconsulting.org/`,
                ],
                'test.csv'
            )
        )
        setFileToImportFormat(ImportFormat.CSV)

        translate().then(() => {
            setEditorMode(EditorMode.IMPORT)
        })
         */
    })

    const getParserParameters = () => {
        switch (fileToImportFormat()) {
            case ImportFormat.CSV: {
                return {
                    direction: importCSVDirection(),
                    delimiter: importCSVDelimiter(),
                }
            }
            case ImportFormat.NTRIPLES: {
                return {
                    dummy: '',
                }
            }
            case ImportFormat.JSONLD: {
                return {
                    dummy: '',
                }
            }
            case ImportFormat.N3: {
                return {
                    dummy: '',
                }
            }
            default: {
                throw new Error('Failed to get parser parameters')
            }
        }
    }

    const translate = async (): Promise<void> => {
        const file = fileToImport()

        const parameters = new URLSearchParams(getParserParameters() as any)

        const fileFormat = fileToImportFormat()

        if (!fileFormat) {
            return
        }

        try {
            const resp = await fetch(
                `${BACKEND_URL}/translations/${fileFormat}?${parameters.toString()}`,
                {
                    method: 'POST',
                    headers: {},
                    body: file,
                }
            )

            // const metta = (await resp.json()) + `\n\n!(value ("3" "Website"))`
            const metta = await resp.json()

            setMettaContent(metta)
            setNamespace('')

            const e = editorView()

            if (e) {
                const transaction = editorView().state.update({
                    changes: {
                        from: 0,
                        to: editorView().state.doc.length,
                        insert: metta,
                    },
                })

                editorView().dispatch(transaction)
            }

            setTimeout(() => {
                // mettaConsole.focus()
            }, 10)
        } catch (e) {
            console.error(e)
            // TODO: specific error messages
            toast(
                `Failed to transform to MeTTa, verify the parameters and try again.`
            )
        }
    }

    const downloadMettaContent = async () => {
        event.preventDefault()

        const fileName = fileToImport()?.name.split('.')[0]

        const blob = URL.createObjectURL(new Blob([mettaContent()]))

        const anchor = document.createElement('a')

        anchor.setAttribute('download', `${fileName}-${Date.now()}.metta`)
        anchor.setAttribute('href', blob)

        document.body.appendChild(anchor)

        anchor.click()
        URL.revokeObjectURL(blob)
    }

    const handleFileSelect = (e) => {
        const file = e.target?.files?.[0]

        if (file) {
            setFileToImport(file)
            // TODO: what if file has no extension
            const extension = file.name.split('.')[1]

            switch (extension) {
                case 'csv': {
                    setFileToImportFormat(ImportFormat.CSV)
                    break
                }
                case 'nt': {
                    setFileToImportFormat(ImportFormat.NTRIPLES)
                    break
                }
                case 'n3': {
                    setFileToImportFormat(ImportFormat.N3)
                    break
                }
                case 'jsonld': {
                    setFileToImportFormat(ImportFormat.JSONLD)
                    break
                }
            }
        }
    }

    const run = async () => {
        const resp = await fetch('https://inter.metta-lang.dev/api/v1/codes', {
            headers: {
                accept: '*/*',
                'content-type': 'application/json',
            },
            referrer: 'https://metta-lang.dev/',
            referrerPolicy: 'strict-origin-when-cross-origin',
            body: JSON.stringify({
                code: mettaContent(),
            }),
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
        })

        const data = await resp.json()

        setOutput(data['result'])
    }

    const format = () => {}

    hljs.registerLanguage('metta', () => ({
        name: 'metta',
        case_insensitive: true,
        keywords: ['Type', ':', '->', '='],
        contains: [
            hljs.inherit(hljs.QUOTE_STRING_MODE),
            hljs.inherit(hljs.NUMBER_MODE),
            {
                class: 'name',
                scope: 'name',
                match: '[a-z]([a-z]|[0-9]|/|\\.|_|-|:|#)*',
            },
        ],
    }))

    const fetchTokens = async (root: string): Promise<Token[]> => {
        try {
            const resp = await fetch(`${BACKEND_URL}/tokens`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: root,
                },
            })

            const data = await resp.json()

            setAvailableTokens(data)

            const self = data.find((t) => t.code === root)

            if (self) {
                setToken(self)
                setNamespace(self.namespace)
                toast(
                    `Successfully loaded space corresponding to namespace ${self.namespace}`
                )
            } else {
                toast(`Failed to load space`)
            }
        } catch (e) {
            console.error(e)
            return []
        }
    }

    return (
        <>
            <header>
                <h1>MeTTa KG</h1>
                <nav>
                    <A href="/tokens" class={styles.OutlineButton}>
                        Tokens
                    </A>
                    <a href="https://github.com/Qoba-ai/MeTTa-KG">
                        <AiOutlineGithub class={styles.Icon} size={32} />
                    </a>
                </nav>
            </header>
            <main class={styles.Main}>
                <div></div>
                <div class={styles.EditorWrapper}>
                    <Show when={editorMode() === EditorMode.DEFAULT}>
                        <div class={styles.NewSessionDiv}>
                            <button
                                onClick={() => loadSpaceModal.showModal()}
                                class={styles.ImportButton}
                            >
                                <AiFillFolderOpen
                                    class={styles.Icon}
                                    size={28}
                                />
                                <span>Load</span>
                            </button>
                            <div>
                                <div></div>
                                <span>Or</span>
                                <div></div>
                            </div>
                            <button
                                onClick={() => importFileModal.showModal()}
                                class={styles.ImportButton}
                            >
                                <AiFillFileMarkdown
                                    class={styles.Icon}
                                    size={28}
                                />
                                <span>Import</span>
                            </button>
                        </div>
                    </Show>
                    <Show when={editorMode() !== EditorMode.DEFAULT}>
                        <div class={styles.MettaInputActionsWrapper}>
                            <form
                                class={styles.EditorRootTokenForm}
                                onsubmit={(e) => e.preventDefault()}
                            >
                                <input
                                    ref={(e) => {
                                        rootTokenFormInput = e
                                    }}
                                    id="root-token"
                                    type="search"
                                    placeholder="Namespace"
                                    role="search"
                                    autocomplete={'off'}
                                    oninvalid={() =>
                                        rootTokenFormInput.setCustomValidity(
                                            "Namespaces start with '/' followed by 2 or more alphanumeric characters and end with '/'."
                                        )
                                    }
                                    value={namespace() ?? ''}
                                    onchange={(e) => {
                                        setNamespace(e.target.value)
                                        rootTokenFormInput.setCustomValidity('')
                                    }}
                                    list={'available-namespaces'}
                                    pattern={
                                        '^/(([a-zA-Z0-9])+([a-zA-Z0-9]|-|_)*([a-zA-Z0-9])/)*$'
                                    }
                                    disabled={editorMode() !== EditorMode.EDIT}
                                />
                            </form>
                            <div class={styles.MettaEditorActions}>
                                <button
                                    onClick={() => loadSpaceModal.showModal()}
                                >
                                    Load
                                </button>
                                <button
                                    onClick={() => importFileModal.showModal()}
                                >
                                    Import
                                </button>
                                <button onclick={() => format()}>Format</button>
                                <button onclick={() => downloadMettaContent()}>
                                    Export
                                </button>
                                <button onclick={() => run()}>
                                    <VsRunAll
                                        class={styles.RunIcon}
                                        size={22}
                                    />
                                </button>
                            </div>
                        </div>
                        <div
                            class={styles.MettaInput}
                            ref={(el) => {
                                mettaEditor = el

                                setEditorView(
                                    new EditorView({
                                        state: editorState,
                                        parent: el,
                                    })
                                )

                                updateMettaContents()
                            }}
                        ></div>
                        <pre class={styles.Console}>
                            <code
                                class={'language-metta'}
                                innerHTML={
                                    hljs.highlight(output(), {
                                        language: 'metta',
                                    }).value
                                }
                            ></code>
                        </pre>
                    </Show>
                </div>
                <Show
                    when={editorMode() === EditorMode.IMPORT}
                    fallback={<div></div>}
                >
                    <div class={styles.ImportParametersFormWrapper}>
                        <form
                            id={styles.ImportParametersForm}
                            ref={commitImportForm!}
                            onsubmit={(e) => e.preventDefault()}
                        >
                            <h2>Import File</h2>
                            <p class={styles.Instructions}>
                                Modify the import parameters as needed before
                                finalizing your import.
                            </p>
                            <Show
                                when={fileToImportFormat() === ImportFormat.CSV}
                            >
                                <label>
                                    Scheme
                                    <select
                                        id="csv-import-scheme"
                                        onChange={(e) => {
                                            setImportCSVDirection(
                                                e.target
                                                    .value as ImportCSVDirection
                                            )
                                            translate()
                                        }}
                                    >
                                        <option value={'Row'}>Row</option>
                                        <option value={'Column'}>Column</option>
                                        <option value={'CellLabeled'}>
                                            Labeled Cell
                                        </option>
                                        <option value={'CellUnlabeled'}>
                                            Unlabeled Cell
                                        </option>
                                    </select>
                                </label>
                                <label>
                                    Delimiter
                                    <select
                                        onChange={(e) => {
                                            setImportCSVDelimiter(
                                                e.target.value
                                            )
                                            translate()
                                        }}
                                    >
                                        <option value={'\u0020'}>
                                            Space (' ')
                                        </option>
                                        <option value={'\u0009'}>
                                            Tab ('\t')
                                        </option>
                                        <option value={'\u002C'}>
                                            Comma (',')
                                        </option>
                                    </select>
                                </label>
                            </Show>
                            <input
                                type="submit"
                                value={'Import (coming soon)'}
                                disabled
                            />
                        </form>
                    </div>
                </Show>
            </main>
            <dialog ref={importFileModal!}>
                <form ref={importFileForm!}>
                    <h2>Select File</h2>
                    <p>
                        The following formats are supported. Files with
                        extensions other than the ones listed will not be
                        recognized:
                    </p>
                    <ul>
                        <li>CSV (.csv)</li>
                        <li>N3 (.nt3)</li>
                        <li>JSON-LD (.jsonld)</li>
                        <li>N-Triples (.nt)</li>
                    </ul>
                    <input
                        id={styles.ImportFileFormInput}
                        ref={importFileFormInput!}
                        type="file"
                        required
                        onchange={(e) => handleFileSelect(e)}
                    />
                    <div class={styles.ModalButtonBar}>
                        <button
                            type="button"
                            class={styles.TextButton}
                            onclick={() => importFileModal.close()}
                        >
                            Cancel
                        </button>
                        <div style={{ 'flex-grow': 1 }}></div>
                        <button
                            class={styles.Button}
                            disabled={fileToImport() === null}
                        >
                            Import
                        </button>
                    </div>
                </form>
            </dialog>
            <dialog ref={loadSpaceModal!} class={styles.LoadSpaceModal}>
                <form ref={loadSpaceForm!}>
                    <h2>Open Space</h2>
                    <label>
                        Token
                        <input
                            ref={loadSpaceFormInput!}
                            type="text"
                            required
                            oninvalid={() =>
                                loadSpaceFormInput.setCustomValidity(
                                    'Please enter a valid UUIDv4'
                                )
                            }
                            value={tokenToOpen() ?? ''}
                            onchange={(e) => {
                                setTokenToOpen(e.target.value.trim())
                                loadSpaceFormInput.setCustomValidity('')
                            }}
                            pattern={
                                '(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)'
                            }
                        />
                    </label>
                    <div class={styles.ModalButtonBar}>
                        <button
                            type="button"
                            class={styles.TextButton}
                            onclick={() => loadSpaceModal.close()}
                        >
                            Cancel
                        </button>
                        <div style={{ 'flex-grow': 1 }}></div>
                        <button
                            class={styles.Button}
                            disabled={tokenToOpen() === ''}
                        >
                            Open
                        </button>
                    </div>
                </form>
            </dialog>
            <Toaster toastOptions={{ className: styles.Toaster }} />
            <datalist id="available-namespaces">
                {[...new Set(availableTokens().map((t) => t.namespace))].map(
                    (n) => (
                        <option value={n}></option>
                    )
                )}
            </datalist>
        </>
    )
}

export default App
