export interface ImportDataResponse {
  status: "success" | "error";
  data?: any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
  message: string;
}

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
  parent: number;
}

export interface ExploreDetail {
  expr: string;
  token: Uint8Array;
}

export interface Mm2Input {
  pattern: string[] | string;
  template: string[] | string;
}
