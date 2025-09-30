import { request } from "~/lib/api";

export const clearSpace = (path: string) => {
  return request<boolean>(`/spaces/clear${path}`, {
    method: "GET",
  });
};
