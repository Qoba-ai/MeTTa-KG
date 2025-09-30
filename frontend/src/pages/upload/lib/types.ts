export interface ImportDataResponse {
  status: "success" | "error";
  data?: any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
  message: string;
}
