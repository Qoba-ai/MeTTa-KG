import { Component, For } from 'solid-js'
import styles from './DslConsole.module.scss'

// ─── Paste cleaning ───────────────────────────────────────────────────────────

/** Strip the comment from a single line, respecting quoted strings. */
function stripLineComment(line: string): string {
    let inStr = false
    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (!inStr && ch === '"') { inStr = true; continue }
        if (inStr) {
            if (ch === '\\') { i++; continue }   // escaped char
            if (ch === '"')  { inStr = false }
            continue
        }
        if (ch === ';') return line.slice(0, i)
    }
    return line
}

/**
 * Clean pasted DSL text: strip line comments and blank lines.
 * Keeps code compact and removes noise from copy-pasted script files.
 */
export function cleanPaste(text: string): string {
    return text
        .split('\n')
        .map(line => stripLineComment(line).trim())
        .filter(line => line.length > 0)
        .join('\n')
}

// ─── Token types ──────────────────────────────────────────────────────────────

type TokType = 'command' | 'spaceRef' | 'variable' | 'string' | 'number' | 'comment' | 'paren' | 'plain'

interface Tok { text: string; type: TokType }

// ─── Known DSL commands ───────────────────────────────────────────────────────

const COMMANDS = new Set(['import', 'transform', 'clear', 'explore', 'count', 'assert-count', 'assert-content', 'subtract', 'wait'])

// ─── Tokenizer ────────────────────────────────────────────────────────────────

/**
 * Tokenize a MeTTa-KG DSL string into typed tokens.
 *
 * Commands (import, clear, etc.) are only typed as 'command' when they appear
 * as the head of a top-level expression — never as bare atoms.
 */
export function tokenizeDsl(input: string): Tok[] {
    const toks: Tok[] = []
    let i = 0
    let depth = 0
    // Set to true after '(' at depth 0; cleared by the first non-whitespace token.
    // This ensures we only highlight KNOWN commands in command position.
    let awaitCmd = false

    const push = (text: string, type: TokType) => { if (text) toks.push({ text, type }) }

    while (i < input.length) {
        const ch = input[i]

        // Comment: ';' to end of line
        if (ch === ';') {
            let j = i
            while (j < input.length && input[j] !== '\n') j++
            push(input.slice(i, j), 'comment')
            i = j
            continue
        }

        // Whitespace — preserve verbatim; do NOT clear awaitCmd
        if (/\s/.test(ch)) {
            let j = i
            while (j < input.length && /\s/.test(input[j])) j++
            push(input.slice(i, j), 'plain')
            i = j
            continue
        }

        // Open paren
        if (ch === '(') {
            if (depth === 0) awaitCmd = true
            depth++
            push('(', 'paren')
            i++
            continue
        }

        // Close paren
        if (ch === ')') {
            depth = Math.max(0, depth - 1)
            awaitCmd = false
            push(')', 'paren')
            i++
            continue
        }

        // Quoted string
        if (ch === '"') {
            let s = '"'
            i++
            while (i < input.length && input[i] !== '"') {
                if (input[i] === '\\') s += input[i++]
                if (i < input.length) s += input[i++]
            }
            s += '"'
            if (i < input.length) i++
            awaitCmd = false
            push(s, 'string')
            continue
        }

        // Atom: anything up to whitespace, parens, quote, or semicolon
        let atom = ''
        while (i < input.length && !/[\s()";\n]/.test(input[i])) atom += input[i++]
        if (!atom) { i++; continue }

        let type: TokType
        if (awaitCmd) {
            // Only highlight as 'command' if it's a known DSL command
            type = COMMANDS.has(atom) ? 'command' : 'plain'
            awaitCmd = false
        } else if (atom === '$/' || atom === '$_') {
            // Active-space shorthand
            type = 'spaceRef'
        } else if (/^\/($|[\w%])/.test(atom)) {
            // Absolute space path: /foo/bar/ or /
            type = 'spaceRef'
        } else if (atom.startsWith('$')) {
            // Variable: $foo
            type = 'variable'
        } else if (/^-?\d+(\.\d+)?$/.test(atom)) {
            type = 'number'
        } else {
            type = 'plain'
        }

        push(atom, type)
    }

    return toks
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { text: string }

export const HighlightedDsl: Component<Props> = (props) => (
    <For each={tokenizeDsl(props.text)}>
        {(tok) =>
            tok.type === 'plain'
                ? <>{tok.text}</>
                : <span class={styles[`tok_${tok.type}` as keyof typeof styles]}>{tok.text}</span>
        }
    </For>
)
