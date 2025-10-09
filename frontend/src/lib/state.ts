import { createMemo, createSignal } from "solid-js";

export const [rootToken, setRootToken] = createSignal<string | null>(
  localStorage.getItem("rootToken")
);

export const [namespace, setNamespace] = createSignal<string[]>([""]);

export const formatedNamespace = createMemo(() => {
  if (namespace().length <= 1) return "/";
  return "/" + namespace().join("/");
});
