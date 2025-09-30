import { request } from "~/lib/api";
import { ExploreDetail } from "./types";
import { quoteFromBytes } from "../utils/quoteFromBytes";

export const exploreSpace = (
  path: string,
  pattern: string,
  token: Uint8Array | Array<number>
) => {
  if (token instanceof Array) {
    token = Uint8Array.from(token);
  }

  return request<ExploreDetail[]>(`/explore/spaces${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pattern,
      token: quoteFromBytes(token),
    }),
  });
};
