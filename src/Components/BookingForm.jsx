import React, { useState, useEffect, useMemo, useRef } from "react";
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
  Tag,
  Checkbox,
} from "antd";
import { InboxOutlined, CreditCardOutlined, PrinterOutlined } from "@ant-design/icons";
import { listCurrentStocksPublic } from "../apiCalls/stocks";
import { saveBookingViaWebhook } from "../apiCalls/forms";
import BookingPrintSheet from "./BookingPrintSheet";
import FetchBooking from "./FetchBooking";
import { handleSmartPrint } from "../utils/printUtils";

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

// Google Apps Script Web App endpoint to save bookings to Google Sheet
// Prefer env var VITE_BOOKING_GAS_URL; fallback to provided URL
const BOOKING_GAS_URL =
  import.meta.env.VITE_BOOKING_GAS_URL ||
  "https://script.google.com/macros/s/AKfycbyhPxzPkpSowB4sRqL8Bm9Ju9SvmLzsli16eVDC7Mo53CXJQjKEh4Tw9XL_8Gbl90t9/exec";
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

export default function BookingForm({ asModal = false, initialValues = null, onSuccess } = {}) {
  const printRef = useRef(null);
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const isTabletOnly = screens.md && !screens.lg;

  const [form] = Form.useForm();
  const [addressProofFiles, setAddressProofFiles] = useState([]);
  const [bikeData, setBikeData] = useState([]);

  // User context for auto-filling Executive and Branch
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  }, []);
  const executiveDefault = useMemo(() => (
    currentUser?.name || currentUser?.displayName || currentUser?.email || ''
  ), [currentUser]);
  const branchDefault = useMemo(() => {
    const firstBranch = Array.isArray(currentUser?.branches) ? (currentUser.branches[0]?.name || currentUser.branches[0]) : undefined;
    return (
      currentUser?.formDefaults?.branchName ||
      currentUser?.primaryBranch?.name ||
      firstBranch ||
      ''
    );
  }, [currentUser]);

  const [selectedCompany, setSelectedCompany] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const selectedVariant = Form.useWatch("variant", form);
  const selectedColor = Form.useWatch("color", form);
  const purchaseType = Form.useWatch("purchaseType", form);
  const addressProofMode = Form.useWatch("addressProofMode", form);
  const paymentMode = Form.useWatch("paymentMode", form);
  const chassisNo = Form.useWatch("chassisNo", form);
  // Additional watchers so print values stay in sync live
  const wCustomerName = Form.useWatch("customerName", form);
  const wMobileNumber = Form.useWatch("mobileNumber", form);
  const wAddress = Form.useWatch("address", form);
  const wExecutive = Form.useWatch("executive", form);
  const wBranch = Form.useWatch("branch", form);
  const wRtoOffice = Form.useWatch("rtoOffice", form);
  const wFinancier = Form.useWatch("financier", form);
  const wNohpFinancier = Form.useWatch("nohpFinancier", form);
  const bookingAmountWatch = Form.useWatch("bookingAmount", form);
  const downPaymentWatch = Form.useWatch("downPayment", form);
  const extraFittingAmountWatch = Form.useWatch("extraFittingAmount", form);
  const affidavitChargesWatch = Form.useWatch("affidavitCharges", form);

  // On-road price for selected vehicle (from sheet)
  const selectedOnRoadPrice = useMemo(() => {
    const norm = (s) => String(s || '').trim().toLowerCase();
    const found = bikeData.find(
      (r) => norm(r.company) === norm(selectedCompany) &&
             norm(r.model) === norm(selectedModel) &&
             norm(r.variant) === norm(selectedVariant)
    );
    return Number(found?.onRoadPrice || 0) || 0;
  }, [bikeData, selectedCompany, selectedModel, selectedVariant]);

  const totalDp = useMemo(() => {
    const dp = Number(downPaymentWatch || 0) || 0;
    const extra = Number(extraFittingAmountWatch || 0) || 0;
    const aff = addressProofMode === 'additional' ? (Number(affidavitChargesWatch || 0) || 0) : 0;
    return dp + extra + aff;
  }, [downPaymentWatch, extraFittingAmountWatch, affidavitChargesWatch, addressProofMode]);

  const balancedDp = useMemo(() => {
    const booking = Number(bookingAmountWatch || 0) || 0;
    return totalDp - booking;
  }, [totalDp, bookingAmountWatch]);

  // Cash flow totals
  const totalVehicleCost = useMemo(() => {
    const extra = Number(extraFittingAmountWatch || 0) || 0;
    const aff = addressProofMode === 'additional' ? (Number(affidavitChargesWatch || 0) || 0) : 0;
    return (Number(selectedOnRoadPrice) || 0) + extra + aff;
  }, [selectedOnRoadPrice, extraFittingAmountWatch, affidavitChargesWatch, addressProofMode]);

  const balancedAmount = useMemo(() => {
    const booking = Number(bookingAmountWatch || 0) || 0;
    return totalVehicleCost - booking;
  }, [totalVehicleCost, bookingAmountWatch]);

  const [submitting, setSubmitting] = useState(false);

  const handlePrint = () => {
    try { handleSmartPrint(printRef.current); } catch { /* ignore */ }
  };

  // --- Outbox for optimistic background submission (no waiting on UX) ---
  const OUTBOX_KEY = 'Booking:outbox';
  const readJson = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
  const writeJson = (k, obj) => { try { localStorage.setItem(k, JSON.stringify(obj)); } catch { /* ignore quota */ } };
  const enqueueOutbox = (job) => { const box = readJson(OUTBOX_KEY, []); const item = { id: Date.now()+':' + Math.random().toString(36).slice(2), job }; box.push(item); writeJson(OUTBOX_KEY, box); return item.id; };
  const removeOutboxById = (id) => { const box = readJson(OUTBOX_KEY, []); writeJson(OUTBOX_KEY, box.filter(x=>x.id!==id)); };

  const submitToWebhook = async (payload) => {
    if (!BOOKING_GAS_URL) return { success: true, offline: true };
    const resp = await saveBookingViaWebhook({ webhookUrl: BOOKING_GAS_URL, method: 'POST', payload });
    return resp;
  };

  const retryOutbox = async () => {
    try {
      const box = readJson(OUTBOX_KEY, []);
      if (!Array.isArray(box) || !box.length) return;
      for (const item of box) {
        const data = item.job?.data;
        if (!data) continue;
        try {
          const resp = await submitToWebhook(data);
          const ok = (resp?.data || resp)?.success !== false;
          if (ok) removeOutboxById(item.id);
        } catch { /* keep for next retry */ }
      }
    } catch { /* ignore */ }
  };
  useEffect(() => { setTimeout(() => { retryOutbox(); }, 0); }, []);
  useEffect(() => { const onOnline = () => retryOutbox(); window.addEventListener('online', onOnline); return () => window.removeEventListener('online', onOnline); }, []);

  // Chassis availability state
  const [chassisStatus, setChassisStatus] = useState("idle"); // idle|checking|found|not_found
  const [chassisInfo, setChassisInfo] = useState(null);

  // Prepare booking values for the printable sheet (sample)
  const valsForPrint = useMemo(() => {
    const fv = form.getFieldsValue(true);
    const v = {
      customerName: fv.customerName,
      mobileNumber: fv.mobileNumber,
      address: fv.address,
      branch: fv.branch || branchDefault || '',
      executive: fv.executive || executiveDefault || '',
      rtoOffice: fv.rtoOffice,
      purchaseMode: fv.purchaseType,
      paymentMode: fv.paymentMode,
      paymentReference: fv.paymentMode === 'online' ? fv.paymentReference : undefined,
      bookingAmount: fv.bookingAmount,
      // Address proof details for print
      addressProofMode: fv.addressProofMode,
      addressProofTypes: fv.addressProofTypes || [],
      // Single uploaded file name (PDF)
      fileName: (addressProofFiles && addressProofFiles[0]?.name) || undefined,
      vehicle: {
        company: fv.company,
        model: fv.bikeModel,
        variant: fv.variant,
        color: fv.color,
        chassisNo: fv.chassisNo === "__ALLOT__" ? undefined : fv.chassisNo,
        availability: fv.chassisNo === "__ALLOT__" ? 'allot' : chassisStatus,
      },
      financier: fv.financier || fv.nohpFinancier,
      createdAt: new Date(),
    };
    return v;
  }, [
    form,
    branchDefault,
    executiveDefault,
    chassisStatus,
    // live-print important dependencies
    purchaseType,
    paymentMode,
    addressProofMode,
    selectedCompany,
    selectedModel,
    selectedVariant,
    selectedColor,
    chassisNo,
    wCustomerName,
    wMobileNumber,
    wAddress,
    wExecutive,
    wBranch,
    wRtoOffice,
    wFinancier,
    wNohpFinancier,
    addressProofFiles,
  ]);

  // In-stock derived options
  const [stockItems, setStockItems] = useState([]);
  const [loadingStocks, setLoadingStocks] = useState(false);

  // Helpers
  // (date helper removed; not used in this version)

  const checkChassis = async (v) => {
    const q = String(v || "").trim().toUpperCase();
    if (q === "__ALLOT__") { setChassisStatus("allot"); setChassisInfo(null); return; }
    if (!q || q.length < 6) { setChassisStatus("idle"); setChassisInfo(null); return; }
    setChassisStatus("checking");
    setChassisInfo(null);
    try {
      const resp = await listCurrentStocksPublic({ limit: 1500 });
      const list = Array.isArray(resp?.data) ? resp.data : [];
      const found = list.find((r) => String(r.chassisNo || r.chassis || "").toUpperCase() === q);
      if (found) {
        setChassisStatus("found");
        setChassisInfo({
          chassis: found.chassisNo || found.chassis || q,
          company: found.company || "",
          model: found.model || "",
          variant: found.variant || "",
          branch: found.branch || found.sourceBranch || "",
          color: found.color || "",
        });
      } else {
        setChassisStatus("not_found");
        setChassisInfo(null);
      }
    } catch  {
      setChassisStatus("idle");
      setChassisInfo(null);
      message.error("Could not verify chassis availability.");
    }
  };

  useEffect(() => {
    const t = setTimeout(() => { checkChassis(chassisNo); }, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chassisNo]);

  // Keep affidavit charges zero when not in 'additional' mode
  useEffect(() => {
    if (addressProofMode !== 'additional') {
      const cur = form.getFieldValue('affidavitCharges');
      if ((Number(cur) || 0) !== 0) form.setFieldsValue({ affidavitCharges: 0 });
    }
  }, [addressProofMode, form]);

  // Auto-fill Affidavit Charges by company
  // Default: 250; For Bajaj: 350
  useEffect(() => {
    try {
      if (addressProofMode !== 'additional') return;
      const comp = String(selectedCompany || form.getFieldValue('company') || '').trim();
      if (!comp) return;
      const isBajaj = /bajaj/i.test(comp);
      const defAmt = isBajaj ? 350 : 250;
      const current = Number(form.getFieldValue('affidavitCharges')) || 0;
      // Set when empty/zero or when switching company; do not fight user edits
      if (current === 0 || current === 250 || current === 350) {
        if (current !== defAmt) form.setFieldsValue({ affidavitCharges: defAmt });
      }
    } catch {
      // ignore
    }
  }, [addressProofMode, selectedCompany, form]);

  // Clear payment reference when not online
  useEffect(() => {
    if (paymentMode !== 'online') {
      const cur = form.getFieldValue('paymentReference');
      if (cur) form.setFieldsValue({ paymentReference: undefined });
    }
  }, [paymentMode, form]);

  // Apply external initial values (e.g., when used inside a modal from Stocks)
  useEffect(() => {
    if (initialValues && typeof initialValues === 'object') {
      try {
        const patch = { ...initialValues };
        // Normalize field names if alternative keys are provided
        if (patch.model && !patch.bikeModel) patch.bikeModel = patch.model;
        if (patch.chassis && !patch.chassisNo) patch.chassisNo = patch.chassis;
        form.setFieldsValue(patch);
        if (patch.company) setSelectedCompany(patch.company);
        if (patch.bikeModel) setSelectedModel(patch.bikeModel);
      } catch {
        // ignore
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues]);

  // Ensure Executive and Branch are prefilled
  useEffect(() => {
    const cur = form.getFieldsValue(["executive", "branch"]);
    const patch = {};
    if (!cur.executive && executiveDefault) patch.executive = executiveDefault;
    if (!cur.branch && branchDefault) patch.branch = branchDefault;
    if (Object.keys(patch).length) form.setFieldsValue(patch);
  }, [form, executiveDefault, branchDefault]);

  // Load vehicle data from Google Sheet (same dataset as Quotation). Fallback to /bikeData.json
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
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

  // Fetch current in-stock list once variant is selected (branch-scoped)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!selectedCompany || !selectedModel || !selectedVariant) { setStockItems([]); return; }
      setLoadingStocks(true);
      try {
        const resp = await listCurrentStocksPublic({ limit: 2000 });
        const list = Array.isArray(resp?.data) ? resp.data : [];
        if (!cancelled) setStockItems(list);
      } catch {
        if (!cancelled) setStockItems([]);
      } finally {
        if (!cancelled) setLoadingStocks(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedCompany, selectedModel, selectedVariant]);

  // Derive colors and chassis from stockItems based on selection
  const availableColors = useMemo(() => {
    const norm = (s) => String(s || '').trim().toLowerCase();
    const uniq = new Set();
    stockItems.forEach((s) => {
      if (norm(s.company) === norm(selectedCompany) && norm(s.model) === norm(selectedModel) && norm(s.variant) === norm(selectedVariant)) {
        const c = String(s.color || '').trim();
        if (c) uniq.add(c);
      }
    });
    return Array.from(uniq);
  }, [stockItems, selectedCompany, selectedModel, selectedVariant]);

  const availableChassis = useMemo(() => {
    const norm = (s) => String(s || '').trim().toLowerCase();
    const out = [];
    stockItems.forEach((s) => {
      if (norm(s.company) === norm(selectedCompany) && norm(s.model) === norm(selectedModel) && norm(s.variant) === norm(selectedVariant)) {
        if (!selectedColor || norm(s.color) === norm(selectedColor)) {
          const ch = String(s.chassisNo || s.chassis || '').trim().toUpperCase();
          if (ch && !out.includes(ch)) out.push(ch);
        }
      }
    });
    return out;
  }, [stockItems, selectedCompany, selectedModel, selectedVariant, selectedColor]);

  // Upload rules (PDF only, up to 5MB)
  const beforeUpload = (file) => {
    const isPdf = file.type === "application/pdf" || (file.name || "").toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      message.error("Only PDF files are allowed.");
      return Upload.LIST_IGNORE;
    }
    const isLte5M = file.size <= 5 * 1024 * 1024; // 5 MB max
    if (!isLte5M) {
      message.error("Each file must be 5MB or smaller.");
      return Upload.LIST_IGNORE;
    }
    return false; // prevent auto-upload, keep in fileList
  };

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || "");
        const idx = res.indexOf(',');
        resolve(idx >= 0 ? res.slice(idx + 1) : res);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file.originFileObj || file);
    } catch (e) { reject(e); }
  });

  const onFinish = async (values) => {
    try {
      // Require at least one document uploaded (independent of address proof)
      if (!addressProofFiles || addressProofFiles.length === 0) {
        message.error('Please upload a PDF document');
        return;
      }
      setSubmitting(true);
      // Convert the single PDF to base64 for Apps Script
      const f = (addressProofFiles || [])[0];
      const base64 = await fileToBase64(f);
      const file = { name: f.name, mimeType: f.type || 'application/pdf', size: f.size, base64 };

      // Compute DP totals for submission
      const effAff = values.addressProofMode === 'additional' ? (Number(values.affidavitCharges) || 0) : 0;
      const totalDpCalc = (Number(values.downPayment) || 0) + (Number(values.extraFittingAmount) || 0) + effAff;
      const balancedDpCalc = totalDpCalc - ((Number(values.bookingAmount) || 0));

      // Prepare raw payload snapshot (compact JSON for single-sheet column)
      const rawPayloadObj = {
        customerName: values.customerName,
        mobileNumber: values.mobileNumber,
        vehicle: {
          company: values.company,
          model: values.bikeModel,
          variant: values.variant,
          color: values.color || undefined,
          chassisNo: values.chassisNo === "__ALLOT__" ? undefined : values.chassisNo,
        },
        rtoOffice: values.rtoOffice,
        purchaseMode: values.purchaseType,
        paymentMode: values.paymentMode,
        paymentReference: values.paymentMode === 'online' ? (values.paymentReference || undefined) : undefined,
        addressProofMode: values.addressProofMode,
        addressProofTypes: values.addressProofTypes || [],
        address: values.address || undefined,
        bookingAmount: values.bookingAmount ?? undefined,
        // Loan / No HP
        disbursementAmount: (values.purchaseType === 'loan' || values.purchaseType === 'nohp') ? (values.disbursementAmount ?? undefined) : undefined,
        // DP breakdown
        dp: {
          downPayment: values.downPayment ?? undefined,
          extraFittingAmount: values.extraFittingAmount ?? 0,
          affidavitCharges: values.addressProofMode === 'additional' ? (values.affidavitCharges ?? 0) : 0,
          totalDp: totalDpCalc,
          balancedDp: balancedDpCalc,
        },
        // Cash totals
        cash: {
          onRoadPrice: selectedOnRoadPrice,
          totalVehicleCost: purchaseType === 'cash' ? (Number(selectedOnRoadPrice) || 0) + (Number(values.extraFittingAmount) || 0) + (values.addressProofMode === 'additional' ? (Number(values.affidavitCharges) || 0) : 0) : undefined,
          balancedAmount: purchaseType === 'cash' ? (((Number(selectedOnRoadPrice) || 0) + (Number(values.extraFittingAmount) || 0) + (values.addressProofMode === 'additional' ? (Number(values.affidavitCharges) || 0) : 0)) - (Number(values.bookingAmount) || 0)) : undefined,
        },
        executive: values.executive || executiveDefault || undefined,
        branch: values.branch || branchDefault || undefined,
        // Store only file metadata in raw payload to avoid bloating cells
        file: { name: f.name, mimeType: f.type || 'application/pdf', size: f.size },
        // Additional computed context
        chassis: { status: chassisStatus, info: chassisInfo },
        ts: new Date().toISOString(),
        v: 1,
      };

      const payload = {
        customerName: values.customerName,
        mobileNumber: values.mobileNumber,
        vehicle: {
          company: values.company,
          model: values.bikeModel,
          variant: values.variant,
          color: values.color || undefined,
          chassisNo: values.chassisNo === "__ALLOT__" ? undefined : values.chassisNo,
          availability: values.chassisNo === "__ALLOT__" ? "allot" : chassisStatus,
          availabilityInfo: chassisInfo || undefined,
        },
        onRoadPrice: selectedOnRoadPrice,
        rtoOffice: values.rtoOffice,
        paymentMode: values.paymentMode || undefined,
        purchaseMode: values.purchaseType,
        disbursementAmount: (values.purchaseType === 'loan' || values.purchaseType === 'nohp') ? (values.disbursementAmount ?? undefined) : undefined,
        financier: values.financier || values.nohpFinancier || undefined,
        addressProofMode: values.addressProofMode,
        addressProofTypes: values.addressProofTypes || [],
        address: values.address || undefined,
        bookingAmount: values.bookingAmount ?? undefined,
        paymentReference: values.paymentMode === 'online' ? (values.paymentReference || undefined) : undefined,
        // DP breakdown
        downPayment: values.downPayment ?? undefined,
        extraFittingAmount: values.extraFittingAmount ?? 0,
        affidavitCharges: values.addressProofMode === 'additional' ? (values.affidavitCharges ?? 0) : 0,
        totalDp: totalDpCalc,
        balancedDp: balancedDpCalc,
        // Cash totals
        totalVehicleCost: values.purchaseType === 'cash' ? totalVehicleCost : undefined,
        balancedAmount: values.purchaseType === 'cash' ? balancedAmount : undefined,
        // Raw payload (stringified JSON) for storing in a single sheet column
        rawPayload: JSON.stringify(rawPayloadObj),
        executive: values.executive || executiveDefault || undefined,
        branch: values.branch || branchDefault || undefined,
        file,
      };

      // Optimistic queue: enqueue a slim copy (avoid storing big base64)
      const slim = JSON.parse(JSON.stringify(payload));
      if (slim?.file) {
        // drop base64 from outbox to avoid localStorage quota; keep metadata
        delete slim.file.base64;
      }
      const outboxId = enqueueOutbox({ type: 'booking', data: slim });

      // Fire-and-forget background submission via backend proxy (webhook)
      setTimeout(async () => {
        try {
          const resp = await submitToWebhook(payload); // full payload with file
          const ok = (resp?.data || resp)?.success !== false;
          if (ok) {
            removeOutboxById(outboxId);
            // notify other views to reload
            try { window.dispatchEvent(new Event('reload-bookings')); } catch { /* ignore */ }
          }
        } catch {/* keep queued */}
      }, 0);

      // Instant success UX — do not wait for network
      message.success('Booking saved (syncing in background)');
      if (typeof onSuccess === 'function') {
        try { onSuccess({ response: { success: true, queued: true }, payload }); } catch { /* noop */ }
      }

      form.resetFields();
      // clear file lists
      form.setFieldsValue({ executive: executiveDefault || '', branch: branchDefault || '' });
      setAddressProofFiles([]);
      setSelectedCompany("");
      setSelectedModel("");
      setChassisStatus("idle");
      setChassisInfo(null);
      setStockItems([]);
    } catch (e) {
      message.error(String(e?.message || e || "Submission failed"));
    } finally {
      setSubmitting(false);
    }
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

  const formNode = (
    <Form
      layout="vertical"
      form={form}
      onFinish={onFinish}
      onFinishFailed={onFinishFailed}
      requiredMark="optional"
      encType="multipart/form-data"
    >
      {/* Executive and Branch (auto-fetched) */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}>
          <Form.Item
            label="Executive"
            name="executive"
            rules={[{ required: true, message: "Executive is required" }]}
          >
            <Input size="large" placeholder="Executive name" readOnly={!!executiveDefault} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            label="Branch"
            name="branch"
            rules={[{ required: true, message: "Branch is required" }]}
          >
            <Input size="large" placeholder="Branch name" readOnly={!!branchDefault} />
          </Form.Item>
        </Col>
      </Row>

      {/* 1) Customer Name */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}>
          <Form.Item
            label="Customer Name"
            name="customerName"
            rules={[{ required: true, message: "Please enter customer name" }]}
          >
            <Input size="large" placeholder="e.g., Rahul Sharma" allowClear />
          </Form.Item>
        </Col>
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
      </Row>

      {/* 3) Vehicle details: Company → Model → Variant */}

      {/* 4) Company → Model → Variant → Color */}
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
                  color: undefined,
                  chassisNo: undefined,
                });
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
                form.setFieldsValue({ variant: undefined, color: undefined, chassisNo: undefined });
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
              onChange={() => {
                form.setFieldsValue({ color: undefined, chassisNo: undefined });
              }}
            >
              {variants.map((v, i) => (
                <Option key={i} value={v}>{v}</Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>

      {/* Color (from in-stock where possible) + On-road price */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}>
          <Form.Item label="Color" name="color" rules={[{ required: true, message: "Select color" }]}>
            {availableColors.length ? (
              <Select
                size="large"
                placeholder={loadingStocks ? "Loading colors..." : "Select Color"}
                disabled={!selectedVariant}
                showSearch
                optionFilterProp="children"
                onChange={() => form.setFieldsValue({ chassisNo: undefined })}
              >
                {availableColors.map((c) => (
                  <Option key={c} value={c}>{c}</Option>
                ))}
              </Select>
            ) : (
              <Input size="large" placeholder="Type color" disabled={!selectedVariant} />
            )}
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="On-Road Price (₹)">
            <InputNumber size="large" style={{ width: '100%' }} value={selectedOnRoadPrice} disabled />
          </Form.Item>
        </Col>
      </Row>

      {/* Chassis number + availability */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}>
          <Form.Item
            label="Chassis Number"
            name="chassisNo"
            rules={[{ required: true, message: "Select chassis or choose Allot Vehicle" }]}
          >
            <Select
              size="large"
              placeholder={selectedColor ? "Select Chassis" : "Select color first"}
              disabled={!selectedColor}
              loading={loadingStocks}
              showSearch
              optionFilterProp="children"
              onChange={(v)=>{
                form.setFieldsValue({ chassisNo: v });
                checkChassis(v);
              }}
              allowClear
            >
              {availableChassis.map((ch) => (
                <Option key={ch} value={ch}>{ch}</Option>
              ))}
              <Option value="__ALLOT__">Allot Vehicle (assign later)</Option>
            </Select>
          </Form.Item>
        </Col>
        <Col xs={24} md={12} style={{ display: 'flex', alignItems: 'center' }}>
          <div>
            <div style={{ marginBottom: 6 }}>Availability</div>
            {chassisStatus === 'found' && (
              <Tag color="green">In Stock{chassisInfo?.branch ? ` @ ${chassisInfo.branch}` : ''}</Tag>
            )}
            {chassisStatus === 'allot' && <Tag color="blue">To be allotted</Tag>}
            {chassisStatus === 'not_found' && <Tag color="red">Not Found</Tag>}
            {chassisStatus === 'checking' && <Tag>Checking…</Tag>}
            {chassisStatus === 'idle' && <Tag>Select chassis to check</Tag>}
          </div>
        </Col>
      </Row>

      {/* RTO (after vehicle + chassis) */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}>
          <Form.Item
            label="RTO (Office)"
            name="rtoOffice"
            initialValue="KA"
            rules={[
              { required: true, message: "Enter RTO code (KA + 2 digits)" },
              { pattern: /^KA\d{2}$/, message: 'Use format KA01, KA13, KA05' },
            ]}
            normalize={(v) => {
              const s = String(v || '').toUpperCase().replace(/\s+/g, '');
              if (!s) return 'KA'; // keep KA always
              // Ensure KA prefix and only 2 digits afterwards while typing
              const restDigits = s.startsWith('KA') ? s.slice(2) : s.replace(/[^0-9]/g, '');
              const digits = String(restDigits || '').replace(/\D/g, '').slice(0, 2);
              return digits ? `KA${digits}` : 'KA';
            }}
          >
            <Input size="large" placeholder="e.g., KA02" maxLength={4} />
          </Form.Item>
        </Col>
      </Row>

      {/* 5) Purchase Mode */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={18}>
          <Form.Item
            label="Purchase Mode"
            name="purchaseType"
            initialValue="cash"
            rules={[{ required: true, message: "Choose purchase mode" }]}
          >
            <Radio.Group>
              <Radio.Button value="cash">Cash</Radio.Button>
              <Radio.Button value="loan">Loan</Radio.Button>
              <Radio.Button value="nohp">No HP</Radio.Button>
            </Radio.Group>
          </Form.Item>
        </Col>
      </Row>

      {purchaseType === "loan" && (
        <Row gutter={[16, 0]}>
          <Col xs={24} md={12}>
            <Form.Item label="Financier" name="financier" rules={[{ required: true, message: "Select financier" }]}>
              <Select size="large" placeholder="Select Financier" showSearch optionFilterProp="children">
                {FINANCIERS.map((f) => (
                  <Option key={f} value={f}>{f}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>
      )}

      {purchaseType === "nohp" && (
        <Row gutter={[16, 0]}>
          <Col xs={24} md={12}>
            <Form.Item label="No HP Options" name="nohpFinancier" rules={[{ required: true, message: "Select option" }]}>
              <Select size="large" placeholder="Select">
                <Option value="IDFC">IDFC</Option>
                <Option value="L&T">L&T FINANCE LIMITED</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
      )}

      {(purchaseType === 'loan' || purchaseType === 'nohp') && (
        <Row gutter={[16, 0]}>
          <Col xs={24} md={12}>
            <Form.Item
              label="Disbursement Amount (₹)"
              name="disbursementAmount"
              rules={[{ required: true, message: 'Enter disbursement amount' }]}
            >
              <InputNumber
                size="large"
                style={{ width: '100%' }}
                min={1}
                step={500}
                prefix={<CreditCardOutlined />}
                placeholder="Enter amount"
              />
            </Form.Item>
          </Col>
        </Row>
      )}

      {/* Address Proof */}
      {/* Address Proof Mode */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}>
          <Form.Item label="Address Proof" name="addressProofMode" initialValue="aadhaar" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value="aadhaar">As per Aadhaar / Voter ID</Radio.Button>
              <Radio.Button value="additional">Additional</Radio.Button>
            </Radio.Group>
          </Form.Item>
        </Col>
      </Row>

      {/* For Aadhaar mode, upload is provided separately below */}
      {addressProofMode === 'additional' && (
        <Card size="small" title={<Text strong>Additional Address Proof</Text>} style={{ marginTop: 8, marginBottom: 12, borderRadius: 12 }} headStyle={{ background: "#f8fafc", borderRadius: 12 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24}>
              <Form.Item label="Select proof types" name="addressProofTypes" rules={[{ required: true, message: 'Select at least one type' }]}>
                <Checkbox.Group
                  options={[
                    { label: 'Driving License', value: 'DL' },
                    { label: 'Gas Bill', value: 'GasBill' },
                    { label: 'Rental Agreement', value: 'RentalAgreement' },
                    { label: 'Others', value: 'Others' },
                  ]}
                />
              </Form.Item>
            </Col>
            {/* Upload moved to a separate field below */}
          </Row>
        </Card>
      )}

      {/* Separate Upload Field (independent of Address Proof) */}
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Form.Item
            label="Upload Document (PDF only)"
            required
            rules={[{ required: true, message: 'Please upload a PDF document' }]}
          >
            <Dragger
              multiple={false}
              beforeUpload={beforeUpload}
              fileList={addressProofFiles}
              onChange={({ fileList }) => setAddressProofFiles(fileList.slice(0, 1))}
              maxCount={1}
              accept=".pdf"
              itemRender={(origin) => origin}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">Upload the document in PDF format.</p>
              <p className="ant-upload-hint">Maximum size 5MB. PDFs only.</p>
            </Dragger>
          </Form.Item>
        </Col>
      </Row>

      {/* Address field (below Address Proof and upload) */}
      <Row gutter={[16, 0]}>
        <Col xs={24}>
          <Form.Item label="Address" name="address" rules={[{ required: true, message: 'Please enter address' }]}>
            <Input.TextArea rows={3} placeholder="House No, Street, Area, City, PIN" allowClear />
          </Form.Item>
        </Col>
      </Row>

      {/* Booking Amount + Payment Mode */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={8}>
          <Form.Item
            label="Booking Amount (₹)"
            name="bookingAmount"
            rules={[{ required: true, message: 'Enter booking amount' }]}
          >
            <InputNumber
              size="large"
              style={{ width: "100%" }}
              min={1}
              step={500}
              prefix={<CreditCardOutlined />}
              placeholder="Enter amount"
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            label="Payment Mode"
            name="paymentMode"
            initialValue="cash"
            rules={[{ required: true, message: 'Select payment mode' }]}
          >
            <Radio.Group>
              <Radio.Button value="cash">Cash</Radio.Button>
              <Radio.Button value="online">Online</Radio.Button>
            </Radio.Group>
          </Form.Item>
        </Col>
        {paymentMode === 'online' && (
          <Col xs={24} md={8}>
            <Form.Item
              label="UTR / Reference No."
              name="paymentReference"
              rules={[{ required: true, message: 'Enter UTR / reference number' }]}
            >
              <Input size="large" placeholder="e.g., 23XXXXUTR123" allowClear />
            </Form.Item>
          </Col>
        )}
      </Row>

      {/* Charges & DP */}
      {(purchaseType === 'loan' || purchaseType === 'nohp') && (
        <Row gutter={[16, 0]}>
          <Col xs={24} md={8}>
            <Form.Item
              label="Down Payment (₹)"
              name="downPayment"
              rules={[{ required: true, message: 'Enter down payment' }]}
            >
              <InputNumber
                size="large"
                style={{ width: '100%' }}
                min={0}
                step={500}
                prefix={<CreditCardOutlined />}
                placeholder="Enter amount"
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="Extra Fitting Amount (₹)"
              name="extraFittingAmount"
              initialValue={0}
            >
              <InputNumber
                size="large"
                style={{ width: '100%' }}
                min={0}
                step={100}
                prefix={<CreditCardOutlined />}
                placeholder="Enter amount"
              />
            </Form.Item>
          </Col>
          {addressProofMode === 'additional' && (
            <Col xs={24} md={8}>
              <Form.Item
                label="Affidavit Charges (₹)"
                name="affidavitCharges"
                rules={[{ required: true, message: 'Enter affidavit charges' }]}
              >
                <InputNumber
                  size="large"
                  style={{ width: '100%' }}
                  min={0}
                  step={100}
                  prefix={<CreditCardOutlined />}
                  placeholder="Enter amount"
                />
              </Form.Item>
            </Col>
          )}
        </Row>
      )}

      {purchaseType === 'cash' && (
        <Row gutter={[16, 0]}>
          <Col xs={24} md={8}>
            <Form.Item
              label="Extra Fitting Amount (₹)"
              name="extraFittingAmount"
              initialValue={0}
            >
              <InputNumber
                size="large"
                style={{ width: '100%' }}
                min={0}
                step={100}
                prefix={<CreditCardOutlined />}
                placeholder="Enter amount"
              />
            </Form.Item>
          </Col>
          {addressProofMode === 'additional' && (
            <Col xs={24} md={8}>
              <Form.Item
                label="Affidavit Charges (₹)"
                name="affidavitCharges"
                rules={[{ required: true, message: 'Enter affidavit charges' }]}
              >
                <InputNumber
                  size="large"
                  style={{ width: '100%' }}
                  min={0}
                  step={100}
                  prefix={<CreditCardOutlined />}
                  placeholder="Enter amount"
                />
              </Form.Item>
            </Col>
          )}
        </Row>
      )}

      {/* Totals: DP (loan/nohp) */}
      {(purchaseType === 'loan' || purchaseType === 'nohp') && (
        <Row gutter={[16, 0]}>
          <Col xs={24} md={8}>
            <Form.Item label="Total DP (₹)">
              <InputNumber size="large" style={{ width: '100%' }} value={totalDp} disabled />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Balanced DP (₹)">
              <InputNumber size="large" style={{ width: '100%' }} value={balancedDp} disabled />
            </Form.Item>
          </Col>
        </Row>
      )}

      {/* Totals: Cash mode */}
      {purchaseType === 'cash' && (
        <Row gutter={[16, 0]}>
          <Col xs={24} md={8}>
            <Form.Item label="Total Vehicle Cost (₹)">
              <InputNumber size="large" style={{ width: '100%' }} value={totalVehicleCost} disabled />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Balanced Amount (₹)">
              <InputNumber size="large" style={{ width: '100%' }} value={balancedAmount} disabled />
            </Form.Item>
          </Col>
        </Row>
      )}

      {/* Submit */}
      <Form.Item style={{ marginTop: 8, marginBottom: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', gap: 8 }}>
          <Button type="primary" htmlType="submit" size={isMobile ? "middle" : "large"} loading={submitting}>
            Save Booking
          </Button>
          <Button className="no-print" icon={<PrinterOutlined />} size={isMobile ? "middle" : "large"} onClick={handlePrint}>
            Print Booking Slip
          </Button>
        </div>
      </Form.Item>
    </Form>
  );

  if (asModal) {
    return (
      <div style={{ paddingTop: 4 }}>
        {formNode}
      </div>
    );
  }

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
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
                Two Wheeler Booking
              </Title>
              <Text type="secondary">Fill the details below to reserve your ride.</Text>
            </div>
            <div style={{ flex: 1 }} />
            <FetchBooking
              form={form}
              webhookUrl={BOOKING_GAS_URL}
              setSelectedCompany={setSelectedCompany}
              setSelectedModel={setSelectedModel}
            />
          </div>
        }
      >
        {formNode}
      </Card>
      {/* Hidden on screen; used for printing */}
      <BookingPrintSheet ref={printRef} active vals={valsForPrint} />
    </div>
  );
}
