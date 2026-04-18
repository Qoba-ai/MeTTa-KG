import { Component, Show, createEffect, createSignal, For, on } from 'solid-js'
import { Portal } from 'solid-js/web'
import styles from './DslConsole.module.scss'
import { parse, executeSingle, serialize, CommandContext, CommandResult } from '../../lib/dsl'
import { HighlightedDsl, cleanPaste } from './highlightDsl'
import { Token } from '../../../../types'
import { BACKEND_URL } from '../../../../urls'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DslEntry {
    id: number
    type: 'dsl'
    input: string
    output: string
    ok: boolean
}

type HistoryEntry = DslEntry

let _id = 0
const nextId = () => ++_id

// ─── Help text ────────────────────────────────────────────────────────────────

const HELP = `\
MeTTa-KG console
Enter to run  ·  Shift+Enter for newline
↑ / ↓ to navigate command history

(import <space> <atom>...)
(transform (in <space> <pat>) ...
           (out <space> <tmpl>) ...)
(subtract  (in <space> <pat>) ...
           (out <space> <tmpl>) ...)
(clear        <space> [<pattern>])
(explore      <space>)
(count        <space>)
(assert-count   <space> <n>)
(assert-count   <space> = | != | < | <= | > | >= <n>)
(assert-content <space> <atom>...)
(wait           <ms>)    — pause N milliseconds

$/ refers to the active space
Multiple statements execute in sequence`

// ─── Component ───────────────────────────────────────────────────────────────

interface DslConsoleProps {
    activeNamespace: () => string
    token: () => Token | undefined
}

export const DslConsole: Component<DslConsoleProps> = (props) => {
    const [history, setHistory] = createSignal<HistoryEntry[]>([])
    const [input, setInput] = createSignal('')
    const [busy, setBusy] = createSignal(false)
    const [showHelp, setShowHelp] = createSignal(false)
    const [hintPos, setHintPos] = createSignal({ bottom: 0, right: 0 })

    // Command history for ↑/↓ navigation
    const [cmdHistory, setCmdHistory] = createSignal<string[]>([])
    const [histIdx, setHistIdx] = createSignal(-1)   // -1 = live draft
    const [draft, setDraft] = createSignal('')        // saved draft while navigating

    let scrollEndRef: HTMLDivElement | undefined
    let textareaRef: HTMLTextAreaElement | undefined
    let hintBtnRef: HTMLButtonElement | undefined

    const toggleHelp = () => {
        if (!showHelp() && hintBtnRef) {
            const rect = hintBtnRef.getBoundingClientRect()
            setHintPos({
                bottom: window.innerHeight - rect.top + 6,
                right: window.innerWidth - rect.right,
            })
        }
        setShowHelp(v => !v)
    }

    // Auto-scroll to bottom on new history entries
    createEffect(on(history, () => {
        scrollEndRef?.scrollIntoView({ behavior: 'smooth' })
    }, { defer: true }))

    // Auto-resize the textarea as the user types
    const adjustHeight = () => {
        if (!textareaRef) return
        textareaRef.style.height = 'auto'
        textareaRef.style.height = Math.min(textareaRef.scrollHeight, 200) + 'px'
    }

    // Move cursor to end of textarea (used after history navigation)
    const cursorToEnd = () => {
        requestAnimationFrame(() => {
            if (!textareaRef) return
            textareaRef.selectionStart = textareaRef.selectionEnd = textareaRef.value.length
            adjustHeight()
        })
    }

    const navigateHistory = (dir: 'up' | 'down') => {
        const hist = cmdHistory()
        if (hist.length === 0) return
        let idx = histIdx()

        if (dir === 'up') {
            if (idx === -1) {
                setDraft(input())
                idx = hist.length - 1
            } else {
                idx = Math.max(0, idx - 1)
            }
            setHistIdx(idx)
            setInput(hist[idx])
            cursorToEnd()
        } else {
            if (idx === -1) return
            idx += 1
            if (idx >= hist.length) {
                setHistIdx(-1)
                setInput(draft())
                cursorToEnd()
            } else {
                setHistIdx(idx)
                setInput(hist[idx])
                cursorToEnd()
            }
        }
    }

    const submit = async () => {
        const cmd = input().trim()
        if (!cmd || busy()) return

        // Push to command history (skip duplicate of last entry)
        setCmdHistory(prev =>
            prev.length > 0 && prev[prev.length - 1] === cmd ? prev : [...prev, cmd]
        )
        setHistIdx(-1)
        setDraft('')

        const t = props.token()
        if (!t) {
            setHistory(prev => [...prev, {
                id: nextId(), type: 'dsl', input: cmd,
                output: '; not authenticated — load a space first', ok: false,
            }])
            setInput('')
            if (textareaRef) textareaRef.style.height = 'auto'
            return
        }

        setInput('')
        if (textareaRef) textareaRef.style.height = 'auto'
        setBusy(true)

        const ctx: CommandContext = {
            backendUrl: BACKEND_URL,
            tokenCode: t.code,
            activeNamespace: props.activeNamespace(),
        }

        let exprs
        try {
            exprs = parse(cmd)
        } catch (e: any) {
            setHistory(prev => [...prev, {
                id: nextId(), type: 'dsl', input: cmd,
                output: `; parse error: ${e.message}`, ok: false,
            }])
            setBusy(false)
            return
        }

        if (exprs.length === 0) {
            setBusy(false)
            return
        }

        if (exprs.length === 1) {
            const result: CommandResult = await executeSingle(exprs[0], ctx)
            setHistory(prev => [...prev, {
                id: nextId(), type: 'dsl', input: cmd, output: result.output, ok: result.ok,
            }])
        } else {
            for (const expr of exprs) {
                const result: CommandResult = await executeSingle(expr, ctx)
                setHistory(prev => [...prev, {
                    id: nextId(), type: 'dsl',
                    input: serialize(expr),
                    output: result.output,
                    ok: result.ok,
                }])
            }
        }

        setBusy(false)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
            return
        }

        // ↑/↓ history navigation — only when the input is a single line,
        // so multi-line edits still get normal cursor movement.
        if (e.key === 'ArrowUp' && !input().includes('\n')) {
            e.preventDefault()
            navigateHistory('up')
            return
        }
        if (e.key === 'ArrowDown' && !input().includes('\n')) {
            e.preventDefault()
            navigateHistory('down')
            return
        }
    }

    return (
        <div class={styles.Console}>
            {/* ── Output history — scrollable ───────────────────────────── */}
            <div class={styles.ScrollArea} onClick={() => textareaRef?.focus()}>
                <For each={history()}>
                    {(entry) => (
                        <div class={styles.Entry}>
                            <div class={styles.InputLine}>
                                <span class={styles.Prompt}>&gt;</span>
                                <pre class={styles.InputText}><HighlightedDsl text={entry.input} /></pre>
                            </div>
                            {entry.output && (
                                <pre class={`${styles.Output} ${entry.ok ? styles.OutputOk : styles.OutputErr}`}>
                                    {entry.output}
                                </pre>
                            )}
                        </div>
                    )}
                </For>
                <div ref={scrollEndRef} />
            </div>

            {/* ── Input bar — anchored at the bottom ───────────────────── */}
            <div class={styles.InputBar}>
                <div class={styles.InputRow}>
                    <span class={styles.Prompt}>&gt;</span>
                    <div class={styles.InputAreaWrapper}>
                        {/* Syntax-highlighted mirror behind the transparent textarea */}
                        <div class={styles.InputHighlight} aria-hidden="true">
                            <HighlightedDsl text={input()} />{' '}
                        </div>
                        <textarea
                            ref={textareaRef}
                            class={styles.InputArea}
                            value={input()}
                            onInput={(e) => {
                                setInput((e.target as HTMLTextAreaElement).value)
                                setHistIdx(-1)
                                adjustHeight()
                            }}
                            onKeyDown={handleKeyDown}
                            onPaste={(e) => {
                                e.preventDefault()
                                const raw = e.clipboardData?.getData('text') ?? ''
                                const cleaned = cleanPaste(raw)
                                if (!cleaned) return
                                const ta = e.currentTarget
                                const next = input().slice(0, ta.selectionStart) + cleaned + input().slice(ta.selectionEnd)
                                const pos = ta.selectionStart + cleaned.length
                                setInput(next)
                                setHistIdx(-1)
                                requestAnimationFrame(() => {
                                    if (textareaRef) {
                                        textareaRef.selectionStart = textareaRef.selectionEnd = pos
                                        adjustHeight()
                                    }
                                })
                            }}
                            placeholder="(import $/ (= (foo) bar))   — Shift+Enter for newline"
                            rows={1}
                            disabled={busy()}
                            spellcheck={false}
                        />
                    </div>
                    <button
                        ref={hintBtnRef}
                        class={`${styles.HintBtn} ${showHelp() ? styles.HintBtnActive : ''}`}
                        onClick={toggleHelp}
                        title="Show commands reference"
                    >
                        ?
                    </button>
                    <button class={styles.SubmitBtn} onClick={submit} disabled={busy()}>
                        {busy() ? '…' : 'Run'}
                    </button>
                </div>
            </div>

            <Show when={showHelp()}>
                <Portal>
                    <div
                        class={styles.HintPanel}
                        style={{
                            position: 'fixed',
                            bottom: `${hintPos().bottom}px`,
                            right: `${hintPos().right}px`,
                        }}
                    >
                        <pre class={styles.HintText}>{HELP}</pre>
                    </div>
                </Portal>
            </Show>
        </div>
    )
}
