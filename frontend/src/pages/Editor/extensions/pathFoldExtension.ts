import { Prec, RangeSetBuilder } from '@codemirror/state'
import {
    EditorView,
    ViewPlugin,
    ViewUpdate,
    Decoration,
    DecorationSet,
    WidgetType,
    keymap,
} from '@codemirror/view'

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

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

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
// ViewPlugin — replaces |$| fringe markers with FringeWidget decorations
// ---------------------------------------------------------------------------

const pathFoldPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet

        constructor(view: EditorView) {
            this.decorations = this.compute(view)
        }

        update(u: ViewUpdate) {
            if (u.docChanged) {
                this.decorations = this.compute(u.view)
            }
        }

        compute(view: EditorView): DecorationSet {
            const doc = view.state.doc
            const builder = new RangeSetBuilder<Decoration>()

            for (let i = 1; i <= doc.lines; i++) {
                const line = doc.line(i)
                const text = line.text
                if (text.trim() === '') continue

                const fringeMatch = /\|\$\|\)/.exec(text)
                if (fringeMatch) {
                    const markerPos = line.from + text.indexOf('|$|')
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
// Helpers — find fringe marker positions in the document
// ---------------------------------------------------------------------------

function findFringeRanges(view: EditorView): Array<{ from: number; to: number; path: string }> {
    const doc = view.state.doc
    const ranges: Array<{ from: number; to: number; path: string }> = []
    for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i)
        const text = line.text
        if (text.trim() === '') continue
        const fringeMatch = /\|\$\|\)/.exec(text)
        if (fringeMatch) {
            const markerPos = line.from + text.indexOf('|$|')
            const pathTokens = extractLinePathTokens(text)
            if (pathTokens.length > 0) {
                ranges.push({ from: markerPos, to: markerPos + 3, path: pathTokens.join('/') })
            }
        }
    }
    return ranges
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the path-fold extension.
 * `onFringeClick` is called when a user clicks a $ fringe marker in the editor.
 */
export function createPathFoldExtension(
    onFringeClick?: (path: string) => void,
) {
    // High-priority keymap: intercept Delete/Backspace adjacent to a fringe marker
    // and expand it instead of deleting.
    const fringeKeymap = Prec.high(keymap.of([
        {
            key: 'Backspace',
            run(view) {
                const sel = view.state.selection.main
                if (!sel.empty) return false
                for (const r of findFringeRanges(view)) {
                    if (sel.head === r.to) {
                        onFringeClick?.(r.path)
                        return true
                    }
                }
                return false
            },
        },
        {
            key: 'Delete',
            run(view) {
                const sel = view.state.selection.main
                if (!sel.empty) return false
                for (const r of findFringeRanges(view)) {
                    if (sel.head === r.from) {
                        onFringeClick?.(r.path)
                        return true
                    }
                }
                return false
            },
        },
    ]))

    return [
        pathFoldPlugin,
        // Treat the |$| text as an atomic unit so cursor jumps over it as one glyph.
        EditorView.atomicRanges.of(view => {
            const builder = new RangeSetBuilder<Decoration>()
            for (const r of findFringeRanges(view)) {
                builder.add(r.from, r.to, Decoration.mark({}))
            }
            return builder.finish()
        }),
        fringeKeymap,
        // Handle clicks on fringe $ widgets
        EditorView.domEventHandlers({
            click(event, _) {
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
