import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";

export const setOriginalContentEffect = StateEffect.define<string>();

const originalContentField = StateField.define<string>({
  create() { return "" },
  update(value, tr) {
    for (let e of tr.effects) if (e.is(setOriginalContentEffect)) value = e.value;
    return value;
  }
});

class GhostWidget extends WidgetType {
  constructor(readonly text: string) { super() }
  toDOM() {
    let span = document.createElement("span")
    span.textContent = this.text
    span.style.color = "var(--rp-subtle)"
    span.style.fontStyle = "italic"
    span.style.marginLeft = "6px"
    span.style.padding = "0 4px"
    span.style.backgroundColor = "rgba(120, 120, 120, 0.1)"
    span.style.borderRadius = "4px"
    span.style.opacity = "0.4"
    span.style.textDecoration = "line-through"
    span.style.fontSize = "0.85em"
    span.title = "Value previously in space"
    return span
  }
}

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

    const origLines = original.split("\n");
    const currLines = current.split("\n");
    const usedOrigIndices = new Set<number>();

    const tokenize = (s: string) => s.split(/(\s+|[()])/).filter(t => t.length > 0);
    
    // Pre-tokenize original lines to avoid redundant regex operations in the inner loop
    const origTokensCache = origLines.map(line => tokenize(line).filter(t => !/^\s+$/.test(t)));

    let currentPos = 0;
    
    for (let i = 0; i < currLines.length; i++) {
      const currLine = currLines[i];
      const lineStart = currentPos;
      
      if (currLine.trim() === "") {
          currentPos += currLine.length + 1;
          continue;
      }

      // Find best matching original line
      const currTokensRaw = tokenize(currLine);
      const currTokens = currTokensRaw.filter(t => !/^\s+$/.test(t));
      
      let bestScore = -1;
      let bestIdx = -1;

      // 1. Look for exact match nearby first
      for (let offset = 0; offset <= 5; offset++) {
          for (let dir of [1, -1]) {
              if (offset === 0 && dir === -1) continue;
              let j = i + offset * dir;
              if (j >= 0 && j < origLines.length && !usedOrigIndices.has(j) && origLines[j] === currLine) {
                  bestIdx = j;
                  bestScore = 2;
                  break;
              }
          }
          if (bestScore === 2) break;
      }

      // 2. If no exact match nearby, search for structural similarity
      if (bestScore < 2) {
          const startSearch = Math.max(0, i - 50);
          const endSearch = Math.min(origLines.length, i + 50);
          
          for (let j = startSearch; j < endSearch; j++) {
              if (usedOrigIndices.has(j)) continue;
              const ot = origTokensCache[j];
              
              let matches = 0;
              const minLen = Math.min(currTokens.length, ot.length);
              for (let k = 0; k < minLen; k++) {
                  if (currTokens[k] === ot[k]) matches++;
              }
              const score = matches / Math.max(currTokens.length, ot.length);
              
              if (score > bestScore) {
                  bestScore = score;
                  bestIdx = j;
              }
          }
      }

      if (bestIdx !== -1 && bestScore >= 1.0) {
          // Exact match found - in space. Apply light opacity to differentiate.
          usedOrigIndices.add(bestIdx);
          builder.add(lineStart, lineStart, Decoration.line({
            attributes: { style: "opacity: 0.7;" }
          }));
      } else if (bestIdx !== -1 && bestScore > 0.3) {
          // Modified line - keep normal opacity for new parts
          usedOrigIndices.add(bestIdx);
          const origTokensRaw = tokenize(origLines[bestIdx]);
          const origNonSpace = origTokensRaw.filter(t => !/^\s+$/.test(t));
          
          let linePos = lineStart;
          let structIdx = 0;
          for (const t of currTokensRaw) {
              const isSpace = /^\s+$/.test(t);
              if (!isSpace) {
                  const ot = origNonSpace[structIdx];
                  if (t !== "(" && t !== ")" && ot === t) {
                      // Unchanged part of a modified line
                      builder.add(linePos, linePos + t.length, Decoration.mark({
                        attributes: { style: "opacity: 0.7;" }
                      }));
                  } else if (t !== "(" && t !== ")" && ot !== t) {
                      // Modified token part - full opacity, dashed underline
                      builder.add(linePos, linePos + t.length, Decoration.mark({
                        attributes: { style: "border-bottom: 1px dashed var(--rp-gold);" }
                      }));
                      
                      if (ot && ot !== "(" && ot !== ")") {
                          builder.add(linePos + t.length, linePos + t.length, Decoration.widget({
                            widget: new GhostWidget(ot),
                            side: 1
                          }));
                      }
                  }
                  structIdx++;
              }
              linePos += t.length;
          }
      } else {
          // New line - full opacity, foam indicator
          builder.add(lineStart, lineStart, Decoration.line({
            attributes: { style: "background-color: rgba(156, 207, 216, 0.05); border-left: 4px solid var(--rp-foam);" }
          }));
      }
      
      currentPos += currLine.length + 1;
    }

    return builder.finish()
  }
}, {
  decorations: v => v.decorations
})

export const diffExtension = [originalContentField, diffPlugin];