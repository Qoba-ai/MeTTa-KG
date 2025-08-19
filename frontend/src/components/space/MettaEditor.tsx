import { Component, onMount, createSignal, createEffect, For } from 'solid-js';
import { ParseError } from '../../types';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { mettaLanguage } from '../../syntax/mettaLanguage';

export interface MettaEditorProps {
  initialText: string;
  onTextChange: (text: string) => void;
  onFileUpload: (file: File) => void;
  parseErrors: ParseError[];
}

const MettaEditor: Component<MettaEditorProps> = (props) => {
  const [text, setText] = createSignal(props.initialText);
  const [realTimeErrors, setRealTimeErrors] = createSignal<ParseError[]>([]);
  const [lineNumbers, setLineNumbers] = createSignal<number[]>([]);
  let editorRef: HTMLDivElement | undefined;
  let editorView: EditorView | undefined;

  // Update line numbers when text changes
  const updateLineNumbers = (textValue: string) => {
    const lines = textValue.split('\n');
    setLineNumbers(lines.map((_, index) => index + 1));
  };

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
    updateLineNumbers(textValue);
    
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
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#374151",
            caretColor: "#374151",
          },
          ".cm-content": {
            padding: "8px",
            whiteSpace: "pre",
            wordWrap: "break-word",
            tabSize: "2",
          },
          ".cm-line": {
            lineHeight: "1.5",
            minHeight: "1.5em",
          },
          ".cm-gutters": {
            background: "rgba(248, 250, 252, 0.9)",
            borderRight: "1px solid var(--border-light)",
            color: "#6b7280",
            fontFamily: "'Courier New', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
            fontSize: "13px",
            lineHeight: "1.5",
            padding: "8px 4px",
          },
          ".cm-gutterElement": {
            textAlign: "right",
            paddingRight: "8px",
          },
          ".cm-activeLineGutter": {
            background: "rgba(59, 130, 246, 0.1)",
            color: "#1d4ed8",
            fontWeight: "600",
          },
          ".cm-activeLine": {
            background: "rgba(59, 130, 246, 0.05)",
          },
          ".cm-selectionBackground": {
            background: "rgba(59, 130, 246, 0.2)",
          },
          ".cm-cursor": {
            borderLeft: "2px solid #374151",
          },
          // Error line styling
          ".cm-line.error-line": {
            backgroundColor: "rgba(220, 38, 38, 0.1) !important",
            borderLeft: "3px solid #dc2626 !important",
            paddingLeft: "5px !important",
            marginLeft: "-8px !important",
          },
          ".cm-line.warning-line": {
            backgroundColor: "rgba(245, 158, 11, 0.1) !important",
            borderLeft: "3px solid #f59e0b !important",
            paddingLeft: "5px !important",
            marginLeft: "-8px !important",
          },
          // Syntax highlighting colors
          ".cm-keyword": { color: "#d73a49", fontWeight: "600" },
          ".cm-operator": { color: "#d73a49" },
          ".cm-variable": { color: "#24292e" },
          ".cm-variable-2": { color: "#24292e" },
          ".cm-string": { color: "#032f62" },
          ".cm-number": { color: "#005cc5" },
          ".cm-comment": { color: "#6a737d", fontStyle: "italic" },
          ".cm-punctuation": { color: "#24292e" },
          ".cm-bracket": { color: "#24292e" },
          ".cm-propertyName": { color: "#005cc5" },
          ".cm-definition.cm-variable": { color: "#6f42c1" },
          ".cm-definition.cm-variable-2": { color: "#6f42c1" },
          ".cm-definition.cm-variable-3": { color: "#6f42c1" },
          ".cm-meta": { color: "#24292e" },
          ".cm-link": { color: "#005cc5" },
          ".cm-url": { color: "#005cc5" },
        }),
      ],
    });

    editorView = new EditorView({
      state,
      parent: editorRef,
    });

    updateLineNumbers(props.initialText);
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
        updateLineNumbers(props.initialText);
      }
    }
  });

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
      ">
        {realTimeErrors().length > 0 && (
          <span style="
            margin-left: 8px;
            font-size: 11px;
            font-weight: normal;
            color: #dc2626;
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
        border: 1px solid var(--border-light);
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.8);
        overflow: hidden;
      ">
        {/* CodeMirror Editor */}
        <div
          ref={editorRef}
          style="
            height: 100%;
            width: 100%;
          "
        />
      </div>

      {/* Action Buttons */}
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
            border: 1px solid var(--border-light); 
            border-radius: 3px; 
            background: white; 
            cursor: pointer;
            transition: all 0.2s ease;
          "
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.metta,.txt';
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) props.onFileUpload(file);
            };
            input.click();
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-primary)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
        >
          Load File
        </button>
        <button
          style="
            padding: 4px 8px; 
            font-size: 11px; 
            border: 1px solid var(--border-light); 
            border-radius: 3px; 
            background: white; 
            cursor: pointer;
            transition: all 0.2s ease;
          "
          onClick={() => {
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
              updateLineNumbers('');
            }
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-primary)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
        >
          Clear
        </button>
      </div>

      {/* Error Display Panel */}
      {(realTimeErrors().length > 0 || props.parseErrors.length > 0) && (
        <div style="
          max-height: 120px;
          overflow-y: auto;
          border: 1px solid var(--border-light);
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.95);
          flex-shrink: 0;
        ">
          <div style="
            padding: 8px;
            font-size: 11px;
            font-weight: 600;
            background: rgba(248, 250, 252, 0.8);
            border-bottom: 1px solid var(--border-light);
          ">
            Issues ({realTimeErrors().filter(e => e.severity === 'error').length + props.parseErrors.filter(e => e.severity === 'error').length} errors, {realTimeErrors().filter(e => e.severity === 'warning').length + props.parseErrors.filter(e => e.severity === 'warning').length} warnings)
          </div>
          <div style="padding: 4px;">
            <For each={[...realTimeErrors(), ...props.parseErrors]}>
              {(error) => (
                <div style={`
                  padding: 4px 8px;
                  margin: 2px 0;
                  border-left: 3px solid ${error.severity === 'error' ? '#dc2626' : '#f59e0b'};
                  background: ${error.severity === 'error' ? 'rgba(220, 38, 38, 0.05)' : 'rgba(245, 158, 11, 0.05)'};
                  border-radius: 2px;
                  font-size: 11px;
                  line-height: 1.3;
                `}>
                  <div style={`
                    font-weight: 600;
                    color: ${error.severity === 'error' ? '#dc2626' : '#f59e0b'};
                    margin-bottom: 2px;
                  `}>
                    {error.severity === 'error' ? '⚠️' : '⚡'} Line {error.line}:{error.column}
                  </div>
                  <div style="color: #374151;">
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