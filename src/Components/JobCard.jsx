// JobCard.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  Card, Col, DatePicker, Form, Input,
  InputNumber, Row, Typography, message, Select, Button, Segmented, Checkbox, Tooltip, Modal
} from "antd";
import dayjs from "dayjs";
import { handleSmartPrint } from "../utils/printUtils";
import { FaWhatsapp } from "react-icons/fa";
import PreServiceSheet from "./PreServiceSheet";
import PostServiceSheet from "./PostServiceSheet";
import FetchJobcard from "./FetchJobcard";
import { saveJobcardViaWebhook, reserveJobcardSerial } from "../apiCalls/forms";
import { GetCurrentUser } from "../apiCalls/users";
import { getBranch } from "../apiCalls/branches";

const { Title, Text } = Typography;
const { Option } = Select;

/* =========================
   CONFIG / CONSTANTS
   ========================= */

// Apps Script Web App URL (default set here; env can override)
// Default Job Card GAS URL
const DEFAULT_JOBCARD_GAS_URL =
  "https://script.google.com/macros/s/AKfycbx7Q36rQ4tzFCDZKJbR5SUabuunYL2NKd0jNJxdUgaqIQ8BUX2kfINq5WppF5NJLxA6YQ/exec";
const JOBCARD_GAS_URL = import.meta.env.VITE_JOBCARD_GAS_URL || DEFAULT_JOBCARD_GAS_URL;

// Google Form constants removed — now using Apps Script webhook

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

// Reserve next sequential JC number on the server, idempotent by mobile+branch
async function reserveNextJobCardSerial(mobile, branchCode, branchId) {
  try {
    const resp = await reserveJobcardSerial(mobile, branchCode, branchId);
    if (resp?.success && resp?.serial) return String(resp.serial);
  } catch (err) {
    console.warn('Reserve JC serial failed; falling back to timestamp:', err?.message || err);
  }
  return dayjs().format('YYMMDDHHmmss');
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

/** Save JobCard via Apps Script Webhook (proxy through backend to avoid CORS).
 * Optional: if not configured, act as offline success so UI continues (print, etc.).
 */
async function submitJobcardWebhook(payload) {
  if (!JOBCARD_GAS_URL) return { success: true, offline: true };
  const resp = await saveJobcardViaWebhook({
    webhookUrl: JOBCARD_GAS_URL,
    method: 'POST',
    payload: { action: 'save', data: payload },
  });
  return resp?.data || resp;
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

  const isNH = String(branch).trim() === "Byadarahalli";
  const showroomEn = isNH ? "NH Motors" : "Shantha Motors";
  const showroomKn = isNH ? "ಎನ್ ಎಚ್ ಮೋಟರ್ಸ್" : "ಶಾಂತ ಮೋಟರ್ಸ್";

  return (
    `Hi ${name}! 👋\n\n` +
    `✅ Your bike service is confirmed at ${showroomEn}.\n\n` +
    `Welcome to ${showroomEn},\n${showroomKn}ಗೆ ಸ್ವಾಗತ 🏍️✨\n\n` +
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

export default function JobCard({ initialValues = null } = {}) {
  const [form] = Form.useForm();
  const [, setUserStaffName] = useState();
  const [, setUserRole] = useState();
  // Keep defaults to restore if fields get cleared
  const [defaultBranchName, setDefaultBranchName] = useState("");
  const [defaultExecutiveName, setDefaultExecutiveName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [branchId, setBranchId] = useState("");
  // Optimistic outbox for background sync
  const OUTBOX_KEY = 'JobCard:outbox';
  const readJson = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
  const writeJson = (k, obj) => { try { localStorage.setItem(k, JSON.stringify(obj)); } catch {
    //sfj
  } };
  const enqueueOutbox = (job) => { const box = readJson(OUTBOX_KEY, []); const item = { id: Date.now()+':' + Math.random().toString(36).slice(2), job }; box.push(item); writeJson(OUTBOX_KEY, box); return item.id; };
  const removeOutboxById = (id) => { const box = readJson(OUTBOX_KEY, []); writeJson(OUTBOX_KEY, box.filter(x=>x.id!==id)); };

  const [regDisplay, setRegDisplay] = useState("");
  const [serviceTypeLocal, setServiceTypeLocal] = useState(null);
  const [vehicleTypeLocal, setVehicleTypeLocal] = useState(null);
  const [isReady, setIsReady] = useState(false); // ★ gate buttons
  const [notReadyWhy, setNotReadyWhy] = useState(""); // ★ tooltip text
  const preRef = useRef(null);
  const postRef = useRef(null);
  const [postOpen, setPostOpen] = useState(false);
  const [postPayment, setPostPayment] = useState('cash'); // 'cash' | 'online'
  // Follow-up state (similar to Quotation)
  const [followUpEnabled, setFollowUpEnabled] = useState(true);
  const [followUpAt, setFollowUpAt] = useState(() => dayjs().add(2, 'day').hour(10).minute(0).second(0).millisecond(0));
  const [followUpNotes, setFollowUpNotes] = useState("");

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

  // Retry outbox on mount / when back online
  const retryOutbox = async () => {
    try {
      const box = readJson(OUTBOX_KEY, []);
      if (!Array.isArray(box) || !box.length) return;
      for (const item of box) {
        const j = item.job || {};
        try {
          if (j.type === 'save' && JOBCARD_GAS_URL) {
            const resp = await saveJobcardViaWebhook({ webhookUrl: JOBCARD_GAS_URL, method: 'POST', payload: { action: 'save', data: j.data } });
            const ok = (resp?.data || resp)?.success !== false;
            if (ok) removeOutboxById(item.id);
          } else if (j.type === 'post' && JOBCARD_GAS_URL) {
            const resp = await saveJobcardViaWebhook({ webhookUrl: JOBCARD_GAS_URL, method: 'POST', payload: { action: 'postService', data: j.data } });
            const ok = (resp?.data || resp)?.success !== false;
            if (ok) removeOutboxById(item.id);
          }
        } catch {/* keep */}
      }
    } catch {/* ignore */}
  };
  // Run outbox retry on mount and when back online
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTimeout(() => { retryOutbox(); }, 0); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const onOnline = () => retryOutbox(); window.addEventListener('online', onOnline); return () => window.removeEventListener('online', onOnline); }, []);

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

  const initialFormValues = useMemo(
    () => ({
      jcNo: "",
      createdAt: dayjs(),
      expectedDelivery: null,
      branch: undefined,
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

  // Apply external initial values (when rendered in a modal)
  useEffect(() => {
    if (!initialValues) return;
    try {
      const fv = initialValues.formValues || initialValues;
      const parseDay = (v) => {
        if (!v) return null;
        const d = dayjs(v, ["DD/MM/YYYY","YYYY-MM-DD", dayjs.ISO_8601], true);
        return d.isValid() ? d : null;
      };
      const kmVal = fv.km ? `${String(fv.km).replace(/\D/g,'')} KM` : '';
      const fields = {
        jcNo: fv.jcNo || '',
        branch: fv.branch || undefined,
        mechanic: fv.mechanic || undefined,
        executive: fv.executive || undefined,
        expectedDelivery: parseDay(fv.expectedDelivery),
        regNo: fv.regNo || '',
        model: fv.model || '',
        colour: fv.colour || '',
        km: kmVal,
        fuelLevel: fv.fuelLevel || undefined,
        callStatus: fv.callStatus || '',
        custName: fv.custName || '',
        custMobile: String(fv.custMobile || '').replace(/\D/g,'').slice(-10),
        obs: (fv.obs || '').replace(/\s*#\s*/g, "\n"),
        vehicleType: fv.vehicleType || undefined,
        serviceType: fv.serviceType || undefined,
        floorMat: fv.floorMat === 'Yes' ? 'Yes' : fv.floorMat === 'No' ? 'No' : undefined,
        discounts: { labour: 0 },
        gstLabour: DEFAULT_GST_LABOUR,
        labourRows: Array.isArray(initialValues?.labourRows) && initialValues.labourRows.length ? initialValues.labourRows : buildRows(fv.serviceType, fv.vehicleType),
      };
      form.setFieldsValue(fields);
      setRegDisplay(fields.regNo || '');
      setServiceTypeLocal(fv.serviceType || null);
      setVehicleTypeLocal(fv.vehicleType || null);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues]);

  // Prefill executive + branch from logged-in user (staff)
  useEffect(() => {
    (async () => {
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
            try { localStorage.setItem('user', JSON.stringify(user)); } catch (e) { void e; }
          }
        }
        if (user) {
          const staffName = user?.formDefaults?.staffName || user?.name || undefined;
          const role = user?.role ? String(user.role).toLowerCase() : undefined;
          let branchName = user?.formDefaults?.branchName;
          const codeFromUser = (user?.formDefaults?.branchCode && String(user.formDefaults.branchCode).toUpperCase()) || '';
          if (codeFromUser) { setBranchCode(codeFromUser); try { form.setFieldsValue({ branchCode: codeFromUser }); } catch {
            //gef
          } }
          const branchIdVar = (user?.formDefaults && (user.formDefaults.branchId?._id || user.formDefaults.branchId || null))
            || (user?.primaryBranch && (user.primaryBranch?._id || user.primaryBranch || null))
            || (Array.isArray(user?.branches) && user.branches.length ? (user.branches[0]?._id || user.branches[0] || null) : null);
          if (branchIdVar) {
            try {
              const br = await getBranch(String(branchIdVar)).catch(() => null);
              if (br?.success && br?.data) {
                if (!branchName) branchName = br.data.name;
                if (br?.data?.code && !branchCode) {
                  const code = String(br.data.code).toUpperCase();
                  setBranchCode(code);
                  setBranchId(String(br.data.id || branchIdVar));
                  try { form.setFieldsValue({ branchCode: code }); } catch {
                    //aoibfiha
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
      } catch (e) { void e; }
    })();
  }, [form]); // branchCode intentionally excluded; we want this to run once on mount

  // Removed JC number prefetch to avoid increments on refresh

  // If branch/executive ever get cleared by a reset, restore from defaults
  const watchedBranch = Form.useWatch('branch', form);
  const watchedExec = Form.useWatch('executive', form);
  useEffect(() => {
    const patch = {};
    if (!watchedBranch && defaultBranchName) patch.branch = defaultBranchName;
    if (!watchedExec && defaultExecutiveName) patch.executive = defaultExecutiveName;
    if (Object.keys(patch).length) form.setFieldsValue(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedBranch, watchedExec, defaultBranchName, defaultExecutiveName]);

  // Watchers (can be used for dynamic behaviors later)

  const handleRegChange = (e) => {
    const next = formatReg(e.target.value);
    setRegDisplay(next);
    form.setFieldsValue({ regNo: next });
  };

  const labourRowsRaw = Form.useWatch("labourRows", form);
  const labourRows = useMemo(() => labourRowsRaw || [], [labourRowsRaw]);
  const gstLabour = Form.useWatch("gstLabour", form) ?? DEFAULT_GST_LABOUR;
  const discountsRaw = Form.useWatch("discounts", form);
  const discounts = useMemo(() => discountsRaw || { labour: 0 }, [discountsRaw]);

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

  // ---- Auto Save (→ Apps Script Webhook) ----
  const fmtDDMMYYYY = (d) => (d ? dayjs(d).format("DD/MM/YYYY") : "");
  const OBS_SEP = " # ";

  const handleAutoSave = async () => {
    try {
      // ★ Validate ALL required fields (dynamic-aware)
      await validateAllRequired();

      const vals = form.getFieldsValue(true);

      // 🔢 Ensure a server-issued JC No. with branch code (replace stale numeric)
      let jc = vals.jcNo;
      const jcPattern = /^JC-[A-Z]+-[A-Z0-9]{6}$/;
      if (!jcPattern.test(String(jc || '').trim())) {
        try {
          jc = await reserveNextJobCardSerial(
            vals.custMobile,
            branchCode || (form.getFieldValue('branchCode') || '').toUpperCase(),
            branchId
          );
        } catch {
          jc = dayjs().format('YYMMDDHHmmss');
        }
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

      // Build a payload compatible with FetchJobcard (stores JSON in sheet)
      const payload = {
        savedAt: new Date().toISOString(),
        followUp: {
          enabled: Boolean(followUpEnabled),
          at: followUpEnabled && followUpAt && dayjs(followUpAt).isValid() ? dayjs(followUpAt).toISOString() : null,
          notes: String(followUpNotes || ''),
          assignedTo: vals.executive || '',
          branch: vals.branch || '',
          customer: { name: vals.custName || '', mobile: String(vals.custMobile || '') },
          status: 'pending',
        },
        formValues: {
          jcNo: jc,
          branch: vals.branch || "",
          mechanic: vals.mechanic || "",
          executive: vals.executive || "",
          expectedDelivery: fmtDDMMYYYY(vals.expectedDelivery),
          regNo: vals.regNo || "",
          model: vals.model || "",
          colour: vals.colour || "",
          km: kmOnlyDigits || "",
          fuelLevel: vals.fuelLevel || "",
          callStatus: vals.callStatus || "",
          custName: vals.custName || "",
          custMobile: String(vals.custMobile || ""),
          obs: obsOneLine,
          vehicleType: vals.vehicleType || "",
          serviceType: vals.serviceType || "",
          floorMat: floorMatStr,
          amount: String(amt),
        },
        labourRows: labourRows || [],
          totals,
      };

      // Optimistic background save
      message.success({ content: "Saved. Syncing in background…", key: "autosave", duration: 1.5 });
      const data = { jcNo: jc, formValues: payload.formValues, payload };
      const outboxId = enqueueOutbox({ type: 'save', data });
      setTimeout(async () => {
        try {
          if (!JOBCARD_GAS_URL) return; // optional integration disabled
          const resp = await submitJobcardWebhook(data);
          const ok = (resp?.data || resp)?.success !== false;
          if (ok) removeOutboxById(outboxId);
        } catch { /* keep queued */ }
      }, 0);
    } catch (e) {
      if (e?.errorFields) {
        message.error("Please complete required fields before auto-saving.");
      } else {
        const apiMsg = e?.response?.data?.message || e?.message || "Failed to auto-save. Please try again.";
        message.error(apiMsg);
      }
      throw e;
    }
  };

  // ---- Post-service: update existing row by mobile, with payment mode ----
  const handlePostServiceFlow = async (shouldPrint) => {
    try {
      const valsNow = form.getFieldsValue(true);
      const mobile10 = String(valsNow.custMobile || '').replace(/\D/g, '').slice(-10);
      if (mobile10.length !== 10) {
        message.error('Enter a valid 10-digit mobile number.');
        return;
      }

      // Ensure JC number exists (reserve by mobile if missing)
      let jcNo = valsNow.jcNo;
      if (!/^\d+$/.test(String(jcNo || '').trim())) {
        try {
          jcNo = await reserveNextJobCardSerial(
            valsNow.custMobile,
            branchCode || (form.getFieldValue('branchCode') || '').toUpperCase(),
            branchId
          );
          form.setFieldsValue({ jcNo });
        } catch (e) { void e; }
      }

      const amount = Number.isFinite(totals.grand) ? Math.round(totals.grand) : 0;
      const kmOnlyDigits = String(valsNow.km || '').replace(/\D/g, '');
      const floorMatStr = typeof valsNow.floorMat === 'string'
        ? valsNow.floorMat
        : valsNow.floorMat === true ? 'Yes' : valsNow.floorMat === false ? 'No' : 'No';
      const obsOneLine = String(valsNow.obs || '').replace(/\s*\r?\n\s*/g, ' # ').trim();

      const payload = {
        postServiceAt: new Date().toISOString(),
        paymentMode: postPayment,
        formValues: {
          jcNo: jcNo || '',
          branch: valsNow.branch || '',
          mechanic: valsNow.mechanic || '',
          executive: valsNow.executive || '',
          expectedDelivery: fmtDDMMYYYY(valsNow.expectedDelivery),
          regNo: valsNow.regNo || '',
          model: valsNow.model || '',
          colour: valsNow.colour || '',
          km: kmOnlyDigits || '',
          fuelLevel: valsNow.fuelLevel || '',
          callStatus: valsNow.callStatus || '',
          custName: valsNow.custName || '',
          custMobile: String(valsNow.custMobile || ''),
          obs: obsOneLine,
          vehicleType: valsNow.vehicleType || '',
          serviceType: valsNow.serviceType || '',
          floorMat: floorMatStr,
          amount: String(amount),
        },
        labourRows: labourRows || [],
        totals,
      };

      // Optimistic: queue background post-service save
      message.success({ key: 'postsave', content: 'Saved. Syncing in background…' });
      const data = { mobile: mobile10, jcNo, collectedAmount: amount, paymentMode: postPayment, payload };
      const outboxId = enqueueOutbox({ type: 'post', data });
      setTimeout(async () => {
        try {
      let ok = true;
      if (JOBCARD_GAS_URL) {
        const resp = await saveJobcardViaWebhook({ webhookUrl: JOBCARD_GAS_URL, method: 'POST', payload: { action: 'postService', data } });
        ok = (resp?.data || resp)?.success !== false;
      }
          if (ok) removeOutboxById(outboxId);
        } catch {
          // keep queued
        }
      }, 0);

      if (shouldPrint) {
        await new Promise((r) => setTimeout(r, 50));
        await handlePrint('post');
      }
      setPostOpen(false);
    } catch (e) {
      console.warn('post-service save error:', e);
      message.error((e && e.message) || 'Could not save post-service details.');
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
    <>
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

      <div className="wrap no-print">
        <div className="card">
          <div
            className="brand-actions-row"
            style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 12 }}
          >
            <div>
              <Title level={4} style={{ margin: 0 }}>SHANTHA MOTORS — JOB CARD</Title>
              <Text type="secondary">Multi Brand Two Wheeler Sales & Service</Text>
            </div>
            <div className="brand-actions" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Fetch button */}
              <FetchJobcard
                form={form}
                formatReg={formatReg}
                buildRows={buildRows}
                defaultGstLabour={DEFAULT_GST_LABOUR}
                lists={{ BRANCHES, MECHANIC, EXECUTIVES, VEHICLE_TYPES, SERVICE_TYPES }}
                setServiceTypeLocal={setServiceTypeLocal}
                setVehicleTypeLocal={setVehicleTypeLocal}
                setRegDisplay={setRegDisplay}
                webhookUrl={JOBCARD_GAS_URL}
                setFollowUpEnabled={setFollowUpEnabled}
                setFollowUpAt={setFollowUpAt}
                setFollowUpNotes={setFollowUpNotes}
              />
            </div>
          </div>

          <Form
          form={form}
          layout="vertical"
          initialValues={initialFormValues}
          style={{ marginTop: 12 }}
          onValuesChange={recomputeReady} // ★ live-enable buttons as user fills
        >
          {/* Job Details */}
          <Card size="small" bordered title="Job Details">
            <Row gutter={[12, 8]}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label="JC No." name="jcNo" >
                  <Input placeholder="No Need to Enter" readOnly />
                </Form.Item>
              </Col>

              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Created At" name="createdAt" rules={[{ required: true }]}>
                  <DatePicker showTime style={{ width: "100%" }} />
                </Form.Item>
              </Col>

              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Branch" name="branch" rules={[{ required: true }]}>
                  <Input readOnly placeholder="Auto-fetched from your profile" />
                </Form.Item>
              </Col>

              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Allotted Mechanic" name="mechanic" rules={[{ required: true }]}>
                  <Select
                    placeholder="Select mechanic"
                    options={MECHANIC.map((name) => ({ value: name, label: name }))}
                  />
                </Form.Item>
              </Col>

              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Executive" name="executive" rules={[{ required: true }]}>
                  <Input readOnly placeholder="Auto-fetched from your profile" />
                </Form.Item>
              </Col>

              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Expected Delivery Date" name="expectedDelivery" rules={[{ required: true }]}>
                  <DatePicker style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* Vehicle & Customer */}
          <Card size="small" bordered style={{ marginTop: 12 }} title="Vehicle & Customer">
            <Row gutter={[12, 8]}>
              <Col xs={24} sm={12} md={6}>
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

              <Col xs={24} sm={12} md={6}>
                <Form.Item label="Model" name="model" rules={[{ required: true }]}>
                  <Input placeholder="e.g., Honda Activa 6G" />
                </Form.Item>
              </Col>

              <Col xs={24} sm={12} md={6}>
                <Form.Item label="Colour" name="colour">
                  <Input />
                </Form.Item>
              </Col>

              <Col xs={24} sm={12} md={6}>
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

            <Row gutter={[12, 8]}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Customer Name" name="custName" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </Col>

              <Col xs={24} sm={12} md={8}>
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

              <Col xs={24} sm={24} md={8}>
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
            <Row gutter={[12, 8]}>
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

          {/* Follow-up */}
          <Card size="small" bordered style={{ marginTop: 12 }} title="Follow-up">
            <Row gutter={12}>
              <Col xs={24} md={8}>
                <Form.Item label="Schedule follow-up?" style={{ marginBottom: 0 }}>
                  <Checkbox
                    checked={!!followUpEnabled}
                    onChange={(e) => setFollowUpEnabled(e.target.checked)}
                  >
                    Enable
                  </Checkbox>
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Follow-up date & time" style={{ marginBottom: 0 }}>
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
                <Form.Item label="Notes" style={{ marginBottom: 0 }}>
                  <Input.TextArea
                    rows={1}
                    placeholder="Notes for this follow-up"
                    value={followUpNotes}
                    onChange={(e) => setFollowUpNotes(e.target.value)}
                    disabled={!followUpEnabled}
                  />
                </Form.Item>
              </Col>
            </Row>
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
              <Button onClick={() => setPostOpen(true)}>
                Post-service
              </Button>
            </Col>
          </Row>
        </Form>
        </div>
      </div>

      {/* Post-service modal: payment + actions */}
      <Modal
        title="Post-service"
        open={postOpen}
        onCancel={() => setPostOpen(false)}
        footer={null}
      >
        <div style={{ marginBottom: 12 }}>Select payment mode:</div>
        <Segmented
          value={postPayment}
          onChange={(v) => setPostPayment(v)}
          options={[{ label: 'Cash', value: 'cash' }, { label: 'Online', value: 'online' }]}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <Button onClick={() => setPostOpen(false)}>Cancel</Button>
          <Button onClick={() => handlePostServiceFlow(false)}>Save Only</Button>
          <Button type="primary" onClick={() => handlePostServiceFlow(true)}>Save & Print</Button>
        </div>
      </Modal>

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
    </>
  );
}
