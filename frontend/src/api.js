import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("kas_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function setSession({ access_token, role, komunitas_id }) {
  localStorage.setItem("kas_token", access_token);
  localStorage.setItem("kas_role", role);
  localStorage.setItem("kas_komunitas_id", komunitas_id);
}

export function clearSession() {
  localStorage.removeItem("kas_token");
  localStorage.removeItem("kas_role");
  localStorage.removeItem("kas_komunitas_id");
}

export function getSession() {
  return {
    token: localStorage.getItem("kas_token"),
    role: localStorage.getItem("kas_role"),
    komunitasId: localStorage.getItem("kas_komunitas_id"),
  };
}

export function formatRupiah(amount) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    amount || 0
  );
}
