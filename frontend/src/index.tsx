import { render } from "solid-js/web";
import { Route, Router } from "@solidjs/router";

import Editor from "./pages/Editor";
import Tokens from "./pages/Tokens";
import Settings from "./pages/Settings";
import { ThemeProvider } from "./ThemeContext";

import './styles/global.scss';

import 'solid-devtools'

const root = document.getElementById("root");

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    "Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?"
  );
}

render(
  () => (
    <ThemeProvider>
      <Router>
        <Route path="/" component={Editor} />
        <Route path="/tokens" component={Tokens} />
        <Route path="/settings" component={Settings} />
      </Router>
    </ThemeProvider>
  ),
  root!
);
