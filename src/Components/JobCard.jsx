// JobCard.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  Alert,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Row,
  Typography,
  message,
  Select,
  Button,
  Segmented,
  Checkbox,
  Tooltip,
  Modal,
} from "antd";
import dayjs from "dayjs";
import { handleSmartPrint } from "../utils/printUtils";
import { FaWhatsapp } from "react-icons/fa";
import PreServiceSheet from "./PreServiceSheet";
import PostServiceSheet from "./PostServiceSheet";
import FetchJobcard from "./FetchJobcard";
import { saveJobcardViaWebhook, reserveJobcardSerial } from "../apiCalls/forms";
import { GetCurrentUser } from "../apiCalls/users";
import { getBranch, listBranchesPublic } from "../apiCalls/branches";
import { listUsersPublic } from "../apiCalls/adminUsers";

const { Title, Text } = Typography;
const { Option } = Select;

/* =========================
   CONFIG / CONSTANTS
   ========================= */

// Apps Script Web App URL (default set here; env can override)
// Default Job Card GAS URL
const DEFAULT_JOBCARD_GAS_URL =
  "https://script.google.com/macros/s/AKfycbw-_96BCshSZqrJqZDl2XveC0yVmLcwogwih6K_VNfrb-JiI1H-9y04z7eaeFlh7rwSWg/exec";
const JOBCARD_GAS_URL = import.meta.env.VITE_JOBCARD_GAS_URL || DEFAULT_JOBCARD_GAS_URL;

// Google Form constants removed — now using Apps Script webhook

// Branches
const BRANCHES = [
  "Byadarahalli",
  "Kadabagere",
  "Muddinapalya",
  "Andrahalli",
  "Tavarekere",
  "Hegganahalli",
  "Channenahalli",
  "Nelagadrahalli",
];

// Fallback list used for owner/admin executive dropdown when API not loaded
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

const SERVICE_TYPES = ["Free", "Paid"]; // checkbox UI (single-select enforced)
const VEHICLE_TYPES = ["Motorcycle", "Scooter"]; // tabs
const MECHANIC = ["Sonu", "Karthik", "ManMohan", "Mansur", "Irshad", "Dakshat", "Salman"];

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

const POST_LOCK_EMPTY = { locked: false, at: null, mobile: null, amount: null, mode: null };

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

// Resolve current logged-in staff phone (fallback empty string)
function getLoggedInPhone() {
  try {
    const raw = localStorage.getItem('user');
    const u = raw ? JSON.parse(raw) : null;
    const ph = String(u?.phone || '').replace(/\D/g,'');
    if (ph.length === 10) return `+91${ph}`.replace('+','');
    if (ph.length === 12 && ph.startsWith('91')) return ph;
    return '';
  } catch { return ''; }
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
  // Always use logged-in user's phone; ignore any legacy mappings
  const execPhone = getLoggedInPhone();
  const branch = vals?.branch || "—";
  const name = (vals?.custName ? String(vals.custName).trim() : "") || "Customer";
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

// Build a detailed post-service invoice WhatsApp/SMS message (Delivery Invoice)
function buildPostServiceMsg(vals, totals, labourRows, paymentsSummary = {}) {
  const jc = vals?.jcNo || "—";
  const reg = vals?.regNo || "—";
  const model = vals?.model || "";
  const colour = vals?.colour ? String(vals.colour).trim() : '';
  const kmStr = vals?.km ? String(vals.km).replace(/\D/g, '') : '';
  const branch = vals?.branch || "—";
  const exec = vals?.executive || "Team";
  const execPhone = getLoggedInPhone();

  const now = dayjs().format('DD/MM/YYYY');
  const line = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const money = (n) => inr(Math.round(Number(n || 0)));

  // Items
  const items = (labourRows || []).map((r, idx) => {
    const qty = Number(r?.qty || 0);
    const rate = Number(r?.rate || 0);
    const amt = qty * rate;
    const desc = String(r?.desc || '').trim() || 'Item';
    return `${idx + 1}. ${line(desc)} — ${qty} × ${money(rate)} = ${money(amt)}`;
  });

  // Totals
  const sub = money(totals?.labourSub || 0);
  const discValRaw = Math.max(0, Math.round(Number(totals?.labourDisc || 0)));
  const disc = money(discValRaw);
  const grand = money(totals?.grand || 0);

  // Payments
  const p = paymentsSummary || {};
  const paid = money(p?.collectedAmount || 0);
  const cashStr = p?.cashCollected ? money(p.cashCollected) : '';
  const onlineStr = p?.onlineCollected ? money(p.onlineCollected) : '';
  const utr = Array.isArray(p?.payments)
    ? p.payments
        .filter(x => String(x.mode).toLowerCase() === 'online' && x.utr)
        .map(x => String(x.utr).trim())
        .filter(Boolean)
        .join(' / ')
    : '';
  const payMode = p?.paymentMode ? String(p.paymentMode).toUpperCase() : '';
  // Compute next service due km (simple km+2000 rule when KM available)
  let nextServiceKm = '';
  const kmNum = Number(kmStr || '');
  if (Number.isFinite(kmNum) && kmNum > 0) {
    nextServiceKm = String(kmNum + 2000);
  }
  const discountLine = discValRaw > 0 ? `Discount: ${disc}` : '';

  // Payment block
  const payHeader = `💳 *Mode Of Payment (${payMode || 'NA'})*`;
  const payLines = [];
  if (cashStr) payLines.push(`• Cash: ${cashStr}`);
  if (onlineStr) payLines.push(`• Online: ${onlineStr}${utr ? ` (UTR: ${utr})` : ''}`);
  if (!payLines.length) {
    payLines.push(`• Total Paid: ${paid}`);
  } else {
    payLines.push(`• Total Paid: ${paid}`);
  }
  const payBlock = [
    payHeader,
    ...payLines,
  ];

  // Final WhatsApp message following the requested template
  const lines = [
    `⭐️ *Shantha Motors* — ಶಾಂತ ಮೋಟರ್ಸ್`,
    `Multi Brand Two Wheeler Sales & Service`,
    `────────────────────────`,
    `*✔️ Service Invoice*`,
    ``,
    `📅 Date: ${now}`,
    `🧾 JC No: ${jc}`,
    ``,
    `🏍️ *Vehicle Details*`,
    `• Vehicle: ${reg}${model ? ` (${model})` : ''}${colour ? ` • ${colour}` : ''}`,
    ...(kmStr ? [`• Odometer Reading: ${kmStr} km`] : []),
    ...(nextServiceKm ? [`• *Next Service Due:* ${nextServiceKm} km`] : []),
    ``,
    `────────────────────────`,
    ``,
    `🛠️ *Service Details*`,
    ...(items.length ? items.map((s) => `• ${s}`) : ['• —']),
    ``,
    `Subtotal: ${sub}`,
    ...(discountLine ? [discountLine] : []),
    `💰 *Final Bill Amount:* ${grand}`,
    ``,
    `────────────────────────`,
    ``,
    ...payBlock,
    ``,
    `────────────────────────`,
    ``,
    `🙏 Thank you for choosing *Shantha Motors*!`,
    `ಧನ್ಯವಾದಗಳು ❤️`,
    `— ${exec}, ${branch}${execPhone ? ` (☎️ ${execPhone})` : ''}`,
  ];

  return lines.join('\n');
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
  const [allowedBranches, setAllowedBranches] = useState([]); // [{id,name,code}]
  const [canSwitch, setCanSwitch] = useState(false);
  const [defaultExecutiveName, setDefaultExecutiveName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [branchId, setBranchId] = useState("");
  const [execOptions, setExecOptions] = useState([]); // [{name, phone}]
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
  const [prePrinting, setPrePrinting] = useState(false); // lock Pre-service print
  const [postSaving, setPostSaving] = useState(false); // lock Post-service save/print
  // Split payments: two slots
  const [postPay1Mode, setPostPay1Mode] = useState('cash'); // default Cash
  const [postPay1Amt, setPostPay1Amt] = useState('');
  const [postPay1Utr, setPostPay1Utr] = useState('');
  const [postPay2Mode, setPostPay2Mode] = useState('online'); // default Online
  const [postPay2Amt, setPostPay2Amt] = useState('');
  const [postPay2Utr, setPostPay2Utr] = useState('');
  const [postServiceLock, setPostServiceLock] = useState(POST_LOCK_EMPTY);
  const [actionCooldownUntil, setActionCooldownUntil] = useState(0);
  const startActionCooldown = (ms = 6000) => {
    const until = Date.now() + ms;
    setActionCooldownUntil(until);
    setTimeout(() => setActionCooldownUntil(0), ms + 50);
  };
  // Follow-up state (similar to Quotation)
  const [, setFollowUpEnabled] = useState(false);
  const [, setFollowUpAt] = useState(() => dayjs().add(2, 'day').hour(10).minute(0).second(0).millisecond(0));
  const [, setFollowUpNotes] = useState("");

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
        const toCaps = (s) => String(s || '').trim().toUpperCase();
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
          const staffNameRaw = user?.formDefaults?.staffName || user?.name || undefined;
          const staffName = staffNameRaw ? toCaps(staffNameRaw) : undefined;
          const role = user?.role ? String(user.role).toLowerCase() : undefined;
          // who can switch branches
          const can = Boolean(user?.canSwitchBranch) || ["owner","admin"].includes(String(role||'').toLowerCase());
          setCanSwitch(can);
          // Build allowed branch list
          try {
            const roleLc = String(role || '').toLowerCase();
            if (["owner","admin"].includes(roleLc)) {
              // Owners/Admins: load all branches and staff list for executive dropdown
              try {
                const res = await listBranchesPublic({ limit: 500 });
                if (res?.success && Array.isArray(res?.data?.items)) {
                  const all = res.data.items.map((b) => ({
                    id: String(b.id || b._id || ''),
                    name: toCaps(b.name),
                    code: b.code ? String(b.code).toUpperCase() : '',
                  }));
                  setAllowedBranches(all);
                }
              } catch { /* ignore */ }
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
                const nameRaw = typeof b === 'string' ? '' : (b?.name || '');
                const name = toCaps(nameRaw);
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
          let branchName = user?.formDefaults?.branchName ? toCaps(user.formDefaults.branchName) : undefined;
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
          // Only set defaults if fields are empty to avoid overwriting
          // prefilled values when opened from Follow-Ups → Post Service
          const patch = {};
          try {
            const existing = form.getFieldsValue(["branch", "executive"]) || {};
            if (!existing?.executive && staffName) patch.executive = staffName;
            if (!existing?.branch && branchName) patch.branch = branchName;
          } catch { /* noop */ }
          if (Object.keys(patch).length) form.setFieldsValue(patch);
          if (branchName) setDefaultBranchName(branchName);
          if (staffName) setDefaultExecutiveName(staffName);
        }
      } catch (e) { void e; }
    })();
  }, [form]); // branchCode intentionally excluded; we want this to run once on mount

  // Removed JC number prefetch to avoid increments on refresh

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
          //dfn
        }
      }
    } catch {
      //sd
    }
  };

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

  const postLockTimeLabel = useMemo(() => {
    const raw = postServiceLock.at;
    if (!raw) return "";
    const d = dayjs(raw);
    if (d.isValid()) return d.format("DD/MM/YYYY HH:mm");
    return String(raw);
  }, [postServiceLock.at]);
  const isPostLocked = !!postServiceLock.locked;

  // --- Post-service live summary (Payable / Collected / Due) ---
  const postCollectedPreview = useMemo(() => {
    const a1 = Number(postPay1Amt || 0) || 0;
    const a2 = Number(postPay2Amt || 0) || 0;
    return Math.round(a1 + a2);
  }, [postPay1Amt, postPay2Amt]);
  const postPayablePreview = useMemo(() => Math.round(Number(totals?.grand || 0)), [totals]);
  const postDuePreview = useMemo(() => postPayablePreview - postCollectedPreview, [postCollectedPreview, postPayablePreview]);

  const handleKmKeyPress = (e) => { if (!/[0-9]/.test(e.key)) e.preventDefault(); };
  const handleMobileKeyPress = (e) => { if (!/[0-9]/.test(e.key)) e.preventDefault(); };
  const handleMobileChange = (e) => {
    const val = e.target.value;
    if (!/^\d*$/.test(val)) return;
    if (val.length > 10) return;
    if (postServiceLock.locked && postServiceLock.mobile && postServiceLock.mobile !== val) {
      setPostServiceLock(POST_LOCK_EMPTY);
    }
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
    if (Date.now() < actionCooldownUntil) return;
    startActionCooldown(6000);
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
        // follow-up removed per request
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
          
          custName: String(vals.custName || "").trim(),
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
      message.success({ content: "Saved successfully", key: "autosave", duration: 1.5 });
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
  const handlePostServiceFlow = async (mode) => {
    try {
      setPostSaving(true);
      // Ensure spinner paints before heavy work
      await new Promise((r) => setTimeout(r, 0));
      if (Date.now() < actionCooldownUntil) return;
      startActionCooldown(6000);
      // Do not auto pre-save here to avoid duplicate rows in sheet.
      // Server-side 'postService' should upsert/update the existing record.
      const valsNow = form.getFieldsValue(true);
      const mobile10 = String(valsNow.custMobile || '').replace(/\D/g, '').slice(-10);
      if (mobile10.length !== 10) {
        message.error('Enter a valid 10-digit mobile number.');
        return;
      }

      // Ensure JC number exists (reserve by mobile if missing)
      let jcNo = valsNow.jcNo;
      const jcPattern = /^JC-[A-Z]+-[A-Z0-9]{6}$/;
      if (!jcPattern.test(String(jcNo || '').trim())) {
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
      const _rawobsOneLine = String(valsNow.obs || '').replace(/\s*\r?\n\s*/g, ' # ').trim();

      // Build split payments
      const a1 = Number(postPay1Amt || 0) || 0;
      const a2 = Number(postPay2Amt || 0) || 0;
      const anyAmt = a1 > 0 || a2 > 0;
      if (!anyAmt) {
        message.error('Enter amount for Cash or Online (at least one).');
        return;
      }
      // If any online slot has positive amount, UTR is required
      if (postPay1Mode === 'online' && a1 > 0) {
        const u = String(postPay1Utr || '').trim();
        if (u.length < 4) { message.error('Enter UTR for Online (Slot 1).'); return; }
      }
      if (postPay2Mode === 'online' && a2 > 0) {
        const u = String(postPay2Utr || '').trim();
        if (u.length < 4) { message.error('Enter UTR for Online (Slot 2).'); return; }
      }

      const payments = [];
      if (a1 > 0) payments.push({ amount: Math.round(a1), mode: postPay1Mode, ...(postPay1Mode === 'online' ? { utr: String(postPay1Utr || '').trim() } : {}) });
      if (a2 > 0) payments.push({ amount: Math.round(a2), mode: postPay2Mode, ...(postPay2Mode === 'online' ? { utr: String(postPay2Utr || '').trim() } : {}) });
      const collectedAmount = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const modes = Array.from(new Set(payments.map(p => p.mode)));
      const paymentMode = modes.length > 1 ? 'mixed' : (modes[0] || '');
      const onlineUtrs = payments.filter(p => p.mode === 'online' && p.utr).map(p => p.utr);
      const joinedUtr = onlineUtrs.join(' / ');
      const cashCollected = payments.filter(p=>String(p.mode).toLowerCase()==='cash').reduce((s,p)=>s+(Number(p.amount)||0),0);
      const onlineCollected = payments.filter(p=>String(p.mode).toLowerCase()==='online').reduce((s,p)=>s+(Number(p.amount)||0),0);

      // Enforce full collection: collected should equal amount payable (after discount)
      const payable = Math.round(Number(amount || 0));
      if (collectedAmount !== payable) {
        const diff = payable - collectedAmount;
        const txt = `Payable: ₹${payable}. Collected: ₹${collectedAmount}. ${diff > 0 ? 'Pending' : 'Excess'}: ₹${Math.abs(diff)}.`;
        try {
          Modal.warning({ title: 'Please collect full amount', content: txt });
        } catch { /* ignore */ }
        message.error(`Please collect full amount. ${txt}`);
        return;
      }

      // Minimal post-service payload per requirement (plus payments)
      const payload = {
        postServiceAt: new Date().toISOString(),
        formValues: {
          mechanic: valsNow.mechanic || '',
          executive: valsNow.executive || '',
          model: valsNow.model || '',
          colour: valsNow.colour || '',
          km: kmOnlyDigits || '',
          fuelLevel: valsNow.fuelLevel || '',
          vehicleType: valsNow.vehicleType || '',
          floorMat: floorMatStr,
          expectedDelivery: valsNow.expectedDelivery ? dayjs(valsNow.expectedDelivery).format('DD/MM/YYYY') : '',
          // Persist observation for later fetch/print (flatten newlines)
          obs: _rawobsOneLine,
        },
        labourRows: labourRows || [],
        totals,
      };

      // Optimistic: queue background post-service save
      message.success({ key: 'postsave', content: 'Saved successfully' });
      const expectedDeliveryStr = valsNow.expectedDelivery
        ? dayjs(valsNow.expectedDelivery).format('DD/MM/YYYY')
        : '';
      const data = {
        mobile: mobile10,
        jcNo,
        serviceAmount: amount,
        collectedAmount,
        paymentMode,
        payments,
        utr: joinedUtr || undefined,
        utrNo: joinedUtr || undefined,
        payload: { ...payload, payments },
        // Important: also send minimal formValues so Apps Script can
        // upsert name/mobile into the Job Card sheet and StaffLedger.
        // Without this, rows created via postService (without a prior save)
        // end up missing Customer Name in StaffLedger.
        formValues: {
          custName: String(valsNow.custName || ''),
          custMobile: mobile10,
          branch: String(valsNow.branch || ''),
          executive: String(valsNow.executive || ''),
          regNo: String(valsNow.regNo || ''),
          serviceType: String(valsNow.serviceType || ''),
          vehicleType: String(valsNow.vehicleType || ''),
          // Added for full mapping when posting without pre-service
          mechanic: String(valsNow.mechanic || ''),
          model: String(valsNow.model || ''),
          colour: String(valsNow.colour || ''),
          km: kmOnlyDigits || '',
          fuelLevel: String(valsNow.fuelLevel || ''),
          expectedDelivery: expectedDeliveryStr,
          // Write Customer Observation into sheet column
          obs: _rawobsOneLine,
        },
        source: 'jobcard',
        cashCollected,
        onlineCollected,
        totalCollected: collectedAmount,
      };
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

      if (mode === true || mode === 'print') {
        await new Promise((r) => setTimeout(r, 50));
        await handlePrint('post');
      } else if (mode === 'whatsapp') {
        try {
          const mobileE164 = normalizeINPhone(valsNow.custMobile);
          if (!mobileE164) {
            message.error('Enter a valid 10-digit mobile number (India).');
          } else {
            const paymentsSummary = {
              payments,
              collectedAmount,
              cashCollected,
              onlineCollected,
              paymentMode,
            };
            const msg = buildPostServiceMsg(valsNow, totals, labourRows, paymentsSummary);
            message.loading({ key: 'postshare', content: 'Preparing WhatsApp message…' });
            openWhatsAppOrSMS({
              mobileE164,
              text: msg,
              onFailToWhatsApp: () => {
                message.info({
                  key: 'postshare',
                  content: 'WhatsApp may not be available. Falling back to SMS composer…',
                  duration: 2,
                });
              },
            });
            setTimeout(() => {
              message.success({ key: 'postshare', content: 'Ready to send.', duration: 2 });
            }, 800);
          }
        } catch { /* ignore share errors */ }
      }
      setPostOpen(false);
      setPostPay1Amt('');
      setPostPay1Utr('');
      setPostPay2Amt('');
      setPostPay2Utr('');

      // After a successful post-service action, reset the Job Card form
      try {
        // Clear form to a fresh state with current timestamp and default branch/executive
        form.resetFields();
        const fresh = {
          ...initialFormValues,
          createdAt: dayjs(),
          expectedDelivery: null,
          branch: defaultBranchName || undefined,
          executive: defaultExecutiveName || undefined,
          jcNo: '',
          labourRows: [],
          discounts: { labour: 0 },
          gstLabour: DEFAULT_GST_LABOUR,
        };
        form.setFieldsValue(fresh);
        setServiceTypeLocal(null);
        setVehicleTypeLocal(null);
        setRegDisplay('');
        setFollowUpEnabled(false);
        setFollowUpAt(null);
        setFollowUpNotes('');
        setPostServiceLock(POST_LOCK_EMPTY);
        // Recompute button enablement for new form
        recomputeReady();
        message.success('Ready for the next Job Card');
      } catch { /* ignore reset errors */ }
    } catch (e) {
      console.warn('post-service save error:', e);
      message.error((e && e.message) || 'Could not save post-service details.');
    } finally {
      setPostSaving(false);
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
      if (Date.now() < actionCooldownUntil) return;
      startActionCooldown(6000);
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
      setPrePrinting(true);
      // Ensure spinner paints before heavy work
      await new Promise((r) => setTimeout(r, 0));
      await handleAutoSave(); // will throw if invalid
      await handlePrint("pre");
    } catch {
      // validation error already shown
    } finally {
      setPrePrinting(false);
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
                setPostServiceLock={setPostServiceLock}
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
                <Form.Item 
                  label="Customer Name" 
                  name="custName" 
                  rules={[{ required: true, whitespace: true, message: 'Please enter customer name' }]}
                  getValueFromEvent={(e) => {
                    const v = e?.target?.value ?? e; 
                    return typeof v === 'string' ? v.toUpperCase() : v;
                  }}
                >
                  <Input placeholder="e.g., RAHUL SHARMA" style={{ textTransform: 'uppercase' }} />
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

              {/* Call Status removed per request */}

              <Col xs={24}>
                <Form.Item label="Customer Observation (additional notes)" name="obs">
                  <Input.TextArea rows={3} placeholder="Write the customer's observations..." />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {isPostLocked && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 12 }}
              message="Post-service already completed"
              description={`Service & labour editing is locked${postLockTimeLabel ? ` (completed on ${postLockTimeLabel})` : ""}. Enter a different mobile number to start a new job card.`}
            />
          )}

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
                    disabled={isPostLocked}
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
                      disabled={isPostLocked}
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
                      disabled={isPostLocked}
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
                  <Segmented className="blue-segmented" block options={FUEL_LEVELS} disabled={isPostLocked} />
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
                            <Input placeholder="Labour description" disabled={isPostLocked} />
                          </Form.Item>
                        </Col>
                        <Col span={4}>
                          <Form.Item
                            {...rest}
                            name={[name, "qty"]}
                            initialValue={1}
                            rules={[{ required: true }]}
                          >
                            <InputNumber min={1} style={{ width: "100%" }} disabled={isPostLocked} />
                          </Form.Item>
                        </Col>
                        <Col span={4}>
                          <Form.Item {...rest} name={[name, "rate"]} rules={[{ required: true }]}>
                            <InputNumber min={0} style={{ width: "100%" }} disabled={isPostLocked} />
                          </Form.Item>
                        </Col>
                        <Col span={4} style={{ textAlign: "right" }}>
                          <Text>{inr(amt)}</Text>
                          <Button type="link" danger onClick={() => remove(name)} style={{ paddingLeft: 8 }} disabled={isPostLocked}>
                            Remove
                          </Button>
                        </Col>
                      </Row>
                    );
                  })}

                  <Button onClick={() => add({ qty: 1 })} disabled={isPostLocked}>Add labour</Button>
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
                <InputNumber min={0} max={28} disabled={isPostLocked} />
              </Form.Item>
              <div style={{ textAlign: "right" }}>{inr(totals.labourGST)}</div>

              <div>Discount (Labour)</div>
              <Form.Item name={["discounts", "labour"]} style={{ marginBottom: 0 }}>
                <InputNumber min={0} disabled={isPostLocked} />
              </Form.Item>

              <div style={{ fontWeight: 700 }}>Grand Total</div>
              <div style={{ textAlign: "right", fontWeight: 700 }}>{inr(totals.grand)}</div>
            </div>
          </Card>

          {/* Follow-up section removed per request */}

          {/* ACTION BUTTONS — gated by isReady */}
          <Row justify="end" style={{ marginTop: 12 }} gutter={8}>
            <Col>
              <Tooltip title={isReady ? "" : (notReadyWhy || "Fill all required fields")} placement="top">
              <Button
                  type="default"
                  icon={<FaWhatsapp style={{ color: "#25D366" }} />}
                  onClick={handleShareWhatsApp}
                  disabled={!isReady || actionCooldownUntil > Date.now()}
                >
                  WhatsApp/SMS
                </Button>
              </Tooltip>
            </Col>

            <Col>
              <Tooltip title={isReady ? "" : (notReadyWhy || "Fill all required fields")} placement="top">
                <Button type="primary" onClick={handlePreService} disabled={!isReady || actionCooldownUntil > Date.now() || prePrinting} loading={prePrinting} /* ★ */>
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

      {/* Post-service modal: split payments (two slots) + actions */}
      <Modal
        title="Post-service"
        open={postOpen}
        onCancel={() => setPostOpen(false)}
        footer={null}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          {/* Slot 1 */}
          <Card size="small" bordered>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ marginBottom: 6 }}>Amount (₹)</div>
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={postPay1Amt}
                  onChange={(e) => setPostPay1Amt(e.target.value.replace(/[^0-9.]/g,''))}
                />
              </div>
              <div>
                <div style={{ marginBottom: 6 }}>Mode</div>
                <Segmented value={postPay1Mode} onChange={setPostPay1Mode} options={[{ label: 'Cash', value: 'cash' }, { label: 'Online', value: 'online' }]} />
              </div>
            </div>
            {postPay1Mode === 'online' && (
              <div style={{ marginTop: 10 }}>
                <div style={{ marginBottom: 6, fontSize: 12, color: '#374151' }}>UTR No. (Slot 1)</div>
                <Input placeholder="Enter UTR number" value={postPay1Utr} onChange={(e)=>setPostPay1Utr(String(e.target.value || '').toUpperCase())} maxLength={32} style={{ textTransform: 'uppercase' }} />
              </div>
            )}
          </Card>

          {/* Slot 2 */}
          <Card size="small" bordered>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ marginBottom: 6 }}>Amount (₹)</div>
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={postPay2Amt}
                  onChange={(e) => setPostPay2Amt(e.target.value.replace(/[^0-9.]/g,''))}
                />
              </div>
              <div>
                <div style={{ marginBottom: 6 }}>Mode</div>
                <Segmented value={postPay2Mode} onChange={setPostPay2Mode} options={[{ label: 'Cash', value: 'cash' }, { label: 'Online', value: 'online' }]} />
              </div>
            </div>
            {postPay2Mode === 'online' && (
              <div style={{ marginTop: 10 }}>
                <div style={{ marginBottom: 6, fontSize: 12, color: '#374151' }}>UTR No. (Slot 2)</div>
                <Input placeholder="Enter UTR number" value={postPay2Utr} onChange={(e)=>setPostPay2Utr(String(e.target.value || '').toUpperCase())} maxLength={32} style={{ textTransform: 'uppercase' }} />
              </div>
            )}
          </Card>
        </div>
        {/* Live payable/collection summary */}
        <div style={{ marginTop: 8, fontSize: 13, color: postDuePreview === 0 ? '#166534' : '#b91c1c' }}>
          <strong>Payable:</strong> {inr(postPayablePreview)} &nbsp;|
          &nbsp;<strong>Collected:</strong> {inr(postCollectedPreview)} &nbsp;|
          &nbsp;<strong>{postDuePreview >= 0 ? 'Due' : 'Excess'}:</strong> {inr(Math.abs(postDuePreview))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <Button onClick={() => setPostOpen(false)} disabled={postSaving}>Cancel</Button>
          <Button onClick={() => handlePostServiceFlow(false)} disabled={postSaving || actionCooldownUntil > Date.now() || postDuePreview !== 0} loading={postSaving}>Save</Button>
          <Button icon={<FaWhatsapp style={{ color: '#25D366' }} />} onClick={() => handlePostServiceFlow('whatsapp')} disabled={postSaving || actionCooldownUntil > Date.now() || postDuePreview !== 0} loading={postSaving}>WhatsApp</Button>
          <Button type="primary" onClick={() => handlePostServiceFlow(true)} disabled={postSaving || actionCooldownUntil > Date.now() || postDuePreview !== 0} loading={postSaving}>Print</Button>
          
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
