import { axiosInstance } from ".";

export const listAnnouncementsPublic = async (params = {}) => {
  const { data, status } = await axiosInstance.get("/announcements/public", { params, validateStatus: () => true });
  return { ...data, _status: status };
};

export const listAnnouncementsAdmin = async (params = {}) => {
  const { data, status } = await axiosInstance.get("/announcements", { params, validateStatus: () => true });
  return { ...data, _status: status };
};

export const createAnnouncement = async (payload) => {
  const { data, status } = await axiosInstance.post("/announcements", payload, { validateStatus: () => true });
  return { ...data, _status: status };
};

export const deleteAnnouncement = async (id) => {
  const { data, status } = await axiosInstance.delete(`/announcements/${id}`, { validateStatus: () => true });
  return { ...data, _status: status };
};

export const ackAnnouncement = async (id) => {
  const { data, status } = await axiosInstance.post(`/announcements/${id}/ack`, {}, { validateStatus: () => true });
  return { ...data, _status: status };
};

