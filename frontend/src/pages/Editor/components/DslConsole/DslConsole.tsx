import { Component, Show, createEffect, createSignal, For, on } from 'solid-js'
import { Portal } from 'solid-js/web'
import styles from './DslConsole.module.scss'
import { parse, executeSingle, serialize, CommandContext, CommandResult } from '../../lib/dsl'
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

(import <space> <atom>...)
(transform (in <space> <pat>) ...
           (out <space> <tmpl>) ...)
(clear        <space> [<pattern>])
(explore      <space>)
(count        <space>)
(assert-count <space> <n>)
(assert-count <space> = | != | < | <= | > | >= <n>)
(wait         <ms>)    — pause N milliseconds

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
        textareaRef.style.height = Math.min(textareaRef.scrollHeight, 300) + 'px'
    }

    const submit = async () => {
        const cmd = input().trim()
        if (!cmd || busy()) return

        const t = props.token()
        if (!t) {
            setHistory(prev => [...prev, {
                id: nextId(), type: 'dsl', input: cmd,
                output: '; not authenticated — load a space first', ok: false,
            }])
            return
        }

        setInput('')
        if (textareaRef) {
            textareaRef.style.height = 'auto'
        }
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
        }
        // Shift+Enter: browser inserts a newline naturally
    }

    return (
        <div class={styles.Console}>
            <div class={styles.ScrollArea}>
                <For each={history()}>
                    {(entry) => (
                        <div class={styles.Entry}>
                            <div class={styles.InputLine}>
                                <span class={styles.Prompt}>&gt;</span>
                                <pre class={styles.InputText}>{entry.input}</pre>
                            </div>
                            {entry.output && (
                                <pre class={`${styles.Output} ${entry.ok ? styles.OutputOk : styles.OutputErr}`}>
                                    {entry.output}
                                </pre>
                            )}
                        </div>
                    )}
                </For>

                {/* Inline input prompt — sits at the bottom of the scroll area */}
                <div class={styles.InputRow}>
                    <span class={styles.Prompt}>&gt;</span>
                    <textarea
                        ref={textareaRef}
                        class={styles.InputArea}
                        value={input()}
                        onInput={(e) => {
                            setInput((e.target as HTMLTextAreaElement).value)
                            adjustHeight()
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="(import $/ (= (foo) bar))   — Shift+Enter for newline"
                        rows={1}
                        disabled={busy()}
                        spellcheck={false}
                    />
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

                <div ref={scrollEndRef} />
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
