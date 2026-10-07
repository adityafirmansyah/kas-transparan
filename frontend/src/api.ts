import axios from "axios";
import type { TokenResponse } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("kas_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function setSession({
  access_token,
  role,
  komunitas_id,
  user_id,
  username,
}: TokenResponse): void {
  localStorage.setItem("kas_token", access_token);
  localStorage.setItem("kas_role", role);
  localStorage.setItem("kas_komunitas_id", komunitas_id);
  if (user_id) localStorage.setItem("kas_user_id", user_id);
  if (username) localStorage.setItem("kas_username", username);
}

export function clearSession(): void {
  localStorage.removeItem("kas_token");
  localStorage.removeItem("kas_role");
  localStorage.removeItem("kas_komunitas_id");
  localStorage.removeItem("kas_user_id");
  localStorage.removeItem("kas_username");
}

export interface Session {
  token: string | null;
  role: string | null;
  komunitasId: string | null;
  userId: string | null;
  username: string | null;
}

export function getSession(): Session {
  return {
    token: localStorage.getItem("kas_token"),
    role: localStorage.getItem("kas_role"),
    komunitasId: localStorage.getItem("kas_komunitas_id"),
    userId: localStorage.getItem("kas_user_id"),
    username: localStorage.getItem("kas_username"),
  };
}

export function formatRupiah(amount: number | null | undefined): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

/** Downloads a binary or text file response from an authenticated endpoint */
export async function downloadFile(
  url: string,
  params: Record<string, string>,
  defaultFilename: string
): Promise<void> {
  const token = localStorage.getItem("kas_token");
  const query = new URLSearchParams(params).toString();
  const fullUrl = `${url}${query ? `?${query}` : ""}`;
  const response = await fetch(fullUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(`Gagal mengunduh file (${response.status})`);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition");
  let filename = defaultFilename;
  if (disposition && disposition.includes("filename=")) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) filename = match[1];
  }
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
}

/** Extracts a FastAPI-style `{ detail }` error message, falling back to a default. */
export function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      return detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join(", ");
    }
    if (err.message) {
      return `${fallback}: ${err.message}`;
    }
  }
  if (err instanceof Error) {
    return `${fallback}: ${err.message}`;
  }
  return fallback;
}
