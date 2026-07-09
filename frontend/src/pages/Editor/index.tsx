import type { Component } from 'solid-js'
import {
    AiFillFolderOpen,
    AiOutlineGithub,
} from 'solid-icons/ai'
import {
    VsCloudUpload,
    VsSave,
    VsReplace,
    VsClearAll,
    VsClose,
    VsAdd,
    VsLock,
    VsCheck,
    VsWarning,
    VsChevronLeft,
    VsChevronRight,
    VsSignOut,
    VsSettings,
    VsDiscard,
    VsRedo,
    VsLayers,
    VsCopy,
} from 'solid-icons/vs'
import { createMemo, createSignal, onMount, onCleanup, Show, For, createEffect, batch, on, untrack } from 'solid-js'
import { createStore, reconcile, unwrap } from 'solid-js/store'
import { createOwnHistoryStore } from './stores/ownHistoryStore'
import styles from './Editor.module.scss'
import commonStyles from '../../styles/Common.module.scss'
import { A, useSearchParams } from '@solidjs/router'
import { Toaster } from 'solid-toast'
import { notify } from '../../notify'
import { useTheme } from '../../ThemeContext'
import { BACKEND_URL, TOKEN } from '../../urls'
import { wsService, WS_BASE, StatusEvent } from '../../websocket'
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
import { Annotation, Compartment, EditorState, type Range, StateEffect, StateField } from '@codemirror/state'
import {
    Decoration,
    type DecorationSet,
    drawSelection,
    dropCursor,
    EditorView,
    highlightActiveLine,
    highlightActiveLineGutter,
    keymap,
    ViewPlugin,
    WidgetType,
} from '@codemirror/view'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import {
    defaultKeymap,
    historyKeymap,
    history,
    indentSelection,
    undoDepth,
    redoDepth,
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
    type OpLogEntry,
} from '../../types'
import {
    getEditorTheme,
    highlightStyle,
    languageSupport,
    mettaLinter,
    themeCompartment,
} from './extensions/mettaLanguageSupport'
import { Expression, Symbol, Variable } from '../../parser/parser.terms'
import { diffExtension, setOriginalContentEffect } from './extensions/diffExtension'
import { createPathFoldExtension } from './extensions/pathFoldExtension'
import { NamespaceSelector } from './components/NamespaceSelector/NamespaceSelector'
import { TrieExplorer, buildTrie, TrieNode } from './components/TrieExplorer/TrieExplorer'
import { EditorASTState, astToString, initializeEditorState, emptyEditorState, parseMeTTaString, buildASTFromTokens, mergeTokensIntoAST, unexpandFringe, hasFringeDescendant, computeDiff, ASTNode, ExprNode } from './lib/ast'
import { getDisplayContent, getOriginalContent, createASTStateFromTokens, stripNamespacePrefix } from './lib/editorASTUtils'
import { parse as parseSExprs, serialize as serializeSExpr } from './lib/dsl'

// Components
import { Navbar } from '../../components/Navbar/Navbar'
import { ConfirmModal } from '../../components/ConfirmModal/ConfirmModal'
import { LoadSpaceModal } from './components/modals/LoadSpaceModal/LoadSpaceModal'
import { ImportModal } from './components/modals/ImportModal/ImportModal'
import { TransformModal, SpaceConfig } from './components/modals/TransformModal/TransformModal'
import { SelectSpaceModal } from './components/modals/SelectSpaceModal/SelectSpaceModal'
import { ClearModal } from './components/modals/ClearModal/ClearModal'
import { CopyModal } from './components/modals/CopyModal/CopyModal'
import { ShareTokenModal } from './components/modals/ShareTokenModal/ShareTokenModal'
import { DslConsole } from './components/DslConsole/DslConsole'

// ─── Diff prefix trie helpers ──────────────────────────────────────────────

interface DiffTrieNode {
    c?: Record<string, DiffTrieNode>
    a?: 1   // leaf: atom added
    r?: 1   // leaf: atom removed
}

function insertIntoDiffTrie(root: DiffTrieNode, tokens: string[], marker: 'a' | 'r') {
    let node = root
    for (const tok of tokens) {
        if (!node.c) node.c = {}
        if (!node.c[tok]) node.c[tok] = {}
        node = node.c[tok]!
    }
    node[marker] = 1
}

function buildDiffPrefixTrie(added: string[], removed: string[]): DiffTrieNode {
    const root: DiffTrieNode = {}
    for (const atom of added) {
        const tokens = atom.split(/\s+/).filter(Boolean)
        if (tokens.length > 0) insertIntoDiffTrie(root, tokens, 'a')
    }
    for (const atom of removed) {
        const tokens = atom.split(/\s+/).filter(Boolean)
        if (tokens.length > 0) insertIntoDiffTrie(root, tokens, 'r')
    }
    return root
}

function collectTrieAtoms(node: DiffTrieNode, tokens: string[], added: string[], removed: string[]): void {
    if (node.a) added.push(tokens.join(' '))
    if (node.r) removed.push(tokens.join(' '))
    if (node.c) {
        for (const [tok, child] of Object.entries(node.c)) {
            tokens.push(tok)
            collectTrieAtoms(child, tokens, added, removed)
            tokens.pop()
        }
    }
}

function isBalanced(text: string): boolean {
    let depth = 0
    let inString = false
    for (const ch of text) {
        if (ch === '"') { inString = !inString; continue }
        if (inString) continue
        if (ch === '(') depth++
        else if (ch === ')') { if (--depth < 0) return false }
    }
    return depth === 0
}

function computeAtomDiff(current: string, original: string): { added: string[]; removed: string[] } {
    const toAtoms = (text: string): string[] =>
        parseSExprs(text).map(serializeSExpr).filter(Boolean)

    const currAtoms = toAtoms(current)
    const origAtoms = toAtoms(original)

    const origCounts = new Map<string, number>()
    for (const atom of origAtoms) origCounts.set(atom, (origCounts.get(atom) ?? 0) + 1)

    const currCounts = new Map<string, number>()
    for (const atom of currAtoms) currCounts.set(atom, (currCounts.get(atom) ?? 0) + 1)

    const added: string[] = []
    const removed: string[] = []

    for (const [atom, count] of currCounts) {
        const extra = count - (origCounts.get(atom) ?? 0)
        for (let i = 0; i < extra; i++) added.push(atom)
    }
    for (const [atom, count] of origCounts) {
        const extra = count - (currCounts.get(atom) ?? 0)
        for (let i = 0; i < extra; i++) removed.push(atom)
    }

    return { added, removed }
}

// ─── Remote presence & cursor helpers ─────────────────────────────────────────

// Unique ID for this browser tab — used to filter out own echoed events.
// Two tabs with the same token will still see each other because they have different SESSION_IDs.
const SESSION_ID = crypto.randomUUID()

const REMOTE_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e91e63']
const _hashStr = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h }
const colorForSession = (sessionId: string) => REMOTE_COLORS[_hashStr(sessionId) % REMOTE_COLORS.length]

interface RemoteCursorInfo { sessionId: string; displayName: string; line: number; col: number }

const setRemoteCursorsEffect = StateEffect.define<RemoteCursorInfo[]>()

class RemoteCursorWidget extends WidgetType {
    constructor(private color: string, private name: string) { super() }
    toDOM(): HTMLElement {
        const wrap = document.createElement('span')
        wrap.style.cssText = 'position:relative;display:inline-block;width:0;overflow:visible;pointer-events:none;vertical-align:text-top;'
        const caret = document.createElement('span')
        caret.style.cssText = `position:absolute;top:0;left:-1px;height:1.2em;width:2px;background:${this.color};`
        const label = document.createElement('span')
        label.textContent = this.name
        label.style.cssText = `position:absolute;bottom:100%;left:0;background:${this.color};color:#fff;font-size:10px;padding:1px 4px;border-radius:3px;white-space:nowrap;line-height:1.4;`
        wrap.appendChild(caret)
        wrap.appendChild(label)
        return wrap
    }
    eq(other: RemoteCursorWidget) { return this.color === other.color && this.name === other.name }
    ignoreEvent() { return true }
}

const remoteCursorsField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(decos, tr) {
        decos = decos.map(tr.changes)
        for (const effect of tr.effects) {
            if (effect.is(setRemoteCursorsEffect)) {
                // Cursor presence display is disabled; keep the field/effect
                // plumbing intact so the feature can be re-enabled easily.
                decos = Decoration.none
            }
        }
        return decos
    },
    provide: f => EditorView.decorations.from(f),
})

// ───────────────────────────────────────────────────────────────────────────

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
        case 'mm2':
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

// Walk down the namespace tree from rootPath and return the path that should be
// lazy-loaded on editor scroll, or null if loading is ambiguous or impossible.
//
// Rules:
//   - If rootPath itself has a pending focus token, return it (existing behaviour).
//   - Otherwise look one level deeper: if exactly one direct child has tokens
//     anywhere below it, recurse into that child and apply the same rules.
//   - If multiple siblings at the same level have tokens below them, return null
//     (ambiguous — don't auto-load).
const findNextPaginatablePath = (
    rootPath: string,
    focusTokensMap: Map<string, string[]>,
    prefetchCacheMap: Map<string, string[][]>,
): string | null => {
    const norm = rootPath.endsWith('/') ? rootPath : rootPath + '/'

    const hasMore = (p: string) =>
        (focusTokensMap.get(p)?.length ?? 0) > 0 || prefetchCacheMap.has(p)

    if (hasMore(norm)) return norm

    // Collect all descendant paths that have tokens
    const allKeys = new Set([...focusTokensMap.keys(), ...prefetchCacheMap.keys()])
    const descendants = [...allKeys].filter(p => p.startsWith(norm) && p !== norm && hasMore(p))

    if (descendants.length === 0) return null

    // Map each descendant to its direct-child prefix of norm
    // (the path segment immediately below norm)
    const normSlashes = (norm.match(/\//g) || []).length
    const directChildren = new Set(
        descendants.map(p => {
            let count = 0
            for (let i = 0; i < p.length; i++) {
                if (p[i] === '/') count++
                if (count === normSlashes + 1) return p.slice(0, i + 1)
            }
            return p
        })
    )

    if (directChildren.size !== 1) return null  // multiple siblings — ambiguous

    const [singleChild] = directChildren
    return findNextPaginatablePath(singleChild, focusTokensMap, prefetchCacheMap)
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
    let clearModal: HTMLDialogElement
    let copyModal: HTMLDialogElement
    let shareTokenModal: HTMLDialogElement

    const [searchParams, setSearchParams] = useSearchParams()

    // Space State
    const [token, setToken] = createSignal<Token>()
    const [rootTokenCode, setRootTokenCode] = createSignal<string | null>(
        TOKEN || localStorage.getItem('rootToken')
    )
    const [namespaces, setNamespaces] = createSignal<string[]>([])
    const canWrite = () => token()?.permission_write ?? false
    let lastReadOnlyToast = 0
    const notifyReadOnly = () => {
        const now = Date.now()
        if (now - lastReadOnlyToast > 3000) {
            lastReadOnlyToast = now
            notify.error('This space is read-only')
        }
    }
    const readOnlyCompartment = new Compartment()

    // Annotation to skip AST re-parse in updateListener for programmatic edits
    const programmaticEdit = Annotation.define<boolean>()

    // Per-view tracking of what content was last diffed and sent, so that
    // incremental edits (type then delete) produce correct deltas.
    const viewLastSent = new WeakMap<EditorView, string>()

    // Per-view tracking of what content was last committed (saved), used as
    // the baseline when computing diffs to send on Save.
    const viewLastCommitted = new WeakMap<EditorView, string>()

    // Per-namespace set of expressions currently subscribed via ws/watch
    const watchedExprs = new Map<string, Set<string>>()
    const syncWatchSubscriptions = (namespace: string, content: string) => {
        const newExprs = new Set(content.split('\n').map(l => l.trim()).filter(Boolean))
        const prevExprs = watchedExprs.get(namespace) ?? new Set<string>()
        for (const expr of newExprs) {
            if (!prevExprs.has(expr)) wsService.subscribeExpr(namespace, expr)
        }
        for (const expr of prevExprs) {
            if (!newExprs.has(expr)) wsService.unsubscribeExpr(namespace, expr)
        }
        watchedExprs.set(namespace, newExprs)
    }

    // Remote editor presence: token_id → { displayName, path, line?, col?, lastSeen }
    interface RemoteEditor { displayName: string; path: string; line?: number; col?: number; lastSeen: number }
    const [remoteEditors, setRemoteEditors] = createSignal<Map<string, RemoteEditor>>(new Map())
    // Remove editors not seen in 60 seconds
    const _presenceCleanupInterval = setInterval(() => {
        const now = Date.now()
        setRemoteEditors(prev => {
            const next = new Map(prev)
            for (const [id, e] of next) if (now - e.lastSeen > 60_000) next.delete(id)
            return next.size !== prev.size ? next : prev
        })
    }, 10_000)
    onCleanup(() => clearInterval(_presenceCleanupInterval))

    // Panels State
    const [panels, setPanels] = createStore<EditorPanel[]>([])
    const [activePanelId, setActivePanelId] = createSignal<string>('')
    const [panelsWithUnsavedChanges, setPanelsWithUnsavedChanges] = createSignal<Set<string>>(new Set())
    const hasUnsavedChanges = () => panelsWithUnsavedChanges().has(activePanelId())

    const activePanel = () => panels.find(p => p.id === activePanelId())

    // Transient namespace value while the user is typing in the toolbar selector.
    // Kept separate from panels so that mid-input keystrokes don't trigger effects
    // that depend on the panel namespace (e.g. the status subscription).
    const [draftNamespace, setDraftNamespace] = createSignal<string | null>(null)
    createEffect(on(activePanelId, () => setDraftNamespace(null), { defer: true }))
    const displayedNamespace = () => draftNamespace() ?? activePanel()?.namespace ?? '/'

    // Editor Content State
    const [editorMode, setEditorMode] = createSignal<EditorMode>(
        (TOKEN || localStorage.getItem('rootToken')) ? EditorMode.EDIT : EditorMode.DEFAULT
    )

    // UI Layout State
    const [isFullscreen, setIsFullscreen] = createSignal<boolean>(false)
    const [exploreDepth, setExploreDepth] = createSignal(parseInt(localStorage.getItem('exploreDepth') || '1', 10))
    const PAGE_SIZE_STEPS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
    const snapPageSize = (v: number) => PAGE_SIZE_STEPS.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a)
    const [pageSize, setPageSize] = createSignal(snapPageSize(parseInt(localStorage.getItem('explorePageSize') || '100', 10)))
    const [trieWidth, setTrieWidth] = createSignal(300)
    const [isResizing, setIsResizing] = createSignal(false)
    const [consoleHeight, setConsoleHeight] = createSignal(120)
    const [isResizingConsole, setIsResizingConsole] = createSignal(false)
    const [rightHistoryHeight, setRightHistoryHeight] = createSignal(300)
    const [isResizingRightHistory, setIsResizingRightHistory] = createSignal(false)

    // Import State
    const [importSource, setImportSource] = createSignal<ImportSource>(ImportSource.FILE)
    const [importNamespace, setImportNamespace] = createSignal<string>('/')
    const [shareNamespace, setShareNamespace] = createSignal<string>('/')
    const [isImportModalOpen, setIsImportModalOpen] = createSignal(false)
    const [activeImportFile, setActiveImportFile] = createSignal<File>()
    const [importUrl, setImportUrl] = createSignal<string>('')
    const [importText, setImportText] = createSignal<string>('')
    const [importExamplePath, setImportExamplePath] = createSignal<string>('')
    const [isDraggingOver, setIsDraggingOver] = createSignal(false)
    const [manualImportFormat, setManualImportFormat] = createSignal<ImportFormat>()
    const [isTranslating, setIsTranslating] = createSignal(false)
    const [pendingOps, setPendingOps] = createSignal<{ id: string; label: string }[]>([])
    let pendingOpCounter = 0
    const [importCSVDirection, setImportCSVDirection] = createSignal<ImportCSVDirection>(ImportCSVDirection.CELL_LABELED)
    const [importCSVDelimiter, setImportCSVDelimiter] = createSignal<string>('\u002C')

    // Transform State
    const [transformConfigs, setTransformConfigs] = createSignal<SpaceConfig[]>([])

    // Namespace tree — fetched once from /namespaces/ and reused for all NamespaceSelector dropdowns
    const [namespaceTree, setNamespaceTree] = createSignal<any>(null)
    let namespaceFetchPromise: Promise<void> | null = null

    const invalidateNamespaceTree = () => {
        setNamespaceTree(null)
        namespaceFetchPromise = null
    }

    const ensureNamespaceTree = async () => {
        if (namespaceTree()) return
        if (!namespaceFetchPromise) {
            namespaceFetchPromise = (async () => {
                const t = token()
                if (!t) return
                try {
                    const res = await fetch(`${BACKEND_URL}/namespaces/`, {
                        headers: { Authorization: `Bearer ${t.code}` }
                    })
                    if (res.ok) setNamespaceTree(await res.json())
                } catch (e) {
                    console.error("Namespace tree fetch failed:", e)
                } finally {
                    if (!namespaceTree()) namespaceFetchPromise = null
                }
            })()
        }
        return namespaceFetchPromise
    }

    // Focus tokens for expandable paths — keyed by path, stores array of tokens per path
    const [focusTokens, setFocusTokens] = createSignal<Map<string, string[]>>(new Map())

    // Prefetch cache: stores the next page of tokens already fetched in background
    const [prefetchCache, setPrefetchCache] = createSignal<Map<string, string[][]>>(new Map())
    const [prefetchInProgress, setPrefetchInProgress] = createSignal<Set<string>>(new Set())

    // Sidebar collapse state
    const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false)

    // ── Own-history store ──────────────────────────────────────────────────
    const ownHistory = createOwnHistoryStore(() => token()?.code)
    const fetchSpaceLogs = () => ownHistory.fetch()

    const rollbackLog = async (id: number) => {
        if (!canWrite()) { notifyReadOnly(); return }
        try {
            await ownHistory.rollback(id, read)
        } catch {
            notify.error('Undo failed')
        }
    }

    const redoLog = async (id: number, force = false) => {
        if (!canWrite()) { notifyReadOnly(); return }
        try {
            const result = await ownHistory.redo(id, read, force)
            if (result.conflict) {
                const opIds = result.opIds.join(', ')
                setConfirmData({
                    title: 'Redo Conflict',
                    message: `This redo conflicts with newer operations (${opIds}). Redo anyway?`,
                    onConfirm: () => { confirmModal.close(); redoLog(id, true) },
                })
                confirmModal.showModal()
            }
        } catch {
            notify.error('Redo failed')
        }
    }

    const myUndoTargetId = () => ownHistory.state.undoTargetId
    const myRedoTargetId = () => ownHistory.state.redoTargetId
    const isUndoRedoInProgress = () => ownHistory.state.busy

    // WebSocket: set of space paths currently locked (import/transform in progress)
    const [lockedPaths, setLockedPaths] = createSignal<Set<string>>(new Set())
    const [spaceStatus, setSpaceStatus] = createSignal<StatusEvent | null>(null)
    const [online, setOnline] = createSignal(false)

    // Confirmation State
    const [confirmData, setConfirmData] = createSignal({
        title: '',
        message: '',
        onConfirm: () => { }
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

    // Sync modal state when dialog closes (ESC key, etc)
    createEffect(() => {
        if (importFileModal) {
            const handleClose = () => {
                setIsImportModalOpen(false)
            }
            importFileModal.addEventListener('close', handleClose)
            onCleanup(() => {
                importFileModal.removeEventListener('close', handleClose)
            })
        }
    })

    // Auto-open modal when file is dragged from outside or after file picker closes
    createEffect(on(activeImportFile, (file) => {
        if (file && !isImportModalOpen() && importFileModal && !importFileModal.open) {
            openImportModal(false) // Don't reset namespace on auto-reopen
        }
    }, { defer: true }))

    const { theme: currentTheme } = useTheme()

    const getDisplayContentWithPaginationIndicator = (astState: EditorASTState, namespace: string): string => {
        return getDisplayContent(astState)
    }

    // Shared lock: prevents both the editor and trie scroll handlers from loading simultaneously
    const [isLoadingMore, setIsLoadingMore] = createSignal(false);

    // Track loading state and last loaded tokens for each panel
    const [editorLoadingPaths, setEditorLoadingPaths] = createSignal<Set<string>>(new Set());
    const [editorLastLoadedTokens, setEditorLastLoadedTokens] = createSignal<Map<string, string>>(new Map());

    const myDisplayName = () => {
        const t = token()
        return t?.name ?? t?.description ?? `User ${t?.id ?? ''}`
    }

    // Per-panel presence WebSocket connections, keyed by panel ID.
    // The server emits EditorPresence{joined:true} on connect and joined:false
    // on any disconnect — including browser tab/window close.
    const presenceSockets = new Map<string, WebSocket>()

    const connectPresence = (panelId: string, namespace: string) => {
        const tok = token()
        if (!tok) return
        // Close any existing socket for this panel first
        presenceSockets.get(panelId)?.close()
        const seg = namespace.replace(/^\/|\/$/g, '')
        const url = `${WS_BASE}/ws/editor/${seg}?token_code=${encodeURIComponent(tok.code)}&session_id=${encodeURIComponent(SESSION_ID)}&display_name=${encodeURIComponent(myDisplayName())}`
        const ws = new WebSocket(url)
        presenceSockets.set(panelId, ws)
        ws.onclose = () => presenceSockets.delete(panelId)
    }

    const disconnectPresence = (panelId: string) => {
        presenceSockets.get(panelId)?.close()
        presenceSockets.delete(panelId)
    }

    const sendCursor = (panelId: string, line: number, col: number) => {
        const ws = presenceSockets.get(panelId)
        if (!ws || ws.readyState !== WebSocket.OPEN) return
        ws.send(JSON.stringify({ line, col }))
    }

    const saveActivePanel = () => {
        const p = activePanel()
        const view = p?.view
        const tok = token()
        if (!p || !view || !tok) return

        const content = view.state.doc.toString()
        const baseline = viewLastCommitted.get(view) ?? getOriginalContent(p.astState)
        const { added, removed } = computeAtomDiff(content, baseline)

        setPanelsWithUnsavedChanges(prev => { const next = new Set(prev); next.delete(p.id); return next })
        if (added.length === 0 && removed.length === 0) return

        viewLastCommitted.set(view, content)

        // Update the diff baseline so the editor gutter and trie explorer
        // no longer show the saved changes as additions/removals.
        const pidx = panels.findIndex(panel => panel.id === p.id)
        if (pidx !== -1) {
            setPanels(pidx, 'astState', 'originalAST', p.astState.ast)
            setPanels(pidx, 'astState', 'originalNodeMap', p.astState.nodeMap)
        }
        view.dispatch({ effects: setOriginalContentEffect.of(content) })

        const namespaceSeg = p.namespace.replace(/^\/|\/$/g, '')

        const trie = buildDiffPrefixTrie(added, removed)
        fetch(`${BACKEND_URL}/editor/diff/${namespaceSeg}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok.code}` },
            body: JSON.stringify({ ts: Date.now(), trie }),
        }).catch(() => {})

        fetch(`${BACKEND_URL}/editor/commit/${namespaceSeg}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok.code}` },
            body: JSON.stringify({ added, removed }),
        }).catch(() => {})
    }

    const discardActivePanel = () => {
        const p = activePanel()
        const view = p?.view
        if (!p || !view) return

        // Revert to the last committed content (or original loaded content if never saved)
        const revertTo = viewLastCommitted.get(view) ?? getOriginalContent(p.astState)
        const revertAST = parseMeTTaString(revertTo, 'manual')

        const pidx = panels.findIndex(panel => panel.id === p.id)
        if (pidx !== -1) {
            setPanels(pidx, 'astState', 'ast', revertAST)
            setPanels(pidx, 'astState', 'originalAST', revertAST)
        }
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: revertTo },
            annotations: [programmaticEdit.of(true)],
            effects: setOriginalContentEffect.of(revertTo),
        })
        viewLastCommitted.set(view, revertTo)
        setPanelsWithUnsavedChanges(prev => { const next = new Set(prev); next.delete(p.id); return next })
    }

    let unsavedChangesModal: HTMLDialogElement
    const [pendingAction, setPendingAction] = createSignal<(() => void) | null>(null)

    const guardUnsavedChanges = (action: () => void) => {
        if (!hasUnsavedChanges()) { action(); return }
        setPendingAction(() => action)
        unsavedChangesModal.showModal()
    }

    const createEditorState = (initialDoc: string, astState: EditorASTState) => {
        return EditorState.create({
            doc: initialDoc,
            extensions: [
                readOnlyCompartment.of(EditorState.readOnly.of(!canWrite())),
                EditorView.domEventHandlers({
                    keydown(e, view) {
                        if (view.state.readOnly && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
                            notifyReadOnly()
                        }
                    },
                    paste(e, view) {
                        if (view.state.readOnly) notifyReadOnly()
                    },
                }),
                themeCompartment.of(getEditorTheme(currentTheme() === 'dark')),
                remoteCursorsField,
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
                    {
                        key: 'Mod-z',
                        run: (view) => {
                            if (undoDepth(view.state) > 0) return false // let CM handle it
                            const id = myUndoTargetId()
                            if (id !== null) { rollbackLog(id); return true }
                            return false
                        },
                    },
                    {
                        key: 'Mod-Shift-z',
                        run: (view) => {
                            if (redoDepth(view.state) > 0) return false // let CM handle it
                            const id = myRedoTargetId()
                            if (id !== null) { redoLog(id); return true }
                            return false
                        },
                    },
                    ...completionKeymap,
                    ...lintKeymap,
                ]),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged && !update.transactions.some(t => t.annotation(programmaticEdit))) {
                        const content = update.state.doc.toString()
                        const newAST = parseMeTTaString(content, 'manual')
                        untrack(() => {
                            const pidx = panels.findIndex(p => p.id === activePanelId())
                            if (pidx !== -1) setPanels(pidx, 'astState', 'ast', newAST)
                        })
                        setPanelsWithUnsavedChanges(prev => new Set(prev).add(activePanelId()))
                    }
                }),
                // Broadcast cursor position to other clients on selection change
                EditorView.updateListener.of((() => {
                    let cursorTimer: number | undefined
                    return (update) => {
                        if (update.selectionSet && !update.transactions.some(t => t.annotation(programmaticEdit))) {
                            clearTimeout(cursorTimer)
                            const view = update.view
                            cursorTimer = window.setTimeout(() => {
                                const p = untrack(() => panels.find(panel => panel.view === view))
                                if (!p) return
                                const pos = view.state.selection.main.head
                                const lineInfo = view.state.doc.lineAt(pos)
                                sendCursor(p.id, lineInfo.number, pos - lineInfo.from)
                            }, 150)
                        }
                    }
                })()),
                // Attach directly to scrollDOM so scroll events are never missed.
                ViewPlugin.define((view) => {
                    let scrollCheckTimeout: number | undefined;
                    const handler = () => {
                        clearTimeout(scrollCheckTimeout);
                        scrollCheckTimeout = window.setTimeout(async () => {
                            const { scrollTop, scrollHeight, clientHeight } = view.scrollDOM;
                            if (scrollHeight - scrollTop - clientHeight < 200) {
                                const p = activePanel();
                                if (!p) return;
                                const rootPath = p.namespace.endsWith('/') ? p.namespace : p.namespace + '/';
                                const targetPath = findNextPaginatablePath(rootPath, focusTokens(), prefetchCache());
                                if (targetPath && !isLoadingMore() && !editorLoadingPaths().has(targetPath) && !prefetchInProgress().has(targetPath)) {
                                    setIsLoadingMore(true);
                                    setEditorLoadingPaths(prev => new Set(prev).add(targetPath));
                                    try {
                                        await handleLoadMore(targetPath);
                                        const newTokens = focusTokens().get(targetPath) || [];
                                        const newToken = newTokens[0] || '';
                                        setEditorLastLoadedTokens(prev => new Map(prev).set(targetPath, newToken));
                                    } catch (e) {
                                        console.error('Load more failed in editor:', e);
                                    } finally {
                                        setEditorLoadingPaths(prev => {
                                            const next = new Set(prev);
                                            next.delete(targetPath);
                                            return next;
                                        });
                                        setIsLoadingMore(false);
                                    }
                                }
                            }
                        }, 150);
                    };
                    view.scrollDOM.addEventListener('scroll', handler, { passive: true });
                    return { destroy() { view.scrollDOM.removeEventListener('scroll', handler); clearTimeout(scrollCheckTimeout); } };
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
        const activeId = activePanelId()
        const p = panels.find(item => item.id === activeId)
        if (p && p.view) {
            const originalContent = getOriginalContent(p.astState)
            p.view.dispatch({ effects: setOriginalContentEffect.of(originalContent) })
        }
    })

    createEffect(on(currentTheme, (theme) => {
        const isDark = theme === 'dark'
        panels.forEach(p => {
            if (p.view) {
                p.view.dispatch({ effects: themeCompartment.reconfigure(getEditorTheme(isDark)) })
            }
        })
    }, { defer: true }))

    createEffect(on(canWrite, (writable) => {
        panels.forEach(p => {
            if (p.view) {
                p.view.dispatch({ effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(!writable)) })
            }
        })
    }, { defer: true }))

    // Handle swapping views when active panel changes
    createEffect(on(activePanelId, (id) => {
        if (mettaInput) {
            mettaInput.innerHTML = ''
            if (!id) return;
            const p = untrack(() => panels.find(item => item.id === id))
            if (p) {
                if (!p.view) {
                    const displayContent = getDisplayContentWithPaginationIndicator(p.astState, p.namespace)
                    const view = new EditorView({
                        state: createEditorState(displayContent, p.astState),
                        parent: mettaInput
                    })
                    const pidx = panels.findIndex(item => item.id === p.id)
                    if (pidx !== -1) setPanels(pidx, 'view', view)
                } else {
                    mettaInput.appendChild(p.view.dom)
                }
            }
        }
    }))


    // Connect the events WebSocket once we have a token, and subscribe to space events
    createEffect(() => {
        const t = token()
        if (!t) return
        invalidateNamespaceTree()
        wsService.connectEvents(t.code)
        wsService.connectWatch(t.code)

        const unsubWatch = wsService.onExprChanged((event) => {
            for (const panel of panels) {
                if (panel.namespace !== event.namespace || !panel.view) continue
                const view = panel.view
                const doc = view.state.doc
                const changes: Array<{ from: number; to: number; insert?: string }> = []
                const removalPositions: Array<{ lineIndex: number; from: number; to: number }> = []

                for (let i = 1; i <= doc.lines; i++) {
                    const line = doc.line(i)
                    if (line.text.trim() === event.old) {
                        removalPositions.push({ lineIndex: i, from: line.from, to: line.to })
                        break
                    }
                }
                removalPositions.sort((a, b) => a.from - b.from)

                if (event.added.length > 0 && removalPositions.length > 0) {
                    const first = removalPositions[0]
                    changes.push({ from: first.from, to: first.to, insert: event.added.join('\n') })
                    for (const { lineIndex, from, to } of removalPositions.slice(1)) {
                        changes.push(lineIndex < doc.lines ? { from, to: to + 1 } : { from: from - 1, to })
                    }
                } else {
                    for (const { lineIndex, from, to } of removalPositions) {
                        if (lineIndex < doc.lines) changes.push({ from, to: to + 1 })
                        else if (doc.lines > 1) changes.push({ from: from - 1, to })
                        else changes.push({ from, to })
                    }
                }

                if (changes.length > 0) {
                    changes.sort((a, b) => a.from - b.from)
                    const newContent = view.state.update({ changes }).state.doc.toString()
                    view.dispatch({
                        changes,
                        annotations: programmaticEdit.of(true),
                        effects: setOriginalContentEffect.of(newContent),
                    })
                    viewLastSent.set(view, newContent)
                    viewLastCommitted.set(view, newContent)

                    // Update AST so the TrieExplorer reflects the change
                    const newAST = parseMeTTaString(newContent, 'manual')
                    untrack(() => {
                        const pidx = panels.findIndex(p => p.id === panel.id)
                        if (pidx !== -1) {
                            setPanels(pidx, 'astState', 'ast', newAST)
                            setPanels(pidx, 'astState', 'originalAST', [...newAST])
                        }
                    })
                }

                // Mirror the server's subscription state so syncWatchSubscriptions
                // doesn't re-send redundant subscribe/unsubscribe messages.
                const prevWatched = watchedExprs.get(event.namespace)
                if (prevWatched) {
                    prevWatched.delete(event.old)
                    for (const a of event.added) prevWatched.add(a)
                }
            }
        })

        const unsub = wsService.onSpaceEvent((event) => {
            setLockedPaths((prev: Set<string>) => {
                if (event.type !== 'locked' && event.type !== 'unlocked') return prev
                const next = new Set<string>(prev)
                if (event.type === 'locked') next.add(event.path)
                else next.delete(event.path)
                return next
            })
            if (
                event.type === 'importComplete' ||
                event.type === 'clearComplete'
            ) {
                invalidateNamespaceTree()
                const activeNs = activePanelNamespace()
                if (activeNs && event.path === activeNs) {
                    read()
                }
            }
            if (event.type === 'transformComplete') {
                invalidateNamespaceTree()
                read()
            }
            if (event.type === 'editorPresence') {
                if (event.session_id === SESSION_ID) return
                if (event.joined) {
                    setRemoteEditors(prev => {
                        const next = new Map(prev)
                        const existing = next.get(event.session_id)
                        next.set(event.session_id, {
                            displayName: event.display_name,
                            path: event.path,
                            line: existing?.line,
                            col: existing?.col,
                            lastSeen: Date.now(),
                        })
                        return next
                    })
                } else {
                    setRemoteEditors(prev => {
                        const next = new Map(prev)
                        next.delete(event.session_id)
                        return next
                    })
                    // Clear this user's cursor from matching panels
                    for (const panel of panels) {
                        if (panel.namespace !== event.path || !panel.view) continue
                        const cursors: RemoteCursorInfo[] = []
                        for (const [sessionId, editor] of remoteEditors()) {
                            if (editor.path !== event.path || editor.line === undefined || editor.col === undefined) continue
                            cursors.push({ sessionId, displayName: editor.displayName, line: editor.line, col: editor.col })
                        }
                        panel.view.dispatch({ effects: setRemoteCursorsEffect.of(cursors) })
                    }
                }
            }
            if (event.type === 'editorCursor') {
                if (event.session_id === SESSION_ID) return
                setRemoteEditors(prev => {
                    const next = new Map(prev)
                    const existing = next.get(event.session_id)
                    next.set(event.session_id, {
                        displayName: event.display_name,
                        path: event.path,
                        line: event.line,
                        col: event.col,
                        lastSeen: Date.now(),
                    })
                    return next.size !== prev.size || existing?.line !== event.line || existing?.col !== event.col ? next : prev
                })
                // Update cursor decorations in matching panel views
                for (const panel of panels) {
                    if (panel.namespace !== event.path || !panel.view) continue
                    const cursors: RemoteCursorInfo[] = []
                    for (const [sessionId, editor] of remoteEditors()) {
                        const line = sessionId === event.session_id ? event.line : editor.line
                        const col = sessionId === event.session_id ? event.col : editor.col
                        if (editor.path !== event.path || line === undefined || col === undefined) continue
                        cursors.push({ sessionId, displayName: sessionId === event.session_id ? event.display_name : editor.displayName, line, col })
                    }
                    panel.view.dispatch({ effects: setRemoteCursorsEffect.of(cursors) })
                }
            }
        })
        onCleanup(() => {
            for (const p of panels) disconnectPresence(p.id)
            unsub()
            unsubWatch()
            wsService.disconnectEvents()
            wsService.disconnectWatch()
        })
    })

    // Auto-sync watch subscriptions whenever any panel's display content changes
    createEffect(() => {
        for (const p of panels) {
            const content = getDisplayContent(p.astState)
            syncWatchSubscriptions(p.namespace, content)
        }
    })

    // Subscribe to MORK status stream for the active panel's namespace
    const activePanelNamespace = createMemo(() => activePanel()?.namespace)

    // Remote editors in the active panel's namespace or any of its subspaces (excluding self).
    const activeRemoteEditors = createMemo(() => {
        const ns = activePanelNamespace()
        if (!ns) return []
        // SESSION_ID is already excluded at event-receive time, so all entries here are remote
        return [...remoteEditors().entries()]
            .filter(([, e]) => e.path === ns || e.path.startsWith(ns))
            .map(([id, e]) => {
                // Relative subpath within the active namespace, e.g. "b/c" for "/a/b/c/" when ns="/a/".
                // For exact same-namespace users fall back to the namespace's own last segment so
                // there is always a visible label next to the avatar.
                const sub = e.path === ns ? '' : e.path.slice(ns.length).replace(/\/$/, '')
                const relativePath = sub || e.path.replace(/^\/|\/$/g, '').split('/').filter(Boolean).pop() || ''
                return { id, relativePath, ...e }
            })
    })
    createEffect(() => {
        const t = token()
        const ns = activePanelNamespace()
        if (!t || !ns) { setSpaceStatus(null); return }
        setSpaceStatus(null)
        const unsub = wsService.subscribeStatus(ns, t.code, (event) => setSpaceStatus(event))
        onCleanup(unsub)
    })

    // Fetch logs when active panel changes
    createEffect(on(activePanelNamespace, (ns) => {
        if (ns) fetchSpaceLogs()
    }, { defer: true }))

    let isMounted = false
    onMount(() => {
        if (isMounted) return
        isMounted = true

        wsService.connectPing()
        const unsubOnline = wsService.onOnlineChange(setOnline)

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault()
                if (canWrite()) saveActivePanel()
                else notifyReadOnly()
            }
        }
        document.addEventListener('keydown', handleKeyDown)

        onCleanup(() => {
            unsubOnline()
            document.removeEventListener('keydown', handleKeyDown)
        })

        const setupModalBackdrop = (modal: HTMLDialogElement) => {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    modal.close()
                }
            })
        }

        setupModalBackdrop(importFileModal)
        setupModalBackdrop(loadSpaceModal)
        setupModalBackdrop(selectSpaceModal)
        setupModalBackdrop(transformModal)
        setupModalBackdrop(confirmModal)
        setupModalBackdrop(clearModal)
        setupModalBackdrop(copyModal)
        setupModalBackdrop(shareTokenModal)
        setupModalBackdrop(unsavedChangesModal)

        const effectiveToken = TOKEN || localStorage.getItem('rootToken');
        console.log("Token check:", { VITE_TOKEN: TOKEN, localStorage: localStorage.getItem('rootToken') });

        if (effectiveToken) {
            setEditorMode(EditorMode.EDIT);
            loadSpace(effectiveToken, true).then(() => {
                const nsParam = searchParams.ns
                if (nsParam) {
                    addPanel(nsParam)
                    setSearchParams({ ns: undefined })
                }
            });
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

    const openImportModal = (resetNamespace = true) => {
        // Only reset namespace if explicitly requested (user-initiated open, not auto-reopen)
        if (resetNamespace) {
            setImportNamespace(activePanel()?.namespace || '/')
        }
        setIsImportModalOpen(true)
        importFileModal.showModal()
    }

    const handleTrieCollapse = (path: string) => {
        const p = activePanel()
        if (!p?.view) return
        const activeNs = p.namespace.endsWith('/') ? p.namespace : p.namespace + '/'
        if (!path.startsWith(activeNs)) return
        const relPath = path.slice(activeNs.length).replace(/\/$/, '')

        const astState = unwrap(p.astState) as EditorASTState

        // If this path was expanded (fringe expand), unexpand it instead of folding
        if (astState.expandedPaths.has(relPath)) {
            unexpandFringe(astState.ast, astState.nodeMap, relPath)
            unexpandFringe(astState.originalAST, astState.originalNodeMap, relPath)
            astState.expandedPaths.delete(relPath)
            for (const p of [...astState.expandedPaths]) {
                if (p.startsWith(relPath + '/')) astState.expandedPaths.delete(p)
            }

            // Re-render
            const displayContent = getDisplayContentWithPaginationIndicator(astState, p.namespace)
            const originalContent = getOriginalContent(astState)
            const pidx = panels.findIndex(item => item.id === p.id)
            if (pidx !== -1) {
                setPanels(pidx, 'astState', 'ast', [...astState.ast])
                setPanels(pidx, 'astState', 'originalAST', [...astState.originalAST])
            }
            p.view.dispatch(p.view.state.update({
                changes: { from: 0, to: p.view.state.doc.length, insert: displayContent },
                annotations: [programmaticEdit.of(true)],
                effects: setOriginalContentEffect.of(originalContent),
            }))

            // Reset pagination so re-expanding starts from page 1
            const pathWithSlash = path.endsWith('/') ? path : path + '/'
            setFocusTokens(prev => {
                const m = new Map(prev)
                for (const key of m.keys()) {
                    if (key === pathWithSlash || key.startsWith(pathWithSlash)) m.delete(key)
                }
                return m
            })
            setPrefetchCache(prev => {
                const m = new Map(prev)
                for (const key of m.keys()) {
                    if (key === pathWithSlash || key.startsWith(pathWithSlash)) m.delete(key)
                }
                return m
            })

            return
        }
    }

    const handleTrieExpand = async (path: string) => {
        const p = activePanel()
        if (!p?.view) return
        const activeNs = p.namespace.endsWith('/') ? p.namespace : p.namespace + '/'
        if (!path.startsWith(activeNs)) return
        const relPath = path.slice(activeNs.length).replace(/\/$/, '')

        if (!hasFringeDescendant(p.astState.ast, relPath)) return

        try {
            // Look up all focus tokens for this path
            const pathWithSlash = path.endsWith('/') ? path : path + '/'
            const pathFocusTokens = focusTokens().get(pathWithSlash) || []

            // Fetch results for all focus tokens and combine them
            let allTokens: string[][] = []
            let allInlineExpandedPaths: string[] = []
            if (pathFocusTokens.length === 0) {
                // No focus tokens, make a single request without token
                const { tokens, inlineExpandedPaths } = await loadFringeAsTokens(path, undefined, activeNs)
                allTokens = tokens
                allInlineExpandedPaths = inlineExpandedPaths
            } else {
                // Make one request per focus token and combine results
                for (const focusToken of pathFocusTokens) {
                    const { tokens, inlineExpandedPaths } = await loadFringeAsTokens(path, focusToken, activeNs)
                    allTokens = allTokens.concat(tokens)
                    for (const p of inlineExpandedPaths) {
                        if (!allInlineExpandedPaths.includes(p)) allInlineExpandedPaths.push(p)
                    }
                }
            }

            const tokens = allTokens

            // Merge tokens into AST
            const astState = unwrap(p.astState) as EditorASTState
            const pathKey = relPath.split('/').filter(Boolean).join('/')

            // Strip namespace prefix from tokens before merging
            const strippedTokens = stripNamespacePrefix(tokens, activeNs)

            // Find and update the fringe node in the AST (and originalAST to avoid diff)
            mergeTokensIntoAST(astState.ast, astState.nodeMap, pathKey, strippedTokens)
            mergeTokensIntoAST(astState.originalAST, astState.originalNodeMap, pathKey, strippedTokens)
            astState.expandedPaths.add(pathKey)
            for (const childPath of allInlineExpandedPaths) {
                astState.expandedPaths.add(childPath)
            }

            // Re-render
            const displayContent = getDisplayContentWithPaginationIndicator(astState, p.namespace)
            const originalContent = getOriginalContent(astState)
            const pidx = panels.findIndex(item => item.id === p.id)
            if (pidx !== -1) {
                setPanels(pidx, 'astState', 'ast', [...astState.ast])
                setPanels(pidx, 'astState', 'originalAST', [...astState.originalAST])
            }
            p.view.dispatch(p.view.state.update({
                changes: { from: 0, to: p.view.state.doc.length, insert: displayContent },
                annotations: [programmaticEdit.of(true)],
                effects: setOriginalContentEffect.of(originalContent),
            }))

        } catch (e) {
            console.error("Expand exploration failed:", e)
        }
    }

    const handleLoadMore = async (path: string) => {
        const p = activePanel()
        if (!p?.view) return

        try {
            const pathWithSlash = path.endsWith('/') ? path : path + '/'
            const activeNs = p.namespace.endsWith('/') ? p.namespace : p.namespace + '/'

            let newTokens: string[][]

            const cached = prefetchCache().get(pathWithSlash)
            if (cached !== undefined) {
                // Serve pre-fetched page immediately
                setPrefetchCache(prev => { const m = new Map(prev); m.delete(pathWithSlash); return m })
                newTokens = cached
            } else {
                const pathFocusTokens = focusTokens().get(pathWithSlash) || []
                if (pathFocusTokens.length === 0) {
                    notify.info('No more expressions to load')
                    return
                }
                ; ({ tokens: newTokens } = await loadFringeAsTokens(path, pathFocusTokens[0], activeNs))
            }

            // Append new expressions to the AST
            const currentAST = unwrap(p.astState.ast) as EditorASTState['ast']
            const strippedTokens = stripNamespacePrefix(newTokens, activeNs)

            // Build new nodes from tokens
            const { ast: newNodes } = buildASTFromTokens(strippedTokens)
            const newText = astToString(newNodes)

            // Determine the root key of the newly loaded nodes
            const firstKey = newNodes.length > 0 && newNodes[0].type === 'expr'
                ? (newNodes[0] as ExprNode).key
                : null

            // Insert into AST after the last node with the same root key, or at end
            let astInsertIdx = currentAST.length
            if (firstKey) {
                for (let i = currentAST.length - 1; i >= 0; i--) {
                    const n = currentAST[i]
                    if (n.type === 'expr' && (n as ExprNode).key === firstKey) {
                        astInsertIdx = i + 1
                        break
                    }
                }
            }

            // Build new arrays (new references trigger SolidJS reactivity)
            const newAST = [...currentAST]
            newAST.splice(astInsertIdx, 0, ...newNodes)
            const newOriginalAST = [...(unwrap(p.astState.originalAST) as EditorASTState['ast'])]
            newOriginalAST.splice(astInsertIdx, 0, ...newNodes)

            // Find insertion point in editor: after the last line that belongs to this key
            const doc = p.view.state.doc
            let insertPos = doc.length
            if (firstKey) {
                const linePrefix = `(${firstKey} `
                const exactMatch = `(${firstKey})`
                for (let i = doc.lines; i >= 1; i--) {
                    const lineText = doc.line(i).text
                    if (lineText.startsWith(linePrefix) || lineText === exactMatch) {
                        insertPos = doc.line(i).to
                        break
                    }
                }
            }

            const pidxLm = panels.findIndex(item => item.id === p.id)
            if (pidxLm !== -1) {
                setPanels(pidxLm, 'astState', 'ast', newAST)
                setPanels(pidxLm, 'astState', 'originalAST', newOriginalAST)
            }

            const insertText = insertPos > 0 ? '\n' + newText : newText
            const docStr = doc.toString()
            const newContent = docStr.slice(0, insertPos) + insertText + docStr.slice(insertPos)

            p.view.dispatch(p.view.state.update({
                changes: { from: insertPos, insert: insertText },
                annotations: [programmaticEdit.of(true)],
                // Update the diff baseline so newly loaded atoms aren't shown as additions
                effects: setOriginalContentEffect.of(newContent),
            }))

            // Advance the commit baseline so newly loaded atoms aren't saved as a diff
            viewLastCommitted.set(p.view, newContent)

            // Kick off background pre-fetch of the next page
            prefetchNextPage(path)

        } catch (e) {
            console.error("Load more failed:", e)
            notify.error('Failed to load more expressions')
        }
    }

    const handleTrieNodeClick = (expression: string) => {
        const p = activePanel()
        if (!p?.view) return

        const view = p.view
        const doc = view.state.doc
        const text = doc.toString()

        // Normalize whitespace for searching - replace multiple spaces/newlines with single space
        const normalizeWS = (s: string) => s.replace(/\s+/g, ' ')
        const normalizedExpr = normalizeWS(expression)
        const normalizedText = normalizeWS(text)

        // Search for the expression in the normalized document
        const normalizedIndex = normalizedText.indexOf(normalizedExpr)
        if (normalizedIndex === -1) {
            console.log('Expression not found:', expression)
            console.log('Looking for:', normalizedExpr)
            notify.info(`Expression not found: ${expression}`)
            return
        }

        // Map back to original text position by counting actual characters
        let actualIndex = 0
        let normalizedCount = 0
        while (normalizedCount < normalizedIndex && actualIndex < text.length) {
            if (!/\s/.test(text[actualIndex]) || normalizedText[normalizedCount] === ' ') {
                normalizedCount++
            }
            actualIndex++
        }

        // Calculate approximate length in original text
        const from = actualIndex
        const to = Math.min(actualIndex + expression.length * 2, text.length) // *2 to account for extra whitespace

        // Focus the editor first to ensure it's active
        view.focus()

        // Use requestAnimationFrame to ensure focus is applied before dispatch
        requestAnimationFrame(() => {
            // Scroll to and select the expression
            view.dispatch({
                selection: { anchor: from, head: to },
                scrollIntoView: true,
                effects: []
            })

            // Focus again after dispatch to ensure it sticks
            view.focus()
        })
    }

    const getParserParameters = (): any => {
        const format = activeImportFileFormat()
        if (format === ImportFormat.CSV) {
            return { direction: importCSVDirection(), delimiter: importCSVDelimiter() }
        }
        return {}
    }

    const translateToMetta = async (): Promise<void> => {
        const format = activeImportFileFormat()
        if (!format) return

        // Capture all modal state before closing
        const targetNs = importNamespace()
        const encodedPath = targetNs.replace(/^\//, '').split('/').filter(Boolean).map(encodeURIComponent).join('/')
        const src = importSource()
        const file = activeImportFile()
        const url = importUrl().trim()
        const text = importText().trim()
        const exPath = importExamplePath()
        const parserParams = getParserParameters()

        // Close modal immediately and reset form state
        setIsImportModalOpen(false)
        importFileModal.close()
        setActiveImportFile(undefined)
        setImportUrl('')
        setImportText('')
        setImportExamplePath('')
        setManualImportFormat(undefined)

        // Track this operation in the in-progress panel
        const opId = String(++pendingOpCounter)
        setPendingOps(prev => [...prev, { id: opId, label: `${format === ImportFormat.METTA ? 'Import' : 'Translate & Import'} → ${targetNs}` }])

        try {
            if (src === ImportSource.FILE) {
                if (!file) throw new Error('No file selected')

                if (format === ImportFormat.METTA) {
                    const fileText = await file.text()
                    const resp = await fetch(`${BACKEND_URL}/spaces/${encodedPath}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()?.code ?? ''}` },
                        body: fileText,
                    })
                    if (!resp.ok) {
                        const body = await resp.json().catch(() => ({}))
                        throw new Error(`Status ${resp.status} ${body?.error ?? ''}`)
                    }
                } else {
                    const parameters = new URLSearchParams(parserParams as any)
                    const resp = await fetch(`${BACKEND_URL}/spaces/import/${format}/${encodedPath}?${parameters.toString()}`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token()?.code ?? ''}` },
                        body: file,
                    })
                    if (!resp.ok) {
                        const body = await resp.json().catch(() => ({}))
                        throw new Error(`Status ${resp.status} ${body?.error ?? ''}`)
                    }
                }

            } else if (src === ImportSource.URL) {
                if (!url) throw new Error('No URL provided')

                if (format === ImportFormat.METTA) {
                    const resp = await fetch(`${BACKEND_URL}/spaces/import/url/metta/${encodedPath}?url=${encodeURIComponent(url)}`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token()?.code ?? ''}` },
                    })
                    if (!resp.ok) throw new Error(`Status ${resp.status}`)
                } else {
                    const parameters = new URLSearchParams({ ...parserParams as any, url })
                    const resp = await fetch(`${BACKEND_URL}/spaces/import/url/${format}/${encodedPath}?${parameters.toString()}`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token()?.code ?? ''}` },
                    })
                    if (!resp.ok) throw new Error(`Status ${resp.status}`)
                }

            } else if (src === ImportSource.TEXT) {
                if (!text) throw new Error('No text provided')

                if (format === ImportFormat.METTA) {
                    const resp = await fetch(`${BACKEND_URL}/spaces/${encodedPath}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()?.code ?? ''}` },
                        body: text,
                    })
                    if (!resp.ok) throw new Error(`Status ${resp.status}`)
                } else {
                    const parameters = new URLSearchParams(parserParams as any)
                    const resp = await fetch(`${BACKEND_URL}/spaces/import/${format}/${encodedPath}?${parameters.toString()}`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token()?.code ?? ''}` },
                        body: text,
                    })
                    if (!resp.ok) throw new Error(`Status ${resp.status}`)
                }
            } else if (src === ImportSource.EXAMPLES) {
                if (!exPath) throw new Error('No example selected')
                const rawUrl = `https://raw.githubusercontent.com/trueagi-io/metta-examples/main/${exPath}`
                const resp = await fetch(`${BACKEND_URL}/spaces/import/url/metta/${encodedPath}?url=${encodeURIComponent(rawUrl)}`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token()?.code ?? ''}` },
                })
                if (!resp.ok) throw new Error(`Status ${resp.status}`)
            }

            await read()
            if (targetNs !== activePanel()?.namespace) {
                await addPanel(targetNs)
            }

            notify.success(format === ImportFormat.METTA ? 'Successfully imported to space' : 'Successfully translated and imported to space')
            fetchSpaceLogs()
            setEditorMode(EditorMode.EDIT)
        } catch (e) {
            console.error(e)
            const msg = e instanceof Error ? e.message : ''
            if (msg.includes('too_large') || msg.includes('413')) {
                notify.error('File is too large — the server rejected the upload.')
            } else {
                notify.error(`Failed to ${format === ImportFormat.METTA ? 'import' : 'translate and import'} (Backend error or invalid format).`)
            }
        } finally {
            setPendingOps(prev => prev.filter(op => op.id !== opId))
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
            const resp = await fetch(`${BACKEND_URL}/tokens/me`, {
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenStr}` },
            })
            const self: Token = await resp.json()
            if (self) {
                setToken(self)
                setRootTokenCode(tokenStr)
                localStorage.setItem('rootToken', tokenStr)
                await addPanel(self.namespace)
                setEditorMode(EditorMode.EDIT)
            } else if (!silent) notify.error(`Failed to load space`)
        } catch (e) {
            console.error(e)
            if (!silent) notify.error(`Failed to load space using token ${tokenStr}`)
        }
    }

    const loadFringeAsTokens = async (path: string, focusToken?: string, tabNamespace?: string): Promise<{ tokens: string[][], inlineExpandedPaths: string[] }> => {
        let ns = path
        if (ns.startsWith('/')) ns = ns.substring(1)
        const encodedNs = ns.split('/').map(encodeURIComponent).join('/')

        // Parts of the tab's namespace (what the editor content is relative to)
        const tabNsParts = (tabNamespace ?? path)
            .replace(/^\/|\/$/g, '')
            .split('/')
            .filter(p => p.length > 0)
        // Parts of the current explore path that go beyond the tab namespace
        const nsParts = ns.replace(/\/$/, '').split('/').filter(p => p.length > 0)
        const relParts = nsParts.slice(tabNsParts.length)

        try {
            const tokenParam = encodeURIComponent(focusToken || '')
            const url = `${BACKEND_URL}/explore/${encodedNs}?focus_token=${tokenParam}&depth=${exploreDepth()}&page_size=${pageSize()}`

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token()?.code ?? ''}` }
            })
            if (!res.ok) throw new Error(`Status ${res.status}`)
            const data = await res.json()

            const newTokens = new Map(focusTokens())
            const result: string[][] = []
            const inlineExpandedPaths = new Set<string>()

            // Normalize a raw path value from the API (PathBuf → string, strip slashes/backslashes)
            const normPath = (p: any): string =>
                String(p).replace(/\\/g, '/').replace(/^\/|\/$/g, '')

            // Convert a normalized subspace path (relative to root) to a nested s-expr
            // relative to the tab namespace.
            // e.g. tabNs="home/tim", subspacePath="home/tim/projects/sub" → "(projects (sub |$|))"
            const subspaceToRelSexpr = (subNorm: string): string => {
                const parts = subNorm.split('/').filter(p => p.length > 0).slice(tabNsParts.length)
                if (parts.length === 0) return '|$|'
                let sexpr = '|$|'
                for (let i = parts.length - 1; i >= 0; i--) sexpr = `(${parts[i]} ${sexpr})`
                return sexpr
            }

            // Recursively collect tokens from an ExploreResult node.
            // nodeRelParts: path components of this node beyond the tab namespace.
            // Interior-node subspaces (those with a matching child) are expanded inline;
            // leaf-node subspaces (no child) are emitted as subspace markers.
            const collectFromNode = (node: any, nodeRelParts: string[]) => {
                // Map normalized child namespace → child ExploreResult
                const childByPath = new Map<string, any>()
                for (const child of node.children || []) {
                    childByPath.set(normPath(child.namespace), child)
                }

                // Store pagination token for this node
                if (node.focus_token) {
                    const absPath = [...tabNsParts, ...nodeRelParts].join('/')
                    newTokens.set((absPath ? '/' + absPath : '') + '/', [node.focus_token])
                } else {
                    const absPath = [...tabNsParts, ...nodeRelParts].join('/')
                    newTokens.delete((absPath ? '/' + absPath : '') + '/')
                }

                for (const [_, rawSubPath] of node.subspaces || []) {
                    if (!rawSubPath) continue
                    const subNorm = normPath(rawSubPath)
                    const child = childByPath.get(subNorm)

                    if (child) {
                        // Interior node: already fully expanded in children — recurse, no marker
                        const childRelParts = subNorm.split('/').filter(p => p.length > 0).slice(tabNsParts.length)
                        inlineExpandedPaths.add(childRelParts.join('/'))
                        collectFromNode(child, childRelParts)
                    } else {
                        // Leaf node: emit subspace marker and store focus token placeholder
                        const key = '/' + subNorm + '/'
                        if (!newTokens.has(key)) newTokens.set(key, [])
                        result.push(["!", subspaceToRelSexpr(subNorm), nodeRelParts.join('/')])
                    }
                }

                // Wrap an expression with this node's path relative to the tab namespace
                const wrap = (expr: string): string => {
                    if (nodeRelParts.length === 0) return expr
                    let w = expr
                    for (let i = nodeRelParts.length - 1; i >= 0; i--) w = `(${nodeRelParts[i]} ${w})`
                    return w
                }

                const ownerPath = nodeRelParts.join('/')
                for (const expr of (node.metta_expressions || [])) {
                    if (expr) result.push(["!", wrap(expr), ownerPath])
                }
            }

            collectFromNode(data, relParts)
            setFocusTokens(newTokens)
            return { tokens: result, inlineExpandedPaths: [...inlineExpandedPaths] }
        } catch (e) {
            console.error("Explore API failed:", e)
            throw e
        }
    }

    // Prefetch the next page for `path` in the background and store it in prefetchCache.
    // Uses the current focus token from focusTokens (which is advanced as a side-effect),
    // so by the time handleLoadMore runs, focusTokens already points to the page after
    // the cached one — and the cached page is served immediately without a network round-trip.
    const prefetchNextPage = async (path: string) => {
        const pathWithSlash = path.endsWith('/') ? path : path + '/'
        if (prefetchInProgress().has(pathWithSlash)) return
        const cursor = focusTokens().get(pathWithSlash)?.[0]
        if (!cursor) return  // nothing more to load
        const p = activePanel()
        if (!p) return
        const tabNs = p.namespace.endsWith('/') ? p.namespace : p.namespace + '/'
        setPrefetchInProgress(prev => new Set(prev).add(pathWithSlash))
        try {
            const { tokens } = await loadFringeAsTokens(path, cursor, tabNs)
            setPrefetchCache(prev => new Map(prev).set(pathWithSlash, tokens))
        } catch (e) {
            console.error('Prefetch failed:', e)
        } finally {
            setPrefetchInProgress(prev => { const s = new Set(prev); s.delete(pathWithSlash); return s })
        }
    }

    const fetchNamespaceInfo = async (ns: string): Promise<{ token: string, subnamespaces: any[] }> => {
        let namespace = ns
        if (namespace.startsWith('/')) namespace = namespace.substring(1)
        if (namespace.endsWith('/')) namespace = namespace.slice(0, -1)
        const encodedNs = namespace.split('/').map(encodeURIComponent).join('/')

        try {
            const res = await fetch(`${BACKEND_URL}/namespaces/${encodedNs}`, {
                headers: { Authorization: `Bearer ${token()?.code ?? ''}` }
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
        const existing = panels.find(p => p.namespace === ns)
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
            const { tokens: fringeTokens, inlineExpandedPaths } = await loadFringeAsTokens(ns, namespaceInfo.token, ns)
            const astState = createASTStateFromTokens(fringeTokens, ns)
            for (const p of inlineExpandedPaths) astState.expandedPaths.add(p)

            const newPanel: EditorPanel = {
                id,
                namespace: ns,
                astState,
            }

            batch(() => {
                setPanels(panels.length, newPanel)
                setActivePanelId(id)
                setEditorMode(EditorMode.EDIT)
            })

            connectPresence(id, ns)

            // Pre-fetch the second page in the background
            prefetchNextPage(ns)

        } catch (e) {
            console.error(e)
            notify.error(`Failed to load space '${ns}'`)
        }
    }

    const closePanel = (id: string, e: MouseEvent) => {
        e.stopPropagation()
        if (panels.length <= 1) return
        const panelToClose = panels.find(p => p.id === id)
        if (panelToClose) disconnectPresence(panelToClose.id)
        if (panelToClose?.view) {
            panelToClose.view.destroy()
        }

        const remaining = panels.filter(p => p.id !== id)
        setPanels(reconcile(remaining))

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
        const encodedPath = path.replace(/^\//, '').split('/').filter(Boolean).map(encodeURIComponent).join('/')

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
            title: 'Update Space',
            message: `Are you sure you want to save ${lineCount} new line(s) to space '${path}'?`,
            onConfirm: async () => {
                try {
                    const resp = await fetch(`${BACKEND_URL}/spaces/${encodedPath}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()?.code ?? ''}` },
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
                        const pidxW = panels.findIndex(item => item.id === p.id)
                        if (pidxW !== -1) setPanels(pidxW, 'astState', 'originalAST', updatedAST)
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
        // Clear all stale pagination state for this path and its descendants on a fresh load
        const pathWithSlash = path.endsWith('/') ? path : path + '/'
        setFocusTokens(prev => {
            const m = new Map(prev)
            for (const key of m.keys()) {
                if (key === pathWithSlash || key.startsWith(pathWithSlash)) m.delete(key)
            }
            return m
        })
        setPrefetchCache(prev => {
            const m = new Map(prev)
            for (const key of m.keys()) {
                if (key === pathWithSlash || key.startsWith(pathWithSlash)) m.delete(key)
            }
            return m
        })
        try {
            // First fetch namespace info to get focus tokens
            const namespaceInfo = await fetchNamespaceInfo(path)

            // Store focus tokens for subnamespaces (start from the now-cleaned map)
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
            const { tokens, inlineExpandedPaths } = await loadFringeAsTokens(path, namespaceInfo.token, path)

            if (p && !ns) {
                // Update current panel
                const astState = createASTStateFromTokens(tokens, path)
                for (const ep of inlineExpandedPaths) astState.expandedPaths.add(ep)
                const displayContent = getDisplayContentWithPaginationIndicator(astState, path)
                const pidxR = panels.findIndex(item => item.id === p.id)
                if (pidxR !== -1) setPanels(pidxR, 'astState', astState as any)
                p.view?.dispatch(p.view.state.update({ changes: { from: 0, to: p.view.state.doc.length, insert: displayContent }, annotations: [programmaticEdit.of(true)] }))
                // Pre-fetch the second page in the background
                prefetchNextPage(path)
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

        // Close modal immediately
        transformModal.close()

        // Track this operation in the in-progress panel
        const opId = String(++pendingOpCounter)
        const outputLabel = output_spaces.length > 0 ? `/${output_spaces[0]}${output_spaces.length > 1 ? ` +${output_spaces.length - 1}` : ''}` : ''
        setPendingOps(prev => [...prev, { id: opId, label: `Transform → ${outputLabel}` }])

        try {
            const resp = await fetch(`${BACKEND_URL}/spaces`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()?.code ?? ''}` },
                body: JSON.stringify({ input_spaces, output_spaces, patterns, templates }),
            })
            if (resp.ok) {
                notify.success('Transformation successfully dispatched')
                fetchSpaceLogs()
            } else {
                notify.error(`Transformation failed (Status: ${resp.status})`)
            }
        } catch (e) {
            console.error(e)
            notify.error('Error during transformation')
        } finally {
            setPendingOps(prev => prev.filter(op => op.id !== opId))
        }
    }

    const fetchExploreResults = async (path: string) => {
        if (!token()) return []

        await ensureNamespaceTree()

        const results: any[] = []
        const uniquePaths = new Set<string>()

        // Traverse the cached namespace tree to find children at `path`
        const tree = namespaceTree()
        if (tree) {
            let ns = path
            if (ns.startsWith('/')) ns = ns.substring(1)
            if (ns.endsWith('/')) ns = ns.slice(0, -1)
            const parts = ns.split('/').filter(p => p.length > 0)

            // Walk the tree to the node matching `parts`
            let node: any = tree
            for (const part of parts) {
                const subs: any[] = node?.subnamespaces || []
                node = subs.find((s: any) => {
                    const subNs: string = (s.namespace || '').toString().replace(/\\/g, '/')
                    const leaf = subNs.split('/').filter((x: string) => x.length > 0).pop() ?? ''
                    return leaf === part
                }) ?? null
                if (!node) break
            }

            for (const sub of node?.subnamespaces || []) {
                const namespace: string = (sub.namespace || '').toString().replace(/\\/g, '/')
                const resultPath = '/' + namespace + '/'
                if (!uniquePaths.has(resultPath)) {
                    uniquePaths.add(resultPath)
                    results.push({ token: [], expr: pathToSexpr(resultPath), path: resultPath })
                }
            }
        }

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
                if (!uniquePaths.has(nextPath)) {
                    uniquePaths.add(nextPath)
                    results.push({ token: [], expr: pathToSexpr(nextPath), path: nextPath })
                }
            }
        }

        return results
    }

    const clearSpace = async (pattern?: string) => {
        const p = activePanel()
        if (!p) return
        const path = p.namespace
        const encodedPath = path.replace(/^\//, '').split('/').filter(Boolean).map(encodeURIComponent).join('/')

        try {
            const url = pattern
                ? `${BACKEND_URL}/spaces/${encodedPath}?pattern=${encodeURIComponent(pattern)}`
                : `${BACKEND_URL}/spaces/${encodedPath}`;

            const resp = await fetch(url, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token()?.code ?? ''}` },
            })

            if (resp.ok) {
                const message = pattern
                    ? `Successfully cleared matching data from space '${path}'`
                    : `Successfully cleared space '${path}'`;
                notify.success(message)
                fetchSpaceLogs()
                await read()
            } else {
                notify.error(`Failed to clear space '${path}'`)
            }
        } catch (e) {
            console.error(e);
            notify.error(`Error clearing space '${path}'`)
        }

        clearModal.close()
    }

    const openClearModal = () => {
        const p = activePanel()
        if (!p) return
        clearModal.showModal()
    }

    const copySpace = async (src: string, dst: string) => {
        try {
            const resp = await fetch(`${BACKEND_URL}/spaces/copy`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token()?.code ?? ''}`,
                },
                body: JSON.stringify({ src, dst }),
            })
            if (resp.ok) {
                notify.success(`Successfully copied '${src}' to '${dst}'`)
                fetchSpaceLogs()
                invalidateNamespaceTree()
                await read()
            } else {
                notify.error(`Failed to copy '${src}' to '${dst}'`)
            }
        } catch (e) {
            console.error(e)
            notify.error(`Error copying space`)
        }
        copyModal.close()
    }

    const openCopyModal = () => {
        copyModal.showModal()
    }

    const openShareModal = (path: string) => {
        setShareNamespace(path)
        shareTokenModal.showModal()
    }

    const deleteSubspace = async (path: string) => {
        const encodedPath = path.replace(/^\//, '').split('/').filter(Boolean).map(encodeURIComponent).join('/')

        setConfirmData({
            title: 'Delete Subspace',
            message: `Are you sure you want to delete the subspace '${path}'? This will remove all atoms matching this prefix.`,
            onConfirm: async () => {
                try {
                    const url = `${BACKEND_URL}/spaces/${encodedPath}`;

                    const resp = await fetch(url, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token()?.code ?? ''}` },
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
            const deltaY = initialY - moveEvent.clientY
            setConsoleHeight(Math.max(60, Math.min(600, initialHeight + deltaY)))
        }
        const onMouseUp = () => {
            setIsResizingConsole(false)
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseup', onMouseUp)
        }
        document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp)
    }

    const startRightHistoryResizing = (e: MouseEvent) => {
        setIsResizingRightHistory(true)
        const initialY = e.clientY; const initialHeight = rightHistoryHeight()
        const onMouseMove = (moveEvent: MouseEvent) => {
            // dragging up increases history height
            const deltaY = initialY - moveEvent.clientY
            setRightHistoryHeight(Math.max(60, Math.min(600, initialHeight + deltaY)))
        }
        const onMouseUp = () => {
            setIsResizingRightHistory(false)
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseup', onMouseUp)
        }
        document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp)
    }

    const handleLogout = () => {
        for (const p of panels) disconnectPresence(p.id)
        setRootTokenCode(null)
        setToken(undefined)
        localStorage.removeItem('rootToken')
        setEditorMode(EditorMode.DEFAULT)
        setPanels(reconcile([]))
        notify.success('Logged out successfully')
    }

    return (
        <div class={styles.MainLayout}>
            <Navbar currentPage="editor" />
            <main
                class={styles.Main}
                style={{ "--trie-width": `${trieWidth()}px`, "--console-height": `${consoleHeight()}px` }}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    const draggedFile = e.dataTransfer?.files?.item(0)
                    if (draggedFile && canWrite()) {
                        setImportSource(ImportSource.FILE)
                        setActiveImportFile(draggedFile); setManualImportFormat(undefined); openImportModal();
                    }
                }}
            >
                {/* Tabs - full width at top */}
                <Show when={panels.length > 0 || editorMode() !== EditorMode.DEFAULT}>
                    <div class={styles.EditorTabs}>
                        <For each={panels}>
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
                </Show>

                {/* Progress bar: shown when active space is locked or undo/redo is running */}
                <Show when={lockedPaths().has(activePanel()?.namespace ?? '') || isUndoRedoInProgress()}>
                    <div class={styles.ProgressBar} />
                </Show>

                {/* Content wrapper with margin */}
                <div class={styles.ContentWrapper}>
                    {/* Content row: Sidebar | Editor | Trie */}
                    <Show when={panels.length > 0 || editorMode() !== EditorMode.DEFAULT}>
                        <div class={styles.ContentRow}>
                            {/* Sidebar */}
                            <aside class={`${styles.Sidebar} ${sidebarCollapsed() ? styles.SidebarCollapsed : ''}`}>
                                <div class={styles.MettaEditorActions}>
                                    <div class={styles.ButtonGroup}>
                                        <button onClick={() => canWrite() ? guardUnsavedChanges(() => openImportModal()) : notifyReadOnly()}>
                                            <VsCloudUpload size={16} />
                                            <span>Import</span>
                                        </button>
                                        <button onclick={() => canWrite() ? guardUnsavedChanges(() => openClearModal()) : notifyReadOnly()}>
                                            <VsClearAll size={16} />
                                            <span>Clear</span>
                                        </button>
                                        <button onclick={() => canWrite() ? guardUnsavedChanges(() => openCopyModal()) : notifyReadOnly()}>
                                            <VsCopy size={16} />
                                            <span>Copy</span>
                                        </button>
                                        <button onclick={() => !canWrite() ? notifyReadOnly() : guardUnsavedChanges(() => {
                                            if (transformConfigs().length === 0) {
                                                const ns = activePanel()?.namespace || '/'
                                                setTransformConfigs([
                                                    { path: ns, type: 'input', patternOrTemplate: '' },
                                                    { path: ns, type: 'output', patternOrTemplate: '' }
                                                ]);
                                            }
                                            transformModal.showModal();
                                        })}>
                                            <VsReplace size={16} />
                                            <span>Transform</span>
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

                            {/* Main editor column */}
                            <div class={styles.EditorColumn}>
                                {/* Namespace selector */}
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
                                                        <VsWarning size={14} style={{ color: 'var(--love)' }} />
                                                        <span>{s}</span>
                                                    </Show>
                                                    <Show when={isLocked}>
                                                        <VsLock size={14} style={{ color: 'var(--gold)' }} />
                                                        <span>{s}</span>
                                                    </Show>
                                                    <Show when={isCount}>
                                                        <VsCheck size={14} style={{ color: 'var(--foam)' }} />
                                                        <span>{String(status().count ?? '')} atoms</span>
                                                    </Show>
                                                    <Show when={s === 'pathClear'}>
                                                        <VsCheck size={14} style={{ color: 'var(--foam)' }} />
                                                        <span>ready</span>
                                                    </Show>
                                                </div>
                                            )
                                        }}
                                    </Show>
                                    <div class={styles.UndoRedoGroup}>
                                        <button
                                            class={styles.UndoRedoButton}
                                            title="Undo last operation"
                                            disabled={!canWrite() || myUndoTargetId() === null || isUndoRedoInProgress()}
                                            onClick={() => { const id = myUndoTargetId(); if (id !== null) rollbackLog(id) }}
                                        >
                                            <Show when={isUndoRedoInProgress()} fallback={<VsDiscard size={15} />}>
                                                <span class={styles.Spinner} />
                                            </Show>
                                        </button>
                                        <button
                                            class={styles.UndoRedoButton}
                                            title="Redo last undone operation"
                                            disabled={!canWrite() || myRedoTargetId() === null || isUndoRedoInProgress()}
                                            onClick={() => { const id = myRedoTargetId(); if (id !== null) redoLog(id) }}
                                        >
                                            <Show when={isUndoRedoInProgress()} fallback={<VsRedo size={15} />}>
                                                <span class={styles.Spinner} />
                                            </Show>
                                        </button>
                                        <button
                                            class={styles.UndoRedoButton}
                                            title="Save changes (Ctrl+S)"
                                            disabled={!canWrite() || !hasUnsavedChanges()}
                                            onClick={saveActivePanel}
                                        >
                                            <VsSave size={15} />
                                        </button>
                                    </div>
                                    <NamespaceSelector
                                        value={displayedNamespace()}
                                        onInput={(ns) => setDraftNamespace(ns)}
                                        onCommit={() => {
                                            const ns = draftNamespace()
                                            if (ns !== null) {
                                                const pidxNs = panels.findIndex(p => p.id === activePanelId())
                                                if (pidxNs !== -1) setPanels(pidxNs, 'namespace', ns)
                                                setDraftNamespace(null)
                                            }
                                            read()
                                        }}
                                        fetchExploreResults={fetchExploreResults}
                                        disabled={editorMode() !== EditorMode.EDIT}
                                    />
                                    <div class={styles.DepthControl} title="Number of subspace levels to fetch when exploring">
                                        <button
                                            class={styles.UndoRedoButton}
                                            disabled={exploreDepth() <= 1}
                                            onClick={() => { const d = Math.max(1, exploreDepth() - 1); setExploreDepth(d); localStorage.setItem('exploreDepth', String(d)); read(); }}
                                            aria-label="Decrease explore depth"
                                        >−</button>
                                        <span class={styles.DepthLabel}><VsLayers size={14} /> {exploreDepth()}</span>
                                        <button
                                            class={styles.UndoRedoButton}
                                            disabled={exploreDepth() >= 9}
                                            onClick={() => { const d = Math.min(9, exploreDepth() + 1); setExploreDepth(d); localStorage.setItem('exploreDepth', String(d)); read(); }}
                                            aria-label="Increase explore depth"
                                        >+</button>
                                    </div>
                                    <div class={styles.DepthControl} title="Number of expressions to load per page">
                                        <button
                                            class={styles.UndoRedoButton}
                                            disabled={PAGE_SIZE_STEPS.indexOf(pageSize()) <= 0}
                                            onClick={() => { const s = PAGE_SIZE_STEPS[Math.max(0, PAGE_SIZE_STEPS.indexOf(pageSize()) - 1)]; setPageSize(s); localStorage.setItem('explorePageSize', String(s)); }}
                                            aria-label="Decrease page size"
                                        >−</button>
                                        <span class={styles.DepthLabel}>{pageSize()}</span>
                                        <button
                                            class={styles.UndoRedoButton}
                                            onClick={() => { const s = PAGE_SIZE_STEPS[Math.min(PAGE_SIZE_STEPS.length - 1, PAGE_SIZE_STEPS.indexOf(pageSize()) + 1)]; setPageSize(s); localStorage.setItem('explorePageSize', String(s)); }}
                                            aria-label="Increase page size"
                                            disabled={PAGE_SIZE_STEPS.indexOf(pageSize()) >= PAGE_SIZE_STEPS.length - 1}
                                        >+</button>
                                    </div>
                                </div>

                                {/* Presence bar: avatars of other users editing this space or subspaces */}
                                <Show when={activeRemoteEditors().length > 0}>
                                    <div class={styles.PresenceBar}>
                                        <For each={activeRemoteEditors()}>
                                            {(editor) => (
                                                <div
                                                    class={styles.PresenceEntry}
                                                    title={editor.relativePath ? `${editor.displayName} — ${editor.relativePath}` : editor.displayName}
                                                >
                                                    <div
                                                        class={styles.PresenceAvatar}
                                                        style={{ background: colorForSession(editor.id) }}
                                                    >
                                                        {editor.displayName.slice(0, 2).toUpperCase()}
                                                    </div>
                                                    {editor.relativePath ? <span class={styles.PresencePath}>{editor.relativePath}</span> : null}
                                                </div>
                                            )}
                                        </For>
                                    </div>
                                </Show>

                                {/* Main editor - takes remaining space */}
                                <div class={styles.MettaInput} ref={(ref) => { mettaInput = ref; }}></div>

                                {/* Console - full width at bottom */}
                                <div class={`${styles.ConsoleResizer} ${isResizingConsole() ? styles.Resizing : ''}`} onMouseDown={startConsoleResizing} />
                                <div class={styles.ConsoleSection}>
                                    <DslConsole
                                        activeNamespace={() => activePanel()?.namespace || '/'}
                                        token={token}
                                    />
                                </div>

                            </div>

                            {/* Resizer for right column */}
                            <div class={`${styles.Resizer} ${isResizing() ? styles.Resizing : ''}`} onMouseDown={startResizing} />

                            {/* Right column: Trie Explorer + History */}
                            <div class={styles.RightColumn}>
                                <div class={styles.TrieWrapper} style={{ "min-height": "0" }}>
                                    <TrieExplorer
                                        content={activePanel() ? getDisplayContent(activePanel()!.astState) : ''}
                                        originalContent={activePanel() ? getOriginalContent(activePanel()!.astState) : ''}
                                        onDelete={deleteSubspace}
                                        rootPath={activePanel()?.namespace || '/'}
                                        onOpenSubspace={(path) => addPanel(path)}
                                        onShare={openShareModal}
                                        onConfigureTransform={(paths) => {
                                            guardUnsavedChanges(() => {
                                                setTransformConfigs(paths.map((p, i) => ({
                                                    path: p,
                                                    type: i === 0 ? 'input' : 'output',
                                                    patternOrTemplate: ''
                                                })));
                                                transformModal.showModal();
                                            })
                                        }}
                                        onCollapse={handleTrieCollapse}
                                        onExpand={handleTrieExpand}
                                        focusTokens={() => focusTokens()}
                                        prefetchCache={() => prefetchCache()}
                                        onLoadMore={handleLoadMore}
                                        isLoadingMore={() => isLoadingMore()}
                                        onNodeClick={handleTrieNodeClick}
                                    />
                                </div>
                                <div
                                    class={`${styles.ConsoleResizer} ${isResizingRightHistory() ? styles.Resizing : ''}`}
                                    onMouseDown={startRightHistoryResizing}
                                />
                                <div class={styles.RightHistory} style={{ height: `${rightHistoryHeight()}px` }}>
                                    <div class={styles.RightHistoryHeader}>
                                        <span>My History</span>
                                    </div>
                                    <div class={styles.RightHistoryList}>
                                        <Show when={ownHistory.state.loading}>
                                            <div class={styles.LogEntryLoading}>Loading…</div>
                                        </Show>
                                        <For each={ownHistory.state.entries.filter(l => l.token_id === token()?.id)}>
                                            {(log) => {
                                                const detail = log.import?.path ?? log.clear?.path ?? log.edit?.path
                                                    ?? (log.transform ? (log.transform.output_spaces as any[])[0]?.path : null)
                                                    ?? null
                                                const editSummary = log.edit
                                                    ? `+${log.edit.added.length} −${log.edit.removed.length}`
                                                    : null
                                                const isUndoTarget = log.id === myUndoTargetId()
                                                const isRedoTarget = log.id === myRedoTargetId()
                                                const isRolledBack = !!log.rolled_back_at
                                                return (
                                                    <div
                                                        class={`${styles.LogEntry} ${isRolledBack ? styles.LogEntryRolledBack : ''} ${isUndoTarget ? styles.LogEntryUndoTarget : ''} ${isRedoTarget ? styles.LogEntryRedoTarget : ''}`}
                                                        title={isRolledBack ? 'Rolled back' : ''}
                                                    >
                                                        <div class={styles.LogEntryHeader}>
                                                            <span class={`${styles.LogEntryType} ${styles[log.op_type] ?? ''}`}>{log.op_type}</span>
                                                            <div class={styles.LogEntryActions}>
                                                                <Show when={isUndoTarget}>
                                                                    <button
                                                                        class={styles.LogEntryActionBtn}
                                                                        title={canWrite() ? "Undo this operation" : "Read-only token"}
                                                                        disabled={!canWrite() || isUndoRedoInProgress()}
                                                                        onClick={() => rollbackLog(log.id)}
                                                                    >↩</button>
                                                                </Show>
                                                                <Show when={isRedoTarget}>
                                                                    <button
                                                                        class={styles.LogEntryActionBtn}
                                                                        title={canWrite() ? "Redo this operation" : "Read-only token"}
                                                                        disabled={!canWrite() || isUndoRedoInProgress()}
                                                                        onClick={() => redoLog(log.id)}
                                                                    >↪</button>
                                                                </Show>
                                                                <span class={styles.LogEntryTime}>
                                                                    {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <Show when={detail}>
                                                            <span class={styles.LogEntryDetail}>{detail}</span>
                                                        </Show>
                                                        <Show when={editSummary}>
                                                            <span class={styles.LogEntryDetail}>{editSummary}</span>
                                                        </Show>
                                                    </div>
                                                )
                                            }}
                                        </For>
                                        <Show when={!ownHistory.state.loading && ownHistory.state.entries.filter(l => l.token_id === token()?.id).length === 0}>
                                            <div class={styles.LogEntryEmpty}>No operations yet</div>
                                        </Show>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Show>

                    <Show when={panels.length === 0 && editorMode() === EditorMode.DEFAULT}>
                        <div class={styles.NewSessionDiv}>
                            <button onClick={() => loadSpaceModal.showModal()} class={styles.ImportButton}>
                                <AiFillFolderOpen class={styles.Icon} size={28} />
                                <span>Load MeTTa Space</span>
                            </button>
                        </div>
                    </Show>
                </div>

                {/* Footer bar */}
                <div class={styles.Footer}></div>
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
                    setIsImportModalOpen(false)
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

            <dialog ref={unsavedChangesModal!}>
                <form onsubmit={(e) => e.preventDefault()}>
                    <h2>Unsaved Changes</h2>
                    <p>You have unsaved changes. Save or discard them before continuing.</p>
                    <div class={commonStyles.ModalButtonBar}>
                        <button
                            type="button"
                            class={commonStyles.TextButton}
                            onclick={() => unsavedChangesModal.close()}
                        >Cancel</button>
                        <div class={commonStyles.Spacer} />
                        <button
                            type="button"
                            class={commonStyles.TextButton}
                            onclick={() => {
                                unsavedChangesModal.close()
                                discardActivePanel()
                                pendingAction()?.()
                                setPendingAction(null)
                            }}
                        >Discard</button>
                        <button
                            type="button"
                            class={commonStyles.Button}
                            onclick={() => {
                                unsavedChangesModal.close()
                                saveActivePanel()
                                pendingAction()?.()
                                setPendingAction(null)
                            }}
                        >Save</button>
                    </div>
                </form>
            </dialog>

            <ClearModal
                ref={clearModal!}
                namespace={activePanel()?.namespace || '/'}
                onConfirm={(pattern) => clearSpace(pattern)}
                onCancel={() => clearModal.close()}
            />

            <CopyModal
                ref={copyModal!}
                initialSrc={activePanel()?.namespace || '/'}
                onConfirm={(src, dst) => copySpace(src, dst)}
                onCancel={() => copyModal.close()}
                fetchExploreResults={fetchExploreResults}
            />

            <ShareTokenModal
                ref={shareTokenModal!}
                namespace={shareNamespace}
                rootTokenCode={rootTokenCode}
                onClose={() => shareTokenModal.close()}
            />

            <Show when={pendingOps().length > 0}>
                <div class={styles.PendingOpsPanel}>
                    <For each={pendingOps()}>
                        {(op) => (
                            <div class={styles.PendingOp}>
                                <div class={styles.Spinner} />
                                <span>{op.label}</span>
                            </div>
                        )}
                    </For>
                </div>
            </Show>

            <Toaster toastOptions={{ className: commonStyles.Toaster }} containerStyle={{ 'margin-top': '60px' }} />
        </div>
    )
}

export default App
