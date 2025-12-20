import axios from "axios";

// Resolve API base URL. Use env if provided; otherwise:
// - in dev/localhost → '/api' (Vite proxy)
// - in production → default Render URL for this project
const guessDefaultApi = () => {
  try {
    const host = window?.location?.hostname || '';
    if (host.includes('localhost') || host.includes('127.0.0.1')) return '/api';
  } catch {
    //ignore
  }
  return 'https://shantha-motors-api.onrender.com/api';
};
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || guessDefaultApi();

export const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

// Always attach the latest token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);
