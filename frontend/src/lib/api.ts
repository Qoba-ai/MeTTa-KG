export const API_URL = import.meta.env.VITE_BACKEND_URL;

export interface Token {
  id: number;
  code: string;
  description: string;
  namespace: string;
  creation_timestamp: string;
  permission_read: boolean;
  permission_write: boolean;
  permission_share_share: boolean;
  permission_share_read: boolean;
  permission_share_write: boolean;
  parent: number | null;
}

export interface ApiResponse {
  status: "success" | "error";
  data?: any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
  message: string;
}

export interface Mm2Input {
  pattern: string[] | string;
  template: string[] | string;
}

export enum CSVParseDirection {
  Row = 1,
  Column = 2,
  CellUnlabeled = 3,
  CellLabeled = 4,
}

export interface CSVParserParameters {
  direction: CSVParseDirection;
  delimiter: string;
}

export interface ExploreDetail {
  expr: string;
  token: Uint8Array;
}

export interface ImportDataResponse {
  status: "success" | "error";
  data?: any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
  message: string;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    ...options.headers,
    Authorization: `200003ee-c651-4069-8b7f-2ad9fb46c3ab`,
  };
  const response = await fetch(`${API_URL}${url}`, { ...options, headers });
  const res = await response.json();
  return res;
}

export const transform = (path: string, transformation: Mm2Input) => {
  if (typeof transformation.pattern === "string") {
    transformation.pattern = [transformation.pattern];
  }

  if (typeof transformation.template === "string") {
    transformation.template = [transformation.template];
  }

  return request<boolean>(`/spaces${path}?op=transform`, {
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

export const importSpace = (path: string, uri: string) => {
  return request<boolean>(`/spaces${path}?op=import&uri=${uri}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
};

export const readSpace = (path: string) => {
  return request<string>(`/spaces${path}`);
};

export const exploreSpace = (
  path: string,
  pattern: string,
  token: Uint8Array | Array<number>
) => {
  if (token instanceof Array) {
    token = Uint8Array.from(token);
  }

  return request<ExploreDetail[]>(`/spaces${path}?op=explore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pattern,
      token: quoteFromBytes(token),
    }),
  });
};

export const getAllTokens = () => {
  return request<Token[]>("/tokens");
};

export const getToken = () => {
  return request<Token>("/token");
};

export const createToken = (new_token: Token) => {
  return request<Token>("/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(new_token),
  });
};

export const deleteTokens = (token_ids: number[]) => {
  return request<number>("/tokens", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(token_ids),
  });
};

export const updateToken = (token_id: number) => {
  return request<Token>(`/tokens/${token_id}`, {
    method: "POST",
  });
};

export const deleteToken = (token_id: number) => {
  return request(`/tokens/${token_id}`, {
    method: "DELETE",
  });
};

export const createFromCSV = (file: File, params: CSVParserParameters) => {
  const formData = new FormData();
  formData.append("file", file);
  const url = new URL(`${API_URL}/translations/csv`);
  url.search = new URLSearchParams(
    params as any /* eslint-disable-line @typescript-eslint/no-explicit-any */
  ).toString();

  return fetch(url.toString(), {
    method: "POST",
    body: formData,
    headers: {
      Authorization: `${localStorage.getItem("token")}`,
    },
  }).then((response) => response.json());
};

export const createFromNT = (file: File) => {
  const formData = new FormData();
  formData.append("file", file);

  return fetch(`${API_URL}/translations/nt`, {
    method: "POST",
    body: formData,
    headers: {
      Authorization: `${localStorage.getItem("token")}`,
    },
  }).then((response) => response.json());
};

export const createFromJsonLd = (file: File) => {
  const formData = new FormData();
  formData.append("file", file);

  return fetch(`${API_URL}/translations/jsonld`, {
    method: "POST",
    body: formData,
    headers: {
      Authorization: `${localStorage.getItem("token")}`,
    },
  }).then((response) => response.json());
};

export const createFromN3 = (file: File) => {
  const formData = new FormData();
  formData.append("file", file);

  return fetch(`${API_URL}/translations/n3`, {
    method: "POST",
    body: formData,
    headers: {
      Authorization: `${localStorage.getItem("token")}`,
    },
  }).then((response) => response.json());
};

export async function isPathClear(path: string): Promise<boolean> {
  try {
    // Clean the path properly
    const cleanPath = path.replace(/^\/+|\/+$/g, ""); // Remove leading/trailing slashes

    const requestBody = {
      pattern: "$x",
      token: "",
    };

    // TODO: use requests function
    const response = await fetch(`${API_URL}/spaces/${cleanPath}?op=explore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `200003ee-c651-4069-8b7f-2ad9fb46c3ab`,
      },
      body: JSON.stringify(requestBody),
    });

    const result = response.status !== 503;

    return result;
  } catch {
    // Assume clear to avoid getting stuck
    return true;
  }
}

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
  return request<string>(`/spaces${path}?op=upload`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: data,
  });
};

export const exportSpace = async (
  path: string,
  exportInput: Mm2Input
): Promise<string> => {
  if (exportInput.pattern && typeof exportInput.pattern !== "string") {
    exportInput.pattern = exportInput.pattern[0];
  }

  if (exportInput.template && typeof exportInput.template !== "string") {
    exportInput.template = exportInput.template[0];
  }

  return request<string>(`/spaces${path}?op=export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(exportInput),
  });
};

export const clearSpace = (path: string) => {
  return request<boolean>(`/spaces${path}?op=clear`, {
    method: "POST",
  });
};

function quoteFromBytes(data: Uint8Array): string {
  let result = "";

  for (let i = 0; i < data?.length; i++) {
    const byte = data[i];

    // Safe characters: alphanumeric and -_.~
    if (
      (byte >= 0x30 && byte <= 0x39) || // 0-9
      (byte >= 0x41 && byte <= 0x5a) || // A-Z
      (byte >= 0x61 && byte <= 0x7a) || // a-z
      byte === 0x2d ||
      byte === 0x5f || // - _
      byte === 0x2e ||
      byte === 0x7e
    ) {
      // . ~
      result += String.fromCharCode(byte);
    } else {
      // Percent-encode everything else
      result += "%" + byte.toString(16).padStart(2, "0").toUpperCase();
    }
  }

  return result;
}
