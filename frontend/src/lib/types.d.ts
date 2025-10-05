/////////////////////
// Transform Page //
///////////////////

export interface Transformation {
  patterns: string[];
  templates: string[];
}

//////////////////
// Upload Page //
////////////////

export interface ImportDataResponse {
  status: "success" | "error";
  data?: any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
  message: string;
}

//////////////////
// Tokens Page //
////////////////

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

////////////////
// Load Page //
//////////////

export interface ExploreDetail {
  expr: string;
  token: Uint8Array;
}

//////////////////
// Export Page //
////////////////

export interface ExportInput {
  pattern: string;
  template: string;
}
