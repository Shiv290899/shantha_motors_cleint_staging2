import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Table, Grid, Space, Button, Select, Input, Tag, message, Popover, Tooltip, Typography, Modal, Upload, DatePicker, AutoComplete, Form, Divider, Row, Col } from "antd";
import useDebouncedValue from "../hooks/useDebouncedValue";
// Sheet-only remarks; no backend remarks API
import dayjs from 'dayjs';
import BookingPrintQuickModal from "./BookingPrintQuickModal";
import BookingInlineModal from "./BookingInlineModal";
import BookingForm from "./BookingForm";
import { saveBookingViaWebhook } from "../apiCalls/forms";
import { createStock, listCurrentStocksPublic } from "../apiCalls/stocks";
import { listBranchesPublic } from "../apiCalls/branches";
import { listUsersPublic } from "../apiCalls/adminUsers";
import { exportToCsv } from "../utils/csvExport";
import { normalizeKey, uniqCaseInsensitive, toKeySet } from "../utils/caseInsensitive";

const { Text } = Typography;

// Bookings are now loaded only through Apps Script JSON endpoint (no CSV)

const HEAD = {
  ts: ["Submitted At", "Timestamp", "Time", "Date"],
  branch: ["Branch"],
  name: ["Customer Name", "Customer_Name", "Customer", "Name"],
  mobile: ["Mobile Number", "Mobile", "Phone"],
  bookingId: ["Booking ID", "Booking_ID", "Booking Id", "BookingID"],
  company: ["Company"],
  model: ["Model"],
  variant: ["Variant"],
  color: ["Color", "Colour", "Vehicle Color", "Vehicle Colour"],
  chassis: ["Chassis Number", "Chassis No", "Chassis"],
  file: ["File URL", "File", "Document URL"],
  status: ["Status", "Booking Status", "State"],
  availability: ["Chassis Availability", "Availability", "Stock", "Stock Status"],
};

const pick = (obj, aliases) => String(aliases.map((k) => obj[k] ?? "").find((v) => v !== "") || "").trim();

export default function Bookings() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState(null); // [dayjs, dayjs]
  const [quickKey, setQuickKey] = useState(null); // 'today' | 'yesterday' | null
  const [, setUpdating] = useState(null);
  const [printModal, setPrintModal] = useState({ open: false, row: null });
  const [detailModal, setDetailModal] = useState({ open: false, row: null });
  // Prefilled inline form modal removed per request; use Print modal only
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);
  // Controlled pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [renderMode, setRenderMode] = useState('pagination'); // 'pagination' | 'loadMore'
  const [loadedCount, setLoadedCount] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  // Default to server pagination without requiring env var
  const USE_SERVER_PAG = String((import.meta.env.VITE_USE_SERVER_PAGINATION ?? 'true')).toLowerCase() === 'true';
  const [remarksMap, setRemarksMap] = useState({});
  const [remarkModal, setRemarkModal] = useState({ open: false, refId: '', level: 'ok', text: '' });
  const [remarkSaving, setRemarkSaving] = useState(false);
  const [hasCache, setHasCache] = useState(false);
  const [actionModal, setActionModal] = useState({ open: false, type: '', row: null, fileList: [], loading: false });
  const [formModal, setFormModal] = useState({ open: false });
  const [branchOptions, setBranchOptions] = useState([]);
  const [executiveOptions, setExecutiveOptions] = useState([]);
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const [filterSourceRows, setFilterSourceRows] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockLoadedAt, setStockLoadedAt] = useState(0);
  const [stockLoadedBranch, setStockLoadedBranch] = useState('');
  const [editingChassisId, setEditingChassisId] = useState(null);
  const [chassisDraft, setChassisDraft] = useState('');
  const [chassisSaving, setChassisSaving] = useState(false);
  const [assignModal, setAssignModal] = useState({ open: false, row: null });
  const [assignDraft, setAssignDraft] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);
  const [stockMoveSaving, setStockMoveSaving] = useState(false);
  const [stockMoveForm] = Form.useForm();

  // User + branch scoping
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState("");
  const [allowedBranches, setAllowedBranches] = useState([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return;
      const u = JSON.parse(raw);
      setCurrentUser(u);
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

  const loadDropdowns = useCallback(async () => {
    setDropdownLoading(true);
    try {
      const [branchesRes, usersRes] = await Promise.allSettled([
        listBranchesPublic({ status: 'active', limit: 500 }),
        listUsersPublic({ role: 'staff', status: 'active', limit: 100000 }),
      ]);
      if (branchesRes.status === 'fulfilled' && branchesRes.value?.success) {
        const names = uniqCaseInsensitive((branchesRes.value.data.items || [])
          .filter((b) => String(b?.status || '').toLowerCase() === 'active')
          .map((b) => b.name));
        setBranchOptions(names);
      } else {
        setBranchOptions([]);
        if (branchesRes.status === 'fulfilled') {
          message.warning(branchesRes.value?.message || 'Could not load branches');
        }
      }
      if (usersRes.status === 'fulfilled' && usersRes.value?.success) {
        const names = uniqCaseInsensitive((usersRes.value.data.items || [])
          .filter((u) => String(u.role || '').toLowerCase() === 'staff')
          .map((u) => u.name || u.email || ''));
        setExecutiveOptions(names);
      } else {
        setExecutiveOptions([]);
        if (usersRes.status === 'fulfilled') {
          message.warning(usersRes.value?.message || 'Could not load executives');
        }
      }
    } catch {
      setBranchOptions([]);
      setExecutiveOptions([]);
      message.error('Could not load dropdown options');
    } finally {
      setDropdownLoading(false);
    }
  }, []);

  useEffect(() => { loadDropdowns(); }, [loadDropdowns]);

  // Reuse the same GAS URL for list + print so search works
  const DEFAULT_BOOKING_GAS_URL =
    "https://script.google.com/macros/s/AKfycbzAn8Ahu2Mp59Uh0i7jLi1XEzRU44A6xzrMl3X-n1u_EECxSAWCjpNo0Ovk4LeCjvPzeA/exec";
  const GAS_URL_STATIC = import.meta.env.VITE_BOOKING_GAS_URL || DEFAULT_BOOKING_GAS_URL;
  const GAS_SECRET_STATIC = import.meta.env.VITE_BOOKING_GAS_SECRET || '';

  const cacheKey = (() => {
    const start = dateRange && dateRange[0] ? dateRange[0].startOf('day').valueOf() : '';
    const end = dateRange && dateRange[1] ? dateRange[1].endOf('day').valueOf() : '';
    return `Bookings:list:${JSON.stringify({ branchFilter, statusFilter, q: debouncedQ||'', start, end, page, pageSize, USE_SERVER_PAG })}`;
  })();

  const mapRow = useCallback((o, idx = 0) => {
    let payload = {};
    try {
      payload = typeof o['Raw Payload'] === 'object'
        ? (o['Raw Payload'] || {})
        : JSON.parse(String(o['Raw Payload'] || o.rawPayload || o.payload || '{}'));
    } catch { payload = {}; }
    const payloadColor =
      payload?.color ||
      payload?.vehicle?.color ||
      payload?.vehicleColor ||
      payload?.formValues?.color ||
      '';
    const remarkLevelRaw = (payload?.remark?.level || o.RemarkLevel || o.remarkLevel || '').toString();
    const remarkTextRaw = payload?.remark?.text || o.RemarkText || o.remarkText || '';
    const remarkLevelNorm = String(remarkLevelRaw || '').toLowerCase();
    return {
      key: idx,
      ts: pick(o, HEAD.ts),
      tsMs: parseTsMs(pick(o, HEAD.ts)),
      bookingId: pick(o, HEAD.bookingId),
      name: pick(o, HEAD.name),
      mobile: pick(o, HEAD.mobile),
      company: pick(o, HEAD.company),
      model: pick(o, HEAD.model),
      variant: pick(o, HEAD.variant),
      color: pick(o, HEAD.color) || String(payloadColor || '').trim(),
      chassis: pick(o, HEAD.chassis),
      fileUrl: pick(o, HEAD.file),
      branch: pick(o, HEAD.branch),
      status: (pick(o, HEAD.status) || 'pending').toLowerCase(),
      availability: pick(o, HEAD.availability),
      RemarkLevel: remarkLevelRaw || '',
      RemarkText: remarkTextRaw || '',
      _remarkLevel: remarkLevelNorm,
      _remarkText: remarkTextRaw || '',
      _raw: o,
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

  // Fetch larger slice for filter options (case-insensitive, across dataset)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (!GAS_URL_STATIC) return;
        const payload = GAS_SECRET_STATIC
          ? { action: 'list', page: 1, pageSize: 5000, secret: GAS_SECRET_STATIC }
          : { action: 'list', page: 1, pageSize: 5000 };
        const resp = await saveBookingViaWebhook({ webhookUrl: GAS_URL_STATIC, method: 'GET', payload });
        const js = resp?.data || resp;
        const dataArr = Array.isArray(js?.data) ? js.data : [];
        const mapped = dataArr.map((o, idx) => mapRow(o, idx));
        if (!cancelled) setFilterSourceRows(mapped);
      } catch { /* ignore filter fetch failures */ }
    };
    load();
    return () => { cancelled = true; };
  }, [GAS_URL_STATIC, GAS_SECRET_STATIC, mapRow]);

  // Server-mode: refetch on filters/page change
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const GAS_URL = GAS_URL_STATIC;
        const SECRET = import.meta.env.VITE_BOOKING_GAS_SECRET || '';
        // If still empty somehow, show empty list gracefully
        if (!GAS_URL) {
          message.info('Bookings: Apps Script URL not configured — showing empty list.');
          if (!cancelled) { setRows([]); setTotalCount(0); }
          return;
        }
        const base = { action: 'list' };
        const filters = {
          q: debouncedQ || '',
          branch: branchFilter !== 'all' ? branchFilter : '',
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
        if (!js?.ok || !Array.isArray(js?.data)) throw new Error('Invalid response');
        const data = js.data.map((o, idx) => mapRow(o, idx));
        const filteredRows = data.filter((r)=>r.bookingId || r.name || r.mobile);
        if (!cancelled) {
          setRows(filteredRows);
          const nextTotal = typeof js.total === 'number' ? js.total : filteredRows.length;
          setTotalCount(nextTotal);
          const map = {}; filteredRows.forEach(rr => {
            if (rr.bookingId) map[rr.bookingId] = { level: rr._remarkLevel || String(rr.RemarkLevel||'').toLowerCase(), text: rr._remarkText || rr.RemarkText || '' };
          });
          setRemarksMap(map);
          try { localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), rows: filteredRows, total: nextTotal })); } catch {
            //hg
          }
        }
      } catch {
        message.error('Could not load bookings via Apps Script. Check Web App URL / access.');
        if (!cancelled) { setRows([]); setTotalCount(0); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    // allow refresh button to re-trigger load without page reload
    const handler = () => load();
    window.addEventListener('reload-bookings', handler);
    return () => { cancelled = true; };
  }, [debouncedQ, branchFilter, statusFilter, page, pageSize, GAS_URL_STATIC, USE_SERVER_PAG]);

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
  const statuses = useMemo(() => {
    return ["all", ...uniqCaseInsensitive(optionRows.map((r) => r.status))];
  }, [optionRows]);

  const applyFilters = useCallback((list) => {
    const allowedSet = toKeySet(allowedBranches);
    const scoped = (list || []).filter((r) => {
      if (allowedSet.size && !["owner","admin"].includes(userRole)) {
        if (!allowedSet.has(normalizeKey(r.branch))) return false;
      }
      if (branchFilter !== "all" && normalizeKey(r.branch) !== normalizeKey(branchFilter)) return false;
      if (statusFilter !== "all" && normalizeKey(r.status) !== normalizeKey(statusFilter)) return false;
      if (dateRange && dateRange[0] && dateRange[1]) {
        const start = dateRange[0].startOf('day').valueOf();
        const end = dateRange[1].endOf('day').valueOf();
        const t = r.tsMs ?? parseTsMs(r.ts);
        if (!t || t < start || t > end) return false;
      }
        if (debouncedQ) {
          const s = debouncedQ.toLowerCase();
          if (![
          r.bookingId, r.name, r.mobile, r.company, r.model, r.variant, r.color, r.chassis, r.branch,
        ].some((v) => String(v || "").toLowerCase().includes(s))) return false;
      }
      return true;
    });
    return scoped.slice().sort((a,b)=> (b.tsMs||0)-(a.tsMs||0));
  }, [allowedBranches, branchFilter, dateRange, debouncedQ, statusFilter, userRole]);

  const filtered = useMemo(() => applyFilters(rows), [applyFilters, rows]);

  // Reset page when filters/search change
  useEffect(() => {
    setPage(1);
    setLoadedCount(pageSize);
  }, [branchFilter, statusFilter, debouncedQ, dateRange]);

  useEffect(() => { setLoadedCount(pageSize); }, [pageSize]);

  const loadExportRows = useCallback(async () => {
    if (!USE_SERVER_PAG) return rows;
    if (!GAS_URL_STATIC) return rows;
    const base = { action: 'list', page: 1, pageSize: 10000 };
    const filters = {
      q: debouncedQ || '',
      branch: branchFilter !== 'all' ? branchFilter : '',
      status: statusFilter !== 'all' ? statusFilter : '',
    };
    if (dateRange && dateRange[0] && dateRange[1]) {
      filters.start = dateRange[0].startOf('day').valueOf();
      filters.end = dateRange[1].endOf('day').valueOf();
    }
    const payload = GAS_SECRET_STATIC ? { ...base, ...filters, secret: GAS_SECRET_STATIC } : { ...base, ...filters };
    const resp = await saveBookingViaWebhook({ webhookUrl: GAS_URL_STATIC, method: 'GET', payload });
    const js = resp?.data || resp;
    const dataArr = Array.isArray(js?.data) ? js.data : [];
    return dataArr.map((o, idx) => mapRow(o, idx)).filter((r)=>r.bookingId || r.name || r.mobile);
  }, [USE_SERVER_PAG, GAS_URL_STATIC, GAS_SECRET_STATIC, branchFilter, dateRange, debouncedQ, mapRow, statusFilter, rows]);

  const handleExportCsv = async () => {
    const msgKey = 'export-bookings';
    message.loading({ key: msgKey, content: 'Preparing CSV…', duration: 0 });
    try {
      const baseRows = USE_SERVER_PAG ? await loadExportRows() : rows;
      const scoped = applyFilters(baseRows);
      if (!scoped.length) {
        message.info({ key: msgKey, content: 'No rows to export for current filters' });
        return;
      }
      const headers = [
        { key: 'ts', label: 'Submitted At' },
        { key: 'bookingId', label: 'Booking ID' },
        { key: 'name', label: 'Customer' },
        { key: 'mobile', label: 'Mobile' },
        { key: 'branch', label: 'Branch' },
        { key: 'status', label: 'Status' },
        { key: 'availability', label: 'Stock Status' },
        { key: 'company', label: 'Company' },
        { key: 'model', label: 'Model' },
        { key: 'variant', label: 'Variant' },
        { key: 'chassis', label: 'Chassis' },
        { key: 'fileUrl', label: 'File URL' },
      ];
      const rowsForCsv = scoped.map((r) => ({
        ts: r.ts,
        bookingId: r.bookingId,
        name: r.name,
        mobile: r.mobile,
        branch: r.branch,
        status: r.status,
        availability: stockLabel(r.chassis, r.availability),
        company: r.company,
        model: r.model,
        variant: r.variant,
        chassis: r.chassis,
        fileUrl: r.fileUrl,
      }));
      exportToCsv({ filename: 'bookings.csv', headers, rows: rowsForCsv });
      message.success({ key: msgKey, content: `Exported ${rowsForCsv.length} bookings` });
    } catch  {
      message.error({ key: msgKey, content: 'Export failed. Please try again.' });
    }
  };

  const STOCK_CACHE_MS = 2 * 60 * 1000;

  const stockBranchHint = useMemo(() => {
    const isPriv = ["owner","admin","backend"].includes(userRole);
    if (branchFilter !== 'all') return branchFilter;
    if (!isPriv && allowedBranches.length === 1) return allowedBranches[0];
    return '';
  }, [allowedBranches, branchFilter, userRole]);

  const activeBranchSet = useMemo(
    () => toKeySet(branchOptions),
    [branchOptions]
  );

  const scopedBranchSet = useMemo(() => {
    if (branchFilter !== 'all') return toKeySet([branchFilter]);
    const isPriv = ["owner","admin","backend"].includes(userRole);
    if (!isPriv && allowedBranches.length) return toKeySet(allowedBranches);
    return null;
  }, [allowedBranches, branchFilter, userRole]);

  const isStockAllowed = useCallback((item) => {
    const b = normalizeKey(item?.sourceBranch || item?.branch || '');
    if (!b) return false;
    if (activeBranchSet.size && !activeBranchSet.has(b)) return false;
    if (scopedBranchSet && scopedBranchSet.size && !scopedBranchSet.has(b)) return false;
    const status = String(item?.status || '').toLowerCase();
    if (status && status !== 'in_stock' && status !== 'in stock') return false;
    return true;
  }, [activeBranchSet, scopedBranchSet]);

  const loadStockItems = useCallback(async (force = false) => {
    if (stockLoading) return;
    const branchHint = stockBranchHint || '';
    const cacheOk =
      !force &&
      stockItems.length > 0 &&
      (Date.now() - stockLoadedAt) < STOCK_CACHE_MS &&
      stockLoadedBranch === branchHint;
    if (cacheOk) return;
    setStockLoading(true);
    try {
      const resp = await listCurrentStocksPublic({
        branch: branchHint || undefined,
        limit: 2000,
      });
      const list = Array.isArray(resp?.data) ? resp.data : [];
      setStockItems(list);
      setStockLoadedAt(Date.now());
      setStockLoadedBranch(branchHint);
    } catch {
      message.error('Could not load stock list.');
    } finally {
      setStockLoading(false);
    }
  }, [stockLoading, stockItems.length, stockLoadedAt, stockLoadedBranch, stockBranchHint]);

  const STATUS_COLOR = {
    pending: 'gold',
    seen: 'blue',
    approved: 'green',
    allotted: 'purple',
    cancelled: 'red',
  };

  // Simple rule as requested: if chassis number is present → In Stock; else → To be allotted
  const stockLabel = (chassis,) => {
    const hasChassis = Boolean(String(chassis || '').trim());
    return hasChassis ? 'In Stock' : 'To be allotted';
  };
  const stockColor = (label) => (label === 'In Stock' ? 'green' : 'volcano');

  const updateBooking = async (bookingId, patch, mobile) => {
    let ok = false;
    try {
      setUpdating(bookingId);
      const DEFAULT_BOOKING_GAS_URL ="https://script.google.com/macros/s/AKfycbzAn8Ahu2Mp59Uh0i7jLi1XEzRU44A6xzrMl3X-n1u_EECxSAWCjpNo0Ovk4LeCjvPzeA/exec";
      const GAS_URL = import.meta.env.VITE_BOOKING_GAS_URL || DEFAULT_BOOKING_GAS_URL;
      const SECRET = import.meta.env.VITE_BOOKING_GAS_SECRET || '';
      // Mirror patch keys to exact Sheet headers to ensure update reflects
      const p = patch || {};
      const sheetPatch = { ...p };
      if (p.invoiceStatus) sheetPatch['Invoice Status'] = p.invoiceStatus;
      if (p.invoiceFileUrl || p.invoiceFile) sheetPatch['Invoice File URL'] = p.invoiceFileUrl || p.invoiceFile;
      if (p.insuranceStatus) sheetPatch['Insurance Status'] = p.insuranceStatus;
      if (p.insuranceFileUrl || p.insuranceFile) sheetPatch['Insurance File URL'] = p.insuranceFileUrl || p.insuranceFile;
      if (p.rtoStatus) sheetPatch['RTO Status'] = p.rtoStatus;
      if (p.vehicleNo || p.regNo) sheetPatch['Vehicle No'] = p.vehicleNo || p.regNo;
      if (p.status) sheetPatch['Status'] = p.status;
      await saveBookingViaWebhook({ webhookUrl: GAS_URL, method: 'POST', payload: SECRET ? { action: 'update', bookingId, mobile, patch: sheetPatch, secret: SECRET } : { action: 'update', bookingId, mobile, patch: sheetPatch } });
      // Optimistic merge of patched fields into row
      setRows((prev)=> prev.map(r=> {
        if (r.bookingId !== bookingId) return r;
        const next = { ...r };
        if (patch.status) next.status = String(patch.status).toLowerCase();
        // Attach common extended fields for immediate visibility
        if (patch.invoiceStatus) next.invoiceStatus = patch.invoiceStatus;
        if (patch.invoiceFileUrl || patch.invoiceFile) next.invoiceFileUrl = patch.invoiceFileUrl || patch.invoiceFile;
        if (patch.insuranceStatus) next.insuranceStatus = patch.insuranceStatus;
        if (patch.insuranceFileUrl || patch.insuranceFile) next.insuranceFileUrl = patch.insuranceFileUrl || patch.insuranceFile;
        if (patch.rtoStatus) next.rtoStatus = patch.rtoStatus;
        if (patch.vehicleNo || patch.regNo) next.vehicleNo = patch.vehicleNo || patch.regNo;
        if (Object.prototype.hasOwnProperty.call(patch, 'chassis')) next.chassis = patch.chassis;
        if (Object.prototype.hasOwnProperty.call(patch, 'chassisNo')) next.chassis = patch.chassisNo;
        next._raw = { ...(r._raw || {}), ...patch };
        return next;
      }));
      message.success('Updated');
      ok = true;
    } catch {
      message.error('Update failed');
      ok = false;
    }
    finally { setUpdating(null); }
    return ok;
  };

  // Minimal upload helper to GAS (same endpoint used by BookingForm)
  const uploadFileToGAS = async (file) => {
    const DEFAULT_BOOKING_GAS_URL = "https://script.google.com/macros/s/AKfycbzAn8Ahu2Mp59Uh0i7jLi1XEzRU44A6xzrMl3X-n1u_EECxSAWCjpNo0Ovk4LeCjvPzeA/exec";
    const GAS_URL = import.meta.env.VITE_BOOKING_GAS_URL || DEFAULT_BOOKING_GAS_URL;
    const SECRET = import.meta.env.VITE_BOOKING_GAS_SECRET || '';
    if (!GAS_URL) throw new Error('GAS URL not configured');
    const fd = new FormData();
    fd.append('action', 'upload');
    if (SECRET) fd.append('secret', SECRET);
    const origin = file?.originFileObj || file;
    fd.append('file', origin, file?.name || origin?.name || 'document.pdf');
    try {
      const resp = await fetch(GAS_URL, { method: 'POST', body: fd, credentials: 'omit' });
      const js = await resp.json().catch(() => ({}));
      if (js && (js.ok || js.success)) return js; // expect { url, fileId, name }
      throw new Error('Upload failed');
    } catch (e) {
      // Fallback: base64 via webhook proxy to avoid CORS/redirect issues
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          const origin2 = file?.originFileObj || file;
          reader.onload = () => {
            const s = String(reader.result || '');
            const idx = s.indexOf(',');
            resolve(idx >= 0 ? s.slice(idx + 1) : s);
          };
          reader.onerror = reject;
          reader.readAsDataURL(origin2);
        });
        const payload = SECRET ? { action: 'upload_base64', name: file?.name || 'document.pdf', base64, secret: SECRET } : { action: 'upload_base64', name: file?.name || 'document.pdf', base64 };
        const resp = await saveBookingViaWebhook({ webhookUrl: GAS_URL, method: 'POST', payload });
        const js2 = resp?.data || resp;
        if (js2 && (js2.ok || js2.success)) return js2;
      } catch {
        //SFH
      }
      throw e;
    }
  };

  const beforeUploadPdf = (file) => {
    const isPdf = file.type === 'application/pdf' || (file.name || '').toLowerCase().endsWith('.pdf');
    if (!isPdf) { message.error('Only PDF files allowed'); return Upload.LIST_IGNORE; }
    const okSize = (file.size || 0) <= 10 * 1024 * 1024; // 5 MB
    if (!okSize) { message.error('File must be <= 5MB'); return Upload.LIST_IGNORE; }
    return false; // do not auto-upload
  };

  const handleInvoiceChange = async (row, value) => {
    if (value === 'received') {
      setActionModal({ open: true, type: 'invoice', row, fileList: [], loading: false });
    } else {
      await updateBooking(row.bookingId, { invoiceStatus: value }, row.mobile);
    }
  };
  const handleInsuranceChange = async (row, value) => {
    if (value === 'received') {
      setActionModal({ open: true, type: 'insurance', row, fileList: [], loading: false });
    } else {
      await updateBooking(row.bookingId, { insuranceStatus: value }, row.mobile);
    }
  };
  const handleRtoChange = async (row, value) => {
    await updateBooking(row.bookingId, { rtoStatus: value }, row.mobile);
  };
  const [vehNoDraft, setVehNoDraft] = useState({}); // bookingId -> reg no draft
  const handleSaveVehNo = async (row) => {
    const raw = String(vehNoDraft[row.bookingId] || '').trim();
    const v = normalizeVehNo(raw);
    if (!v) { message.error('Enter vehicle number'); return; }
    const RTO_REGEX = /^[A-Z]{2}\d{2}[A-Z]{2}\d{4}$/; // e.g., KA55HY5666
    if (!RTO_REGEX.test(v)) { message.error('Use format KA55HY5666 (2 letters, 2 digits, 2 letters, 4 digits)'); return; }
    await updateBooking(row.bookingId, { vehicleNo: v, regNo: v }, row.mobile);
  };

  const stockOptionsForRow = useCallback((row) => {
    if (!row) return [];
    const cKey = normalizeKey(row.company);
    const mKey = normalizeKey(row.model);
    const vKey = normalizeKey(row.variant);
    const colorKey = normalizeKey(row.color);
    const seen = new Set();
    const out = [];
    stockItems.forEach((s) => {
      if (!isStockAllowed(s)) return;
      if (cKey && normalizeKey(s.company) !== cKey) return;
      if (mKey && normalizeKey(s.model) !== mKey) return;
      if (vKey && normalizeKey(s.variant) !== vKey) return;
      if (colorKey && normalizeKey(s.color) !== colorKey) return;
      const ch = normalizeChassis(s.chassisNo || s.chassis || '');
      if (!ch || seen.has(ch)) return;
      seen.add(ch);
      const labelParts = [ch];
      const color = String(s.color || '').trim();
      const branch = String(s.sourceBranch || s.branch || '').trim();
      if (color) labelParts.push(color);
      if (branch) labelParts.push(branch);
      out.push({ value: ch, label: labelParts.join(' - ') });
    });
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [stockItems, isStockAllowed]);

  const findStockMatch = useCallback((row, chassisValue) => {
    const target = normalizeChassis(chassisValue);
    if (!target || !row) return null;
    const cKey = normalizeKey(row.company);
    const mKey = normalizeKey(row.model);
    const vKey = normalizeKey(row.variant);
    const colorKey = normalizeKey(row.color);
    return stockItems.find((s) => {
      if (!isStockAllowed(s)) return false;
      const ch = normalizeChassis(s.chassisNo || s.chassis || '');
      if (ch !== target) return false;
      if (cKey && normalizeKey(s.company) !== cKey) return false;
      if (mKey && normalizeKey(s.model) !== mKey) return false;
      if (vKey && normalizeKey(s.variant) !== vKey) return false;
      if (colorKey && normalizeKey(s.color) !== colorKey) return false;
      return true;
    }) || null;
  }, [stockItems, isStockAllowed]);

  useEffect(() => {
    if (!assignModal.open || !assignModal.row) return;
    const row = assignModal.row;
    const baseNote = row.bookingId ? `Booking ID ${row.bookingId}` : '';
    stockMoveForm.setFieldsValue({
      company: row.company || '',
      model: row.model || '',
      variant: row.variant || '',
      color: row.color || '',
      sourceBranch: row.branch || '',
      chassis: '',
      notes: baseNote ? `Added for ${baseNote}` : '',
    });
    setAssignDraft('');
    loadStockItems();
  }, [assignModal.open, assignModal.row, loadStockItems, stockMoveForm]);

  const openAssignModal = (row) => {
    if (!row?.bookingId) {
      message.warning('Booking ID missing for this row.');
      return;
    }
    setEditingChassisId(null);
    setChassisDraft('');
    setAssignModal({ open: true, row });
  };

  const closeAssignModal = () => {
    if (assignSaving || stockMoveSaving) return;
    setAssignModal({ open: false, row: null });
    setAssignDraft('');
    stockMoveForm.resetFields();
  };

  const startChassisEdit = (row) => {
    if (!row?.bookingId) {
      message.warning('Booking ID missing for this row.');
      return;
    }
    if (!row?.chassis) {
      openAssignModal(row);
      return;
    }
    setEditingChassisId(row.bookingId);
    setChassisDraft(normalizeChassis(row?.chassis || ''));
    loadStockItems();
  };

  const cancelChassisEdit = () => {
    if (chassisSaving) return;
    setEditingChassisId(null);
    setChassisDraft('');
  };

  const assignChassisToBooking = async (row, chassisValue) => {
    if (!row?.bookingId) return false;
    const nextVal = normalizeChassis(chassisValue);
    if (!nextVal) {
      message.error('Select a chassis from stock to assign.');
      return false;
    }
    const matched = findStockMatch(row, nextVal);
    if (!matched) {
      message.error('Chassis not found in stock. Add stock movement first.');
      return false;
    }
    const ok = await updateBooking(row.bookingId, { chassis: nextVal }, row.mobile);
    if (!ok) return false;
    if (matched && nextVal) {
      const createdBy = currentUser?.name || currentUser?.email || 'user';
      const rowData = {
        Chassis_No: nextVal,
        Company: matched.company || row.company || '',
        Model: matched.model || row.model || '',
        Variant: matched.variant || row.variant || '',
        Color: matched.color || row.color || '',
        Action: 'invoice',
        Customer_Name: row.name || '',
        Source_Branch: matched.sourceBranch || matched.branch || '',
        Notes: row.bookingId ? `Allotted to Booking ID ${row.bookingId}` : 'Allotted from bookings',
      };
      try {
        const resp = await createStock({ data: rowData, createdBy });
        const okStock = !!(resp?.success ?? resp?.ok);
        if (!okStock) {
          message.error(resp?.message || 'Saved booking but failed to update stock.');
        } else {
          setStockItems((prev) => prev.filter((s) => normalizeChassis(s.chassisNo || s.chassis || '') !== nextVal));
        }
      } catch {
        message.error('Saved booking but failed to update stock.');
      }
    }
    return true;
  };

  const handleAssignFromStock = async () => {
    if (!assignModal.row || assignSaving) return;
    setAssignSaving(true);
    const ok = await assignChassisToBooking(assignModal.row, assignDraft);
    setAssignSaving(false);
    if (ok) {
      setAssignModal({ open: false, row: null });
      setAssignDraft('');
      stockMoveForm.resetFields();
    }
  };

  const handleAddStockMovement = async () => {
    if (!assignModal.row || stockMoveSaving) return;
    try {
      const values = await stockMoveForm.validateFields();
      setStockMoveSaving(true);
      const row = assignModal.row;
      const chassisVal = normalizeChassis(values.chassis);
      const baseNote = row.bookingId ? `Booking ID ${row.bookingId}` : '';
      const notesRaw = String(values.notes || '').trim();
      const notes = baseNote ? (notesRaw ? `${notesRaw} | ${baseNote}` : baseNote) : notesRaw;
      const payload = {
        Chassis_No: chassisVal,
        Company: values.company || row.company || '',
        Model: values.model || row.model || '',
        Variant: values.variant || row.variant || '',
        Color: values.color || row.color || '',
        Action: 'add',
        Source_Branch: values.sourceBranch || row.branch || '',
        Notes: notes,
      };
      const createdBy = currentUser?.name || currentUser?.email || 'user';
      const resp = await createStock({ data: payload, createdBy });
      const ok = !!(resp?.success ?? resp?.ok);
      if (ok) {
        message.success('Stock movement saved. Now assign from stock above.');
        loadStockItems(true);
        setAssignDraft(chassisVal);
      } else {
        message.error(resp?.message || 'Failed to save stock movement.');
      }
    } catch (err) {
      if (err?.errorFields) return;
      const apiMessage = err?.response?.data?.message || err?.message;
      message.error(apiMessage || 'Failed to save stock movement.');
    } finally {
      setStockMoveSaving(false);
    }
  };

  const handleSaveChassis = async (row) => {
    if (!row?.bookingId || chassisSaving) return;
    const nextVal = normalizeChassis(chassisDraft);
    const currentVal = normalizeChassis(row?.chassis || '');
    if (nextVal === currentVal) {
      cancelChassisEdit();
      return;
    }
    setChassisSaving(true);
    const ok = await assignChassisToBooking(row, nextVal);
    setChassisSaving(false);
    if (ok) {
      setEditingChassisId(null);
      setChassisDraft('');
    }
  };

  const stackStyle = { display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.2 };
  const lineStyle = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  const smallLineStyle = { ...lineStyle, fontSize: 11 };
  const wrapLineStyle = { whiteSpace: 'normal' };
  const stampRemark = (note) => {
    const ts = dayjs().format('DD-MM-YYYY HH:mm');
    const text = String(note || '').trim();
    return text ? `${ts} - ${text}` : ts;
  };
  const assignRow = assignModal.row;
  const assignVehicleLabel = assignRow
    ? [assignRow.company, assignRow.model, assignRow.variant, assignRow.color].filter(Boolean).join(' ')
    : '';
  const sourceBranchChoices = assignRow
    ? uniqCaseInsensitive([assignRow.branch, ...branchOptions].filter(Boolean))
    : branchOptions;

  let columns = [
    { title: 'Date / Branch', key: 'dateBranch', width: 130, render: (_, r) => {
      const ms = parseTsMs(r.ts);
      const dt = ms ? dayjs(ms).format('DD-MM-YYYY HH:mm') : '—';
      return (
        <div style={stackStyle}>
          <div style={lineStyle}>{dt}</div>
          <div style={lineStyle}><Text type="secondary">{r.branch || '—'}</Text></div>
        </div>
      );
    } },
    { title: 'Customer / Mobile / Model / File', key: 'customerVehicleFile', width: 240, render: (_, r) => {
      const model = String(r.model || '').trim() || '—';
      const variant = String(r.variant || '').trim() || '—';
      const color = String(r.color || '').trim();
      const modelLine = [model, variant, color].filter(Boolean).join(' || ') || '—';
      return (
        <div style={stackStyle}>
          <div style={lineStyle}>{r.name || '—'}</div>
          <div style={lineStyle}><Text type="secondary">{r.mobile || '—'}</Text></div>
          <div style={smallLineStyle}>{modelLine}</div>
          <div style={wrapLineStyle}>
            <Space size={6} wrap>
              <LinkCell url={r.fileUrl} />
              <Button size='small' type='primary' onClick={()=> setPrintModal({ open: true, row: r })} title='Print' aria-label='Print'>🖨️</Button>
              <Button size='small' onClick={()=> setDetailModal({ open: true, row: r })} title='View details' aria-label='View details'>👁️</Button>
            </Space>
          </div>
        </div>
      );
    } },
    { title: 'Chassis / Stk Status + Actions', key: 'chassisStock', width: 210, render: (_, r) => {
      const isEditing = editingChassisId === r.bookingId;
      if (isEditing) {
        const options = stockOptionsForRow(r);
        const matched = findStockMatch(r, chassisDraft);
        return (
          <Space direction="vertical" size={4}>
            <Space size={6} align="center" wrap>
              <AutoComplete
                value={chassisDraft}
                options={options}
                allowClear
                style={{ width: 200 }}
                placeholder={stockLoading ? 'Loading stock...' : 'Pick chassis from stock'}
                disabled={chassisSaving}
                onChange={(val) => setChassisDraft(normalizeChassis(val))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveChassis(r);
                  }
                }}
                filterOption={(inputValue, option) =>
                  String(option?.value || '').toLowerCase().includes(String(inputValue || '').toLowerCase()) ||
                  String(option?.label || '').toLowerCase().includes(String(inputValue || '').toLowerCase())
                }
              />
              <Button size="small" type="primary" loading={chassisSaving} onClick={() => handleSaveChassis(r)}>
                Save
              </Button>
              <Button size="small" disabled={chassisSaving} onClick={cancelChassisEdit}>
                Cancel
              </Button>
            </Space>
            <Text type="secondary">
              {matched
                ? `In stock at ${matched.sourceBranch || matched.branch || 'branch'} - will be allotted on save.`
                : (options.length ? 'Pick from stock list to allot. If missing, add stock movement first.' : 'No stock for this model in current branches. Add stock movement first.')}
            </Text>
          </Space>
        );
      }
      const lbl = stockLabel(r.chassis, r.availability);
      const statusText = String(r.status || 'pending').replace(/_/g, ' ');
      const canAssign = !r.chassis;
      return (
        <div style={stackStyle}>
          <div style={wrapLineStyle}>
            <Space size={6} align="center" wrap>
              <span
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', cursor: 'pointer' }}
                title={canAssign ? 'Assign chassis' : 'Edit chassis'}
                onClick={() => (canAssign ? openAssignModal(r) : startChassisEdit(r))}
              >
                {r.chassis || '-'}
              </span>
              {canAssign ? (
                <Button size="small" type="link" onClick={() => openAssignModal(r)}>
                  Assign
                </Button>
              ) : null}
            </Space>
          </div>
          <div style={wrapLineStyle}>
            <Space size={6} wrap>
              <Tag color={stockColor(lbl)}>{lbl}</Tag>
              <Tag color={STATUS_COLOR[String(r.status || '').toLowerCase()] || 'default'}>{statusText}</Tag>
            </Space>
          </div>
        </div>
      );
    } },
  ];

  // Extended actions: Invoice / Insurance / RTO / Vehicle No
  columns.push({
    title: 'More', key: 'more', width: 200,
    render: (_, r) => (
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Select
          size='small'
          placeholder='Invoice'
          style={{ width: '100%' }}
          onChange={(v)=> handleInvoiceChange(r, v)}
          options={[
            { value: 'submit_to_dealer', label: 'Submit to dealer' },
            { value: 'pending_by_dealer', label: 'Pending by dealer' },
            { value: 'received', label: 'Received (upload)' },
          ]}
        />
        <Select
          size='small'
          placeholder='Insurance'
          style={{ width: '100%' }}
          onChange={(v)=> handleInsuranceChange(r, v)}
          options={[
            { value: 'sent', label: 'Sent insurance' },
            { value: 'received', label: 'Received (upload)' },
          ]}
        />
        <Select
          size='small'
          placeholder='RTO status'
          style={{ width: '100%' }}
          onChange={(v)=> handleRtoChange(r, v)}
          options={[
            { value: 'finance_otp_pending', label: 'Finance Payment pending' },
            { value: 'customer_otp_taken', label: 'Customer OTP Pending' },
            { value: 'registration_done', label: 'Registration done' },
          ]}
        />
        <Space size={6} align="center">
          <Input
            size='small'
            placeholder='KA55HY5666'
            style={{ width: 120 }}
            value={vehNoDraft[r.bookingId] ?? (r.vehicleNo || '')}
            onChange={(e)=> setVehNoDraft((m)=> ({ ...m, [r.bookingId]: normalizeVehNo(e.target.value) }))}
            onPressEnter={()=> handleSaveVehNo(r)}
          />
          <Button size='small' onClick={()=> handleSaveVehNo(r)}>Save</Button>
        </Space>
      </Space>
    )
  });

  // Show snapshot of extended statuses
  columns.push({
    title: 'Progress', key: 'progress', width: 120,
    render: (_, r) => {
      const raw = r._raw || {};
      const inv = raw['Invoice Status'] || raw['invoiceStatus'] || r.invoiceStatus || '';
      const invUrl = raw['Invoice File URL'] || raw['Invoice_File_URL'] || raw['invoiceFileUrl'] || r.invoiceFileUrl || '';
      const ins = raw['Insurance Status'] || raw['insuranceStatus'] || r.insuranceStatus || '';
      const insUrl = raw['Insurance File URL'] || raw['Insurance_File_URL'] || raw['insuranceFileUrl'] || r.insuranceFileUrl || '';
      const rto = raw['RTO Status'] || raw['rtoStatus'] || r.rtoStatus || '';
      const vno = raw['Vehicle No'] || raw['Vehicle_No'] || raw['vehicleNo'] || r.vehicleNo || '';
      const lineStyle = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          <div style={lineStyle}>
            <Tag color='geekblue' title='Invoice'>{String(inv||'-').replace(/_/g,' ')}</Tag>
            {invUrl ? <a href={invUrl} target="_blank" rel="noopener noreferrer">📎</a> : null}
          </div>
          <div style={lineStyle}>
            <Tag color='cyan' title='Insurance'>{String(ins||'-').replace(/_/g,' ')}</Tag>
            {insUrl ? <a href={insUrl} target="_blank" rel="noopener noreferrer">📎</a> : null}
          </div>
          <div style={lineStyle}>
            <Tag title='RTO'>{String(rto||'-').replace(/_/g,' ')}</Tag>
          </div>
          <div style={lineStyle}>
            <Tag title='Vehicle No'>{vno || '-'}</Tag>
          </div>
        </div>
      );
    }
  });

  const showRemarks = ["backend","admin","owner"].includes(userRole);

  columns.push({
      title: showRemarks ? 'Actions + Remarks' : 'Actions',
      key: 'actions',
      width: showRemarks ? 210 : 170,
      render: (_, r) => (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Select
            size='small'
            defaultValue={r.status || 'pending'}
            style={{ width: '100%' }}
            onChange={(v)=> updateBooking(r.bookingId, { status: v }, r.mobile)}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'seen', label: 'Seen' },
              { value: 'approved', label: 'Approved' },
              { value: 'allotted', label: 'Allotted' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
          {/* Removed per request: Mark Seen button */}
          {showRemarks ? (
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Space size={6} wrap>
                <Tag color={remarksMap[r.bookingId]?.level === 'alert' ? 'red' : remarksMap[r.bookingId]?.level === 'warning' ? 'gold' : remarksMap[r.bookingId]?.level === 'ok' ? 'green' : 'default'}>
                  {remarksMap[r.bookingId]?.level ? String(remarksMap[r.bookingId].level).toUpperCase() : '—'}
                </Tag>
                <Button size='small' onClick={()=> setRemarkModal({ open: true, refId: r.bookingId, level: remarksMap[r.bookingId]?.level || 'ok', text: remarksMap[r.bookingId]?.text || '' })}>
                  Remark
                </Button>
              </Space>
              <Tooltip title={remarksMap[r.bookingId]?.text ? <span style={{ whiteSpace: 'pre-wrap' }}>{remarksMap[r.bookingId].text}</span> : null}>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {remarksMap[r.bookingId]?.text || '—'}
                </div>
              </Tooltip>
            </Space>
          ) : null}
        </Space>
      )
  });
  

  const total = USE_SERVER_PAG ? totalCount : rows.length;
  const tableHeight = isMobile ? 420 : 600;
  const visibleRows = USE_SERVER_PAG ? filtered : (renderMode === 'loadMore' ? filtered.slice(0, loadedCount) : filtered);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <Space size="small" wrap>
          <Select
            value={branchFilter}
            onChange={setBranchFilter}
            style={{ minWidth: 160 }}
            disabled={!['owner','admin','backend'].includes(userRole)}
            options={branches.map(b => ({ value: b, label: b === 'all' ? 'All Branches' : b }))}
          />
          <Select value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 160 }}
                  options={statuses.map(s => ({ value: s, label: s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') }))} />
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(v)=>{ setDateRange(v); setQuickKey(null); }}
            allowClear
          />
          <Button size='small' type={quickKey==='today'?'primary':'default'} onClick={()=>{ const t = dayjs(); setDateRange([t,t]); setQuickKey('today'); }}>Today</Button>
          <Button size='small' type={quickKey==='yesterday'?'primary':'default'} onClick={()=>{ const y = dayjs().subtract(1,'day'); setDateRange([y,y]); setQuickKey('yesterday'); }}>Yesterday</Button>
          <Button size='small' onClick={()=>{ setDateRange(null); setQuickKey(null); }}>Clear</Button>
          <Input placeholder="Search name/mobile/booking" allowClear value={q} onChange={(e)=>setQ(e.target.value)} style={{ minWidth: 220 }} />
        </Space>
        <div style={{ flex: 1 }} />
        <Space>
          <Button type="primary" onClick={() => {
            setFormModal({ open: true });
            if (!branchOptions.length || !executiveOptions.length) loadDropdowns();
          }}>Booking Form</Button>
          <Tag color="blue">Total: {total}</Tag>
          <Tag color="geekblue">Showing: {USE_SERVER_PAG ? visibleRows.length : (renderMode==='loadMore' ? visibleRows.length : filtered.length)}{statusFilter !== 'all' ? ` (status: ${statusFilter})` : ''}</Tag>
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
            // re-run the loader without full page refresh
            const ev = new Event('reload-bookings');
            window.dispatchEvent(ev);
          }}>Refresh</Button>
        </Space>
      </div>

      <Table
        dataSource={visibleRows}
        columns={columns}
        loading={loading && !hasCache}
        size="small"
        className="compact-table"
        tableLayout="fixed"
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
        rowKey={(r) => `${r.bookingId}-${r.mobile}-${r.ts}-${r.key}`}
        scroll={{ y: tableHeight }}
      />

      {!USE_SERVER_PAG && renderMode==='loadMore' && visibleRows.length < filtered.length ? (
        <div style={{ display:'flex', justifyContent:'center', padding: 8 }}>
          <Button onClick={()=> setLoadedCount((n)=> Math.min(n + pageSize, filtered.length))}>
            Load more ({filtered.length - visibleRows.length} more)
          </Button>
        </div>
      ) : null}

      <Modal
        open={formModal.open}
        onCancel={()=> setFormModal({ open: false })}
        footer={null}
        width={1040}
        destroyOnClose
        title="New Booking"
        bodyStyle={{ paddingTop: 8 }}
      >
        <BookingForm
          allowBranchSelect
          allowExecutiveSelect
          branchOptions={branchOptions}
          executiveOptions={executiveOptions}
          branchOptionsLoading={dropdownLoading}
          executiveOptionsLoading={dropdownLoading}
          onSuccess={() => {
            setFormModal({ open: false });
            try {
              window.dispatchEvent(new Event('reload-bookings'));
            } catch {
              // ignore
            }
          }}
        />
      </Modal>

      <BookingPrintQuickModal
        open={printModal.open}
        onClose={()=> setPrintModal({ open: false, row: null })}
        row={printModal.row}
        webhookUrl={GAS_URL_STATIC}
        secret={GAS_SECRET_STATIC}
      />
      {/* Prefilled Booking form (View details) */}
      <BookingInlineModal
        open={detailModal.open}
        onClose={()=> setDetailModal({ open: false, row: null })}
        row={detailModal.row}
        webhookUrl={GAS_URL_STATIC}
      />

      <Modal
        open={assignModal.open}
        title={assignRow ? `New Stock Movement – ${assignRow.bookingId || assignRow.name || ''}` : 'New Stock Movement'}
        onCancel={closeAssignModal}
        footer={null}
        width={760}
        destroyOnClose
        maskClosable={!assignSaving && !stockMoveSaving}
        closable={!assignSaving && !stockMoveSaving}
      >
        {assignRow ? (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600 }}>
              {assignRow.name || 'Customer'}{assignRow.mobile ? ` • ${assignRow.mobile}` : ''}
            </div>
            <div style={{ color: '#6b7280' }}>
              {assignRow.branch || '—'}{assignVehicleLabel ? ` • ${assignVehicleLabel}` : ''}
            </div>
            {assignRow.bookingId ? (
              <div style={{ color: '#6b7280' }}>Booking ID: {assignRow.bookingId}</div>
            ) : null}
          </div>
        ) : null}

        <Divider orientation="left" style={{ marginTop: 0 }}>New Stock Movement</Divider>
        <Form form={stockMoveForm} layout="vertical">
          <Row gutter={[12, 8]}>
            <Col xs={24} md={12}>
              <Form.Item name="company" label="Company">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="model" label="Model">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="variant" label="Variant">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="color" label="Color">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="sourceBranch"
                label="Source Branch"
                rules={[{ required: true, message: 'Source branch is required' }]}
              >
                {sourceBranchChoices.length ? (
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select branch"
                    options={sourceBranchChoices.map((b) => ({ label: b, value: b }))}
                  />
                ) : (
                  <Input placeholder="Enter source branch" />
                )}
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="chassis"
                label="Chassis No."
                rules={[{ required: true, message: 'Chassis number is required' }]}
              >
                <Input
                  placeholder="Enter chassis number"
                  onChange={(e) => stockMoveForm.setFieldsValue({ chassis: normalizeChassis(e.target.value) })}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} placeholder="Optional notes" />
          </Form.Item>
          <Space>
            <Button type="primary" onClick={handleAddStockMovement} loading={stockMoveSaving} disabled={!assignRow}>
              Save Stock Movement
            </Button>
            <Text type="secondary">After saving, assign the chassis below.</Text>
          </Space>
        </Form>

        <Divider orientation="left">Assign from Stock</Divider>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <AutoComplete
            value={assignDraft}
            options={assignRow ? stockOptionsForRow(assignRow) : []}
            allowClear
            style={{ width: '100%' }}
            placeholder={stockLoading ? 'Loading stock...' : 'Pick chassis from stock'}
            disabled={assignSaving}
            onChange={(val) => setAssignDraft(normalizeChassis(val))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAssignFromStock();
              }
            }}
            filterOption={(inputValue, option) =>
              String(option?.value || '').toLowerCase().includes(String(inputValue || '').toLowerCase()) ||
              String(option?.label || '').toLowerCase().includes(String(inputValue || '').toLowerCase())
            }
          />
          <Space>
            <Button type="primary" onClick={handleAssignFromStock} loading={assignSaving} disabled={!assignRow}>
              Assign Chassis
            </Button>
            <Text type="secondary">Only chassis from stock list can be assigned.</Text>
          </Space>
        </Space>
      </Modal>

      <Modal
        open={remarkModal.open}
        title={`Update Remark: ${remarkModal.refId}`}
        onCancel={()=> remarkSaving ? null : setRemarkModal({ open: false, refId: '', level: 'ok', text: '' })}
        confirmLoading={remarkSaving}
        maskClosable={!remarkSaving}
        keyboard={!remarkSaving}
        closable={!remarkSaving}
        cancelButtonProps={{ disabled: remarkSaving }}
        onOk={async ()=>{
          if (remarkSaving) return;
          setRemarkSaving(true);
          try {
            if (!GAS_URL_STATIC) { message.error('Booking GAS URL not configured'); return; }
            const stampedText = stampRemark(remarkModal.text);
            const body = GAS_SECRET_STATIC ? { action: 'remark', bookingId: remarkModal.refId, level: remarkModal.level, text: stampedText, secret: GAS_SECRET_STATIC } : { action: 'remark', bookingId: remarkModal.refId, level: remarkModal.level, text: stampedText };
            const resp = await saveBookingViaWebhook({ webhookUrl: GAS_URL_STATIC, method: 'POST', payload: body });
            if (resp && (resp.ok || resp.success)) {
              setRemarksMap((m)=> ({ ...m, [remarkModal.refId]: { level: remarkModal.level, text: stampedText } }));
              setRows(prev => prev.map(x => x.bookingId === remarkModal.refId ? {
                ...x,
                RemarkLevel: remarkModal.level.toUpperCase(),
                RemarkText: stampedText,
                _remarkLevel: remarkModal.level,
                _remarkText: stampedText
              } : x));
              message.success('Remark saved to sheet');
              setRemarkModal({ open: false, refId: '', level: 'ok', text: '' });
            } else { message.error('Save failed'); }
          } catch { message.error('Save failed'); }
          finally { setRemarkSaving(false); }
        }}
      >
        <Space direction='vertical' style={{ width: '100%' }}>
          <Select
            value={remarkModal.level}
            onChange={(v)=> setRemarkModal((s)=> ({ ...s, level: v }))}
            options={[{value:'ok',label:'OK (Green)'},{value:'warning',label:'Warning (Yellow)'},{value:'alert',label:'Alert (Red)'}]}
            style={{ width: 220 }}
          />
          <Input maxLength={140} showCount value={remarkModal.text} onChange={(e)=> setRemarkModal((s)=> ({ ...s, text: e.target.value }))} placeholder='Short note (optional)' />
        </Space>
      </Modal>

      <Modal
        open={actionModal.open}
        title={`${actionModal.type === 'invoice' ? 'Invoice' : 'Insurance'} – Upload file`}
        onCancel={()=> setActionModal({ open: false, type: '', row: null, fileList: [], loading: false })}
        confirmLoading={actionModal.loading}
        okText={actionModal.loading ? 'Saving…' : 'Save'}
        cancelButtonProps={{ disabled: actionModal.loading }}
        maskClosable={!actionModal.loading}
        onOk={async ()=>{
          // Guard double clicks
          if (actionModal.loading) return;
          if (!actionModal.row) { setActionModal({ open:false, type:'', row:null, fileList:[], loading:false }); return; }
          const f = (actionModal.fileList || [])[0];
          if (!f) { message.error('Please select a PDF file'); return; }
          // Flip loading first so the spinner renders before heavy work
          setActionModal((s)=> ({ ...s, loading: true }));
          const msgKey = 'upload-progress';
          message.loading({ key: msgKey, content: 'Uploading and saving…', duration: 0 });
          setTimeout(async () => {
            try {
              const up = await uploadFileToGAS(f);
              const url = up?.url || up?.downloadUrl || '';
              if (!url) { message.error({ key: msgKey, content: 'Upload failed' }); setActionModal((s)=> ({ ...s, loading: false })); return; }
              if (actionModal.type === 'invoice') {
                await updateBooking(actionModal.row.bookingId, { invoiceStatus: 'received', invoiceFileUrl: url }, actionModal.row.mobile);
              } else if (actionModal.type === 'insurance') {
                await updateBooking(actionModal.row.bookingId, { insuranceStatus: 'received', insuranceFileUrl: url }, actionModal.row.mobile);
              }
              message.success({ key: msgKey, content: 'Saved successfully' });
              setActionModal({ open: false, type: '', row: null, fileList: [], loading: false });
            } catch  {
              message.error({ key: msgKey, content: 'Could not upload file' });
              setActionModal((s)=> ({ ...s, loading: false }));
            }
          }, 0);
        }}
      >
        <Upload.Dragger
          multiple={false}
          beforeUpload={beforeUploadPdf}
          accept='.pdf'
          fileList={actionModal.fileList}
          maxCount={1}
          disabled={actionModal.loading}
          onChange={({ fileList })=> setActionModal((s)=> ({ ...s, fileList: fileList.slice(0,1) }))}
          itemRender={(origin) => origin}
        >
          <p>Drop PDF here or click to select (max 5MB, PDF only)</p>
        </Upload.Dragger>
      </Modal>
    </div>
  );
}



// Parse various timestamp formats from Sheets to epoch ms
function parseTsMs(v) {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  // ISO or RFC strings
  const dIso = new Date(s);
  if (!isNaN(dIso.getTime())) return dIso.getTime();
  // dd/mm/yyyy or mm/dd/yyyy with optional time
  const m = s.match(/^(\d{1,2})([/-])(\d{1,2})\2(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (m) {
    const sep = m[2];
    let a = parseInt(m[1], 10), b = parseInt(m[3], 10), y = parseInt(m[4], 10);
    if (y < 100) y += 2000;
    let month, day;
    // If using dash, treat as DD-MM-YYYY; else keep existing heuristic
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

function extractId(u) {
  try {
    if (!u) return null;
    const url = new URL(u);
    if (url.searchParams.get('id')) return url.searchParams.get('id');
    const m = url.pathname.match(/\/d\/([^/]+)/);
    if (m && m[1]) return m[1];
    return null;
  } catch {
    const m = String(u || '').match(/[?&]id=([^&]+)/);
    return m ? m[1] : null;
  }
}

function normalizeLink(u) {
  if (!u) return { view: '', download: '', embed: '' };
  const id = extractId(u);
  if (!id) return { view: u, download: u, embed: u };
  return {
    view: `https://drive.google.com/uc?export=view&id=${id}`,
    download: `https://drive.google.com/uc?export=download&id=${id}`,
    embed: `https://drive.google.com/file/d/${id}/preview`,
  };
}

// Normalize vehicle number to KA55HY5666 style: uppercase, strip non-alphanum, limit to 10
function normalizeChassis(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 20);
}

function normalizeVehNo(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
}

function LinkCell({ url }) {
  if (!url) return <Text type="secondary">—</Text>;
  const { view, download, embed } = normalizeLink(url);
  const content = (
    <div style={{ width: 340 }}>
      <div style={{ height: 260, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
        <iframe src={embed} title="preview" width="100%" height="100%" style={{ display: 'block', border: 0 }} allow="fullscreen" />
      </div>
      <Space>
        <a href={view} target="_blank" rel="noopener">Open</a>
        <a href={download}>Download</a>
      </Space>
    </div>
  );
  return (
    <Space size={6}>
      <Popover content={content} title="Preview" trigger="click">
        <Button size="small" title='Preview' aria-label='Preview'>🔍</Button>
      </Popover>
      <a href={download} title='Download' aria-label='Download'>⬇️</a>
    </Space>
  );
}
