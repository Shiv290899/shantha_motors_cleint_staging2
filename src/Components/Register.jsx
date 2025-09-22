import React from "react";
import { Button, Form, Input, Checkbox, Typography, message } from "antd";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import "./auth.css";
import { RegisterUser } from "../apiCalls/users";

const { Title, Text } = Typography;

function Register() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);

  // TODO: point to your real API (Express/Mongo)
  const RegisterUser = (payload) =>
    axios.post("http://localhost:8082/api/users/register", payload);

  const onFinish = async (values) => {
    const payload = {
      name: values.name,
      email: values.email,
      phone: values.phone,
      password: values.password,
    };

    try {
      setLoading(true);
      const res = await RegisterUser(payload);
      const { data } = res || {};
      if (data?.success) {
        message.success("Registration successful! Please login.");
        navigate("/login");
      } else {
        message.error(data?.message || "Registration failed. Try again.");
      }
    } catch (err) {
      const apiMsg =
        err?.response?.data?.message ||
        err?.message ||
        "Registration failed. Please try again.";
      message.error(apiMsg);
    } finally {
      setLoading(false);
    }
  };

  const onFinishFailed = () => {
    message.warning("Please fix the errors in the form.");
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <Title level={2} className="title">Create your account</Title>
        <Text type="secondary" className="subtitle">
          Join Shantha Motors to manage bookings and more.
        </Text>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          onFinishFailed={onFinishFailed}
          className="auth-form"
          requiredMark={false}
        >
          {/* Name */}
          <Form.Item
            label="Full Name"
            name="name"
            rules={[
              { required: true, message: "Name is required" },
              { min: 2, message: "Please enter a valid name" },
            ]}
          >
            <Input size="large" placeholder="Enter your full name" className="input-field" />
          </Form.Item>

          {/* Email */}
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: "Email is required" },
              { type: "email", message: "Enter a valid email" },
            ]}
          >
            <Input size="large" type="email" placeholder="name@example.com" className="input-field" />
          </Form.Item>

          {/* Phone (India 10-digit) */}
          <Form.Item
            label="Mobile Number"
            name="phone"
            rules={[
              { required: true, message: "Mobile number is required" },
              { pattern: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit Indian number" },
            ]}
          >
            <Input size="large" placeholder="9876543210" maxLength={10} className="input-field" />
          </Form.Item>

          {/* Password */}
          <Form.Item
            label="Password"
            name="password"
            rules={[
              { required: true, message: "Password is required" },
              { min: 6, message: "At least 6 characters" },
            ]}
            hasFeedback
          >
            <Input.Password size="large" placeholder="Create a password" className="input-field" />
          </Form.Item>

          {/* Confirm Password */}
          <Form.Item
            label="Confirm Password"
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
            <Input.Password size="large" placeholder="Re-enter your password" className="input-field" />
          </Form.Item>

          {/* Terms */}
          <Form.Item
            name="terms"
            valuePropName="checked"
            rules={[
              {
                validator: (_, v) =>
                  v ? Promise.resolve() : Promise.reject(new Error("Please accept Terms & Privacy")),
              },
            ]}
          >
            <Checkbox>
              I agree to the <Link to="/terms" className="link">Terms</Link> and{" "}
              <Link to="/privacy" className="link">Privacy Policy</Link>.
            </Checkbox>
          </Form.Item>

          {/* Submit */}
          <Button
            type="primary"
            block
            size="large"
            htmlType="submit"
            className="auth-button"
            loading={loading}
          >
            Register
          </Button>
        </Form>

        <p className="switch-text">
          Already a user? <Link to="/login" className="link-strong">Login here</Link>
        </p>
      </div>
    </div>
  );
}

export default Register;