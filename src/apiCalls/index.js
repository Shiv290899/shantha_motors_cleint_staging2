import axios from "axios";

export const axiosInstance = axios.create({
  baseURL: "http://localhost:8082/api",
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
