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
  Radio,
  DatePicker,
} from "antd";
import { InboxOutlined, CreditCardOutlined } from "@ant-design/icons";
import { saveBookingForm, saveBookingViaWebhook } from "../apiCalls/forms";
import { GetCurrentUser } from "../apiCalls/users";
import { getBranch } from "../apiCalls/branches";

const { Title, Text } = Typography;
const { Dragger } = Upload;
const { useBreakpoint } = Grid;
const { Option } = Select;

// Finance options (for HP)
const FINANCIERS = [
  "IDFC",
  "L&T FINANCE LIMITED",
  "JANA SMALL FINANCE BANK",
  "SHRIRAM FINANCE",
  "TVS CREDIT",
  "INDUSIND BANK",
  "AXIS BANK",
  "HINDHUJA FINANCE",
];

const phoneRule = [
  { required: true, message: "Mobile number is required" },
  { pattern: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit Indian mobile number" },
];

// ---- Vehicle data via Google Sheet (shared with Quotation) ----
// CSV published from Google Sheets (same as in Quotation.jsx)
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQsXcqX5kmqG1uKHuWUnBCjMXBugJn7xljgBsRPIm2gkk2PpyRnEp8koausqNflt6Q4Gnqjczva82oN/pub?output=csv";

// Minimal CSV parser (copied from Quotation logic)
const parseCsv = (text) => {
  const rows = [];
  let row = [], col = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"' && !inQuotes) { inQuotes = true; continue; }
    if (c === '"' && inQuotes) {
      if (n === '"') { col += '"'; i++; continue; }
      inQuotes = false; continue;
    }
    if (c === "," && !inQuotes) { row.push(col); col = ""; continue; }
    if ((c === "\n" || c === "\r") && !inQuotes) {
      if (col !== "" || row.length) { row.push(col); rows.push(row); row = []; col = ""; }
      if (c === "\r" && n === "\n") i++;
      continue;
    }
    col += c;
  }
  if (col !== "" || row.length) { row.push(col); rows.push(row); }
  return rows;
};

// Header aliases (copied from Quotation)
const HEADERS = {
  company: ["Company", "Company Name"],
  model: ["Model", "Model Name"],
  variant: ["Variant"],
  price: ["On-Road Price", "On Road Price", "Price"],
};

const pick = (row, keys) =>
  String(keys.map((k) => row[k] ?? "").find((v) => v !== "") || "").trim();

const normalizeSheetRow = (row = {}) => ({
  company: pick(row, HEADERS.company),
  model: pick(row, HEADERS.model),
  variant: pick(row, HEADERS.variant),
  onRoadPrice:
    Number(String(pick(row, HEADERS.price) || "0").replace(/[,\s₹]/g, "")) || 0,
});

// Fallback normalize (for older static JSON shape if ever used)
const normalizeFallbackRow = (row = {}) => ({
  company: String(row["Company Name"] || row.company || "").trim(),
  model: String(row["Model Name"] || row.model || "").trim(),
  variant: String(row["Variant"] || row.variant || "").trim(),
  onRoadPrice: Number(String(row["On-Road Price"] || row.onRoadPrice || "0").replace(/[,₹\s]/g, "")) || 0,
});


export default function BookingForm() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const isTabletOnly = screens.md && !screens.lg;

  const [form] = Form.useForm();
  const [aadharList, setAadharList] = useState([]);
  const [panList, setPanList] = useState([]);
  const [otherList, setOtherList] = useState([]); // optional extra attachment
  const [bikeData, setBikeData] = useState([]);
  const [userRole, setUserRole] = useState();
  const [userStaffName, setUserStaffName] = useState();

  const [selectedCompany, setSelectedCompany] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const purchaseType = Form.useWatch("purchaseType", form);

  // On-road price of selected variant (for display only)
  const [emiPrice, setEmiPrice] = useState(0);

  // Load vehicle data from Google Sheet (same dataset as Quotation). Fallback to /bikeData.json
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Prefill executive + branch from logged-in user (staff-like roles)
      try {
        const readLocalUser = () => {
          try { const raw = localStorage.getItem('user'); return raw ? JSON.parse(raw) : null; } catch { return null; }
        };
        const pickId = (v) => {
          if (!v) return null;
          if (typeof v === 'string') return v;
          if (typeof v === 'object') return v._id || v.id || v.$oid || null;
          return null;
        };
        let user = readLocalUser();
        if (!user || !user.formDefaults) {
          const res = await GetCurrentUser().catch(() => null);
          if (res?.success && res.data) {
            user = res.data;
            try { localStorage.setItem('user', JSON.stringify(user)); } catch {}
          }
        }
        if (user && !cancelled) {
          const staffName = user?.formDefaults?.staffName || user?.name || undefined;
          const role = user?.role ? String(user.role).toLowerCase() : undefined;
          let branchName = user?.formDefaults?.branchName;
          if (!branchName) {
            const branchId = pickId(user?.formDefaults?.branchId) || pickId(user?.primaryBranch) || (Array.isArray(user?.branches) ? pickId(user.branches[0]) : undefined);
            if (branchId) {
              const br = await getBranch(String(branchId)).catch(() => null);
              if (br?.success && br?.data?.name) branchName = br.data.name;
            }
          }
          if (!cancelled) {
            if (staffName) setUserStaffName(staffName);
            if (role) setUserRole(role);
            const patch = {};
            if (staffName) patch.executive = staffName;
            if (branchName) patch.branch = branchName;
            if (Object.keys(patch).length) form.setFieldsValue(patch);
          }
        }
      } catch {}

      try {
        const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
        if (!res.ok) throw new Error("sheet fetch failed");
        const csv = await res.text();
        if (csv.trim().startsWith("<")) throw new Error("expected CSV, got HTML");
        const rows = parseCsv(csv);
        if (!rows.length) throw new Error("empty sheet");
        const headers = rows[0].map((h) => (h || "").trim());
        const data = rows.slice(1).map((r) => {
          const obj = {};
          headers.forEach((h, i) => (obj[h] = r[i] ?? ""));
          return obj;
        });
        const cleaned = data.map(normalizeSheetRow).filter((r) => r.company && r.model && r.variant);
        if (!cancelled) setBikeData(cleaned);
      } catch  {
        // Fallback to a static file if present
        try {
          const res2 = await fetch("/bikeData.json", { cache: "no-store" });
          if (!res2.ok) throw new Error("fallback missing");
          const data = await res2.json();
          const cleaned = (Array.isArray(data) ? data : [])
            .map(normalizeFallbackRow)
            .filter((r) => r.company && r.model && r.variant);
          if (!cancelled) setBikeData(cleaned);
          if (!Array.isArray(data)) message.warning("Loaded fallback bikeData.json");
        } catch {
          message.error("Could not load vehicle data. Please try again later.");
        }
      }
    };
    load();
    return () => { cancelled = true; };
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

  // No EMI syncing needed; booking amount is independent now

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

  // --- Google Form integration (configure IDs) ---
  const BOOKING_GFORM_ID = import.meta.env.VITE_BOOKING_GFORM_ID || "";
  const BOOKING_GAS_URL = import.meta.env.VITE_BOOKING_GAS_URL || ""; // optional Apps Script Web App URL
  const ENTRY = {
    customerName: import.meta.env.VITE_BOOKING_ENTRY_CUSTOMER_NAME || "",
    mobileNumber: import.meta.env.VITE_BOOKING_ENTRY_MOBILE || "",
    company: import.meta.env.VITE_BOOKING_ENTRY_COMPANY || "",
    model: import.meta.env.VITE_BOOKING_ENTRY_MODEL || "",
    variant: import.meta.env.VITE_BOOKING_ENTRY_VARIANT || "",
    onRoadPrice: import.meta.env.VITE_BOOKING_ENTRY_ONROAD || "",
    address: import.meta.env.VITE_BOOKING_ENTRY_ADDRESS || "",
    rtoOffice: import.meta.env.VITE_BOOKING_ENTRY_RTO || "",
    purchaseType: import.meta.env.VITE_BOOKING_ENTRY_PURCHASE_TYPE || "",
    financier: import.meta.env.VITE_BOOKING_ENTRY_FINANCIER || "",
    executive: import.meta.env.VITE_BOOKING_ENTRY_EXECUTIVE || "",
    branch: import.meta.env.VITE_BOOKING_ENTRY_BRANCH || "",
    onlineMethod: import.meta.env.VITE_BOOKING_ENTRY_ONLINE_METHOD || "",
    utr: import.meta.env.VITE_BOOKING_ENTRY_UTR || "",
    onlineBank: import.meta.env.VITE_BOOKING_ENTRY_ONLINE_BANK || "",
    onlineDate: import.meta.env.VITE_BOOKING_ENTRY_ONLINE_DATE || "",
    cardType: import.meta.env.VITE_BOOKING_ENTRY_CARD_TYPE || "",
    cardBank: import.meta.env.VITE_BOOKING_ENTRY_CARD_BANK || "",
    cardLast4: import.meta.env.VITE_BOOKING_ENTRY_CARD_LAST4 || "",
    posTxnId: import.meta.env.VITE_BOOKING_ENTRY_POS_TXN || "",
    cardDate: import.meta.env.VITE_BOOKING_ENTRY_CARD_DATE || "",
    payload: import.meta.env.VITE_BOOKING_ENTRY_PAYLOAD || "",
  };

  const toEntries = (v) => {
    const out = {};
    const setIf = (key, val) => {
      if (!ENTRY[key]) return; // skip if not configured
      if (val === undefined || val === null || val === "") return;
      out[ENTRY[key]] = String(val);
    };
    setIf("customerName", v.customerName);
    setIf("mobileNumber", v.mobileNumber);
    setIf("company", v.company);
    setIf("model", v.bikeModel);
    setIf("variant", v.variant);
    setIf("onRoadPrice", v.onRoadPrice);
    setIf("address", v.address);
    setIf("rtoOffice", v.rtoOffice);
    setIf("purchaseType", v.purchaseType);
    setIf("financier", v.financier);
    setIf("executive", v.executive);
    setIf("branch", v.branch);
    setIf("onlineMethod", v.onlineMethod);
    setIf("utr", v.utr);
    setIf("onlineBank", v.onlineBank);
    if (v.onlineDate) setIf("onlineDate", v.onlineDate?.format?.("YYYY-MM-DD") || v.onlineDate);
    setIf("cardType", v.cardType);
    setIf("cardBank", v.cardBank);
    setIf("cardLast4", v.cardLast4);
    setIf("posTxnId", v.posTxnId);
    if (v.cardDate) setIf("cardDate", v.cardDate?.format?.("YYYY-MM-DD") || v.cardDate);
    if (ENTRY.payload) {
      try { out[ENTRY.payload] = JSON.stringify(v); } catch {}
    }
    return out;
  };

  const onFinish = async (values) => {
    const aadhar = aadharList[0]?.originFileObj || null;
    const pan = panList[0]?.originFileObj || null;
    const other = otherList[0]?.originFileObj || null;

    const payload = {
      ...values,
      mobileNumber: values.mobileNumber?.trim(),
      // removed alternate mobile
      documents: { aadhar, pan, other },

      // EMI details removed from booking submission
    };

    try {
      if (BOOKING_GAS_URL) {
        // Prefer Apps Script webhook if provided (writes directly to the sheet)
        const payloadToSend = {
          ...payload,
          // Don't send binary File objects; send filenames only
          documents: {
            aadharName: aadhar?.name || "",
            panName: pan?.name || "",
            otherName: other?.name || "",
          },
        };
        await saveBookingViaWebhook({ webhookUrl: BOOKING_GAS_URL, payload: payloadToSend });
      } else if (BOOKING_GFORM_ID) {
        // Fallback to Google Form submission if configured
        const entries = toEntries(payload);
        await saveBookingForm({ formId: BOOKING_GFORM_ID, entries });
      } else {
        message.error("Booking not configured. Set VITE_BOOKING_GAS_URL or VITE_BOOKING_GFORM_ID.");
        return;
      }
      message.success("✅ Booking submitted!");
    } catch (e) {
      message.error("Failed to submit booking. Please try again.");
      return;
    }
    form.resetFields();
    setAadharList([]);
    setPanList([]);
    setOtherList([]);
    setSelectedCompany("");
    setSelectedModel("");
    // reset price display
    setEmiPrice(0);
  };

  const onFinishFailed = ({ errorFields }) => {
    if (errorFields?.length) {
      form.scrollToField(errorFields[0].name, { behavior: "smooth", block: "center" });
    }
  };

  // EMI calculator removed

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
          {/* Branch + Executive (auto from user) */}
          <Row gutter={[16, 0]}>
            <Col xs={24} md={8}>
              <Form.Item
                label="Branch"
                name="branch"
                rules={[{ required: ['staff','mechanic','employees'].includes(String(userRole || '').toLowerCase()), message: "Branch is required" }]}
              >
                <Input size="large" placeholder="Auto-fetched from your profile" readOnly />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                label="Executive Name"
                name="executive"
                rules={[{ required: ['staff','mechanic','employees'].includes(String(userRole || '').toLowerCase()), message: "Executive is required" }]}
              >
                <Input size="large" placeholder="Auto-fetched from your profile" readOnly />
              </Form.Item>
            </Col>
          </Row>

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
            {/* Alternate Mobile removed */}
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
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Payment Mode & Financier (if HP) */}
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Payment Mode"
                name="purchaseType"
                initialValue="cash"
                rules={[{ required: true, message: "Choose payment mode" }]}
              >
                <Radio.Group>
                  <Radio.Button value="cash">Cash (No Hypothecation)</Radio.Button>
                  <Radio.Button value="hp">HP (Hypothecation)</Radio.Button>
                  <Radio.Button value="online">Online (UPI/NEFT/RTGS)</Radio.Button>
                  <Radio.Button value="card">Card (Debit/Credit)</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Col>
            {purchaseType === "hp" && (
              <Col xs={24} md={12}>
                <Form.Item
                  label="Financier"
                  name="financier"
                  rules={[{ required: true, message: "Select financier" }]}
                >
                  <Select size="large" placeholder="Select Financier" showSearch optionFilterProp="children">
                    {FINANCIERS.map((f) => (
                      <Option key={f} value={f}>{f}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            )}
          </Row>
          {purchaseType === "online" && (
            <Row gutter={[16, 0]}>
              <Col xs={24} md={6}>
                <Form.Item label="Method" name="onlineMethod" rules={[{ required: true }]}>
                  <Select size="large" placeholder="Select">
                    <Option value="UPI">UPI</Option>
                    <Option value="IMPS">IMPS</Option>
                    <Option value="NEFT">NEFT</Option>
                    <Option value="RTGS">RTGS</Option>
                    <Option value="NetBanking">NetBanking</Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="UTR / Txn No" name="utr" rules={[{ required: true }]}>
                  <Input size="large" placeholder="Transaction/UTR number" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="Bank" name="onlineBank" rules={[{ required: true }]}>
                  <Input size="large" placeholder="Bank name" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="Date" name="onlineDate" rules={[{ required: true }]}>
                  <DatePicker size="large" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>
          )}

          {purchaseType === "card" && (
            <Row gutter={[16, 0]}>
              <Col xs={24} md={6}>
                <Form.Item label="Card Type" name="cardType" rules={[{ required: true }]}>
                  <Radio.Group>
                    <Radio.Button value="debit">Debit</Radio.Button>
                    <Radio.Button value="credit">Credit</Radio.Button>
                  </Radio.Group>
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="Bank" name="cardBank" rules={[{ required: true }]}>
                  <Input size="large" placeholder="Bank name" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="Last 4 digits" name="cardLast4" rules={[{ required: true, pattern: /^\d{4}$/, message: "Enter 4 digits" }]}>
                  <Input size="large" maxLength={4} inputMode="numeric" placeholder="1234" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="POS Txn ID" name="posTxnId" rules={[{ required: true }]}>
                  <Input size="large" placeholder="POS transaction id" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="Date" name="cardDate" rules={[{ required: true }]}>
                  <DatePicker size="large" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>
          )}

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

          {/* RTO (after vehicle details, before documents) */}
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                label="RTO (Office)"
                name="rtoOffice"
                rules={[{ required: true, message: "Enter RTO office" }]}
              >
                <Input size="large" placeholder="e.g., KA-41 Muddimapalya" allowClear />
              </Form.Item>
            </Col>
          </Row>

          {/* EMI calculator removed */}

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

              <Col xs={24} md={12}>
                <Form.Item
                  label="Additional Document (PDF/JPG/PNG) — Optional"
                >
                  <Dragger
                    multiple={false}
                    beforeUpload={beforeUpload}
                    fileList={otherList}
                    onChange={({ fileList }) => setOtherList(fileList)}
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
