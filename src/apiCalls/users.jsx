import { axiosInstance } from ".";

// Register
export const RegisterUser = async (values) => {
  try {
    const { data } = await axiosInstance.post("/users/register", values);
    return data;
  } catch (error) {
    console.error("RegisterUser failed", error);
  }
};

// Login
export const LoginUser = async (values) => {
  try {
    const { data } = await axiosInstance.post("/users/login", values);
    if (data?.token) {
      localStorage.setItem("token", data.token); // 👈 Save token
    }
    return data;
  } catch (error) {
    console.error("LoginUser failed", error);
  }
};

// Get valid user
export const GetCurrentUser = async () => {
  try {
    const { data } = await axiosInstance.get("/users/get-valid-user");
    return data;
  } catch (error) {
    console.error("GetCurrentUser failed", error);
  }
};
