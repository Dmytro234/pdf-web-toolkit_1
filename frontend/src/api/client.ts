
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";
import type { ApiError, ApiResponse } from "@/types";

function normalizeError(err: unknown): ApiError {
  if (axios.isAxiosError(err)) {
    const ae = err as AxiosError<any>;
    const status = ae.response?.status;
    const data = ae.response?.data;

    if (data?.error?.code && data?.error?.message) {
      return {
        code: String(data.error.code),
        message: String(data.error.message),
        details: data.error.details ?? { status }
      };
    }

    return {
      code: status ? `HTTP_${status}` : "NETWORK_ERROR",
      message:
        (typeof data?.message === "string" && data.message) ||
        ae.message ||
        "Request failed",
      details: {
        status,
        url: ae.config?.url,
        method: ae.config?.method
      }
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: "Unexpected error",
    details: err
  };
}

function normalizeBaseUrl(rawBaseUrl?: string): string {
  const value = (rawBaseUrl ?? "").trim();

  if (!value) {
    return "http://localhost:5000";
  }

  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function buildApiUrl(path: string): string {
  const baseUrl = normalizeBaseUrl(
    import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE_URL
  );

  if (!path) {
    return baseUrl;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return path.startsWith("/") ? `${baseUrl}${path}` : `${baseUrl}/${path}`;
}

export class ApiClient {
  private instance: AxiosInstance;

  constructor(baseURL: string) {
    this.instance = axios.create({
      baseURL,
      withCredentials: true,
      timeout: 60_000
    });

    this.instance.interceptors.response.use(
      (response) => response,
      (error) => Promise.reject(normalizeError(error))
    );
  }

  setAuthHeader(token: string | null) {
    if (token) {
      this.instance.defaults.headers.common.Authorization = `Bearer ${token}`;
      return;
    }

    delete this.instance.defaults.headers.common.Authorization;
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.instance.get<ApiResponse<T>>(url, config);
    return response.data;
  }

  async post<T, B = unknown>(url: string, body?: B, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.instance.post<ApiResponse<T>>(url, body, config);
    return response.data;
  }

  async put<T, B = unknown>(url: string, body?: B, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.instance.put<ApiResponse<T>>(url, body, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.instance.delete<ApiResponse<T>>(url, config);
    return response.data;
  }

  async postForm<T>(url: string, form: FormData, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.instance.post<ApiResponse<T>>(url, form, {
      ...config,
      headers: {
        ...(config?.headers ?? {})
      }
    });

    return response.data;
  }
}

const API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE_URL
);

export const apiBaseUrl = API_BASE_URL;
export const api = new ApiClient(API_BASE_URL);