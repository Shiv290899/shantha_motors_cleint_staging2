import { axiosInstance } from ".";

export const listUsers = async (params = {}) => {
  const token = localStorage.getItem("token");
  const { data, status } = await axiosInstance.get("/users", {
    params: token ? { ...params, token } : params,
    validateStatus: () => true,
  });
  return { ...data, _status: status };
};

export const listUsersPublic = async (params = {}) => {
  const { data, status } = await axiosInstance.get("/users/public", {
    params,
    validateStatus: () => true,
  });
  return { ...data, _status: status };
};



export const updateUser = async (id, payload) => {
  const token = localStorage.getItem("token");
  const { data, status } = await axiosInstance.put(`/users/${id}`, payload, {
    params: token ? { token } : undefined,
    validateStatus: () => true,
  });
  return { ...data, _status: status };
};

export const deleteUser = async (id) => {
  const token = localStorage.getItem("token");
  const { data, status } = await axiosInstance.delete(`/users/${id}`, {
    params: token ? { token } : undefined,
    validateStatus: () => true,
  });
  return { ...data, _status: status };
};
