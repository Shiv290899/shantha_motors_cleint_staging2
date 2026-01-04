import axios from "axios";
import { axiosInstance } from "./index";

// Stocks are backed by a Google Apps Script Web App, but browsers often hit CORS issues with direct calls.
// Prefer calling our backend proxy (`/api/stocks/gas`) via `axiosInstance` and fall back to direct GAS only if needed.
const DEFAULT_GAS_STOCKS_URL =
  "https://script.google.com/macros/s/AKfycbzWT7aSLTZl-qW2peDaHMcsW_aA55ttVfheZThFfYpj7sMm09Mg_6Gp2xjc7Z0XNHmwpw/exec";
const DIRECT_GAS_STOCKS_URL = import.meta.env.VITE_STOCKS_GAS_URL || "";

const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v);
const normalizeStockPatch = (patch = {}) => {
  const get = (a, b) => (patch[a] !== undefined ? patch[a] : patch[b]);
  const actionRaw = get("action", "Action");
  const chassisRaw = get("chassisNo", "Chassis_No");
  const normalized = {
    movementId: get("movementId", "MovementId"),
    chassisNo: chassisRaw ? String(chassisRaw).toUpperCase() : undefined,
    company: get("company", "Company"),
    model: get("model", "Model"),
    variant: get("variant", "Variant"),
    color: get("color", "Color"),
    action: actionRaw ? String(actionRaw).toLowerCase() : undefined,
    sourceBranch: get("sourceBranch", "Source_Branch"),
    targetBranch: get("targetBranch", "Target_Branch"),
    returnTo: get("returnTo", "Return_To"),
    customerName: get("customerName", "Customer_Name"),
    transferStatus: get("transferStatus", "Transfer_Status"),
    notes: get("notes", "Notes"),
    createdByName: get("createdByName", "CreatedByName"),
    createdById: get("createdById", "CreatedById"),
    resolvedByName: get("resolvedByName", "ResolvedByName"),
    resolvedById: get("resolvedById", "ResolvedById"),
    resolvedAt: get("resolvedAt", "ResolvedAt"),
    deleted: get("deleted", "Deleted"),
    timestamp: get("timestamp", "Timestamp"),
  };
  return normalized;
};

const gasGet = async (params) => {
  // 1) Backend proxy (preferred)
  try {
    const res = await axiosInstance.get("/stocks/gas", {
      params,
      validateStatus: () => true,
    });
    if (isPlainObject(res?.data)) return res.data;
  } catch {
    // ignore and fall back
  }

  // 2) Direct GAS (fallback)
  const url = DIRECT_GAS_STOCKS_URL || DEFAULT_GAS_STOCKS_URL;
  try {
    const res = await axios.get(url, { params, validateStatus: () => true });
    return res?.data || {};
  } catch {
    return {};
  }
};

const gasPost = async (payload) => {
  // 1) Backend proxy (preferred)
  try {
    const res = await axiosInstance.post("/stocks/gas", payload || {}, {
      validateStatus: () => true,
    });
    if (isPlainObject(res?.data)) return res.data;
  } catch {
    // ignore and fall back
  }

  // 2) Direct GAS (fallback)
  const url = DIRECT_GAS_STOCKS_URL || DEFAULT_GAS_STOCKS_URL;
  try {
    const res = await fetch(url, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload || {}),
    });
    try {
      return await res.json();
    } catch {
      return {};
    }
  } catch {
    return {};
  }
};

// Fetch stock movements. Default to a high limit so admin can see all recent records.
export const listStocks = async ({ branch, mode, limit = 1000, page = 1 } = {}) => {
  const data = await gasGet({ action: "list", branch, mode, limit, page });
  return {
    success: !!data.ok,
    data: data.data || [],
    total: data.total || 0,
    count: data.count || (data.data ? data.data.length : 0),
  };
};

export const listStocksPublic = async ({ branch, mode, limit = 1000, page = 1 } = {}) => {
  const data = await gasGet({ action: "list", branch, mode, limit, page });
  return {
    success: !!data.ok,
    data: data.data || [],
    total: data.total || 0,
    count: data.count || (data.data ? data.data.length : 0),
  };
};

export const listCurrentStocks = async ({ branch, limit = 500, page = 1 } = {}) => {
  const data = await gasGet({ action: "current", branch, limit, page });
  return {
    success: !!data.ok,
    data: data.data || [],
    total: data.total || 0,
    count: data.count || (data.data ? data.data.length : 0),
  };
};

export const listCurrentStocksPublic = async ({ branch, limit = 500, page = 1 } = {}) => {
  const data = await gasGet({ action: "current", branch, limit, page });
  return {
    success: !!data.ok,
    data: data.data || [],
    total: data.total || 0,
    count: data.count || (data.data ? data.data.length : 0),
  };
};

// Pending transfers must hit the backend (GAS does not track transfer admits/rejects)
export const listPendingTransfers = async ({ branch, limit = 500 } = {}) => {
  const params = { action: "pending", limit };
  if (branch) params.branch = branch;
  const data = await gasGet(params);
  return { success: !!data.ok, data: data.data || [], message: data.message };
};

export const createStock = async ({ data: row, createdBy }) => {
  const payload = { action: "create", data: row, createdBy };
  const data = await gasPost(payload);
  return { success: !!data.ok, data: data.data, message: data.message };
};

export const updateStock = async (movementId, patch) => {
  const normalized = normalizeStockPatch(patch || {});
  const payload = { action: "update", movementId, data: normalized };
  const data = await gasPost(payload);
  return { success: !!data.ok, data: data.data, message: data.message };
};

export const deleteStock = async (movementId) => {
  const data = await gasPost({ action: "delete", movementId });
  return { success: !!data.ok, message: data.message };
};

export const admitTransfer = async (movementId, notes) => {
  const data = await gasPost({ action: "admit", movementId, notes });
  return { success: !!data.ok, data: data.data, message: data.message };
};

export const rejectTransfer = async (movementId, reason) => {
  const data = await gasPost({ action: "reject", movementId, reason, notes: reason });
  return { success: !!data.ok, data: data.data, message: data.message };
};
