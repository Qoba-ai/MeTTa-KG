import { createSignal } from "solid-js";

export const [rootToken, setRootToken] = createSignal<string | null>(
  localStorage.getItem('rootToken')
);

export const [namespace, setNamespace] = createSignal<string[]>(['']);