import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state'
import {
    EditorView,
    ViewPlugin,
    ViewUpdate,
    Decoration,
    DecorationSet,
    WidgetType,
    gutter,
    GutterMarker,
} from '@codemirror/view'
import { EditorState } from '@codemirror/state'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export const setCollapsedKeysEffect = StateEffect.define<Set<string>>()

export const collapsedKeysField = StateField.define<Set<string>>({
    create: () => new Set(),
    update(value, tr) {
        for (const e of tr.effects) {
            if (e.is(setCollapsedKeysEffect)) return e.value
        }
        return value
    },
})

// Deep collapsed paths — relative paths like "csv/0" or "transformed/csv/0"
export const setDeepCollapsedKeysEffect = StateEffect.define<Set<string>>()

export const deepCollapsedKeysField = StateField.define<Set<string>>({
    create: () => new Set(),
    update(value, tr) {
        for (const e of tr.effects) {
            if (e.is(setDeepCollapsedKeysEffect)) return e.value
        }
        return value
    },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the first symbol of a top-level MeTTa atom on this line, or null.
 * A top-level atom starts at column 0 and looks like `(symbol ...)`.
 */
export function lineFirstSymbol(text: string): string | null {
    if (text.startsWith(' ') || text.startsWith('\t')) return null
    const m = /^\((\S+)/.exec(text)
    return m ? m[1] : null
}

export function getFoldedTopLevelKeys(state: EditorState): Set<string> {
    return state.field(collapsedKeysField)
}

/** Convert a relative path like "transformed/csv/0" to the line prefix "(transformed (csv (0 " */
export function pathToLinePrefix(relPath: string): string {
    return relPath.split('/').filter(Boolean).map(s => `(${s} `).join('')
}

/**
 * Return the visible prefix that should remain on screen when a deep path is folded.
 * For "transformed/csv/0" this is "(transformed (csv " — everything up to the last segment.
 */
function parentLinePrefix(relPath: string): string {
    const segments = relPath.split('/').filter(Boolean)
    if (segments.length <= 1) return ''
    return segments.slice(0, -1).map(s => `(${s} `).join('')
}

// ---------------------------------------------------------------------------
// Widget shown on the first line of a collapsed group
// ---------------------------------------------------------------------------

class CollapsedWidget extends WidgetType {
    constructor(readonly key: string, readonly count: number) { super() }

    eq(other: CollapsedWidget) {
        return other.key === this.key && other.count === this.count
    }

    toDOM() {
        const el = document.createElement('span')
        el.style.cssText =
            'color:var(--rp-muted);font-style:italic;cursor:pointer;' +
            'padding:0 6px;border-radius:3px;background:var(--rp-highlight-low);'
        el.textContent = `▸ (${this.key} …) ×${this.count}`
        el.title = `${this.count} atom${this.count !== 1 ? 's' : ''} hidden — click to expand`
        return el
    }

    ignoreEvent() { return false }
}

// ---------------------------------------------------------------------------
// ViewPlugin — replaces collapsed-key lines with decorations
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
                u.startState.field(collapsedKeysField) !== u.state.field(collapsedKeysField) ||
                u.startState.field(deepCollapsedKeysField) !== u.state.field(deepCollapsedKeysField)
            ) {
                this.decorations = this.compute(u.view)
            }
        }

        compute(view: EditorView): DecorationSet {
            const collapsed = view.state.field(collapsedKeysField)
            const deepCollapsed = view.state.field(deepCollapsedKeysField)
            if (collapsed.size === 0 && deepCollapsed.size === 0) return Decoration.none

            // Sort deep paths longest-first so more-specific paths match before less-specific ones
            const sortedDeep = [...deepCollapsed].sort((a, b) => b.length - a.length)

            const doc = view.state.doc
            const builder = new RangeSetBuilder<Decoration>()

            // First pass: count atoms per collapsed key/path, record first line number
            const topCounts = new Map<string, number>()
            const topFirstLine = new Map<string, number>()
            const deepCounts = new Map<string, number>()
            const deepFirstLine = new Map<string, number>()

            for (let i = 1; i <= doc.lines; i++) {
                const text = doc.line(i).text
                const sym = lineFirstSymbol(text)
                if (sym && collapsed.has(sym)) {
                    topCounts.set(sym, (topCounts.get(sym) ?? 0) + 1)
                    if (!topFirstLine.has(sym)) topFirstLine.set(sym, i)
                    continue // top-level fold supersedes deep fold
                }
                for (const relPath of sortedDeep) {
                    if (text.startsWith(pathToLinePrefix(relPath))) {
                        deepCounts.set(relPath, (deepCounts.get(relPath) ?? 0) + 1)
                        if (!deepFirstLine.has(relPath)) deepFirstLine.set(relPath, i)
                        break
                    }
                }
            }

            // Second pass: emit decorations in document order
            for (let i = 1; i <= doc.lines; i++) {
                const line = doc.line(i)
                const text = line.text
                const sym = lineFirstSymbol(text)
                const from = line.from
                const to = line.to

                // Include the trailing newline in the widget decoration so that
                // the next visible content appears immediately after with no gap.
                const lineEnd = i < doc.lines ? to + 1 : to

                // Top-level collapsed key
                if (sym && collapsed.has(sym)) {
                    if (topFirstLine.get(sym) === i) {
                        builder.add(from, lineEnd, Decoration.replace({ widget: new CollapsedWidget(sym, topCounts.get(sym)!) }))
                    } else {
                        builder.add(from, to, Decoration.replace({}))
                    }
                    continue
                }

                // Deep collapsed path — keep the parent prefix visible, fold from the last segment
                for (const relPath of sortedDeep) {
                    if (text.startsWith(pathToLinePrefix(relPath))) {
                        const label = relPath.split('/').filter(Boolean).at(-1)!
                        if (deepFirstLine.get(relPath) === i) {
                            const foldFrom = from + parentLinePrefix(relPath).length
                            builder.add(foldFrom, lineEnd, Decoration.replace({ widget: new CollapsedWidget(label, deepCounts.get(relPath)!) }))
                        } else {
                            builder.add(from, to, Decoration.replace({}))
                        }
                        break
                    }
                }
            }

            return builder.finish()
        }
    },
    { decorations: v => v.decorations },
)

// ---------------------------------------------------------------------------
// Custom gutter — collapse / expand icons on the first occurrence of each key
// ---------------------------------------------------------------------------

class PathFoldMarker extends GutterMarker {
    constructor(readonly sym: string, readonly collapsed: boolean) { super() }

    toDOM() {
        const el = document.createElement('span')
        el.style.cssText = 'cursor:pointer;font-size:14px;opacity:0.8;line-height:1;'
        el.textContent = this.collapsed ? '▸' : '▾'
        el.title = this.collapsed ? `Expand ${this.sym}` : `Collapse ${this.sym}`
        return el
    }
}

const pathFoldGutter = gutter({
    class: 'cm-path-fold-gutter',
    markers(view) {
        const collapsed = view.state.field(collapsedKeysField)
        const doc = view.state.doc
        const builder = new RangeSetBuilder<GutterMarker>()
        const seen = new Set<string>()

        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i)
            const sym = lineFirstSymbol(line.text)
            if (!sym) continue
            // Show marker only on the first occurrence of each symbol
            if (!seen.has(sym)) {
                seen.add(sym)
                builder.add(line.from, line.from, new PathFoldMarker(sym, collapsed.has(sym)))
            }
        }
        return builder.finish()
    },
    domEventHandlers: {
        click(view, line) {
            const sym = lineFirstSymbol(view.state.doc.lineAt(line.from).text)
            if (!sym) return false
            const collapsed = view.state.field(collapsedKeysField)
            const next = new Set(collapsed)
            if (next.has(sym)) next.delete(sym)
            else next.add(sym)
            view.dispatch({ effects: setCollapsedKeysEffect.of(next) })
            return true
        },
    },
})

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the full path-fold extension.
 * `onCollapsedKeysChange` is called whenever the set of collapsed keys changes
 * (whether from the gutter or from an external dispatch).
 */
export function createPathFoldExtension(
    onCollapsedKeysChange: (keys: Set<string>) => void,
    onDeepCollapsedKeysChange: (keys: Set<string>) => void,
) {
    return [
        collapsedKeysField,
        deepCollapsedKeysField,
        pathFoldPlugin,
        pathFoldGutter,
        EditorView.updateListener.of(update => {
            const prev = update.startState.field(collapsedKeysField)
            const next = update.state.field(collapsedKeysField)
            if (prev !== next) onCollapsedKeysChange(next)

            const prevDeep = update.startState.field(deepCollapsedKeysField)
            const nextDeep = update.state.field(deepCollapsedKeysField)
            if (prevDeep !== nextDeep) onDeepCollapsedKeysChange(nextDeep)
        }),
    ]
}
