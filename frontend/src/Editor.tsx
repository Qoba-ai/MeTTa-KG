import type { Component } from 'solid-js'
import {
    AiFillFileMarkdown,
    AiFillFolderOpen,
    AiOutlineGithub,
} from 'solid-icons/ai'
import { VsRunAll } from 'solid-icons/vs'
import { createMemo, createSignal, onMount, Show } from 'solid-js'
import styles from './Editor.module.scss'
import { A } from '@solidjs/router'
import toast, { Toaster } from 'solid-toast'
import { BACKEND_URL } from './urls'
import hljs from 'highlight.js/lib/core'
import 'highlight.js/styles/panda-syntax-dark.css'
import {
    bracketMatching,
    foldGutter,
    foldKeymap,
    syntaxHighlighting,
} from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import {
    drawSelection,
    dropCursor,
    EditorView,
    highlightActiveLine,
    highlightActiveLineGutter,
    keymap,
} from '@codemirror/view'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import {
    defaultKeymap,
    historyKeymap,
    history,
    indentSelection,
} from '@codemirror/commands'
import { lintKeymap } from '@codemirror/lint'
import {
    autocompletion,
    closeBrackets,
    closeBracketsKeymap,
    completionKeymap,
} from '@codemirror/autocomplete'
import {
    EditorMode,
    ImportCSVDirection,
    ImportFormat,
    ParserParameters,
    Token,
} from './types'
import {
    editorTheme,
    highlightStyle,
    languageSupport,
    mettaLinter,
} from './mettaLanguageSupport'

const extensionToImportFormat = (file: File): ImportFormat | undefined => {
    const extension = file.name.split('.')[1]

    switch (extension) {
        case 'csv': {
            return ImportFormat.CSV
        }
        case 'nt': {
            return ImportFormat.NTRIPLES
        }
        case 'n3': {
            return ImportFormat.N3
        }
        case 'jsonld': {
            return ImportFormat.JSONLD
        }
    }
}

const App: Component = () => {
    let importFileModal: HTMLDialogElement
    let importFileForm: HTMLFormElement
    let importFileFormInput: HTMLInputElement
    let commitImportForm: HTMLFormElement
    let mettaEditor: HTMLDivElement
    let mettaInput: HTMLDivElement
    let rootTokenFormInput: HTMLInputElement
    let loadSpaceModal: HTMLDialogElement
    let loadSpaceForm: HTMLFormElement
    let loadSpaceFormInput: HTMLInputElement

    const [token, setToken] = createSignal<Token>()

    const [editorContent, setEditorContent] = createSignal<string>(`  "hoi"

hoi
( hoi )
( (    
hoi
))
( "hoi
h" )
`)
    const [editorOutput, setEditorOutput] = createSignal('')
    const [editorView, setEditorView] = createSignal<EditorView>()
    const [editorMode, setEditorMode] = createSignal<EditorMode>(
        EditorMode.DEFAULT
    )

    const [activeImportFile, setActiveImportFile] = createSignal<File>()
    const activeImportFileFormat = createMemo<ImportFormat | undefined>(() => {
        const file = activeImportFile()

        if (file) {
            return extensionToImportFormat(file)
        }
    })

    // TODO: replace tokens with namespaces to obtain tree-view of space
    const [availableTokens, setAvailableTokens] = createSignal<Token[]>([])

    const [isFullscreen, setIsFullscreen] = createSignal<boolean>(false)

    // controlled value of form input: move to separate component
    const [tokenToOpen, setTokenToOpen] = createSignal('')

    // CSV-specific import parameters
    const [importCSVDirection, setImportCSVDirection] =
        createSignal<ImportCSVDirection>(ImportCSVDirection.CELL_LABELED)
    const [importCSVDelimiter, setImportCSVDelimiter] =
        createSignal<string>('\u002C')

    const editorState = EditorState.create({
        doc: editorContent(),
        extensions: [
            editorTheme,
            languageSupport,
            highlightActiveLineGutter(),
            history(),
            foldGutter(),
            drawSelection(),
            highlightSelectionMatches(),
            dropCursor(),
            bracketMatching(),
            closeBrackets(),
            highlightActiveLine(),
            syntaxHighlighting(highlightStyle),
            EditorView.lineWrapping,
            autocompletion(),
            mettaLinter,
            keymap.of([
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
                ...foldKeymap,
                ...completionKeymap,
                ...lintKeymap,
            ]),
            EditorView.updateListener.of((update) => {
                setEditorContent(update.state.doc.toString())
            }),
            EditorView.domEventHandlers({
                drop: (event, view) => {
                    // prevent pasting the original content along with its translation
                    event.preventDefault()

                    // translate files dropped into the editor (csv, jsonld,...)
                    const draggedFile = event.dataTransfer?.files?.item(0)

                    if (draggedFile) {
                        setActiveImportFile(draggedFile)

                        translateToMetta()
                    }
                },
            }),
        ],
    })

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

            await translateToMetta()

            importFileModal.close()
        }

        loadSpace('5ad1773c-36af-4483-bde3-9b84a69c138f')
        setEditorMode(EditorMode.EDIT)

        loadSpaceForm.onsubmit = (event) => {
            // prevent page refresh on submit
            event.preventDefault()

            loadSpace(tokenToOpen())
            setEditorMode(EditorMode.EDIT)

            loadSpaceModal.close()
        }

        // clear file input after closing modal
        importFileModal.addEventListener('close', function (event) {
            importFileFormInput.value = ''
        })

        // update fullscreen status when user exits fullscreen using ESC key
        document.onfullscreenchange = async (event) => {
            if (!document.fullscreenElement) {
                setIsFullscreen(false)
            }
        }
    })

    // called right before mettaInput is added to the DOM
    // the HTML element is not added to the DOM when the component is mounted,
    // so we cannot initialize the editor in onMount
    const initializeEditor = (): void => {
        setEditorView(
            new EditorView({
                state: editorState,
                parent: mettaInput,
            })
        )
    }

    const handleImportFileSelect = (
        e: Event & {
            currentTarget: HTMLInputElement
            target: HTMLInputElement
        }
    ) => {
        const file = e.target?.files?.[0]

        if (file) {
            setActiveImportFile(file)
        }
    }

    const getParserParameters = (): ParserParameters => {
        switch (activeImportFileFormat()) {
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

    /**
     * EDITOR ACTION: import, translate
     */
    const translateToMetta = async (): Promise<void> => {
        const file = activeImportFile()
        const fileFormat = activeImportFileFormat()

        if (!fileFormat) {
            return
        }

        const parameters = new URLSearchParams(getParserParameters() as any)

        try {
            const resp = await fetch(
                `${BACKEND_URL}/translations/${fileFormat}?${parameters.toString()}`,
                {
                    method: 'POST',
                    headers: {},
                    body: file,
                }
            )

            const mettaTranslation = await resp.json()

            const view = editorView()

            if (!view) {
                throw new Error('Failed to translate: editorView was undefined')
            }

            // switch to import mode to allow modification of import parameters
            setEditorMode(EditorMode.IMPORT)

            // insert translated MeTTa code at cursor location
            view.dispatch(
                view.state.update({
                    changes: {
                        from: view.state.selection.main.head,
                        insert: mettaTranslation,
                    },
                })
            )

        } catch (e) {
            console.error(e)
            // TODO: specific error messages
            toast(
                `Failed to transform to MeTTa, verify the parameters and try again.`
            )
        }
    }

    /**
     * EDITOR ACTION: export
     */
    const exportMetta = (): void => {
        // TODO: include namespace back in filename
        const blob = URL.createObjectURL(new Blob([editorContent()]))

        const anchor = document.createElement('a')

        anchor.setAttribute('download', `$metta-${Date.now()}.metta`)
        anchor.setAttribute('href', blob)

        document.body.appendChild(anchor)

        anchor.click()
        URL.revokeObjectURL(blob)
    }

    /**
     * EDITOR ACTION: run
     */
    const run = async (): Promise<void> => {
        try {
            const resp = await fetch(
                'https://inter.metta-lang.dev/api/v1/codes',
                {
                    headers: {
                        accept: '*/*',
                        'content-type': 'application/json',
                    },
                    referrer: 'https://metta-lang.dev/',
                    referrerPolicy: 'strict-origin-when-cross-origin',
                    body: JSON.stringify({
                        code: editorContent(),
                    }),
                    method: 'POST',
                    mode: 'cors',
                    credentials: 'omit',
                }
            )

            const data = await resp.json()

            setEditorOutput(data['result'])
        } catch (e) {
            console.error(e)
            // TODO: specific error messages
            toast(`Failed to run MeTTa.`)
        }
    }

    /**
     * EDITOR ACTION: indent
     */
    const indent = (): void => {
        const view = editorView()

        if (!view) {
            console.error('Failed to indent: editorView was undefined')
            toast('Failed to indent code (unknown error).')
            return;
        }

        indentSelection({
            state: view.state,
            dispatch: (transaction) => view.dispatch(transaction),
        })
    }

    /**
     * EDITOR ACTION: load space
     */
    const loadSpace = async (token: string): Promise<void> => {
        try {
            const resp = await fetch(`${BACKEND_URL}/tokens`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: token,
                },
            })

            const data = await resp.json()

            const self = data.find((t: Token) => t.code === token)

            if (self) {
                setToken(self)
                setAvailableTokens(data)

                toast(`Successfully loaded space '${self.namespace}'`)
            } else {
                toast(`Failed to load space`)
            }
        } catch (e) {
            console.error(e)
            toast(`Failed to load space using token ${token}`)
        }
    }

    /**
     * EDITOR ACTION: fullscreen mode
     */
    const switchFullscreen = async (): Promise<void> => {
        if (isFullscreen()) {
            await document.exitFullscreen()
            setIsFullscreen(false)
        } else {
            await mettaEditor.requestFullscreen()
            setIsFullscreen(true)
        }
    }

    // TODO: remove hljs
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
                <div ref={mettaEditor!} class={styles.EditorWrapper}>
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
                                <button onclick={() => indent()}>Indent</button>
                                <button onclick={() => switchFullscreen()}>
                                    {isFullscreen()
                                        ? 'Exit Fullscreen'
                                        : 'Fullscreen'}
                                </button>
                                <button onclick={() => exportMetta()}>
                                    Export
                                </button>
                                <div style={{ 'flex-grow': 1 }}></div>
                                <button onclick={() => run()}>
                                    <VsRunAll
                                        class={styles.RunIcon}
                                        size={22}
                                    />
                                </button>
                            </div>
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
                                    value={token()?.namespace ?? ''}
                                    onchange={(e) => {
                                        rootTokenFormInput.setCustomValidity('')
                                    }}
                                    list={'available-namespaces'}
                                    pattern={
                                        '^/(([a-zA-Z0-9])+([a-zA-Z0-9]|-|_)*([a-zA-Z0-9])/)*$'
                                    }
                                    disabled={editorMode() !== EditorMode.EDIT}
                                />
                            </form>
                        </div>
                        <div
                            class={styles.MettaInput}
                            ref={(ref) => {
                                mettaInput = ref

                                initializeEditor()
                            }}
                        ></div>
                        <pre class={styles.Console}>
                            <code
                                class={'language-metta'}
                                innerHTML={
                                    hljs.highlight(editorOutput(), {
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
                                when={
                                    activeImportFileFormat() ===
                                    ImportFormat.CSV
                                }
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
                                            translateToMetta()
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
                                            translateToMetta()
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
                        onchange={(e) => handleImportFileSelect(e)}
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
                            disabled={activeImportFile() === null}
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
            <Toaster toastOptions={{ className: styles.Toaster }} containerStyle={{ "margin-top": "60px" }}/>
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
