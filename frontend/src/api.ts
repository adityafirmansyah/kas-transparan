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

export function setSession({ access_token, role, komunitas_id }: TokenResponse): void {
  localStorage.setItem("kas_token", access_token);
  localStorage.setItem("kas_role", role);
  localStorage.setItem("kas_komunitas_id", komunitas_id);
}

export function clearSession(): void {
  localStorage.removeItem("kas_token");
  localStorage.removeItem("kas_role");
  localStorage.removeItem("kas_komunitas_id");
}

export interface Session {
  token: string | null;
  role: string | null;
  komunitasId: string | null;
}

export function getSession(): Session {
  return {
    token: localStorage.getItem("kas_token"),
    role: localStorage.getItem("kas_role"),
    komunitasId: localStorage.getItem("kas_komunitas_id"),
  };
}

export function formatRupiah(amount: number | null | undefined): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
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
