import { axiosInstance } from "./index";

export const saveQuotationForm = async (payload) => {
  const { data } = await axiosInstance.post("/forms/quotation", payload);
  return data;
};

export const getNextQuotationSerial = async () => {
  const { data } = await axiosInstance.get("/forms/quotation/next-serial");
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
