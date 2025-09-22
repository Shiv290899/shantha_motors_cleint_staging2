// JobCard.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  Card, Col, DatePicker, Form, Grid, Input,
  InputNumber, Row, Typography, message, Select, Button, Segmented, Checkbox, Tooltip
} from "antd";
import dayjs from "dayjs";
import { handleSmartPrint } from "../utils/printUtils";
import { FaWhatsapp } from "react-icons/fa";
import PreServiceSheet from "./PreServiceSheet";
import PostServiceSheet from "./PostServiceSheet";
import FetchJobcard from "./FetchJobcard";
import ViewSheet from "./ViewSheet";

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;
const { Option } = Select;

/* =========================
   CONFIG / CONSTANTS
   ========================= */

// Public CSV export (read JC serials from here)
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRu1AT7UpETjJI7ZmiD3gSQS3h_UnnzjF8yHu650gRXWSI5LJvKj5QPdW2M7gVp-zhquJDZXj1wDIy3/pub?output=csv";

// Google Form (prefill + autosubmit)
const GFORM_BASE =
  "https://docs.google.com/forms/d/e/1FAIpQLScGtIO_uWXq30BUSP3Pgs1EQFiXTBcLLiTP69rAHcv4QPm8hA/viewform?usp=pp_url";
const GFORM_POST =
  "https://docs.google.com/forms/d/e/1FAIpQLScGtIO_uWXq30BUSP3Pgs1EQFiXTBcLLiTP69rAHcv4QPm8hA/formResponse";

/** Field IDs from your Google Form */
const GFORM_ENTRY = {
  branch:              "entry.938233061",   // Branch
  mechanic:            "entry.1097953553",  // Alloted Mechanic
  executive:           "entry.1288132288",  // Executive
  expectedDelivery:    "entry.1007370274",  // Expected Delivery Date
  regNo:               "entry.2009060932",  // Vehicle No
  model:               "entry.1335559098",  // Model
  colour:              "entry.228634082",   // Color
  km:                  "entry.488338565",   // Odometer Reading
  custName:            "entry.1964588497",  // Customer Name
  custMobile:          "entry.108507469",   // Mobile No
  obs:                 "entry.772489632",   // Customer Observation
  vehicleType:         "entry.449121220",   // Vehicle Type
  serviceType:         "entry.1570612104",  // ✅ Service Type
  floorMat:            "entry.1163886348",  // Floor Mat
  amount:              "entry.1599026863",  // Collected Amount
  jcNo:                "entry.262964623",   // JC No.
};

// Branches
const BRANCHES = [
  "Byadarahalli",
  "Kadabagere",
  "Muddinapalya",
  "D-Group Layout",
  "Andrahalli",
  "Tavarekere",
  "Hegganahalli",
  "Channenahalli",
  "Nelagadrahalli",
];

const EXECUTIVES = [
  { name: "Rukmini",  phone: "9901678562" },
  { name: "Meghana",  phone: "7019974219" },
  { name: "Shubha",   phone: "8971585057" },
  { name: "Rani",     phone: "9108970455" },
  { name: "Likhitha",  phone: "9535190015" },
  { name: "Prakash",  phone: "9740176476" },
  { name: "Swathi",   phone: "6363116317" },
  { name: "Kumar",    phone: "7975807667" },
  { name: "Sujay",    phone: "7022878048" },
  { name: "Kavi",     phone: "9108970455" },
  { name: "Narasimha",phone: "9900887666" },
  { name: "Kavya",    phone: "8073165374" },
  { name: "Vanitha",  phone: "9380729861" },
];

const SERVICE_TYPES = ["Free", "Paid"]; // checkbox UI (single-select enforced)
const VEHICLE_TYPES = ["Motorcycle", "Scooter"]; // tabs
const MECHANIC = ["Sonu", "ManMohan", "Mansur", "Irshad", "Dakshat"];

// Fuel Level (tabs)
const FUEL_LEVELS = ["Empty", "¼", "½", "¾", "Full"];

// Labour defaults + price book
const DEFAULT_GST_LABOUR = 0;
const PRICE_BOOK = {
  Scooter: {
    base: [
      { desc: "Engine oil", rate: 450 },
      { desc: "Consumables", rate: 70 },
      { desc: "Gearbox oil", rate: 80 },
    ],
  },
  Motorcycle: {
    base: [
      { desc: "Engine oil", rate: 450 },
      { desc: "Consumables", rate: 80 },
      { desc: "Chain lubrication", rate: 70 },
    ],
  },
  paidAddons: [
    { desc: "Service Labour", rate: 400 },
    { desc: "Water wash", rate: 150 },
  ],
};

/* =========================
   UTILS
   ========================= */

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return { headers: [], rows: [] };
  const split = (line) =>
    line
      .match(/(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g)
      ?.map((m) => m.replace(/^,/, ""))
      .map((m) =>
        m.startsWith('"') && m.endsWith('"') ? m.slice(1, -1).replace(/""/g, '"') : m
      ) || [];
  const headers = split(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((ln) => {
    const cells = split(ln);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = cells[i] ?? ""));
    return obj;
  });
  return { headers, rows };
}

// ---- JC No. helpers (save-time serial) ----
const JC_HEADER_RX =
  /^(jc\s*no\.?|jc\s*number|job\s*card\s*no\.?|job\s*card\s*number|serial(?:\s*no\.?)?)$/i;

const parseIntStrict = (s) => {
  const t = String(s || "").trim();
  return /^\d+$/.test(t) ? parseInt(t, 10) : null;
};

function findJCHeader(headers = []) {
  return headers.find((h) => JC_HEADER_RX.test(String(h || "").trim())) || null;
}

/** Fast: scan sheet bottom-up for last numeric JC No, return last+1. */
async function fetchNextJobCardSerial() {
  try {
    const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Fetch failed");
    const csv = await res.text();
    const { headers, rows } = parseCSV(csv);
    if (!rows.length) return "1";

    const col = findJCHeader(headers);
    if (col) {
      // bottom-up first hit
      for (let i = rows.length - 1; i >= 0; i--) {
        const n = parseIntStrict(rows[i][col]);
        if (n !== null) return String(n + 1);
      }
      // fallback: max numeric
      let max = 0;
      for (let i = 0; i < rows.length; i++) {
        const n = parseIntStrict(rows[i][col]);
        if (n !== null && n > max) max = n;
      }
      return String(max + 1 || 1);
    }

    // No JC column detected → fallback to row count
    return String(rows.length + 1);
  } catch {
    // If CSV not reachable, fallback to timestamp-like serial
    return dayjs().format("YYMMDDHHmmss");
  }
}

/* Vehicle No. mask - KA05 DB 6000 */
function formatReg(raw) {
  const alnum = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  let out = "";
  for (let i = 0; i < alnum.length; i++) {
    out += alnum[i];
    if (i === 3 || i === 5) out += " ";
  }
  return out.slice(0, 12);
}
const REGEX_FULL = /^[A-Z]{2}\d{2}\s[A-Z]{2}\s\d{4}$/;

// Build labour rows from selections
function buildRows(serviceType, vehicleType) {
  if (!serviceType || !vehicleType) return [];
  const base = PRICE_BOOK[vehicleType]?.base ?? [];
  const rows = base.map((b) => ({ desc: b.desc, qty: 1, rate: b.rate }));
  if (serviceType === "Paid") {
    rows.push(...PRICE_BOOK.paidAddons.map((a) => ({ desc: a.desc, qty: 1, rate: a.rate })));
  }
  return rows;
}

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
    .format(Math.max(0, Math.round(Number(n || 0))));

/** Silently POST to Google Form via hidden form + iframe (bypasses CORS) */
function autoSubmitToGoogle(entries) {
  const iframe = document.createElement("iframe");
  iframe.name = "gform_iframe";
  iframe.style.display = "none";

  const form = document.createElement("form");
  form.action = GFORM_POST;
  form.method = "POST";
  form.target = "gform_iframe";
  form.style.display = "none";

  Object.entries(entries).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value ?? "";
    form.appendChild(input);
  });

  // Optional Google params
  const pageHistory = document.createElement("input");
  pageHistory.type = "hidden";
  pageHistory.name = "pageHistory";
  pageHistory.value = "0";
  form.appendChild(pageHistory);

  document.body.appendChild(iframe);
  document.body.appendChild(form);
  form.submit();

  // Clean up
  setTimeout(() => {
    try { document.body.removeChild(form); } catch {
      // do nothing
    }
    try { document.body.removeChild(iframe); } catch {
      // do nothing
    }
  }, 2000);
}

/* =========================
   WHATSAPP / SMS HELPERS
   ========================= */

function getExecPhone(executives, execName) {
  const found = executives.find((e) => e.name === execName);
  return found?.phone || "";
}

function normalizeINPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return "";
}

function buildWelcomeMsg(vals, totals) {
  const fmtDate =
    vals?.expectedDelivery ? dayjs(vals.expectedDelivery).format("DD/MM/YYYY") : "—";
  const execPhone = getExecPhone(EXECUTIVES, vals?.executive);
  const branch = vals?.branch || "—";
  const name = vals?.custName || "Customer";
  const jc = vals?.jcNo || "—";
  const reg = vals?.regNo || "—";
  const estimate = inr(totals?.grand ?? 0);

  return (
    `Hi ${name}! 👋\n\n` +
    `✅ Your bike service is confirmed at Shantha Motors.\n\n` +
    `Welcome to Shantha Motors,\nಶಾಂತ ಮೋಟರ್ಸ್‌ಗೆ ಸ್ವಾಗತ 🏍️✨\n\n` +
    `🧾 Job Card: ${jc}\n` +
    `🏍️ Vehicle: ${reg}\n` +
    `📅 Delivery Date: ${fmtDate}\n` +
    `💰 Estimated Cost (ಅಂದಾಜು ವೆಚ್ಚ): ${estimate}\n\n` +
    `ℹ️ Final prices may vary based on actual service needs.\n\n` +
    `Need any help? Just reply here.\n\n` +
    `— ${vals?.executive || "Team"}, ${branch}${execPhone ? ` (☎️ ${execPhone})` : ""}`
  );
}

function openWhatsAppOrSMS({ mobileE164, text, onFailToWhatsApp }) {
  const waUrl = `https://wa.me/${mobileE164}?text=${encodeURIComponent(text)}`;
  const w = window.open(waUrl, "_blank", "noopener,noreferrer");

  const blocked = !w || w.closed || typeof w.closed === "undefined";
  if (blocked) {
    onFailToWhatsApp?.();
    const smsUrl = `sms:+${mobileE164}?body=${encodeURIComponent(text)}`;
    window.location.href = smsUrl;
    return;
  }

  setTimeout(() => {
    try {
      if (w.closed) return;
      onFailToWhatsApp?.();
      w.close();
      const smsUrl = `sms:+${mobileE164}?body=${encodeURIComponent(text)}`;
      window.location.href = smsUrl;
    } catch {
      onFailToWhatsApp?.();
      const smsUrl = `sms:+${mobileE164}?body=${encodeURIComponent(text)}`;
      window.location.href = smsUrl;
    }
  }, 1000);
}

/* =========================
   MAIN COMPONENT
   ========================= */

export default function JobCard() {
  const [form] = Form.useForm();
  const screens = useBreakpoint();

  const [regDisplay, setRegDisplay] = useState("");
  const [serviceTypeLocal, setServiceTypeLocal] = useState(null);
  const [vehicleTypeLocal, setVehicleTypeLocal] = useState(null);
  const [isReady, setIsReady] = useState(false); // ★ gate buttons
  const [notReadyWhy, setNotReadyWhy] = useState(""); // ★ tooltip text
  const preRef = useRef(null);
  const postRef = useRef(null);

  // ★ required field helpers
  const BASE_REQUIRED = [
    "createdAt",
    "branch",
    "mechanic",
    "executive",
    "expectedDelivery",
    "regNo",
    "model",
    "km",
    "custName",
    "custMobile",
    "serviceType",
    "vehicleType",
  ];
  const requiredWithDynamic = (vals) => {
    const list = [...BASE_REQUIRED];
    if (vals?.vehicleType === "Scooter") list.push("floorMat"); // dynamic requirement
    return list;
  };

  const recomputeReady = () => {
    const valsNow = form.getFieldsValue(true);
    const req = requiredWithDynamic(valsNow);
    const allPresent = req.every((n) => {
      const v = form.getFieldValue(n);
      return v !== undefined && v !== null && String(v).trim() !== "";
    });
    const anyErrors = form.getFieldsError(req).some(({ errors }) => errors.length > 0);

    // Build a short reason for UX
    let reason = "";
    if (!allPresent) {
      const missing = req.filter((n) => {
        const v = form.getFieldValue(n);
        return v === undefined || v === null || String(v).trim() === "";
      });
      if (missing.length) reason = `Missing: ${missing.join(", ")}`;
    } else if (anyErrors) {
      reason = "Fix validation errors in highlighted fields.";
    }

    setIsReady(allPresent && !anyErrors);
    setNotReadyWhy(reason);
  };

  const validateAllRequired = async () => {
    const valsNow = form.getFieldsValue(true);
    const req = requiredWithDynamic(valsNow);
    await form.validateFields(req);
  };
  // ★ end required field helpers

  const initialValues = useMemo(
    () => ({
      jcNo: "",
      createdAt: dayjs(),
      expectedDelivery: null,
      branch: BRANCHES[0],
      executive: undefined,
      mechanic: "",
      serviceType: undefined,
      vehicleType: undefined,
      floorMat:"No",
      fuelLevel: undefined,
      regNo: "",
      model: "",
      colour: "",
      km: undefined,
      custName: "",
      custMobile: "",
      callStatus: undefined,
      obs: "",
      labourRows: [],
      gstLabour: DEFAULT_GST_LABOUR,
      discounts: { labour: 0 },
    }),
    []
  );

  const handleRegChange = (e) => {
    const next = formatReg(e.target.value);
    setRegDisplay(next);
    form.setFieldsValue({ regNo: next });
  };

  const labourRows = Form.useWatch("labourRows", form) || [];
  const gstLabour = Form.useWatch("gstLabour", form) ?? DEFAULT_GST_LABOUR;
  const discounts = Form.useWatch("discounts", form) || { labour: 0 };

  const totals = useMemo(() => {
    const labourSub = labourRows.reduce(
      (sum, r) => sum + Number(r?.qty || 0) * Number(r?.rate || 0),
      0
    );
    const labourGST = labourSub * (Number(gstLabour) / 100);
    const labourDisc = Number(discounts.labour || 0);
    const grand = Math.max(0, labourSub + labourGST - labourDisc);
    return { labourSub, labourGST, labourDisc, grand };
  }, [labourRows, gstLabour, discounts]);

  const handleKmKeyPress = (e) => { if (!/[0-9]/.test(e.key)) e.preventDefault(); };
  const handleMobileKeyPress = (e) => { if (!/[0-9]/.test(e.key)) e.preventDefault(); };
  const handleMobileChange = (e) => {
    const val = e.target.value;
    if (!/^\d*$/.test(val)) return;
    if (val.length > 10) return;
    form.setFieldsValue({ custMobile: val });
  };

  const serviceOptions = SERVICE_TYPES.map((t) => ({ label: t, value: t }));

  const handleServiceCheckbox = (checkedValues) => {
    let next = null;
    if (checkedValues.length === 0) next = null;
    else if (checkedValues.length === 1) next = checkedValues[0];
    else next = checkedValues.find((v) => v !== serviceTypeLocal) || checkedValues[0];

    setServiceTypeLocal(next || null);
    form.setFieldsValue({ serviceType: next || undefined });

    if (next) {
      const defaultVehicle = "Motorcycle";
      setVehicleTypeLocal(defaultVehicle);
      form.setFieldsValue({
        vehicleType: defaultVehicle,
        labourRows: buildRows(next, defaultVehicle),
        gstLabour: DEFAULT_GST_LABOUR,
        discounts: { labour: 0 },
        floorMat: "No",
      });
      message.success(`Applied preset: ${next} / ${defaultVehicle}`);
    } else {
      form.setFieldsValue({ labourRows: [] });
    }
    recomputeReady(); // ★ keep button state fresh
  };

  useEffect(() => {
    recomputeReady(); // ★ on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrint = async (which) => {
    await new Promise(requestAnimationFrame);
    if (which === "pre") {
      await handleSmartPrint(preRef.current);
    } else if (which === "post") {
      await handleSmartPrint(postRef.current);
    }
  };

  // ---- Auto Save (→ Google Form) ----
  const fmtDDMMYYYY = (d) => (d ? dayjs(d).format("DD/MM/YYYY") : "");
  const OBS_SEP = " # ";

  const handleAutoSave = async () => {
    try {
      // ★ Validate ALL required fields (dynamic-aware)
      await validateAllRequired();

      const vals = form.getFieldsValue(true);

      // 🔢 Ensure a fresh sequential JC No. at save-time.
      let jc = vals.jcNo;
      if (!/^\d+$/.test(String(jc || "").trim())) {
        jc = await fetchNextJobCardSerial();
        form.setFieldsValue({ jcNo: jc });
        message.success(`JC No. assigned: ${jc}`);
      }

      const amt = Number.isFinite(totals.grand) ? Math.round(totals.grand) : 0;
      const kmOnlyDigits = String(vals.km || "").replace(/\D/g, "");
      const floorMatStr =
        typeof vals.floorMat === "string"
          ? vals.floorMat
          : vals.floorMat === true
          ? "Yes"
          : vals.floorMat === false
          ? "No"
          : "No";
      const obsOneLine =
        String(vals.obs || "")
          .replace(/\s*\r?\n\s*/g, OBS_SEP)
          .replace(new RegExp(`^(?:\\s*${OBS_SEP}\\s*)+|(?:\\s*${OBS_SEP}\\s*)+$`, "g"), "")
          .trim();

      const entries = {
        [GFORM_ENTRY.branch]:        vals.branch || "",
        [GFORM_ENTRY.mechanic]:      vals.mechanic || "",
        [GFORM_ENTRY.executive]:     vals.executive || "",
        [GFORM_ENTRY.expectedDelivery]: fmtDDMMYYYY(vals.expectedDelivery),
        [GFORM_ENTRY.regNo]:         vals.regNo || "",
        [GFORM_ENTRY.model]:         vals.model || "",
        [GFORM_ENTRY.colour]:        vals.colour || "",
        [GFORM_ENTRY.km]:            kmOnlyDigits || "",
        [GFORM_ENTRY.custName]:      vals.custName || "",
        [GFORM_ENTRY.custMobile]:    String(vals.custMobile || ""),
        [GFORM_ENTRY.obs]:           obsOneLine,
        [GFORM_ENTRY.vehicleType]:   vals.vehicleType || "",
        [GFORM_ENTRY.serviceType]:   vals.serviceType || "",
        [GFORM_ENTRY.floorMat]:      floorMatStr,
        [GFORM_ENTRY.amount]:        String(amt),
        [GFORM_ENTRY.jcNo]:          jc, // ✅ save-time serial
      };

      autoSubmitToGoogle(entries);

      message.loading({ content: "Auto-saving to Google Sheet…", key: "autosave" });
      await new Promise((res) => setTimeout(res, 1200));
      message.success({
        content: "All fields saved to Google Sheet via Google Form.",
        key: "autosave",
        duration: 2,
      });
    } catch (e) {
      message.error("Please complete required fields before auto-saving.");
      throw e;
    }
  };

  // Pull everything we need for printing
  const vals = form.getFieldsValue(true);

  // Observation list for print (no prices)
  const observationLines = [
    ...(labourRows || []).map((r) => r.desc),
    ...(vals?.obs ? vals.obs.split("\n").map((s) => s.trim()).filter(Boolean) : []),
  ];

  // --- Auto-save then WhatsApp ---
  const handleShareWhatsApp = async () => {
    try {
      await handleAutoSave(); // will throw if invalid

      const valsNow = form.getFieldsValue(true);
      await form.validateFields(["custName", "custMobile", "branch"]); // already covered, fine as extra guard

      const mobileE164 = normalizeINPhone(valsNow.custMobile);
      if (!mobileE164) {
        message.error("Enter a valid 10-digit mobile number (India).");
        return;
      }
      const msg = buildWelcomeMsg(valsNow, totals);
      message.loading({ key: "share", content: "Preparing WhatsApp message…" });
      openWhatsAppOrSMS({
        mobileE164,
        text: msg,
        onFailToWhatsApp: () => {
          message.info({
            key: "share",
            content: "WhatsApp may not be available. Falling back to SMS composer…",
            duration: 2,
          });
        },
      });
      setTimeout(() => {
        message.success({ key: "share", content: "Ready to send.", duration: 2 });
      }, 800);
    } catch {
      // validation error already shown
    }
  };

  // --- Auto-save then Pre-service print ---
  const handlePreService = async () => {
    try {
      await handleAutoSave(); // will throw if invalid
      await handlePrint("pre");
    } catch {
      // validation error already shown
    }
  };

  return (
    <div style={{ padding: screens.xs ? 8 : 16 }}>
      {/* Screen UI (hidden when printing) */}
      <div className="no-print">
        <Card size="small" bordered>
          <div style={{  display: "flex", justifyContent: "space-between", alignItems: "centre", gap: 8 }}>
            <div>
              <Title level={4} style={{ margin: 0 }}>SHANTHA MOTORS — JOB CARD</Title>
              <Text type="secondary">Multi Brand Two Wheeler Sales & Service</Text>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
              {/* Fetch button */}
              <FetchJobcard
                form={form}
                sheetUrl={SHEET_CSV_URL}
                parseCSV={parseCSV}
                formatReg={formatReg}
                buildRows={buildRows}
                defaultGstLabour={DEFAULT_GST_LABOUR}
                lists={{ BRANCHES, MECHANIC, EXECUTIVES, VEHICLE_TYPES, SERVICE_TYPES }}
                setServiceTypeLocal={setServiceTypeLocal}
                setVehicleTypeLocal={setVehicleTypeLocal}
                setRegDisplay={setRegDisplay}
              />

              <ViewSheet
                sheetCsvUrl={SHEET_CSV_URL}
                parseCSV={parseCSV}
                dateColumn="Timestamp"
                buttonProps={{ type: "primary" }}
                buttonText="View Sheet"
              />
            </div>
          </div>
        </Card>

        <Form
          form={form}
          layout="vertical"
          initialValues={initialValues}
          style={{ marginTop: 12 }}
          onValuesChange={recomputeReady} // ★ live-enable buttons as user fills
        >
          {/* Job Details */}
          <Card size="small" bordered title="Job Details">
            <Row gutter={12}>
              <Col xs={12} sm={2}>
                <Form.Item label="JC No." name="jcNo" >
                  <Input placeholder="No Need to Enter" readOnly />
                </Form.Item>
              </Col>

              <Col xs={12} sm={4}>
                <Form.Item label="Created At" name="createdAt" rules={[{ required: true }]}>
                  <DatePicker showTime style={{ width: "100%" }} />
                </Form.Item>
              </Col>

              <Col xs={24} sm={10}>
                <Form.Item label="Branch" name="branch" rules={[{ required: true }]}>
                  <Select showSearch optionFilterProp="children" placeholder="Select branch">
                    {BRANCHES.map((b) => (
                      <Option key={b} value={b}>{b}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>

              <Col xs={24} sm={4}>
                <Form.Item label="Allotted Mechanic" name="mechanic" rules={[{ required: true }]}>
                  <Select
                    placeholder="Select mechanic"
                    options={MECHANIC.map((name) => ({ value: name, label: name }))}
                  />
                </Form.Item>
              </Col>

              <Col xs={24} md={4}>
                <Form.Item label="Executive" name="executive" rules={[{ required: true }]}>
                  <Select options={EXECUTIVES.map((e) => ({ value: e.name, label: e.name }))} />
                </Form.Item>
              </Col>

              <Col xs={24} sm={4}>
                <Form.Item label="Expected Delivery Date" name="expectedDelivery" rules={[{ required: true }]}>
                  <DatePicker style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Vehicle & Customer */}
          <Card size="small" bordered style={{ marginTop: 12 }} title="Vehicle & Customer">
            <Row gutter={12}>
              <Col xs={24} sm={4}>
                <Form.Item
                  label="Vehicle No."
                  name="regNo"
                  validateFirst
                  rules={[
                    { required: true, message: "Vehicle number is required" },
                    {
                      validator: (_, val) =>
                        !val || REGEX_FULL.test(val)
                          ? Promise.resolve()
                          : Promise.reject(new Error("Format must be KA05 DB 6000 (12 chars incl. spaces)")),
                    },
                  ]}
                >
                  <Input
                    placeholder="KA05 DB 6000"
                    value={regDisplay}
                    onChange={handleRegChange}
                    maxLength={12}
                    inputMode="latin"
                  />
                </Form.Item>
              </Col>

              <Col xs={24} sm={4}>
                <Form.Item label="Model" name="model" rules={[{ required: true }]}>
                  <Input placeholder="e.g., Honda Activa 6G" />
                </Form.Item>
              </Col>

              <Col xs={24} sm={4}>
                <Form.Item label="Colour" name="colour">
                  <Input />
                </Form.Item>
              </Col>

              <Col xs={24} sm={4}>
                <Form.Item
                  label="Odometer Reading"
                  name="km"
                  rules={[{ required: true, message: "Please enter Odometer Reading" }]}
                  getValueFromEvent={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    return val ? `${val} KM` : "";
                  }}
                  getValueProps={(value) => ({
                    value: value?.toString().replace(/\D/g, ""),
                  })}
                >
                  <Input
                    style={{ width: "100%" }}
                    maxLength={6}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    onKeyPress={handleKmKeyPress}
                    placeholder="Enter KM"
                    suffix="KM"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col xs={24} sm={6}>
                <Form.Item label="Customer Name" name="custName" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </Col>

              <Col xs={24} sm={6}>
                <Form.Item
                  label="Mobile"
                  name="custMobile"
                  rules={[
                    { required: true, message: "Please enter mobile number" },
                    {
                      validator: (_, val) => {
                        if (!val) return Promise.resolve();
                        if (!/^\d{10}$/.test(String(val))) {
                          return Promise.reject(new Error("Enter 10-digit mobile number"));
                        }
                        return Promise.resolve();
                      },
                    },
                  ]}
                >
                  <Input
                    maxLength={10}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    onKeyPress={handleMobileKeyPress}
                    onChange={handleMobileChange}
                    placeholder="10-digit number"
                  />
                </Form.Item>
              </Col>

              <Col xs={24} sm={12}>
                <Form.Item label="Call Status" name="callStatus">
                  <Input placeholder="Connected / Not reachable / Will call back" />
                </Form.Item>
              </Col>

              <Col xs={24}>
                <Form.Item label="Customer Observation (additional notes)" name="obs">
                  <Input.TextArea rows={3} placeholder="Write the customer's observations..." />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Service */}
          <Card size="small" bordered style={{ marginTop: 12 }} title="Service">
            <Row gutter={12}>
              <Col xs={24} md={6}>
                <Form.Item
                  label="Service Type (tick one)"
                  name="serviceType"
                  rules={[{ required: true, message: "Please select a service type" }]}
                >
                  <Checkbox.Group
                    options={serviceOptions}
                    value={serviceTypeLocal ? [serviceTypeLocal] : []}
                    onChange={handleServiceCheckbox}
                  />
                </Form.Item>
              </Col>

              {serviceTypeLocal && (
                <Col xs={24} md={6}>
                  <Form.Item
                    label="Vehicle Type"
                    name="vehicleType"
                    rules={[{ required: true, message: "Please choose Scooter or Motorcycle" }]}
                  >
                    <Segmented
                      className="blue-segmented"
                      block
                      options={VEHICLE_TYPES}
                      value={vehicleTypeLocal || undefined}
                      onChange={(val) => {
                        setVehicleTypeLocal(val);
                        form.setFieldsValue({ vehicleType: val });
                        if (serviceTypeLocal) {
                          form.setFieldsValue({
                            labourRows: buildRows(serviceTypeLocal, val),
                            gstLabour: DEFAULT_GST_LABOUR,
                            discounts: { labour: 0 },
                          });
                        }
                        // keep floorMat value; default is "No"
                        recomputeReady(); // ★
                      }}
                    />
                  </Form.Item>
                </Col>
              )}

              {vehicleTypeLocal === "Scooter" && (
                <Col xs={24} md={4}>
                  <Form.Item
                    label="Floor Mat (Mandatory)"
                    name="floorMat"
                    initialValue="No"
                    rules={[{ required: true, message: "Please select Yes/No" }]}
                  >
                    <Segmented
                      className="blue-segmented"
                      block
                      options={["No", "Yes"]}
                      onChange={(val) => {
                        form.setFieldsValue({ floorMat: val });
                        recomputeReady(); // ★
                      }}
                    />
                  </Form.Item>
                </Col>
              )}

              <Col xs={24} md={8}>
                <Form.Item label="Fuel Level" name="fuelLevel">
                  <Segmented className="blue-segmented" block options={FUEL_LEVELS} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Labour Editor */}
          <Card size="small" bordered style={{ marginTop: 12 }} title="Labour">
            <Form.List name="labourRows">
              {(fields, { add, remove }) => (
                <>
                  <Row gutter={8} style={{ fontWeight: 600, marginBottom: 6 }}>
                    <Col span={12}>Description</Col>
                    <Col span={4}>Qty</Col>
                    <Col span={4}>Rate</Col>
                    <Col span={4} style={{ textAlign: "right" }}>Amount</Col>
                  </Row>

                  {fields.map(({ key, name, ...rest }) => {
                    const row = labourRows?.[name] || {};
                    const amt = Number(row?.qty || 0) * Number(row?.rate || 0);
                    return (
                      <Row key={key} gutter={8} align="middle" style={{ marginBottom: 6 }}>
                        <Col span={12}>
                          <Form.Item {...rest} name={[name, "desc"]} rules={[{ required: true }]}>
                            <Input placeholder="Labour description" />
                          </Form.Item>
                        </Col>
                        <Col span={4}>
                          <Form.Item
                            {...rest}
                            name={[name, "qty"]}
                            initialValue={1}
                            rules={[{ required: true }]}
                          >
                            <InputNumber min={1} style={{ width: "100%" }} />
                          </Form.Item>
                        </Col>
                        <Col span={4}>
                          <Form.Item {...rest} name={[name, "rate"]} rules={[{ required: true }]}>
                            <InputNumber min={0} style={{ width: "100%" }} />
                          </Form.Item>
                        </Col>
                        <Col span={4} style={{ textAlign: "right" }}>
                          <Text>{inr(amt)}</Text>
                          <Button type="link" danger onClick={() => remove(name)} style={{ paddingLeft: 8 }}>
                            Remove
                          </Button>
                        </Col>
                      </Row>
                    );
                  })}

                  <Button onClick={() => add({ qty: 1 })}>Add labour</Button>
                </>
              )}
            </Form.List>
          </Card>

          {/* Totals */}
          <Card size="small" bordered style={{ marginTop: 12 }} title="Totals">
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, maxWidth: 480 }}>
              <div>Labour Subtotal</div>
              <div style={{ textAlign: "right" }}>{inr(totals.labourSub)}</div>

              <Form.Item label="GST % on Labour" name="gstLabour" style={{ marginBottom: 0 }}>
                <InputNumber min={0} max={28} />
              </Form.Item>
              <div style={{ textAlign: "right" }}>{inr(totals.labourGST)}</div>

              <div>Discount (Labour)</div>
              <Form.Item name={["discounts", "labour"]} style={{ marginBottom: 0 }}>
                <InputNumber min={0} />
              </Form.Item>

              <div style={{ fontWeight: 700 }}>Grand Total</div>
              <div style={{ textAlign: "right", fontWeight: 700 }}>{inr(totals.grand)}</div>
            </div>
          </Card>

          {/* ACTION BUTTONS — gated by isReady */}
          <Row justify="end" style={{ marginTop: 12 }} gutter={8}>
            <Col>
              <Tooltip title={isReady ? "" : (notReadyWhy || "Fill all required fields")} placement="top">
                <Button
                  type="default"
                  icon={<FaWhatsapp style={{ color: "#25D366" }} />}
                  onClick={handleShareWhatsApp}
                  disabled={!isReady} // ★
                >
                  WhatsApp/SMS
                </Button>
              </Tooltip>
            </Col>

            <Col>
              <Tooltip title={isReady ? "" : (notReadyWhy || "Fill all required fields")} placement="top">
                <Button type="primary" onClick={handlePreService} disabled={!isReady} /* ★ */>
                  Pre-service
                </Button>
              </Tooltip>
            </Col>

            <Col>
              {/* Post-service print intentionally not gated; it prints current values */}
              <Button onClick={() => handlePrint("post")}>
                Post-service
              </Button>
            </Col>
          </Row>
        </Form>
      </div>

      {/* PRINT SHEETS with refs */}
      <PreServiceSheet
        ref={preRef}
        active
        vals={vals}
        labourRows={labourRows}
        totals={totals}
        observationLines={observationLines}
        executives={EXECUTIVES}
      />

      <PostServiceSheet
        ref={postRef}
        active
        vals={vals}
        totals={totals}
      />
    </div>
  );
}
