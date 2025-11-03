import { useState, useEffect } from "react";
import { Button, Form, Input, message, Modal } from "antd"; // ✅ added message for notifications
import { Link, useNavigate, useLocation } from "react-router-dom";
//import { useDispatch } from "react-redux";
import "./auth.css";
import { LoginUser, GetCurrentUser, RequestPasswordReset, ResetPassword } from "../apiCalls/users";
//import { setUser } from "../redux/userSlice";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = Form.useForm();
  
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStage, setResetStage] = useState("request");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetTokenPrefill, setResetTokenPrefill] = useState("");
  const [resetRequestForm] = Form.useForm();
  const [resetPasswordForm] = Form.useForm();

  useEffect(() => {
    if (resetStage === "reset") {
      resetPasswordForm.setFieldsValue({ token: resetTokenPrefill });
    }
  }, [resetStage, resetTokenPrefill, resetPasswordForm]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tokenFromQuery = params.get("resetToken") || params.get("token");
    if (tokenFromQuery) {
      setResetTokenPrefill(tokenFromQuery);
      setResetStage("reset");
      setResetOpen(true);
    }
  }, [location.search]);

  const openResetModal = () => {
    setResetOpen(true);
    setResetStage("request");
    setResetTokenPrefill("");
    resetRequestForm.resetFields();
    resetPasswordForm.resetFields();
  };

  const closeResetModal = () => {
    setResetOpen(false);
    setResetStage("request");
    setResetTokenPrefill("");
    resetRequestForm.resetFields();
    resetPasswordForm.resetFields();
  };

  const onResetRequestFinish = async ({ email }) => {
    setResetLoading(true);
    try {
      const response = await RequestPasswordReset(String(email || "").trim());
      const successMsg = response?.message || "Reset instructions sent to your email.";
      if (response?.success) {
        message.success(successMsg);
      } else {
        message.info(successMsg);
      }

      if (response?.devResetToken) {
        setResetTokenPrefill(response.devResetToken);
        message.info(`Dev reset token: ${response.devResetToken}`, 6);
        setResetStage("reset");
      } else if (response?.emailSent) {
        closeResetModal();
      }
    } catch (error) {
      const status = error?.response?.status;
      if (status === 404) {
        message.warning("We couldn't find that email. Please double-check or contact your administrator.");
      } else if (status === 501) {
        message.info("Password reset isn't enabled yet. Please reach out to your administrator.");
      } else {
        message.error(error?.response?.data?.message || "Could not start the reset process. Try again later.");
      }
    } finally {
      setResetLoading(false);
    }
  };

  const onResetPasswordFinish = async ({ token, password }) => {
    setResetSubmitting(true);
    try {
      const response = await ResetPassword({ token: String(token || "").trim(), password });
      if (response?.success) {
        message.success(response?.message || "Password updated successfully.");
        closeResetModal();
      } else {
        message.error(response?.message || "Could not reset password. Try again.");
      }
    } catch (error) {
      const status = error?.response?.status;
      if (status === 400) {
        message.warning(error?.response?.data?.message || "Reset link is invalid or has expired.");
      } else {
        message.error(error?.response?.data?.message || "Could not reset password. Try again later.");
      }
    } finally {
      setResetSubmitting(false);
    }
  };

  const onFinish = async (values) => {
    if (import.meta.env.DEV) {
      console.log("Login form submitted:", values);
    }
    setLoading(true);

    try {
      // Call backend API (does not throw; returns {success, code, message})
      const data = await LoginUser(values);
      if (import.meta.env.DEV) {
        console.log("Login response:", data);
      }

      if (data?.success) {
        // Save token if your backend sends one
        if (data.token) {
          localStorage.setItem("token", data.token);
        }
        // Save minimal user profile if provided by login response
        if (data.user) {
          try { localStorage.setItem("user", JSON.stringify(data.user)); } catch {
            // ignore localStorage failures (storage quota, disabled storage, etc.)
          }
        }

        // Pull the latest profile to decide redirect by role
        // Best effort: refresh from /get-valid-user; ignore if it fails
        try {
          const profile = await GetCurrentUser();
          if (profile?.success && profile?.data) {
            localStorage.setItem("user", JSON.stringify(profile.data));
            const r = String(profile.data.role || '').toLowerCase();
            const { routeForRole } = await import('../utils/roleRoute');
            navigate(routeForRole(r));
            return;
          }
        } catch {
          // ignore
        }

        message.success("Login successful!");
        navigate("/dashboard"); // fallback redirect
      } else {
        // Clear any stale token/user on failed login
        try { localStorage.removeItem("token"); localStorage.removeItem("user"); } catch (e) { void e; }
        // Show precise message by status code
        const msg = data?.message || (data?.code === 401 ? "Invalid password" : data?.code === 404 ? "User does not exist" : "Invalid email or password");
        // Use warning for 404 (user), error for 401 (password), error otherwise
        if (data?.code === 404) {
          // Inline error + subtle toast (no modal)
          message.warning(msg);
          try { form.setFields([{ name: 'email', errors: ['User does not exist'] }]); } catch (e) { void e; }
        } else if (data?.code === 401) {
          // Inline error + subtle toast (no modal)
          message.error(msg);
          try { form.setFields([{ name: 'password', errors: ['Invalid password'] }]); } catch (e) { void e; }
        } else {
          // Generic inline errors + toast (no modal)
          message.error(msg);
          try { form.setFields([{ name: 'email', errors: [''] }, { name: 'password', errors: [''] }]); } catch (e) { void e; }
        }
        return;
      }
    } catch (error) {
      console.error("Login error:", error);
      localStorage.removeItem("user");
      const status = error?.response?.status;
      const errMsg = error?.response?.data?.message || "Something went wrong, please try again";
      if (status === 404) {
        message.warning(errMsg);
      } else if (status === 401) {
        message.error(errMsg);
      } else {
        message.error(errMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1 className="title">Login to Shantha Motors</h1>
        <Form layout="vertical" form={form} onFinish={onFinish}>
          <Form.Item
            label="Email"
            name="email"
            rules={[{ required: true, message: "Email is required" }]}
          >
            <Input type="email" placeholder="Enter your email" />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: "Password is required" }]}
          >
            <Input.Password placeholder="Enter your password" />
          </Form.Item>

          <div className="form-row">
            <span />
            <Button type="link" className="link" onClick={openResetModal}>
              Forgot password?
            </Button>
          </div>

          <Button
            type="primary"
            block
            htmlType="submit"
            loading={loading}
          >
            Login
          </Button>
        </Form>

        <p className="switch-text">
          New User? <Link to="/register">Register here</Link>
        </p>
      </div>
      <Modal
        title={resetStage === "reset" ? "Choose a new password" : "Reset your password"}
        open={resetOpen}
        onCancel={closeResetModal}
        footer={null}
        destroyOnClose
      >
        {resetStage === "request" ? (
          <>
            <p style={{ marginBottom: 16 }}>
              Enter the email you use for Shantha Motors. If we find a matching account, we'll send instructions to reset your password.
            </p>
            <Form
              form={resetRequestForm}
              layout="vertical"
              onFinish={onResetRequestFinish}
              name="resetPasswordRequest"
            >
              <Form.Item
                label="Email"
                name="email"
                rules={[
                  { required: true, message: "Email is required" },
                  { type: "email", message: "Enter a valid email address" },
                ]}
              >
                <Input placeholder="you@example.com" autoComplete="email" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={resetLoading}>
                Send reset link
              </Button>
            </Form>
          </>
        ) : (
          <>
            <p style={{ marginBottom: 16 }}>
              Paste the reset token you received (or the dev token shown above) and choose a new password.
            </p>
            <Form
              form={resetPasswordForm}
              layout="vertical"
              onFinish={onResetPasswordFinish}
              name="resetPasswordConfirm"
              initialValues={{ token: resetTokenPrefill }}
            >
              <Form.Item
                label="Reset token"
                name="token"
                rules={[{ required: true, message: "Reset token is required" }]}
              >
                <Input placeholder="Paste token" autoComplete="one-time-code" />
              </Form.Item>
              <Form.Item
                label="New password"
                name="password"
                rules={[
                  { required: true, message: "Password is required" },
                  { min: 6, message: "At least 6 characters" },
                ]}
                hasFeedback
              >
                <Input.Password placeholder="Enter new password" autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                label="Confirm password"
                name="confirm"
                dependencies={["password"]}
                hasFeedback
                rules={[
                  { required: true, message: "Please confirm your password" },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue("password") === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error("Passwords do not match"));
                    },
                  }),
                ]}
              >
                <Input.Password placeholder="Re-enter new password" autoComplete="new-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={resetSubmitting}>
                Update password
              </Button>
              <Button type="link" block onClick={() => setResetStage("request")}>Back</Button>
            </Form>
          </>
        )}
      </Modal>
    </div>
  );
}

export default Login;
