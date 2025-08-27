/* @refresh reload */
import { render } from "solid-js/web";
import { ColorModeProvider, ColorModeScript, createLocalStorageManager } from "@kobalte/core"
import App from "~/pages/index";
import './app.css'

import 'solid-devtools'

const root = document.getElementById("root");

if (!root) {
	throw new Error("Wrapper div not found");
}

render(() => {
	const storageManager = createLocalStorageManager("vite-ui-theme")
	return (
		<>
			<ColorModeScript storageType={storageManager.type} />
			<ColorModeProvider storageManager={storageManager}>
				<App />
			</ColorModeProvider>
		</>
	)
}, root);
