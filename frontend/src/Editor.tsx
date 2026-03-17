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
import { wsService } from './websocket'
import hljs from 'highlight.js/lib/core'
import 'highlight.js/styles/panda-syntax-dark.css'

hljs.registerLanguage('metta', (hljs) => ({
    name: 'MeTTa',
    case_insensitive: false,
    keywords: {
        $pattern: /[A-Za-z_0-9,!=:?\-]+/,
        keyword: 'if match empty case let let* get-type get-metatype : -> = unify import! bind! new-space add-atom remove-atom pragma! println! trace! nop new-state get-state change-state car-atom cdr-atom cons-atom assertEqual assertEqualToResult collapse superpose load-ascii call regex quote add-reduct !',
        literal: 'True False',
        type: 'Number Bool String'
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
import { setCollapsedKeysEffect, collapsedKeysField, createPathFoldExtension, getFoldedTopLevelKeys } from './pathFoldExtension'
import { NamespaceSelector } from './NamespaceSelector'
import { TrieExplorer, buildTrie, TrieNode } from './TrieExplorer'

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
    if (!sexpr || sexpr.trim() === '' || sexpr.trim() === '$x') return '/';
    const cleaned = sexpr.replace(/[()]/g, '').replace(/\$x$/, '').trim();
    const parts = cleaned.split(/\s+/).filter(p => p.length > 0);
    if (parts.length === 0) return '/';
    return '/' + parts.join('/') + '/';
}

const pathToSexpr = (path: string): string => {
    if (!path || path === '/') return '$x';
    const parts = path.split('/').filter(p => p.length > 0);
    if (parts.length === 0) return '$x';
    let sexpr = '$x';
    for (let i = parts.length - 1; i >= 0; i--) {
        sexpr = `(${parts[i]} ${sexpr})`;
    }
    return sexpr;
}

interface EditorPanel {
    id: string;
    namespace: string;
    content: string;
    originalContent: string;
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

    // Panels State
    const [panels, setPanels] = createSignal<EditorPanel[]>([])
    const [activePanelId, setActivePanelId] = createSignal<string>('')
    
    const activePanel = () => panels().find(p => p.id === activePanelId())
    const hasChanges = createMemo(() => activePanel()?.content !== activePanel()?.originalContent)

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
    const [isDraggingOver, setIsDraggingOver] = createSignal(false)
    const [manualImportFormat, setManualImportFormat] = createSignal<ImportFormat>()
    const [isTranslating, setIsTranslating] = createSignal(false)
    const [importCSVDirection, setImportCSVDirection] = createSignal<ImportCSVDirection>(ImportCSVDirection.CELL_LABELED)
    const [importCSVDelimiter, setImportCSVDelimiter] = createSignal<string>('\u002C')

    // Transform State
    const [transformConfigs, setTransformConfigs] = createSignal<SpaceConfig[]>([])

    // Trie/Editor fold sync state — full paths like "/key/" that are collapsed
    const [collapsedPaths, setCollapsedPaths] = createSignal<Set<string>>(new Set())

    // Sidebar collapse state
    const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false)

    // WebSocket: set of space paths currently locked (import in progress)
    const [lockedPaths, setLockedPaths] = createSignal<Set<string>>(new Set())

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

    const createEditorState = (initialDoc: string) => {
        return EditorState.create({
            doc: initialDoc,
            extensions: [
                themeCompartment.of(getEditorTheme(currentTheme() === 'dark')),
                languageSupport,
                diffExtension,
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
                    if (update.docChanged) {
                        const content = update.state.doc.toString()
                        untrack(() => {
                            setPanels(prev => prev.map(p => p.id === activePanelId() ? { ...p, content } : p))
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
                createPathFoldExtension((foldedKeys) => {
                    const p = activePanel()
                    if (!p) return
                    const ns = p.namespace.endsWith('/') ? p.namespace : p.namespace + '/'
                    setCollapsedPaths(new Set(Array.from(foldedKeys).map(k => `${ns}${k}/`)))
                }),
            ],
        })
    }

    createEffect(() => {
        const panelsList = panels()
        const activeId = activePanelId()
        const p = panelsList.find(item => item.id === activeId)
        if (p && p.view) {
            p.view.dispatch({ effects: setOriginalContentEffect.of(p.originalContent) })
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
                    const view = new EditorView({
                        state: createEditorState(p.content),
                        parent: mettaInput
                    })
                    setPanels(prev => prev.map(item => item.id === p.id ? { ...item, view } : item))
                    setCollapsedPaths(new Set())
                } else {
                    mettaInput.appendChild(p.view.dom)
                    // Restore collapsed paths from this panel's current fold state
                    const foldedKeys = getFoldedTopLevelKeys(p.view.state)
                    const ns = p.namespace.endsWith('/') ? p.namespace : p.namespace + '/'
                    setCollapsedPaths(new Set(Array.from(foldedKeys).map(k => `${ns}${k}/`)))
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
        const key = path.slice(activeNs.length).split('/')[0]
        if (!key) return
        const current = p.view.state.field(collapsedKeysField)
        if (current.has(key)) return
        p.view.dispatch({ effects: setCollapsedKeysEffect.of(new Set([...current, key])) })
        // collapsedPaths is updated via the onCollapsedKeysChange callback in createPathFoldExtension
    }

    const handleTrieExpand = (path: string) => {
        const p = activePanel()
        if (!p?.view) return
        const activeNs = p.namespace.endsWith('/') ? p.namespace : p.namespace + '/'
        if (!path.startsWith(activeNs)) return
        const key = path.slice(activeNs.length).split('/')[0]
        if (!key) return
        const current = new Set(p.view.state.field(collapsedKeysField))
        current.delete(key)
        p.view.dispatch({ effects: setCollapsedKeysEffect.of(current) })
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
        const blob = URL.createObjectURL(new Blob([p.content]))
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
            const resp = await fetch('https://inter.metta-lang.dev/api/v1/codes', {
                headers: { accept: '*/*', 'content-type': 'application/json' },
                referrer: 'https://metta-lang.dev/',
                body: JSON.stringify({ code: p.content, language: 'metta' }),
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

    const addPanel = async (ns: string) => {
        const existing = panels().find(p => p.namespace === ns)
        if (existing) {
            setActivePanelId(existing.id)
            return
        }

        const id = Math.random().toString(36).substring(7)
        const encodedPath = ns.split('/').map(encodeURIComponent).join('/')
        
        try {
            const resp = await fetch(`${BACKEND_URL}/spaces${encodedPath}`, {
                headers: { 'Content-Type': 'application/json', Authorization: token()?.code ?? '' },
            })
            if (!resp.ok) throw new Error(`Status ${resp.status}`)
            const metta: string = await resp.json()
            
            const newPanel: EditorPanel = {
                id,
                namespace: ns,
                content: metta,
                originalContent: metta
            }
            
            batch(() => {
                setPanels(prev => [...prev, newPanel])
                setActivePanelId(id)
                setEditorMode(EditorMode.EDIT)
            })
            
            notify.success(`Loaded space '${ns}'`)
        } catch (e) {
            console.error(e)
            notify.error(`Failed to load space '${ns}'`)
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

        const originalLines = new Set(
            p.originalContent.split('\n').map(l => l.trim()).filter(l => l.length > 0)
        )
        const newLines = p.content.split('\n').filter(l => {
            const trimmed = l.trim()
            return trimmed.length > 0 && !originalLines.has(trimmed)
        })
        const diffContent = newLines.join('\n')

        if (!diffContent) {
            notify.success(`No new content to save to space '${path}'`)
            return
        }

        setConfirmData({
            title: 'Save to Space',
            message: `Are you sure you want to save ${newLines.length} new line(s) to space '${path}'?`,
            onConfirm: async () => {
                try {
                    const resp = await fetch(`${BACKEND_URL}/spaces${encodedPath}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: token()?.code ?? '' },
                        body: diffContent,
                    })
                    if (resp.ok) {
                        notify.success(`Successfully saved to space '${path}'`)
                        setPanels(prev => prev.map(item => item.id === p.id ? { ...item, originalContent: p.content } : item))
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
        const encodedPath = path.split('/').map(encodeURIComponent).join('/')
        try {
            const resp = await fetch(`${BACKEND_URL}/spaces${encodedPath}`, {
                headers: { 'Content-Type': 'application/json', Authorization: token()?.code ?? '' },
            })
            if (!resp.ok) throw new Error(`Status ${resp.status}`)
            const metta: string = await resp.json()
            
            if (p && !ns) {
                // Update current panel
                setPanels(prev => prev.map(item => item.id === p.id ? { ...item, content: metta, originalContent: metta } : item))
                p.view?.dispatch(p.view.state.update({ changes: { from: 0, to: p.view.state.doc.length, insert: metta } }))
                notify.success(`Reloaded space '${path}'`)
            } else {
                addPanel(path)
            }
        } catch (e) {
            console.error(e)
            notify.error(`Failed to load space '${path}'`)
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

    const fetchExploreResults = async (path: string, focusToken: string = '') => {
        if (!token()) return []
        let ns = path
        if (ns.startsWith('/')) ns = ns.substring(1)
        const encodedNs = ns.split('/').map(encodeURIComponent).join('/')
        
        const results: any[] = []
        const uniqueNextLevelPaths = new Set<string>()

        try {
            const res = await fetch(`${BACKEND_URL}/explore/${encodedNs}?focus_token=${encodeURIComponent(focusToken)}`, {
                headers: { Authorization: token()?.code ?? '' }
            })
            if (res.ok) {
                const data = await res.json()
                const parsed: any[] = typeof data === 'string' ? (data.trim() === '' ? [] : JSON.parse(data)) : data
                const currentParts = path.split('/').filter(p => p.length > 0)
                
                for (const item of parsed) {
                    const samplePath = sexprToPath(item.expr)
                    const sampleParts = samplePath.split('/').filter(p => p.length > 0)
                    
                    if (sampleParts.length <= currentParts.length) continue
                    
                    // Pick the segment that comes immediately after our current depth
                    const nextSegment = sampleParts[currentParts.length]
                    const nextParts = [...currentParts, nextSegment]
                    const nextPath = '/' + nextParts.join('/') + '/'
                    const nextSexpr = pathToSexpr(nextPath)
                    
                    if (!uniqueNextLevelPaths.has(nextSexpr)) {
                        uniqueNextLevelPaths.add(nextSexpr)
                        // results.push({ token: item.token, expr: nextSexpr, path: nextPath }) // This line was missing in the original, added here.
                        // The original code had a typo: nextLevelResults instead of results
                        // Corrected to push to results array
                        results.push({ token: item.token, expr: nextSexpr, path: nextPath });
                    }
                }
            }
        } catch (e) { console.error("Explore API failed:", e) }

        // Local fallback: use current editor content to find sub-namespaces
        const p = activePanel()
        if (p) {
            const trie = buildTrie(p.content)
            const currentParts = path.split('/').filter(p => p.length > 0)
            
            let currentLevel = trie
            for (const part of currentParts) {
                if (currentLevel.children[part]) {
                    currentLevel = currentLevel.children[part]
                } else {
                    currentLevel = { children: {}, isDeletable: false }
                    break
                }
            }

            for (const [name, node] of Object.entries(currentLevel.children)) {
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
                                                <Show when={hasChanges()}>
                                                    <button onclick={() => write()}>
                                                        <VsCloudDownload size={16} />
                                                        <span>Save</span>
                                                    </button>
                                                </Show>
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
                            content={activePanel()?.content || ''}
                            originalContent={activePanel()?.originalContent}
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
                            collapsedPaths={collapsedPaths}
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
                onCancel={() => {
                    importFileModal.close()
                    setActiveImportFile(undefined)
                    setImportUrl('')
                    setImportText('')
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
