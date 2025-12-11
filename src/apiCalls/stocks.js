import axios from "axios";
import { axiosInstance } from "./index";

// Optional Google Apps Script endpoint for stocks.
// Default to the backend proxy (absolute URL) so production builds don't call the Netlify origin.
const backendBase = String(axiosInstance?.defaults?.baseURL || "").replace(/\/$/, "");
const GAS_STOCKS_URL =
  import.meta.env.VITE_STOCKS_GAS_URL ||
  (backendBase ? `${backendBase}/stocks/gas` : "/api/stocks/gas");
const useGas = !!GAS_STOCKS_URL;

const gasGet = async (params) => {
  const res = await axios.get(GAS_STOCKS_URL, { params, validateStatus: () => true });
  return res?.data || {};
};

const gasPost = async (payload) => {
  const res = await axios.post(GAS_STOCKS_URL, payload, { validateStatus: () => true });
  return res?.data || {};
};

// Fetch stock movements. Default to a high limit so admin can see all recent records.
export const listStocks = async ({ branch, mode, limit = 1000, page = 1 } = {}) => {
  if (useGas) {
    const data = await gasGet({ action: "list", branch, mode, limit, page });
    return {
      success: !!data.ok,
      data: data.data || [],
      total: data.total || 0,
      count: data.count || (data.data ? data.data.length : 0),
    };
  }
  const params = {};
  if (branch) params.branch = branch;
  if (mode) params.mode = mode;
  params.limit = limit;
  params.page = page;
  // Resolve regardless of HTTP status so we can fallback
  const res = await axiosInstance.get("/stocks", { params, validateStatus: () => true });
  if (String(res.status).startsWith("2") && res.data) return res.data;
  // Fallback to public endpoint
  const pub = await axiosInstance.get("/stocks/public", { params, validateStatus: () => true });
  return pub.data || { success: false, data: [] };
};

export const listStocksPublic = async ({ branch, mode, limit = 1000, page = 1 } = {}) => {
  if (useGas) {
    const data = await gasGet({ action: "list", branch, mode, limit, page });
    return {
      success: !!data.ok,
      data: data.data || [],
      total: data.total || 0,
      count: data.count || (data.data ? data.data.length : 0),
    };
  }
  const params = {};
  if (branch) params.branch = branch;
  if (mode) params.mode = mode;
  params.limit = limit;
  params.page = page;
  const { data } = await axiosInstance.get("/stocks/public", { params, validateStatus: () => true });
  return data;
};

export const listCurrentStocks = async ({ branch, limit = 500, page = 1 } = {}) => {
  if (useGas) {
    const data = await gasGet({ action: "current", branch, limit, page });
    return {
      success: !!data.ok,
      data: data.data || [],
      total: data.total || 0,
      count: data.count || (data.data ? data.data.length : 0),
    };
  }
  const params = {};
  if (branch) params.branch = branch;
  params.limit = limit;
  params.page = page;
  const res = await axiosInstance.get("/stocks/current", { params, validateStatus: () => true });
  if (String(res.status).startsWith("2") && res.data) return res.data;
  const pub = await axiosInstance.get("/stocks/current/public", { params, validateStatus: () => true });
  return pub.data || { success: false, data: [] };
};

export const listCurrentStocksPublic = async ({ branch, limit = 500, page = 1 } = {}) => {
  if (useGas) {
    const data = await gasGet({ action: "current", branch, limit, page });
    return {
      success: !!data.ok,
      data: data.data || [],
      total: data.total || 0,
      count: data.count || (data.data ? data.data.length : 0),
    };
  }
  const params = {};
  if (branch) params.branch = branch;
  params.limit = limit;
  params.page = page;
  const { data } = await axiosInstance.get("/stocks/current/public", { params, validateStatus: () => true });
  return data;
};

// Pending transfers must hit the backend (GAS does not track transfer admits/rejects)
export const listPendingTransfers = async ({ branch, limit = 500 } = {}) => {
  const params = {};
  if (branch) params.branch = branch;
  params.limit = limit;
  const token = localStorage.getItem('token');
  if (token) params.token = token; // fallback if auth header is stripped
  const res = await axiosInstance.get("/stocks/transfers/pending", { params, validateStatus: () => true });
  return res?.data || { success: false, data: [] };
};

export const createStock = async ({ data: row, createdBy }) => {
  if (useGas) {
    const payload = { action: "create", data: row, createdBy };
    const data = await gasPost(payload);
    return { success: !!data.ok, data: data.data, message: data.message };
  }
  const payload = { data: row, createdBy };
  const { data } = await axiosInstance.post("/stocks", payload);
  return data; // { success, data }
};

export const updateStock = async (movementId, patch) => {
  if (useGas) {
    const payload = { action: "update", movementId, ...patch, data: patch };
    const data = await gasPost(payload);
    return { success: !!data.ok, data: data.data, message: data.message };
  }
  const { data } = await axiosInstance.patch(`/stocks/${movementId}`, { data: patch });
  return data; // { success, data }
};

export const deleteStock = async (movementId) => {
  if (useGas) {
    const data = await gasPost({ action: "delete", movementId });
    return { success: !!data.ok, message: data.message };
  }
  const res = await axiosInstance.delete(`/stocks/${movementId}`, { validateStatus: () => true });
  return res?.data || { success: false, message: 'Delete failed' };
};

export const admitTransfer = async (movementId, notes) => {
  if (useGas) {
    const data = await gasPost({ action: "admit", movementId, notes });
    return { success: !!data.ok, data: data.data, message: data.message };
  }
  const token = localStorage.getItem('token');
  const payload = notes ? { notes } : {};
  if (token) payload.token = token; // fallback for proxies stripping auth header
  const { data } = await axiosInstance.post(`/stocks/${movementId}/admit`, payload, { validateStatus: () => true });
  return data;
};

export const rejectTransfer = async (movementId, reason) => {
  if (useGas) {
    const data = await gasPost({ action: "reject", movementId, reason, notes: reason });
    return { success: !!data.ok, data: data.data, message: data.message };
  }
  const token = localStorage.getItem('token');
  const payload = reason ? { reason } : {};
  if (token) payload.token = token;
  const { data } = await axiosInstance.post(`/stocks/${movementId}/reject`, payload, { validateStatus: () => true });
  return data;
};
