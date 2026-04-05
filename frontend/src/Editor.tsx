import type { Component } from 'solid-js'
import {
    AiFillFolderOpen,
} from 'solid-icons/ai'
import {
    VsPlay,
    VsCloudUpload,
    VsIndent,
    VsSave,
    VsCloudDownload,
    VsReplace,
    VsClearAll,
    VsClose,
    VsAdd,
    VsLock,
    VsCheck,
    VsWarning,
    VsChevronLeft,
    VsChevronRight,
} from 'solid-icons/vs'
import { createMemo, createSignal, onMount, onCleanup, Show, For, createEffect, batch, on, untrack } from 'solid-js'
import styles from './Editor.module.scss'
import { A } from '@solidjs/router'
import { Toaster } from 'solid-toast'
import { notify } from './notify'
import { useTheme } from './ThemeContext'
import { BACKEND_URL, TOKEN } from './urls'
import { wsService, StatusEvent } from './websocket'
import hljs from 'highlight.js/lib/core'
import 'highlight.js/styles/panda-syntax-dark.css'

hljs.registerLanguage('metta', (hljs) => ({
    name: 'MeTTa',
    case_insensitive: false,
    keywords: {
        $pattern: /[A-Za-z_0-9,!=:?\-<>+*\/%@]+/,
        keyword: [
            // Special forms
            '= : -> !',
            // Control / pattern matching
            'if case switch match unify let let* if-equal if-decons-expr if-error return-on-error',
            // Evaluation
            'eval evalc chain function return collapse collapse-bind superpose superpose-bind metta quote unquote noeval empty',
            // Type system
            'get-type get-type-space get-metatype is-function type-cast match-type-or match-types =alpha noreduce-eq',
            // Atom manipulation
            'car-atom cdr-atom cons-atom decons-atom index-atom size-atom atom-subst sealed capture id nop',
            // Functional
            'map-atom filter-atom foldl-atom for-each-in-atom first-from-pair',
            // Set operations
            'intersection intersection-atom union union-atom subtraction subtraction-atom unique unique-atom',
            // Space
            'new-space add-atom add-atoms add-reduct add-reducts remove-atom get-atoms context-space mod-space! module-space-no-deps',
            // State
            'new-state change-state! get-state',
            // Output
            'format-args println! print-mods! trace! sort-strings',
            // Modules
            'import! include register-module! git-module! bind! pragma!',
            // Assertions
            'assertEqual assertEqualMsg assertEqualToResult assertEqualToResultMsg assertAlphaEqual assertAlphaEqualMsg assertAlphaEqualToResult assertAlphaEqualToResultMsg assertIncludes',
            // Arithmetic
            '+ - * / % abs-math acos-math asin-math atan-math ceil-math cos-math floor-math isinf-math isnan-math log-math pow-math round-math sin-math sqrt-math tan-math trunc-math max-atom min-atom',
            // Comparison
            '< <= > >= == =alpha noreduce-eq',
            // Logic
            'and or not xor',
            // Docs
            '@doc @doc-formal @desc @param @params @return @item @type get-doc help! help-param! help-space!',
            // Legacy
            'load-ascii call regex',
        ].join(' '),
        literal: 'True False',
        type: 'Number Bool String Type Atom Symbol Variable Expression Grounded SpaceType %Undefined% Empty NotReducible ErrorType StateMonad'
    },
    contains: [
        hljs.COMMENT(';', '$'),
        {
            className: 'string',
            begin: '"', end: '"'
        },
        {
            className: 'variable',
            begin: '\\$[A-Za-z_0-9,!=:?\\-]+'
        },
        {
            className: 'symbol',
            begin: '&[A-Za-z_0-9,!=:?\\-]+'
        },
        {
            className: 'number',
            begin: '\\b-?\\d+(\\.\\d+)?\\b'
        }
    ]
}))
import {
    bracketMatching,
    syntaxHighlighting,
} from '@codemirror/language'
import { Annotation, EditorState } from '@codemirror/state'
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
    ImportSource,
    Token,
} from './types'
import {
    getEditorTheme,
    highlightStyle,
    languageSupport,
    mettaLinter,
    themeCompartment,
} from './mettaLanguageSupport'
import { Expression, Symbol, Variable } from './parser/parser.terms'
import { diffExtension, setOriginalContentEffect } from './diffExtension'
import { setCollapsedPathsEffect, collapsedPathsField, createPathFoldExtension, getFoldedPaths, extractLinePathTokens } from './pathFoldExtension'
import { NamespaceSelector } from './NamespaceSelector'
import { TrieExplorer, buildTrie, TrieNode } from './TrieExplorer'
import { EditorASTState, astToString, initializeEditorState, emptyEditorState, parseMeTTaString, buildASTFromTokens, mergeTokensIntoAST, unexpandFringe, hasFringeDescendant, computeDiff, ASTNode } from './ast'
import { getDisplayContent, getOriginalContent, createASTStateFromTokens, stripNamespacePrefix } from './editorASTUtils'

// Components
import { Header } from './components/Header'
import { ConfirmModal } from './components/ConfirmModal'
import { LoadSpaceModal } from './components/LoadSpaceModal'
import { ImportModal } from './components/ImportModal'
import { TransformModal, SpaceConfig } from './components/TransformModal'
import { SelectSpaceModal } from './components/SelectSpaceModal'

const extensionToImportFormat = (file: File): ImportFormat | undefined => {
    const extension = file.name.split('.').pop()?.toLowerCase()

    switch (extension) {
        case 'csv':
            return ImportFormat.CSV
        case 'nt':
        case 'ntriples':
            return ImportFormat.NTRIPLES
        case 'n3':
            return ImportFormat.N3
        case 'jsonld':
        case 'json-ld':
            return ImportFormat.JSONLD
        case 'metta':
            return ImportFormat.METTA
        default:
            return undefined
    }
}

const sexprToPath = (sexpr: string): string => {
    if (!sexpr || sexpr.trim() === '' || sexpr.trim() === '|$|') return '/';
    const cleaned = sexpr.replace(/[()]/g, '').replace(/\|?\$\|?$/, '').trim();
    const parts = cleaned.split(/\s+/).filter(p => p.length > 0);
    if (parts.length === 0) return '/';
    return '/' + parts.join('/') + '/';
}

const tokensToSexpr = (tokens: string[]): string => {
    if (tokens.length === 0) return '|$|';
    // If the last token is |$|, use it as the inner base.
    // Otherwise, it's a terminal atom path, so just build the nested structure.
    let sexpr = tokens[tokens.length - 1];
    for (let i = tokens.length - 2; i >= 0; i--) {
        sexpr = `(${tokens[i]} ${sexpr})`;
    }
    return sexpr;
}

const pathToSexpr = (path: string): string => {
    if (!path || path === '/') return '|$|';
    const parts = path.split('/').filter(p => p.length > 0);
    if (parts.length === 0) return '|$|';
    let sexpr = '|$|';
    for (let i = parts.length - 1; i >= 0; i--) {
        sexpr = `(${parts[i]} ${sexpr})`;
    }
    return sexpr;
}

interface EditorPanel {
    id: string;
    namespace: string;
    astState: EditorASTState;  // AST is the source of truth
    view?: EditorView;
}

const App: Component = () => {
    console.log("VITE_TOKEN detected:", TOKEN);
    // Refs
    let importFileModal: HTMLDialogElement
    let commitImportForm: HTMLFormElement
    let mettaEditor: HTMLDivElement
    let mettaInput: HTMLDivElement
    let loadSpaceModal: HTMLDialogElement
    let selectSpaceModal: HTMLDialogElement
    let transformModal: HTMLDialogElement
    let confirmModal: HTMLDialogElement

    // Space State
    const [token, setToken] = createSignal<Token>()
    const [namespaces, setNamespaces] = createSignal<string[]>([])

    // Annotation to skip AST re-parse in updateListener for programmatic edits
    const programmaticEdit = Annotation.define<boolean>()

    // Panels State
    const [panels, setPanels] = createSignal<EditorPanel[]>([])
    const [activePanelId, setActivePanelId] = createSignal<string>('')
    
    const activePanel = () => panels().find(p => p.id === activePanelId())

    // Editor Content State
    const [editorOutput, setEditorOutput] = createSignal('')
    const [editorMode, setEditorMode] = createSignal<EditorMode>(
        (TOKEN || localStorage.getItem('rootToken')) ? EditorMode.EDIT : EditorMode.DEFAULT
    )

    // UI Layout State
    const [isFullscreen, setIsFullscreen] = createSignal<boolean>(false)
    const [trieWidth, setTrieWidth] = createSignal(300)
    const [isResizing, setIsResizing] = createSignal(false)
    const [consoleHeight, setConsoleHeight] = createSignal(120)
    const [isResizingConsole, setIsResizingConsole] = createSignal(false)

    // Import State
    const [importSource, setImportSource] = createSignal<ImportSource>(ImportSource.FILE)
    const [importNamespace, setImportNamespace] = createSignal<string>('/')
    const [activeImportFile, setActiveImportFile] = createSignal<File>()
    const [importUrl, setImportUrl] = createSignal<string>('')
    const [importText, setImportText] = createSignal<string>('')
    const [importExamplePath, setImportExamplePath] = createSignal<string>('')
    const [isDraggingOver, setIsDraggingOver] = createSignal(false)
    const [manualImportFormat, setManualImportFormat] = createSignal<ImportFormat>()
    const [isTranslating, setIsTranslating] = createSignal(false)
    const [importCSVDirection, setImportCSVDirection] = createSignal<ImportCSVDirection>(ImportCSVDirection.CELL_LABELED)
    const [importCSVDelimiter, setImportCSVDelimiter] = createSignal<string>('\u002C')

    // Transform State
    const [transformConfigs, setTransformConfigs] = createSignal<SpaceConfig[]>([])

    // Trie/Editor fold sync state — full paths like "/key/" or "/key/sub/" that are collapsed
    const [collapsedPaths, setCollapsedPaths] = createSignal<Set<string>>(new Set())

    // Focus tokens for expandable paths — keyed by path, stores array of tokens per path
    const [focusTokens, setFocusTokens] = createSignal<Map<string, string[]>>(new Map())

    // Sidebar collapse state
    const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false)

    // WebSocket: set of space paths currently locked (import in progress)
    const [lockedPaths, setLockedPaths] = createSignal<Set<string>>(new Set())
    const [spaceStatus, setSpaceStatus] = createSignal<StatusEvent | null>(null)

    // Confirmation State
    const [confirmData, setConfirmData] = createSignal({
        title: '',
        message: '',
        onConfirm: () => {}
    })

    const activeImportFileFormat = createMemo<ImportFormat | undefined>(() => {
        const src = importSource()
        if (src === ImportSource.FILE) {
            const file = activeImportFile()
            if (file) return manualImportFormat() || extensionToImportFormat(file)
            return undefined
        }
        if (src === ImportSource.EXAMPLES) return ImportFormat.METTA
        // URL and Text: default to MeTTa if not manually overridden
        return manualImportFormat() ?? ImportFormat.METTA
    })

    createEffect(() => {
        const file = activeImportFile()
        if (file && importFileModal && !importFileModal.open) {
            openImportModal()
        }
    })

    const { theme: currentTheme } = useTheme()

    const createEditorState = (initialDoc: string, astState: EditorASTState) => {
        return EditorState.create({
            doc: initialDoc,
            extensions: [
                themeCompartment.of(getEditorTheme(currentTheme() === 'dark')),
                languageSupport,
                diffExtension,
                highlightActiveLineGutter(),
                history(),
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
                    ...completionKeymap,
                    ...lintKeymap,
                ]),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged && !update.transactions.some(t => t.annotation(programmaticEdit))) {
                        const content = update.state.doc.toString()
                        const newAST = parseMeTTaString(content, 'manual')
                        untrack(() => {
                            setPanels(prev => prev.map(p => p.id === activePanelId() ? { ...p, astState: { ...p.astState, ast: newAST } } : p))
                        })
                    }
                }),
                EditorView.domEventHandlers({
                    drop: (event, view) => {
                        event.preventDefault()
                        const draggedFile = event.dataTransfer?.files?.item(0)
                        if (draggedFile) {
                            setImportSource(ImportSource.FILE)
                            setActiveImportFile(draggedFile)
                            openImportModal()
                        }
                    },
                }),
                createPathFoldExtension(
                    (foldedPaths) => {
                        const p = activePanel()
                        if (!p) return
                        const ns = p.namespace.endsWith('/') ? p.namespace : p.namespace + '/'
                        setCollapsedPaths(new Set(Array.from(foldedPaths).map(k => `${ns}${k}/`)))
                    },
                    (fringePath) => {
                        // Handle $ click — expand fringe
                        const p = activePanel()
                        if (!p) return
                        const ns = p.namespace.endsWith('/') ? p.namespace : p.namespace + '/'
                        handleTrieExpand(`${ns}${fringePath}/`)
                    },
                ),
            ],
        })
    }

    createEffect(() => {
        const panelsList = panels()
        const activeId = activePanelId()
        const p = panelsList.find(item => item.id === activeId)
        if (p && p.view) {
            const originalContent = getOriginalContent(p.astState)
            p.view.dispatch({ effects: setOriginalContentEffect.of(originalContent) })
        }
    })

    createEffect(on(currentTheme, (theme) => {
        const isDark = theme === 'dark'
        panels().forEach(p => {
            if (p.view) {
                p.view.dispatch({ effects: themeCompartment.reconfigure(getEditorTheme(isDark)) })
            }
        })
    }, { defer: true }))

    // Handle swapping views when active panel changes
    createEffect(on(activePanelId, (id) => {
        if (mettaInput) {
            mettaInput.innerHTML = ''
            if (!id) return;
            const p = untrack(panels).find(item => item.id === id)
            if (p) {
                if (!p.view) {
                    const displayContent = getDisplayContent(p.astState)
                    const view = new EditorView({
                        state: createEditorState(displayContent, p.astState),
                        parent: mettaInput
                    })
                    setPanels(prev => prev.map(item => item.id === p.id ? { ...item, view } : item))
                    setCollapsedPaths(new Set<string>())
                } else {
                    mettaInput.appendChild(p.view.dom)
                    // Restore collapsed paths from this panel's current fold state
                    const ns = p.namespace.endsWith('/') ? p.namespace : p.namespace + '/'
                    const foldedPaths = getFoldedPaths(p.view.state)
                    setCollapsedPaths(new Set(Array.from(foldedPaths).map(k => `${ns}${k}/`)))
                }
            }
        }
    }))


    // Connect the events WebSocket once we have a token, and subscribe to space events
    createEffect(() => {
        const t = token()
        if (!t) return
        wsService.connectEvents(t.code)
        const unsub = wsService.onSpaceEvent((event) => {
            setLockedPaths((prev: Set<string>) => {
                const next = new Set<string>(prev)
                if (event.type === 'locked') next.add(event.path)
                else next.delete(event.path)
                return next
            })
        })
        onCleanup(() => {
            unsub()
            wsService.disconnectEvents()
        })
    })

    // Subscribe to MORK status stream for the active panel's namespace
    createEffect(() => {
        const t = token()
        const ns = activePanel()?.namespace
        if (!t || !ns) { setSpaceStatus(null); return }
        setSpaceStatus(null)
        const unsub = wsService.subscribeStatus(ns, t.code, (event) => setSpaceStatus(event))
        onCleanup(unsub)
    })

    let isMounted = false
    onMount(() => {
        if (isMounted) return
        isMounted = true

        const setupModalBackdrop = (modal: HTMLDialogElement) => {
            modal.addEventListener('click', (event) => {
                const rect = modal.getBoundingClientRect()
                const isInDialog =
                    rect.top <= event.clientY &&
                    event.clientY <= rect.top + rect.height &&
                    rect.left <= event.clientX &&
                    event.clientX <= rect.left + rect.width
                if (!isInDialog) {
                    event.stopPropagation()
                    modal.close()
                }
            })
        }

        setupModalBackdrop(importFileModal)
        setupModalBackdrop(loadSpaceModal)
        setupModalBackdrop(selectSpaceModal)
        setupModalBackdrop(transformModal)
        setupModalBackdrop(confirmModal)

        const effectiveToken = TOKEN || localStorage.getItem('rootToken');
        console.log("Token check:", { VITE_TOKEN: TOKEN, localStorage: localStorage.getItem('rootToken') });

        if (effectiveToken) {
            setEditorMode(EditorMode.EDIT);
            loadSpace(effectiveToken, true);
        }

        importFileModal.addEventListener('close', () => {
            (importFileModal.querySelector('input[type="file"]') as HTMLInputElement).value = ''
        })

        document.onfullscreenchange = async () => {
            if (!document.fullscreenElement) setIsFullscreen(false)
        }

        window.addEventListener('dragover', (e) => e.preventDefault(), false)
        window.addEventListener('drop', (e) => e.preventDefault(), false)
    })

    const openImportModal = () => {
        setImportNamespace(activePanel()?.namespace || '/')
        importFileModal.showModal()
    }

    const handleTrieCollapse = (path: string) => {
        const p = activePanel()
        if (!p?.view) return
        const activeNs = p.namespace.endsWith('/') ? p.namespace : p.namespace + '/'
        if (!path.startsWith(activeNs)) return
        const relPath = path.slice(activeNs.length).replace(/\/$/, '')

        const astState = p.astState

        // If this path was expanded (fringe expand), unexpand it instead of folding
        if (astState.expandedPaths.has(relPath)) {
            unexpandFringe(astState.ast, astState.nodeMap, relPath)
            unexpandFringe(astState.originalAST, astState.originalNodeMap, relPath)
            astState.expandedPaths.delete(relPath)

            // Re-render
            const displayContent = getDisplayContent(astState)
            setPanels(prev => prev.map(item => item.id === p.id ? { ...item, astState } : item))
            p.view.dispatch(p.view.state.update({
                changes: { from: 0, to: p.view.state.doc.length, insert: displayContent },
                annotations: [programmaticEdit.of(true)],
            }))

            // Remove from collapsed set: the path is now a fringe marker, not a fold
            const newCollapsed = new Set(p.view.state.field(collapsedPathsField))
            newCollapsed.delete(relPath)
            p.view.dispatch({ effects: setCollapsedPathsEffect.of(newCollapsed) })
            return
        }

        // Regular collapse (non-fringe path): add to collapsed set
        const newCollapsed = new Set(p.view.state.field(collapsedPathsField))
        newCollapsed.add(relPath)
        p.view.dispatch({ effects: setCollapsedPathsEffect.of(newCollapsed) })
    }

    const handleTrieExpand = async (path: string) => {
        const p = activePanel()
        if (!p?.view) return
        const activeNs = p.namespace.endsWith('/') ? p.namespace : p.namespace + '/'
        if (!path.startsWith(activeNs)) return
        const relPath = path.slice(activeNs.length).replace(/\/$/, '')

        const currentCollapsed = new Set(p.view.state.field(collapsedPathsField))

        // If this path is NOT a fringe node (no $ child in AST), just remove it from collapsed paths
        if (!hasFringeDescendant(p.astState.ast, relPath)) {
            currentCollapsed.delete(relPath)
            p.view.dispatch({ effects: setCollapsedPathsEffect.of(currentCollapsed) })
            return
        }

        try {
            // Look up all focus tokens for this path
            const pathWithSlash = path.endsWith('/') ? path : path + '/'
            const pathFocusTokens = focusTokens().get(pathWithSlash) || []

            // Fetch results for all focus tokens and combine them
            let allTokens: string[][] = []
            if (pathFocusTokens.length === 0) {
                // No focus tokens, make a single request without token
                allTokens = await loadFringeAsTokens(path)
            } else {
                // Make one request per focus token and combine results
                for (const focusToken of pathFocusTokens) {
                    const tokens = await loadFringeAsTokens(path, focusToken)
                    allTokens = allTokens.concat(tokens)
                }
            }

            const tokens = allTokens

            // Merge tokens into AST
            const astState = p.astState
            const pathKey = relPath.split('/').filter(Boolean).join('/')

            // Strip namespace prefix from tokens before merging
            const strippedTokens = stripNamespacePrefix(tokens, activeNs)

            // Find and update the fringe node in the AST (and originalAST to avoid diff)
            mergeTokensIntoAST(astState.ast, astState.nodeMap, pathKey, strippedTokens)
            mergeTokensIntoAST(astState.originalAST, astState.originalNodeMap, pathKey, strippedTokens)
            astState.expandedPaths.add(pathKey)

            // Re-render
            const displayContent = getDisplayContent(astState)
            setPanels(prev => prev.map(item => item.id === p.id ? { ...item, astState } : item))
            p.view.dispatch(p.view.state.update({
                changes: { from: 0, to: p.view.state.doc.length, insert: displayContent },
                annotations: [programmaticEdit.of(true)],
            }))

            notify.success(`Explored fringe at '${path}'`)
        } catch (e) {
            console.error("Expand exploration failed:", e)
        }

        // Also remove from the collapsed set so CM decoration updates
        const newCollapsed = new Set(p.view.state.field(collapsedPathsField))
        newCollapsed.delete(relPath)
        p.view.dispatch({ effects: setCollapsedPathsEffect.of(newCollapsed) })
    }

    const getParserParameters = (): any => {
        const format = activeImportFileFormat()
        if (format === ImportFormat.CSV) {
            return { direction: importCSVDirection(), delimiter: importCSVDelimiter() }
        }
        return { dummy: '' }
    }

    const translateToMetta = async (): Promise<void> => {
        const format = activeImportFileFormat()
        if (!format) return

        setIsTranslating(true)

        try {
            const p = activePanel()
            if (!p || !p.view) throw new Error('No active editor view')
            const targetNs = importNamespace()
            const encodedPath = targetNs.split('/').map(encodeURIComponent).join('/')
            const src = importSource()

            if (src === ImportSource.FILE) {
                const file = activeImportFile()
                if (!file) return

                if (format === ImportFormat.METTA) {
                    const text = await file.text()
                    const resp = await fetch(`${BACKEND_URL}/spaces${encodedPath}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: token()?.code ?? '' },
                        body: text,
                    })
                    if (!resp.ok) throw new Error(`Status ${resp.status}`)
                } else {
                    const parameters = new URLSearchParams(getParserParameters() as any)
                    const resp = await fetch(`${BACKEND_URL}/spaces/import/${format}${encodedPath}?${parameters.toString()}`, {
                        method: 'POST',
                        headers: { Authorization: token()?.code ?? '' },
                        body: file,
                    })
                    if (!resp.ok) throw new Error(`Status ${resp.status}`)
                }

            } else if (src === ImportSource.URL) {
                const url = importUrl().trim()
                if (!url) return

                if (format === ImportFormat.METTA) {
                    const resp = await fetch(`${BACKEND_URL}/spaces/import/url/metta${encodedPath}?url=${encodeURIComponent(url)}`, {
                        headers: { Authorization: token()?.code ?? '' },
                    })
                    if (!resp.ok) throw new Error(`Status ${resp.status}`)
                } else {
                    const parameters = new URLSearchParams({ ...getParserParameters() as any, url })
                    const resp = await fetch(`${BACKEND_URL}/spaces/import/url/${format}${encodedPath}?${parameters.toString()}`, {
                        headers: { Authorization: token()?.code ?? '' },
                    })
                    if (!resp.ok) throw new Error(`Status ${resp.status}`)
                }

            } else if (src === ImportSource.TEXT) {
                const text = importText().trim()
                if (!text) return

                if (format === ImportFormat.METTA) {
                    const resp = await fetch(`${BACKEND_URL}/spaces${encodedPath}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: token()?.code ?? '' },
                        body: text,
                    })
                    if (!resp.ok) throw new Error(`Status ${resp.status}`)
                } else {
                    const parameters = new URLSearchParams(getParserParameters() as any)
                    const resp = await fetch(`${BACKEND_URL}/spaces/import/${format}${encodedPath}?${parameters.toString()}`, {
                        method: 'POST',
                        headers: { Authorization: token()?.code ?? '' },
                        body: text,
                    })
                    if (!resp.ok) throw new Error(`Status ${resp.status}`)
                }
            } else if (src === ImportSource.EXAMPLES) {
                const exPath = importExamplePath()
                if (!exPath) return
                const rawUrl = `https://raw.githubusercontent.com/trueagi-io/metta-examples/main/${exPath}`
                const resp = await fetch(`${BACKEND_URL}/spaces/import/url/metta${encodedPath}?url=${encodeURIComponent(rawUrl)}`, {
                    headers: { Authorization: token()?.code ?? '' },
                })
                if (!resp.ok) throw new Error(`Status ${resp.status}`)
            }

            if (targetNs === activePanel()?.namespace) {
                await read()
            } else {
                await addPanel(targetNs)
            }

            notify.success(format === ImportFormat.METTA ? 'Successfully imported to space' : 'Successfully translated and imported to space')
            setEditorMode(EditorMode.EDIT)
            setActiveImportFile(undefined)
            setImportUrl('')
            setImportText('')
            setImportExamplePath('')
            setManualImportFormat(undefined)
            importFileModal.close()
        } catch (e) {
            console.error(e)
            notify.error(`Failed to ${format === ImportFormat.METTA ? 'import' : 'translate and import'} (Backend error or invalid format).`)
        } finally {
            setIsTranslating(false)
        }
    }

    const exportMetta = (): void => {
        const p = activePanel()
        if (!p) return
        const content = getDisplayContent(p.astState)
        const blob = URL.createObjectURL(new Blob([content]))
        const anchor = document.createElement('a')
        anchor.setAttribute('download', `$metta-${Date.now()}.metta`)
        anchor.setAttribute('href', blob)
        document.body.appendChild(anchor)
        anchor.click()
        URL.revokeObjectURL(blob)
    }

    const run = async (): Promise<void> => {
        const p = activePanel()
        if (!p) return
        try {
            const content = getDisplayContent(p.astState)
            const resp = await fetch('https://inter.metta-lang.dev/api/v1/codes', {
                headers: { accept: '*/*', 'content-type': 'application/json' },
                referrer: 'https://metta-lang.dev/',
                body: JSON.stringify({ code: content, language: 'metta' }),
                method: 'POST',
            })
            const data = await resp.json()
            setEditorOutput(data['result'])
        } catch (e) {
            console.error(e)
            notify.error(`Failed to run MeTTa.`)
        }
    }

    const indent = (): void => {
        const p = activePanel()
        if (!p || !p.view) {
            notify.error('Failed to indent code (unknown error).')
            return
        }
        indentSelection({ state: p.view.state, dispatch: (transaction) => p.view?.dispatch(transaction) })
    }

    const loadSpace = async (tokenStr: string, silent: boolean = false): Promise<void> => {
        try {
            const resp = await fetch(`${BACKEND_URL}/token`, {
                headers: { 'Content-Type': 'application/json', Authorization: tokenStr },
            })
            const self: Token = await resp.json()
            if (self) {
                setToken(self)
                await addPanel(self.namespace)
                setEditorMode(EditorMode.EDIT)
            } else if (!silent) notify.error(`Failed to load space`)
        } catch (e) {
            console.error(e)
            if (!silent) notify.error(`Failed to load space using token ${tokenStr}`)
        }
    }

    const loadFringeAsTokens = async (path: string, focusToken?: string): Promise<string[][]> => {
        let ns = path
        if (ns.startsWith('/')) ns = ns.substring(1)
        const encodedNs = ns.split('/').map(encodeURIComponent).join('/')

        try {
            // Always pass focus_token parameter, use empty string if not provided
            const tokenParam = encodeURIComponent(focusToken || '')
            const url = `${BACKEND_URL}/explore/${encodedNs}?focus_token=${tokenParam}`

            const res = await fetch(url, {
                headers: { Authorization: token()?.code ?? '' }
            })
            if (!res.ok) throw new Error(`Status ${res.status}`)
            const data = await res.json()

            // New format: ExploreResult struct with subspaces and metta_expressions
            const exploreResult = data
            const subspaces = exploreResult.subspaces || []
            const mettaExpressions = exploreResult.metta_expressions || []
            const resultFocusToken = exploreResult.focus_token

            // Store focus tokens for future expansion
            const newTokens = new Map(focusTokens())

            // Store the focus token for the current namespace if present
            if (resultFocusToken) {
                const currentPath = path.endsWith('/') ? path : path + '/'
                const existingTokens = newTokens.get(currentPath) || []
                if (!existingTokens.includes(resultFocusToken)) {
                    existingTokens.push(resultFocusToken)
                }
                newTokens.set(currentPath, existingTokens)
            }

            // Process subspaces and store their focus tokens
            for (const [mettaString, subspacePath] of subspaces) {
                if (subspacePath) {
                    const normalizedPath = subspacePath.startsWith('/') ? subspacePath : '/' + subspacePath
                    const pathWithSlash = normalizedPath.endsWith('/') ? normalizedPath : normalizedPath + '/'

                    // Store a placeholder token for subspaces (will be fetched when expanded)
                    if (!newTokens.has(pathWithSlash)) {
                        newTokens.set(pathWithSlash, [])
                    }
                }
            }

            setFocusTokens(newTokens)

            // Convert to token format: subspaces first, then metta_expressions
            const result: string[][] = []

            // Add subspaces at the top
            for (const [mettaString, _path] of subspaces) {
                if (mettaString) {
                    result.push(["!", mettaString])
                }
            }

            // Add metta_expressions below
            for (const expr of mettaExpressions) {
                if (expr) {
                    result.push(["!", expr])
                }
            }

            return result
        } catch (e) {
            console.error("Explore API failed:", e)
            throw e
        }
    }

    const fetchNamespaceInfo = async (ns: string): Promise<{ token: string, subnamespaces: any[] }> => {
        let namespace = ns
        if (namespace.startsWith('/')) namespace = namespace.substring(1)
        if (namespace.endsWith('/')) namespace = namespace.slice(0, -1)
        const encodedNs = namespace.split('/').map(encodeURIComponent).join('/')

        try {
            const res = await fetch(`${BACKEND_URL}/namespaces/${encodedNs}`, {
                headers: { Authorization: token()?.code ?? '' }
            })
            if (res.ok) {
                const data = await res.json()
                return {
                    token: data.token || '',
                    subnamespaces: data.subnamespaces || []
                }
            }
        } catch (e) {
            console.error("Fetch namespace info failed:", e)
        }
        return { token: '', subnamespaces: [] }
    }

    const addPanel = async (ns: string) => {
        const existing = panels().find(p => p.namespace === ns)
        if (existing) {
            setActivePanelId(existing.id)
            return
        }

        const id = Math.random().toString(36).substring(7)

        try {
            // First fetch namespace info to get focus tokens
            const namespaceInfo = await fetchNamespaceInfo(ns)

            // Store focus tokens for subnamespaces
            const newTokens = new Map(focusTokens())
            for (const sub of namespaceInfo.subnamespaces) {
                if (sub.token) {
                    const subNs = sub.namespace || ''
                    const subPath = subNs.startsWith('/') ? subNs : '/' + subNs
                    const normalizedPath = subPath.endsWith('/') ? subPath : subPath + '/'
                    newTokens.set(normalizedPath, [sub.token])
                }
            }
            setFocusTokens(newTokens)

            // Now load the space content using the root token
            const fringeTokens = await loadFringeAsTokens(ns, namespaceInfo.token)
            const astState = createASTStateFromTokens(fringeTokens, ns)

            const newPanel: EditorPanel = {
                id,
                namespace: ns,
                astState,
            }

            batch(() => {
                setPanels(prev => [...prev, newPanel])
                setActivePanelId(id)
                setEditorMode(EditorMode.EDIT)
            })

            notify.success(`Loaded space fringe '${ns}'`)
        } catch (e) {
            console.error(e)
            notify.error(`Failed to load space fringe '${ns}'`)
        }
    }

    const closePanel = (id: string, e: MouseEvent) => {
        e.stopPropagation()
        const panelToClose = panels().find(p => p.id === id)
        if (panelToClose?.view) {
            panelToClose.view.destroy()
        }
        
        const remaining = panels().filter(p => p.id !== id)
        setPanels(remaining)
        
        if (activePanelId() === id) {
            if (remaining.length > 0) {
                setActivePanelId(remaining[remaining.length - 1].id)
            } else {
                setActivePanelId('')
                setEditorMode(EditorMode.DEFAULT)
            }
        }
    }

    const write = async () => {
        const p = activePanel()
        if (!p) return
        const path = p.namespace
        const encodedPath = path.split('/').map(encodeURIComponent).join('/')

        // Filter AST to only manually entered nodes
        const manualNodes: typeof p.astState.ast = []
        function filterManualNodes(nodes: ASTNode[]): ASTNode[] {
          return nodes.filter(n => {
            if (n.source !== 'manual') return false
            if (n.type === 'expr') {
              const expr = n as any
              expr.children = filterManualNodes(expr.children)
            }
            return true
          })
        }
        const manualAST = filterManualNodes(JSON.parse(JSON.stringify(p.astState.ast)))
        const diffContent = astToString(manualAST).trim()

        if (!diffContent) {
            notify.success(`No new content to save to space '${path}'`)
            return
        }

        const lineCount = diffContent.split('\n').length

        setConfirmData({
            title: 'Save to Space',
            message: `Are you sure you want to save ${lineCount} new line(s) to space '${path}'?`,
            onConfirm: async () => {
                try {
                    const resp = await fetch(`${BACKEND_URL}/spaces${encodedPath}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: token()?.code ?? '' },
                        body: diffContent,
                    })
                    if (resp.ok) {
                        notify.success(`Successfully saved to space '${path}'`)
                        // Mark all manual nodes as loaded (sync original)
                        const updatedAST = JSON.parse(JSON.stringify(p.astState.ast))
                        function markLoaded(nodes: ASTNode[]): void {
                          for (const node of nodes) {
                            node.source = 'loaded'
                            if (node.type === 'expr') {
                              const expr = node as any
                              markLoaded(expr.children)
                            }
                          }
                        }
                        markLoaded(updatedAST)
                        setPanels(prev => prev.map(item => item.id === p.id
                          ? { ...item, astState: { ...item.astState, originalAST: updatedAST } }
                          : item))
                    } else notify.error(`Failed to save to space '${path}' (Status: ${resp.status})`)
                } catch (e) {
                    console.error(e)
                    notify.error(`Error saving to space '${path}'`)
                }
                confirmModal.close()
            },
        })
        confirmModal.showModal()
    }

    const read = async (ns?: string) => {
        const p = activePanel()
        const path = ns || p?.namespace || '/'
        try {
            // First fetch namespace info to get focus tokens
            const namespaceInfo = await fetchNamespaceInfo(path)

            // Store focus tokens for subnamespaces
            const newTokens = new Map(focusTokens())
            for (const sub of namespaceInfo.subnamespaces) {
                if (sub.token) {
                    const subNs = sub.namespace || ''
                    const subPath = subNs.startsWith('/') ? subNs : '/' + subNs
                    const normalizedPath = subPath.endsWith('/') ? subPath : subPath + '/'
                    newTokens.set(normalizedPath, [sub.token])
                }
            }
            setFocusTokens(newTokens)

            // Now load the space content using the root token
            const tokens = await loadFringeAsTokens(path, namespaceInfo.token)

            if (p && !ns) {
                // Update current panel
                const astState = createASTStateFromTokens(tokens, path)
                const displayContent = getDisplayContent(astState)
                setPanels(prev => prev.map(item => item.id === p.id ? { ...item, astState } : item))
                p.view?.dispatch(p.view.state.update({ changes: { from: 0, to: p.view.state.doc.length, insert: displayContent } }))
                notify.success(`Reloaded space fringe '${path}'`)
            } else {
                addPanel(path)
            }
        } catch (e) {
            console.error(e)
            notify.error(`Failed to load space fringe '${path}'`)
        }
    }

    const transform = async (configs: SpaceConfig[]) => {
        const input_spaces = configs.filter(c => c.type === 'input').map(c => c.path.substring(1))
        const output_spaces = configs.filter(c => c.type === 'output').map(c => c.path.substring(1))
        const patterns = configs.filter(c => c.type === 'input').map(c => c.patternOrTemplate)
        const templates = configs.filter(c => c.type === 'output').map(c => c.patternOrTemplate)

        try {
            const resp = await fetch(`${BACKEND_URL}/spaces`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: token()?.code ?? '' },
                body: JSON.stringify({ input_spaces, output_spaces, patterns, templates }),
            })
            if (resp.ok) {
                notify.success('Transformation successfully dispatched')
                transformModal.close()
            } else notify.error(`Transformation failed (Status: ${resp.status})`)
        } catch (e) { console.error(e); notify.error('Error during transformation') }
    }

    const fetchExploreResults = async (path: string) => {
        if (!token()) return []
        let ns = path
        if (ns.startsWith('/')) ns = ns.substring(1)
        const encodedNs = ns.split('/').map(encodeURIComponent).join('/')

        const results: any[] = []
        const uniqueNextLevelPaths = new Set<string>()

        try {
            const res = await fetch(`${BACKEND_URL}/namespaces/${encodedNs}`, {
                headers: { Authorization: token()?.code ?? '' }
            })
            if (res.ok) {
                const data: any = await res.json()
                const subnamespaces = data.subnamespaces || []

                // Convert NamespaceInfo objects to the format expected by NamespaceSelector
                for (const info of subnamespaces) {
                    // Convert namespace like "a/b" to path format "/a/b/"
                    const namespace = info.namespace || ''
                    const resultPath = namespace.startsWith('/') ? namespace : '/' + namespace
                    const normalizedPath = resultPath.endsWith('/') ? resultPath : resultPath + '/'

                    if (!uniqueNextLevelPaths.has(normalizedPath)) {
                        uniqueNextLevelPaths.add(normalizedPath)
                        // Generate a simple display expression from the path
                        const expr = pathToSexpr(normalizedPath)
                        results.push({ token: info.token, expr, path: normalizedPath });
                    }
                }
            }
        } catch (e) { console.error("Namespaces API failed:", e) }

        // Local fallback: use current editor content to find sub-namespaces
        const p = activePanel()
        if (p) {
            const displayContent = getDisplayContent(p.astState)
            const trie = buildTrie(displayContent)
            const currentParts = path.split('/').filter(p => p.length > 0)
            
            let currentLevel = trie
            for (const part of currentParts) {
                if (currentLevel.children[part]) {
                    currentLevel = currentLevel.children[part]
                } else {
                    currentLevel = { children: {}, terminals: [], isDeletable: false }
                    break
                }
            }

            for (const [name, node] of Object.entries(currentLevel.children)) {
                // Only suggest namespaces that have further sub-namespace children
                // (non-leaf nodes). Leaf nodes (only terminals, no children) are
                // terminal namespaces and should not appear in the selector.
                if (Object.keys(node.children).length === 0) continue
                const nextPath = '/' + [...currentParts, name].join('/') + '/'
                const nextSexpr = pathToSexpr(nextPath)
                if (!uniqueNextLevelPaths.has(nextSexpr)) {
                    uniqueNextLevelPaths.add(nextSexpr)
                    results.push({ token: [], expr: nextSexpr, path: nextPath })
                }
            }
        }

        return results
    }

    const clearSpace = async () => {
        const p = activePanel()
        if (!p) return
        const path = p.namespace
        const encodedPath = path.split('/').map(encodeURIComponent).join('/')
        setConfirmData({
            title: 'Clear Space',
            message: `Are you sure you want to clear the space '${path}'?`,
            onConfirm: async () => {
                try {
                    const resp = await fetch(`${BACKEND_URL}/spaces${encodedPath}`, {
                        method: 'DELETE',
                        headers: { Authorization: token()?.code ?? '' },
                    })
                    if (resp.ok) {
                        notify.success(`Successfully cleared space '${path}'`)
                        await read()
                    } else notify.error(`Failed to clear space '${path}'`)
                } catch (e) { console.error(e); notify.error(`Error clearing space '${path}'`) }
                confirmModal.close()
            }
        })
        confirmModal.showModal()
    }

    const deleteSubspace = async (path: string) => {
        // Rocket's <path..> doesn't match trailing slashes well, and path.split('/') with trailing slash 
        // results in an empty last segment. We should filter empty segments.
        const segments = path.split('/').filter(p => p.length > 0)
        const encodedPath = segments.map(encodeURIComponent).join('/')
        
        setConfirmData({
            title: 'Delete Subspace',
            message: `Are you sure you want to delete the subspace '${path}'? This will remove all atoms matching this prefix.`,
            onConfirm: async () => {
                try {
                    const url = segments.length > 0 
                        ? `${BACKEND_URL}/spaces/${encodedPath}`
                        : `${BACKEND_URL}/spaces`;
                        
                    const resp = await fetch(url, {
                        method: 'DELETE',
                        headers: { Authorization: token()?.code ?? '' },
                    })
                    if (resp.ok) {
                        notify.success(`Successfully deleted subspace '${path}'`)
                        await read()
                    } else notify.error(`Failed to delete subspace '${path}' (Status: ${resp.status})`)
                } catch (e) {
                    console.error(e)
                    notify.error(`Error deleting subspace '${path}'`)
                }
                confirmModal.close()
            }
        })
        confirmModal.showModal()
    }

    const startResizing = (e: MouseEvent) => {
        setIsResizing(true)
        const initialX = e.clientX; const initialWidth = trieWidth()
        const onMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = initialX - moveEvent.clientX
            setTrieWidth(Math.max(150, Math.min(800, initialWidth + deltaX)))
        }
        const onMouseUp = () => {
            setIsResizing(false)
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseup', onMouseUp)
        }
        document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp)
    }

    const startConsoleResizing = (e: MouseEvent) => {
        setIsResizingConsole(true)
        const initialY = e.clientY; const initialHeight = consoleHeight()
        const onMouseMove = (moveEvent: MouseEvent) => {
            const deltaY = moveEvent.clientY - initialY
            setConsoleHeight(Math.max(60, Math.min(600, initialHeight + deltaY)))
        }
        const onMouseUp = () => {
            setIsResizingConsole(false)
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseup', onMouseUp)
        }
        document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp)
    }

    return (
        <div class={styles.MainLayout}>
            <Header />
            <main
                class={styles.Main}
                style={{ "--trie-width": `${trieWidth()}px`, "--console-height": `${consoleHeight()}px` }}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    const draggedFile = e.dataTransfer?.files?.item(0)
                    if (draggedFile) {
                        setImportSource(ImportSource.FILE)
                        setActiveImportFile(draggedFile); setManualImportFormat(undefined); openImportModal();
                    }
                }}
            >
                <div class={styles.EditorLayout}>
                    <div class={styles.MainEditorArea}>
                        <div ref={mettaEditor!} class={styles.EditorWrapper}>
                            <Show when={panels().length === 0 && editorMode() === EditorMode.DEFAULT}>
                                <div class={styles.NewSessionDiv}>
                                    <button onClick={() => loadSpaceModal.showModal()} class={styles.ImportButton}>
                                        <AiFillFolderOpen class={styles.Icon} size={28} />
                                        <span>Load MeTTa Space</span>
                                    </button>
                                </div>
                            </Show>
                            <Show when={panels().length > 0 || editorMode() !== EditorMode.DEFAULT}>
                                <div class={styles.EditorTabs}>
                                    <For each={panels()}>
                                        {(p) => (
                                            <div
                                                class={`${styles.EditorTab} ${p.id === activePanelId() ? styles.ActiveTab : ''}`}
                                                onClick={() => setActivePanelId(p.id)}
                                            >
                                                <span class={styles.TabTitle}>{p.namespace}</span>
                                                <Show when={lockedPaths().has(p.namespace)}>
                                                    <span class={styles.TabLocked} title="Space is locked (import in progress)">
                                                        <VsLock size={12} />
                                                    </span>
                                                </Show>
                                                <button class={styles.TabClose} onClick={(e) => closePanel(p.id, e)}>
                                                    <VsClose size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </For>
                                    <button class={styles.AddTab} onClick={() => selectSpaceModal.showModal()}>
                                        <VsAdd size={16} />
                                    </button>
                                </div>

                                {/* Full-width namespace / address bar */}
                                <div class={styles.MettaInputActionsWrapper}>
                                    <Show when={spaceStatus()}>
                                        {(status) => {
                                            const s = status().status
                                            const isError = s === 'fetchError' || s === 'parseError' || s === 'execError'
                                            const isLocked = s === 'pathReadOnly' || s === 'pathReadOnlyTemporary' || s === 'pathForbidden' || s === 'pathForbiddenTemporary'
                                            const isCount = s === 'countResult'
                                            return (
                                                <div class={styles.SpaceStatusBadge} title={s}>
                                                    <Show when={isError}>
                                                        <VsWarning size={14} style={{ color: 'var(--rp-love)' }} />
                                                        <span>{s}</span>
                                                    </Show>
                                                    <Show when={isLocked}>
                                                        <VsLock size={14} style={{ color: 'var(--rp-gold)' }} />
                                                        <span>{s}</span>
                                                    </Show>
                                                    <Show when={isCount}>
                                                        <VsCheck size={14} style={{ color: 'var(--rp-foam)' }} />
                                                        <span>{String(status().count ?? '')} atoms</span>
                                                    </Show>
                                                    <Show when={s === 'pathClear'}>
                                                        <VsCheck size={14} style={{ color: 'var(--rp-foam)' }} />
                                                        <span>ready</span>
                                                    </Show>
                                                </div>
                                            )
                                        }}
                                    </Show>
                                    <NamespaceSelector
                                        value={activePanel()?.namespace || '/'}
                                        onInput={(ns) => {
                                            setPanels(prev => prev.map(p => p.id === activePanelId() ? { ...p, namespace: ns } : p))
                                        }}
                                        onCommit={() => read()}
                                        fetchExploreResults={fetchExploreResults}
                                        disabled={editorMode() !== EditorMode.EDIT}
                                    />
                                </div>

                                {/* Card body: sidebar + editor content side by side */}
                                <div class={styles.EditorBody}>
                                    <Show when={editorMode() !== EditorMode.DEFAULT}>
                                        <aside class={`${styles.Sidebar} ${sidebarCollapsed() ? styles.SidebarCollapsed : ''}`}>
                                            <div class={styles.MettaEditorActions}>
                                                <div class={styles.ButtonGroup}>
                                                    <button onClick={() => openImportModal()}>
                                                        <VsCloudUpload size={16} />
                                                        <span>Import</span>
                                                    </button>
                                                    <button onclick={() => exportMetta()}>
                                                        <VsSave size={16} />
                                                        <span>Export</span>
                                                    </button>
                                                </div>
                                                <div class={styles.ButtonGroup}>
                                                    <button onclick={() => clearSpace()}>
                                                        <VsClearAll size={16} />
                                                        <span>Clear</span>
                                                    </button>
                                                    <button onclick={() => {
                                                        if (transformConfigs().length === 0) {
                                                            setTransformConfigs([
                                                                { path: '/', type: 'input', patternOrTemplate: '' },
                                                                { path: '/', type: 'output', patternOrTemplate: '' }
                                                            ]);
                                                        }
                                                        transformModal.showModal();
                                                    }}>
                                                        <VsReplace size={16} />
                                                        <span>Transform</span>
                                                    </button>
                                                    <button onclick={() => write()}>
                                                        <VsCloudDownload size={16} />
                                                        <span>Save</span>
                                                    </button>
                                                </div>
                                                <div class={styles.ButtonGroup}>
                                                    <button onclick={() => indent()}>
                                                        <VsIndent size={16} />
                                                        <span>Reformat</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <button
                                                class={styles.SidebarToggle}
                                                onClick={() => setSidebarCollapsed(v => !v)}
                                                title={sidebarCollapsed() ? 'Expand sidebar' : 'Collapse sidebar'}
                                            >
                                                {sidebarCollapsed() ? <VsChevronRight size={14} /> : <VsChevronLeft size={14} />}
                                            </button>
                                        </aside>
                                    </Show>

                                    <div class={styles.EditorContent}>
                                        <div class={styles.MettaInput} ref={(ref) => { mettaInput = ref; }}></div>
                                        <div class={`${styles.ConsoleResizer} ${isResizingConsole() ? styles.Resizing : ''}`} onMouseDown={startConsoleResizing} />
                                        <div class={styles.ConsoleSection}>
                                            <div class={styles.ConsoleToolbar}>
                                                <button onclick={() => run()} class={styles.RunButton} title="Run MeTTa">
                                                    <VsPlay size={14} />
                                                    <span>Run</span>
                                                </button>
                                            </div>
                                            <pre class={styles.Console}>
                                                <code class={'language-metta'} innerHTML={hljs.highlight(editorOutput(), { language: 'metta' }).value}></code>
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            </Show>
                        </div>
                    </div>

                    <Show when={editorMode() !== EditorMode.DEFAULT}>
                        <div class={`${styles.Resizer} ${isResizing() ? styles.Resizing : ''}`} onMouseDown={startResizing} />
                        <TrieExplorer
                            content={activePanel() ? getDisplayContent(activePanel()!.astState) : ''}
                            originalContent={activePanel() ? getOriginalContent(activePanel()!.astState) : ''}
                            onDelete={deleteSubspace}
                            rootPath={activePanel()?.namespace || '/'}
                            onOpenSubspace={(path) => addPanel(path)}
                            onConfigureTransform={(paths) => {
                                setTransformConfigs(paths.map((p, i) => ({
                                    path: p,
                                    type: i === 0 ? 'input' : 'output',
                                    patternOrTemplate: ''
                                })));
                                transformModal.showModal();
                            }}
                            collapsedPaths={() => collapsedPaths()}
                            onCollapse={handleTrieCollapse}
                            onExpand={handleTrieExpand}
                        />
                    </Show>
                </div>
            </main>

            <ImportModal
                ref={importFileModal!}
                importSource={importSource}
                setImportSource={setImportSource}
                importNamespace={importNamespace}
                setImportNamespace={setImportNamespace}
                fetchExploreResults={fetchExploreResults}
                activeFile={activeImportFile}
                onFileSelect={(file) => { setActiveImportFile(file); setManualImportFormat(undefined); }}
                importUrl={importUrl}
                setImportUrl={setImportUrl}
                importText={importText}
                setImportText={setImportText}
                importExamplePath={importExamplePath}
                setImportExamplePath={setImportExamplePath}
                onCancel={() => {
                    importFileModal.close()
                    setActiveImportFile(undefined)
                    setImportUrl('')
                    setImportText('')
                    setImportExamplePath('')
                    setManualImportFormat(undefined)
                    setImportNamespace(activePanel()?.namespace || '/')
                }}
                isDraggingOver={isDraggingOver}
                setIsDraggingOver={setIsDraggingOver}
                format={activeImportFileFormat}
                setManualFormat={setManualImportFormat}
                csvDirection={importCSVDirection}
                setCsvDirection={setImportCSVDirection}
                csvDelimiter={importCSVDelimiter}
                setCsvDelimiter={setImportCSVDelimiter}
                onImport={translateToMetta}
                isTranslating={isTranslating}
            />

            <LoadSpaceModal 
                ref={loadSpaceModal!}
                onLoad={(t) => { loadSpace(t); loadSpaceModal.close() }}
                onCancel={() => loadSpaceModal.close()}
            />

            <SelectSpaceModal 
                ref={selectSpaceModal!}
                onSelect={(path) => { addPanel(path); selectSpaceModal.close() }}
                onCancel={() => selectSpaceModal.close()}
                fetchExploreResults={fetchExploreResults}
                initialValue={activePanel()?.namespace || '/'}
            />

            <TransformModal 
                ref={transformModal!}
                configs={transformConfigs}
                setConfigs={setTransformConfigs}
                onTransform={transform}
                onCancel={() => transformModal.close()}
                fetchExploreResults={fetchExploreResults}
            />

            <ConfirmModal 
                ref={confirmModal!}
                title={confirmData().title}
                message={confirmData().message}
                onConfirm={confirmData().onConfirm}
                onCancel={() => confirmModal.close()}
            />

            <Toaster toastOptions={{ className: styles.Toaster }} containerStyle={{ 'margin-top': '60px' }} />
        </div>
    )
}

export default App
