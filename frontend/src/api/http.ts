import axios, { type AxiosInstance } from "axios";

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "ApiError"; }
}

export function createHttpClient(baseURL: string): AxiosInstance {
  const client = axios.create({ baseURL, timeout: 15000 });
  client.interceptors.response.use((r) => r, (e) => Promise.reject(new ApiError(e?.response ? `Request failed (${e.response.status})` : "Network error: the server could not be reached.", e?.response?.status)));
  return client;
}
