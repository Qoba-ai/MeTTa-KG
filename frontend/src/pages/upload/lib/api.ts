import { request, API_URL } from "~/lib/api";
import { ImportDataResponse } from "./types";

export async function importData(
  type: string,
  data: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ = null,
  format: string = "metta"
): Promise<ImportDataResponse> {
  try {
    switch (type) {
      case "text": {
        // Use the upload endpoint like the pattern you showed
        const url = `${API_URL}/upload/${encodeURIComponent("$x")}/${encodeURIComponent("$x")}?format=${encodeURIComponent(format)}`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
            Authorization: `200003ee-c651-4069-8b7f-2ad9fb46c3ab`,
          },
          body: data as string,
        });

        const text = await res.text();

        if (!res.ok) {
          return {
            status: "error",
            message: text || res.statusText,
          };
        }

        return {
          status: "success",
          data: text,
          message: "Text imported successfully",
        };
      }

      case "file":
        return {
          status: "error",
          message: "File upload not implemented yet",
        };

      default:
        throw new Error(`Unsupported import type: ${type}`);
    }
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Failed to import data",
    };
  }
}

export const uploadTextToSpace = (
  path: string,
  data: string
): Promise<string> => {
  return request<string>(`/spaces/upload${path}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: data,
  });
};

export const importSpace = (path: string, uri: string) => {
  return request<boolean>(`/spaces${path}?uri=${uri}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
};
