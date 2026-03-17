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
                u.startState.field(collapsedKeysField) !== u.state.field(collapsedKeysField)
            ) {
                this.decorations = this.compute(u.view)
            }
        }

        compute(view: EditorView): DecorationSet {
            const collapsed = view.state.field(collapsedKeysField)
            if (collapsed.size === 0) return Decoration.none

            const doc = view.state.doc
            const builder = new RangeSetBuilder<Decoration>()

            // First pass: count atoms per collapsed key, record first line number
            const counts = new Map<string, number>()
            const firstLineNum = new Map<string, number>()
            for (let i = 1; i <= doc.lines; i++) {
                const sym = lineFirstSymbol(doc.line(i).text)
                if (sym && collapsed.has(sym)) {
                    counts.set(sym, (counts.get(sym) ?? 0) + 1)
                    if (!firstLineNum.has(sym)) firstLineNum.set(sym, i)
                }
            }

            // Second pass: emit decorations in document order
            for (let i = 1; i <= doc.lines; i++) {
                const line = doc.line(i)
                const sym = lineFirstSymbol(line.text)
                if (!sym || !collapsed.has(sym)) continue

                // Range: entire line content (excluding trailing \n to stay on the same line)
                const from = line.from
                const to = line.to

                if (firstLineNum.get(sym) === i) {
                    // Replace first occurrence's content with a summary widget
                    builder.add(
                        from,
                        to,
                        Decoration.replace({ widget: new CollapsedWidget(sym, counts.get(sym)!) }),
                    )
                } else {
                    // Hide subsequent occurrences entirely (replace with empty span)
                    builder.add(from, to, Decoration.replace({}))
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
        el.style.cssText = 'cursor:pointer;font-size:10px;opacity:0.7;'
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
) {
    return [
        collapsedKeysField,
        pathFoldPlugin,
        pathFoldGutter,
        EditorView.updateListener.of(update => {
            const prev = update.startState.field(collapsedKeysField)
            const next = update.state.field(collapsedKeysField)
            if (prev !== next) onCollapsedKeysChange(next)
        }),
    ]
}
