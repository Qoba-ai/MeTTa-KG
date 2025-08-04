/* @refresh reload */
import { render } from "solid-js/web";
import { Route, Router } from "@solidjs/router";

//import Editor from "./Editor";
import Editor from "./pages/index";
import Tokens from "./Tokens";

import './styles/global.scss';
import './app.css'

import 'solid-devtools'

const root = document.getElementById("root");

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    "Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?"
  );
}

render(
  () => (
    <Router>
      <Route path="/" component={Editor} />
      <Route path="/tokens" component={Tokens} />
    </Router>
  ),
  root!
);
