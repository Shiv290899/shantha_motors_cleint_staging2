import { useState } from "react";
import { Button, Form, Input, message } from "antd"; // ✅ added message for notifications
import { Link, useNavigate } from "react-router-dom";
import "./auth.css";
import { LoginUser } from "../apiCalls/users";
import { CompassOutlined } from "@ant-design/icons";

function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values) => {
    console.log("Login form submitted:", values);
    setLoading(true);

    try {
      // Call backend API
      const data = await LoginUser(values);
      console.log(data);

      if (data?.success) {
        // Save token if your backend sends one
        if (data.token) {
          localStorage.setItem("token", data.token);
        }

        message.success("Login successful!");
        navigate("/"); // redirect home
      } else {
        message.error(data?.message || "Invalid email or password");
      }
    } catch (error) {
      console.error("Login error:", error);
      message.error("Something went wrong, please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1 className="title">Login to Shantha Motors</h1>
        <Form layout="vertical" onFinish={onFinish}>
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
    </div>
  );
}

export default Login;
