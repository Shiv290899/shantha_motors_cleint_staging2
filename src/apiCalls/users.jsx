import { axiosInstance } from ".";

// Register
// Return a friendly result for duplicate (409) instead of throwing,
// so the UI can show a warning popup directly.
export const RegisterUser = async (values) => {
  try {
    // Resolve for all HTTP statuses so UI can handle gracefully
    const res = await axiosInstance.post("/users/register", values, {
      validateStatus: () => true,
    });
    const status = res?.status;
    const payload = res?.data;

    if (status >= 200 && status < 300) return payload;

    const message = payload?.message || "Registration failed. Please try again.";
    if (status === 409) return { success: false, code: 409, message };
    return { success: false, code: status, message };
  } catch (error) {
    // Network/transport failure
    const message = error?.message || "Could not reach server. Please try again.";
    return { success: false, code: 0, message };
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
    throw error;
  }
};

// Get valid user
export const GetCurrentUser = async () => {
  try {
    const token = localStorage.getItem('token');
    const { data } = await axiosInstance.get("/users/get-valid-user", {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      params: token ? { token } : undefined, // fallback path if a proxy strips headers
    });
    return data;
  } catch (error) {
    console.error("GetCurrentUser failed", error);
  }
};

// Trigger password reset flow
export const RequestPasswordReset = async (email) => {
  try {
    const { data } = await axiosInstance.post("/users/forgot-password", { email });
    return data;
  } catch (error) {
    console.error("RequestPasswordReset failed", error);
    throw error;
  }
};

export const ResetPassword = async ({ token, password }) => {
  try {
    const { data } = await axiosInstance.post("/users/reset-password", { token, password });
    return data;
  } catch (error) {
    console.error("ResetPassword failed", error);
    throw error;
  }
};
