import { request } from "~/lib/api";
import { ExportInput } from "./types";

export const exportSpace = async (
  path: string,
  exportInput: ExportInput
): Promise<string> => {
  return request<string>(`/spaces/export${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exportInput),
  });
};
