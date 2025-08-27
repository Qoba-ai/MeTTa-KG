import { foldInside, foldNodeProp, HighlightStyle, indentNodeProp, LanguageSupport, LRLanguage, syntaxTree, TreeIndentContext } from '@codemirror/language'
import { parser } from '../parser/parser'
import { styleTags, tags as t } from '@lezer/highlight'
import { IterMode, Tree } from '@lezer/common'
import { tags } from '@lezer/highlight'
import { SyntaxNodeRef } from "@lezer/common"
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { CompletionContext } from '@codemirror/autocomplete'
import { linter } from '@codemirror/lint'
import { Extension } from '@codemirror/state'
import { CLOSING_PARENTHESIS, Expression, Identifier, OPENING_PARENTHESIS, Space, Symbol, Variable } from '../parser/parser.terms'

/**
 * TODO Editor functionality/bugs:
 * - tab support
 * - improve indenting: type of indenting, speed
 * - different colour for each pair of matching parantheses
 * - editor cursor blinks both white and black
 * - top-level expression isn't foldable
 * - fullscreen mode: editable text area size
 * - (tab through macro input areas)
 * - (highlightSpecialChars)
 */

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
			OtherGroundedFunction: t.keyword
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

export const enter = (n: SyntaxNodeRef, parent: any[], doc: string): any[] | undefined => {
	if (n.type.id === Expression || n.type.id === Space) {
		const child: [] = [];

		parent.push(child)

		return child;
	}

	if (n.type.id === Symbol) {
		if (n.node.firstChild?.type.id === Identifier) {
			const c = {
				type: 'Identifier',
				value: doc.slice(n.from, n.to)
			};

			parent.push(c)
		} else {
			const c = {
				type: 'Literal',
				value: doc.slice(n.from, n.to)
			};

			parent.push(c)
		}

		return parent;
	}

	return parent;
}

export const toJSON = (doc: string) => {
	const trie = toTrie(doc);

	const reconstruction = reconstruct(trie);
}

export const toTrie = (doc: string) => {
	const tree = parser.parse(doc)

	const result = {};
	const expressionIndices: number[] = [];
	const stack: any[] = [result];

	tree.iterate({
		enter: (n) => {
			if (n.type.id === Symbol || n.type.id === Variable) {
				const text = doc.slice(n.from, n.to);

				if (stack[stack.length - 1][text]) {
					stack.push(stack[stack.length - 1][text])
				} else {
					const child = {}

					stack[stack.length - 1][text] = child;
					stack.push(child);
				}
			}

			if (n.type.id === Expression) {
				expressionIndices.push(stack.length - 1);
			}

			if (n.type.id === OPENING_PARENTHESIS) {
				const child = {}

				stack[stack.length - 1]['('] = child;
				stack.push(child);
			}

			if (n.type.id === CLOSING_PARENTHESIS) {
				const child = {}

				stack[stack.length - 1][')'] = child;
				stack.push(child);
			}

			return true;
		},
		leave: (n) => {
			if (n.type.id === Expression) {
				const expr = expressionIndices.pop() as number;

				stack.splice(expr + 2)
			}
		}
	});

	return result;
}

const reconstruct = (trie: any): any => {
	const keys = Object.keys(trie);

	if (keys.length === 0) {
		return []
	}

	if (keys.length === 1) {
		return [keys[0], ...reconstruct(trie[keys[0]])]
	}

	return keys.flatMap(k => {
		const vs = trie[k];

		return Object.entries(vs).map(([k2, v]) => [k, k2, ...reconstruct(v)])
	})
}

const mettaLanguage = LRLanguage.define({
	name: 'MeTTa',
	parser: parserWithMetadata,
	languageData: {
		commentTokens: { line: ';' },
	},
})

const languageSupport = new LanguageSupport(mettaLanguage, [
	mettaLanguage.data.of({
		autocomplete: (context: CompletionContext) => {
			const word = context.matchBefore(/\w*/)

			if (!context.explicit) {
				return null;
			}

			return {
				from: word?.from,
				options: [
					{
						label: "match",
						type: "text",
						detail: 'macro',
						section: "macro",
						apply: () => {
							context.view?.dispatch(context.view.state.update({
								changes: {
									from: word?.from,
									to: word?.to,
									insert: `match &self () ()`,
								},
								selection: {
									anchor: word?.from + "match &self (".length,
									head: word?.from + "match &self (".length
								}
							}))
						}
					}
				]
			}
		}
	})
])

const highlightStyle = HighlightStyle.define([
	{
		tag: tags.lineComment,
		color: 'gray',
	},
	{
		tag: tags.bool,
		color: 'var(--rp-rose)',
	},
	{
		tag: tags.number,
		color: 'var(--rp-rose)',
	},
	{
		tag: tags.string,
		color: 'var(--rp-foam)',
	},
	{
		tag: tags.name,
		color: 'var(--rp-text)',
	},
	{
		tag: tags.variableName,
		color: 'var(--rp-gold)',
	},
	{
		tag: tags.keyword,
		color: 'var(--rp-love)',
	},
	{
		tag: tags.arithmeticOperator,
		color: 'var(--rp-love)',
	},
	{
		tag: tags.logicOperator,
		color: 'var(--rp-love)',
	},
	{
		tag: tags.compareOperator,
		color: 'var(--rp-love)',
	},
])

const editorTheme = EditorView.theme(
	{
		'&': {
			backgroundColor: 'var(--rp-moon-base)',
			color: 'var(--rp-moon-text)',
			maxHeight: '100%',
		},
		'.cm-content': {
			maxHeight: '600px',
			height: '400px',
		},
		"&.cm-focused .cm-cursor": {
			borderLeftColor: 'var(--rp-moon-highlight-low)',
		},
		'.cm-activeLine': {
			backgroundColor: 'rgba(120, 120, 120, 0.1)',
		},
		'.cm-selectionLayer > .cm-selectionBackground':
		{
			backgroundColor: 'var(--rp-highlight-high) !important',
		},
		'.cm-gutters': {
			backgroundColor: 'var(--rp-moon-highlight-high)',
			color: 'var(--rp-moon-subtle)',
		},
		'.cm-activeLineGutter': {
			backgroundColor: 'var(--rp-moon-rose)',
		},
		'.cm-content > .cm-activeLine > span': {
			caretColor: 'var(--rp-rose)',
		},
		'.cm-cursor': {
			boxSizing: 'content-box',
			padding: "2px"
		},
		'.cm-scroller::-webkit-scrollbar': {
			backgroundColor: 'transparent',
			width: '5px'
		},
		'.cm-scroller::-webkit-scrollbar-thumb': {
			backgroundColor: 'var(--rp-highlight-med)'
		},
		'.cm-selectionMatch': {
			backgroundColor: 'var(--rp-highlight-med)'
		},
		'.cm-searchMatch': {
			backgroundColor: 'var(--rp-rose)',
			color: 'var(--rp-base)'
		},
		'.cm-searchMatch > span': {
			color: 'var(--rp-base)'
		},
		'.cm-matchingBracket': {
			backgroundColor: 'var(--rp-moon-highlight-high) !important'
		},
		'.cm-panels': {
			backgroundColor: 'transparent',
			color: 'var(--rp-text)',
			padding: '8px'
		},
		'.cm-panels ul li:first-child': {
			borderTopLeftRadius: '8px',
			borderTopRightRadius: '8px',
		},
		'.cm-panels ul li:last-child': {
			borderBottomLeftRadius: '8px',
			borderBottomRightRadius: '8px',
		},
		'.cm-panels ul:focus': {
			outline: 'none'
		},
		'.cm-panel': {
			boxShadow: `0px 3px 3px -2px rgba(0, 0, 0, 0.2),
        0px 3px 4px 0px rgba(0, 0, 0, 0.14),
        0px 1px 8px 0px rgba(0, 0, 0, 0.12)`,
			outline: '1px var(--rp-highlight-med) solid',
			borderRadius: '8px',
			margin: "10px 0px"
		},
		'.cm-panel:focus': {

		},
		'.cm-panel ul [aria-selected]': {
			backgroundColor: 'var(--rp-highlight-med) !important'
		},
		'.cm-diagnostic-error': {
			borderLeft: 'solid 3px var(--rp-love)'
		},
		'.cm-panel button': {
			color: 'var(--rp-muted) !important'
		},
		'.cm-lintRange cm-lintRange-error': {
		},
		'cm-lintRange cm-lintRange-active': {
			backgroundColor: 'var(--rp-gold)'
		}
	},
	{
		dark: true,
	}
)

const mettaLinter = linter((view) => {
	const { state } = view

	const tree = syntaxTree(state)

	const errors: { node: SyntaxNodeRef, msg: string }[] = []

	tree.iterate({
		enter: (n) => {
			if (!n.type.isError) {
				return true
			}

			if (state.doc.sliceString(n.from, n.from + 1) === '"') {
				errors.push({
					node: n.node,
					msg: 'Unterminated string literal.'
				})
			}

			if (state.doc.sliceString(n.from, n.from + 1) === ')') {
				errors.push({
					node: n.node,
					msg: 'Unexpected closing parenthesis.'
				})
			}

			if (state.doc.sliceString(n.from, n.to) === '') {
				errors.push({
					node: n.node,
					msg: "Expected ')'"
				})
			}
		},
	})

	return errors.map(({ node, msg }) => ({
		from: node.from,
		to: node.from + 1,
		severity: 'error',
		message: msg,
	}))
})

export {
	languageSupport,
	highlightStyle,
	editorTheme,
	mettaLinter
}
