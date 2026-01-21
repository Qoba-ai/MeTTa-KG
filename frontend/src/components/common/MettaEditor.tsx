import { Component, onMount, createSignal, createEffect, Show } from "solid-js";
import { ParseError } from "../../types";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { mettaLanguage } from "../../syntax/mettaLanguage";

// Component Prop Interfaces
export interface MettaEditorProps {
  initialText: string;
  onTextChange: (text: string) => void;
  onPatternLoad: (pattern: string) => void;
  parseErrors: ParseError[];
  showActionButtons?: boolean;
}

const MettaEditor: Component<MettaEditorProps> = (props) => {
  const [text, setText] = createSignal(props.initialText);
  const [realTimeErrors, setRealTimeErrors] = createSignal<ParseError[]>([]);
  let editorRef: HTMLDivElement | undefined;
  let editorView: EditorView | undefined;

  // Handle text changes from CodeMirror
  const handleTextChange = (textValue: string) => {
    setText(textValue);
    props.onTextChange(textValue);

    // Perform real-time validation
    // const validation = validateSyntax(textValue);
    // setRealTimeErrors([...validation.errors, ...validation.warnings]);
    setRealTimeErrors([]);
  };

  onMount(() => {
    if (!editorRef) return;

    // Create CodeMirror editor
    const state = EditorState.create({
      doc: props.initialText,
      extensions: [
        basicSetup,
        mettaLanguage,
        syntaxHighlighting(defaultHighlightStyle),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newText = update.state.doc.toString();
            handleTextChange(newText);
          }
        }),
        EditorView.theme({
          "&": {
            fontSize: "13px",
            fontFamily:
              "'Courier New', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
            lineHeight: "1.5",
            background: "hsl(var(--background))",
            color: "hsl(var(--foreground))",
            border: "none",
            outline: "none",
          },
          ".cm-content": {
            padding: "8px",
            whiteSpace: "pre",
            wordWrap: "break-word",
            tabSize: "2",
            background: "hsl(var(--background))",
            color: "hsl(var(--foreground))",
            lineHeight: "1.5",
          },
          ".cm-gutters": {
            borderRight: "1px solid hsl(var(--border))",
            fontFamily:
              "'Courier New', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
            fontSize: "13px",
            lineHeight: "1.5",
            padding: "0px 4px",
            background: "hsl(var(--muted))",
            color: "hsl(var(--muted-foreground))",
          },
          ".cm-gutterElement": {
            textAlign: "right",
            paddingRight: "0px",
          },
          ".cm-activeLineGutter": {
            background: "hsl(var(--accent))",
            color: "hsl(var(--accent-foreground))",
            fontWeight: "600",
          },
          ".cm-activeLine": {
            background: "hsl(var(--accent) / 0.1)",
          },
          ".cm-selectionBackground": {
            background: "hsl(var(--primary) / 0.2)",
          },
          ".cm-cursor": {
            borderLeft: "2px solid hsl(var(--primary))",
          },
          ".cm-focused": {
            outline: "none",
          },
          ".cm-editor": {
            background: "hsl(var(--background))",
          },
          ".cm-scroller": {
            background: "hsl(var(--background))",
          },
          // Error and warning lines with theme colors
          ".cm-line.error-line": {
            backgroundColor: "hsl(var(--destructive) / 0.1) !important",
            borderLeft: "3px solid hsl(var(--destructive)) !important",
            paddingLeft: "5px !important",
            marginLeft: "-8px !important",
          },
          ".cm-line.warning-line": {
            backgroundColor: "hsl(var(--warning) / 0.1) !important",
            borderLeft: "3px solid hsl(var(--warning) / 0.8) !important",
            paddingLeft: "5px !important",
            marginLeft: "-8px !important",
          },
        }),
      ],
    });

    editorView = new EditorView({
      state,
      parent: editorRef,
    });
  });

  // Update editor content when props change (only on initial load)
  createEffect(() => {
    if (editorView && props.initialText !== text()) {
      // Only update if the editor is empty (initial load)
      if (editorView.state.doc.length === 0) {
        const transaction = editorView.state.update({
          changes: {
            from: 0,
            to: 0,
            insert: props.initialText,
          },
        });
        editorView.dispatch(transaction);
        setText(props.initialText);
      }
    }
  });

  return (
    <div class="flex flex-col h-full w-full box-border">
      <h3 class="m-0 mb-3 text-sm font-semibold flex-shrink-0 leading-tight text-foreground">
        {realTimeErrors().length > 0 && (
          <span class="ml-2 text-xs font-normal text-destructive">
            ({realTimeErrors().filter((e) => e.severity === "error").length}{" "}
            errors,{" "}
            {realTimeErrors().filter((e) => e.severity === "warning").length}{" "}
            warnings)
          </span>
        )}
      </h3>

      {/* Editor Container */}
      <div class="relative flex-1 min-h-0 mb-2 border border-border rounded bg-background overflow-hidden transition-all duration-300 ease-linear">
        {/* CodeMirror Editor */}
        <div ref={editorRef} class="h-full w-full bg-background" />
      </div>

      {/* Action Buttons */}
      <Show when={props.showActionButtons ?? true}>
        <div class="mb-2 flex gap-2 flex-shrink-0 items-center">
          <button
            class="px-2 py-1 text-xs border border-border rounded-sm bg-background text-foreground cursor-pointer transition-all duration-200 ease-linear hover:bg-accent hover:border-primary"
            onClick={() => {
              props.onPatternLoad(text());
            }}
          >
            Visualize
          </button>
        </div>
      </Show>

      {/* Error Display Panel - Commented out as in original */}
      {/* 
      {(realTimeErrors().length > 0 || props.parseErrors.length > 0) && (
        <div class="max-h-30 overflow-y-auto border border-border rounded bg-card flex-shrink-0 transition-all duration-300 ease-linear">
          <div class="p-2 text-xs font-semibold bg-muted text-muted-foreground border-b border-border">
            Issues ({realTimeErrors().filter(e => e.severity === 'error').length + props.parseErrors.filter(e => e.severity === 'error').length} errors, {realTimeErrors().filter(e => e.severity === 'warning').length + props.parseErrors.filter(e => e.severity === 'warning').length} warnings)
          </div>
          <div class="p-1">
            <For each={[...realTimeErrors(), ...props.parseErrors]}>
              {(error) => (
                <div class={`p-1 px-2 my-0.5 border-l-2 rounded-sm text-xs leading-tight transition-all duration-300 ease-linear ${
                  error.severity === 'error' 
                    ? 'border-l-destructive bg-destructive/10' 
                    : 'border-l-yellow-500 bg-yellow-500/10'
                }`}>
                  <div class={`font-semibold mb-0.5 ${
                    error.severity === 'error' ? 'text-destructive' : 'text-yellow-600'
                  }`}>
                    {error.severity === 'error' ? '⚠️' : '⚡'} Line {error.line}:{error.column}
                  </div>
                  <div class="text-foreground">
                    {error.message}
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      )}
      */}
    </div>
  );
};

export default MettaEditor;
