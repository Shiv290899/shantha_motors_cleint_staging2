// QuotationOnePage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import {
  Row, Col, Form, Input, InputNumber, Select, Button, Radio, message, Checkbox, Divider, DatePicker, Switch
} from "antd";
import { PrinterOutlined, PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import FetchQuot from "./FetchQuot"; // for fetching saved quotations
import { GetCurrentUser } from "../apiCalls/users";
import { getBranch, listBranchesPublic } from "../apiCalls/branches";
import { listUsersPublic } from "../apiCalls/adminUsers";
import { saveBookingViaWebhook, reserveQuotationSerial } from "../apiCalls/forms";
// GAS webhook for Quotation save/search/nextSerial
// Default set in code so it works even without env var
const DEFAULT_QUOT_GAS_URL =
  "https://script.google.com/macros/s/AKfycby0YV2E2Ryb4YehYRzBistMW4sWN3XDcqaEfgkfRvEjmaKNVKq2Ubi3ul50AbxO6TVPJA/exec";
const QUOT_GAS_URL = import.meta.env.VITE_QUOTATION_GAS_URL || DEFAULT_QUOT_GAS_URL;


/* ======================
   APPS SCRIPT INTEGRATION
   ====================== */

// Vehicle catalog CSV (for auto Company/Model/Variant/On-Road Price)
const CATALOG_CSV_URL =
  import.meta.env.VITE_VEHICLE_SHEET_CSV_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQsXcqX5kmqG1uKHuWUnBCjMXBugJn7xljgBsRPIm2gkk2PpyRnEp8koausqNflt6Q4Gnqjczva82oN/pub?output=csv";

const HEADERS = {
  company: ["Company", "Company Name"],
  model: ["Model", "Model Name"],
  variant: ["Variant"],
  price: ["On-Road Price", "On Road Price", "Price"],
};

// Minimal CSV parser (RFC4180-ish)
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

const fetchSheetRowsCSV = async (url) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Sheet fetch failed");
  const csv = await res.text();
  if (csv.trim().startsWith("<")) throw new Error("Expected CSV, got HTML");
  const rows = parseCsv(csv);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => (h || "").trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = r[i] ?? ""));
    return obj;
  });
};

const pick = (row, keys) =>
  String(keys.map((k) => row[k] ?? "").find((v) => v !== "") || "").trim();

const normalizeSheetRow = (row = {}) => ({
  company: pick(row, HEADERS.company),
  model: pick(row, HEADERS.model),
  variant: pick(row, HEADERS.variant),
  onRoadPrice:
    Number(String(pick(row, HEADERS.price) || "0").replace(/[",\s₹]/g, "")) || 0,
});

// CSV vehicle sheet integration removed

/* ======================
   CONFIG + STATIC OPTIONS
   ====================== */
const PROCESSING_FEE = 8000;
const RATE_LOW = 9;
const RATE_HIGH = 11;

const EXECUTIVES = [
  { name: "Rukmini", phone: "9901678562" },
  { name: "Meghana", phone: "9741609799" },
  { name: "Shubha", phone: "8971585057" },
  { name: "Rani", phone: "9108970455" },
  { name: "Likhitha", phone: "9535190015" },
  { name: "Vanitha", phone: "9380729861" },
  { name: "Prakash", phone: "9740176476" },
  { name: "Swathi", phone: "6363116317" },
  { name: "Kumar", phone: "7975807667" },
  { name: "Sujay", phone: "7022878048" },
  { name: "Kavi", phone: "9108970455" },
  { name: "Narasimha", phone: "9900887666" },
  { name: "Kavya", phone: "8073165374" },
];


/* ======================
   SERIAL NUMBER (SEQUENTIAL)
   ====================== */







// Reserve a server serial tied to the customer's mobile (idempotent)
async function reserveNextQuotationSerial(mobile, branchCode, branchId) {
  try {
    const resp = await reserveQuotationSerial(mobile, branchCode, branchId);
    if (resp?.success && resp?.serial) return String(resp.serial);
  } catch (err) {
    console.error("Failed to reserve quotation serial via API", err);
  }
  return dayjs().format("YYMMDDHHmmss");
}

const SCOOTER_OPTIONS = [
  "All Round Guard",
  "Side Stand",
  "Ladies Foot Rest",
  "Grip Cover",
  "Seat Cover",
  "Floor Mat",
  "ISI Helmet",
];

const MOTORCYCLE_OPTIONS = [
  "Crash Guard",
  "Engine Guard",
  "Tank Cover",
  "Ladies Handle",
  "Gripper",
  "Seat Cover",
  "ISI Helmet",
];

const DOCS_REQUIRED = [
  "Aadhar Card",
  "Pan Card",
  "Bank Passbook",
  "ATM Card",
  "Local Address Proof",
];

const MEGHANA_NAME = "Meghana";
const BRANCH_NAME = "Byadarahalli";

/* ======================
   HELPERS
   ====================== */
const phoneRule = [
  { required: true, message: "Mobile number is required" },
  { pattern: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit Indian mobile number" },
];

const inr0 = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(n || 0)));

// Save via Apps Script Web App (proxied through backend to avoid CORS)
const submitToWebhook = async (data) => {
  // Optional integration: if URL isn’t configured, treat as offline success.
  if (!QUOT_GAS_URL) {
    return { success: true, offline: true };
  }
  const resp = await saveBookingViaWebhook({
    webhookUrl: QUOT_GAS_URL,
    method: "POST",
    payload: { action: "save", data },
  });
  return resp;
};



/* ======================
   SMALL UTIL FOR VEHICLE RECORDS
   ====================== */
const makeEmptyVehicle = () => ({
  company: "",
  model: "",
  variant: "",
  onRoadPrice: 0,
  downPayment: 0,
  emiSet: "12",
});

/* ======================
   CORE MANDATORY VALIDATION
   ====================== */
const CORE_KEYS = [
  "branch",
  "executive",
  "name",
  "mobile",
  "company",
  "bikeModel",
  "variant",
  "onRoadPrice",
  
];

const scrollToFirstError = (form, errInfo) => {
  const first = errInfo?.errorFields?.[0]?.name;
  if (first?.length) {
    form.scrollToField(first, { behavior: "smooth", block: "center" });
  }
};

const validateCore = async (form) => {
  const values = await form.validateFields(CORE_KEYS);

  const price = Number(values?.onRoadPrice || 0);
  if (!(price > 0)) throw new Error("On-Road Price must be greater than 0.");

  if (!/^[6-9]\d{9}$/.test(String(values?.mobile || ""))) {
    throw new Error("Enter a valid 10-digit Indian mobile number.");
  }
  return values;
};

/* ======================
   COMPONENT
   ====================== */
export default function Quotation() {
  const [form] = Form.useForm();

  const [brand, setBrand] = useState("SHANTHA"); // "SHANTHA" | "NH"

  const [bikeData, setBikeData] = useState([]);
  const [company, setCompany] = useState("");
  const [model, setModel] = useState("");
  const [variant, setVariant] = useState("");

  const [lastSavedAt, setLastSavedAt] = useState(0);
  const [actionCooldownUntil, setActionCooldownUntil] = useState(0);
  const startActionCooldown = (ms = 6000) => {
    const until = Date.now() + ms;
    setActionCooldownUntil(until);
    setTimeout(() => setActionCooldownUntil(0), ms + 50);
  };

  const [onRoadPrice, setOnRoadPrice] = useState(0);
  // Manual mode can be toggled; default to auto (sheet) when available
  const [manual, setManual] = useState(false);
  const [sheetOk, setSheetOk] = useState(false);
  const [mode, setMode] = useState("loan");
  const [emiSet, setEmiSet] = useState("12");
  const tenures = useMemo(
    () => (emiSet === "12" ? [12, 18, 24, 36] : [24, 30, 36, 48]),
    [emiSet]
  );

  const [downPayment, setDownPayment] = useState(0);
  const [busy, setBusy] = useState(false); // disable actions while saving
  const [printing, setPrinting] = useState(false); // lock Print until window opens
  const savingRef = useRef(false);
  const [vehicleType, setVehicleType] = useState("scooter");
  const [fittings, setFittings] = useState(["Side Stand", "Floor Mat", "ISI Helmet", "Grip Cover"]);
  const [docsReq, setDocsReq] = useState(DOCS_REQUIRED);
  const [extraVehicles, setExtraVehicles] = useState([]); // up to 2 records (V2, V3)
  const [userStaffName, setUserStaffName] = useState();
  const [, setUserRole] = useState();
  // Defaults for restore if fields get cleared
  const [defaultBranchName, setDefaultBranchName] = useState("");
  const [allowedBranches, setAllowedBranches] = useState([]); // [{id,name,code}]
  const [canSwitch, setCanSwitch] = useState(false);
  const [defaultExecutiveName, setDefaultExecutiveName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [branchId, setBranchId] = useState("");
  const [execOptions, setExecOptions] = useState([]); // [{name, phone}]
  // Follow-up
  const [followUpEnabled, setFollowUpEnabled] = useState(true);
  const [followUpAt, setFollowUpAt] = useState(() => dayjs().add(2, 'day').hour(10).minute(0).second(0).millisecond(0));
  const [followUpNotes, setFollowUpNotes] = useState("");

  // Outbox for optimistic background submission (local-only)
  const OUTBOX_KEY = 'Quotation:outbox';
  const readJson = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
  const writeJson = (k, obj) => { try { localStorage.setItem(k, JSON.stringify(obj)); } catch {
    //sdjkkd
  } };
  const enqueueOutbox = (job) => { const box = readJson(OUTBOX_KEY, []); const item = { id: Date.now()+':' + Math.random().toString(36).slice(2), job }; box.push(item); writeJson(OUTBOX_KEY, box); return item.id; };
  const removeOutboxById = (id) => { const box = readJson(OUTBOX_KEY, []); writeJson(OUTBOX_KEY, box.filter(x=>x.id!==id)); };

  const retryOutbox = async () => {
    try {
      const box = readJson(OUTBOX_KEY, []);
      if (!Array.isArray(box) || !box.length) return;
      for (const item of box) {
        const j = item.job || {};
        try {
          if (j.type === 'quot' && QUOT_GAS_URL) {
            const resp = await saveBookingViaWebhook({ webhookUrl: QUOT_GAS_URL, method: 'POST', payload: { action: 'save', data: j.data } });
            const ok = (resp?.data || resp)?.success !== false;
            if (!ok) throw new Error('Webhook save failed');
            removeOutboxById(item.id);
          }
        } catch {
          // keep for next retry
        }
      }
    } catch {
      //hiasfhahsf
      }
  };

  useEffect(() => { setTimeout(() => { retryOutbox(); }, 0); }, []);
  useEffect(() => { const onOnline = () => retryOutbox(); window.addEventListener('online', onOnline); return () => window.removeEventListener('online', onOnline); }, []);

  const executiveName = Form.useWatch("executive", form) || userStaffName || "";
  // Restore defaults if branch/executive get cleared by a reset or fetch
  const watchedBranch = Form.useWatch('branch', form);
  const watchedExec = Form.useWatch('executive', form);
  useEffect(() => {
    const patch = {};
    if (!watchedBranch && defaultBranchName) patch.branch = defaultBranchName;
    if (!watchedExec && defaultExecutiveName) patch.executive = defaultExecutiveName;
    if (Object.keys(patch).length) form.setFieldsValue(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedBranch, watchedExec, defaultBranchName, defaultExecutiveName]);

  // ✅ antd message instance + helper to ensure popup shows before opening new tab/print
  const [msgApi, msgCtx] = message.useMessage();
  const toastSaved = async (txt = "Saved successfully") => {
    msgApi.destroy("save");
    msgApi.open({ key: "save", type: "success", content: txt, duration: 1.5 });
    await new Promise((r) => setTimeout(r, 300));
  };

  const pageRef = useRef(null);
  const printDate = useMemo(() => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }, []);

  // helper to make image paths absolute for the print iframe + cache-bust
  const absBust = (p) => {
    const src = p?.startsWith("http") ? p : `${window.location.origin}${p || ""}`;
    const v = Date.now();
    return src.includes("?") ? `${src}&v=${v}` : `${src}?v=${v}`;
  };

  useEffect(() => {
    (async () => {
      // Prefill executive + branch from logged-in user (staff)
      try {
        const readLocalUser = () => {
          try { const raw = localStorage.getItem('user'); return raw ? JSON.parse(raw) : null; } catch { return null; }
        };
        const _pickId = (v) => {
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
            try { localStorage.setItem('user', JSON.stringify(user)); } catch {
              //uhy
            }
          }
        }
        if (user) {
          const staffName = user?.formDefaults?.staffName || user?.name || undefined;
          const role = user?.role ? String(user.role).toLowerCase() : undefined;
          // who can switch branches
          const can = Boolean(user?.canSwitchBranch) || ["owner","admin"].includes(String(role||'').toLowerCase());
          setCanSwitch(can);
          // Build allowed branch list
          try {
            const roleLc = String(role || '').toLowerCase();
            if (["owner","admin"].includes(roleLc)) {
              // Owners/Admins: all branches from server
              const res = await listBranchesPublic({ limit: 500 });
              if (res?.success && Array.isArray(res?.data?.items)) {
                const all = res.data.items.map((b) => ({ id: String(b.id || b._id || ''), name: b.name, code: b.code ? String(b.code).toUpperCase() : '' }));
                setAllowedBranches(all);
              }
              // Also load staff list for Executive dropdown
              try {
                const users = await listUsersPublic({ role: 'staff', status: 'active', limit: 100000 });
                if (users?.success && Array.isArray(users?.data?.items)) {
                  const items = users.data.items.map((u) => ({ name: u.name, phone: u.phone || '' }));
                  setExecOptions(items);
                }
              } catch { /* ignore */ }
            } else {
              // Staff: only own + additional branches
              const list = [];
              const push = (b) => {
                if (!b) return;
                const id = (b && (b._id || b.id || b.$oid || b)) || '';
                const name = typeof b === 'string' ? '' : (b?.name || '');
                const code = typeof b === 'string' ? '' : (b?.code || '');
                if (!id || !name) return;
                list.push({ id: String(id), name: String(name), code: code ? String(code).toUpperCase() : '' });
              };
              if (user?.primaryBranch) push(user.primaryBranch);
              if (Array.isArray(user?.branches)) user.branches.forEach(push);
              const seen = new Set();
              const uniq = [];
              list.forEach((b) => { if (!seen.has(b.id)) { seen.add(b.id); uniq.push(b); } });
              setAllowedBranches(uniq);
            }
          } catch { /* ignore */ }
          let branchName = user?.formDefaults?.branchName;
          const codeFromUser = (user?.formDefaults?.branchCode && String(user.formDefaults.branchCode).toUpperCase()) || '';
          if (codeFromUser) { setBranchCode(codeFromUser); try { form.setFieldsValue({ branchCode: codeFromUser }); } catch {
            //iuf
          } }
          // Always try to resolve branch code via branchId if available
          const branchIdLocal = (user?.formDefaults && (user.formDefaults.branchId?._id || user.formDefaults.branchId || null))
            || (user?.primaryBranch && (user.primaryBranch?._id || user.primaryBranch || null))
            || (Array.isArray(user?.branches) && user.branches.length ? (user.branches[0]?._id || user.branches[0] || null) : null);

          if (branchIdLocal) {
            try {
              const br = await getBranch(String(branchIdLocal)).catch(() => null);
              if (br?.success && br?.data) {
                if (!branchName) branchName = br.data.name;
                if (br?.data?.code && !branchCode) {
                  const code = String(br.data.code).toUpperCase();
                  setBranchCode(code);
                  setBranchId(String(br.data.id || branchIdLocal));
                  try { form.setFieldsValue({ branchCode: code }); } catch {
                    //gufg
                  }
                }
              }
            } catch { /* ignore */ }
          }
          if (staffName) setUserStaffName(staffName);
          if (role) setUserRole(role);
          const patch = {};
          if (staffName) patch.executive = staffName;
          if (branchName) patch.branch = branchName;
          if (Object.keys(patch).length) form.setFieldsValue(patch);
          if (branchName) setDefaultBranchName(branchName);
          if (staffName) setDefaultExecutiveName(staffName);
        }
      } catch {
        // ignore
      }

      // Load vehicle catalog sheet
      try {
        const raw = await fetchSheetRowsCSV(CATALOG_CSV_URL);
        const cleaned = raw
          .map(normalizeSheetRow)
          .filter((r) => r.company && r.model && r.variant);
        if (!cleaned.length) {
          msgApi.warning("Sheet loaded but no valid rows. Switching to manual entry.");
          setManual(true);
          setSheetOk(false);
          return;
        }
        setBikeData(cleaned);
        setSheetOk(true);
        setManual(false);
      } catch {
        msgApi.warning("Could not load vehicle sheet. Switched to manual entry.");
        setManual(true);
        setSheetOk(false);
      }
    })();
  }, [msgApi]);

  // Removed serial prefetch to avoid accidental increments on refresh

  const branchMapByName = React.useMemo(() => {
    const m = new Map();
    (allowedBranches || []).forEach((b) => m.set(String(b.name || '').toLowerCase(), b));
    return m;
  }, [allowedBranches]);

  const onBranchChange = (name) => {
    try {
      const key = String(name || '').toLowerCase();
      const b = branchMapByName.get(key);
      if (b) {
        setBranchId(b.id);
        if (b.code) setBranchCode(String(b.code).toUpperCase());
        try { form.setFieldsValue({ branch: b.name, branchCode: b.code ? String(b.code).toUpperCase() : undefined }); } catch {
          //if
        }
      }
    } catch {
      //ignore
    }
  };

  useEffect(() => {
    if (brand === "NH") {
      form.setFieldsValue({ executive: MEGHANA_NAME });
      form.setFieldsValue({ branch: BRANCH_NAME });
    }
  }, [brand, form]);

  useEffect(() => {
    if (vehicleType === "scooter") {
      setFittings(["Side Stand", "Floor Mat", "ISI Helmet", "Grip Cover"]);
    } else {
      setFittings(["Tank Cover", "Gripper", "Seat Cover", "ISI Helmet"]);
    }
  }, [vehicleType]);

  const companies = useMemo(
    () => [...new Set(bikeData.map((r) => r.company))],
    [bikeData]
  );
  const models = useMemo(
    () => [...new Set(bikeData.filter((r) => r.company === company).map((r) => r.model))],
    [bikeData, company]
  );
  const variants = useMemo(
    () => [
      ...new Set(
        bikeData.filter((r) => r.company === company && r.model === model).map((r) => r.variant)
      ),
    ],
    [bikeData, company, model]
  );

  const handleVariant = (v) => {
    setVariant(v);
    if (!manual) {
      const found = bikeData.find((r) => r.company === company && r.model === model && r.variant === v);
      const price = found?.onRoadPrice || 0;
      form.setFieldsValue({ onRoadPrice: price });
      setOnRoadPrice(price);
      setDownPayment(0);
    }
  };

  // ------ Per-vehicle EMI helpers ------
  const rateFor = (price, dp) => {
    const dpPct = price > 0 ? (dp || 0) / price : 0;
    return dpPct >= 0.3 ? RATE_LOW : RATE_HIGH;
  };
  const monthlyFor = (price, dp, months) => {
    const principalBase = Math.max(Number(price || 0) - Number(dp || 0), 0);
    const principal = principalBase + PROCESSING_FEE;
    const years = months / 12;
    const rate = rateFor(price, dp);
    const totalInterest = principal * (rate / 100) * years;
    const total = principal + totalInterest;
    return months > 0 ? total / months : 0;
  };
  const tenuresForSet = (s) => (s === "12" ? [12, 18, 24, 36] : [24, 30, 36, 48]);

  const safeAutoSave = async () => {
    if (savingRef.current) return null;
    savingRef.current = true;
    setBusy(true);
    try {
      const now = Date.now();
      if (now - lastSavedAt < 6000) return null; // stronger debounce for slow devices
      const result = await handleSaveToForm();   // validates + queues background save
      setLastSavedAt(Date.now());
      return result;
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  };

  // ---------- Android-proof A4 print ----------
  const handlePrint = async () => {
    try {
      if (Date.now() < actionCooldownUntil) return; // ignore rapid re-clicks
      startActionCooldown(6000);
      setPrinting(true);
      // Ensure spinner paints before heavy work
      await new Promise((r) => setTimeout(r, 0));
      await validateCore(form);
      await safeAutoSave();
      await toastSaved("Saved (background sync). Preparing print…");

      const page = pageRef.current;
      if (!page) { window.print(); return; }

      // Ensure latest React commit is flushed
      await new Promise((r) => setTimeout(r, 0));

      const cloned = page.cloneNode(true);

      // canvas -> img (Android print-safe)
      cloned.querySelectorAll("canvas").forEach((cnv) => {
        try {
          const img = document.createElement("img");
          img.alt = cnv.getAttribute("aria-label") || "canvas";
          img.src = cnv.toDataURL("image/png");
          img.style.maxWidth = "100%";
          img.style.height = "auto";
          cnv.parentNode && cnv.parentNode.replaceChild(img, cnv);
        } catch { /* ignore */ }
      });

      // absolute + cache-busted images
      cloned.querySelectorAll("img").forEach((img) => {
        const src = img.getAttribute("src");
        if (src && !src.startsWith("data:")) img.setAttribute("src", absBust(src));
      });

      const PRINT_STYLES = `
        @page { size: A4 portrait; margin: 0; }
        html, body {
          margin: 0 !important; padding: 0 !important; background: #fff !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
          font-family: Arial, sans-serif;
        }
        * { box-sizing: border-box; }
        .print-wrap { margin: 0 auto; }
        .page { width: 210mm; min-height: 297mm; padding: 12mm; background: #fff !important; }
        .sheet { width: 100%; font: 12pt/1.32 Arial, sans-serif; color: #111; page-break-inside: avoid; }
        .row2 { display: grid; grid-template-columns: 0.8fr 1.4fr; gap: 8px 16px; }
        .row3 { display: grid; grid-template-columns: 0.5fr 0.8fr 1fr; gap: 10px 16px; }
        .box { border: 2px solid #000; border-radius: 6px; padding: 8px 10px; background: #fff; }
        .plist { margin: 0; padding-left: 18px; } .plist li { margin: 0 0 2px; }
        .title-knhonda { font-size: 30pt; font-weight: 900; letter-spacing: .2px; }
        .title-kn { font-size: 32pt; font-weight: 500; letter-spacing: .2px; }
        .title-en { font-size: 18pt; font-weight: 600; margin-top: 2px; }
        .big-price { font-size: 16pt; font-weight: 900; }
        .addr-line { font-size: 11pt; } .addr-linehonda { font-size: 12pt; }
        .hdr-line { display:flex; align-items:center; border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:8px; }
        .hdr-title { flex: 1; display: flex; justify-content: center; }
        .quo-box { font-size: 17pt; border: 2px solid #000; padding: 4px 10px; font-weight: 800; display: inline-block; }
        .hdr-right { text-align: right; font-weight: 600; }
        .emibox { border: 2px solid #000; border-radius: 8px; padding: 6px 10px; text-align: center; }
        .section-title { font-size: 14pt; font-weight: 900; margin-bottom: 4px; }
        img { max-width: 100%; height: auto; background: transparent; }
        @media print {
          * { transform: none !important; }
          .fixed, .sticky, [style*="position: sticky"], [style*="position: fixed"] { position: static !important; }
          .no-print { display: none !important; }
        }
      `;

      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      if (isMobile) {
        const win = window.open("", "_blank");
        if (!win) { msgApi.error("Please allow pop-ups to print."); return; }
        const doc = win.document;

        doc.open();
        doc.write(`
          <!doctype html>
          <html>
          <head>
            <meta charset="utf-8"/>
            <meta name="viewport" content="width=device-width, initial-scale=1"/>
            <base href="${location.origin}${location.pathname}">
            <title>Quotation</title>
            <style>${PRINT_STYLES}</style>
          </head>
          <body>
            <div class="print-wrap"></div>
          </body>
          </html>
        `);
        doc.close();

        const mount = doc.querySelector(".print-wrap");
        const node = doc.importNode(cloned, true);
        mount.appendChild(node);

        const waitForAssets = async () => {
          const imgs = Array.from(doc.images || []);
          await Promise.all(
            imgs.map((img) =>
              (img.complete && img.naturalWidth)
                ? Promise.resolve()
                : new Promise((res) => { img.onload = img.onerror = () => res(); })
            )
          );
          if (doc.fonts && doc.fonts.ready) { try { await doc.fonts.ready; } catch {
            // ignore
          } }
          await new Promise((res) => setTimeout(res, 200));
        };

        await waitForAssets();
        try { win.focus(); } catch {
          //
        }
        win.print();
        setTimeout(resetForm, 1000);
        return;
      }

      // Desktop: iframe flow
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.setAttribute("aria-hidden", "true");
      document.body.appendChild(iframe);

      const win = iframe.contentWindow;
      const doc = win.document;

      doc.open();
      doc.write(`
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1"/>
          <base href="${location.origin}${location.pathname}">
          <title>Quotation</title>
          <style>${PRINT_STYLES}</style>
        </head>
        <body>
          <div class="print-wrap"></div>
        </body>
        </html>
      `);
      doc.close();

      const mount = doc.querySelector(".print-wrap");
      mount.appendChild(doc.importNode(cloned, true));

      const waitForAssets = async () => {
        const imgs = Array.from(doc.images || []);
        await Promise.all(
          imgs.map((img) =>
            (img.complete && img.naturalWidth)
              ? Promise.resolve()
              : new Promise((res) => { img.onload = img.onerror = () => res(); })
          )
        );
        if (doc.fonts && doc.fonts.ready) { try { await doc.fonts.ready; } catch {
          // ignore
        } }
        await new Promise((res) => setTimeout(res, 200));
      };

      try {
        await waitForAssets();
        try { win.focus(); } catch {
          //console.log(err)
        }
        try { win.print(); } catch { window.print(); }
        setTimeout(resetForm, 1000);
      } finally {
        setTimeout(() => { iframe.parentNode && iframe.parentNode.removeChild(iframe); }, 800);
      }
    } catch (e) {
      msgApi.warning(e?.message || "Fix the highlighted fields before printing.");
      try {
        await form.validateFields(CORE_KEYS);
      } catch (errInfo) {
        scrollToFirstError(form, errInfo);
      }
      return;
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintRef = useRef(handlePrint);
  useEffect(() => {
    handlePrintRef.current = handlePrint;
  });

  // Capture Ctrl/Cmd + P and route to handlePrint
  useEffect(() => {
    const onKeyDown = (e) => {
      const isPrintShortcut =
        (e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P");
      if (isPrintShortcut) {
        e.preventDefault();
        handlePrintRef.current?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Keep local state in sync with Form for fields we mirror (onRoadPrice)
  const onValuesChange = (_, all) => {
    if (typeof all?.onRoadPrice !== "undefined") {
      setOnRoadPrice(Number(all.onRoadPrice || 0));
      if (downPayment > Number(all.onRoadPrice || 0)) {
        setDownPayment(Number(all.onRoadPrice || 0));
      }
    }
    if (typeof all?.downPayment !== "undefined") {
      // keep form field and local state in sync
      const n = Number(all.downPayment || 0);
      setDownPayment(n);
    }
  };

  const resetForm = () => {
    form.resetFields();
    setBrand("SHANTHA");
    setCompany("");
    setModel("");
    setVariant("");
    setOnRoadPrice(0);
    setManual(!sheetOk);
    setMode("loan");
    setEmiSet("12");
    setDownPayment(0);
    setVehicleType("scooter");
    setFittings(["Side Stand", "Floor Mat", "ISI Helmet", "Grip Cover"]);
    setDocsReq(DOCS_REQUIRED);
    setExtraVehicles([]);
    setFollowUpEnabled(true);
    setFollowUpAt(dayjs().add(2, 'day').hour(10).minute(0).second(0).millisecond(0));
    setFollowUpNotes("");

    // Restore default branch and executive
    const patch = {};
    if (defaultBranchName) patch.branch = defaultBranchName;
    if (defaultExecutiveName) patch.executive = defaultExecutiveName;
    if (Object.keys(patch).length) form.setFieldsValue(patch);
    msgApi.success("Form has been reset for a new quotation.");
  };

  /* ======================
     LIVE "canAct" DISABLING
     ====================== */
  const wBranch = Form.useWatch("branch", form);
  const wExec   = Form.useWatch("executive", form);
  const wName   = Form.useWatch("name", form);
  const wMobile = Form.useWatch("mobile", form);
  const wComp   = Form.useWatch("company", form);
  const wModel  = Form.useWatch("bikeModel", form);
  const wVar    = Form.useWatch("variant", form);
  const wPrice  = Form.useWatch("onRoadPrice", form);

  const canAct = useMemo(() => {
    const mobileOk = /^[6-9]\d{9}$/.test(String(wMobile || ""));
    const priceOk  = Number(wPrice || 0) > 0;
    return Boolean(
      wBranch && wExec && wName && mobileOk &&
      wComp && wModel && wVar && priceOk
    );
  }, [wBranch, wExec, wName, wMobile, wComp, wModel, wVar, wPrice]);

  /* ======================
     SAVE -> ASSIGN NEXT SERIAL -> SUBMIT
     ====================== */
  const handleSaveToForm = async () => {
    try {
      await validateCore(form);
    } catch (err) {
      message.error(err?.message || "Please complete all required fields.");
      try {
        await form.validateFields(CORE_KEYS);
      } catch (errInfo) {
        scrollToFirstError(form, errInfo);
      }
      throw err;
    }

    // Do NOT require serialNo; we're going to assign it now
    const v = await form.validateFields([
      "name", "mobile", "address",
      "company", "bikeModel", "variant", "onRoadPrice", "executive", "remarks", "branch",
      ...(mode === 'loan' ? ["downPayment"] : []),
    ]);

    // validate extra vehicles if present
    for (let i = 0; i < extraVehicles.length; i++) {
      const ev = extraVehicles[i];
      if (!ev.company || !ev.model || !ev.variant || !ev.onRoadPrice) {
        throw new Error(`Please complete Vehicle ${i + 2} before saving.`);
      }
      if (mode === 'loan') {
        const dp = Number(ev.downPayment || 0);
        if (!(dp > 0)) throw new Error(`Enter down payment for Vehicle ${i + 2} (loan)`);
        if (dp > Number(ev.onRoadPrice || 0)) throw new Error(`Down payment for Vehicle ${i + 2} cannot exceed its on-road price`);
      }
    }

    // Ensure we have a server-issued serial (branch-coded). Replace stale numeric serials.
    let serial = String(form.getFieldValue('serialNo') || '').trim();
    const qPattern = /^Q-[A-Z]+-[A-Z0-9]{6}$/;
    if (!serial || !qPattern.test(serial)) {
      try {
        const next = await reserveNextQuotationSerial(
          v.mobile,
          branchCode || (form.getFieldValue('branchCode') || '').toUpperCase(),
          branchId
        );
        serial = next;
        form.setFieldsValue({ serialNo: serial });
      } catch {
        serial = dayjs().format('YYMMDDHHmmss');
        form.setFieldsValue({ serialNo: serial });
      }
    }
    v.serialNo = serial;

    // Build compact Remarks
    const labelOf = (c, m, vv) => [c, m, vv].filter(Boolean).join(" ");
    const vehicleLines = [];
    {
      const c = v.company || "";
      const m = v.bikeModel || "";
      const varnt = v.variant || "";
      const label = labelOf(c, m, varnt);
      if (label) vehicleLines.push(`V1: ${label}`);
    }
    extraVehicles.forEach((ev, i) => {
      const label = labelOf(ev.company || "", ev.model || "", ev.variant || "");
      if (label) vehicleLines.push(`V${i + 2}: ${label}`);
    });
    const fittingsLine = Array.isArray(fittings) && fittings.length
      ? `Fittings: ${Array.from(new Set(fittings.filter(Boolean))).join(", ")}`
      : "";
    const mergedRemarks = [
      String(v.remarks || "").trim(),
      ...vehicleLines,
      fittingsLine
    ].filter(Boolean).join(" | ");

    // Build payload AFTER we have v and mergedRemarks
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      brand,                // "SHANTHA" | "NH"
      mode,                 // "cash" | "loan"
      vehicleType,          // "scooter" | "motorcycle"
      fittings,             // array of strings
      docsReq,              // array of strings
      emiSet,               // "12" | "48"
      downPayment,          // number for Vehicle 1
      onRoadPrice,          // number for Vehicle 1 (mirror state)
      company,              // Vehicle 1 (mirror states)
      model,
      variant,
      followUp: {
        enabled: Boolean(followUpEnabled),
        at: followUpEnabled && followUpAt && dayjs(followUpAt).isValid() ? dayjs(followUpAt).toISOString() : null,
        notes: String(followUpNotes || ""),
        assignedTo: v.executive || userStaffName || "",
        branch: v.branch || "",
        customer: { name: v.name || "", mobile: v.mobile || "" },
        status: 'pending',
      },
      formValues: {
        serialNo: v.serialNo,
        name: v.name,
        mobile: v.mobile,
        address: v.address,
        company: v.company,
        bikeModel: v.bikeModel,
        variant: v.variant,
        onRoadPrice: v.onRoadPrice,
        executive: v.executive,
        remarks: mergedRemarks,
        branch: v.branch || "",
      },
      extraVehicles,        // [{company, model, variant, onRoadPrice, downPayment, emiSet}, ...]
    };
     // kept in case of debugging
    // Queue background save to Apps Script via webhook
    const data = {
      serialNo: v.serialNo,
      formValues: {
        name: v.name,
        mobile: v.mobile,
        address: v.address,
        company: v.company,
        bikeModel: v.bikeModel,
        variant: v.variant,
        onRoadPrice: v.onRoadPrice,
        executive: v.executive,
        remarks: mergedRemarks,
        branch: v.branch || "",
      },
      payload,
    };
    const outboxId = enqueueOutbox({ type: 'quot', data });
    setTimeout(async () => {
      try {
        const resp = await submitToWebhook(data);
        const ok = (resp?.data || resp)?.success !== false;
        if (ok) removeOutboxById(outboxId);
      } catch {
        // keep queued
      }
    }, 0);
    return { values: v, queued: true };
  };

  // --------- WhatsApp deep-link ----------
  const toE164NoPlusIndia = (raw) => {
    const digits = String(raw || "").replace(/\D/g, "").replace(/^0+/, "");
    if (digits.length === 10) return `91${digits}`;
    if (digits.startsWith("91") && digits.length === 12) return digits;
    return "";
  };

  const handleWhatsAppClick = async () => {
    try {
      if (Date.now() < actionCooldownUntil) return; // ignore rapid re-clicks
      startActionCooldown(6000);
      await validateCore(form);
      // validate + save first (will assign serial)
      await safeAutoSave();
      await toastSaved("Saved (background sync). Opening WhatsApp…");

      const v = form.getFieldsValue(true);
      const phone = toE164NoPlusIndia(v.mobile);
      if (!phone) {
        msgApi.error("Enter a valid 10-digit Indian mobile to open WhatsApp.");
        return;
      }

      const showroomName = (brand === "SHANTHA" ? "Shantha Motors" : "NH Motors");
      const name = (form.getFieldValue("name") || "-").trim();

      // V1 (main)
      const comp1 = (company || form.getFieldValue("company") || "-").trim();
      const mdl1 = (model || form.getFieldValue("bikeModel") || "-").trim();
      const varnt1 = (variant || form.getFieldValue("variant") || "-").trim();
      const price1 = form.getFieldValue("onRoadPrice") ?? onRoadPrice ?? 0;
      const dp1 = downPayment || 0;

      // V2..V3
      const vehicles = [
        { title: "Vehicle 1", company: comp1, model: mdl1, variant: varnt1, price: price1, dp: dp1, emiSet },
        ...extraVehicles.map((ev, i) => ({
          title: `Vehicle ${i + 2}`,
          company: ev.company,
          model: ev.model,
          variant: ev.variant,
          price: ev.onRoadPrice,
          dp: ev.downPayment || 0,
          emiSet: ev.emiSet || "12",
        })),
      ];

      // Resolve executive name & phone for WhatsApp footer
      // Always use the logged-in staff's own name and phone; ignore legacy mappings
      const curUser = (() => { try { return JSON.parse(localStorage.getItem('user')||'null'); } catch { return null; } })();
      const execPhone = String(curUser?.phone || '').replace(/\D/g,'');
      const execNameDisplay = (v.executive || curUser?.formDefaults?.staffName || curUser?.name || executiveName || '-');
      const qDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

      // Header
      const header = [
        `*Hi ${name}, Welcome to ${showroomName}! 🏍️*`,
        `Multi-brand two-wheeler sales, service, spares, exchange, finance & insurance`,
        `*Mob No - 9731366921 / 8073283502*`,
        ``,
        `• *Quotation Date:* ${qDate}`,
      ];

      // Vehicle sections
      const tenuresForSetLocal = (s) => (s === "12" ? [12, 18, 24, 36] : [24, 30, 36, 48]);
      const vblocks = vehicles.map((it) => {
        const tset = tenuresForSetLocal(it.emiSet);
        const emiLines = (mode === "loan")
          ? [
              `   – Down Payment: ${inr0(it.dp || 0)}`,
              ...tset.map((mo) => `   – ${mo} months: ${inr0(monthlyFor(it.price, it.dp || 0, mo))}`)
            ]
          : [];
        return [
          ``,
          `*${it.title}:*`,
          `• *Vehicle:* ${it.company} ${it.model} ${it.variant}`,
          `• *On-Road Price:* ${inr0(it.price)}`,
          ...(mode === "loan" ? [`• *EMI Options (approx.):*`, ...emiLines] : []),
        ].join("\n");
      });

      // Fittings + Docs
      const selectedFittings = Array.isArray(fittings) ? fittings.filter(Boolean) : [];
      const selectedDocsReq = Array.isArray(docsReq) ? docsReq.filter(Boolean) : [];
      const afterVehicles = [
        ``,
        ...(selectedFittings.length ? [`*Free Extra Fittings:*`, ...selectedFittings.map(f => `   ✅ ${f}`)] : []),
        ...(selectedDocsReq.length ? [``, `*Documents Required:*`, ...selectedDocsReq.map(d => `   📄 ${d}`)] : []),
      ];

      const footer = [
        ``,
        `• *Sales Executive:* ${execNameDisplay} (${execPhone || '-'})`,
        `*Our Locations* 📍`,
        `Muddinapalya • Hegganahalli • Nelagadrahalli • Andrahalli`,
        `Kadabagere • Channenahalli • Tavarekere `,
        ``,
        `• *Note:* Prices are indicative and may change without prior notice.`,
        ``,
        `✨ *${showroomName} — Ride with Pride, Drive with Confidence.* ✨`
      ];

      const text = [...header, ...vblocks, ...afterVehicles, ...footer].join("\n");
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (!w) window.location.href = url;
      setTimeout(resetForm, 1000);
    } catch (err) {
      msgApi.warning(err?.message || "Please fill all required fields before sending on WhatsApp.");
      try {
        await form.validateFields(CORE_KEYS);
      } catch (errInfo) {
        scrollToFirstError(form, errInfo);
      }
    }
  };

  const PrintList = ({ items }) => {
    if (!items?.length) return <span>-</span>;
    return <ul className="plist">{items.map((t, i) => <li key={`${t}-${i}`}>{t}</li>)}</ul>;
  };

  // ---------- Extra Vehicles UI Helpers ----------
  const filteredModels = (comp) =>
    [...new Set(bikeData.filter((r) => r.company === comp).map((r) => r.model))];

  const filteredVariants = (comp, mdl) =>
    [...new Set(bikeData.filter((r) => r.company === comp && r.model === mdl).map((r) => r.variant))];

  const onExtraChange = (idx, patch) => {
    setExtraVehicles((prev) => {
      const next = [...prev];
      const cur = { ...next[idx], ...patch };

      // if sheet mode and variant changes -> auto price
      if (!manual && patch.variant) {
        const found = bikeData.find(
          (r) => r.company === (cur.company || "") && r.model === (cur.model || "") && r.variant === patch.variant
        );
        if (found) {
          cur.onRoadPrice = found.onRoadPrice || 0;
          cur.downPayment = 0;
        }
      }

      // if company/model changed, clear downstreams in sheet mode
      if (!manual && patch.company) {
        cur.model = "";
        cur.variant = "";
        cur.onRoadPrice = 0;
        cur.downPayment = 0;
      }
      if (!manual && patch.model) {
        cur.variant = "";
        cur.onRoadPrice = 0;
        cur.downPayment = 0;
      }

      next[idx] = cur;
      return next;
    });
  };

  const addVehicle = () => {
    setExtraVehicles((prev) => {
      if (prev.length >= 2) return prev;
      return [...prev, makeEmptyVehicle()];
    });
  };

  const removeVehicle = (idx) => {
    setExtraVehicles((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <>
      {msgCtx}{/* 👈 enables the pop-up to actually render */}
      <style>{`
        .wrap { max-width: 1000px; margin: 12px auto; padding: 0 12px; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
        /* Make header actions stack on small screens */
        @media screen and (max-width: 600px) {
          .brand-actions-row { grid-template-columns: 1fr !important; row-gap: 8px; }
          .brand-actions { align-items: flex-start !important; }
        }
        .print-sheet { display: none; }
        @media print { .print-sheet { display: block; } .no-print { display: none !important; } }
      `}</style>

      {/* On-screen inputs */}
      <div className="wrap no-print">
        <div className="card">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* NEW: Fetch saved quotation by Quotation No. or Mobile */}
          </div>
          <Form
            layout="vertical"
            form={form}
            initialValues={{}}
            onValuesChange={onValuesChange}
          >
            <Row gutter={[12, 8]}>
              <Col span={24}>
                <div
                  className="brand-actions-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Form.Item label="Brand on Print" style={{ marginBottom: 0 }}>
                    <Radio.Group value={brand} onChange={(e)=>setBrand(e.target.value)}>
                      <Radio value="SHANTHA">Shantha Motors</Radio>
                      <Radio value="NH">NH Motors (Honda)</Radio>
                    </Radio.Group>
                  </Form.Item>
                  {/* Right-side stacked buttons */}
                  <div className="brand-actions" style={{ display: "flex", flexDirection: "row", gap: 8, alignItems: 'center' }}>
                    <FetchQuot
                      form={form}
                      webhookUrl={QUOT_GAS_URL}
                      EXECUTIVES={EXECUTIVES}
                      setBrand={setBrand}
                      setMode={setMode}
                      setVehicleType={setVehicleType}
                      setFittings={setFittings}
                      setDocsReq={setDocsReq}
                      setEmiSet={setEmiSet}
                      setDownPayment={setDownPayment}
                      setOnRoadPrice={setOnRoadPrice}
                      setCompany={setCompany}
                      setModel={setModel}
                      setVariant={setVariant}
                      setExtraVehicles={setExtraVehicles}
                      setFollowUpEnabled={setFollowUpEnabled}
                      setFollowUpAt={setFollowUpAt}
                      setFollowUpNotes={setFollowUpNotes}
                      buttonText="Fetch Details"
                      buttonProps={{
                        style: { background: "#2ECC71", borderColor: "#2ECC71", color: "#fff" },
                      }}
                    />
                  </div>
                </div>
              </Col>

              {/* Toggle manual/sheet mode for vehicle selection */}
              <Col span={24}>
                <Form.Item label="Type manually (no sheet)" valuePropName="checked">
                  <Switch checked={manual} onChange={setManual} />
                  <span style={{ marginLeft: 8, color: "#666" }}>
                    {sheetOk ? "You can still switch to manual if needed." : "Sheet unavailable — manual mode enabled."}
                  </span>
                </Form.Item>
              </Col>

              {/* Quotation No. + Branch */}
              <Col xs={24} sm={12} md={6}>
                <Form.Item
                  label="Quotation No."
                  name="serialNo"
                >
                  <Input placeholder="Auto at save" readOnly />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Form.Item label="Branch" name="branch" rules={[{ required: true, message: "Branch is required" }]}>
                  {canSwitch && allowedBranches.length ? (
                    <Select
                      placeholder="Select branch"
                      value={watchedBranch}
                      onChange={(v) => onBranchChange(v)}
                      options={allowedBranches.map((b) => ({ value: b.name, label: b.name }))}
                    />
                  ) : (
                    <Input readOnly placeholder="Auto-fetched from your profile" />
                  )}
                </Form.Item>
              </Col>

              <Col xs={24} sm={12} md={6}>
                <Form.Item
                  label="Executive Name"
                  name="executive"
                  rules={[{ required: true, message: "Executive is required" }]}
                >
                  {canSwitch ? (
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="Select executive"
                      options={(execOptions.length ? execOptions : EXECUTIVES).map((e) => ({ value: e.name, label: e.name }))}
                    />
                  ) : (
                    <Input readOnly placeholder="Auto-fetched from your profile" />
                  )}
                </Form.Item>
              </Col>

              <Col xs={24} sm={12} md={6}>
                <Form.Item label="Payment Mode">
                  <Radio.Group optionType="button" buttonStyle="solid" value={mode} onChange={(e)=>setMode(e.target.value)}>
                    <Radio.Button value="loan">Loan</Radio.Button>
                    <Radio.Button value="cash">Cash</Radio.Button>
                  </Radio.Group>
                </Form.Item>
              </Col>

              {/* Customer */}
              <Col xs={24} sm={12} md={12}>
                <Form.Item 
                  label="Customer Name" 
                  name="name" 
                  rules={[{ required: true, message: "Enter name" }]}
                  getValueFromEvent={(e) => {
                    const v = e?.target?.value ?? e; 
                    return typeof v === 'string' ? v.toUpperCase() : v;
                  }}
                >
                  <Input placeholder="CUSTOMER NAME" style={{ textTransform: 'uppercase' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={12}>
                <Form.Item
                  label="Mobile Number"
                  name="mobile"
                  rules={phoneRule}
                  normalize={(v) => (v ? v.replace(/\D/g, "").slice(0, 10) : v)}
                >
                  <Input placeholder="10-digit mobile" maxLength={10} />
                </Form.Item>
              </Col>

              <Col xs={24}>
                <Form.Item label="Address" name="address" rules={[{  message: "Enter address" }]}>
                  <Input.TextArea rows={2} placeholder="House No, Street, Area, City, PIN" />
                </Form.Item>
              </Col>

              {/* Vehicle 1 */}
              <Col span={24}>
                <Divider orientation="left">Vehicle 1</Divider>
              </Col>

              {/* Vehicle selection */}
              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Company" name="company" rules={[{ required: true, message: "Enter company" }]}>
                  {manual ? (
                    <Input placeholder="Type company" onChange={(e)=>setCompany(e.target.value)} />
                  ) : (
                    <Select
                      placeholder="Select Company"
                      options={companies.map((c) => ({ value: c, label: c }))}
                      onChange={(val) => {
                        setCompany(val);
                        setModel(""); setVariant(""); setOnRoadPrice(0); setDownPayment(0);
                        form.setFieldsValue({ bikeModel: undefined, variant: undefined, onRoadPrice: undefined });
                      }}
                    />
                  )}
                </Form.Item>
              </Col>

              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Model" name="bikeModel" rules={[{ required: true, message: "Enter model" }]}>
                  {manual ? (
                    <Input placeholder="Type model" onChange={(e)=>setModel(e.target.value)} />
                  ) : (
                    <Select
                      placeholder="Select Model"
                      disabled={!company}
                      options={models.map((m) => ({ value: m, label: m }))}
                      onChange={(val) => {
                        setModel(val);
                        setVariant(""); setOnRoadPrice(0); setDownPayment(0);
                        form.setFieldsValue({ variant: undefined, onRoadPrice: undefined });
                      }}
                    />
                  )}
                </Form.Item>
              </Col>

              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Variant" name="variant" rules={[{ required: true, message: "Enter variant" }]}>
                  {manual ? (
                    <Input placeholder="Type variant" onChange={(e)=>setVariant(e.target.value)} />
                  ) : (
                    <Select
                      placeholder="Select Variant"
                      disabled={!model}
                      options={variants.map((v) => ({ value: v, label: v }))}
                      onChange={handleVariant}
                    />
                  )}
                </Form.Item>
              </Col>

              <Col xs={24} sm={12} md={24}>
                <Form.Item
                  label="On-Road Price (₹)"
                  name="onRoadPrice"
                  rules={[
                    { required: true, message: "Enter on-road price" },
                    () => ({
                      validator(_, val) {
                        const n = Number(val || 0);
                        if (n > 0) return Promise.resolve();
                        return Promise.reject(new Error("On-road price must be greater than 0"));
                      },
                    }),
                  ]}
                >
                  <InputNumber
                    style={{ width: "100%" }}
                    readOnly={!manual}
                    formatter={(val) => `₹ ${String(val ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`}
                    parser={(val) => String(val || "0").replace(/[₹,\s]/g, "")}
                  />
                </Form.Item>
              </Col>

              {mode === "loan" && (
                <>
                  <Col xs={24} sm={12} md={12}>
                    <Form.Item
                      label="Down Payment (₹)"
                      name="downPayment"
                      rules={[
                        { required: true, message: "Down payment is required for loan" },
                        () => ({
                          validator(_, val) {
                            const n = Number(val || 0);
                            if (!Number.isFinite(n) || n <= 0) return Promise.reject(new Error("Enter a positive amount"));
                            if (n > Number(onRoadPrice || 0)) return Promise.reject(new Error("Down payment cannot exceed on-road price"));
                            return Promise.resolve();
                          },
                        })
                      ]}
                    >
                      <InputNumber
                        style={{ width: "100%" }}
                        min={0}
                        max={onRoadPrice}
                        step={1000}
                        value={downPayment}
                        onChange={(v) => {
                          const n = Math.min(Number(v || 0), onRoadPrice || 0);
                          setDownPayment(n);
                          form.setFieldsValue({ downPayment: n });
                        }}
                        formatter={(val) => `₹ ${String(val ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`}
                        parser={(val) => String(val || "0").replace(/[₹,\s]/g, "")}
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24}>
                    <Form.Item label="EMI Set">
                      <Radio.Group value={emiSet} onChange={(e)=>setEmiSet(e.target.value)}>
                        <Radio value="12">12</Radio>
                        <Radio value="48">48</Radio>
                      </Radio.Group>
                    </Form.Item>
                  </Col>

                  <Col xs={24}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {tenures.map((mo) => (
                        <div key={mo} className="emibox" style={{ minWidth: 140 }}>
                          <div style={{ fontWeight: 700 }}>{mo} months</div>
                          <div style={{ fontWeight: 900, fontSize: 16 }}>{inr0(monthlyFor(onRoadPrice, downPayment, mo))}</div>
                        </div>
                      ))}
                    </div>
                  </Col>
                </>
              )}

              {/* GLOBAL Vehicle Type & Fittings */}
              <Col xs={24} md={12}>
                <Form.Item label="Vehicle Type" name="vehicleType">
                  <Radio.Group
                    optionType="button"
                    buttonStyle="solid"
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value)}
                  >
                    <Radio.Button value="scooter">Scooter</Radio.Button>
                    <Radio.Button value="motorcycle">Motorcycle</Radio.Button>
                  </Radio.Group>
                </Form.Item>
              </Col>

              <Col xs={24} md={12}>
                <Form.Item label="Free Extra Fittings (shown on print)">
                  <Checkbox.Group
                    value={fittings}
                    onChange={setFittings}
                  >
                    {(vehicleType === "scooter" ? SCOOTER_OPTIONS : MOTORCYCLE_OPTIONS).map((opt) => (
                      <div key={opt} style={{ marginBottom: 6 }}>
                        <Checkbox value={opt}>{opt}</Checkbox>
                      </div>
                    ))}
                  </Checkbox.Group>
                </Form.Item>
              </Col>

              {/* Documents */}
              <Col xs={24}>
                <Form.Item label="Documents Required (always printed)">
                  <Checkbox.Group value={docsReq} onChange={setDocsReq}>
                    {DOCS_REQUIRED.map((x, i) => (
                      <div key={`${x}-${i}`} style={{ marginBottom: 6 }}>
                        <Checkbox value={x}>{x}</Checkbox>
                      </div>
                    ))}
                  </Checkbox.Group>
                </Form.Item>
              </Col>

              {/* Remarks */}
              <Col xs={24}>
                <Form.Item label="Remarks" name="remarks">
                  <Input.TextArea rows={2} placeholder="Any notes for this quotation (optional)" />
                </Form.Item>
              </Col>

              {/* Follow-up */}
              <Col span={24}>
                <Divider orientation="left">Follow-up</Divider>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Schedule follow-up?">
                  <Switch checked={followUpEnabled} onChange={setFollowUpEnabled} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Follow-up date & time">
                  <DatePicker
                    showTime
                    style={{ width: '100%' }}
                    value={followUpAt}
                    onChange={setFollowUpAt}
                    disabled={!followUpEnabled}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Follow-up notes">
                  <Input
                    placeholder="e.g., Customer will decide after salary"
                    value={followUpNotes}
                    onChange={(e)=>setFollowUpNotes(e.target.value)}
                    disabled={!followUpEnabled}
                  />
                </Form.Item>
              </Col>

              {/* Additional Vehicles */}
              <Col span={24}>
                <Divider orientation="left">Additional Vehicles</Divider>
                {extraVehicles.map((ev, idx) => {
                  const idx1 = idx + 2; // Vehicle 2/3
                  const evModels = manual ? [] : filteredModels(ev.company);
                  const evVariants = manual ? [] : filteredVariants(ev.company, ev.model);
                  const tset = tenuresForSet(ev.emiSet || "12");

                  return (
                    <div key={idx} style={{ border: "1px dashed #d4d4d8", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                      <Row gutter={[12, 8]} align="middle">
                        <Col span={24}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <strong>Vehicle {idx1}</strong>
                            <Button
                              danger
                              type="text"
                              icon={<DeleteOutlined />}
                              onClick={() => removeVehicle(idx)}
                            >
                              Remove
                            </Button>
                          </div>
                        </Col>

                        <Col xs={24} md={8}>
                          {manual ? (
                            <Input
                              placeholder="Company"
                              value={ev.company}
                              onChange={(e) => onExtraChange(idx, { company: e.target.value })}
                            />
                          ) : (
                            <Select
                              placeholder="Select Company"
                              value={ev.company || undefined}
                              options={companies.map((c) => ({ value: c, label: c }))}
                              onChange={(val) => onExtraChange(idx, { company: val })}
                            />
                          )}
                        </Col>

                        <Col xs={24} md={8}>
                          {manual ? (
                            <Input
                              placeholder="Model"
                              value={ev.model}
                              onChange={(e) => onExtraChange(idx, { model: e.target.value })}
                            />
                          ) : (
                            <Select
                              placeholder="Select Model"
                              disabled={!ev.company}
                              value={ev.model || undefined}
                              options={evModels.map((m) => ({ value: m, label: m }))}
                              onChange={(val) => onExtraChange(idx, { model: val })}
                            />
                          )}
                        </Col>

                        <Col xs={24} md={8}>
                          {manual ? (
                            <Input
                              placeholder="Variant"
                              value={ev.variant}
                              onChange={(e) => onExtraChange(idx, { variant: e.target.value })}
                            />
                          ) : (
                            <Select
                              placeholder="Select Variant"
                              disabled={!ev.model}
                              value={ev.variant || undefined}
                              options={evVariants.map((v) => ({ value: v, label: v }))}
                              onChange={(val) => onExtraChange(idx, { variant: val })}
                            />
                          )}
                        </Col>

                        <Col xs={24} md={12}>
                          <InputNumber
                            style={{ width: "100%" }}
                            placeholder="On-Road Price (₹)"
                            value={ev.onRoadPrice}
                            readOnly={!manual}
                            onChange={(val) => onExtraChange(idx, { onRoadPrice: Number(val || 0) })}
                            formatter={(val) => `₹ ${String(val ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`}
                            parser={(val) => String(val || "0").replace(/[₹,\s]/g, "")}
                          />
                        </Col>

                        {mode === "loan" && (
                          <>
                            <Col xs={24} md={12}>
                              <InputNumber
                                style={{ width: "100%" }}
                                placeholder="Down Payment (₹)"
                                min={0}
                                max={ev.onRoadPrice || 0}
                                step={1000}
                                value={ev.downPayment || 0}
                                onChange={(val) => onExtraChange(idx, { downPayment: Math.min(Number(val || 0), ev.onRoadPrice || 0) })}
                                formatter={(val) => `₹ ${String(val ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`}
                                parser={(val) => String(val || "0").replace(/[₹,\s]/g, "")}
                              />
                            </Col>

                            <Col xs={24}>
                              <Radio.Group
                                value={ev.emiSet || "12"}
                                onChange={(e) => onExtraChange(idx, { emiSet: e.target.value })}
                                style={{ marginBottom: 8 }}
                              >
                                <Radio value="12">12</Radio>
                                <Radio value="48">48</Radio>
                              </Radio.Group>
                              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                {tset.map((mo) => (
                                  <div key={mo} className="emibox" style={{ minWidth: 140 }}>
                                    <div style={{ fontWeight: 700 }}>{mo} months</div>
                                    <div style={{ fontWeight: 900, fontSize: 16 }}>
                                      {inr0(monthlyFor(ev.onRoadPrice || 0, ev.downPayment || 0, mo))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </Col>
                          </>
                        )}
                      </Row>
                    </div>
                  );
                })}

                <Button
                  icon={<PlusOutlined />}
                  onClick={addVehicle}
                  disabled={extraVehicles.length >= 2}
                >
                  Add Vehicle
                </Button>
                {extraVehicles.length >= 2 && (
                  <span style={{ marginLeft: 8, color: "#666" }}>(Maximum 3 vehicles per quotation)</span>
                )}
              </Col>

              {/* Actions */}
              <Col span={24} style={{ textAlign: "right" }}>
                <div style={{ marginBottom: 8, textAlign: "left", color: "#888", fontSize: 12 }}>
                  {!canAct && (
                    <span>
                      Fill <b>Branch</b>, <b>Executive</b>, <b>Customer Name</b>, <b>Mobile</b>, and <b>Vehicle Details</b> to proceed.
                    </span>
                  )}
                </div>

                <Button
                  className="no-print"
                  onClick={handleWhatsAppClick}
                  disabled={!canAct || busy || actionCooldownUntil > 0}
                  style={{ marginRight: 8, background: "#25D366", borderColor: "#25D366", color: "#fff" }}
                >
                  WhatsApp
                </Button>

                <Button
                  className="no-print"
                  type="primary"
                  icon={<PrinterOutlined />}
                  onClick={handlePrint}
                  disabled={!canAct || busy || actionCooldownUntil > 0 || printing}
                  loading={printing}
                >
                  Print
                </Button>
              </Col>
            </Row>
          </Form>
        </div>
      </div>

      {/* ---------- PRINT SLIP (A4) ---------- */}
      <div className="print-sheet">
        <div className="page" ref={pageRef}>
          <div className="sheet">

            {/* Header */}
            <div className="hdr-line">
              <div style={{ textAlign: "center", marginRight: 12 }}>
                <img
                  src={"/location-qr.png"}
                  alt="Location QR"
                  style={{ height: 50, objectFit: "contain" }}
                />
                <div style={{ fontSize: 8, fontWeight: 600, marginTop: 4 }}>Scan for Location</div>
              </div>

              <div className="hdr-title">
                <div className="quo-box">QUOTATION</div>
              </div>

              <div className="hdr-right">
                <div>Sl. No.: {form.getFieldValue("serialNo") || "-"}</div>
                <div>Date: {printDate}</div>
              </div>
            </div>

            {/* Brand block */}
            <div
              style={{
                borderBottom: "2px solid #000",
                paddingBottom: 6,
                marginBottom: 8,
              }}
            >
              <div
                className="brand-row2"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  columnGap: 16,
                  alignItems: "center",
                }}
              >
                {/* LEFT: brand names + addresses + mobiles */}
                <div>
                  {/* Brand names horizontally */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 10,
                      flexWrap: "wrap",
                      marginBottom: 4,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {brand === "SHANTHA" ? (
                      <>
                        <div className="title-kn" style={{ fontSize: "25pt", fontWeight: 800 }}>
                          ಶಾಂತ ಮೋಟರ್ಸ್
                        </div>
                        <div className="title-en" style={{ fontSize: "20pt", fontWeight: 800 }}>
                          Shantha Motors
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="title-knhonda" style={{ fontSize: "25pt", fontWeight: 800 }}>
                          ಎನ್ ಎಚ್ ಮೋಟರ್ಸ್
                        </div>
                        <div className="title-en" style={{ fontSize: "18pt", fontWeight: 700 }}>
                          NH Motors
                        </div>
                      </>
                    )}
                  </div>

                  {/* Addresses + mobile */}
                  {brand === "SHANTHA" ? (
                    <>
                      <div className="addr-line" style={{ fontSize: "13pt" }}>
                        • Muddinapalya • Hegganahalli   • Nelagadrahalli  • Andrahalli
                      </div>
                      <div className="addr-line" style={{ fontSize: "13pt" }}>
                        • Kadabagere   • Channenahali  • Tavarekere 
                      </div>
                      <div style={{ marginTop: 6, fontWeight: 600 }}>
                        Mob: 9731366921 / 8073283502 / 9035131806
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="addr-linehonda" style={{ fontSize: "12pt" }}>
                        Site No. 116/1, Bydarahalli, Magadi Main Road, Opp. HP Petrol Bunk, Bangalore - 560091
                      </div>
                      <div style={{ marginTop: 6, fontWeight: 600 }}>
                        Mob: 9731366921 / 8073283502 / 9741609799
                      </div>
                    </>
                  )}
                </div>

                {/* RIGHT: logo only */}
                <div
                  className="brand-right"
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 16,
                    justifyContent: "flex-end",
                  }}
                >
                  <img
                    src={brand === "SHANTHA" ? "/shantha-logoprint.jpg" : "/honda-logo.png"}
                    alt="Brand Logo"
                    style={{
                      height: 130,
                      objectFit: "contain",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Customer */}
            <div className="box" style={{ marginBottom: 8 }}>
              <div className="section-title">Customer Details</div>
              <div className="row2">
                <div><b>Name:</b> {form.getFieldValue("name") || "-"}</div>
                <div><b>Mobile:</b> {form.getFieldValue("mobile") || "-"}</div>
                <div style={{ gridColumn: "1 / span 2" }}><b>Address:</b> {form.getFieldValue("address") || "-"}</div>
              </div>
            </div>

            {/* Vehicle 1 */}
            <div className="box" style={{ marginBottom: 8 }}>
              <div className="section-title">Vehicle 1 Details</div>
              <div className="row3" style={{ fontSize: "12pt" }}>
                <div><b>Company:</b> {company || form.getFieldValue("company") || "-"}</div>
                <div><b>Model:</b> {model || form.getFieldValue("bikeModel") || "-"}</div>
                <div><b>Variant:</b> {variant || form.getFieldValue("variant") || "-"}</div>
              </div>
              <div style={{ marginTop: 6, textAlign: "center" }}>
                <span className="big-price">
                  <span><b>On-Road Price:</b> </span>
                  {inr0(form.getFieldValue("onRoadPrice") ?? onRoadPrice ?? 0)}
                </span>
              </div>
            </div>

            {/* EMI for Vehicle 1 */}
            {mode === "loan" && (
              <div className="box" style={{ marginBottom: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "0.5fr 2fr", gap: 12, alignItems: "start" }}>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 4, fontSize: "12pt" }}>Down Payment</div>
                    <div style={{ fontWeight: 800, fontSize: "18pt" }}>{inr0(downPayment || 0)}</div>
                  </div>

                  <div>
                    <div style={{ fontWeight: 900, textAlign: "center", marginBottom: 4, fontSize: "14pt" }}>EMI DETAILS</div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
                      {tenures.map((mo) => (
                        <div key={mo} className="emibox" style={{ flex: 1, minWidth: 120 }}>
                          <div style={{ fontWeight: 700 }}>{mo} months</div>
                          <div style={{ fontWeight: 900 }}>{inr0(monthlyFor(onRoadPrice, downPayment, mo))}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Extra Vehicles blocks on print */}
            {extraVehicles.map((ev, idx) => {
              const idx1 = idx + 2;
              const tset = (ev.emiSet || "12") === "12" ? [12, 18, 24, 36] : [24, 30, 36, 48];
              return (
                <div key={idx}>
                  <div className="box" style={{ marginBottom: 8 }}>
                    <div className="section-title">Vehicle {idx1} Details</div>
                    <div className="row3" style={{ fontSize: "12pt" }}>
                      <div><b>Company:</b> {ev.company || "-"}</div>
                      <div><b>Model:</b> {ev.model || "-"}</div>
                      <div><b>Variant:</b> {ev.variant || "-"}</div>
                    </div>
                    <div style={{ marginTop: 6, textAlign: "center" }}>
                      <span className="big-price">
                        <span><b>On-Road Price:</b> </span>
                        {inr0(ev.onRoadPrice || 0)}
                      </span>
                    </div>
                  </div>

                  {mode === "loan" && (
                    <div className="box" style={{ marginBottom: 8 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "0.5fr 2fr", gap: 12, alignItems: "start" }}>
                        <div>
                          <div style={{ fontWeight: 700, marginBottom: 4, fontSize: "12pt" }}>Down Payment</div>
                          <div style={{ fontWeight: 800, fontSize: "18pt" }}>{inr0(ev.downPayment || 0)}</div>
                        </div>

                        <div>
                          <div style={{ fontWeight: 900, textAlign: "center", marginBottom: 4, fontSize: "14pt" }}>EMI DETAILS</div>
                          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
                            {tset.map((mo) => (
                              <div key={mo} className="emibox" style={{ minWidth: 140 }}>
                                <div style={{ fontWeight: 700 }}>{mo} months</div>
                                <div style={{ fontWeight: 900 }}>
                                  {inr0(monthlyFor(ev.onRoadPrice || 0, ev.downPayment || 0, mo))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Executive + fittings + docs */}
            <div className="box" style={{ marginBottom: 8 }}>
              <div style={{ marginBottom: 6, fontSize: "13pt", fontWeight: 700 }}>
                <b>Executive name:</b> {executiveName || "-"}
                {(() => {
                  const found = EXECUTIVES.find((e) => e.name === executiveName);
                  return found ? ` (${found.phone})` : "";
                })()}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "0.6fr 1fr 1fr",
                  gap: 16,
                  alignItems: "start",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Free Extra Fittings</div>
                  <PrintList items={fittings} />
                </div>

                <div
                  style={{
                    minHeight: 120,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                  }}
                >
                  <img
                    src={"/shantha-access.png"}
                    alt="Accessories"
                    style={{ height: 140, margin: "6px 0" }}
                  />
                </div>

                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Documents Required</div>
                  <PrintList items={docsReq} />
                </div>
              </div>
            </div>

            <div style={{ fontSize: "9.5pt", display: "flex", justifyContent: "space-between" }}>
              <div />
              <div><b>Note:</b> Prices are indicative and subject to change without prior notice.</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
