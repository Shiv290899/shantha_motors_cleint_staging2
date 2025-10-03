import axios from "axios";

// Get API base from Vite env; default to '/api' so dev proxy can forward to backend
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://shantha-motors-api.onrender.com/api";

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
