import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";

export const setOriginalContentEffect = StateEffect.define<string>();

const originalContentField = StateField.define<string>({
  create() { return "" },
  update(value, tr) {
    for (let e of tr.effects) if (e.is(setOriginalContentEffect)) value = e.value;
    return value;
  }
});


const diffPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet

  constructor(view: EditorView) {
    this.decorations = this.computeDecorations(view)
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.startState.field(originalContentField) != update.state.field(originalContentField)) {
      this.decorations = this.computeDecorations(update.view)
    }
  }

  computeDecorations(view: EditorView) {
    let builder = new RangeSetBuilder<Decoration>()
    let original = view.state.field(originalContentField)
    let current = view.state.doc.toString()

    if (!original || original.trim() === "") return Decoration.none

    // Build a multiset of original lines for content-based (position-independent) matching
    const origCounts = new Map<string, number>()
    for (const line of original.split("\n")) {
      const t = line.trim()
      if (t) origCounts.set(t, (origCounts.get(t) ?? 0) + 1)
    }

    const currLines = current.split("\n")
    let currentPos = 0

    for (let i = 0; i < currLines.length; i++) {
      const currLine = currLines[i]
      const lineStart = currentPos

      if (currLine.trim() !== "") {
        const t = currLine.trim()
        const count = origCounts.get(t) ?? 0
        if (count > 0) {
          origCounts.set(t, count - 1)
        } else {
          // Line not present in original — user-added content
          builder.add(lineStart, lineStart, Decoration.line({
            attributes: { style: "background-color: rgba(156, 207, 216, 0.05); border-left: 4px solid var(--rp-foam);" }
          }))
        }
      }

      currentPos += currLine.length + 1
    }

    return builder.finish()
  }
}, {
  decorations: v => v.decorations
})

export const diffExtension = [originalContentField, diffPlugin];