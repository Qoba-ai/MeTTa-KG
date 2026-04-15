import { Component, Show, createSignal, onCleanup, onMount } from 'solid-js'
import cytoscape, { Core, ElementDefinition } from 'cytoscape'
import { Navbar } from '../../components/Navbar/Navbar'
import { OpLogEntry } from '../../types'
import { BACKEND_URL } from '../../urls'
import styles from './History.module.scss'

// ─── Constants ────────────────────────────────────────────────────────────────

// x-centre of each operation-type swimlane (px)
const LANE_X: Record<string, number> = {
    Import:    180,
    Transform: 420,
    Clear:     660,
}
const FALLBACK_X  = 900
const NODE_GAP    =  20    // vertical gap between nodes in a lane
const ROW_OFFSET  =  80    // y of the top edge of the first node
const NODE_WIDTH  = 168
const LINE_HEIGHT =  17    // px per label line
const NODE_VPAD   =  22    // total vertical padding inside the node

// ─── Types ───────────────────────────────────────────────────────────────────

interface TransformSpace {
    path:      string
    pattern?:  string
    template?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Read a CSS custom property from :root at call time. */
const cssVar = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const OP_COLORS: Record<string, { bg: string; border: string }> = {
    Import:    { bg: '--foam',   border: '--foam' },
    Transform: { bg: '--iris',   border: '--iris' },
    Clear:     { bg: '--love',   border: '--love' },
}
const DEFAULT_COLOR = { bg: '--subtle', border: '--muted' }

/** Normalise a path so the root is always shown as "/" rather than "". */
const displayPath = (p: string) => p || '/'

/** Truncate a path, keeping the tail (most distinctive part). */
const trunc = (s: string, max = 22) =>
    s.length > max ? '…' + s.slice(-(max - 1)) : s

/** Summarise an array of TransformSpace paths onto one line, capped at `max`. */
const summarisePaths = (spaces: TransformSpace[], max = 3): string => {
    const paths = spaces.map(s => trunc(displayPath(s.path), 18))
    if (paths.length <= max) return paths.join('  ·  ')
    return paths.slice(0, max).join('  ·  ') + `  +${paths.length - max}`
}

/** Paths that an operation WRITES to (used to determine rollback dependencies). */
function getWriteSpaces(entry: OpLogEntry): string[] {
    if (entry.import) return [entry.import.path]
    if (entry.clear)  return [entry.clear.path]
    if (entry.transform) {
        const outs = entry.transform.output_spaces as TransformSpace[]
        return outs.map(s => s.path)
    }
    return []
}

/** True when `child` is `parent` or a subspace of it (e.g. "a/b" ⊆ "a"). */
function isSubspace(child: string, parent: string): boolean {
    if (parent === '') return true  // root contains everything
    return child === parent || child.startsWith(parent + '/')
}

/** Build the multi-line label for a log entry. */
function buildLabel(entry: OpLogEntry): string {
    const lines: string[] = [entry.op_type]

    if (entry.import) {
        lines.push(`→  ${trunc(displayPath(entry.import.path))}`)
    } else if (entry.clear) {
        lines.push(trunc(displayPath(entry.clear.path)))
    } else if (entry.transform) {
        const ins  = entry.transform.input_spaces  as TransformSpace[]
        const outs = entry.transform.output_spaces as TransformSpace[]
        if (ins.length)  lines.push(`in   ${summarisePaths(ins)}`)
        if (outs.length) lines.push(`out  ${summarisePaths(outs)}`)
    }

    return lines.join('\n')
}

function buildNodes(entries: OpLogEntry[]): ElementDefinition[] {
    // oldest first so they appear at the top of each lane
    const sorted = [...entries].sort((a, b) => a.id - b.id)
    // track the y of the next node's TOP edge per lane
    const laneNextTop: Record<string, number> = {}

    return sorted.map((entry) => {
        const colorKeys  = OP_COLORS[entry.op_type] ?? DEFAULT_COLOR
        const label      = buildLabel(entry)
        const lineCount  = label.split('\n').length
        const nodeHeight = NODE_VPAD + lineCount * LINE_HEIGHT

        const topY    = laneNextTop[entry.op_type] ?? ROW_OFFSET
        laneNextTop[entry.op_type] = topY + nodeHeight + NODE_GAP
        const centerY = topY + nodeHeight / 2

        return {
            data: {
                id:         String(entry.id),
                label,
                bg:         cssVar(colorKeys.bg),
                border:     cssVar(colorKeys.border),
                rolledBack: entry.rolled_back_at ? 1 : 0,
                nodeHeight,
            },
            position: {
                x: LANE_X[entry.op_type] ?? FALLBACK_X,
                y: centerY,
            },
        }
    })
}

/**
 * Build directed dependency edges for the rollback DAG.
 *
 * Rule: an edge A → B exists when B was executed after A and B writes to
 * one of A's output spaces or a subspace of it — meaning B must be undone
 * before A can be undone.
 *
 * Only *direct* dependencies are emitted: if A→B and B→C, the transitive
 * edge A→C is suppressed so the graph stays readable.
 */
function buildEdges(entries: OpLogEntry[]): ElementDefinition[] {
    const sorted  = [...entries].sort((a, b) => a.id - b.id)
    const edges: ElementDefinition[] = []
    // Track which ancestors already have a path to each node (for transitivity suppression)
    const reachable: Map<number, Set<number>> = new Map(sorted.map(e => [e.id, new Set()]))

    for (let j = 0; j < sorted.length; j++) {
        const b       = sorted[j]
        const bWrites = getWriteSpaces(b)
        if (bWrites.length === 0) continue

        // Scan earlier ops in reverse order so we hit direct deps before transitive ones
        for (let i = j - 1; i >= 0; i--) {
            const a       = sorted[i]
            const aWrites = getWriteSpaces(a)

            // B depends on A when B writes to A's output space or a subspace
            const dependsOn = aWrites.some(aS => bWrites.some(bS => isSubspace(bS, aS)))
            if (!dependsOn) continue

            // Suppress transitive edges (already reachable via an intermediate)
            if (reachable.get(b.id)!.has(a.id)) continue

            edges.push({
                data: {
                    id:     `e-${a.id}-${b.id}`,
                    source: String(a.id),
                    target: String(b.id),
                },
            })

            // Propagate reachability: a and all of a's ancestors are now reachable from b
            reachable.get(b.id)!.add(a.id)
            reachable.get(a.id)!.forEach(anc => reachable.get(b.id)!.add(anc))
        }
    }

    return edges
}

function buildElements(entries: OpLogEntry[]): ElementDefinition[] {
    return [...buildNodes(entries), ...buildEdges(entries)]
}

// cytoscape's TS types for style values are very strict; cast to any to avoid
// fighting the library's type definitions while keeping the code readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildStylesheet(): any[] {
    const text = cssVar('--text')

    return [
        {
            selector: 'node',
            style: {
                'background-color':    'data(bg)',
                'background-opacity':  0.15,
                'border-color':        'data(border)',
                'border-width':        2,
                'border-opacity':      0.85,
                'label':               'data(label)',
                'color':               text,
                'font-size':           '10.5px',
                'text-valign':         'center',
                'text-halign':         'center',
                'text-justification':  'left',
                'text-wrap':           'wrap',
                'text-max-width':      '148px',
                'width':               NODE_WIDTH,
                'height':              'data(nodeHeight)',
                'shape':               'roundrectangle',
                'transition-property': 'background-opacity border-width opacity',
                'transition-duration': '150ms',
            },
        },
        {
            // rolled-back nodes are dimmed with a dashed border
            selector: 'node[rolledBack = 1]',
            style: {
                'opacity':      0.45,
                'border-style': 'dashed',
            },
        },
        {
            selector: 'node:selected',
            style: {
                'background-opacity': 0.4,
                'border-width':       3,
            },
        },
        {
            selector: 'node:active',
            style: {
                'overlay-opacity': 0.08,
            },
        },
        {
            selector: 'edge',
            style: {
                'curve-style':          'bezier',
                'target-arrow-shape':   'triangle',
                'arrow-scale':          0.7,
                'line-color':           cssVar('--muted'),
                'target-arrow-color':   cssVar('--muted'),
                'opacity':              0.35,
                'width':                1.5,
            },
        },
        {
            // dim edges whose source node is rolled back
            selector: 'node[rolledBack = 1] ~ edge, edge[?rolledBack]',
            style: { 'opacity': 0.15 },
        },
    ]
}

// ─── Component ───────────────────────────────────────────────────────────────

const LEGEND_ITEMS = [
    { label: 'Import',    color: '--foam' },
    { label: 'Transform', color: '--iris' },
    { label: 'Clear',     color: '--love' },
] as const

const History: Component = () => {
    let containerRef: HTMLDivElement | undefined
    let cy: Core | undefined

    const [logs, setLogs]               = createSignal<OpLogEntry[]>([])
    const [loading, setLoading]         = createSignal(true)
    const [error, setError]             = createSignal<string | null>(null)
    const [selectedEntry, setSelectedEntry] = createSignal<OpLogEntry | null>(null)
    const [actionBusy, setActionBusy]   = createSignal(false)

    const tokenCode = localStorage.getItem('rootToken')

    const fetchLogs = async (): Promise<OpLogEntry[]> => {
        const res = await fetch(`${BACKEND_URL}/logs?page_size=200`, {
            headers: { Authorization: tokenCode! },
        })
        if (!res.ok) throw new Error('Failed to load operation history.')
        return res.json()
    }

    onMount(async () => {
        if (!tokenCode) {
            setError('No token — log in from the Editor page first.')
            setLoading(false)
            return
        }
        try {
            const data = await fetchLogs()
            setLogs(data)
            initGraph(data)
        } catch (e: any) {
            setError(e.message ?? 'Could not connect to the server.')
        } finally {
            setLoading(false)
        }
    })

    onCleanup(() => cy?.destroy())

    function initGraph(entries: OpLogEntry[]) {
        if (!containerRef) return
        cy?.destroy()

        cy = cytoscape({
            container:            containerRef,
            elements:             buildElements(entries),
            layout:               { name: 'preset' },
            style:                buildStylesheet(),
            userZoomingEnabled:   true,
            userPanningEnabled:   true,
            boxSelectionEnabled:  false,
            minZoom:              0.2,
            maxZoom:              3,
        })

        cy.fit(undefined, 60)

        cy.on('tap', 'node', (evt) => {
            const id = parseInt(evt.target.id(), 10)
            setSelectedEntry(entries.find(e => e.id === id) ?? null)
        })
        cy.on('tap', (evt) => {
            if (evt.target === cy) setSelectedEntry(null)
        })
    }

    const handleFit     = () => cy?.fit(undefined, 60)
    const handleRefresh = async () => {
        if (!tokenCode) return
        setLoading(true)
        setSelectedEntry(null)
        try {
            const data = await fetchLogs()
            setLogs(data)
            initGraph(data)
        } catch { /* ignore */ } finally {
            setLoading(false)
        }
    }

    const handleUndo = async () => {
        const entry = selectedEntry()
        if (!entry || !tokenCode) return
        setActionBusy(true)
        try {
            await fetch(`${BACKEND_URL}/logs/${entry.id}/rollback`, {
                method: 'POST',
                headers: { Authorization: tokenCode },
            })
            const data = await fetchLogs()
            setLogs(data)
            setSelectedEntry(data.find(e => e.id === entry.id) ?? null)
            initGraph(data)
        } finally {
            setActionBusy(false)
        }
    }

    const handleRedo = async () => {
        const entry = selectedEntry()
        if (!entry || !tokenCode) return
        setActionBusy(true)
        try {
            await fetch(`${BACKEND_URL}/logs/${entry.id}/redo`, {
                method: 'POST',
                headers: { Authorization: tokenCode },
            })
            const data = await fetchLogs()
            setLogs(data)
            setSelectedEntry(data.find(e => e.id === entry.id) ?? null)
            initGraph(data)
        } finally {
            setActionBusy(false)
        }
    }

    return (
        <div class={styles.MainLayout}>
            <Navbar title="MeTTa KG — History" currentPage="history" />
            <main class={styles.Main}>
                <Show when={loading()}>
                    <div class={styles.Overlay}>
                        <span class={styles.LoadingText}>Loading history…</span>
                    </div>
                </Show>
                <Show when={error()}>
                    <div class={styles.Overlay}>
                        <span class={styles.ErrorText}>{error()}</span>
                    </div>
                </Show>
                <Show when={!loading() && !error() && logs().length === 0}>
                    <div class={styles.Overlay}>
                        <span class={styles.EmptyText}>No operations recorded yet.</span>
                    </div>
                </Show>

                {/* Graph canvas */}
                <div class={styles.GraphContainer} ref={containerRef} />

                {/* Swimlane column headers */}
                <Show when={!loading() && !error() && logs().length > 0}>
                    <div class={styles.LaneHeaders}>
                        {LEGEND_ITEMS.map(item => (
                            <div
                                class={styles.LaneHeader}
                                style={{ color: `var(${item.color})` }}
                            >
                                {item.label}
                            </div>
                        ))}
                    </div>
                </Show>

                {/* Toolbar */}
                <div class={styles.Toolbar}>
                    <button class={styles.ToolbarButton} onClick={handleRefresh} title="Refresh">
                        ↺
                    </button>
                    <button class={styles.ToolbarButton} onClick={handleFit} title="Fit to view">
                        ⊞
                    </button>
                </div>

                {/* Node action panel — shown when a node is selected */}
                <Show when={selectedEntry()}>
                    {(entry) => (
                        <div class={styles.ActionPanel}>
                            <span class={styles.ActionPanelTitle}>
                                #{entry().id} {entry().op_type}
                            </span>
                            <div class={styles.ActionPanelButtons}>
                                <button
                                    class={styles.ActionButton}
                                    disabled={!!entry().rolled_back_at || actionBusy()}
                                    onClick={handleUndo}
                                    title="Undo this operation"
                                >
                                    Undo
                                </button>
                                <button
                                    class={styles.ActionButton}
                                    disabled={!entry().rolled_back_at || actionBusy()}
                                    onClick={handleRedo}
                                    title="Redo this operation"
                                >
                                    Redo
                                </button>
                            </div>
                        </div>
                    )}
                </Show>

                {/* Legend */}
                <Show when={!loading() && !error()}>
                    <div class={styles.Legend}>
                        {LEGEND_ITEMS.map(item => (
                            <div class={styles.LegendItem}>
                                <div
                                    class={styles.LegendDot}
                                    style={{ background: `var(${item.color})` }}
                                />
                                <span>{item.label}</span>
                            </div>
                        ))}
                        <div class={styles.LegendItem}>
                            <div class={`${styles.LegendDot} ${styles.LegendDotRolledBack}`} />
                            <span>Rolled back</span>
                        </div>
                    </div>
                </Show>
            </main>
        </div>
    )
}

export default History
