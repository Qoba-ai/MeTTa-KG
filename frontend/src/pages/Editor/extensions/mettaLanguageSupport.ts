import { foldInside, foldNodeProp, HighlightStyle, indentNodeProp, LanguageSupport, LRLanguage, syntaxTree } from '@codemirror/language'
import { parser } from '../../../parser/parser'
import { styleTags, tags as t } from '@lezer/highlight'
import { tags } from '@lezer/highlight'
import { SyntaxNodeRef } from "@lezer/common"
import { EditorView } from '@codemirror/view'
import { CompletionContext, Completion } from '@codemirror/autocomplete'
import { linter } from '@codemirror/lint'
import { Compartment } from '@codemirror/state'
import { CLOSING_PARENTHESIS } from '../../../parser/parser.terms'

const parserWithMetadata = parser.configure({
    props: [
        styleTags({
            IDENTIFIER: t.name,
            VARIABLE: t.variableName,
            BOOLEAN_LITERAL: t.bool,
            STRING_LITERAL: t.string,
            INTEGER_LITERAL: t.number,
            FLOAT_LITERAL: t.float,
            LINE_COMMENT: t.lineComment,
            GroundedArithmeticFunction: t.arithmeticOperator,
            GroundedBooleanFunction: t.logicOperator,
            GroundedComparisonFunction: t.compareOperator,
            OtherGroundedFunction: t.keyword,
            GroundedType: t.typeName,
        }),
        indentNodeProp.add({
            Expression: (ctx) => {
                const base = ctx.continue() ?? 0;
                const next = ctx.node.childAfter(ctx.pos);
                if (next?.type?.id === CLOSING_PARENTHESIS) {
                    return base;
                }
                return base + ctx.unit;
            }
        }),
        foldNodeProp.add({
            Expression: foldInside,
        }),
    ],
});

const mettaLanguage = LRLanguage.define({
    name: 'MeTTa',
    parser: parserWithMetadata,
    languageData: {
        commentTokens: { line: ';' },
    },
})

// ── Autocomplete entries ───────────────────────────────────────────────────

type Entry = Completion & { section: string }

const fn = (label: string, detail: string, section: string): Entry =>
    ({ label, type: 'function', detail, section })
const kw = (label: string, detail: string, section: string): Entry =>
    ({ label, type: 'keyword', detail, section })
const ty = (label: string, section: string): Entry =>
    ({ label, type: 'type', detail: 'type', section })

const completions: Entry[] = [
    // ── Special forms ──────────────────────────────────────────────────────
    kw('=', '(= <pattern> <body>)', 'special'),
    kw(':', '(: <atom> <type>)', 'special'),
    kw('->', '(-> arg... ret)', 'special'),

    // ── Control flow ───────────────────────────────────────────────────────
    fn('if', '(-> Bool Atom Atom $t)', 'control'),
    fn('case', '(-> Atom Expression %Undefined%)', 'control'),
    fn('switch', '(-> %Undefined% Expression %Undefined%)', 'control'),

    // ── Pattern matching ───────────────────────────────────────────────────
    fn('match', '(-> SpaceType Atom Atom %Undefined%)', 'pattern'),
    fn('unify', '(-> Atom Atom Atom Atom %Undefined%)', 'pattern'),
    fn('let', '(-> Atom %Undefined% Atom %Undefined%)', 'pattern'),
    fn('let*', '(-> Expression Atom %Undefined%)', 'pattern'),
    fn('if-equal', '(-> Atom Atom Atom Atom %Undefined%)', 'pattern'),
    fn('if-decons-expr', '(-> Expression Variable Variable Atom Atom %Undefined%)', 'pattern'),
    fn('if-error', '(-> Atom Atom Atom %Undefined%)', 'pattern'),
    fn('return-on-error', '(-> Atom Atom %Undefined%)', 'pattern'),

    // ── Evaluation ─────────────────────────────────────────────────────────
    fn('eval', '(-> Atom Atom)', 'eval'),
    fn('evalc', '(-> Atom SpaceType Atom)', 'eval'),
    fn('chain', '(-> Atom Variable Atom %Undefined%)', 'eval'),
    fn('function', '(-> Atom Atom)', 'eval'),
    fn('return', '(-> $t $t)', 'eval'),
    fn('collapse', '(-> Atom Atom)', 'eval'),
    fn('collapse-bind', '(-> Atom Expression)', 'eval'),
    fn('superpose', '(-> Expression %Undefined%)', 'eval'),
    fn('superpose-bind', '(-> Expression Atom)', 'eval'),
    fn('metta', '(-> Atom Type SpaceType Atom)', 'eval'),
    fn('quote', '(-> Atom Atom)', 'eval'),
    fn('unquote', '(-> %Undefined% %Undefined%)', 'eval'),
    fn('noeval', '(-> Atom Atom)', 'eval'),
    fn('empty', '%Undefined%', 'eval'),

    // ── Arithmetic ─────────────────────────────────────────────────────────
    fn('+', '(-> Number Number Number)', 'arithmetic'),
    fn('-', '(-> Number Number Number)', 'arithmetic'),
    fn('*', '(-> Number Number Number)', 'arithmetic'),
    fn('/', '(-> Number Number Number)', 'arithmetic'),
    fn('%', '(-> Number Number Number)', 'arithmetic'),
    fn('abs-math', '(-> Number Number)', 'arithmetic'),
    fn('ceil-math', '(-> Number Number)', 'arithmetic'),
    fn('floor-math', '(-> Number Number)', 'arithmetic'),
    fn('round-math', '(-> Number Number)', 'arithmetic'),
    fn('trunc-math', '(-> Number Number)', 'arithmetic'),
    fn('sqrt-math', '(-> Number Number)', 'arithmetic'),
    fn('pow-math', '(-> Number Number Number)', 'arithmetic'),
    fn('log-math', '(-> Number Number Number)', 'arithmetic'),
    fn('sin-math', '(-> Number Number)', 'arithmetic'),
    fn('cos-math', '(-> Number Number)', 'arithmetic'),
    fn('tan-math', '(-> Number Number)', 'arithmetic'),
    fn('asin-math', '(-> Number Number)', 'arithmetic'),
    fn('acos-math', '(-> Number Number)', 'arithmetic'),
    fn('atan-math', '(-> Number Number)', 'arithmetic'),
    fn('isinf-math', '(-> Number Bool)', 'arithmetic'),
    fn('isnan-math', '(-> Number Bool)', 'arithmetic'),
    fn('max-atom', '(-> %Undefined% Number)', 'arithmetic'),
    fn('min-atom', '(-> %Undefined% Number)', 'arithmetic'),

    // ── Comparison ─────────────────────────────────────────────────────────
    fn('<', '(-> Number Number Bool)', 'comparison'),
    fn('>', '(-> Number Number Bool)', 'comparison'),
    fn('<=', '(-> Number Number Bool)', 'comparison'),
    fn('>=', '(-> Number Number Bool)', 'comparison'),
    fn('==', '(-> $t $t Bool)', 'comparison'),
    fn('=alpha', '(-> Atom Atom Bool)', 'comparison'),
    fn('noreduce-eq', '(-> Atom Atom Bool)', 'comparison'),

    // ── Logic ──────────────────────────────────────────────────────────────
    fn('and', '(-> Bool Bool Bool)', 'logic'),
    fn('or', '(-> Bool Bool Bool)', 'logic'),
    fn('not', '(-> Bool Bool)', 'logic'),
    fn('xor', '(-> Bool Bool Bool)', 'logic'),

    // ── Atom manipulation ──────────────────────────────────────────────────
    fn('car-atom', '(-> Expression %Undefined%)', 'atoms'),
    fn('cdr-atom', '(-> Expression Expression)', 'atoms'),
    fn('cons-atom', '(-> Atom Expression Atom)', 'atoms'),
    fn('decons-atom', '(-> Expression Atom)', 'atoms'),
    fn('index-atom', '(-> Expression Number Atom)', 'atoms'),
    fn('size-atom', '(-> Expression Number)', 'atoms'),
    fn('atom-subst', '(-> Atom Variable Atom Atom)', 'atoms'),
    fn('get-type', '(-> Atom %Undefined%)', 'atoms'),
    fn('get-type-space', '(-> SpaceType Atom Atom)', 'atoms'),
    fn('get-metatype', '(-> Atom Atom)', 'atoms'),
    fn('is-function', '(-> Type Bool)', 'atoms'),
    fn('type-cast', '%Undefined%', 'atoms'),
    fn('sealed', '(-> Expression Atom Atom)', 'atoms'),
    fn('capture', '(-> Atom Atom)', 'atoms'),
    fn('id', '(-> $t $t)', 'atoms'),
    fn('nop', '%Undefined%', 'atoms'),

    // ── Functional ─────────────────────────────────────────────────────────
    fn('map-atom', '(-> Expression Variable Atom Expression)', 'functional'),
    fn('filter-atom', '(-> Expression Variable Atom Expression)', 'functional'),
    fn('foldl-atom', '(-> Expression Atom Variable Variable Atom %Undefined%)', 'functional'),
    fn('for-each-in-atom', '(-> Expression Atom (->))', 'functional'),
    fn('first-from-pair', '%Undefined%', 'functional'),

    // ── Set operations ─────────────────────────────────────────────────────
    fn('intersection', '(-> Atom Atom %Undefined%)', 'sets'),
    fn('intersection-atom', '(-> Expression Expression Atom)', 'sets'),
    fn('union', '(-> Atom Atom %Undefined%)', 'sets'),
    fn('union-atom', '(-> Expression Expression Atom)', 'sets'),
    fn('subtraction', '(-> Atom Atom %Undefined%)', 'sets'),
    fn('subtraction-atom', '(-> Expression Expression Atom)', 'sets'),
    fn('unique', '(-> Atom %Undefined%)', 'sets'),
    fn('unique-atom', '(-> Expression Atom)', 'sets'),

    // ── Space ──────────────────────────────────────────────────────────────
    fn('new-space', '(-> SpaceType)', 'space'),
    fn('add-atom', '(-> SpaceType Atom (->))', 'space'),
    fn('add-atoms', '(-> SpaceType Expression (->))', 'space'),
    fn('add-reduct', '(-> SpaceType %Undefined% (->))', 'space'),
    fn('add-reducts', '(-> SpaceType %Undefined% (->))', 'space'),
    fn('remove-atom', '(-> SpaceType Atom (->))', 'space'),
    fn('get-atoms', '(-> SpaceType Atom)', 'space'),
    fn('context-space', '(-> SpaceType)', 'space'),
    fn('mod-space!', '(-> Atom SpaceType)', 'space'),
    fn('module-space-no-deps', '(-> SpaceType SpaceType)', 'space'),

    // ── State ──────────────────────────────────────────────────────────────
    fn('new-state', '(-> $t (StateMonad $t))', 'state'),
    fn('change-state!', '(-> (StateMonad $t) $t (StateMonad $t))', 'state'),
    fn('get-state', '(-> (StateMonad $t) $t)', 'state'),

    // ── String / output ────────────────────────────────────────────────────
    fn('format-args', '(-> String Expression String)', 'output'),
    fn('println!', '(-> %Undefined% (->))', 'output'),
    fn('print-mods!', '(-> (->))', 'output'),
    fn('trace!', '(-> %Undefined% Atom %Undefined%)', 'output'),
    fn('sort-strings', '(-> Expression Expression)', 'output'),

    // ── Modules ────────────────────────────────────────────────────────────
    fn('import!', '(-> Atom Atom (->))', 'modules'),
    fn('include', '(-> Atom %Undefined%)', 'modules'),
    fn('register-module!', '(-> Atom (->))', 'modules'),
    fn('git-module!', '(-> Atom (->))', 'modules'),
    fn('bind!', '(-> Symbol %Undefined% (->))', 'modules'),
    fn('pragma!', '%Undefined%', 'modules'),

    // ── Assertions ─────────────────────────────────────────────────────────
    fn('assertEqual', '(-> Atom Atom (->))', 'assert'),
    fn('assertEqualMsg', '(-> Atom Atom Atom (->))', 'assert'),
    fn('assertEqualToResult', '(-> Atom Atom (->))', 'assert'),
    fn('assertEqualToResultMsg', '(-> Atom Atom Atom (->))', 'assert'),
    fn('assertAlphaEqual', '(-> Atom Atom (->))', 'assert'),
    fn('assertAlphaEqualMsg', '(-> Atom Atom Atom (->))', 'assert'),
    fn('assertAlphaEqualToResult', '(-> Atom Atom (->))', 'assert'),
    fn('assertAlphaEqualToResultMsg', '(-> Atom Atom Atom (->))', 'assert'),
    fn('assertIncludes', '(-> Atom Expression (->))', 'assert'),

    // ── Documentation ──────────────────────────────────────────────────────
    fn('@doc', '(-> Atom DocDescription DocParameters DocReturnInformal DocInformal)', 'docs'),
    fn('@doc-formal', '(-> DocItem DocKindFunction DocType DocDescription DocParameters DocReturn DocFormal)', 'docs'),
    fn('@desc', '(-> String DocDescription)', 'docs'),
    fn('@param', '(-> DocType DocDescription DocParameter)', 'docs'),
    fn('@params', '(-> Expression DocParameters)', 'docs'),
    fn('@return', '(-> DocType DocDescription DocReturn)', 'docs'),
    fn('@item', '(-> Atom DocItem)', 'docs'),
    fn('@type', '(-> Type DocType)', 'docs'),
    fn('get-doc', '(-> SpaceType Atom %Undefined%)', 'docs'),
    fn('help!', '(-> Atom (->))', 'docs'),
    fn('help-space!', '(-> SpaceType (->))', 'docs'),

    // ── Types ──────────────────────────────────────────────────────────────
    ty('Number', 'types'),
    ty('Bool', 'types'),
    ty('String', 'types'),
    ty('Type', 'types'),
    ty('Atom', 'types'),
    ty('Symbol', 'types'),
    ty('Variable', 'types'),
    ty('Expression', 'types'),
    ty('Grounded', 'types'),
    ty('SpaceType', 'types'),
    ty('%Undefined%', 'types'),
    ty('Empty', 'types'),
    ty('NotReducible', 'types'),
    ty('ErrorType', 'types'),
    ty('StateMonad', 'types'),
]

const languageSupport = new LanguageSupport(mettaLanguage, [
    mettaLanguage.data.of({
        autocomplete: (context: CompletionContext) => {
            const word = context.matchBefore(/[\w\-!?:=<>+*\/%@]+/)
            if (!word || (word.from === word.to && !context.explicit)) return null
            return {
                from: word.from,
                options: completions,
            }
        }
    })
])

const highlightStyle = HighlightStyle.define([
    { tag: tags.lineComment, color: 'var(--muted)' },
    { tag: tags.bool, color: 'var(--rose)' },
    { tag: tags.number, color: 'var(--rose)' },
    { tag: tags.float, color: 'var(--rose)' },
    { tag: tags.string, color: 'var(--foam)' },
    { tag: tags.name, color: 'var(--text)' },
    { tag: tags.variableName, color: 'var(--gold)' },
    { tag: tags.keyword, color: 'var(--love)' },
    { tag: tags.typeName, color: 'var(--iris)' },
    { tag: tags.arithmeticOperator, color: 'var(--love)' },
    { tag: tags.logicOperator, color: 'var(--love)' },
    { tag: tags.compareOperator, color: 'var(--love)' },
])

const themeCompartment = new Compartment();

const getEditorTheme = (isDark: boolean) => EditorView.theme(
    {
        '&': {
            backgroundColor: 'var(--base)',
            color: 'var(--text)',
            height: '100%',
        },
        '.cm-content': { height: '100%' },
        '.cm-scroller': { overflow: 'auto' },
        '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--text)' },
        '.cm-activeLine': { backgroundColor: 'rgba(120, 120, 120, 0.1)' },
        '.cm-selectionLayer > .cm-selectionBackground': { backgroundColor: 'var(--highlight-high) !important' },
        '.cm-gutters': { backgroundColor: 'var(--overlay)', color: 'var(--subtle)', border: 'none' },
        '.cm-activeLineGutter': { backgroundColor: 'var(--highlight-med)' },
        '.cm-content > .cm-activeLine > span': { caretColor: 'var(--text)' },
        '.cm-cursor': { boxSizing: 'content-box', padding: '2px' },
        '.cm-scroller::-webkit-scrollbar': { backgroundColor: 'transparent', width: '5px' },
        '.cm-scroller::-webkit-scrollbar-thumb': { backgroundColor: 'var(--highlight-med)' },
        '.cm-selectionMatch': { backgroundColor: 'var(--highlight-med)' },
        '.cm-searchMatch': { backgroundColor: 'var(--rose)', color: 'var(--base)' },
        '.cm-searchMatch > span': { color: 'var(--base)' },
        '.cm-matchingBracket': { backgroundColor: 'var(--highlight-high) !important' },
        '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--text)', padding: '8px' },
        '.cm-panel': {
            boxShadow: `0px 3px 3px -2px rgba(0, 0, 0, 0.2), 0px 3px 4px 0px rgba(0, 0, 0, 0.14), 0px 1px 8px 0px rgba(0, 0, 0, 0.12)`,
            outline: '1px var(--highlight-med) solid',
            borderRadius: '8px',
            margin: "10px 0px"
        },
        '.cm-panel ul [aria-selected]': { backgroundColor: 'var(--highlight-med) !important' },
        '.cm-diagnostic-error': { borderLeft: 'solid 3px var(--love)' },
        '.cm-panel button': { color: 'var(--muted) !important' },
        'cm-lintRange cm-lintRange-active': { backgroundColor: 'var(--gold)' }
    },
    { dark: isDark }
)

const mettaLinter = linter((view) => {
    const { state } = view
    const tree = syntaxTree(state)
    const errors: { node: SyntaxNodeRef, msg: string }[] = []
    tree.iterate({
        enter: (n) => {
            if (!n.type.isError) return true
            if (state.doc.sliceString(n.from, n.from + 1) === '"') errors.push({ node: n.node, msg: 'Unterminated string literal.' })
            if (state.doc.sliceString(n.from, n.from + 1) === ')') errors.push({ node: n.node, msg: 'Unexpected closing parenthesis.' })
            if (state.doc.sliceString(n.from, n.to) === '') errors.push({ node: n.node, msg: "Expected ')'" })
        },
    })
    return errors.map(({ node, msg }) => ({ from: node.from, to: node.from + 1, severity: 'error', message: msg }))
})

export {
    languageSupport,
    highlightStyle,
    getEditorTheme,
    themeCompartment,
    mettaLinter
}
