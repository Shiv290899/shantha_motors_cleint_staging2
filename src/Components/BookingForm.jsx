import React, { useState, useEffect, useMemo } from "react";
import {
  Form,
  Input,
  InputNumber,
  Select,
  Upload,
  Button,
  Row,
  Col,
  Card,
  Typography,
  message,
  Grid,
  Slider,
  Space,
  Tooltip,
  Radio,
  Divider,
  Statistic,
} from "antd";
import {
  InboxOutlined,
  CreditCardOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;
const { Dragger } = Upload;
const { useBreakpoint } = Grid;
const { Option } = Select;

const phoneRule = [
  { required: true, message: "Mobile number is required" },
  { pattern: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit Indian mobile number" },
];

// Normalize keys from your Excel-exported JSON
const normalizeRow = (row = {}) => ({
  company: String(row["Company Name"] || "").trim(),
  model: String(row["Model Name"] || "").trim(),
  variant: String(row["Variant"] || "").trim(),
  onRoadPrice: Number(String(row["On-Road Price"] || "0").replace(/[,₹\s]/g, "")) || 0,
});

// INR formatter
const inr0 = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(n || 0)));

export default function BookingForm() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const isTabletOnly = screens.md && !screens.lg;

  const [form] = Form.useForm();
  const [aadharList, setAadharList] = useState([]);
  const [panList, setPanList] = useState([]);
  const [bikeData, setBikeData] = useState([]);

  const [selectedCompany, setSelectedCompany] = useState("");
  const [selectedModel, setSelectedModel] = useState("");

  // ---- EMI STATE (driven by form fields) ----
  const fixedProcessingFee = 8000;
  const [emiPrice, setEmiPrice] = useState(0);          // on-road price
  const [emiDown, setEmiDown] = useState(0);            // down payment (booking amount)
  const [emiRate, setEmiRate] = useState(11);
  const [tenureType, setTenureType] = useState("months"); // "months" | "years"
  const [tenure, setTenure] = useState(24);

  // Load & normalize from /public/bikeData.json
  useEffect(() => {
    fetch("/bikeData.json")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const cleaned = data.map(normalizeRow).filter(r => r.company && r.model && r.variant);
          setBikeData(cleaned);
        } else {
          message.error("Invalid bike data format");
        }
      })
      .catch(() => message.error("Failed to load bike data"));
  }, []);

  // Dropdown lists
  const companies = useMemo(
    () => [...new Set(bikeData.map((r) => r.company))],
    [bikeData]
  );

  const models = useMemo(
    () =>
      [...new Set(bikeData.filter((r) => r.company === selectedCompany).map((r) => r.model))],
    [bikeData, selectedCompany]
  );

  const variants = useMemo(
    () =>
      [
        ...new Set(
          bikeData
            .filter((r) => r.company === selectedCompany && r.model === selectedModel)
            .map((r) => r.variant)
        ),
      ],
    [bikeData, selectedCompany, selectedModel]
  );

  // When variant changes, set both: form.onRoadPrice and EMI price
  const handleVariantChange = (value) => {
    const found = bikeData.find(
      (r) => r.company === selectedCompany && r.model === selectedModel && r.variant === value
    );
    const price = found ? found.onRoadPrice : 0;
    form.setFieldsValue({ onRoadPrice: price });
    setEmiPrice(price);
  };

  // Keep EMI Down Payment in sync with "Booking Amount"
  const handleBookingAmountChange = (val) => {
    const clean = Number(val || 0);
    setEmiDown(clean);
  };

  // Upload rules
  const beforeUpload = (file) => {
    const isValidType =
      file.type === "application/pdf" ||
      file.type === "image/jpeg" ||
      file.type === "image/png";
    if (!isValidType) {
      message.error("Only PDF / JPG / PNG are allowed.");
      return Upload.LIST_IGNORE;
    }
    const isLt4M = file.size / 1024 / 1024 < 4;
    if (!isLt4M) {
      message.error("File must be smaller than 4MB.");
      return Upload.LIST_IGNORE;
    }
    return false;
  };

  const onFinish = (values) => {
    const aadhar = aadharList[0]?.originFileObj || null;
    const pan = panList[0]?.originFileObj || null;

    const payload = {
      ...values,
      mobileNumber: values.mobileNumber?.trim(),
      alternateMobileNumber: values.alternateMobileNumber?.trim() || undefined,
      documents: { aadhar, pan },

      // Helpful to include EMI snapshot in submission:
      emiSnapshot: {
        onRoadPrice: emiPrice,
        downPayment: emiDown,
        interestRate: emiRate,
        tenureType,
        tenure,
        ...emiCalc, // from memo below
      },
    };

    console.log("Booking submitted:", payload);
    message.success("✅ Booking submitted!");
    form.resetFields();
    setAadharList([]);
    setPanList([]);
    setSelectedCompany("");
    setSelectedModel("");
    // reset emi
    setEmiPrice(0);
    setEmiDown(0);
  };

  const onFinishFailed = ({ errorFields }) => {
    if (errorFields?.length) {
      form.scrollToField(errorFields[0].name, { behavior: "smooth", block: "center" });
    }
  };

  // -------- EMI CALC (Flat/Simple interest) --------
  const emiCalc = useMemo(() => {
    const base = Math.max(Number(emiPrice || 0) - Number(emiDown || 0), 0);
    const p = base + fixedProcessingFee;
    const m = tenureType === "years"
      ? Math.max(1, Number(tenure || 0)) * 12
      : Math.max(1, Number(tenure || 0));
    const y = m / 12;
    const r = Number(emiRate || 0) / 100;

    const interest = p * r * y;
    const total = p + interest;
    const monthly = m > 0 ? total / m : 0;

    return {
      principal: isFinite(p) ? p : 0,
      months: isFinite(m) ? m : 0,
      years: isFinite(y) ? y : 0,
      totalInterest: isFinite(interest) ? interest : 0,
      totalPayable: isFinite(total) ? total : 0,
      monthlyPay: isFinite(monthly) ? monthly : 0,
    };
  }, [emiPrice, emiDown, emiRate, tenure, tenureType]);

  // Header badge
  const headerBadge = (
    <div
      style={{
        height: isMobile ? 40 : 44,
        width: isMobile ? 40 : 44,
        borderRadius: 12,
        display: "grid",
        placeItems: "center",
        color: "white",
        background: "linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)",
        boxShadow: "0 8px 20px rgba(37, 99, 235, 0.35)",
        fontSize: isMobile ? 20 : 22,
      }}
    >
      🏍️
    </div>
  );

  return (
    <div
      style={{
        padding: isMobile ? 12 : isTabletOnly ? 18 : 24,
        background: isMobile ? "transparent" : "linear-gradient(180deg,#f8fbff 0%,#ffffff 100%)",
        minHeight: "100dvh",
        display: "grid",
        alignItems: "start",
      }}
    >
      <Card
        bordered={false}
        style={{
          width: "100%",
          maxWidth: 920,
          margin: isMobile ? "8px auto 24dvh" : "16px auto",
          borderRadius: 16,
          boxShadow: "0 10px 30px rgba(37, 99, 235, 0.10), 0 2px 8px rgba(0,0,0,0.06)",
        }}
        bodyStyle={{ padding: isMobile ? 16 : 28 }}
        headStyle={{ borderBottom: "none", padding: isMobile ? "12px 16px 0" : "16px 28px 0" }}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {headerBadge}
            <div>
              <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
                Two Wheeler Booking
              </Title>
              <Text type="secondary">Fill the details below to reserve your ride.</Text>
            </div>
          </div>
        }
      >
        <Form
          layout="vertical"
          form={form}
          onFinish={onFinish}
          onFinishFailed={onFinishFailed}
          requiredMark="optional"
        >
          {/* 1) Customer Name */}
          <Form.Item
            label="Customer Name"
            name="customerName"
            rules={[{ required: true, message: "Please enter customer name" }]}
          >
            <Input size="large" placeholder="e.g., Rahul Sharma" allowClear />
          </Form.Item>

          {/* 2) Phones */}
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Mobile Number"
                name="mobileNumber"
                rules={phoneRule}
                normalize={(v) => (v ? v.replace(/\D/g, "").slice(0, 10) : v)}
              >
                <Input size="large" placeholder="10-digit number" maxLength={10} inputMode="numeric" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Alternate Mobile Number"
                name="alternateMobileNumber"
                rules={[{ pattern: /^$|^[6-9]\d{9}$/, message: "Enter a valid 10-digit number" }]}
                normalize={(v) => (v ? v.replace(/\D/g, "").slice(0, 10) : v)}
              >
                <Input size="large" placeholder="Optional" maxLength={10} inputMode="numeric" allowClear />
              </Form.Item>
            </Col>
          </Row>

          {/* 3) Booking Amount (syncs to EMI Down Payment) */}
          <Row gutter={[16, 0]}>
            <Col xs={24} md={8}>
              <Form.Item
                label="Booking Amount (₹) — Paid by Customer"
                name="bookingAmount"
                rules={[{ required: true, message: "Enter booking amount" }]}
              >
                <InputNumber
                  size="large"
                  style={{ width: "100%" }}
                  min={0}
                  step={500}
                  prefix={<CreditCardOutlined />}
                  placeholder="Enter amount paid"
                  onChange={handleBookingAmountChange}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* 4) Company → Model → Variant (sets On-Road Price) */}
          <Row gutter={[16, 0]}>
            <Col xs={24} md={8}>
              <Form.Item
                label="Company"
                name="company"
                rules={[{ required: true, message: "Select a company" }]}
              >
                <Select
                  size="large"
                  placeholder="Select Company"
                  onChange={(value) => {
                    setSelectedCompany(value);
                    setSelectedModel("");
                    form.setFieldsValue({
                      bikeModel: undefined,
                      variant: undefined,
                      onRoadPrice: undefined,
                    });
                    setEmiPrice(0);
                  }}
                >
                  {companies.map((c, i) => (
                    <Option key={i} value={c}>{c}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item
                label="Bike Model"
                name="bikeModel"
                rules={[{ required: true, message: "Select a model" }]}
              >
                <Select
                  size="large"
                  placeholder="Select Model"
                  disabled={!selectedCompany}
                  onChange={(value) => {
                    setSelectedModel(value);
                    form.setFieldsValue({ variant: undefined, onRoadPrice: undefined });
                    setEmiPrice(0);
                  }}
                >
                  {models.map((m, i) => (
                    <Option key={i} value={m}>{m}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item
                label="Variant"
                name="variant"
                rules={[{ required: true, message: "Select a variant" }]}
              >
                <Select
                  size="large"
                  placeholder="Select Variant"
                  disabled={!selectedModel}
                  onChange={handleVariantChange}
                >
                  {variants.map((v, i) => (
                    <Option key={i} value={v}>{v}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* Read-only On-Road Price (for clarity) */}
          <Row gutter={[16, 0]}>
            <Col xs={24} md={16}>
              <Form.Item label="On-Road Price (₹)" name="onRoadPrice">
                <InputNumber
                  size="large"
                  style={{ width: "100%" }}
                  readOnly
                  value={emiPrice}
                  formatter={(val) => `₹ ${String(val ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* 5) EMI CALCULATOR (inline) */}
          <Card
            size="small"
            style={{ borderRadius: 12, marginTop: 4, marginBottom: 12 }}
            bodyStyle={{ padding: isMobile ? 12 : 20 }}
            title={
              <Space>
                <Text strong>EMI Calculator</Text>
                <Tooltip title="Uses On-Road Price from the selected variant and Booking Amount as Down Payment.">
                  <InfoCircleOutlined />
                </Tooltip>
              </Space>
            }
          >
            <Row gutter={[16, 16]}>
              {/* On-Road Price (locked to selection) */}
              <Col xs={24} md={12}>
                <Form.Item label="On-Road Price (₹)">
                  <InputNumber
                    size={isMobile ? "large" : "middle"}
                    style={{ width: "100%" }}
                    readOnly
                    value={emiPrice}
                    formatter={(val) => `₹ ${String(val ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`}
                  />
                  <Slider
                    disabled
                    tooltip={{ open: false }}
                    min={0}
                    max={Math.max(emiPrice, 100000)}
                    value={emiPrice}
                    style={{ marginTop: 8 }}
                  />
                </Form.Item>
              </Col>

              {/* Down Payment (kept in sync with Booking Amount) */}
              <Col xs={24} md={12}>
                <Form.Item label="Down Payment (₹)">
                  <InputNumber
                    size={isMobile ? "large" : "middle"}
                    style={{ width: "100%" }}
                    min={0}
                    max={emiPrice}
                    step={1000}
                    value={emiDown}
                    onChange={(v) => {
                      const n = Math.min(Number(v || 0), emiPrice || 0);
                      setEmiDown(n);
                      // keep Form's bookingAmount in sync
                      form.setFieldsValue({ bookingAmount: n });
                    }}
                    formatter={(val) => `₹ ${String(val ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`}
                    parser={(val) => String(val || "0").replace(/[₹,\s,]/g, "")}
                  />
                  <Slider
                    tooltip={{ open: false }}
                    min={0}
                    max={emiPrice || 0}
                    step={1000}
                    value={Math.min(emiDown, emiPrice || 0)}
                    onChange={(v) => {
                      setEmiDown(v);
                      form.setFieldsValue({ bookingAmount: v });
                    }}
                    style={{ marginTop: 8 }}
                  />
                </Form.Item>
              </Col>

              {/* Interest Rate (Flat) */}
              <Col xs={24} md={12}>
                <Form.Item label="Interest Rate (% p.a., flat)">
                  <InputNumber
                    size={isMobile ? "large" : "middle"}
                    min={0}
                    max={36}
                    step={0.1}
                    value={emiRate}
                    onChange={(v) => setEmiRate(Number(v || 0))}
                    style={{ width: "100%" }}
                  />
                  <Slider
                    tooltip={{ open: false }}
                    min={0}
                    max={36}
                    step={0.1}
                    value={emiRate}
                    onChange={(v) => setEmiRate(Number(v))}
                    style={{ marginTop: 8 }}
                  />
                </Form.Item>
              </Col>

              {/* Tenure */}
              <Col xs={24} md={12}>
                <Form.Item label="Tenure">
                  <Radio.Group
                    value={tenureType}
                    onChange={(e) => {
                      const next = e.target.value;
                      setTenureType(next);
                      if (next === "years") setTenure(Math.max(1, Math.round(tenure / 12)));
                      else setTenure(Math.max(1, Math.round(tenure * 12)));
                    }}
                    style={{ marginBottom: 8, display: "flex", gap: 8, flexWrap: "wrap" }}
                  >
                    <Radio.Button value="months">Months</Radio.Button>
                    <Radio.Button value="years">Years</Radio.Button>
                  </Radio.Group>

                  {tenureType === "months" ? (
                    <>
                      <InputNumber
                        min={1}
                        max={120}
                        step={1}
                        value={tenure}
                        onChange={(v) => setTenure(Number(v || 0))}
                        style={{ width: "100%" }}
                      />
                      <Slider
                        tooltip={{ open: false }}
                        min={1}
                        max={120}
                        step={1}
                        value={tenure}
                        onChange={(v) => setTenure(Number(v))}
                        style={{ marginTop: 8 }}
                      />
                    </>
                  ) : (
                    <>
                      <InputNumber
                        min={1}
                        max={10}
                        step={1}
                        value={tenure}
                        onChange={(v) => setTenure(Number(v || 0))}
                        style={{ width: "100%" }}
                      />
                      <Slider
                        tooltip={{ open: false }}
                        min={1}
                        max={10}
                        step={1}
                        value={tenure}
                        onChange={(v) => setTenure(Number(v))}
                        style={{ marginTop: 8 }}
                      />
                    </>
                  )}
                </Form.Item>
              </Col>
            </Row>

            <Divider style={{ margin: isMobile ? "12px 0" : "16px 0" }} />

            {/* EMI Results */}
            <Row gutter={[16, 16]}>
             

              <Col xs={24} sm={12} lg={6}>
                <Card size="small" bordered style={{ borderRadius: 12 }}>
                  <Statistic title="Monthly Payment" value={inr0(emiCalc.monthlyPay)} />
                  <Text type="secondary" style={{ display: "block" }}>
                    over {emiCalc.months} months
                  </Text>
                </Card>
              </Col>

              <Col xs={24} sm={12} lg={6}>
                <Card size="small" bordered style={{ borderRadius: 12 }}>
                  <Statistic title="Total Interest (flat)" value={inr0(emiCalc.totalInterest)} />
                  <Text type="secondary" style={{ display: "block" }}>
                    {emiRate}% p.a. × {(emiCalc.years).toFixed(2)} yrs
                  </Text>
                </Card>
              </Col>

              <Col xs={24} sm={12} lg={6}>
                <Card size="small" bordered style={{ borderRadius: 12 }}>
                  <Statistic title="Total Payable" value={inr0(emiCalc.totalPayable)} />
                </Card>
              </Col>
            </Row>
          </Card>

          {/* 6) Address */}
          <Form.Item
            label="Address"
            name="address"
            rules={[{ required: true, message: "Please enter address" }]}
          >
            <Input.TextArea
              size="large"
              rows={isMobile ? 3 : 4}
              placeholder="House No, Street, Area, City, PIN"
              allowClear
            />
          </Form.Item>

          {/* 7) Documents */}
          <Card
            size="small"
            title={<Text strong>Upload Documents</Text>}
            style={{ marginTop: 8, marginBottom: 12, borderRadius: 12 }}
            headStyle={{ background: "#f8fafc", borderRadius: 12 }}
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Aadhar Card (PDF/JPG/PNG)"
                  rules={[
                    {
                      validator: () =>
                        aadharList.length
                          ? Promise.resolve()
                          : Promise.reject(new Error("Upload Aadhar")),
                    },
                  ]}
                >
                  <Dragger
                    multiple={false}
                    beforeUpload={beforeUpload}
                    fileList={aadharList}
                    onChange={({ fileList }) => setAadharList(fileList)}
                    maxCount={1}
                    accept=".pdf,.jpg,.jpeg,.png"
                    itemRender={(origin) => origin}
                  >
                    <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                    <p className="ant-upload-text">Click or drag file to this area to upload</p>
                  </Dragger>
                </Form.Item>
              </Col>

              <Col xs={24} md={12}>
                <Form.Item
                  label="PAN Card (PDF/JPG/PNG)"
                  rules={[
                    {
                      validator: () =>
                        panList.length
                          ? Promise.resolve()
                          : Promise.reject(new Error("Upload PAN")),
                    },
                  ]}
                >
                  <Dragger
                    multiple={false}
                    beforeUpload={beforeUpload}
                    fileList={panList}
                    onChange={({ fileList }) => setPanList(fileList)}
                    maxCount={1}
                    accept=".pdf,.jpg,.jpeg,.png"
                    itemRender={(origin) => origin}
                  >
                    <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                    <p className="ant-upload-text">Click or drag file to this area to upload</p>
                  </Dragger>
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* 8) Submit */}
          <Form.Item style={{ marginTop: 8, marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" size={isMobile ? "middle" : "large"} block>
              Reserve My Bike
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
