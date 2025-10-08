import { axiosInstance } from "./index";

export const listStocks = async ({ branch, mode, limit = 200, page = 1 } = {}) => {
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

export const listStocksPublic = async ({ branch, mode, limit = 200, page = 1 } = {}) => {
  const params = {};
  if (branch) params.branch = branch;
  if (mode) params.mode = mode;
  params.limit = limit;
  params.page = page;
  const { data } = await axiosInstance.get("/stocks/public", { params, validateStatus: () => true });
  return data;
};

export const listCurrentStocks = async ({ branch, limit = 500, page = 1 } = {}) => {
  const params = {};
  if (branch) params.branch = branch;
  params.limit = limit;
  params.page = page;
  const res = await axiosInstance.get("/stocks/current", { params, validateStatus: () => true });
  if (String(res.status).startsWith("2") && res.data) return res.data;
  const pub = await axiosInstance.get("/stocks/current/public", { params, validateStatus: () => true });
  return pub.data || { success: false, data: [] };
};

export const createStock = async ({ data: row, createdBy }) => {
  const payload = { data: row, createdBy };
  const { data } = await axiosInstance.post("/stocks", payload);
  return data; // { success, data }
};

export const updateStock = async (movementId, patch) => {
  const { data } = await axiosInstance.patch(`/stocks/${movementId}`, { data: patch });
  return data; // { success, data }
};
