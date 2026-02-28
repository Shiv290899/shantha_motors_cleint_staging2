import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Table, Grid, Space, Button, Select, Input, Tag, Typography, message, DatePicker, Modal, Tooltip, Popover, Row, Col, Card } from "antd";
import useDebouncedValue from "../hooks/useDebouncedValue";
import { saveBookingViaWebhook } from "../apiCalls/forms";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { exportToCsv } from "../utils/csvExport";
import { normalizeKey, uniqCaseInsensitive, toKeySet } from "../utils/caseInsensitive";

const { Text } = Typography;

// Head aliases for common quotation sheet headers
const HEAD = {
  ts: ["Timestamp", "Time", "Date"],
  name: ["Customer_Name", "Customer", "Name"],
  mobile: ["Mobile", "Phone", "Mobile Number"],
  branch: ["Branch"],
  executive: ["Executive", "Executive_Name", "Executive Name"],
  serialNo: ["Quotation No.", "Quotation No", "Serial", "Serial No", "Quote Id", "Quotation_ID", "Quotation ID"],
  company: ["Company"],
  model: ["Model", "Bike Model"],
  variant: ["Variant"],
  price: ["On-Road Price", "On Road Price", "Price"],
  offerings: ["Offerings", "Remarks", "Remark", "Quotation Remarks"],
  payload: ["Payload"],
  status: ["Status", "FollowUp Status", "Quotation Status"],
  followUpNotes: ["Follow-up Notes", "Follow Up Notes", "Followup Notes", "Notes"],
};

const pick = (obj, aliases) => String(aliases.map((k) => obj[k] ?? "").find((v) => v !== "") || "").trim();

const rupeeFormatter =
  typeof Intl !== 'undefined'
    ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : null;

const formatCurrency = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const num = Number(value);
  const formatted = rupeeFormatter ? rupeeFormatter.format(Math.abs(num)) : String(Math.abs(num));
  return `${num < 0 ? '-' : ''}₹${formatted}`;
};

const QUOT_RATE_LOW = 9;
const QUOT_RATE_HIGH = 11;
const QUOT_PROCESSING_FEE = 8000;

const rateForQuotation = (price, dp) => {
  const p = Number(price || 0);
  const d = Number(dp || 0);
  const dpPct = p > 0 ? d / p : 0;
  return dpPct >= 0.3 ? QUOT_RATE_LOW : QUOT_RATE_HIGH;
};

const monthlyForQuotation = (price, dp, months) => {
  const principalBase = Math.max(Number(price || 0) - Number(dp || 0), 0);
  const principal = principalBase + QUOT_PROCESSING_FEE;
  const years = months / 12;
  const rate = rateForQuotation(price, dp);
  const totalInterest = principal * (rate / 100) * years;
  const total = principal + totalInterest;
  return months > 0 ? total / months : 0;
};

const tenuresForSet = (s) => (String(s || "") === "12" ? [12, 18, 24, 36] : [24, 30, 36, 48]);

const buildEmiText = (price, dp, emiSet) => {
  const tenures = tenuresForSet(emiSet);
  if (!Number(price || 0)) return "";
  const parts = tenures.map((mo) => `${mo}:${formatCurrency(monthlyForQuotation(price, dp, mo))}`);
  return parts.length ? `EMI(${emiSet || "12"}): ${parts.join(" | ")}` : "";
};

const normalizePurchaseMode = (value) => String(value || "").trim().toLowerCase();
const isFinancedMode = (value) => ["loan", "nohp", "hp", "finance"].includes(normalizePurchaseMode(value));

const buildQuotationOfferingsText = ({ payload, baseOfferings }) => {
  const remarks = String(baseOfferings || '').trim();
  if (!payload || typeof payload !== 'object') return remarks;
  const fv = payload.formValues || {};
  const extra = Array.isArray(payload.extraVehicles) ? payload.extraVehicles : [];
  const globalMode = fv.mode ?? payload.mode ?? payload.purchaseMode ?? payload.purchaseType ?? payload.paymentType ?? "cash";
  const offerings = [];
  const addVehicleOffer = (label, priceRaw, dpRaw, emiSetRaw, modeRaw) => {
    const price = Number(priceRaw || 0);
    const dp = Number(dpRaw || 0);
    if (!(price || dp)) return;
    const showFinance = isFinancedMode(modeRaw ?? globalMode);
    const parts = [];
    if (price) parts.push(`Price ${formatCurrency(price)}`);
    if (showFinance && dp) parts.push(`DP ${formatCurrency(dp)}`);
    const emiText = showFinance ? buildEmiText(price, dp, emiSetRaw || payload.emiSet || "12") : "";
    if (showFinance && emiText) parts.push(emiText);
    offerings.push(`${label}: ${parts.join(" | ")}`);
  };
  addVehicleOffer(
    "V1",
    fv.onRoadPrice ?? payload.onRoadPrice,
    fv.downPayment ?? payload.downPayment,
    payload.emiSet,
    fv.mode ?? payload.mode ?? payload.purchaseMode ?? payload.purchaseType ?? payload.paymentType
  );
  extra.forEach((ev, idx) => {
    addVehicleOffer(
      `V${idx + 2}`,
      ev.onRoadPrice,
      ev.downPayment,
      ev.emiSet || payload.emiSet,
      ev.mode ?? ev.purchaseMode ?? ev.purchaseType ?? ev.paymentType
    );
  });
  return [remarks, ...offerings].filter(Boolean).join(" • ");
};

const uniqueNonEmpty = (list = []) =>
  Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );

const buildQuotationOfferingDetails = ({
  payload,
  baseOfferings,
  fallbackText,
  fallbackCompany,
  fallbackModel,
  fallbackVariant,
}) => {
  const remarks = String(baseOfferings || "").trim();
  const vehicles = [];
  if (payload && typeof payload === "object") {
    const fv = payload.formValues || {};
    const globalFittings = uniqueNonEmpty(payload.fittings);
    const globalMode = fv.mode ?? payload.mode ?? payload.purchaseMode ?? payload.purchaseType ?? payload.paymentType ?? "cash";
    const addVehicle = ({
      label,
      company,
      model,
      variant,
      priceRaw,
      dpRaw,
      emiSetRaw,
      fittingsRaw,
      modeRaw,
    }) => {
      const cleanCompany = String(company || "").trim();
      const cleanModel = String(model || "").trim();
      const cleanVariant = String(variant || "").trim();
      const price = Number(priceRaw || 0);
      const dp = Number(dpRaw || 0);
      const fittings = uniqueNonEmpty(fittingsRaw || globalFittings);
      const title = [cleanCompany, cleanModel, cleanVariant].filter(Boolean).join(" ");
      const hasData = Boolean(title || fittings.length || price || dp);
      const showFinance = isFinancedMode(modeRaw ?? globalMode);
      if (!hasData) return;
      vehicles.push({
        label,
        title: title || "Vehicle details not available",
        priceText: price ? formatCurrency(price) : "—",
        dpText: dp ? formatCurrency(dp) : "—",
        emiText: showFinance && price ? buildEmiText(price, dp, emiSetRaw || payload.emiSet || "12") : "",
        fittings,
        showFinance,
      });
    };

    addVehicle({
      label: "Vehicle 1",
      company: fv.company ?? payload.company ?? fallbackCompany,
      model: fv.bikeModel ?? fv.model ?? payload.model ?? fallbackModel,
      variant: fv.variant ?? payload.variant ?? fallbackVariant,
      priceRaw: fv.onRoadPrice ?? payload.onRoadPrice,
      dpRaw: fv.downPayment ?? payload.downPayment,
      emiSetRaw: payload.emiSet,
      fittingsRaw: payload.fittings,
      modeRaw: fv.mode ?? payload.mode ?? payload.purchaseMode ?? payload.purchaseType ?? payload.paymentType,
    });
    const extra = Array.isArray(payload.extraVehicles) ? payload.extraVehicles : [];
    extra.forEach((ev, idx) => {
      addVehicle({
        label: `Vehicle ${idx + 2}`,
        company: ev.company,
        model: ev.model,
        variant: ev.variant,
        priceRaw: ev.onRoadPrice,
        dpRaw: ev.downPayment,
        emiSetRaw: ev.emiSet || payload.emiSet,
        fittingsRaw: ev.fittings,
        modeRaw: ev.mode ?? ev.purchaseMode ?? ev.purchaseType ?? ev.paymentType,
      });
    });
  }

  if (!vehicles.length && fallbackText) {
    const parts = String(fallbackText)
      .split("•")
      .map((x) => x.trim())
      .filter(Boolean);
    parts.forEach((part) => {
      const m = part.match(/^V(\d+)\s*:\s*(.+)$/i);
      if (!m) return;
      vehicles.push({
        label: `Vehicle ${m[1]}`,
        title: m[2],
        priceText: "—",
        dpText: "—",
        emiText: "",
        fittings: [],
        showFinance: false,
      });
    });
  }

  return { remarks, vehicles };
};

export default function Quotations() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryRows, setSummaryRows] = useState([]);
  const [branchFilter, setBranchFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all"); // cash | loan | all
  const [statusFilter, setStatusFilter] = useState("all");
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);
  const [dateRange, setDateRange] = useState(() => [dayjs().startOf('month'), dayjs()]); // [dayjs, dayjs]
  const [quickKey, setQuickKey] = useState(null); // today | yesterday | null
  const [userRole, setUserRole] = useState("");
  const [allowedBranches, setAllowedBranches] = useState([]);
  // Controlled pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [renderMode, setRenderMode] = useState('pagination');
  const [loadedCount, setLoadedCount] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  // Default to server pagination so no env is required
  const USE_SERVER_PAG = String((import.meta.env.VITE_USE_SERVER_PAGINATION ?? 'true')).toLowerCase() === 'true';
  const [remarksMap, setRemarksMap] = useState({}); // key: serialNo -> { level, text }
  const [remarkModal, setRemarkModal] = useState({ open: false, refId: '', level: 'ok', text: '' });
  const [hasCache, setHasCache] = useState(false);
  const [filterSourceRows, setFilterSourceRows] = useState([]); // full list for dropdown options

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return;
      const u = JSON.parse(raw);
      setUserRole(String(u?.role || '').toLowerCase());
      const list = [];
      const pb = u?.formDefaults?.branchName || u?.primaryBranch?.name || '';
      if (pb) list.push(pb);
      if (Array.isArray(u?.branches)) {
        u.branches.forEach((b)=>{ const nm = typeof b === 'string' ? b : (b?.name || ''); if (nm) list.push(nm); });
      }
      setAllowedBranches(Array.from(new Set(list.filter(Boolean))));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const isPriv = ["owner","admin","backend"].includes(userRole);
    if (!isPriv && allowedBranches.length && branchFilter === 'all') {
      setBranchFilter(allowedBranches[0]);
    }
  }, [userRole, allowedBranches, branchFilter]);

  const cacheKey = (() => {
    const start = dateRange && dateRange[0] ? dateRange[0].startOf('day').valueOf() : '';
    const end = dateRange && dateRange[1] ? dateRange[1].endOf('day').valueOf() : '';
    return `Quotations:list:${JSON.stringify({ branchFilter, modeFilter, statusFilter, q: debouncedQ||'', start, end, page, pageSize, USE_SERVER_PAG })}`;
  })();

  const gasConfig = useMemo(() => {
    const DEFAULT_QUOT_URL =
      "https://script.google.com/macros/s/AKfycbxXtfRVEFeaKu10ijzfQdOVlgkZWyH1q1t4zS3PHTX9rQQ7ztRJdpFV5svk98eUs3UXuw/exec";
    const GAS_URL = import.meta.env.VITE_QUOTATION_GAS_URL || DEFAULT_QUOT_URL;
    const SECRET = import.meta.env.VITE_QUOTATION_GAS_SECRET || '';
    return { GAS_URL, SECRET };
  }, []);

  const mapRow = useCallback((o, idx = 0) => {
    const obj = (o && o.values) ? o.values : o; // support {values,payload}
    const payloadRaw = (o && o.payload) ? o.payload : (obj ? obj[HEAD.payload[0]] : undefined) || '';
    let payload = null;
    try { payload = typeof payloadRaw === 'object' ? payloadRaw : JSON.parse(String(payloadRaw || '{}')); } catch { payload = null; }
    const fv = (payload && payload.formValues) ? payload.formValues : {};
    const tsFallback = pick(obj, HEAD.ts);
    const createdTs = String(
      fv.createdAt ||
      (payload && (
        payload.createdAt ||
        payload.created_at ||
        payload.createdOn ||
        payload.created_on ||
        payload.quoteCreatedAt ||
        payload.quotationCreatedAt
      )) ||
      obj['Created At'] ||
      obj['CreatedAt'] ||
      obj['Quotation Created At'] ||
      obj['Quotation Created'] ||
      obj['Created Time'] ||
      tsFallback ||
      ''
    ).trim();
    const mode = (payload && payload.mode) || '';
    const status = (payload && payload.followUp && payload.followUp.status) || pick(obj, HEAD.status) || '';
    const brand = (payload && payload.brand) || '';
    const company = fv.company || pick(obj, HEAD.company);
    const model = fv.bikeModel || fv.model || pick(obj, HEAD.model);
    const variant = fv.variant || pick(obj, HEAD.variant);
    const price = String(fv.onRoadPrice || pick(obj, HEAD.price) || '').trim();
    const offeringsBase = String(
      fv.remarks ||
      (payload && payload.remarks) ||
      pick(obj, HEAD.offerings) ||
      ''
    ).trim();
    const offerings = buildQuotationOfferingsText({ payload, baseOfferings: offeringsBase });
    const followUpNotes = String(
      (payload && payload.followUp && payload.followUp.notes) ||
      (payload && payload.closeNotes) ||
      (payload && payload.followupNotes) ||
      (payload && payload.notes) ||
      pick(obj, HEAD.followUpNotes) ||
      ''
    ).trim();
    const remarkLevelRaw = (payload && payload.remark && payload.remark.level) || obj.RemarkLevel || obj.remarkLevel || '';
    const remarkTextRaw = (payload && payload.remark && payload.remark.text) || obj.RemarkText || obj.remarkText || '';
    const remarkLevelNorm = String(remarkLevelRaw || '').toLowerCase();
    return {
      key: idx,
      ts: createdTs || tsFallback,
      tsMs: parseTsMs(createdTs || tsFallback),
      name: fv.name || pick(obj, HEAD.name),
      mobile: fv.mobile || pick(obj, HEAD.mobile),
      branch: fv.branch || pick(obj, HEAD.branch),
      executive: fv.executive || pick(obj, HEAD.executive),
      serialNo: fv.serialNo || pick(obj, HEAD.serialNo),
      company,
      model,
      variant,
      price,
      offerings,
      offeringsBase,
      payload,
      mode: mode || (payload && payload.mode) || '',
      brand,
      status,
      followUpNotes,
      RemarkLevel: remarkLevelRaw || '',
      RemarkText: remarkTextRaw || '',
      _remarkLevel: remarkLevelNorm,
      _remarkText: remarkTextRaw || '',
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return;
      const cached = JSON.parse(raw);
      if (cached && Array.isArray(cached.rows)) {
        setRows(cached.rows);
        setTotalCount(typeof cached.total === 'number' ? cached.total : cached.rows.length);
        setHasCache(true);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  // Fetch a larger slice just for filter options (case-insensitive, across dataset)
  useEffect(() => {
    let cancelled = false;
    const loadFilters = async () => {
      try {
        const { GAS_URL, SECRET } = gasConfig;
        if (!GAS_URL) return;
        const payload = SECRET ? { action: 'list', page: 1, pageSize: 5000, secret: SECRET } : { action: 'list', page: 1, pageSize: 5000 };
        const resp = await saveBookingViaWebhook({ webhookUrl: GAS_URL, method: 'GET', payload });
        const js = resp?.data || resp;
        if (!js || (!js.ok && !js.success)) return;
        const dataArr = Array.isArray(js.data) ? js.data : (Array.isArray(js.rows) ? js.rows : []);
        const mapped = dataArr.map((o, idx) => mapRow(o, idx));
        if (!cancelled) setFilterSourceRows(mapped);
      } catch {
        // ignore filter fetch failure
      }
    };
    loadFilters();
    return () => { cancelled = true; };
  }, [gasConfig, mapRow]);

  // Server-mode: refetch on filters/page/date change
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { GAS_URL, SECRET } = gasConfig;
        if (!GAS_URL) {
          message.info('Quotations: Apps Script URL not configured — showing empty list.');
          if (!cancelled) { setRows([]); setTotalCount(0); }
          return;
        }
        const base = { action: 'list' };
        const filters = {
          q: debouncedQ || '',
          branch: branchFilter !== 'all' ? branchFilter : '',
          mode: modeFilter !== 'all' ? modeFilter : '',
          status: statusFilter !== 'all' ? statusFilter : '',
        };
        if (dateRange && dateRange[0] && dateRange[1]) {
          filters.start = dateRange[0].startOf('day').valueOf();
          filters.end = dateRange[1].endOf('day').valueOf();
        }
        const payload = USE_SERVER_PAG
          ? { ...base, page, pageSize, ...filters, ...(SECRET ? { secret: SECRET } : {}) }
          : (SECRET ? { ...base, secret: SECRET } : base);
        const resp = await saveBookingViaWebhook({
          webhookUrl: GAS_URL,
          method: 'GET',
          payload,
        });
        const js = resp?.data || resp;
        if (!js || (!js.ok && !js.success)) throw new Error('Invalid response');
        const dataArr = Array.isArray(js.data) ? js.data : (Array.isArray(js.rows) ? js.rows : []);
        const data = dataArr.map((o, idx) => mapRow(o, idx));
        const filteredRows = data.filter((r)=>r.name || r.mobile || r.serialNo);
        if (!cancelled) {
          setRows(filteredRows);
          const nextTotal = typeof js.total === 'number' ? js.total : filteredRows.length;
          setTotalCount(nextTotal);
          const map = {};
          filteredRows.forEach(rr => { if (rr.serialNo) map[rr.serialNo] = { level: rr._remarkLevel || undefined, text: rr._remarkText || '' }; });
          setRemarksMap(map);
          try { localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), rows: filteredRows, total: nextTotal })); } catch {
            //hjsd
          }
        }
      } catch  {
        message.error('Could not load quotations via Apps Script. Check QUOTATION Web App URL / access.');
        if (!cancelled) { setRows([]); setTotalCount(0); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const handler = () => load();
    window.addEventListener('reload-quotations', handler);
    return () => { cancelled = true; window.removeEventListener('reload-quotations', handler); };
  }, [debouncedQ, branchFilter, modeFilter, statusFilter, page, pageSize, dateRange, USE_SERVER_PAG]);

  const optionRows = filterSourceRows.length ? filterSourceRows : rows;

  const branches = useMemo(() => {
    const opts = uniqCaseInsensitive(optionRows.map((r) => r.branch));
    const all = ["all", ...opts];
    const isPriv = ["owner","admin","backend"].includes(userRole);
    if (!isPriv && allowedBranches.length) {
      const allowedSet = toKeySet(allowedBranches);
      return all.filter((b)=> b==='all' || allowedSet.has(normalizeKey(b)));
    }
    return all;
  }, [optionRows, userRole, allowedBranches]);
  const modes = useMemo(() => {
    return ["all", ...uniqCaseInsensitive(optionRows.map((r) => r.mode))];
  }, [optionRows]);
  const statuses = useMemo(() => {
    const cleaned = optionRows
      .map((r) => r.status)
      .filter((s) => normalizeKey(s) !== 'lost');
    return ["all", ...uniqCaseInsensitive(cleaned)];
  }, [optionRows]);

  const applyFilters = useCallback((list) => {
    const allowedSet = toKeySet(allowedBranches);
    const scoped = (list || []).filter((r) => {
      const branchKey = normalizeKey(r.branch);
      if (allowedSet.size && !["owner","admin","backend"].includes(userRole)) {
        if (!allowedSet.has(branchKey)) return false;
      }
      if (branchFilter !== "all" && branchKey !== normalizeKey(branchFilter)) return false;
      if (modeFilter !== "all" && normalizeKey(r.mode) !== normalizeKey(modeFilter)) return false;
      if (statusFilter !== 'all' && normalizeKey(r.status) !== normalizeKey(statusFilter)) return false;
      if (dateRange && dateRange[0] && dateRange[1]) {
        const start = dateRange[0].startOf('day').valueOf();
        const end = dateRange[1].endOf('day').valueOf();
        const t = r.tsMs ?? parseTsMs(r.ts);
        if (!t || t < start || t > end) return false;
      }
      if (debouncedQ) {
        const s = debouncedQ.toLowerCase();
        if (![
          r.name, r.mobile, r.serialNo, r.company, r.model, r.variant, r.branch, r.executive, r.status, r.followUpNotes
        ].some((v) => String(v || "").toLowerCase().includes(s))) return false;
      }
      return true;
    });
    return scoped.slice().sort((a,b)=> (b.tsMs||0) - (a.tsMs||0));
  }, [allowedBranches, branchFilter, dateRange, debouncedQ, modeFilter, statusFilter, userRole]);

  const loadExportRows = useCallback(async () => {
    if (!USE_SERVER_PAG) return rows;
    const { GAS_URL, SECRET } = gasConfig;
    if (!GAS_URL) return rows;
    const pageSize = 100;
    const filters = {
      q: debouncedQ || '',
      branch: branchFilter !== 'all' ? branchFilter : '',
      mode: modeFilter !== 'all' ? modeFilter : '',
      status: statusFilter !== 'all' ? statusFilter : '',
    };
    if (dateRange && dateRange[0] && dateRange[1]) {
      filters.start = dateRange[0].startOf('day').valueOf();
      filters.end = dateRange[1].endOf('day').valueOf();
    }
    const all = [];
    const seen = new Set();
    let page = 1;
    let maxPages = 200;
    while (page <= maxPages) {
      const base = { action: 'list', page, pageSize };
      const payload = SECRET ? { ...base, ...filters, secret: SECRET } : { ...base, ...filters };
      const resp = await saveBookingViaWebhook({ webhookUrl: GAS_URL, method: 'GET', payload });
      const js = resp?.data || resp;
      if (typeof js?.total === 'number' && Number.isFinite(js.total)) {
        maxPages = Math.ceil(js.total / pageSize);
      }
      const dataArr = Array.isArray(js?.data) ? js.data : (Array.isArray(js?.rows) ? js.rows : []);
      if (!dataArr.length) break;
      let added = 0;
      dataArr.forEach((row) => {
        const key = String(row?.values?.['Quotation No.'] || row?.values?.['Quotation No'] || row?.values?.['Serial'] || row?.serialNo || row?.['Quotation No.'] || row?.['Quotation No'] || row?.['Serial'] || '').trim();
        const dedupeKey = key || JSON.stringify(row);
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          all.push(row);
          added += 1;
        }
      });
      if (added === 0) break;
      if (dataArr.length < pageSize) break;
      page += 1;
    }
    return all.map((o, idx) => mapRow(o, idx)).filter((r)=>r.name || r.mobile || r.serialNo);
  }, [USE_SERVER_PAG, gasConfig, branchFilter, dateRange, debouncedQ, mapRow, modeFilter, rows, statusFilter]);

  const filtered = useMemo(() => applyFilters(rows), [applyFilters, rows]);

  // Branch summary should be based on full filtered dataset, not just visible rows
  useEffect(() => {
    let cancelled = false;
    const loadSummary = async () => {
      if (!USE_SERVER_PAG) {
        setSummaryRows(filtered);
        return;
      }
      setSummaryLoading(true);
      try {
        const baseRows = await loadExportRows();
        const scoped = applyFilters(baseRows);
        if (!cancelled) setSummaryRows(scoped);
      } catch {
        if (!cancelled) setSummaryRows([]);
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    };
    loadSummary();
    return () => { cancelled = true; };
  }, [USE_SERVER_PAG, loadExportRows, applyFilters, branchFilter, modeFilter, statusFilter, debouncedQ, dateRange, userRole, allowedBranches]);

  // Reset pagination on filters/search/date change
  useEffect(() => {
    setPage(1);
    setLoadedCount(pageSize);
  }, [branchFilter, modeFilter, statusFilter, debouncedQ, dateRange]);
  useEffect(() => { setLoadedCount(pageSize); }, [pageSize]);

  const handleExportCsv = async () => {
    const msgKey = 'export-quotations';
    message.loading({ key: msgKey, content: 'Preparing CSV…', duration: 0 });
    try {
      const baseRows = USE_SERVER_PAG ? await loadExportRows() : rows;
      const scoped = applyFilters(baseRows);
      if (!scoped.length) {
        message.info({ key: msgKey, content: 'No rows to export for current filters' });
        return;
      }
      const headers = [
        { key: 'ts', label: 'Timestamp' },
        { key: 'serialNo', label: 'Quotation No' },
        { key: 'name', label: 'Customer' },
        { key: 'mobile', label: 'Mobile' },
        { key: 'branch', label: 'Branch' },
        { key: 'executive', label: 'Executive' },
        { key: 'mode', label: 'Mode' },
        { key: 'company', label: 'Company' },
        { key: 'model', label: 'Model' },
        { key: 'variant', label: 'Variant' },
        { key: 'price', label: 'On-Road Price' },
        { key: 'status', label: 'Status' },
        { key: 'RemarkLevel', label: 'Remark Level' },
        { key: 'RemarkText', label: 'Remark' },
      ];
      const rowsForCsv = scoped.map((r) => ({
        ts: r.ts,
        serialNo: r.serialNo,
        name: r.name,
        mobile: r.mobile,
        branch: r.branch,
        executive: r.executive,
        mode: r.mode,
        company: r.company,
        model: r.model,
        variant: r.variant,
        price: r.price,
        status: r.status,
        RemarkLevel: r.RemarkLevel || r._remarkLevel,
        RemarkText: r.RemarkText || r._remarkText,
      }));
      exportToCsv({ filename: 'quotations.csv', headers, rows: rowsForCsv });
      message.success({ key: msgKey, content: `Exported ${rowsForCsv.length} quotations` });
    } catch {
      message.error({ key: msgKey, content: 'Export failed. Please try again.' });
    }
  };

  const statusColor = (s) => {
    const k = String(s || '').toLowerCase();
    return (k === 'converted' || k === 'booked') ? 'green'
      : k === 'completed' ? 'green'
      : k === 'pending' ? 'orange'
      : k === 'not_interested' ? 'default'
      : k === 'unreachable' ? 'volcano'
      : k === 'wrong_number' ? 'magenta'
      : k === 'purchased_elsewhere' ? 'geekblue'
      : k === 'no_response' ? 'gold'
      : 'default';
  };
  const statusLabel = (s) => {
    const raw = String(s || '').trim();
    if (!raw) return '—';
    const k = raw.toLowerCase();
    if (k === 'converted') return 'Booked';
    return raw.replace(/_/g, ' ');
  };
  const stampRemark = (note) => {
    const ts = dayjs().format('DD-MM-YYYY HH:mm');
    const text = String(note || '').trim();
    return text ? `${ts} - ${text}` : ts;
  };

  const stackStyle = { display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1 };
  const lineStyle = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  const smallLineStyle = { ...lineStyle, fontSize: 8
   };
  const tinyLineStyle = { ...lineStyle, fontSize: 10 };
  const metaLineStyle = { ...lineStyle, fontSize: 9, lineHeight: 1.1 };
  const offeringClamp = {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: isMobile ? 3 : 4,
    overflow: 'hidden',
    whiteSpace: 'normal',
    fontSize: 6,
    lineHeight: 1,
  };

  const columns = [
    { title: "Time / Branch", key: "timeBranch", width: 120, render: (_, r) => (
      <div style={stackStyle}>
        <div style={tinyLineStyle}>{formatTs(r.ts)}</div>
        <div style={tinyLineStyle}>
          <Text type="secondary" style={{ fontSize: 'inherit' }}>{r.branch || '—'}</Text>
        </div>
      </div>
    ) },
    { title: "Customer / Mobile", key: "customerMobile", width: 100, render: (_, r) => (
      <div style={stackStyle}>
        <div style={tinyLineStyle}>{r.name || '—'}</div>
        <div style={tinyLineStyle}>
          <Text type="secondary" style={{ fontSize: 'inherit' }}>{r.mobile || '—'}</Text>
        </div>
      </div>
    ) },
    
    { title: "Offerings", key: "offerings", width: 280, render: (_, r) => {
      const details = buildQuotationOfferingDetails({
        payload: r.payload,
        baseOfferings: r.offeringsBase,
        fallbackText: r.offerings,
        fallbackCompany: r.company,
        fallbackModel: r.model,
        fallbackVariant: r.variant,
      });
      const count = details.vehicles.length;
      const popoverContent = (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 360, maxWidth: 520 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1d4ed8" }}>
            {count ? `${count} Vehicle Offer${count > 1 ? "s" : ""}` : "Offer Details"}
          </div>
          {details.vehicles.length ? details.vehicles.map((v) => (
            <div key={v.label} style={{ border: "1px solid #dbeafe", borderRadius: 10, padding: 8, background: "#f8fbff" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#1e3a8a", textTransform: "uppercase", marginBottom: 4 }}>{v.label}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{v.title}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "#1f2937" }}>
                <span><b>Price</b>: {v.priceText}</span>
                {v.showFinance ? <span><b>DP</b>: {v.dpText}</span> : null}
              </div>
              {v.showFinance && v.emiText ? <div style={{ marginTop: 4, fontSize: 11, color: "#334155", lineHeight: 1.3 }}>{v.emiText}</div> : null}
              {v.fittings.length ? <div style={{ marginTop: 4, fontSize: 11, color: "#334155", lineHeight: 1.3 }}><b>Fittings</b>: {v.fittings.join(", ")}</div> : null}
            </div>
          )) : (
            <div style={{ fontSize: 12, color: "#64748b" }}>No vehicle-wise offer added.</div>
          )}
        </div>
      );
      return (
        <div style={stackStyle}>
          {count ? (
            <Popover content={popoverContent} trigger={['hover', 'click']} placement="topLeft">
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {details.vehicles.map((v) => (
                  <div key={v.label} style={{ ...lineStyle, fontSize: 10.5, color: "#1f2937" }}>
                    <span style={{ fontWeight: 800, color: "#1d4ed8" }}>{v.label}:</span> {v.title}
                  </div>
                ))}
              </div>
            </Popover>
          ) : (
            <div style={offeringClamp}>No offering details</div>
          )}
        </div>
      );
    } },
    { title: "Status / Follow-up Notes", key: "statusNotes", width: 150, render: (_, r) => {
      const notes = String(r.followUpNotes || '').trim();
      return (
        <div style={stackStyle}>
          <div style={lineStyle}>
            <Tag color={statusColor(r.status)}>{statusLabel(r.status)}</Tag>
          </div>
          {notes ? (
            <Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{notes}</span>} placement="topLeft">
              <div style={smallLineStyle}>{notes}</div>
            </Tooltip>
          ) : (
            <div style={smallLineStyle}></div>
          )}
        </div>
      );
    } },
    { title: "Mode / Executive", key: "vehicleMeta", width: 120, render: (_, r) => {
        const mode = String(r.mode || '').trim().toUpperCase();
        const exec = String(r.executive || '').trim();
        const metaLine = [
          
          exec || '—',
        ].join(' || ');
        return (
          <div style={stackStyle}>
            <div style={{ ...metaLineStyle, fontSize: 10, fontWeight: 700 }}>{mode || '—'}</div>
            <div style={metaLineStyle}>{metaLine}</div>
          </div>
        );
      }
    },
  ];
  if (["backend","admin","owner"].includes(userRole)) {
    columns.push({ title: "Remarks / Remark Text", key: "remarks", width: 240, render: (_, r) => {
        const rem = remarksMap[r.serialNo];
        const remarkText = String(rem?.text || '');
        const color = rem?.level === 'alert' ? 'red' : rem?.level === 'warning' ? 'gold' : rem?.level === 'ok' ? 'green' : 'default';
        return (
          <div style={stackStyle}>
            <div style={lineStyle}>
              <Space size={6}>
                <Tag color={color}>{rem?.level ? rem.level.toUpperCase() : '—'}</Tag>
                <Button size="small" onClick={()=> setRemarkModal({ open: true, refId: r.serialNo, level: rem?.level || 'ok', text: rem?.text || '' })}>Remark</Button>
              </Space>
            </div>
            <Tooltip title={remarkText ? <span style={{ whiteSpace: 'pre-wrap' }}>{remarkText}</span> : null}>
              <div style={lineStyle}>{remarkText || '—'}</div>
            </Tooltip>
          </div>
        );
      }
    });
  }

  const total = USE_SERVER_PAG ? totalCount : rows.length;
  const tableHeight = isMobile ? 420 : 600;
  const visibleRows = USE_SERVER_PAG ? filtered : (renderMode === 'loadMore' ? filtered.slice(0, loadedCount) : filtered);
  const branchSummary = useMemo(() => {
    const base = (USE_SERVER_PAG ? summaryRows : filtered) || [];
    const map = new Map();
    base.forEach((r) => {
      const label = String(r.branch || "Unknown").trim() || "Unknown";
      const key = normalizeKey(label);
      if (!map.has(key)) {
        map.set(key, { key, branch: label, total: 0 });
      }
      const row = map.get(key);
      row.total += 1;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [USE_SERVER_PAG, summaryRows, filtered]);

  return (
    <div style={{ paddingTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <Space wrap>
          <Select
            value={branchFilter}
            onChange={setBranchFilter}
            style={{ minWidth: 120 }}
            disabled={!['owner','admin','backend'].includes(userRole)}
            options={branches.map(b => ({ value: b, label: b === 'all' ? 'All Branches' : b }))}
          />
          <Select value={modeFilter} onChange={setModeFilter} style={{ minWidth: 100 }}
                  options={modes.map(m => ({ value: m, label: m === 'all' ? 'All Modes' : String(m).toUpperCase() }))} />
          <Select value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 100 }}
                  options={statuses.map(s => ({ value: s, label: s === 'all' ? 'All Statuses' : statusLabel(s) }))} />
          <DatePicker.RangePicker value={dateRange} onChange={(v)=>{ setDateRange(v); setQuickKey(null); }} allowClear />
          <Button size="small" type={quickKey==='today'?'primary':'default'} onClick={()=>{ const t = dayjs(); setDateRange([t,t]); setQuickKey('today'); }}>Today</Button>
          <Button size="small" type={quickKey==='yesterday'?'primary':'default'} onClick={()=>{ const y = dayjs().subtract(1,'day'); setDateRange([y,y]); setQuickKey('yesterday'); }}>Yesterday</Button>
          <Button size="small" onClick={()=>{ setDateRange(null); setQuickKey(null); }}>Clear</Button>
          <Input placeholder="Search name/mobile/quotation/company/model" allowClear value={q} onChange={(e)=>setQ(e.target.value)} style={{ minWidth: 150 }} />
        </Space>
        <div style={{ flex: 1 }} />
        <Space>
          <Button type="primary" onClick={() => navigate('/quotation')}>Quotation</Button>
          <Tag color="blue">Total: {total}</Tag>
          <Tag color="geekblue">Showing: {USE_SERVER_PAG ? visibleRows.length : (renderMode==='loadMore' ? visibleRows.length : filtered.length)}</Tag>
          {!USE_SERVER_PAG && (
          <Select
            size='small'
            value={renderMode}
            onChange={(v)=>{ setRenderMode(v); setLoadedCount(pageSize); }}
            options={[{value:'pagination',label:'Pagination'},{value:'loadMore',label:'Load More'}]}
            style={{ width: 130 }}
          />)}
          <Button onClick={handleExportCsv}>Export CSV</Button>
          <Button loading={loading} onClick={() => {
            const ev = new Event('reload-quotations');
            window.dispatchEvent(ev);
          }}>Refresh</Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        {summaryLoading ? (
          <Col xs={24}>
            <Tag color="blue">Loading branch totals…</Tag>
          </Col>
        ) : null}
        {branchSummary.map((b) => (
          <Col key={b.key} xs={12} sm={8} md={6} lg={4} xl={3}>
            <Card size="small" bodyStyle={{ padding: "6px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontWeight: 600,
                  fontSize: 12,
                  lineHeight: "16px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  flex: 1,
                }}>
                  {b.branch}
                </span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: "16px",
                  padding: "0 6px",
                  borderRadius: 10,
                  background: "#eef2ff",
                  color: "#1d4ed8",
                }}>
                  {b.total}
                </span>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Table
        dataSource={visibleRows}
        columns={columns}
        loading={loading && !hasCache}
        size="small"
        className="compact-table"
        scroll={isMobile ? { x: 'max-content', y: tableHeight } : { y: tableHeight }}
        tableLayout={isMobile ? "auto" : "fixed"}
        pagination={USE_SERVER_PAG ? {
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['10','25','50','100'],
          onChange: (p, ps) => { setPage(p); if (ps !== pageSize) setPageSize(ps); },
          showTotal: (t, range) => `${range[0]}-${range[1]} of ${t}`,
        } : (renderMode==='pagination' ? {
          current: page,
          pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10','25','50','100'],
          onChange: (p, ps) => { setPage(p); if (ps !== pageSize) setPageSize(ps); },
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
        } : false)}
        rowKey={(r) => `${r.serialNo}-${r.mobile}-${r.ts}-${r.key}`}
        
      />

      {!USE_SERVER_PAG && renderMode==='loadMore' && visibleRows.length < filtered.length ? (
        <div style={{ display:'flex', justifyContent:'center', padding: 8 }}>
          <Button onClick={()=> setLoadedCount((n)=> Math.min(n + pageSize, filtered.length))}>
            Load more ({filtered.length - visibleRows.length} more)
          </Button>
        </div>
      ) : null}

      <Modal
        open={remarkModal.open}
        title={`Update Remark: ${remarkModal.refId}`}
        onCancel={()=> setRemarkModal({ open: false, refId: '', level: 'ok', text: '' })}
        onOk={()=>{
          if (!GAS_URL) { message.error('Quotation GAS URL not configured'); return; }
          const { refId, level, text } = remarkModal;
          const stampedText = stampRemark(text);
          const prevRemark = remarksMap[refId];
          const prevRow = rows.find((x) => x.serialNo === refId);
          setRemarksMap((m)=> ({ ...m, [refId]: { level, text: stampedText } }));
          setRows(prev => prev.map(x => x.serialNo === refId ? {
            ...x,
            RemarkLevel: level.toUpperCase(),
            RemarkText: stampedText,
            _remarkLevel: level,
            _remarkText: stampedText
          } : x));
          setRemarkModal({ open: false, refId: '', level: 'ok', text: '' });
          void (async () => {
            try {
              const body = GAS_SECRET ? { action: 'remark', serialNo: refId, level, text: stampedText, secret: GAS_SECRET } : { action: 'remark', serialNo: refId, level, text: stampedText };
              const resp = await saveBookingViaWebhook({ webhookUrl: GAS_URL, method: 'POST', payload: body });
              const out = resp?.data || resp;
              if (!(out && (out.ok || out.success))) throw new Error('Save failed');
              message.success('Remark saved to sheet');
            } catch {
              setRemarksMap((m) => {
                const next = { ...m };
                if (prevRemark) next[refId] = prevRemark;
                else delete next[refId];
                return next;
              });
              if (prevRow) {
                setRows(prev => prev.map(x => x.serialNo === refId ? prevRow : x));
              }
              message.error('Save failed');
            }
          })();
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select
            value={remarkModal.level}
            onChange={(v)=> setRemarkModal((s)=> ({ ...s, level: v }))}
            options={[{value:'ok',label:'OK (Green)'},{value:'warning',label:'Warning (Yellow)'},{value:'alert',label:'Alert (Red)'}]}
            style={{ width: 220 }}
          />
          <Input maxLength={140} showCount value={remarkModal.text} onChange={(e)=> setRemarkModal((s)=> ({ ...s, text: e.target.value }))} placeholder="Short note (optional)" />
        </Space>
      </Modal>
    </div>
  );
}

// --- Helpers (copied from Bookings) ---
function formatTs(v) {
  if (!v) return <Text type="secondary">—</Text>;
  try {
    const ms = parseTsMs(v);
    if (!ms) return String(v);
    return dayjs(ms).format("DD-MM-YYYY HH:mm");
  } catch { return String(v); }
}

function parseTsMs(v) {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  const dIso = new Date(s);
  if (!isNaN(dIso.getTime())) return dIso.getTime();
  const m = s.match(/^(\d{1,2})([/-])(\d{1,2})\2(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (m) {
    const sep = m[2];
    let a = parseInt(m[1], 10), b = parseInt(m[3], 10), y = parseInt(m[4], 10);
    if (y < 100) y += 2000;
    let month, day;
    if (sep === '-') { day = a; month = b - 1; }
    else if (a > 12) { day = a; month = b - 1; } else { month = a - 1; day = b; }
    let hh = m[5] ? parseInt(m[5], 10) : 0;
    const mm = m[6] ? parseInt(m[6], 10) : 0;
    const ss = m[7] ? parseInt(m[7], 10) : 0;
    const ap = (m[8] || '').toUpperCase();
    if (ap === 'PM' && hh < 12) hh += 12;
    if (ap === 'AM' && hh === 12) hh = 0;
    const d = new Date(y, month, day, hh, mm, ss);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return null;
}
  // GAS endpoints (same as used for list)
  const DEFAULT_QUOT_URL = "https://script.google.com/macros/s/AKfycbxXtfRVEFeaKu10ijzfQdOVlgkZWyH1q1t4zS3PHTX9rQQ7ztRJdpFV5svk98eUs3UXuw/exec";
  const GAS_URL = import.meta.env.VITE_QUOTATION_GAS_URL || DEFAULT_QUOT_URL;
  const GAS_SECRET = import.meta.env.VITE_QUOTATION_GAS_SECRET || '';
