import { EditorState } from '@codemirror/state'
import { createMemo, createSignal, onMount, Show } from 'solid-js'
import {
	editorTheme,
	highlightStyle,
	languageSupport,
	mettaLinter,
	toJSON,
} from '~/lib/mettaLanguageSupport'
import {
	bracketMatching,
	foldGutter,
	foldKeymap,
	syntaxHighlighting,
} from '@codemirror/language'
import {
	drawSelection,
	dropCursor,
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	keymap,
	lineNumbers,
} from '@codemirror/view'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import {
	defaultKeymap,
	historyKeymap,
	history,
	indentSelection,
} from '@codemirror/commands'
import { lintKeymap } from '@codemirror/lint'
import {
	autocompletion,
	closeBrackets,
	closeBracketsKeymap,
	completionKeymap,
} from '@codemirror/autocomplete'


const CodeEditor = () => {
	const [editorContent, setEditorContent] = createSignal<string>('')
	const [activeImportFile, setActiveImportFile] = createSignal<File>()
	const [editorView, setEditorView] = createSignal<EditorView>()
	let mettaInput: HTMLDivElement

	const editorState = EditorState.create({
		doc: editorContent(),
		extensions: [
			editorTheme,
			languageSupport,
			lineNumbers(),
			highlightActiveLineGutter(),
			history(),
			foldGutter(),
			drawSelection(),
			highlightSelectionMatches(),
			dropCursor(),
			bracketMatching(),
			closeBrackets(),
			highlightActiveLine(),
			syntaxHighlighting(highlightStyle),
			EditorView.lineWrapping,
			autocompletion(),
			mettaLinter,
			keymap.of([
				...closeBracketsKeymap,
				...defaultKeymap,
				...searchKeymap,
				...historyKeymap,
				...foldKeymap,
				...completionKeymap,
				...lintKeymap,
			]),
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					setEditorContent(update.state.doc.toString())
				}
			}),
			EditorView.domEventHandlers({
				drop: (event, view) => {
					// prevent pasting the original content along with its translation
					event.preventDefault()

					// translate files dropped into the editor (csv, jsonld,...)
					const draggedFile = event.dataTransfer?.files?.item(0)

					if (draggedFile) {
						setActiveImportFile(draggedFile)

						translateToMetta()
					}
				},
			}),
		],
	})

	// called right before mettaInput is added to the DOM
	// the HTML element is not added to the DOM when the component is mounted,
	// so we cannot initialize the editor in onMount
	const initializeEditor = (): void => {
		setEditorView(
			new EditorView({
				state: editorState,
				parent: mettaInput,
			})
		)
	}


	async function translateToMetta() {
		console.log("To be Implemented !!!")
	}

	return (
		<>
			<style>
				{`
					.ͼ1.cm-focused {
						outline: none;
					}
				`}
			</style>


			<div class="w-full h-full cm-editor focus:outline-none" ref={(ref) => {
				mettaInput = ref
				initializeEditor()
			}}>


			</div>
		</>
	);
}

export default CodeEditor;
