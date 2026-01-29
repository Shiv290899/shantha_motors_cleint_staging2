// BookingForm.jsx
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
  AutoComplete,
  Modal,
  Space,
  Spin,
} from "antd";
import { InboxOutlined, CreditCardOutlined, PrinterOutlined } from "@ant-design/icons";
import { listCurrentStocksPublic } from "../apiCalls/stocks";
import { saveBookingViaWebhook } from "../apiCalls/forms";
import { listBranchesPublic } from "../apiCalls/branches";
import { listUsersPublic } from "../apiCalls/adminUsers";
import BookingPrintSheet from "./BookingPrintSheet";
import FetchBooking from "./FetchBooking";
import BookingHistoryButton from "./BookingHistoryButton";
import { handleSmartPrint } from "../utils/printUtils";
import { normalizeKey, uniqCaseInsensitive } from "../utils/caseInsensitive";
import dayjs from "dayjs";
import { useLocation } from "react-router-dom";
import { consumeFollowUpBookingPrefill } from "../utils/followUpPrefill";
import { buildBookingFormPatch } from "../utils/bookingFormPrefill";

const { Title, Text } = Typography;
const { Dragger } = Upload;
const { useBreakpoint } = Grid;
const { Option } = Select;

// Normalize to uppercase for consistent sheet writes/searches
const toCaps = (s) => String(s || "").trim().toUpperCase();

// Whether to keep a draft between refreshes
const ENABLE_DRAFT = false;

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
  "BAJAJ FINANCE",
  "OTHER"
];

// Helpers for booking payment splits
const amt = (v) => Number(String(v ?? 0).replace(/[₹,\s]/g, "")) || 0;
const derivePaymentPart = (src, idx) => {
  const pick = (key) => {
    try {
      return typeof src === "function" ? src(key) : src?.[key];
    } catch {
      return undefined;
    }
  };
  let cash = amt(pick(`bookingAmount${idx}Cash`));
  let online = amt(pick(`bookingAmount${idx}Online`));
  const legacyAmount = amt(pick(`bookingAmount${idx}`));
  const legacyMode = String(pick(`paymentMode${idx}`) || "").toLowerCase();
  const ref =
    pick(`paymentReference${idx}`) ||
    pick(`paymentRef${idx}`) ||
    pick(`utr${idx}`) ||
    pick("utr");

  // Legacy fallback: if only Amount+Mode were filled earlier
  if (!cash && !online && legacyAmount) {
    if (legacyMode === "online") {
      online = legacyAmount;
    } else {
      cash = legacyAmount;
    }
  }

  const total = cash + online;
  const mode =
    cash && online
      ? "cash+online"
      : online
      ? "online"
      : cash
      ? "cash"
      : "";

  return {
    part: idx,
    cash,
    online,
    total,
    mode,
    reference: online > 0 ? ref || undefined : undefined,
  };
};
const derivePaymentParts = (src) => [1, 2, 3].map((idx) => derivePaymentPart(src, idx));

const phoneRule = [
  { required: true, message: "Mobile number is required" },
  { pattern: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit Indian mobile number" },
];

// CSV published from Google Sheets (same as in Quotation.jsx)
const SHEET_CSV_URL =
  import.meta.env.VITE_VEHICLE_SHEET_CSV_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQYGuNPY_2ivfS7MTX4bWiu1DWdF2mrHSCnmTznZVEHxNmsrgcGWjVZN4UDUTOzQQdXTnbeM-ylCJbB/pub?gid=408799621&single=true&output=csv";

// Google Apps Script Web App endpoint to save bookings to Google Sheet
const BOOKING_GAS_URL =
  import.meta.env.VITE_BOOKING_GAS_URL ||
  "https://script.google.com/macros/s/AKfycbzAn8Ahu2Mp59Uh0i7jLi1XEzRU44A6xzrMl3X-n1u_EECxSAWCjpNo0Ovk4LeCjvPzeA/exec";

const BOOKING_GAS_SECRET = import.meta.env.VITE_BOOKING_GAS_SECRET || "";

// Minimal CSV parser
const parseCsv = (text) => {
  const rows = [];
  let row = [],
    col = "",
    inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i],
      n = text[i + 1];
    if (c === '"' && !inQuotes) {
      inQuotes = true;
      continue;
    }
    if (c === '"' && inQuotes) {
      if (n === '"') {
        col += '"';
        i++;
        continue;
      }
      inQuotes = false;
      continue;
    }
    if (c === "," && !inQuotes) {
      row.push(col);
      col = "";
      continue;
    }
    if ((c === "\n" || c === "\r") && !inQuotes) {
      if (col !== "" || row.length) {
        row.push(col);
        rows.push(row);
        row = [];
        col = "";
      }
      if (c === "\r" && n === "\n") i++;
      continue;
    }
    col += c;
  }
  if (col !== "" || row.length) {
    row.push(col);
    rows.push(row);
  }
  return rows;
};

// Header aliases
const HEADERS = {
  company: ["Company", "Company Name"],
  model: ["Model", "Model Name"],
  variant: ["Variant"],
  price: ["On-Road Price", "On Road Price", "OnRoadPrice", "Price"],
};

const pick = (row, keys) =>
  String(
    keys
      .map((k) => row[k] ?? "")
      .find((v) => v !== "") || ""
  ).trim();

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
  onRoadPrice:
    Number(
      String(row["On-Road Price"] || row.onRoadPrice || "0").replace(
        /[,₹\s]/g,
        ""
      )
    ) || 0,
});

export default function BookingForm({
  asModal = false,
  initialValues = null,
  onSuccess,
  startPaymentsOnly = false,
  editRefDefault = null,
  allowBranchSelect = false,
  allowExecutiveSelect = false,
  branchOptions = [],
  executiveOptions = [],
  branchOptionsLoading = false,
  executiveOptionsLoading = false,
} = {}) {
  const printRef = useRef(null);
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const isTabletOnly = screens.md && !screens.lg;
  const ctlSize = isMobile ? 'middle' : 'large';

  const [form] = Form.useForm();
  const [addressProofFiles, setAddressProofFiles] = useState([]);
  const [bikeData, setBikeData] = useState([]);
  // Payments-only update mode (after Fetch Details)
  const [paymentsOnlyMode, setPaymentsOnlyMode] = useState(Boolean(startPaymentsOnly));
  const [editRef, setEditRef] = useState(() => editRefDefault || ({ bookingId: null, mobile: null }));
  const [hasFetchedBookingFlag, setHasFetchedBookingFlag] = useState(false);
  const [dynamicBranches, setDynamicBranches] = useState([]);
  const [dynamicExecutives, setDynamicExecutives] = useState([]);
  const [dynamicLoading, setDynamicLoading] = useState(false);
  const [chassisLocked, setChassisLocked] = useState(false);
  const [activeBranchSet, setActiveBranchSet] = useState(null); // lower-case branch names
  const location = useLocation();
  const autoFetchRequest = location.state?.autoFetch;
  const [autoFetchLoading, setAutoFetchLoading] = useState(Boolean(autoFetchRequest));
  const followUpPrefillAppliedRef = useRef(false);

  // User context for auto-filling Executive and Branch
  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }, []);
  const executiveDefault = useMemo(
    () => {
      const raw =
        currentUser?.formDefaults?.staffName ||
        currentUser?.name ||
        currentUser?.displayName ||
        currentUser?.email ||
        "";
      return toCaps(raw);
    },
    [currentUser]
  );
  const branchDefault = useMemo(() => {
    const firstBranch = Array.isArray(currentUser?.branches)
      ? currentUser.branches[0]?.name || currentUser.branches[0]
      : undefined;
    const raw =
      currentUser?.formDefaults?.branchName ||
      currentUser?.primaryBranch?.name ||
      firstBranch ||
      "";
    return toCaps(raw);
  }, [currentUser]);

  const [selectedCompany, setSelectedCompany] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const selectedVariant = Form.useWatch("variant", form);
  const selectedColor = Form.useWatch("color", form);
  const purchaseType = Form.useWatch("purchaseType", form);
  const addressProofMode = Form.useWatch("addressProofMode", form);
  const paymentMode = Form.useWatch("paymentMode", form); // legacy, unused
  const bookingAmount1Cash = Form.useWatch("bookingAmount1Cash", form);
  const bookingAmount2Cash = Form.useWatch("bookingAmount2Cash", form);
  const bookingAmount3Cash = Form.useWatch("bookingAmount3Cash", form);
  const bookingAmount1Online = Form.useWatch("bookingAmount1Online", form);
  const bookingAmount2Online = Form.useWatch("bookingAmount2Online", form);
  const bookingAmount3Online = Form.useWatch("bookingAmount3Online", form);
  const bookingAmount1 = Form.useWatch("bookingAmount1", form);
  const bookingAmount2 = Form.useWatch("bookingAmount2", form);
  const bookingAmount3 = Form.useWatch("bookingAmount3", form);
  const paymentMode1 = Form.useWatch("paymentMode1", form);
  const paymentMode2 = Form.useWatch("paymentMode2", form);
  const paymentMode3 = Form.useWatch("paymentMode3", form);
  const paymentReference1 = Form.useWatch("paymentReference1", form);
  const paymentReference2 = Form.useWatch("paymentReference2", form);
  const paymentReference3 = Form.useWatch("paymentReference3", form);
  const chassisNo = Form.useWatch("chassisNo", form);

  const handleBookingApplied = useCallback(
    ({ bookingId, mobile, vehicle }) => {
      setPaymentsOnlyMode(true);
      setEditRef({ bookingId: bookingId || null, mobile: mobile || null });
      setHasFetchedBookingFlag(true);
      const availability = String(vehicle?.availability || "").toLowerCase();
      const chassisVal = vehicle?.chassisNo || form.getFieldValue("chassisNo");
      const isAllot =
        availability === "allot" || String(chassisVal || "") === "__ALLOT__";
      const hasChassis = Boolean(chassisVal && String(chassisVal) !== "__ALLOT__");
      setChassisLocked(Boolean(hasChassis && !isAllot));
      message.info("Payments-only update mode enabled");
    },
    [form]
  );

  // Live-print watchers
  const wCustomerName = Form.useWatch("customerName", form);
  const wMobileNumber = Form.useWatch("mobileNumber", form);
  const wAddress = Form.useWatch("address", form);
  const wExecutive = Form.useWatch("executive", form);
  const wBranch = Form.useWatch("branch", form);
  const wRtoOffice = Form.useWatch("rtoOffice", form);
  const wFinancier = Form.useWatch("financier", form);
  const wNohpFinancier = Form.useWatch("nohpFinancier", form);

  // Backend override dropdowns (executive/branch)
  const branchSelectOptions = useMemo(() => {
    const merged = [...branchOptions, ...dynamicBranches];
    const set = new Set();
    const add = (v) => {
      if (!v) return;
      const val = typeof v === "string" ? toCaps(v) : toCaps(v?.name || v?.label || v?.value);
      if (val) set.add(val);
    };
    if (branchDefault) add(branchDefault);
    (merged || []).forEach(add);
    return Array.from(set).map((name) => ({ label: name, value: name }));
  }, [branchOptions, dynamicBranches, branchDefault]);

  const executiveSelectOptions = useMemo(() => {
    const merged = [...executiveOptions, ...dynamicExecutives];
    const set = new Set();
    const add = (v) => {
      if (!v) return;
      const val = typeof v === "string" ? toCaps(v) : toCaps(v?.name || v?.label || v?.value);
      if (val) set.add(val);
    };
    if (executiveDefault) add(executiveDefault);
    (merged || []).forEach(add);
    return Array.from(set).map((name) => ({ label: name, value: name }));
  }, [executiveOptions, dynamicExecutives, executiveDefault]);

  const branchSelectActive = allowBranchSelect && branchSelectOptions.length > 0;
  const executiveSelectActive = allowExecutiveSelect && executiveSelectOptions.length > 0;

  // Total booking amount
  const bookingTotal = useMemo(() => {
    const parts = derivePaymentParts({
      bookingAmount1Cash,
      bookingAmount2Cash,
      bookingAmount3Cash,
      bookingAmount1Online,
      bookingAmount2Online,
      bookingAmount3Online,
      bookingAmount1,
      bookingAmount2,
      bookingAmount3,
      paymentMode1,
      paymentMode2,
      paymentMode3,
    });
    return parts.reduce((sum, p) => sum + p.total, 0);
  }, [
    bookingAmount1Cash,
    bookingAmount2Cash,
    bookingAmount3Cash,
    bookingAmount1Online,
    bookingAmount2Online,
    bookingAmount3Online,
    bookingAmount1,
    bookingAmount2,
    bookingAmount3,
    paymentMode1,
    paymentMode2,
    paymentMode3,
  ]);

  const downPaymentWatch = Form.useWatch("downPayment", form);
  const extraFittingAmountWatch = Form.useWatch("extraFittingAmount", form);
  const affidavitChargesWatch = Form.useWatch("affidavitCharges", form);

  // On-road price for selected vehicle (from sheet)
  const selectedOnRoadPrice = useMemo(() => {
    const norm = (s) => String(s || "").trim().toLowerCase();
    const found = bikeData.find(
      (r) =>
        norm(r.company) === norm(selectedCompany) &&
        norm(r.model) === norm(selectedModel) &&
        norm(r.variant) === norm(selectedVariant)
    );
    return Number(found?.onRoadPrice || 0) || 0;
  }, [bikeData, selectedCompany, selectedModel, selectedVariant]);

  const totalDp = useMemo(() => {
    const dp = Number(downPaymentWatch || 0) || 0;
    const extra = Number(extraFittingAmountWatch || 0) || 0;
    const aff =
      addressProofMode === "additional"
        ? Number(affidavitChargesWatch || 0) || 0
        : 0;
    return dp + extra + aff;
  }, [
    downPaymentWatch,
    extraFittingAmountWatch,
    affidavitChargesWatch,
    addressProofMode,
  ]);

  const balancedDp = useMemo(() => {
    const booking = Number(bookingTotal || 0) || 0;
    return totalDp - booking;
  }, [totalDp, bookingTotal]);

  // Cash flow totals
  const totalVehicleCost = useMemo(() => {
    const extra = Number(extraFittingAmountWatch || 0) || 0;
    const aff =
      addressProofMode === "additional"
        ? Number(affidavitChargesWatch || 0) || 0
        : 0;
    return (Number(selectedOnRoadPrice) || 0) + extra + aff;
  }, [
    selectedOnRoadPrice,
    extraFittingAmountWatch,
    affidavitChargesWatch,
    addressProofMode,
  ]);

  const balancedAmount = useMemo(() => {
    const booking = Number(bookingTotal || 0) || 0;
    return totalVehicleCost - booking;
  }, [totalVehicleCost, bookingTotal]);

  const [submitting, setSubmitting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [actionCooldownUntil, setActionCooldownUntil] = useState(0);
  const startActionCooldown = (ms = 6000) => {
    const until = Date.now() + ms;
    setActionCooldownUntil(until);
    setTimeout(() => setActionCooldownUntil(0), ms + 50);
  };
  const hasFetchedBooking = useMemo(
    () => Boolean(hasFetchedBookingFlag || editRef?.bookingId || editRef?.mobile),
    [hasFetchedBookingFlag, editRef]
  );

  const handlePrint = async () => {
    // Only allow print after a booking has been fetched/applied
    if (!hasFetchedBooking) {
      message.warning("Save the booking, fetch it, then print.");
      return;
    }
    setPrinting(true);
    try {
      await new Promise((r) => setTimeout(r, 0)); // paint spinner
      await handleSmartPrint(printRef.current);
    } catch {
      // ignore; any render/print error would surface in console
    } finally {
      setPrinting(false);
    }
  };

  // --- Draft persistence (excluding files) ---
  const DRAFT_KEY = "Booking:draft:v1";
  const readJson = (k, def) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : def;
    } catch {
      return def;
    }
  };
  const writeJson = (k, obj) => {
    try {
      localStorage.setItem(k, JSON.stringify(obj));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!ENABLE_DRAFT) {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        //hgs
      }
      form.resetFields();
      return;
    }
    const draft = readJson(DRAFT_KEY, null);
    if (draft && typeof draft === "object") {
      try {
        form.setFieldsValue(draft);
        if (draft.company) setSelectedCompany(draft.company);
        if (draft.bikeModel) setSelectedModel(draft.bikeModel);
      } catch {
        //asv
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Submit helper with secret and error handling
  const submitToWebhook = async (payload) => {
    if (!BOOKING_GAS_URL) return { success: true, offline: true };
    const merged = BOOKING_GAS_SECRET
      ? { ...payload, secret: BOOKING_GAS_SECRET }
      : payload;
    const resp = await saveBookingViaWebhook({
      webhookUrl: BOOKING_GAS_URL,
      method: "POST",
      payload: merged,
    });
    return resp;
  };

  // Chassis availability state
  const [chassisStatus, setChassisStatus] = useState("idle"); // idle|checking|found|not_found|allot
  const [chassisInfo, setChassisInfo] = useState(null);

  // Prepare booking values for the printable sheet
  const valsForPrint = useMemo(() => {
    const fv = form.getFieldsValue(true);
    const split = derivePaymentParts((k) => fv[k]);
    const payments = [];
    split.forEach((p) => {
      if (p.cash > 0) payments.push({ part: p.part, amount: p.cash, mode: "cash" });
      if (p.online > 0) payments.push({ part: p.part, amount: p.online, mode: "online", reference: p.reference });
    });
    const v = {
      customerName: fv.customerName,
      mobileNumber: fv.mobileNumber,
      address: fv.address,
      branch: fv.branch || branchDefault || "",
      executive: fv.executive || executiveDefault || "",
      rtoOffice: fv.rtoOffice,
      purchaseMode: fv.purchaseType,
      bookingAmount: bookingTotal,
      payments,
      paymentSplit: split,
      addressProofMode: fv.addressProofMode,
      addressProofTypes: fv.addressProofTypes || [],
      fileName:
        (addressProofFiles && addressProofFiles[0]?.name) || undefined,
      vehicle: {
        company: fv.company,
        model: fv.bikeModel,
        variant: fv.variant,
        color: fv.color,
        chassisNo: fv.chassisNo === "__ALLOT__" ? undefined : fv.chassisNo,
        availability: fv.chassisNo === "__ALLOT__" ? "allot" : chassisStatus,
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
    purchaseType,
    paymentMode,
    addressProofMode,
    selectedCompany,
    selectedModel,
    selectedVariant,
    selectedColor,
    chassisNo,
    bookingAmount1Cash,
    bookingAmount2Cash,
    bookingAmount3Cash,
    bookingAmount1Online,
    bookingAmount2Online,
    bookingAmount3Online,
    paymentReference1,
    paymentReference2,
    paymentReference3,
    wCustomerName,
    wMobileNumber,
    wAddress,
    wExecutive,
    wBranch,
    wRtoOffice,
    wFinancier,
    wNohpFinancier,
    addressProofFiles,
    bookingTotal,
  ]);

  // In-stock derived options
  const [stockItems, setStockItems] = useState([]);
  const [loadingStocks, setLoadingStocks] = useState(false);

  // Keep an active branch whitelist for chassis/stock picks
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await listBranchesPublic({ status: "active", limit: 500 });
        if (cancelled) return;
        if (res?.success) {
          const names = (res.data?.items || [])
            .map((b) => String(b?.name || "").trim().toLowerCase())
            .filter(Boolean);
          setActiveBranchSet(new Set(names));
        } else {
          setActiveBranchSet(new Set());
        }
      } catch {
        if (!cancelled) setActiveBranchSet(new Set());
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const isActiveStock = useCallback(
    (item) => {
      if (!activeBranchSet || activeBranchSet.size === 0) return true; // fallback if not loaded
      const b = String(item?.branch || item?.sourceBranch || "")
        .trim()
        .toLowerCase();
      if (!b) return false;
      return activeBranchSet.has(b);
    },
    [activeBranchSet]
  );

  const checkChassis = async (v) => {
    const q = String(v || "").trim().toUpperCase();
    if (q === "__ALLOT__") {
      setChassisStatus("allot");
      setChassisInfo(null);
      return;
    }
    if (!q || q.length < 6) {
      setChassisStatus("idle");
      setChassisInfo(null);
      return;
    }
    setChassisStatus("checking");
    setChassisInfo(null);
    try {
      const resp = await listCurrentStocksPublic({ limit: 1500 });
      const list = Array.isArray(resp?.data) ? resp.data : [];
      const found = list.find(
        (r) =>
          String(r.chassisNo || r.chassis || "").toUpperCase() === q
      );
      if (found && !isActiveStock(found)) {
        setChassisStatus("not_found");
        setChassisInfo(null);
        return;
      }
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
    } catch {
      setChassisStatus("idle");
      setChassisInfo(null);
      message.error("Could not verify chassis availability.");
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      checkChassis(chassisNo);
    }, 600);
    return () => clearTimeout(t);
  }, [chassisNo, activeBranchSet]);

  // Keep affidavit charges zero when not in 'additional' mode
  useEffect(() => {
    if (addressProofMode !== "additional") {
      const cur = form.getFieldValue("affidavitCharges");
      if ((Number(cur) || 0) !== 0)
        form.setFieldsValue({ affidavitCharges: 0 });
    }
  }, [addressProofMode, form]);

  // Auto-fill Affidavit Charges by company
  useEffect(() => {
    try {
      if (paymentsOnlyMode) return; // preserve fetched values in payments-only edit mode
      if (addressProofMode !== "additional") return;
      const comp = String(
        selectedCompany || form.getFieldValue("company") || ""
      ).trim();
      if (!comp) return;
      const isBajaj = /bajaj/i.test(comp);
      const defAmt = isBajaj ? 350 : 250;
      const current = Number(form.getFieldValue("affidavitCharges")) || 0;
      if (current === 0 || current === 250 || current === 350) {
        if (current !== defAmt)
          form.setFieldsValue({ affidavitCharges: defAmt });
      }
    } catch {
      // ignore
    }
  }, [addressProofMode, selectedCompany, paymentsOnlyMode, form]);

  // Load branch/executive options automatically when allowed but not provided
  useEffect(() => {
    const needsBranches = allowBranchSelect && !branchOptions.length;
    const needsExecs = allowExecutiveSelect && !executiveOptions.length;
    if (!needsBranches && !needsExecs) return;
    let cancelled = false;
    const load = async () => {
      setDynamicLoading(true);
      try {
        const res = await Promise.allSettled([
          needsBranches ? listBranchesPublic({ status: "active", limit: 500 }) : Promise.resolve(null),
          needsExecs ? listUsersPublic({ role: "staff", status: "active", limit: 100000 }) : Promise.resolve(null),
        ]);
        if (!cancelled) {
          const [bRes, uRes] = res;
          if (needsBranches && bRes.status === "fulfilled" && bRes.value?.success) {
            const activeBranches = (bRes.value.data?.items || []).filter((b) => String(b?.status || "").toLowerCase() === "active");
            setDynamicBranches(activeBranches.map((b) => b.name).filter(Boolean));
          }
          if (needsExecs && uRes.status === "fulfilled" && uRes.value?.success) {
            setDynamicExecutives(
              (uRes.value.data?.items || [])
                .filter((u) => String(u.role || "").toLowerCase() === "staff")
                .map((u) => u.name || u.email || "")
                .filter(Boolean)
            );
          }
        }
      } catch {
        if (!cancelled) message.error("Could not load dropdown options");
      } finally {
        if (!cancelled) setDynamicLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [allowBranchSelect, allowExecutiveSelect, branchOptions.length, executiveOptions.length]);

  // Clear payment references when the corresponding mode is not online
  useEffect(() => {
    const patch = {};
    const parts = derivePaymentParts((key) => form.getFieldValue(key));
    parts.forEach((p) => {
      const refKey = `paymentReference${p.part}`;
      if (p.online <= 0 && form.getFieldValue(refKey)) {
        patch[refKey] = undefined;
      }
    });
    if (Object.keys(patch).length) form.setFieldsValue(patch);
  }, [
    bookingAmount1Online,
    bookingAmount2Online,
    bookingAmount3Online,
    bookingAmount1,
    bookingAmount2,
    bookingAmount3,
    paymentMode1,
    paymentMode2,
    paymentMode3,
    form,
  ]);

  // Apply external initial values (e.g., from Stocks)
  useEffect(() => {
    if (initialValues && typeof initialValues === "object") {
      try {
        const patch = { ...initialValues };
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
    if (!cur.executive && executiveDefault)
      patch.executive = executiveDefault;
    if (!cur.branch && branchDefault) patch.branch = branchDefault;
    if (Object.keys(patch).length) form.setFieldsValue(patch);
  }, [form, executiveDefault, branchDefault]);

  useEffect(() => {
    if (!autoFetchRequest) return;
    const onComplete = () => setAutoFetchLoading(false);
    window.addEventListener("bookingPrefillComplete", onComplete);
    return () => window.removeEventListener("bookingPrefillComplete", onComplete);
  }, [autoFetchRequest]);

  useEffect(() => {
    if (!autoFetchRequest) return;
    followUpPrefillAppliedRef.current = false;
  }, [autoFetchRequest?.mode, autoFetchRequest?.query]);

  useEffect(() => {
    followUpPrefillAppliedRef.current = false;
  }, [location.key]);

  useEffect(() => {
    if (followUpPrefillAppliedRef.current) return;
    followUpPrefillAppliedRef.current = true;
    const dispatchCompletion = () => {
      if (typeof window === "undefined") return;
      window.dispatchEvent(new CustomEvent("bookingPrefillComplete"));
    };
    const followUpData = consumeFollowUpBookingPrefill();
    if (!followUpData?.payload) {
      dispatchCompletion();
      return;
    }
    try {
      const { patch, metadata } = buildBookingFormPatch(followUpData.payload);
      form.setFieldsValue(patch);
      if (patch.company) setSelectedCompany?.(patch.company);
      if (patch.bikeModel) setSelectedModel?.(patch.bikeModel);
      message.success("Booking details filled.");
      handleBookingApplied(metadata);
    } catch (err) {
      console.warn("Follow-up auto-prefill failed", err);
    } finally {
      dispatchCompletion();
    }
  }, [form, handleBookingApplied, setSelectedCompany, setSelectedModel]);

  // Load vehicle data from Google Sheet
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
        const cleaned = data
          .map(normalizeSheetRow)
          .filter((r) => r.company && r.model && r.variant);
        if (!cancelled) setBikeData(cleaned);
      } catch {
        try {
          const res2 = await fetch("/bikeData.json", { cache: "no-store" });
          if (!res2.ok) throw new Error("fallback missing");
          const data = await res2.json();
          const cleaned = (Array.isArray(data) ? data : [])
            .map(normalizeFallbackRow)
            .filter((r) => r.company && r.model && r.variant);
          if (!cancelled) setBikeData(cleaned);
          if (!Array.isArray(data))
            message.warning("Loaded fallback bikeData.json");
        } catch {
          try {
            const brands = [
              "bajaj",
              "honda",
              "tvs",
              "suzuki",
              "yamaha",
              "royalEnfield",
            ];
            const lists = await Promise.all(
              brands.map(async (b) => {
                try {
                  const r = await fetch(`/${b}.json`, {
                    cache: "no-store",
                  });
                  if (!r.ok) return [];
                  const js = await r.json();
                  return Array.isArray(js) ? js : [];
                } catch {
                  return [];
                }
              })
            );
            const merged = lists.flat();
            const cleaned = merged
              .map(normalizeFallbackRow)
              .filter((r) => r.company && r.model && r.variant);
            if (!cancelled) setBikeData(cleaned);
            if (!cleaned.length) throw new Error("no data");
          } catch {
            message.error(
              "Could not load vehicle data. Please try again later."
            );
          }
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Dropdown lists
  const companies = useMemo(
    () => uniqCaseInsensitive(bikeData.map((r) => r.company)),
    [bikeData]
  );

  const models = useMemo(() => {
    const companyKey = normalizeKey(selectedCompany);
    const base = companyKey
      ? bikeData.filter((r) => normalizeKey(r.company) === companyKey)
      : bikeData;
    return uniqCaseInsensitive(base.map((r) => r.model));
  }, [bikeData, selectedCompany]);

  const variants = useMemo(() => {
    const companyKey = normalizeKey(selectedCompany);
    const modelKey = normalizeKey(selectedModel);
    const base = bikeData.filter((r) => {
      if (companyKey && normalizeKey(r.company) !== companyKey) return false;
      if (modelKey && normalizeKey(r.model) !== modelKey) return false;
      return true;
    });
    return uniqCaseInsensitive(base.map((r) => r.variant));
  }, [bikeData, selectedCompany, selectedModel]);

  // Fetch current in-stock list once variant is selected (branch-scoped)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!selectedCompany || !selectedModel || !selectedVariant) {
        setStockItems([]);
        return;
      }
      setLoadingStocks(true);
      try {
        const resp = await listCurrentStocksPublic({ limit: 2000 });
        const list = Array.isArray(resp?.data) ? resp.data : [];
        const filtered = list.filter((item) => isActiveStock(item));
        if (!cancelled) setStockItems(filtered);
      } catch {
        if (!cancelled) setStockItems([]);
      } finally {
        if (!cancelled) setLoadingStocks(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedCompany, selectedModel, selectedVariant, isActiveStock]);

  // Refilter cached stock items when active branches load
  useEffect(() => {
    if (!activeBranchSet || activeBranchSet.size === 0) return;
    setStockItems((prev) => prev.filter((item) => isActiveStock(item)));
  }, [activeBranchSet, isActiveStock]);

  // Derive colors and chassis from stockItems based on selection
  const availableColors = useMemo(() => {
    const norm = (s) => String(s || "").trim().toLowerCase();
    const uniq = new Set();
    stockItems.forEach((s) => {
      if (!isActiveStock(s)) return;
      if (
        norm(s.company) === norm(selectedCompany) &&
        norm(s.model) === norm(selectedModel) &&
        norm(s.variant) === norm(selectedVariant)
      ) {
        const c = String(s.color || "").trim();
        if (c) uniq.add(c);
      }
    });
    return Array.from(uniq);
  }, [stockItems, selectedCompany, selectedModel, selectedVariant]);

  const availableChassis = useMemo(() => {
    const norm = (s) => String(s || "").trim().toLowerCase();
    const out = [];
    stockItems.forEach((s) => {
      if (!isActiveStock(s)) return;
      if (
        norm(s.company) === norm(selectedCompany) &&
        norm(s.model) === norm(selectedModel) &&
        norm(s.variant) === norm(selectedVariant)
      ) {
        if (!selectedColor || norm(s.color) === norm(selectedColor)) {
          const ch = String(s.chassisNo || s.chassis || "")
            .trim()
            .toUpperCase();
          if (ch && !out.includes(ch)) out.push(ch);
        }
      }
    });
    return out;
  }, [stockItems, selectedCompany, selectedModel, selectedVariant, selectedColor]);

  // Upload rules (PDF only, up to 5MB)
  const beforeUpload = (file) => {
    const isPdf =
      file.type === "application/pdf" ||
      (file.name || "").toLowerCase().endsWith(".pdf");
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

  // Upload file directly to GAS to obtain Drive link
  const uploadFileToGAS = async (file) => {
    const fd = new FormData();
    fd.append("action", "upload");
    if (BOOKING_GAS_SECRET) fd.append("secret", BOOKING_GAS_SECRET);
    const origin = file?.originFileObj || file;
    fd.append(
      "file",
      origin,
      file?.name || origin?.name || "document.pdf"
    );
    const resp = await fetch(BOOKING_GAS_URL, {
      method: "POST",
      body: fd,
      credentials: "omit",
    });
    let js = null;
    try {
      js = await resp.json();
    } catch {
      js = null;
    }
    if (js && (js.ok || js.success)) return js;
    throw new Error("Upload failed");
  };

  // Fallback: read small file as base64 for server-side upload
  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        const origin = file?.originFileObj || file;
        reader.onload = () => {
          const s = String(reader.result || '');
          const idx = s.indexOf(',');
          resolve(idx >= 0 ? s.slice(idx + 1) : s);
        };
        reader.onerror = reject;
        reader.readAsDataURL(origin);
      } catch (e) {
        reject(e);
      }
    });

  const onFinish = async (values, opts = {}) => {
    const {
      skipReset = false,
      silent = false,
      skipCooldown = false,
      skipSubmittingState = false,
      fromPrint = false,
    } = opts;
    try {
      if (!skipCooldown) {
        if (Date.now() < actionCooldownUntil) return;
        startActionCooldown(6000);
      }

      if (!skipSubmittingState) setSubmitting(true);

      // Upload selected file if present (optional in payments-only mode)
      let file = undefined;
      const f = (addressProofFiles || [])[0];
      if (f) {
        file = {
          name: f.name,
          mimeType: f.type || "application/pdf",
          size: f.size,
        };
        try {
          const up = await uploadFileToGAS(f);
          if (up && (up.url || up.fileId)) file = { ...file, ...up };
        } catch {
          try {
            if ((f.size || 0) <= 3 * 1024 * 1024) {
              const base64 = await fileToBase64(f);
              file.base64 = base64;
            }
          } catch { /* ignore */ }
        }
      }

      // Compute DP totals for submission
      const effAff =
        values.addressProofMode === "additional"
          ? Number(values.affidavitCharges) || 0
          : 0;
      const totalDpCalc =
        (Number(values.downPayment) || 0) +
        (Number(values.extraFittingAmount) || 0) +
        effAff;

      const parts = derivePaymentParts((key) => values[key]);
      const bookingSum = parts.reduce((s, p) => s + p.total, 0);

      if (bookingSum <= 0) {
        message.error("Please enter at least one partial booking payment");
        setSubmitting(false);
        return;
      }

      const balancedDpCalc = totalDpCalc - bookingSum;

      // Expand split payments for GAS and legacy consumers
      const paymentsExpanded = [];
      parts.forEach((p) => {
        if (p.cash > 0) {
          paymentsExpanded.push({
            part: p.part,
            amount: p.cash,
            mode: "cash",
          });
        }
        if (p.online > 0) {
          paymentsExpanded.push({
            part: p.part,
            amount: p.online,
            mode: "online",
            reference: p.reference || undefined,
          });
        }
      });

      // Legacy fields (mode/amount per partial) for backward compatibility
      const legacyPayments = parts.map((p) => ({
        amount: p.total || undefined,
        mode: p.mode ? p.mode.toUpperCase() : undefined,
        reference: p.reference,
      }));

      // Prepare raw payload snapshot
      const rawPayloadObj = {
        customerName: values.customerName,
        mobileNumber: values.mobileNumber,
        vehicle: {
          company: values.company,
          model: values.bikeModel,
          variant: values.variant,
          color: values.color || undefined,
          chassisNo:
            values.chassisNo === "__ALLOT__" ? undefined : values.chassisNo,
        },
        rtoOffice: values.rtoOffice,
        purchaseMode: values.purchaseType,
        payments: paymentsExpanded,
        paymentSplit: parts,
        addressProofMode: values.addressProofMode,
        addressProofTypes: values.addressProofTypes || [],
        address: values.address || undefined,
        bookingAmount: bookingSum || undefined,
        bookingAmount1: legacyPayments[0]?.amount,
        bookingAmount2: legacyPayments[1]?.amount,
        bookingAmount3: legacyPayments[2]?.amount,
        paymentMode1: legacyPayments[0]?.mode,
        paymentMode2: legacyPayments[1]?.mode,
        paymentMode3: legacyPayments[2]?.mode,
        paymentReference1:
          (parts[0]?.online || 0) > 0 ? parts[0]?.reference || undefined : undefined,
        paymentReference2:
          (parts[1]?.online || 0) > 0 ? parts[1]?.reference || undefined : undefined,
        paymentReference3:
          (parts[2]?.online || 0) > 0 ? parts[2]?.reference || undefined : undefined,
        // Split amounts per partial (for easier reading in Sheet)
        bookingAmount1Cash: values.bookingAmount1Cash ?? undefined,
        bookingAmount1Online: values.bookingAmount1Online ?? undefined,
        bookingAmount2Cash: values.bookingAmount2Cash ?? undefined,
        bookingAmount2Online: values.bookingAmount2Online ?? undefined,
        bookingAmount3Cash: values.bookingAmount3Cash ?? undefined,
        bookingAmount3Online: values.bookingAmount3Online ?? undefined,
        // Loan / No HP
        disbursementAmount:
          values.purchaseType === "loan" ||
          values.purchaseType === "nohp"
            ? values.disbursementAmount ?? undefined
            : undefined,
        // DP breakdown
        dp: {
          downPayment: values.downPayment ?? undefined,
          extraFittingAmount: values.extraFittingAmount ?? 0,
          affidavitCharges:
            values.addressProofMode === "additional"
              ? values.affidavitCharges ?? 0
              : 0,
          totalDp: totalDpCalc,
          balancedDp: balancedDpCalc,
        },
        // Cash totals
        cash: {
          onRoadPrice: selectedOnRoadPrice,
          totalVehicleCost:
            purchaseType === "cash"
              ? (Number(selectedOnRoadPrice) || 0) +
                (Number(values.extraFittingAmount) || 0) +
                (values.addressProofMode === "additional"
                  ? Number(values.affidavitCharges) || 0
                  : 0)
              : undefined,
          balancedAmount:
            purchaseType === "cash"
              ? (Number(selectedOnRoadPrice) || 0) +
                (Number(values.extraFittingAmount) || 0) +
                (values.addressProofMode === "additional"
                  ? Number(values.affidavitCharges) || 0
                  : 0) -
                bookingSum
              : undefined,
        },
        executive: values.executive || executiveDefault || undefined,
        branch: values.branch || branchDefault || undefined,
        // Only file metadata in raw payload
        file: file ? { name: file.name, mimeType: file.mimeType, size: file.size } : undefined,
        chassis: { status: chassisStatus, info: chassisInfo },
        ts: new Date().toISOString(),
        v: 1,
      };

      // Pre-aggregate payment split for GAS (frontend-only approach)
      const cashCollected = paymentsExpanded
        .filter((p) => String(p.mode).toLowerCase() === 'cash')
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const onlineCollected = paymentsExpanded
        .filter((p) => String(p.mode).toLowerCase() === 'online')
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const totalCollected = cashCollected + onlineCollected;

      const payload = {
        customerName: values.customerName,
        mobileNumber: values.mobileNumber,
        vehicle: {
          company: values.company,
          model: values.bikeModel,
          variant: values.variant,
          color: values.color || undefined,
          chassisNo:
            values.chassisNo === "__ALLOT__" ? undefined : values.chassisNo,
          availability: values.chassisNo === "__ALLOT__" ? "allot" : chassisStatus,
          availabilityInfo: chassisInfo || undefined,
        },
        onRoadPrice: selectedOnRoadPrice,
        rtoOffice: values.rtoOffice,
        purchaseMode: values.purchaseType,
        disbursementAmount:
          values.purchaseType === "loan" ||
          values.purchaseType === "nohp"
            ? values.disbursementAmount ?? undefined
            : undefined,
        financier: values.financier || values.nohpFinancier || undefined,
        addressProofMode: values.addressProofMode,
        addressProofTypes: values.addressProofTypes || [],
        address: values.address || undefined,
        payments: paymentsExpanded,
        paymentSplit: parts,
        // Convenience fields for GAS (no code changes on backend needed)
        source: 'booking',
        cashCollected,
        onlineCollected,
        totalCollected,
        bookingAmount: bookingSum || undefined,
        // Legacy-compatible fields for older GAS columns
        bookingAmount1: legacyPayments[0]?.amount,
        bookingAmount2: legacyPayments[1]?.amount,
        bookingAmount3: legacyPayments[2]?.amount,
        paymentMode1: legacyPayments[0]?.mode,
        paymentMode2: legacyPayments[1]?.mode,
        paymentMode3: legacyPayments[2]?.mode,
        paymentReference1:
          (parts[0]?.online || 0) > 0 ? parts[0]?.reference || undefined : undefined,
        paymentReference2:
          (parts[1]?.online || 0) > 0 ? parts[1]?.reference || undefined : undefined,
        paymentReference3:
          (parts[2]?.online || 0) > 0 ? parts[2]?.reference || undefined : undefined,
        bookingAmount1Cash: values.bookingAmount1Cash ?? undefined,
        bookingAmount1Online: values.bookingAmount1Online ?? undefined,
        bookingAmount2Cash: values.bookingAmount2Cash ?? undefined,
        bookingAmount2Online: values.bookingAmount2Online ?? undefined,
        bookingAmount3Cash: values.bookingAmount3Cash ?? undefined,
        bookingAmount3Online: values.bookingAmount3Online ?? undefined,
        downPayment: values.downPayment ?? undefined,
        extraFittingAmount: values.extraFittingAmount ?? 0,
        affidavitCharges:
          values.addressProofMode === "additional"
            ? values.affidavitCharges ?? 0
            : 0,
        totalDp: totalDpCalc,
        balancedDp: balancedDpCalc,
        totalVehicleCost:
          values.purchaseType === "cash" ? totalVehicleCost : undefined,
        balancedAmount:
          values.purchaseType === "cash" ? balancedAmount : undefined,
        rawPayload: JSON.stringify(rawPayloadObj),
        executive: values.executive || executiveDefault || undefined,
        branch: values.branch || branchDefault || undefined,
        // Include file so GAS saves it (create) or appends it (update)
        // Include file if provided
        ...(file ? { file } : {}),
        // When editing an existing booking, include identifiers to update same record
        ...(editRef?.bookingId ? { bookingId: editRef.bookingId } : {}),
        ...(editRef?.mobile ? { editMobile: editRef.mobile } : {}),
        ...(paymentsOnlyMode ? { action: 'update' } : {}),
      };

      let ok = false;
      let resp;
      try {
        resp = await submitToWebhook(payload);
        ok = (resp?.data || resp)?.success !== false;
      } catch {
        ok = false;
      }

      if (!ok) {
        throw new Error(
          String((resp?.data || resp)?.message || "Submission failed")
        );
      }

      if (!silent) message.success("Booking saved successfully");
      if (!fromPrint && typeof onSuccess === "function") {
        try {
          onSuccess({ response: resp?.data || resp, payload });
        } catch {
          // ignore
        }
      }

      // File already sent in main payload; GAS appends appropriately on update

      // Reset form after confirmed success
      if (!skipReset) {
        form.resetFields();
        writeJson(DRAFT_KEY, null);
        form.setFieldsValue({
          executive: executiveDefault || "",
          branch: branchDefault || "",
        });
        // Exit payments-only mode after save
        setPaymentsOnlyMode(false);
        setEditRef({ bookingId: null, mobile: null });
        setChassisLocked(false);
        setAddressProofFiles([]);
        setSelectedCompany("");
        setSelectedModel("");
        setChassisStatus("idle");
        setChassisInfo(null);
        setStockItems([]);
        try {
          window.dispatchEvent(new Event("reload-bookings"));
        } catch {
          // ignore
        }
      }
    } catch (e) {
      message.error(String(e?.message || e || "Submission failed"));
      if (fromPrint) throw e;
    } finally {
      if (!skipSubmittingState) setSubmitting(false);
    }
  };

  const onFinishFailed = ({ errorFields }) => {
    if (errorFields?.length) {
      form.scrollToField(errorFields[0].name, {
        behavior: "smooth",
        block: "center",
      });
    }
  };

  const upperFromEvent = (e) => {
    if (typeof e === "string") return e.toUpperCase();
    if (e && typeof e === "object" && typeof e.target?.value === "string") {
      return e.target.value.toUpperCase();
    }
    return e;
  };

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
      onValuesChange={(_, all) => {
        try {
          if (!ENABLE_DRAFT) return;
          const copy = { ...all };
          [1, 2, 3].forEach((idx) => {
            const onlineVal = Number(copy[`bookingAmount${idx}Online`] || 0) || 0;
            if (onlineVal <= 0) delete copy[`paymentReference${idx}`];
          });
          writeJson(DRAFT_KEY, copy);
        } catch {
          // ignore
        }
      }}
      requiredMark="optional"
      encType="multipart/form-data"
    >
      {/* Executive and Branch */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}>
          <Form.Item
            label="Executive"
            name="executive"
            rules={[{ required: true, message: "Executive is required" }]}
            getValueFromEvent={upperFromEvent}
          >
            {executiveSelectActive ? (
              <Select
                size={ctlSize}
                showSearch
                optionFilterProp="label"
                placeholder="Select executive"
                disabled={paymentsOnlyMode}
                loading={executiveOptionsLoading || dynamicLoading}
                options={executiveSelectOptions}
                allowClear={!executiveDefault}
                style={{ textTransform: "uppercase" }}
              />
            ) : (
              <Input
                size={ctlSize}
                placeholder="Executive name"
                readOnly={!!executiveDefault}
                disabled={paymentsOnlyMode}
                style={{ textTransform: "uppercase" }}
              />
            )}
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            label="Branch"
            name="branch"
            rules={[{ required: true, message: "Branch is required" }]}
            getValueFromEvent={upperFromEvent}
          >
            {branchSelectActive ? (
              <Select
                size={ctlSize}
                showSearch
                optionFilterProp="label"
                placeholder="Select branch"
                disabled={paymentsOnlyMode}
                loading={branchOptionsLoading || dynamicLoading}
                options={branchSelectOptions}
                allowClear={!branchDefault}
                style={{ textTransform: "uppercase" }}
              />
            ) : (
              <Input
                size={ctlSize}
                placeholder="Branch name"
                readOnly={!!branchDefault}
                disabled={paymentsOnlyMode}
                style={{ textTransform: "uppercase" }}
              />
            )}
          </Form.Item>
        </Col>
      </Row>

      {/* Customer Name + Mobile */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}>
          <Form.Item
            label="Customer Name"
            name="customerName"
            rules={[{ required: true, message: "Please enter customer name" }]}
            getValueFromEvent={(e) => {
              const v = e?.target?.value ?? e;
              return typeof v === "string" ? v.toUpperCase() : v;
            }}
          >
            <Input
              size={ctlSize}
              placeholder="e.g., RAHUL SHARMA"
              allowClear
              style={{ textTransform: "uppercase" }}
              disabled={paymentsOnlyMode}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            label="Mobile Number"
            name="mobileNumber"
            rules={phoneRule}
            normalize={(v) =>
              v ? v.replace(/\D/g, "").slice(0, 10) : v
            }
            getValueFromEvent={(e) => e?.target?.value?.toUpperCase?.()}
          >
            <Input
              size={ctlSize}
              placeholder="10-digit number"
              maxLength={10}
              inputMode="numeric"
              allowClear
              disabled={paymentsOnlyMode}
              style={{ textTransform: "uppercase" }}
            />
          </Form.Item>
        </Col>
      </Row>

      {/* Vehicle: Company → Model → Variant */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={8}>
          <Form.Item
            label="Company"
            name="company"
            rules={[{ required: true, message: "Select a company" }]}
          >
            <Select
              size={ctlSize}
              placeholder="Select Company"
              disabled={paymentsOnlyMode}
              onChange={(v) => {
                setSelectedCompany(v);
                setSelectedModel("");
                form.setFieldsValue({
                  bikeModel: undefined,
                  variant: undefined,
                  color: undefined,
                  chassisNo: undefined,
                });
                form.setFieldsValue({ company: String(v).toUpperCase() });
              }}
              style={{ textTransform: "uppercase" }}
              dropdownRender={undefined}
            >
              {companies.map((c, i) => (
                <Option key={i} value={c}>
                  {c}
                </Option>
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
              size={ctlSize}
              placeholder="Select Model"
              disabled={paymentsOnlyMode || !selectedCompany}
              onChange={(v) => {
                setSelectedModel(v);
                form.setFieldsValue({
                  variant: undefined,
                  color: undefined,
                  chassisNo: undefined,
                });
                form.setFieldsValue({ bikeModel: String(v).toUpperCase() });
              }}
              style={{ textTransform: "uppercase" }}
              dropdownRender={undefined}
            >
              {models.map((m, i) => (
                <Option key={i} value={m}>
                  {m}
                </Option>
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
              size={ctlSize}
              placeholder="Select Variant"
              disabled={paymentsOnlyMode || !selectedModel}
              onChange={(v) => {
                form.setFieldsValue({ color: undefined, chassisNo: undefined });
                form.setFieldsValue({ variant: String(v).toUpperCase() });
              }}
              style={{ textTransform: "uppercase" }}
              dropdownRender={undefined}
            >
              {variants.map((v, i) => (
                <Option key={i} value={v}>
                  {v}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>

      {/* Color + On-road price */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}>
          <Form.Item
            label="Color"
            name="color"
            rules={[{ required: true, message: "Select color" }]}
            getValueFromEvent={(e) => e?.target?.value?.toUpperCase?.() || (typeof e === 'string' ? e.toUpperCase() : e)}
          >
            <AutoComplete
              size={ctlSize}
              disabled={paymentsOnlyMode || !selectedVariant}
              placeholder={
                loadingStocks ? "Loading colors..." : "Select or type color"
              }
              options={availableColors.map((c) => ({ value: c }))}
              filterOption={(inputValue, option) =>
                String(option?.value || "")
                  .toLowerCase()
                  .includes(String(inputValue || "").toLowerCase())
              }
              onChange={() => form.setFieldsValue({ chassisNo: undefined })}
              style={{ textTransform: "uppercase" }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="On-Road Price (₹)">
            <InputNumber
              size={ctlSize}
              style={{ width: "100%" }}
              value={selectedOnRoadPrice}
              disabled
            />
          </Form.Item>
        </Col>
      </Row>

      {/* Chassis number + availability */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}>
          <Form.Item
            label="Chassis Number"
            name="chassisNo"
            rules={[
              {
                required: true,
                message: "Select chassis or choose Allot Vehicle",
              },
            ]}
          >
            <Select
              size={ctlSize}
              placeholder={selectedColor ? "Select Chassis" : "Select color first"}
              disabled={chassisLocked || !selectedColor}
              loading={loadingStocks}
              showSearch
              optionFilterProp="children"
              onChange={(v) => {
                setChassisLocked(false);
                form.setFieldsValue({ chassisNo: String(v).toUpperCase() });
                checkChassis(v);
              }}
              allowClear
              style={{ textTransform: "uppercase" }}
              dropdownRender={undefined}
            >
              {availableChassis.map((ch) => (
                <Option key={ch} value={ch}>
                  {ch}
                </Option>
              ))}
              <Option value="__ALLOT__">Allot Vehicle (assign later)</Option>
            </Select>
          </Form.Item>
        </Col>
        <Col
          xs={24}
          md={12}
          style={{ display: "flex", alignItems: "center" }}
        >
          <div>
            <div style={{ marginBottom: 6 }}>Availability</div>
            {chassisStatus === "found" && (
              <Tag color="green">
                In Stock
                {chassisInfo?.branch ? ` @ ${chassisInfo.branch}` : ""}
              </Tag>
            )}
            {chassisStatus === "allot" && (
              <Tag color="blue">To be allotted</Tag>
            )}
            {chassisStatus === "not_found" && (
              <Tag color="red">Not Found</Tag>
            )}
            {chassisStatus === "checking" && <Tag>Checking…</Tag>}
            {chassisStatus === "idle" && <Tag>Select chassis to check</Tag>}
          </div>
        </Col>
      </Row>

      {/* RTO (Office) */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}>
          <Form.Item
            label="RTO (Office)"
            name="rtoOffice"
            initialValue="KA"
            rules={[
              {
                required: true,
                message: "Enter RTO code (KA + 2 digits)",
              },
              { pattern: /^KA\d{2}$/, message: "Use format KA01, KA13, KA05" },
            ]}
            normalize={(v) => {
              const s = String(v || "")
                .toUpperCase()
                .replace(/\s+/g, "");
              if (!s) return "KA";
              const restDigits = s.startsWith("KA")
                ? s.slice(2)
                : s.replace(/[^0-9]/g, "");
              const digits = String(restDigits || "")
                .replace(/\D/g, "")
                .slice(0, 2);
              return digits ? `KA${digits}` : "KA";
            }}
            getValueFromEvent={(e) => e?.target?.value?.toUpperCase?.()}
          >
            <Input
              size={ctlSize}
              placeholder="e.g., KA02"
              maxLength={4}
              disabled={paymentsOnlyMode}
              style={{ textTransform: "uppercase" }}
            />
          </Form.Item>
        </Col>
      </Row>

      {/* Purchase Mode */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={18}>
          <Form.Item
            label="Purchase Mode"
            name="purchaseType"
            initialValue="cash"
            rules={[{ required: true, message: "Choose purchase mode" }]}
          >
            <Radio.Group disabled={paymentsOnlyMode}>
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
            <Form.Item
              label="Financier"
              name="financier"
              rules={[{ required: true, message: "Select financier" }]}
            >
              <Select
                size={ctlSize}
                placeholder="Select Financier"
                showSearch
                optionFilterProp="children"
                disabled={paymentsOnlyMode}
                onChange={(v) => form.setFieldsValue({ financier: String(v).toUpperCase() })}
                style={{ textTransform: "uppercase" }}
                dropdownRender={undefined}
              >
                {FINANCIERS.map((f) => (
                  <Option key={f} value={f}>
                    {f}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>
      )}

      {purchaseType === "nohp" && (
        <Row gutter={[16, 0]}>
          <Col xs={24} md={12}>
            <Form.Item
              label="No HP Options"
              name="nohpFinancier"
              rules={[{ required: true, message: "Select option" }]}
            >
              <Select
                size={ctlSize}
                placeholder="Select"
                disabled={paymentsOnlyMode}
                onChange={(v) => form.setFieldsValue({ nohpFinancier: String(v).toUpperCase() })}
                style={{ textTransform: "uppercase" }}
                dropdownRender={undefined}
              >
                <Option value="IDFC">IDFC</Option>
                <Option value="L&T">L&T FINANCE LIMITED</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
      )}

      {(purchaseType === "loan" || purchaseType === "nohp") && (
        <Row gutter={[16, 0]}>
          <Col xs={24} md={12}>
            <Form.Item
              label="Disbursement Amount (₹)"
              name="disbursementAmount"
              rules={[
                { required: true, message: "Enter disbursement amount" },
              ]}
            >
              <InputNumber
                size={ctlSize}
                style={{ width: "100%" }}
                min={1}
                step={500}
                prefix={<CreditCardOutlined />}
                placeholder="Enter amount"
                disabled={paymentsOnlyMode || hasFetchedBooking}
              />
            </Form.Item>
          </Col>
        </Row>
      )}

      {/* Address Proof Mode */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}>
          <Form.Item
            label="Address Proof"
            name="addressProofMode"
            initialValue="aadhaar"
            rules={[{ required: true }]}
          >
            <Radio.Group>
              <Radio.Button value="aadhaar">
                As per Aadhaar / Voter ID
              </Radio.Button>
              <Radio.Button value="additional">Additional</Radio.Button>
            </Radio.Group>
          </Form.Item>
        </Col>
      </Row>

      {/* Additional Address Proof block */}
      {addressProofMode === "additional" && (
        <Card
          size="small"
          title={<Text strong>Additional Address Proof</Text>}
          style={{ marginTop: 8, marginBottom: 12, borderRadius: 12 }}
          headStyle={{ background: "#f8fafc", borderRadius: 12 }}
        >
          <Row gutter={[16, 16]}>
            <Col xs={24}>
              <Form.Item
                label="Select proof types"
                name="addressProofTypes"
                rules={[
                  {
                    required: true,
                    message: "Select at least one type",
                  },
                ]}
              >
                <Checkbox.Group
                  options={[
                    { label: "Driving License", value: "DL" },
                    { label: "Gas Bill", value: "GasBill" },
                    { label: "Rental Agreement", value: "RentalAgreement" },
                    { label: "Others", value: "Others" },
                  ]}
                  
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      )}

      {/* Upload Document */}
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Form.Item label="Upload Document (PDF only)">
            <Dragger
              multiple={false}
              beforeUpload={beforeUpload}
              fileList={addressProofFiles}
              onChange={({ fileList }) =>
                setAddressProofFiles(fileList.slice(0, 1))
              }
              maxCount={1}
              accept=".pdf"
              itemRender={(origin) => origin}
              disabled={false}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">
                Upload the document in PDF format.
              </p>
              <p className="ant-upload-hint">
                Maximum size 5MB. PDFs only.
              </p>
            </Dragger>
          </Form.Item>
        </Col>
      </Row>

      {/* Address */}
      <Row gutter={[16, 0]}>
        <Col xs={24}>
          <Form.Item
            label="Address"
            name="address"
            rules={[{ required: true, message: "Please enter address" }]}
            getValueFromEvent={(e) => e?.target?.value?.toUpperCase?.()}
          >
            <Input.TextArea
              rows={3}
              placeholder="House No, Street, Area, City, PIN"
              allowClear
              disabled={paymentsOnlyMode}
              style={{ textTransform: "uppercase" }}
            />
          </Form.Item>
        </Col>
      </Row>

      {/* Charges & DP */}
      {(purchaseType === "loan" || purchaseType === "nohp") && (
        <Row gutter={[16, 0]}>
          <Col xs={24} md={8}>
            <Form.Item
              label="Down Payment (₹)"
              name="downPayment"
              rules={[{ required: true, message: "Enter down payment" }]}
            >
              <InputNumber
                size={ctlSize}
                style={{ width: "100%" }}
                min={0}
                step={500}
                prefix={<CreditCardOutlined />}
                placeholder="Enter amount"
                disabled={paymentsOnlyMode}
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
                size={ctlSize}
                style={{ width: "100%" }}
                min={0}
                step={100}
                prefix={<CreditCardOutlined />}
                placeholder="Enter amount"
                disabled={paymentsOnlyMode}
              />
            </Form.Item>
          </Col>
          {addressProofMode === "additional" && (
            <Col xs={24} md={8}>
              <Form.Item
                label="Affidavit Charges (₹)"
                name="affidavitCharges"
                rules={[
                  { required: true, message: "Enter affidavit charges" },
                ]}
              >
                <InputNumber
                  size={ctlSize}
                  style={{ width: "100%" }}
                  min={0}
                  step={100}
                  prefix={<CreditCardOutlined />}
                  placeholder="Enter amount"
                  disabled={paymentsOnlyMode}
                />
              </Form.Item>
            </Col>
          )}
        </Row>
      )}

      {purchaseType === "cash" && (
        <Row gutter={[16, 0]}>
          <Col xs={24} md={8}>
            <Form.Item
              label="Extra Fitting Amount (₹)"
              name="extraFittingAmount"
              initialValue={0}
            >
              <InputNumber
                size={ctlSize}
                style={{ width: "100%" }}
                min={0}
                step={100}
                prefix={<CreditCardOutlined />}
                placeholder="Enter amount"
                disabled={paymentsOnlyMode}
              />
            </Form.Item>
          </Col>
          {addressProofMode === "additional" && (
            <Col xs={24} md={8}>
              <Form.Item
                label="Affidavit Charges (₹)"
                name="affidavitCharges"
                rules={[
                  { required: true, message: "Enter affidavit charges" },
                ]}
              >
                <InputNumber
                  size={ctlSize}
                  style={{ width: "100%" }}
                  min={0}
                  step={100}
                  prefix={<CreditCardOutlined />}
                  placeholder="Enter amount"
                  disabled={paymentsOnlyMode}
                />
              </Form.Item>
            </Col>
          )}
        </Row>
      )}

      {/* Totals: DP */}
      {(purchaseType === "loan" || purchaseType === "nohp") && (
        <Row gutter={[16, 0]}>
          <Col xs={24} md={8}>
            <Form.Item label="Total DP (₹)">
              <InputNumber
                size={ctlSize}
                style={{ width: "100%" }}
                value={totalDp}
                disabled
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Balanced DP (₹)">
              <InputNumber
                size={ctlSize}
                style={{ width: "100%" }}
                value={balancedDp}
                disabled
              />
            </Form.Item>
          </Col>
        </Row>
      )}

      {/* Totals: Cash */}
      {purchaseType === "cash" && (
        <Row gutter={[16, 0]}>
          <Col xs={24} md={8}>
            <Form.Item label="Total Vehicle Cost (₹)">
              <InputNumber
                size={ctlSize}
                style={{ width: "100%" }}
                value={totalVehicleCost}
                disabled
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Balanced Amount (₹)">
              <InputNumber
                size={ctlSize}
                style={{ width: "100%" }}
                value={balancedAmount}
                disabled
              />
            </Form.Item>
          </Col>
        </Row>
      )}

      {/* Booking Amount (3 partial payments) — moved below Balanced DP/Amount */}
      <Row gutter={[16, 0]}>
        <Col xs={24}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Booking Payments (split Cash + Online inside each partial)
          </div>
        </Col>
        {[1, 2, 3].map((idx) => (
          <React.Fragment key={`p-${idx}`}>
            <Col xs={24} md={8}>
              <Form.Item
                label={`Amount ${idx} - Cash (₹)`}
                name={`bookingAmount${idx}Cash`}
                dependencies={idx === 1 ? [`bookingAmount${idx}Online`] : undefined}
                rules={
                  idx === 1
                    ? [
                        {
                          validator: (_, value) => {
                            const cash = Number(value || 0) || 0;
                            const online = Number(form.getFieldValue(`bookingAmount${idx}Online`) || 0) || 0;
                            return cash > 0 || online > 0
                              ? Promise.resolve()
                              : Promise.reject(new Error("Enter Amount 1 (cash or online)"));
                          },
                        },
                      ]
                    : []
                }
              >
                <InputNumber
                  size={ctlSize}
                  style={{ width: "100%" }}
                  min={0}
                  step={500}
                  prefix={<CreditCardOutlined />}
                  placeholder="0"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                label={`Amount ${idx} - Online (₹)`}
                name={`bookingAmount${idx}Online`}
              >
                <InputNumber
                  size={ctlSize}
                  style={{ width: "100%" }}
                  min={0}
                  step={500}
                  prefix={<CreditCardOutlined />}
                  placeholder="0"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item shouldUpdate noStyle>
                {() => {
                  const onlineVal =
                    Number(form.getFieldValue(`bookingAmount${idx}Online`) || 0) || 0;
                  return (
                    <Form.Item
                      label={`UTR / Ref No.${idx}`}
                      name={`paymentReference${idx}`}
                      rules={
                        onlineVal > 0
                          ? [
                              {
                                required: true,
                                message: "Enter UTR / reference number",
                              },
                            ]
                          : []
                      }
                      getValueFromEvent={(e) => {
                        const v = e && e.target ? e.target.value : e;
                        return typeof v === 'string' ? v.toUpperCase() : v;
                      }}
                    >
                      <Input
                        size={ctlSize}
                        placeholder="e.g., 23XXXXUTR123"
                        allowClear
                        disabled={onlineVal <= 0}
                        style={{ textTransform: 'uppercase' }}
                      />
                    </Form.Item>
                  );
                }}
              </Form.Item>
            </Col>
          </React.Fragment>
        ))}
        <Col xs={24} md={8}>
          <Form.Item label="Total Booking Amount (₹)">
            <InputNumber
              size={ctlSize}
              style={{ width: "100%" }}
              value={bookingTotal}
              disabled
            />
          </Form.Item>
        </Col>
      </Row>

      {/* Submit + Print */}
      <Form.Item style={{ marginTop: 8, marginBottom: 0 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
            gap: 8,
          }}
        >
          <Button
            type="primary"
            htmlType="submit"
            size={isMobile ? "middle" : "large"}
            loading={submitting}
            disabled={actionCooldownUntil > Date.now()}
          >
            Save Booking
          </Button>
          {hasFetchedBooking && (
            <Button
              className="no-print"
              icon={<PrinterOutlined />}
              size={isMobile ? "middle" : "large"}
              onClick={handlePrint}
              disabled={printing}
              loading={printing}
            >
              Print Booking Slip
            </Button>
          )}
        </div>
        {!hasFetchedBooking && (
          <div style={{ marginTop: 6, color: "#b91c1c", fontSize: 12 }}>
            Save first, then fetch booking to enable printing.
            {" "}ಮುದ್ರಣಕ್ಕೆ ಮೊದಲಿಗೆ ಉಳಿಸಿ, ನಂತರ ಫೆಚ್ ಮಾಡಿ.
          </div>
        )}
      </Form.Item>
    </Form>
  );

  if (asModal) {
    return <div style={{ paddingTop: 4 }}>{formNode}</div>;
  }

  return (
    <div
      style={{
        padding: isMobile ? 12 : isTabletOnly ? 18 : 24,
        background: isMobile
          ? "transparent"
          : "linear-gradient(180deg,#f8fbff 0%,#ffffff 100%)",
        minHeight: "100dvh",
        display: "grid",
        alignItems: "start",
        position: "relative",
      }}
    >
      {autoFetchLoading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            background: "rgba(255,255,255,0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Spin tip="Fetching booking details..." size="large" />
        </div>
      )}
      <Card
        bordered={false}
        style={{
          width: "100%",
          maxWidth: 920,
          margin: isMobile ? "8px auto 24dvh" : "16px auto",
          borderRadius: 16,
          boxShadow:
            "0 10px 30px rgba(37, 99, 235, 0.10), 0 2px 8px rgba(0,0,0,0.06)",
        }}
        bodyStyle={{ padding: isMobile ? 16 : 28 }}
        headStyle={{
          borderBottom: "none",
          padding: isMobile ? "12px 16px 0" : "16px 28px 0",
        }}
        title={
          <div
            style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: isMobile ? 'wrap' : 'nowrap' }}
          >
            {headerBadge}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
                Two Wheeler Booking
              </Title>
              <Text type="secondary">
                Fill the details below to reserve your ride.
              </Text>
            </div>
            <div style={{ flex: 1 }} />
            <Space size={8} wrap>
              <FetchBooking
                form={form}
                webhookUrl={BOOKING_GAS_URL}
                setSelectedCompany={setSelectedCompany}
                setSelectedModel={setSelectedModel}
                onApplied={handleBookingApplied}
                autoSearch={autoFetchRequest}
              />
              <BookingHistoryButton
                form={form}
                webhookUrl={BOOKING_GAS_URL}
                bookingId={editRef?.bookingId}
                mobile={editRef?.mobile}
              />
            </Space>
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

// Lightweight modal to attach extra documents to an existing booking
function AttachDocument({ webhookUrl }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [bookingId, setBookingId] = useState("");
  const [mobile, setMobile] = useState("");
  const [docType, setDocType] = useState("");
  const [existing, setExisting] = useState([]);

  const clear = () => {
    setFileList([]);
    setBookingId("");
    setMobile("");
    setDocType("");
    setExisting([]);
  };

  const uploadOnly = async (file) => {
    const fd = new FormData();
    fd.append("action", "upload");
    if (BOOKING_GAS_SECRET) fd.append("secret", BOOKING_GAS_SECRET);
    fd.append(
      "file",
      file?.originFileObj || file,
      file?.name || "document.pdf"
    );
    try {
      const resp = await fetch(webhookUrl, {
        method: "POST",
        body: fd,
        credentials: "omit",
      });
      let js = null;
      try { js = await resp.json(); } catch { js = null; }
      if (js && (js.ok || js.success)) return js;
      throw new Error("Upload failed");
    } catch (e) {
      // Fallback: base64 through webhook proxy
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          const origin = file?.originFileObj || file;
          reader.onload = () => {
            const s = String(reader.result || "");
            const idx = s.indexOf(",");
            resolve(idx >= 0 ? s.slice(idx + 1) : s);
          };
          reader.onerror = reject;
          reader.readAsDataURL(origin);
        });
        const payload = BOOKING_GAS_SECRET
          ? { action: "upload_base64", name: file?.name || "document.pdf", base64, secret: BOOKING_GAS_SECRET }
          : { action: "upload_base64", name: file?.name || "document.pdf", base64 };
        const resp2 = await saveBookingViaWebhook({ webhookUrl, method: "POST", payload });
        const js2 = resp2?.data || resp2;
        if (js2 && (js2.ok || js2.success)) return js2;
      } catch {
        //FJF
      }
      throw e;
    }
  };

  const fetchExisting = async () => {
    try {
      if (!webhookUrl) return;
      const mode = bookingId ? "booking" : mobile ? "mobile" : null;
      const query = bookingId || mobile;
      if (!mode || !query) return;
      const resp = await saveBookingViaWebhook({
        webhookUrl,
        method: "GET",
        payload: { action: "search", mode, query },
      });
      const j = resp?.data || resp;
      const rows = Array.isArray(j?.rows) ? j.rows : [];
      const p = rows[0]?.payload || rows[0] || {};
      const filesArr = Array.isArray(p.attachments)
        ? p.attachments
        : Array.isArray(p.files)
        ? p.files
        : [];
      const single =
        p.file && (p.file.url || p.fileId) ? [p.file] : [];
      const links = [...filesArr, ...single]
        .map((x) => ({
          name: x.name || "Document",
          url: x.url,
          fileId: x.fileId,
        }))
        .filter((x) => x.url || x.fileId);
      setExisting(links);
    } catch {
      setExisting([]);
    }
  };

  const onAttach = async () => {
    try {
      if (!webhookUrl) throw new Error("Webhook not configured");
      const f = (fileList || [])[0];
      if (!f) throw new Error("Please choose a PDF");
      if (!bookingId && !mobile)
        throw new Error("Enter Booking ID or Mobile");
      if (!docType) throw new Error("Pick document type");

      setLoading(true);
      const up = await uploadOnly(f);
      const payload = {
        action: "attach",
        bookingId: bookingId || undefined,
        mobile: mobile || undefined,
        type: docType,
        name: f.name,
        url: up.url,
        fileId: up.fileId,
        append: false, // replace any previous attachment link
        ts: dayjs().toISOString(),
      };
      const resp = await saveBookingViaWebhook({
        webhookUrl,
        method: "POST",
        payload,
      });
      const ok = (resp?.data || resp)?.success !== false;
      if (!ok)
        throw new Error(
          String((resp?.data || resp)?.message || "Attach failed")
        );
      message.success("Attachment saved to booking.");
      setOpen(false);
      clear();
    } catch (e) {
      message.error(String(e?.message || e || "Attach failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
          setTimeout(fetchExisting, 50);
        }}
      >
        Attach Document
      </Button>
      <Modal
        title="Attach Document to Booking"
        open={open}
        onCancel={() => {
          setOpen(false);
          clear();
        }}
        onOk={onAttach}
        okText={loading ? "Saving..." : "Save"}
        confirmLoading={loading}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input
            placeholder="Booking ID (optional)"
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
          />
          <Input
            placeholder="Mobile (10 digits, optional)"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
          <Button onClick={fetchExisting} size="small">
            Fetch existing attachments
          </Button>
          {existing.length > 0 && (
            <div style={{ fontSize: 12, color: "#555" }}>
              <div
                style={{
                  fontWeight: 600,
                  margin: "4px 0",
                }}
              >
                Existing attachments:
              </div>
              <ul>
                {existing.map((x, i) => (
                  <li key={`${x.fileId || x.url || i}`}>
                    <a
                      href={
                        x.url ||
                        `https://drive.google.com/file/d/${x.fileId}/view`
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      {x.name || `Document ${i + 1}`}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Select
            placeholder="Document Type"
            value={docType}
            onChange={setDocType}
            style={{ width: "100%" }}
            options={[
              { value: "RentalAgreement", label: "Rental Agreement" },
              { value: "GasBill", label: "Gas Bill" },
              { value: "DL", label: "Driving License" },
              { value: "Others", label: "Others" },
            ]}
          />
          <Dragger
            multiple={false}
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList }) =>
              setFileList(fileList.slice(0, 1))
            }
            maxCount={1}
            accept=".pdf"
            itemRender={(origin) => origin}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">
              Upload the document in PDF format.
            </p>
            <p className="ant-upload-hint">
              Maximum size 5MB. PDFs only.
            </p>
          </Dragger>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Saving will replace the previous link in the sheet with this new document.
          </div>
        </Space>
      </Modal>
    </>
  );
}
