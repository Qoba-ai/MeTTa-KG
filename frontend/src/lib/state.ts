import { createMemo, createSignal } from "solid-js";

const [rootToken, _setRootToken] = createSignal<string | null>(
  localStorage.getItem("rootToken")
);

// Initialize from localStorage
const storedNamespace = localStorage.getItem("tokenNamespace");
const initialNamespace = storedNamespace ? JSON.parse(storedNamespace) : [""];

const [tokenRootNamespace, setTokenRootNamespace] =
  createSignal<string[]>(initialNamespace);
const [namespace, setNamespace] = createSignal<string[]>(initialNamespace);

export {
  rootToken,
  tokenRootNamespace,
  namespace,
  setNamespace,
  setTokenRootNamespace,
};

export const setRootToken = (token: string | null) => {
  localStorage.setItem("rootToken", token ?? "");
  _setRootToken(token);

  if (!token) {
    localStorage.removeItem("tokenNamespace");
    setTokenRootNamespace([""]);
    setNamespace([""]);
  }
};

export const formatedNamespace = createMemo(() => {
  if (namespace().length <= 1) return "/";
  return namespace().join("/");
});
