import { Component, onMount, createSignal, createEffect, For, Show } from 'solid-js';
import { ParseError } from '../../types';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { mettaLanguage } from '../../syntax/mettaLanguage';
import toast from 'solid-toast';

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

  // Simple syntax validation for standalone component
  const validateSyntax = (textValue: string): { errors: ParseError[]; warnings: ParseError[] } => {
    const errors: ParseError[] = [];
    const warnings: ParseError[] = [];
    const lines = textValue.split('\n');

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const trimmedLine = line.trim();

      // Check for unmatched parentheses
      if (trimmedLine.includes('(') && !trimmedLine.includes(')')) {
        errors.push({
          line: lineNumber,
          column: trimmedLine.indexOf('(') + 1,
          message: 'Unmatched opening parenthesis',
          severity: 'error'
        });
      }

      if (trimmedLine.includes(')') && !trimmedLine.includes('(')) {
        errors.push({
          line: lineNumber,
          column: trimmedLine.indexOf(')') + 1,
          message: 'Unmatched closing parenthesis',
          severity: 'error'
        });
      }

      // Check for empty expressions
      if (trimmedLine.startsWith('(') && trimmedLine.endsWith(')') && trimmedLine.length <= 2) {
        warnings.push({
          line: lineNumber,
          column: 1,
          message: 'Empty expression',
          severity: 'warning'
        });
      }
    });

    return { errors, warnings };
  };

  // Handle text changes from CodeMirror
  const handleTextChange = (textValue: string) => {
    setText(textValue);
    props.onTextChange(textValue);

    // Perform real-time validation
    const validation = validateSyntax(textValue);
    setRealTimeErrors([...validation.errors, ...validation.warnings]);
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
            fontFamily: "'Courier New', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
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
            fontFamily: "'Courier New', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
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
            insert: props.initialText
          }
        });
        editorView.dispatch(transaction);
        setText(props.initialText);
      }
    }
  });

  // Update the Clear button onClick handler:
  const clearEditor = () => {
    if (editorView) {
      const transaction = editorView.state.update({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: ''
        }
      });
      editorView.dispatch(transaction);
      setText('');
      props.onTextChange('');
    }
  };

  return (
    <div style="
      display: flex; 
      flex-direction: column; 
      height: 100%; 
      width: 100%;
      box-sizing: border-box;
    ">
      <h3 style="
        margin: 0 0 12px 0; 
        font-size: 14px; 
        font-weight: 600; 
        flex-shrink: 0;
        line-height: 1.2;
        color: hsl(var(--foreground));
      ">
        {realTimeErrors().length > 0 && (
          <span style="
            margin-left: 8px;
            font-size: 11px;
            font-weight: normal;
            color: hsl(var(--destructive));
          ">
            ({realTimeErrors().filter(e => e.severity === 'error').length} errors, {realTimeErrors().filter(e => e.severity === 'warning').length} warnings)
          </span>
        )}
      </h3>

      {/* Editor Container */}
      <div style="
        position: relative;
        flex: 1;
        min-height: 0;
        margin-bottom: 8px;
        border: 1px solid hsl(var(--border));
        border-radius: 4px;
        background: hsl(var(--background));
        overflow: hidden;
        transition: all 0.3s ease;
      ">
        {/* CodeMirror Editor */}
        <div
          ref={editorRef}
          style="
            height: 100%;
            width: 100%;
            background: hsl(var(--background));
          "
        />
      </div>

      {/* Action Buttons */}
      <Show when={props.showActionButtons ?? true}>
        <div style="
          margin-bottom: 8px; 
          display: flex; 
          gap: 8px; 
          flex-shrink: 0;
          align-items: center;
        ">
          <button
            style="
              padding: 4px 8px; 
              font-size: 11px; 
              border: 1px solid hsl(var(--border)); 
              border-radius: 3px; 
              background: hsl(var(--background)); 
              color: hsl(var(--foreground));
              cursor: pointer;
              transition: all 0.2s ease;
            "
            onClick={() => {
                props.onPatternLoad(text())
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'hsl(var(--accent))';
              e.currentTarget.style.borderColor = 'hsl(var(--primary))';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'hsl(var(--background))';
              e.currentTarget.style.borderColor = 'hsl(var(--border))';
            }}
          >
            Load Pattern
          </button>
          <button
            style="
              padding: 4px 8px; 
              font-size: 11px; 
              border: 1px solid hsl(var(--border)); 
              border-radius: 3px; 
              background: hsl(var(--background)); 
              color: hsl(var(--foreground));
              cursor: pointer;
              transition: all 0.2s ease;
            "
            onClick={clearEditor} // Use the new function
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'hsl(var(--accent))';
              e.currentTarget.style.borderColor = 'hsl(var(--primary))';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'hsl(var(--background))';
              e.currentTarget.style.borderColor = 'hsl(var(--border))';
            }}
          >
            Clear
          </button>
        </div>
      </Show>

      {/* Error Display Panel - Updated with theme colors */}
      {(realTimeErrors().length > 0 || props.parseErrors.length > 0) && (
        <div style="
          max-height: 120px;
          overflow-y: auto;
          border: 1px solid hsl(var(--border));
          border-radius: 4px;
          background: hsl(var(--card));
          flex-shrink: 0;
          transition: all 0.3s ease;
        ">
          <div style="
            padding: 8px;
            font-size: 11px;
            font-weight: 600;
            background: hsl(var(--muted));
            color: hsl(var(--muted-foreground));
            border-bottom: 1px solid hsl(var(--border));
          ">
            Issues ({realTimeErrors().filter(e => e.severity === 'error').length + props.parseErrors.filter(e => e.severity === 'error').length} errors, {realTimeErrors().filter(e => e.severity === 'warning').length + props.parseErrors.filter(e => e.severity === 'warning').length} warnings)
          </div>
          <div style="padding: 4px;">
            <For each={[...realTimeErrors(), ...props.parseErrors]}>
              {(error) => (
                <div style={`
                  padding: 4px 8px;
                  margin: 2px 0;
                  border-left: 3px solid ${error.severity === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--warning) / 0.8)'};
                  background: ${error.severity === 'error' ? 'hsl(var(--destructive) / 0.1)' : 'hsl(var(--warning) / 0.1)'};
                  border-radius: 2px;
                  font-size: 11px;
                  line-height: 1.3;
                  transition: all 0.3s ease;
                `}>
                  <div style={`
                    font-weight: 600;
                    color: ${error.severity === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--warning))'};
                    margin-bottom: 2px;
                  `}>
                    {error.severity === 'error' ? '⚠️' : '⚡'} Line {error.line}:{error.column}
                  </div>
                  <div style="color: hsl(var(--foreground));">
                    {error.message}
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      )}
    </div>
  );
};

export default MettaEditor;