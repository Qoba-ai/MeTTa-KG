import { createSignal } from "solid-js";


// the current namespace. e.g `/hello/world/`.
export const [namespace, setNamespace] = createSignal([""]);
