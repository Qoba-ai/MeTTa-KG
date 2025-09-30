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

export async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = {
    ...options.headers,
    //'Authorization': `${localStorage.getItem("token")}`,
    Authorization: `200003ee-c651-4069-8b7f-2ad9fb46c3ab`,
  };

  const response = await fetch(`${API_URL}${url}`, { ...options, headers });
  const res = await response.json();
  return res;
}

export const readSpace = (path: string) => {
  return request<string>(`/spaces${path}`);
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
