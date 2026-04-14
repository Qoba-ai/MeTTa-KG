import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state'
import {
    EditorView,
    ViewPlugin,
    ViewUpdate,
    Decoration,
    DecorationSet,
    WidgetType,
} from '@codemirror/view'
import { EditorState } from '@codemirror/state'

// ---------------------------------------------------------------------------
// State — single unified collapsed paths set
// ---------------------------------------------------------------------------

export const setCollapsedPathsEffect = StateEffect.define<Set<string>>()

/**
 * Tracks relative paths that are folded, e.g. "a", "a/b", "a/b/c".
 * A path is effectively folded if it or any ancestor is in this set.
 */
export const collapsedPathsField = StateField.define<Set<string>>({
    create: () => new Set(),
    update(value, tr) {
        for (const e of tr.effects) {
            if (e.is(setCollapsedPathsEffect)) return e.value
        }
        return value
    },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the path tokens from a MeTTa line.
 * For `(a (b (c value)))`, returns ["a", "b", "c"].
 * For `(a (b $))`, returns ["a", "b"].
 * Stops at non-2-ary expressions or terminal values.
 */
export function extractLinePathTokens(text: string): string[] {
    const trimmed = text.trimStart()
    if (!trimmed.startsWith('(')) return []

    const tokens: string[] = []
    let pos = 0
    const s = trimmed

    while (pos < s.length) {
        if (s[pos] !== '(') break
        pos++ // skip '('
        // skip whitespace
        while (pos < s.length && s[pos] === ' ') pos++
        // read symbol
        const start = pos
        while (pos < s.length && s[pos] !== ' ' && s[pos] !== '(' && s[pos] !== ')') pos++
        if (pos === start) break
        const sym = s.slice(start, pos)
        if (sym === '|$|') break // fringe marker, stop
        tokens.push(sym)
        // skip whitespace
        while (pos < s.length && s[pos] === ' ') pos++
        // next char should be '(' for continuation, or something else for terminal
    }

    return tokens
}

/**
 * Return the first symbol of a top-level MeTTa atom on this line, or null.
 */
export function lineFirstSymbol(text: string): string | null {
    if (text.startsWith(' ') || text.startsWith('\t')) return null
    const m = /^\((\S+)/.exec(text)
    return m ? m[1] : null
}

export function getFoldedPaths(state: EditorState): Set<string> {
    return state.field(collapsedPathsField)
}

/** Convert a relative path like "a/b/c" to the line prefix "(a (b (c " */
export function pathToLinePrefix(relPath: string): string {
    return relPath.split('/').filter(Boolean).map(s => `(${s} `).join('')
}

/**
 * Check if a line matches a collapsed path. Returns the matched path or null.
 * Checks longest paths first for specificity.
 */
function findMatchingCollapsedPath(text: string, sortedPaths: string[]): string | null {
    for (const relPath of sortedPaths) {
        if (text.startsWith(pathToLinePrefix(relPath))) {
            return relPath
        }
    }
    return null
}

/**
 * Return the visible prefix that should remain on screen when a path is folded.
 * For "a/b/c" this is "(a (b " — everything up to the last segment.
 */
function parentLinePrefix(relPath: string): string {
    const segments = relPath.split('/').filter(Boolean)
    if (segments.length <= 1) return ''
    return segments.slice(0, -1).map(s => `(${s} `).join('')
}

/** Get the last segment of a path */
function lastSegment(relPath: string): string {
    const segments = relPath.split('/').filter(Boolean)
    return segments[segments.length - 1] || relPath
}

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

class CollapsedWidget extends WidgetType {
    constructor(readonly key: string, readonly count: number) { super() }

    eq(other: CollapsedWidget) {
        return other.key === this.key && other.count === this.count
    }

    toDOM() {
        const el = document.createElement('span')
        el.style.cssText =
            'color:var(--muted);font-style:italic;cursor:pointer;' +
            'padding:0 6px;border-radius:3px;background:var(--highlight-low);'
        el.textContent = `\u25B8 (${this.key} \u2026) \u00D7${this.count}`
        el.title = `${this.count} atom${this.count !== 1 ? 's' : ''} hidden \u2014 click to expand`
        return el
    }

    ignoreEvent() { return false }
}

class FringeWidget extends WidgetType {
    constructor(readonly path: string) { super() }

    eq(other: FringeWidget) { return other.path === this.path }

    toDOM() {
        const el = document.createElement('span')
        el.style.cssText =
            'display:inline-flex;align-items:center;gap:2px;' +
            'color:var(--iris);cursor:pointer;' +
            'padding:1px 5px;border-radius:999px;' +
            'background:var(--highlight-low);border:1px solid var(--iris);' +
            'font-size:0.75em;font-weight:600;line-height:1.4;vertical-align:middle;'
        el.title = `Click to load more at ${this.path}`
        el.dataset.fringePath = this.path

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('width', '12')
        svg.setAttribute('height', '12')
        svg.setAttribute('viewBox', '0 0 12 12')
        svg.setAttribute('fill', 'currentColor')
        svg.style.pointerEvents = 'none'
        ;[2, 6, 10].forEach(cx => {
            const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
            c.setAttribute('cx', String(cx))
            c.setAttribute('cy', '6')
            c.setAttribute('r', '1.5')
            svg.appendChild(c)
        })

        el.appendChild(svg)
        return el
    }

    ignoreEvent() { return false }
}

// ---------------------------------------------------------------------------
// ViewPlugin — replaces collapsed-path lines with decorations + fringe markers
// ---------------------------------------------------------------------------

const pathFoldPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet

        constructor(view: EditorView) {
            this.decorations = this.compute(view)
        }

        update(u: ViewUpdate) {
            if (
                u.docChanged ||
                u.startState.field(collapsedPathsField) !== u.state.field(collapsedPathsField)
            ) {
                this.decorations = this.compute(u.view)
            }
        }

        compute(view: EditorView): DecorationSet {
            const collapsed = view.state.field(collapsedPathsField)
            const doc = view.state.doc
            const builder = new RangeSetBuilder<Decoration>()

            // Sort collapsed paths longest-first so more-specific paths match first
            const sortedPaths = [...collapsed].sort((a, b) => b.length - a.length)

            // First pass: count atoms per collapsed path, record first line number
            const pathCounts = new Map<string, number>()
            const pathFirstLine = new Map<string, number>()

            for (let i = 1; i <= doc.lines; i++) {
                const text = doc.line(i).text
                if (text.trim() === '') continue

                const matchedPath = findMatchingCollapsedPath(text, sortedPaths)
                if (matchedPath) {
                    pathCounts.set(matchedPath, (pathCounts.get(matchedPath) ?? 0) + 1)
                    if (!pathFirstLine.has(matchedPath)) pathFirstLine.set(matchedPath, i)
                }
            }

            // Second pass: emit decorations in document order
            for (let i = 1; i <= doc.lines; i++) {
                const line = doc.line(i)
                const text = line.text
                if (text.trim() === '') continue
                const from = line.from
                const to = line.to
                const lineEnd = i < doc.lines ? to + 1 : to

                const matchedPath = findMatchingCollapsedPath(text, sortedPaths)
                if (matchedPath) {
                    const label = lastSegment(matchedPath)
                    const parentPrefix = parentLinePrefix(matchedPath)

                    if (pathFirstLine.get(matchedPath) === i) {
                        if (parentPrefix.length === 0) {
                            // Top-level fold: replace entire line with widget
                            builder.add(from, lineEnd, Decoration.replace({
                                widget: new CollapsedWidget(label, pathCounts.get(matchedPath)!)
                            }))
                        } else {
                            // Deep fold: keep parent prefix visible, fold from the matched segment
                            const foldFrom = from + parentPrefix.length
                            builder.add(foldFrom, lineEnd, Decoration.replace({
                                widget: new CollapsedWidget(label, pathCounts.get(matchedPath)!)
                            }))
                        }
                    } else {
                        // Subsequent lines: hide completely
                        builder.add(from, to, Decoration.replace({}))
                    }
                    continue
                }

                // Check for fringe markers (|$|) in unfoldable positions
                // Match |$| at the end of a 2-ary expression like (a (b |$|))
                const fringeMatch = /\|\$\|\)/.exec(text)
                if (fringeMatch) {
                    const markerPos = from + text.indexOf('|$|')
                    // Extract the path context for this |$|
                    const pathTokens = extractLinePathTokens(text)
                    if (pathTokens.length > 0) {
                        const fringePath = pathTokens.join('/')
                        builder.add(markerPos, markerPos + 3, Decoration.replace({
                            widget: new FringeWidget(fringePath)
                        }))
                    }
                }
            }

            return builder.finish()
        }
    },
    { decorations: v => v.decorations },
)

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the full path-fold extension.
 * `onCollapsedPathsChange` is called whenever the set of collapsed paths changes.
 * `onFringeClick` is called when a user clicks a $ fringe marker in the editor.
 */
export function createPathFoldExtension(
    onCollapsedPathsChange: (paths: Set<string>) => void,
    onFringeClick?: (path: string) => void,
) {
    return [
        collapsedPathsField,
        pathFoldPlugin,
        EditorView.updateListener.of(update => {
            const prev = update.startState.field(collapsedPathsField)
            const next = update.state.field(collapsedPathsField)
            if (prev !== next) onCollapsedPathsChange(next)
        }),
        // Handle clicks on fringe $ widgets
        EditorView.domEventHandlers({
            click(event, view) {
                const target = event.target as HTMLElement
                if (target.dataset?.fringePath && onFringeClick) {
                    onFringeClick(target.dataset.fringePath)
                    return true
                }
                return false
            },
        }),
    ]
}
