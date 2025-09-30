import { request, ExploreDetail } from "~/lib/api";
import { Transformation } from "./types";

export const transform = (transformation: Transformation) => {
  return request<boolean>("/spaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transformation),
  })
    .then((result) => {
      return result;
    })
    .catch((error) => {
      throw error;
    });
};

export async function isPathClear(path: string): Promise<boolean> {
  try {
    const cleanPath = path.replace(/^\/+|\/+$/g, "");

    const requestBody = {
      pattern: "$x",
      token: "",
    };

    await request<ExploreDetail[]>(`/explore/spaces/${cleanPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    return true;
  } catch {
    return true;
  }
}
