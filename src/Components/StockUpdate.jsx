import React, { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from 'dayjs';
import { Row, Col, Form, Input, Select, Radio, Button, message, Divider, Modal, Table, Space, Tag, Grid, Tooltip, Popconfirm, Alert } from "antd";
// Stock updates now use MongoDB backend only
import { listStocks, listCurrentStocks, createStock, updateStock, listPendingTransfers, admitTransfer, rejectTransfer } from "../apiCalls/stocks";
import BookingForm from "./BookingForm";
import { listBranches, listBranchesPublic } from "../apiCalls/branches";
import { exportToCsv } from "../utils/csvExport";

// --- Config ---
// Vehicle catalog CSV remains (read-only) for dropdowns
const CATALOG_CSV_URL = import.meta.env.VITE_VEHICLE_SHEET_CSV_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQYGuNPY_2ivfS7MTX4bWiu1DWdF2mrHSCnmTznZVEHxNmsrgcGWjVZN4UDUTOzQQdXTnbeM-ylCJbB/pub?gid=408799621&single=true&output=csv";

// --- CSV loader ---
const HEADERS = {
  company: ["Company", "Company Name"],
  model: ["Model", "Model Name"],
  variant: ["Variant"],
  color: ["Color", "Colours", "Colors", "Colour", "Available Colors"],
};

const parseCsv = (text) => {
  const rows = [];
  let row = [], col = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"' && !inQuotes) { inQuotes = true; continue; }
    if (c === '"' && inQuotes) { if (n === '"') { col += '"'; i++; continue; } inQuotes = false; continue; }
    if (c === "," && !inQuotes) { row.push(col); col = ""; continue; }
    if ((c === "\n" || c === "\r") && !inQuotes) { if (col !== "" || row.length) { row.push(col); rows.push(row); row = []; col = ""; } if (c === "\r" && n === "\n") i++; continue; }
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

const pick = (row, keys) => String(keys.map((k) => row[k] ?? "").find((v) => v !== "") || "").trim();
const splitColors = (value) => {
  if (!value) return [];
  return String(value)
    .split(/[|,/;\n]+/)
    .map((c) => c.trim())
    .filter(Boolean);
};

const normalizeCatalogRow = (row = {}) => ({
  company: pick(row, HEADERS.company),
  model: pick(row, HEADERS.model),
  variant: pick(row, HEADERS.variant),
  color: pick(row, HEADERS.color),
});

// (no fallback loader)

// Branch names come from MongoDB Branch collection via API
// We keep a local state array of names

export default function StockUpdate() {
  const { useBreakpoint } = Grid;
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [form] = Form.useForm();
  const [catalog, setCatalog] = useState([]);
  const [company, setCompany] = useState("");
  const [model, setModel] = useState("");
  const [variant, setVariant] = useState("");
  const [sheetOk, setSheetOk] = useState(false);
  const [action, setAction] = useState("add"); // add | transfer | return | invoice
  const [allowedActions, setAllowedActions] = useState(null); // null = all, ["add"] or [specific]
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [editingMovementId, setEditingMovementId] = useState(null);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoicePrefill, setInvoicePrefill] = useState(null);
  const [invoiceBaseRow, setInvoiceBaseRow] = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const [items, setItems] = useState([]);
  const [hasCache, setHasCache] = useState(false);
  // Controlled pagination for the table
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [branchNames, setBranchNames] = useState([]);
  // Admin/Owner filters (computed after role)
  const [branchFilter, setBranchFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all'); // add|transfer|return|invoice|all
  const [qText, setQText] = useState('');
  const [q, setQ] = useState('');
  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [actingTransferId, setActingTransferId] = useState(null);
  const [actingMode, setActingMode] = useState(null);
  const normalizeKey = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
  const dealerOptions = useMemo(() => {
    const name = String(company || '').toLowerCase();
    if (!name) return [];
    // Brand → franchise suggestions
    if (/^hero$/i.test(company) || name.includes('hero')) {
      return ['Poorna Motors', 'Sai Bikes', ];
    }
    if (/^honda$/i.test(company) || name.includes('honda')) {
      return ['Silicon Honda', 'Springs Honda'];
    }
    return [];
  }, [company]);

  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
  }, []);
  const myBranch = useMemo(() => {
    const name = currentUser?.formDefaults?.branchName || currentUser?.primaryBranch?.name || (Array.isArray(currentUser?.branches) ? currentUser.branches[0]?.name : undefined);
    return name || '';
  }, [currentUser]);
  const myRole = useMemo(() => String(currentUser?.role || '').toLowerCase(), [currentUser]);
  const isStaffLike = useMemo(() => ['staff','mechanic','employees'].includes(myRole), [myRole]);
  const isPriv = useMemo(() => ['admin','owner','backend'].includes(myRole), [myRole]);
  const lockSourceBranch = isStaffLike;
  const isAdminOwner = isPriv;
  const pendingBranch = useMemo(() => {
    if (isPriv) {
      if (branchFilter === 'all') return 'all';
      return branchFilter || myBranch || '';
    }
    return myBranch || '';
  }, [isPriv, branchFilter, myBranch]);
  // Fallback: derive pending transfers from existing rows when API returns none
  const computedPending = useMemo(() => {
    const base = (items || []).filter((r) => String(r.action || '').toLowerCase() === 'transfer' && String(r.transferStatus || '').toLowerCase() === 'pending');
    if (isPriv && pendingBranch === 'all') return base;
    const targetKey = normalizeKey(pendingBranch || myBranch || '');
    return base.filter((r) => normalizeKey(r.targetBranch) === targetKey);
  }, [items, pendingBranch, myBranch, isPriv, normalizeKey]);
  const alertPending = pendingTransfers.length ? pendingTransfers : computedPending;
  const listBranchScope = useMemo(() => {
    if (isStaffLike) return myBranch || 'self';
    return branchFilter === 'all' ? 'all' : (branchFilter || 'all');
  }, [isStaffLike, myBranch, branchFilter]);
  const cacheKey = useMemo(
    () => `StockMovements:list:${JSON.stringify({ role: myRole || '', branch: listBranchScope })}`,
    [myRole, listBranchScope]
  );

  useEffect(() => {
    (async () => {
      try {
        const raw = await fetchSheetRowsCSV(CATALOG_CSV_URL);
        const cleaned = raw
          .map(normalizeCatalogRow)
          .filter((r) => r.company && r.model && r.variant);
        setCatalog(cleaned);
        setSheetOk(cleaned.length > 0);
      } catch {
        setCatalog([]);
        setSheetOk(false);
      }
    })();
  }, []);

  // Fetch branches from MongoDB (server API)
  useEffect(() => {
    (async () => {
      try {
        // Prefer authenticated route, fallback to public
        const res = await listBranches({ limit: 100, status: 'active' }).catch(() => null);
        const data = res?.data?.items || [];
        const list = (Array.isArray(data) && data.length ? data : (await listBranchesPublic({ status: 'active', limit: 100 })).data.items) || [];
        const names = Array.from(new Set(list.map((b) => String(b?.name || '').trim()).filter(Boolean)));
        setBranchNames(names);
      } catch {
        setBranchNames([]);
      }
    })();
  }, []);

  // Instant paint from cache for the current role/branch scope
  useEffect(() => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) { setHasCache(false); return; }
      const cached = JSON.parse(raw);
      if (cached && Array.isArray(cached.items)) {
        setItems(cached.items);
        setHasCache(true);
      } else {
        setHasCache(false);
      }
    } catch {
      setHasCache(false);
    }
  }, [cacheKey]);

  const companies = useMemo(() => [...new Set(catalog.map((r) => r.company))], [catalog]);
  const models = useMemo(() => [...new Set(catalog.filter((r) => r.company === company).map((r) => r.model))], [catalog, company]);
  const variants = useMemo(() => [...new Set(catalog.filter((r) => r.company === company && r.model === model).map((r) => r.variant))], [catalog, company, model]);
  // Preset color choices with hex samples for quick pick
  // Updated per requirement to use the following 19 colors
  const PRESET_COLORS = useMemo(() => ([
    { name: "White", hex: "#ffffff", border: "#e5e7eb" },
    { name: "Black", hex: "#111827" },
    { name: "Mat Grey", hex: "#6b7280" },
    { name: "Red", hex: "#ef4444" },
    { name: "Blue", hex: "#2563eb" },
    { name: "Decent Blue", hex: "#3b82f6" },
    { name: "PS Blue", hex: "#1e3a8a" },
    { name: "Deep Ground Grey", hex: "#374151" },
    { name: "Brown", hex: "#8b4513" },
    { name: "Yellow", hex: "#f59e0b" },
    { name: "Purple", hex: "#8b5cf6" },
    { name: "Genny Grey", hex: "#9ca3af" },
    { name: "Militery Green", hex: "#4b5320" },
    { name: "Silver", hex: "#c0c0c0", border: "#9ca3af" },
    { name: "Orange", hex: "#f97316" },
    { name: "Starlight Blue", hex: "#60a5fa" },
    { name: "Gold", hex: "#d4af37" },
    { name: "Copper", hex: "#b87333" },
    { name: "Maroon", hex: "#800000" },
  ]), []);

  const catalogColors = useMemo(() => {
    const dyn = catalog
      .filter((r) => r.company === company && r.model === model && r.variant === variant)
      .flatMap((r) => splitColors(r.color));
    const map = new Map();
    dyn.forEach((c) => {
      const key = String(c).toLowerCase();
      if (!map.has(key)) map.set(key, c);
    });
    return Array.from(map.values());
  }, [catalog, company, model, variant]);

  const colors = useMemo(
    () => (catalogColors.length ? catalogColors : PRESET_COLORS.map((c) => c.name)),
    [catalogColors, PRESET_COLORS]
  );

  const swatch = (name) => {
    const m = PRESET_COLORS.find((x) => x.name.toLowerCase() === String(name || '').toLowerCase());
    return { bg: m?.hex || '#d1d5db', border: m?.border || '#d1d5db' };
  };

  const onCompany = (v) => { setCompany(v); setModel(""); setVariant(""); form.setFieldsValue({ model: undefined, variant: undefined, color: undefined }); };
  const onModel = (v) => { setModel(v); setVariant(""); form.setFieldsValue({ variant: undefined, color: undefined }); };
  const onVariant = (v) => { setVariant(v); form.setFieldsValue({ color: undefined }); };

  const fetchPendingTransfers = useCallback(async () => {
    setLoadingPending(true);
    try {
      const resp = await listPendingTransfers({ branch: pendingBranch || undefined });
      const ok = resp?.success ?? resp?.ok;
      if (!ok && resp?.message) {
        message.warning(resp.message === 'Token Invalid' ? 'Session expired. Please log in again to admit/reject transfers.' : resp.message);
      }
      const list = Array.isArray(resp?.data) ? resp.data : [];
        const rows = list.map((r, idx) => ({
          key: r.movementId || idx + 1,
          movementId: r.movementId || '',
          chassis: r.chassisNo || '',
          company: r.company || '',
          model: r.model || '',
          variant: r.variant || '',
          color: r.color || '',
          sourceBranch: r.sourceBranch || '',
          targetBranch: r.targetBranch || '',
          notes: r.notes || '',
          createdByName: r.createdByName || '',
          ts: pickTs(r),
        }));
      setPendingTransfers(rows);
    } catch {
      setPendingTransfers([]);
    } finally {
      setLoadingPending(false);
    }
  }, [pendingBranch]);

  const onSubmit = async () => {
    let success = false;
    try {
      setFormError("");
      const values = await form.validateFields();
      setSubmitting(true);
      const user = (() => { try { return JSON.parse(localStorage.getItem('user')||'null') } catch { return null } })();
      const row = {
        Chassis_No: String(values.chassis || '').toUpperCase(),
        Company: values.company || '',
        Model: values.model || '',
        Variant: values.variant || '',
        Color: values.color || '',
        Action: action,
        Target_Branch: action === 'transfer' ? (values.targetBranch || '') : '',
        Return_To: action === 'return' ? (values.returnTo || '') : '',
        Customer_Name: action === 'invoice' ? (values.customerName || '') : '',
        Source_Branch: values.sourceBranch || '',
        Notes: (() => {
          const base = String(values.notes || '').trim();
          const fr = action === 'add' ? String(values.franchise || '').trim() : '';
          if (fr) return base ? `${base} | Franchise: ${fr}` : `Franchise: ${fr}`;
          return base;
        })(),
      };
      if (editingMovementId) {
        const resp = await updateStock(editingMovementId, row);
        success = !!(resp?.success ?? resp?.ok);
        if (success) {
          message.success("Stock movement updated.");
          setFormError("");
        } else {
          const errMsg = resp?.message || "Update failed";
          setFormError(errMsg);
          message.error(errMsg);
        }
      } else {
        const resp = await createStock({ data: row, createdBy: user?.name || user?.email || 'user' });
        success = !!(resp?.success ?? resp?.ok);
        if (success) {
          const msg = action === 'transfer'
            ? 'Transfer recorded and waiting for admit by the target branch.'
            : 'Stock movement saved.';
          message.success(msg);
          setFormError("");
        } else {
          const errMsg = resp?.message || "Save failed";
          setFormError(errMsg);
          message.error(errMsg);
        }
      }
      if (!success) return;
      form.resetFields(["chassis", "notes", "targetBranch", "returnTo", "customerName", "franchise"]);
      setModalOpen(false);
      setEditingMovementId(null);
      setAllowedActions(null);
      fetchList();
      if (action === 'transfer') fetchPendingTransfers();
    } catch (err) {
      if (err?.errorFields) return; // antd validation
      const apiMessage = err?.response?.data?.message || err?.message;
      setFormError(apiMessage || "Failed to save. Check configuration or network.");
      message.error(apiMessage || "Failed to save. Check configuration or network.");
    } finally {
      setSubmitting(false);
    }
  };

  const label = (s) => <strong style={{ fontWeight: 700 }}>{s}</strong>;
  const isEdit = Boolean(editingMovementId);
  const isVehicleLocked = action !== 'add' && !isEdit; // allow editing vehicle fields while editing
  const isChassisLocked = action !== 'add' || isEdit;
  const isSourceLocked = lockSourceBranch || action !== 'add';

  useEffect(() => {
    if (isVehicleLocked) return;
    if (catalogColors.length !== 1) return;
    const current = form.getFieldValue('color');
    if (!current) form.setFieldsValue({ color: catalogColors[0] });
  }, [catalogColors, form, isVehicleLocked]);

  const fetchList = async () => {
    setLoadingList(true);
    try {
      // For staff-like roles, show current inventory only (latest per chassis)
      const branchParam = isStaffLike ? myBranch : (branchFilter === 'all' ? undefined : branchFilter);
      const fetchAllPages = async (fetchFn) => {
        const perPage = 5000;
        const maxPages = 40;
        const merged = [];
        const seen = new Set();
        let pageNo = 1;
        let expectedTotal = null;

        while (pageNo <= maxPages) {
          const resp = await fetchFn({ limit: perPage, page: pageNo });
          const list = Array.isArray(resp?.data) ? resp.data : [];
          const total = Number(resp?.total);
          if (Number.isFinite(total) && total > 0) expectedTotal = total;
          if (!list.length) break;

          let added = 0;
          list.forEach((row) => {
            const key = String(row?.movementId || row?._id || "").trim() || JSON.stringify(row);
            if (seen.has(key)) return;
            seen.add(key);
            merged.push(row);
            added += 1;
          });

          if (added === 0) break;
          if (expectedTotal && merged.length >= expectedTotal) break;
          if (list.length < 500) break; // server appears to cap each page at 500
          pageNo += 1;
        }

        return merged;
      };

      const list = isStaffLike
        ? await fetchAllPages(({ limit, page }) => listCurrentStocks({ branch: branchParam, limit, page }))
        : await fetchAllPages(({ limit, page }) => listStocks({ branch: branchParam, mode: undefined, limit, page }));
        const rows = list.map((r, idx) => {
          // Infer action when backend snapshot doesn't carry it (common in current stock view)
          const status = String(r.status || '').toLowerCase();
          const transferStatus = String(r.transferStatus || '').toLowerCase();
          let action = String(r.action || '').toLowerCase();
          if (!action) {
            if (transferStatus && transferStatus !== 'completed') action = 'transfer';
            else if (status === 'in_stock' || status === 'in stock') action = 'add';
            else if (status === 'out') action = 'invoice';
          }
          return {
            key: idx + 1,
            ts: pickTs(r),
            chassis: r.chassisNo || '',
            company: r.company || '',
            model: r.model || '',
            variant: r.variant || '',
            color: r.color || '',
            action: action || '',
            targetBranch: r.targetBranch || '',
            returnTo: r.returnTo || '',
            customerName: r.customerName || '',
            sourceBranch: r.sourceBranch || '',
            lastSourceBranch: r.lastSourceBranch || '',
            notes: r.notes || '',
            movementId: r.movementId || '',
            transferStatus: r.transferStatus || '',
            resolvedByName: r.resolvedByName || '',
            resolvedAt: r.resolvedAt || '',
          };
        });
        setItems(rows);
        setHasCache(true);
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), items: rows }));
        } catch {
          // ignore cache write errors
        }
    } catch {
      if (!hasCache) setItems([]);
      setHasCache(false);
    } finally {
      setLoadingList(false);
    }
  };

  const admitPendingTransfer = async (movementId) => {
    setActingTransferId(movementId);
    setActingMode('admit');
    try {
      const resp = await admitTransfer(movementId);
      if (!resp?.success) throw new Error(resp?.message || 'Admit failed');
      message.success('Transfer admitted to this branch.');
      await fetchList();
    } catch (err) {
      message.error(err?.message || 'Failed to admit transfer.');
    } finally {
      setActingTransferId(null);
      setActingMode(null);
      await fetchPendingTransfers();
    }
  };

  const rejectPendingTransfer = async (movementId) => {
    setActingTransferId(movementId);
    setActingMode('reject');
    try {
      const resp = await rejectTransfer(movementId);
      if (!resp?.success) throw new Error(resp?.message || 'Reject failed');
      message.success('Transfer rejected; stock stays in source branch.');
      await fetchList();
    } catch (err) {
      message.error(err?.message || 'Failed to reject transfer.');
    } finally {
      setActingTransferId(null);
      setActingMode(null);
      await fetchPendingTransfers();
    }
  };

  useEffect(() => { fetchList(); }, [myBranch]);
  // Refetch when admin/owner changes branch filter
  useEffect(() => { if (isPriv) fetchList(); }, [isPriv, branchFilter]);
  useEffect(() => { fetchPendingTransfers(); }, [fetchPendingTransfers]);

  // When opening the modal, prefill and lock Source Branch for staff-like roles
  useEffect(() => {
    if (modalOpen && lockSourceBranch && myBranch) {
      form.setFieldsValue({ sourceBranch: myBranch });
    }
  }, [modalOpen, lockSourceBranch, myBranch, form]);

  

  const onEditRow = (base) => {
    try {
      setEditingMovementId(base?.movementId || null);
      setAllowedActions(null);
      setFormError("");
      const act = String(base?.action || 'add').toLowerCase();
      setAction(act);
      setCompany(base?.company || '');
      setModel(base?.model || '');
      setVariant(base?.variant || '');
      const patch = {
        chassis: base?.chassis || base?.chassisNo || undefined,
        company: base?.company || undefined,
        model: base?.model || undefined,
        variant: base?.variant || undefined,
        color: base?.color || undefined,
        sourceBranch: base?.sourceBranch || myBranch || undefined,
        targetBranch: base?.targetBranch || undefined,
        returnTo: base?.returnTo || undefined,
        customerName: base?.customerName || undefined,
        notes: base?.notes || undefined,
      };
      form.setFieldsValue(patch);
      setModalOpen(true);
    } catch {
      //juji
    }
  };

  const openQuickMovement = (nextAction, base) => {
    if (!base || !nextAction) return;
    try {
      setEditingMovementId(null);
      setAllowedActions([nextAction]);
      setFormError("");
      setAction(nextAction);
      setCompany(base?.company || '');
      setModel(base?.model || '');
      setVariant(base?.variant || '');
      form.resetFields();
      const patch = {
        chassis: base?.chassis || base?.chassisNo || undefined,
        company: base?.company || undefined,
        model: base?.model || undefined,
        variant: base?.variant || undefined,
        color: base?.color || undefined,
        sourceBranch: base?.sourceBranch || base?.lastSourceBranch || myBranch || undefined,
        targetBranch: undefined,
        returnTo: undefined,
        customerName: undefined,
        notes: undefined,
      };
      form.setFieldsValue(patch);
      setModalOpen(true);
    } catch {
      // ignore open failures
    }
  };

  const openBookingModal = (base) => {
    if (!base) return;
    const pre = {
      company: base.company || '',
      bikeModel: base.model || '',
      variant: base.variant || '',
      color: base.color || '',
      chassisNo: base.chassis || '',
      purchaseType: 'cash',
      addressProofMode: 'aadhaar',
      executive: (currentUser?.name || currentUser?.email || ''),
      branch: base.sourceBranch || base.lastSourceBranch || myBranch || '',
    };
    setInvoicePrefill(pre);
    setInvoiceBaseRow(base);
    setInvoiceModalOpen(true);
  };
 

  const stackStyle = { display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.2 };
  const lineStyle = {
    whiteSpace: isMobile ? 'normal' : 'nowrap',
    overflow: 'hidden',
    textOverflow: isMobile ? 'clip' : 'ellipsis',
    wordBreak: isMobile ? 'break-word' : 'normal',
  };
  const chassisLineStyle = { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', wordBreak: 'break-all' };
  const pickTs = (r) => (
    r?.timestamp ||
    r?.createdAt ||
    r?.updatedAt ||
    r?.updated_at ||
    r?.lastUpdated ||
    r?.lastMovementAt ||
    r?.time ||
    r?.date ||
    r?.Timestamp ||
    r?.Time ||
    r?.Date ||
    r?.ts ||
    ''
  );
  const formatTs = (raw) => {
    if (!raw) return '—';
    const num = Number(raw);
    if (!Number.isNaN(num)) {
      const dNum = dayjs(num);
      if (dNum.isValid()) return dNum.format('DD-MM-YYYY HH:mm');
    }
    const d = dayjs(raw);
    return d.isValid() ? d.format('DD-MM-YYYY HH:mm') : String(raw);
  };
  const actionTag = (v, row) => {
    const t = String(v || "").toLowerCase();
    const status = String(row?.transferStatus || '').toLowerCase();
    let color = t === 'transfer' ? 'geekblue' : t === 'return' ? 'volcano' : t === 'invoice' ? 'green' : t === 'add' ? 'purple' : 'default';
    let display = t === 'invoice' ? 'Book' : (v || '-');
    if (t === 'transfer') {
      if (status === 'pending') { color = 'orange'; display = 'Transfer (Pending)'; }
      else if (status === 'rejected') { color = 'red'; display = 'Transfer (Rejected)'; }
      else if (status === 'admitted') { color = 'green'; display = 'Transfer (Admitted)'; }
    }
    return <Tag color={color} style={{ fontSize: 11, lineHeight: 1.1 }}>{display}</Tag>;
  };

  // Core columns
  const baseColsCore = [
    { title: "Time / Source", key: "timeSource", width: isMobile ? 70 : 90, render: (_, r) => (
      <div style={stackStyle}>
        <div style={lineStyle}>{formatTs(pickTs(r))}</div>
        <div style={lineStyle}><span style={{ color: '#6b7280' }}>{r.sourceBranch || '—'}</span></div>
      </div>
    ) },
    { title: "Chassis / Company || Model", key: "chassisCompanyModel", width: isMobile ? 90 : 100, render: (_, r) => (
      <div style={stackStyle}>
        <div style={chassisLineStyle}>
          <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{r.chassis || '-'}</span>
        </div>
        <div style={lineStyle}>{`${r.company || '—'} || ${r.model || '—'}`}</div>
      </div>
    ) },
    { title: "Variant + Color || Action", key: "variantColorAction", width: isMobile ? 110 : 130, render: (_, r) => (
      <div style={stackStyle}>
        <div style={lineStyle}>{r.variant || '—'}</div>
        <div style={lineStyle}>
          <Space size={6}>
            <span>{`${r.color || '—'} ||`}</span>
            {actionTag(r.action, r)}
          </Space>
        </div>
      </div>
    ) },
  ];
  const adminExtras = [
    { title: "Target/Return/Customer + Notes", key: "destNotes", width: isMobile ? 160 : 250, render: (_, r) => (
      <div style={stackStyle}>
        <div style={lineStyle}>{r.targetBranch || r.returnTo || r.customerName || "—"}</div>
        <div style={lineStyle}>{r.notes || "—"}</div>
      </div>
    ) },
  ];
  const actionsCol = {
    title: "Actions",
    key: "actions",
    width: isMobile ? 20 : 40,
    render: (_, r) => (
      isAdminOwner ? (
        <Space size={4} wrap={false} style={{ whiteSpace: 'nowrap' }}>
          <Button size="small" onClick={() => onEditRow(r)} style={{ fontSize: 10, height: 18, padding: '0 6px' }}>Edit</Button>
        </Space>
      ) : isStaffLike ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Space size={4}>
            <Button size="small" onClick={() => openQuickMovement('transfer', r)} style={{ fontSize: 10, height: 18, padding: '0 6px' }}>Transfer</Button>
            <Button size="small" type="primary" onClick={() => openBookingModal(r)} style={{ fontSize: 10, height: 18, padding: '0 6px' }}>Book</Button>
          </Space>
          <Space size={4}>
            <Button size="small" onClick={() => openQuickMovement('return', r)} style={{ fontSize: 10, height: 18, padding: '0 6px' }}>Return</Button>
          </Space>
        </div>
      ) : (
        <span style={{ color: '#94a3b8' }}>—</span>
      )
    )
  };
  // Staff order: Time/Source, Chassis/Company/Model, Variant/Color/Action, Actions
  // Admin/Owner order: Time/Source, Chassis/Company/Model, Variant/Color/Action, Actions, Target/Return/Customer+Notes
  const columns = isStaffLike
    ? [...baseColsCore, actionsCol]
    : [...baseColsCore, actionsCol, ...adminExtras];

  // Client-side filtering (for admin/owner). Staff view already scoped to branch.
  const filteredItems = useMemo(() => {
    const list = items || [];
    const text = String(q || '').toLowerCase();
    return list.filter((r) => {
      if (isPriv && branchFilter !== 'all' && r.sourceBranch !== branchFilter) return false;
      if (actionFilter !== 'all' && String(r.action || '').toLowerCase() !== actionFilter) return false;
      if (text) {
        const hay = [r.chassis, r.company, r.model, r.variant, r.color, r.notes, r.targetBranch, r.returnTo, r.customerName, r.sourceBranch]
          .map((x) => String(x || '').toLowerCase());
        if (!hay.some(h => h.includes(text))) return false;
      }
      return true;
    });
  }, [items, isPriv, branchFilter, actionFilter, q]);

  // Reset to first page when filters change
  useEffect(() => { setPage(1); }, [branchFilter, actionFilter, q]);

  // Debounce qText into q for both staff and admin
  useEffect(() => {
    const h = setTimeout(() => setQ(String(qText || '').trim()), 150);
    return () => clearTimeout(h);
  }, [qText]);

  const handleExportCsv = () => {
    if (!filteredItems.length) {
      message.info('No stock movements to export for current filters');
      return;
    }
    const headers = [
      { key: 'ts', label: 'Timestamp' },
      { key: 'chassis', label: 'Chassis' },
      { key: 'company', label: 'Company' },
      { key: 'model', label: 'Model' },
      { key: 'variant', label: 'Variant' },
      { key: 'color', label: 'Color' },
      { key: 'action', label: 'Action' },
      { key: 'sourceBranch', label: 'Source Branch' },
      { key: 'targetBranch', label: 'Target Branch' },
      { key: 'returnTo', label: 'Return To' },
      { key: 'customerName', label: 'Customer' },
      { key: 'notes', label: 'Notes' },
      { key: 'transferStatus', label: 'Transfer Status' },
    ];
    const rowsForCsv = filteredItems.map((r) => ({
      ts: r.ts,
      chassis: r.chassis,
      company: r.company,
      model: r.model,
      variant: r.variant,
      color: r.color,
      action: r.action,
      sourceBranch: r.sourceBranch || r.lastSourceBranch,
      targetBranch: r.targetBranch,
      returnTo: r.returnTo,
      customerName: r.customerName,
      notes: r.notes,
      transferStatus: r.transferStatus,
    }));
    exportToCsv({ filename: 'stock-movements.csv', headers, rows: rowsForCsv });
    message.success(`Exported ${rowsForCsv.length} stock movements`);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: isMobile ? '1 1 100%' : '1 1 auto' }}>
          <strong>Total:</strong> {filteredItems.length || 0}
          <Input.Search
            placeholder="Search chassis/company/model/notes"
            allowClear
            value={qText}
            onChange={(e)=>setQText(e.target.value)}
            onSearch={(v)=>setQ(String(v || '').trim())}
            style={{ width: isMobile ? '100%' : 260, minWidth: isMobile ? 0 : 220 }}
          />
          {isPriv && (
            <>
              <Select
                value={branchFilter}
                onChange={setBranchFilter}
                style={{ minWidth: 180 }}
                placeholder="Branch"
                options={[{ value: 'all', label: 'All Branches' }, ...branchNames.map(b => ({ value: b, label: b }))]}
              />
              <Select
                value={actionFilter}
                onChange={setActionFilter}
                style={{ width: 150 }}
                placeholder="Action"
                options={[{value:'all',label:'All Actions'},{value:'add',label:'Add'},{value:'transfer',label:'Transfer'},{value:'return',label:'Return'},{value:'invoice',label:'Invoice'}]}
              />
            </>
          )}
          <Button onClick={()=>{ setQText(''); setQ(''); setActionFilter('all'); setBranchFilter('all'); }}>Reset</Button>
      </div>
        <Space wrap size="small" style={{ width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
          <Button onClick={handleExportCsv} style={{ flex: isMobile ? '1 1 auto' : '0 0 auto' }}>Export CSV</Button>
          <Button onClick={fetchList} loading={loadingList} style={{ flex: isMobile ? '1 1 auto' : '0 0 auto' }}>Refresh</Button>
          <Button
            type="primary"
            style={{ flex: isMobile ? '1 1 auto' : '0 0 auto' }}
            onClick={() => {
              setAllowedActions(["add"]);
              setAction("add");
              setEditingMovementId(null);
              setFormError("");
              // reset form except locked fields
              form.resetFields();
              if (lockSourceBranch && myBranch) {
                form.setFieldsValue({ sourceBranch: myBranch });
              }
              setModalOpen(true);
            }}
          >
            New Movement
          </Button>
        </Space>
      </div>

      <div style={{ marginBottom: 16, padding: 12, border: '1px solid #f97316', background: '#fff7ed', borderRadius: 10, boxShadow: '0 1px 0 rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700 }}>Notifications / Pending Transfers</div>
            <div style={{ fontSize: 12, color: '#92400e' }}>
              {pendingBranch === 'all' && isPriv
                ? 'Showing pending transfers across all branches'
                : `Transfers awaiting admit for ${pendingBranch || myBranch || 'your branch'}`}
            </div>
          </div>
          <Space size="small" wrap>
            <Tag color={alertPending.length ? 'orange' : 'green'} style={{ margin: 0 }}>
              {alertPending.length} pending
            </Tag>
            <Button size="small" loading={loadingPending} onClick={fetchPendingTransfers}>Refresh alerts</Button>
          </Space>
        </div>
        {alertPending.length === 0 ? (
          <div style={{ marginTop: 8, color: '#92400e', fontSize: 12 }}>
            {loadingPending
              ? 'Checking pending transfers...'
              : (pendingBranch === 'all' && isPriv)
                ? 'No pending transfers across branches.'
                : 'No pending transfers for this branch.'}
          </div>
        ) : (
          <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size="small">
            {alertPending.map((p) => (
              <div key={p.movementId || p.key} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'flex-start', justifyContent: 'space-between', gap: 12, padding: 12, borderRadius: 8, border: '1px dashed #f97316', background: '#fff' }}>
                <div style={{ flex: isMobile ? '0 0 auto' : '1 1 260px', minWidth: isMobile ? 0 : 220 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}>Chassis:</span>
                    <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', wordBreak: 'break-all' }}>{p.chassis || '-'}</span>
                    <Tag color="geekblue" style={{ marginLeft: 4, maxWidth: '100%', whiteSpace: 'normal', lineHeight: 1.2 }}>
                      {[p.company, p.model, p.variant, p.color].filter(Boolean).join(' ')}
                    </Tag>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap', color: '#111827' }}>
                    <span style={{ fontWeight: 600 }}>{p.sourceBranch || 'Source ?'}</span>
                    <span style={{ color: '#6b7280' }}>→</span>
                    <span style={{ fontWeight: 600 }}>{p.targetBranch || 'Target ?'}</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: '#4b5563' }}>
                    Requested by {p.createdByName || 'user'}{p.ts ? ` on ${dayjs(p.ts).format('DD-MM-YYYY HH:mm')}` : ''}
                  </div>
                  {p.notes && <div style={{ marginTop: 4, fontSize: 12, color: '#92400e' }}>Notes: {p.notes}</div>}
                </div>
                <Space size="small" align="start" wrap style={{ width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'flex-end' : 'flex-start' }}>
                  <Button
                    type="primary"
                    size="small"
                    loading={actingTransferId === p.movementId && actingMode === 'admit'}
                    onClick={() => admitPendingTransfer(p.movementId)}
                  >
                    Admit
                  </Button>
                  <Popconfirm
                    title="Reject this transfer?"
                    description={`Keep chassis ${p.chassis || ''} in ${p.sourceBranch || 'source branch'} and clear this alert.`}
                    okText="Reject"
                    okType="danger"
                    onConfirm={() => rejectPendingTransfer(p.movementId)}
                  >
                    <Button
                      danger
                      size="small"
                      loading={actingTransferId === p.movementId && actingMode === 'reject'}
                    >
                      Reject
                    </Button>
                  </Popconfirm>
                </Space>
              </div>
            ))}
          </Space>
        )}
      </div>

      <Table
        dataSource={filteredItems}
        columns={columns}
        loading={loadingList && !hasCache}
        pagination={{
          current: page,
          pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10','25','50','100'],
          onChange: (p, ps) => { setPage(p); if (ps !== pageSize) setPageSize(ps); },
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
        }}
        size="small"
        className="stock-movements-table"
        tableLayout={isMobile ? "auto" : "fixed"}
        scroll={isMobile ? { x: "max-content", y: 420 } : { y: 600 }}
        rowKey={(r) => `${r.ts}-${r.chassis}-${r.key}`}
      />

      <Modal
        title={editingMovementId ? "Edit Stock Movement" : "New Stock Movement"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setAllowedActions(null); setAction("add"); setEditingMovementId(null); setFormError(""); }}
        onOk={onSubmit}
        okText="Save"
        confirmLoading={submitting}
        destroyOnClose
        forceRender
        width={720}
      >
        {formError && (
          <Alert
            type="error"
            showIcon
            message={formError}
            style={{ marginBottom: 12 }}
          />
        )}
        <Form form={form} layout="vertical" initialValues={{}}>
          <Row gutter={[12, 8]}>

            <Col span={24}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ fontWeight: 700 }}>Vehicle Details (from CSV)</div>
                <div style={{ fontSize: 12, color: sheetOk ? "#10b981" : "#ef4444" }}>{sheetOk ? "Catalog loaded" : "Catalog unavailable"}</div>
              </div>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item name="company" label={label("Company")} rules={isVehicleLocked ? [] : [{ required: true, message: "Company is required" }]}> 
                <Select placeholder={sheetOk ? "Select company" : "Sheet unavailable"} disabled={!sheetOk || isVehicleLocked} onChange={onCompany} showSearch optionFilterProp="children">
                  {companies.map((c) => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="model" label={label("Model")} rules={isVehicleLocked ? [] : [{ required: true, message: "Model is required" }]}> 
                <Select placeholder="Select model" disabled={!sheetOk || !company || isVehicleLocked} onChange={onModel} showSearch optionFilterProp="children">
                  {models.map((m) => <Select.Option key={m} value={m}>{m}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item name="variant" label={label("Variant")} rules={isVehicleLocked ? [] : [{ required: true, message: "Variant is required" }]}> 
                <Select placeholder="Select variant" disabled={!sheetOk || !model || isVehicleLocked} onChange={onVariant} showSearch optionFilterProp="children">
                  {variants.map((v) => <Select.Option key={v} value={v}>{v}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="color" label={label("Color")} rules={isVehicleLocked ? [] : [{ required: true, message: "Color is required" }]}> 
                {colors.filter(Boolean).length ? (
                  <Select placeholder="Select color" disabled={!sheetOk || !variant || isVehicleLocked} showSearch optionFilterProp="children">
                    {colors.filter(Boolean).map((c) => {
                      const s = swatch(c);
                      return (
                        <Select.Option key={c} value={c}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 12, height: 12, borderRadius: 3, background: s.bg, border: `1px solid ${s.border}` }} />
                            {c}
                          </span>
                        </Select.Option>
                      );
                    })}
                  </Select>
                ) : (
                  <Input placeholder="Type color" disabled={isVehicleLocked} />
                )}
              </Form.Item>
              {!isVehicleLocked && (
                <Space wrap size="small" style={{ marginTop: -8, marginBottom: 8 }}>
                  {colors.filter(Boolean).map((c) => {
                    const name = String(c || '').trim();
                    if (!name) return null;
                    const s = swatch(name);
                    return (
                      <Tooltip title={name} key={name}>
                        <Button
                          size="small"
                          onClick={() => form.setFieldsValue({ color: name })}
                          style={{
                            height: 28,
                            borderRadius: 14,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '0 10px',
                            border: `1px solid ${s.border || '#d1d5db'}`,
                            background: '#fff'
                          }}
                        >
                          <span style={{ width: 14, height: 14, borderRadius: 7, background: s.bg, border: `1px solid ${s.border || '#d1d5db'}` }} />
                          <span>{name}</span>
                        </Button>
                      </Tooltip>
                    );
                  })}
                </Space>
              )}
            </Col>

            {/* Moved here: Branch + Chassis side by side after Color */}
            <Col xs={24} md={12}>
              <Form.Item name="sourceBranch" label={label("Source Branch")}>
                <Select
                  allowClear={!isSourceLocked}
                  disabled={isSourceLocked}
                  placeholder={isSourceLocked ? (form.getFieldValue('sourceBranch') || myBranch || "Current branch") : "(Optional) Select current branch"}
                  value={isSourceLocked ? (form.getFieldValue('sourceBranch') || myBranch) : undefined}
                >
                  {branchNames.map((b) => (
                    <Select.Option key={b} value={b}>{b}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="chassis" label={label("Chassis No.")} rules={[{ required: true, message: "Chassis number is required" }]}>
                <Input
                  placeholder={isChassisLocked ? "Chassis fixed for this movement" : "Enter chassis number"}
                  disabled={isChassisLocked}
                  onChange={(e) => {
                    const v = (e.target.value || "").toUpperCase();
                    form.setFieldsValue({ chassis: v });
                  }}
                />
              </Form.Item>
            </Col>

            {/* Franchise selector (only when adding new stock and when brand has known dealers) */}
            {action === 'add' && dealerOptions.length > 0 && (
              <Col xs={24} md={12}>
                <Form.Item name="franchise" label={label("Franchise (Dealer)")}> 
                  <Select placeholder="Select franchise" allowClear disabled={!company} showSearch optionFilterProp="children">
                    {dealerOptions.map((d)=> (
                      <Select.Option key={`fr:${d}`} value={d}>{d}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            )}

            <Col span={24}>
              {Array.isArray(allowedActions) && allowedActions.length === 1 ? (
                <div style={{ marginBottom: 8 }}>
                  {label("Action")} <Tag color={action === 'add' ? 'purple' : action === 'transfer' ? 'geekblue' : action === 'return' ? 'volcano' : 'green'} style={{ marginLeft: 8 }}>{action === 'invoice' ? 'Book' : action}</Tag>
                </div>
              ) : (
                <Form.Item label={label("Action")}>
                  <Radio.Group
                    value={action}
                    disabled={isEdit}
                    onChange={(e) => setAction(e.target.value)}
                  >
                    {(allowedActions || ["add","transfer","return","invoice"]).includes("add") && (
                      <Radio value="add">Add New Stock</Radio>
                    )}
                    {(allowedActions || ["add","transfer","return","invoice"]).includes("transfer") && (
                      <Radio value="transfer">Transfer To</Radio>
                    )}
                    {(allowedActions || ["add","transfer","return","invoice"]).includes("return") && (
                      <Radio value="return">Return To</Radio>
                    )}
                    {(allowedActions || ["add","transfer","return","invoice"]).includes("invoice") && (
                      <Radio value="invoice">Book</Radio>
                    )}
                  </Radio.Group>
                </Form.Item>
              )}
            </Col>

            {action === 'transfer' && (
              <Col xs={24} md={12}>
                <Form.Item name="targetBranch" label={label("Target Branch")} rules={[{ required: true, message: "Select target branch" }]}> 
                  <Select placeholder="Select branch" showSearch optionFilterProp="children">
                    {branchNames.map((b) => <Select.Option key={b} value={b}>{b}</Select.Option>)}
                  </Select>
                </Form.Item>
              </Col>
            )}
            {action === 'return' && (
              <Col xs={24} md={12}>
                <Form.Item name="returnTo" label={label("Return To (Dealer/Area)")} rules={[{ required: true, message: "Enter return destination" }]}> 
                  <Input placeholder="e.g., Kengaria / Dealer name" />
                </Form.Item>
              </Col>
            )}
            {action === 'invoice' && (
              <Col xs={24} md={12}>
                <Form.Item 
                  name="customerName" 
                  label={label("Customer Name")} 
                  rules={[{ required: true, message: "Customer name required" }]} 
                  getValueFromEvent={(e) => {
                    const v = e?.target?.value ?? e; 
                    return typeof v === 'string' ? v.toUpperCase() : v;
                  }}
                > 
                  <Input placeholder="ENTER CUSTOMER NAME" style={{ textTransform: 'uppercase' }} />
                </Form.Item>
              </Col>
            )}

            <Col xs={24}>
              <Form.Item name="notes" label={label("Notes")}> 
                <Input.TextArea rows={3} placeholder="Optional notes" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Booking Modal (uses Booking Form) */}
      <Modal
        title="Book"
        open={invoiceModalOpen}
        onCancel={() => { setInvoiceModalOpen(false); setInvoicePrefill(null); }}
        footer={null}
        destroyOnClose
        width={980}
      >
        <BookingForm
          asModal
          initialValues={invoicePrefill || {}}
          autoUpdateStockOnSave={false}
          onSuccess={async ({ response, payload }) => {
            try {
              const veh = payload?.vehicle || {};
              const row = {
                Chassis_No: String(veh.chassisNo || invoiceBaseRow?.chassis || invoiceBaseRow?.chassisNo || '').toUpperCase(),
                Company: veh.company || invoiceBaseRow?.company || '',
                Model: veh.model || invoiceBaseRow?.model || '',
                Variant: veh.variant || invoiceBaseRow?.variant || '',
                Color: veh.color || invoiceBaseRow?.color || '',
                Action: 'invoice',
                Customer_Name: payload?.customerName || '',
                Source_Branch: invoiceBaseRow?.sourceBranch || myBranch || '',
                Notes: response?.bookingId ? `Book via Booking ID ${response.bookingId}` : 'Book via Booking form',
              };
              const stockResp = await createStock({ data: row, createdBy: currentUser?.name || currentUser?.email || 'user' });
              if (!(stockResp?.success ?? stockResp?.ok)) {
                message.error(stockResp?.message || 'Failed to update stock for this booking.');
                return;
              }
              message.success('Stock updated: vehicle marked booked / out of stock');
              setInvoiceModalOpen(false);
              setInvoicePrefill(null);
              setInvoiceBaseRow(null);
              await fetchList();
            } catch (err) {
              const apiMessage = err?.response?.data?.message || err?.message;
              message.error(apiMessage ? `Saved booking but failed to update stock: ${apiMessage}` : 'Saved booking but failed to update stock. Please refresh and try again.');
            }
          }}
        />
      </Modal>
    </div>
  );
}
