import { EditorState } from '@codemirror/state'
import { createMemo, createSignal, createEffect } from 'solid-js'
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
import {
	EditorMode,
	ImportCSVDirection,
	ImportFormat,
	ParserParameters,
	Token,
} from '../../types'
import { BACKEND_URL, TOKEN } from '../../urls'
import toast, { Toaster } from 'solid-toast'

const extensionToImportFormat = (file: File): ImportFormat | undefined => {
	const extension = file.name.split('.')[1]

	switch (extension) {
		case 'csv': {
			return ImportFormat.CSV
		}
		case 'nt': {
			return ImportFormat.NTRIPLES
		}
		case 'n3': {
			return ImportFormat.N3
		}
		case 'jsonld': {
			return ImportFormat.JSONLD
		}
	}
}

const CodeEditor = (props: any) => {
	const [editorContent, setEditorContent] = createSignal<string>(props.space)
	const [activeImportFile, setActiveImportFile] = createSignal<File>()
	const [editorView, setEditorView] = createSignal<EditorView>()
	const [editorMode, setEditorMode] = createSignal<EditorMode>(EditorMode.DEFAULT)
	const [importCSVDelimiter, setImportCSVDelimiter] = createSignal<string>('\u002C')
	const [importCSVDirection, setImportCSVDirection] = createSignal<ImportCSVDirection>(ImportCSVDirection.CELL_LABELED)

	const activeImportFileFormat = createMemo<ImportFormat | undefined>(() => {
		const file = activeImportFile()

		if (file) {
			return extensionToImportFormat(file)
		}
	})

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

	createEffect(() => {
		const content = editorContent();
		if (editorView() !== undefined && editorView()?.state.doc.toString() !== content) {
			editorView()?.dispatch({
				changes: {
					from: 0,
					to: editorView()?.state.doc.length,
					insert: content
				}
			});
		}
	});



	const getParserParameters = (): ParserParameters => {
		switch (activeImportFileFormat()) {
			case ImportFormat.CSV: {
				return {
					direction: importCSVDirection(),
					delimiter: importCSVDelimiter(),
				}
			}
			case ImportFormat.NTRIPLES: {
				return {
					dummy: '',
				}
			}
			case ImportFormat.JSONLD: {
				return {
					dummy: '',
				}
			}
			case ImportFormat.N3: {
				return {
					dummy: '',
				}
			}
			default: {
				throw new Error('Failed to get parser parameters')
			}
		}
	}


	async function translateToMetta() {
		const file = activeImportFile()
		const fileFormat = activeImportFileFormat()

		if (!fileFormat) {
			return
		}

		const parameters = new URLSearchParams(getParserParameters() as any)

		try {
			const resp = await fetch(
				`${BACKEND_URL}/translations/${fileFormat}?${parameters.toString()}`,
				{
					method: 'POST',
					headers: {},
					body: file,
				}
			)

			const mettaTranslation = await resp.json()

			const view = editorView()

			if (!view) {
				throw new Error('Failed to translate: editorView was undefined')
			}

			// switch to import mode to allow modification of import parameters
			setEditorMode(EditorMode.IMPORT)

			// insert translated MeTTa code at cursor location
			view.dispatch(
				view.state.update({
					changes: {
						from: view.state.selection.main.head,
						insert: mettaTranslation,
					},
				})
			)
		} catch (e) {
			console.error(e)
			// TODO: specific error messages
			toast(
				`Failed to transform to MeTTa, verify the parameters and try again.`
			)
		}
	}


	return (
		<>
			<style>
				{`
					.ͼ1.cm-focused {
						outline: none;
					},
					.cm-editor {
						height: 100%;
					};
					
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
