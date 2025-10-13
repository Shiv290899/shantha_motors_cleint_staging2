import { axiosInstance } from "./index";

export const saveQuotationForm = async (payload) => {
  const { data } = await axiosInstance.post("/forms/quotation", payload);
  return data;
};

export const getNextQuotationSerial = async () => {
  const { data } = await axiosInstance.get("/forms/quotation/next-serial");
  return data;
};
export const reserveQuotationSerial = async (mobile, branchCode, branchId) => {
  const { data } = await axiosInstance.post("/forms/quotation/serial/reserve", { mobile, branchCode, branchId });
  return data;
};

export const saveJobCardForm = async (payload) => {
  const { data } = await axiosInstance.post("/forms/jobcard", payload);
  return data;
};

export const getNextJobcardSerial = async () => {
  const { data } = await axiosInstance.get("/forms/jobcard/next-serial");
  return data;
};
export const reserveJobcardSerial = async (mobile, branchCode, branchId) => {
  const { data } = await axiosInstance.post("/forms/jobcard/serial/reserve", { mobile, branchCode, branchId });
  return data;
};

export const saveBookingForm = async (payload) => {
  const { data } = await axiosInstance.post("/forms/booking", payload);
  return data;
};

export const saveBookingViaWebhook = async ({ webhookUrl, payload, headers, method }) => {
  const { data } = await axiosInstance.post("/forms/booking/webhook", { webhookUrl, payload, headers, method });
  return data;
};

// Jobcard-specific webhook proxy (separate from booking for clarity)
export const saveJobcardViaWebhook = async ({ webhookUrl, payload, headers, method }) => {
  const { data } = await axiosInstance.post("/forms/jobcard/webhook", { webhookUrl, payload, headers, method });
  return data;
};

export const saveStockMovementForm = async (payload) => {
  const { data } = await axiosInstance.post("/forms/stock", payload);
  return data;
};
