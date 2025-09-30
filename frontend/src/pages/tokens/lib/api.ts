import { API_URL } from "~/lib/api";
import { showToast } from "~/components/ui/Toast";
import type { Token } from "./types";

export const fetchTokens = async (token: string | null): Promise<Token[]> => {
  localStorage.setItem("rootToken", token ?? "");
  if (!token) return [];
  try {
    const resp = await fetch(`${API_URL}/tokens`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: token },
    });
    if (!resp.ok) throw new Error("Failed to fetch");
    const tokens = await resp.json();
    showToast({
      title: "Success",
      description: `Loaded ${tokens.length} tokens.`,
    });
    return tokens;
  } catch (e) {
    showToast({
      title: "Error",
      description: `Failed to fetch tokens. \n${e}`,
      variant: "destructive",
    });
    return [];
  }
};

export const createToken = async (
  root: string | null,
  description: string,
  namespace: string,
  read: boolean,
  write: boolean,
  shareRead: boolean,
  shareWrite: boolean,
  shareShare: boolean
): Promise<Token> => {
  if (!root) throw new Error("No root token");
  const newToken: Token = {
    id: 0,
    code: "",
    description: description,
    namespace: namespace,
    creation_timestamp: new Date().toISOString().split("Z")[0],
    permission_read: read,
    permission_write: write,
    permission_share_read: shareRead,
    permission_share_write: shareWrite,
    permission_share_share: shareShare,
    parent: 0,
  };
  const resp = await fetch(`${API_URL}/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: root },
    body: JSON.stringify(newToken),
  });
  return await resp.json();
};

export const refreshCodes = async (
  root: string | null,
  tokens: Token[]
): Promise<Token[]> => {
  if (!root) return [];
  const promises = tokens.map((t) =>
    fetch(`${API_URL}/tokens/${t.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: root },
    }).then((r) => r.json())
  );
  return Promise.all(promises);
};

export const deleteTokens = async (
  root: string | null,
  tokens: Token[]
): Promise<void> => {
  if (!root) return;
  await fetch(`${API_URL}/tokens`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: root },
    body: JSON.stringify(tokens.map((t) => t.id)),
  });
};
