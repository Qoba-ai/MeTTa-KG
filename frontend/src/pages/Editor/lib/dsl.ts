/**
 * MeTTa-KG DSL
 *
 * A small MeTTa-syntax language for interacting with KG spaces from the
 * editor console.  Four commands are supported:
 *
 *   (import <space> <atom>...)
 *     – POST atoms as MeTTa text to the given space.
 *
 *   (transform (in <space> <pattern>) ... (out <space> <template>) ...)
 *     – PUT a pattern-matching transformation between spaces.
 *
 *   (clear <space>)
 *     – DELETE all atoms from the given space.
 *
 *   (explore <space>)
 *     – GET and display atoms in the given space.
 *
 *   (subtract (in <space> <pattern>) ... (out <space> <template>) ...)
 *     – POST a subtract operation with the same clause syntax as transform.
 *
 * Space references
 *   /              – root space
 *   /foo/bar/      – concrete path  (leading and trailing / are added if missing)
 *   $/             – active tab's namespace (shorthand)
 */

// ─── S-expression types ───────────────────────────────────────────────────────

export type SAtom = string
export type SList = SExpr[]
export type SExpr = SAtom | SList

// ─── Tokenizer ────────────────────────────────────────────────────────────────

function tokenize(input: string): string[] {
    const tokens: string[] = []
    let i = 0
    while (i < input.length) {
        const ch = input[i]
        // Whitespace
        if (/\s/.test(ch)) { i++; continue }
        // Line comment
        if (ch === ';') { while (i < input.length && input[i] !== '\n') i++; continue }
        // Parens
        if (ch === '(' || ch === ')') { tokens.push(ch); i++; continue }
        // Quoted string (pass through as a single token including the quotes)
        if (ch === '"') {
            let s = '"'; i++
            while (i < input.length && input[i] !== '"') {
                if (input[i] === '\\') { s += input[i++] }
                if (i < input.length) s += input[i++]
            }
            s += '"'
            if (i < input.length) i++ // consume closing "
            tokens.push(s)
            continue
        }
        // Atom: anything up to whitespace, parens, or quote
        let atom = ''
        while (i < input.length && !/[\s()";\n]/.test(input[i])) atom += input[i++]
        if (atom) tokens.push(atom)
    }
    return tokens
}

// ─── Parser ───────────────────────────────────────────────────────────────────

interface ParseState { tokens: string[]; pos: number }

function parseOne(s: ParseState): SExpr | null {
    if (s.pos >= s.tokens.length) return null
    const tok = s.tokens[s.pos]
    if (tok === ')') return null
    if (tok === '(') {
        s.pos++
        const items: SExpr[] = []
        while (s.pos < s.tokens.length && s.tokens[s.pos] !== ')') {
            const item = parseOne(s)
            if (item !== null) items.push(item)
        }
        if (s.pos < s.tokens.length) s.pos++ // consume ')'
        return items
    }
    s.pos++
    return tok
}

/** Parse zero or more top-level S-expressions from a string. */
export function parse(input: string): SExpr[] {
    const s: ParseState = { tokens: tokenize(input), pos: 0 }
    const exprs: SExpr[] = []
    while (s.pos < s.tokens.length) {
        const e = parseOne(s)
        if (e !== null) exprs.push(e)
    }
    return exprs
}

/** Serialize an S-expression back to MeTTa text. */
export function serialize(expr: SExpr): string {
    if (typeof expr === 'string') return expr
    return '(' + expr.map(serialize).join(' ') + ')'
}

// ─── Space reference resolution ───────────────────────────────────────────────

/** Returns the resolved path string, or throws a string error message. */
function resolveSpace(ref: SExpr, activeNs: string): string {
    if (ref === '$/' || ref === '$_') return activeNs
    if (typeof ref !== 'string') {
        throw 'Space reference must be a path like /foo/bar/ or the shorthand $/'
    }
    if (ref.startsWith('$')) {
        throw `Unknown variable: ${ref}. Use $/ to refer to the active space.`
    }
    let p = ref
    if (p !== '/' && !p.startsWith('/')) p = '/' + p
    if (!p.endsWith('/')) p = p + '/'
    return p
}

// ─── Command context and result ───────────────────────────────────────────────

export interface CommandContext {
    backendUrl: string
    tokenCode: string
    activeNamespace: string
}

export interface CommandResult {
    ok: boolean
    output: string
}

// ─── Command executors ────────────────────────────────────────────────────────

async function runImport(args: SExpr[], ctx: CommandContext): Promise<CommandResult> {
    if (args.length < 2) {
        return { ok: false, output: '; usage: (import <space> <atom>...)' }
    }
    let space: string
    try { space = resolveSpace(args[0], ctx.activeNamespace) }
    catch (e) { return { ok: false, output: `; ${e}` } }

    const atoms = args.slice(1)
    const content = atoms.map(serialize).join('\n')
    const encodedPath = space.split('/').map(encodeURIComponent).join('/')

    try {
        const resp = await fetch(`${ctx.backendUrl}/spaces${encodedPath}`, {
            method: 'POST',
            headers: { Authorization: ctx.tokenCode },
            body: content,
        })
        if (resp.ok) return { ok: true, output: `; imported ${atoms.length} atom(s) into ${space}` }
        return { ok: false, output: `; import failed (HTTP ${resp.status})` }
    } catch (e: any) {
        return { ok: false, output: `; import error: ${e.message}` }
    }
}

async function runTransform(args: SExpr[], ctx: CommandContext): Promise<CommandResult> {
    const inClauses:  { space: string; pat: string }[] = []
    const outClauses: { space: string; tmpl: string }[] = []

    for (const arg of args) {
        if (!Array.isArray(arg) || arg.length < 3) {
            return { ok: false, output: '; usage: (transform (in <space> <pattern>) ... (out <space> <template>) ...)' }
        }
        const [dir, spaceRef, sexpr] = arg
        if (sexpr === undefined) {
            return { ok: false, output: '; each clause needs exactly: direction space pattern-or-template' }
        }
        let space: string
        try { space = resolveSpace(spaceRef, ctx.activeNamespace) }
        catch (e) { return { ok: false, output: `; ${e}` } }
        const expr = serialize(sexpr)

        if (dir === 'in')  inClauses.push({ space, pat: expr })
        else if (dir === 'out') outClauses.push({ space, tmpl: expr })
        else return { ok: false, output: `; unknown clause direction '${dir}' — use 'in' or 'out'` }
    }

    if (inClauses.length === 0)  return { ok: false, output: '; transform needs at least one (in ...) clause' }
    if (outClauses.length === 0) return { ok: false, output: '; transform needs at least one (out ...) clause' }

    // Strip leading slash: backend expects paths without leading /
    const input_spaces  = inClauses.map(c => c.space.replace(/^\//, ''))
    const output_spaces = outClauses.map(c => c.space.replace(/^\//, ''))
    const patterns      = inClauses.map(c => c.pat)
    const templates     = outClauses.map(c => c.tmpl)

    try {
        const resp = await fetch(`${ctx.backendUrl}/spaces`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: ctx.tokenCode },
            body: JSON.stringify({ input_spaces, output_spaces, patterns, templates }),
        })
        if (resp.ok) return { ok: true, output: '; transform dispatched' }
        if (resp.status === 422) return { ok: false, output: '; transform rejected: unbalanced parentheses in pattern or template' }
        if (resp.status === 400) return { ok: false, output: '; transform rejected: mismatched number of spaces and patterns/templates' }
        return { ok: false, output: `; transform failed (HTTP ${resp.status})` }
    } catch (e: any) {
        return { ok: false, output: `; transform error: ${e.message}` }
    }
}

async function runClear(args: SExpr[], ctx: CommandContext): Promise<CommandResult> {
    if (args.length < 1) return { ok: false, output: '; usage: (clear <space>) or (clear <space> <pattern>)' }
    let space: string
    try { space = resolveSpace(args[0], ctx.activeNamespace) }
    catch (e) { return { ok: false, output: `; ${e}` } }

    const pattern: string | null = args.length >= 2 ? serialize(args[1]) : null

    const segments = space.split('/').filter((s: string) => s.length > 0)
    const encodedPath = segments.map(encodeURIComponent).join('/')
    const basePath = segments.length > 0
        ? `${ctx.backendUrl}/spaces/${encodedPath}`
        : `${ctx.backendUrl}/spaces`
    const url = pattern !== null
        ? `${basePath}?pattern=${encodeURIComponent(pattern)}`
        : basePath

    try {
        const resp = await fetch(url, {
            method: 'DELETE',
            headers: { Authorization: ctx.tokenCode },
        })
        if (resp.ok) {
            const desc = pattern !== null ? `pattern ${pattern}` : 'all atoms'
            return { ok: true, output: `; cleared ${desc} from ${space}` }
        }
        return { ok: false, output: `; clear failed (HTTP ${resp.status})` }
    } catch (e: any) {
        return { ok: false, output: `; clear error: ${e.message}` }
    }
}

async function runExplore(args: SExpr[], ctx: CommandContext): Promise<CommandResult> {
    if (args.length < 1) return { ok: false, output: '; usage: (explore <space>)' }
    let space: string
    try { space = resolveSpace(args[0], ctx.activeNamespace) }
    catch (e) { return { ok: false, output: `; ${e}` } }

    let ns = space
    if (ns.startsWith('/')) ns = ns.substring(1)
    if (ns.endsWith('/')) ns = ns.slice(0, -1)
    const encodedNs = ns.split('/').filter((s: string) => s.length > 0).map(encodeURIComponent).join('/')

    const url = encodedNs.length > 0
        ? `${ctx.backendUrl}/explore/${encodedNs}?focus_token=`
        : `${ctx.backendUrl}/explore?focus_token=`

    try {
        const resp = await fetch(url, { headers: { Authorization: ctx.tokenCode } })
        if (!resp.ok) return { ok: false, output: `; explore failed (HTTP ${resp.status})` }

        const data = await resp.json()
        const subspaces: [string, string][] = data.subspaces || []
        const mettaExprs: string[] = data.metta_expressions || []
        const focusToken: string | null = data.focus_token || null

        const lines: string[] = []
        for (const [, subPath] of subspaces) {
            const displayPath = subPath ? ('/' + subPath.replace(/\/$/, '') + '/') : '/'
            lines.push(`; subspace ${displayPath}`)
        }
        for (const expr of mettaExprs) {
            lines.push(expr)
        }

        if (lines.length === 0) return { ok: true, output: `; ${space} is empty` }
        if (focusToken) lines.push(`; ... more atoms available (re-run to paginate)`)
        return { ok: true, output: lines.join('\n') }
    } catch (e: any) {
        return { ok: false, output: `; explore error: ${e.message}` }
    }
}

// ─── Shared helper ────────────────────────────────────────────────────────────

/** Fetch the atom count for a space. Returns the number or throws a string. */
async function fetchCount(space: string, ctx: CommandContext): Promise<number> {
    let ns = space
    if (ns.startsWith('/')) ns = ns.substring(1)
    if (ns.endsWith('/')) ns = ns.slice(0, -1)
    const encodedNs = ns.split('/').filter((s: string) => s.length > 0).map(encodeURIComponent).join('/')
    const url = encodedNs.length > 0
        ? `${ctx.backendUrl}/count/${encodedNs}`
        : `${ctx.backendUrl}/count`
    const resp = await fetch(url, { headers: { Authorization: ctx.tokenCode } })
    if (!resp.ok) throw `count failed (HTTP ${resp.status})`
    return resp.json()
}

// ─── count ────────────────────────────────────────────────────────────────────

async function runCount(args: SExpr[], ctx: CommandContext): Promise<CommandResult> {
    if (args.length < 1) return { ok: false, output: '; usage: (count <space>)' }
    let space: string
    try { space = resolveSpace(args[0], ctx.activeNamespace) }
    catch (e) { return { ok: false, output: `; ${e}` } }

    try {
        const n = await fetchCount(space, ctx)
        return { ok: true, output: `; ${space} has ${n} atom${n === 1 ? '' : 's'}` }
    } catch (e: any) {
        return { ok: false, output: `; ${e}` }
    }
}

// ─── assert-count ─────────────────────────────────────────────────────────────

const OPS = ['=', '!=', '<', '<=', '>', '>='] as const
type Op = typeof OPS[number]

function applyOp(actual: number, op: Op, expected: number): boolean {
    switch (op) {
        case '=':  return actual === expected
        case '!=': return actual !== expected
        case '<':  return actual <   expected
        case '<=': return actual <=  expected
        case '>':  return actual >   expected
        case '>=': return actual >=  expected
    }
}

async function runAssertCount(args: SExpr[], ctx: CommandContext): Promise<CommandResult> {
    // (assert-count <space> <n>)          — equality shorthand
    // (assert-count <space> <op> <n>)     — explicit operator
    if (args.length < 2) {
        return { ok: false, output: '; usage: (assert-count <space> <n>) or (assert-count <space> <op> <n>)' }
    }

    let space: string
    try { space = resolveSpace(args[0], ctx.activeNamespace) }
    catch (e) { return { ok: false, output: `; ${e}` } }

    let op: Op = '='
    let rawN: SExpr

    if (args.length === 2) {
        rawN = args[1]
    } else {
        const rawOp = args[1]
        if (typeof rawOp !== 'string' || !(OPS as readonly string[]).includes(rawOp)) {
            return { ok: false, output: `; assert-count: unknown operator '${rawOp}' — use one of ${OPS.join(' ')}` }
        }
        op = rawOp as Op
        rawN = args[2]
    }

    const expected = Number(rawN)
    if (!Number.isFinite(expected) || expected < 0) {
        return { ok: false, output: `; assert-count: expected count must be a non-negative number` }
    }

    try {
        const actual = await fetchCount(space, ctx)
        if (applyOp(actual, op, expected)) {
            return { ok: true, output: `; ok — ${space} count ${op} ${expected} (got ${actual})` }
        } else {
            return { ok: false, output: `; assertion failed — ${space} count ${op} ${expected} but got ${actual}` }
        }
    } catch (e: any) {
        return { ok: false, output: `; ${e}` }
    }
}

// ─── subtract ─────────────────────────────────────────────────────────────────

async function runSubtract(args: SExpr[], ctx: CommandContext): Promise<CommandResult> {
    const inClauses:  { space: string; pat: string }[] = []
    const outClauses: { space: string; tmpl: string }[] = []

    for (const arg of args) {
        if (!Array.isArray(arg) || arg.length < 3) {
            return { ok: false, output: '; usage: (subtract (in <space> <pattern>) ... (out <space> <template>) ...)' }
        }
        const [dir, spaceRef, sexpr] = arg
        if (sexpr === undefined) {
            return { ok: false, output: '; each clause needs exactly: direction space pattern-or-template' }
        }
        let space: string
        try { space = resolveSpace(spaceRef, ctx.activeNamespace) }
        catch (e) { return { ok: false, output: `; ${e}` } }
        const expr = serialize(sexpr)

        if (dir === 'in')       inClauses.push({ space, pat: expr })
        else if (dir === 'out') outClauses.push({ space, tmpl: expr })
        else return { ok: false, output: `; unknown clause direction '${dir}' — use 'in' or 'out'` }
    }

    if (inClauses.length === 0)  return { ok: false, output: '; subtract needs at least one (in ...) clause' }
    if (outClauses.length === 0) return { ok: false, output: '; subtract needs at least one (out ...) clause' }

    const input_spaces  = inClauses.map(c => c.space.replace(/^\//, ''))
    const output_spaces = outClauses.map(c => c.space.replace(/^\//, ''))
    const patterns      = inClauses.map(c => c.pat)
    const templates     = outClauses.map(c => c.tmpl)

    try {
        const resp = await fetch(`${ctx.backendUrl}/subtract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: ctx.tokenCode },
            body: JSON.stringify({ input_spaces, output_spaces, patterns, templates }),
        })
        if (resp.ok) return { ok: true, output: '; subtract dispatched' }
        if (resp.status === 422) return { ok: false, output: '; subtract rejected: unbalanced parentheses in pattern or template' }
        if (resp.status === 400) return { ok: false, output: '; subtract rejected: mismatched number of spaces and patterns/templates' }
        return { ok: false, output: `; subtract failed (HTTP ${resp.status})` }
    } catch (e: any) {
        return { ok: false, output: `; subtract error: ${e.message}` }
    }
}

// ─── assert-content ───────────────────────────────────────────────────────────

/** Collapse all internal whitespace runs to a single space for comparison. */
function normalizeWs(s: string): string {
    return s.replace(/\s+/g, ' ').trim()
}

/**
 * Fetch every atom from a space, following pagination until exhausted.
 * Returns normalised atom strings, or throws a string error message.
 */
async function fetchAllAtoms(space: string, ctx: CommandContext): Promise<string[]> {
    let ns = space
    if (ns.startsWith('/')) ns = ns.substring(1)
    if (ns.endsWith('/')) ns = ns.slice(0, -1)
    const encodedNs = ns.split('/').filter((s: string) => s.length > 0).map(encodeURIComponent).join('/')

    const atoms: string[] = []
    let focusToken = ''
    do {
        const base = encodedNs.length > 0
            ? `${ctx.backendUrl}/explore/${encodedNs}`
            : `${ctx.backendUrl}/explore`
        const resp = await fetch(`${base}?focus_token=${encodeURIComponent(focusToken)}`, {
            headers: { Authorization: ctx.tokenCode },
        })
        if (!resp.ok) throw `explore failed (HTTP ${resp.status})`
        const data = await resp.json()
        for (const expr of (data.metta_expressions as string[] || [])) {
            atoms.push(normalizeWs(expr))
        }
        focusToken = data.focus_token || ''
    } while (focusToken)
    return atoms
}

async function runAssertContent(args: SExpr[], ctx: CommandContext): Promise<CommandResult> {
    if (args.length < 1) return { ok: false, output: '; usage: (assert-content <space> <atom>...)' }
    let space: string
    try { space = resolveSpace(args[0], ctx.activeNamespace) }
    catch (e) { return { ok: false, output: `; ${e}` } }

    const expected = args.slice(1).map(a => normalizeWs(serialize(a)))

    let actual: string[]
    try { actual = await fetchAllAtoms(space, ctx) }
    catch (e) { return { ok: false, output: `; assert-content: ${e}` } }

    const actualSet   = new Set(actual)
    const expectedSet = new Set(expected)
    const missing     = expected.filter(e => !actualSet.has(e))
    const extra       = actual.filter(a => !expectedSet.has(a))

    if (missing.length === 0 && extra.length === 0) {
        return { ok: true, output: `; ok — ${space} matches (${actual.length} atom${actual.length === 1 ? '' : 's'})` }
    }

    const lines: string[] = [`; assertion failed for ${space}:`]
    if (missing.length > 0) {
        lines.push(`; missing (${missing.length}):`)
        for (const m of missing) lines.push(`;   ${m}`)
    }
    if (extra.length > 0) {
        lines.push(`; unexpected (${extra.length}):`)
        for (const e of extra) lines.push(`;   ${e}`)
    }
    return { ok: false, output: lines.join('\n') }
}

async function runWait(args: SExpr[]): Promise<CommandResult> {
    if (args.length < 1) return { ok: false, output: '; usage: (wait <ms>)' }
    const ms = Number(args[0])
    if (!Number.isFinite(ms) || ms < 0)
        return { ok: false, output: '; wait: argument must be a non-negative number of milliseconds' }
    await new Promise(resolve => setTimeout(resolve, ms))
    return { ok: true, output: `; waited ${ms}ms` }
}

// ─── Single-expression executor ───────────────────────────────────────────────

/** Execute a single top-level S-expression. */
export async function executeSingle(expr: SExpr, ctx: CommandContext): Promise<CommandResult> {
    if (!Array.isArray(expr))
        return { ok: false, output: `; not a command: ${serialize(expr)}` }
    const [head, ...args] = expr
    switch (head) {
        case 'import':       return runImport(args, ctx)
        case 'transform':    return runTransform(args, ctx)
        case 'clear':        return runClear(args, ctx)
        case 'explore':      return runExplore(args, ctx)
        case 'count':        return runCount(args, ctx)
        case 'assert-count':   return runAssertCount(args, ctx)
        case 'assert-content': return runAssertContent(args, ctx)
        case 'subtract':       return runSubtract(args, ctx)
        case 'wait':           return runWait(args)
        default:
            return {
                ok: false,
                output: `; unknown command '${head}' — valid: import, transform, clear, explore, count, assert-count, assert-content, subtract, wait`,
            }
    }
}

// ─── Top-level executor ───────────────────────────────────────────────────────

/**
 * Execute all top-level expressions in `exprs` sequentially.
 * Results are combined into a single CommandResult.
 */
export async function execute(exprs: SExpr[], ctx: CommandContext): Promise<CommandResult> {
    const parts: CommandResult[] = []
    for (const expr of exprs) parts.push(await executeSingle(expr, ctx))
    if (parts.length === 0) return { ok: true, output: '' }
    return {
        ok: parts.every(r => r.ok),
        output: parts.map(r => r.output).filter(Boolean).join('\n'),
    }
}
