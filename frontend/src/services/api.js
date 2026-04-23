import axios from "axios";
import { clearSession, getStoredToken } from "./auth";
import { disconnectRealtime } from "./realtime";

const DEFAULT_API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:5000/api" : "/api");

const API = axios.create({
  baseURL: DEFAULT_API_BASE_URL
});

API.interceptors.request.use((request) => {
  const token = getStoredToken();

  if (token) {
    request.headers.Authorization = token;
  }

  return request;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      disconnectRealtime();
      clearSession();
    }

    return Promise.reject(error);
  }
);

export function getApiError(error, fallbackMessage) {
  return error.response?.data?.message || fallbackMessage;
}

export default API;
