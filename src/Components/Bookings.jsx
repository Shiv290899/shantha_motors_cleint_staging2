import React, { useEffect, useMemo, useState } from "react";
import { Table, Grid, Space, Button, Select, Input, Tag, message, Popover, Typography, Modal, Upload, DatePicker } from "antd";
import useDebouncedValue from "../hooks/useDebouncedValue";
// Sheet-only remarks; no backend remarks API
import dayjs from 'dayjs';
import BookingPrintQuickModal from "./BookingPrintQuickModal";
import BookingInlineModal from "./BookingInlineModal";
import { saveBookingViaWebhook } from "../apiCalls/forms";

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
  const [hasCache, setHasCache] = useState(false);
  const [actionModal, setActionModal] = useState({ open: false, type: '', row: null, fileList: [], loading: false });

  // User + branch scoping
  const [userRole, setUserRole] = useState("");
  const [allowedBranches, setAllowedBranches] = useState([]);
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

  // Reuse the same GAS URL for list + print so search works
  const DEFAULT_BOOKING_GAS_URL =
    "https://script.google.com/macros/s/AKfycbydOWWH1jbinBzNj_z5ZRU3906D-tS93o39QSVuH5IfD2YPgPqOTmzNH9FAwWGhorXylg/exec";
  const GAS_URL_STATIC = import.meta.env.VITE_BOOKING_GAS_URL || DEFAULT_BOOKING_GAS_URL;
  const GAS_SECRET_STATIC = import.meta.env.VITE_BOOKING_GAS_SECRET || '';

  const cacheKey = (() => {
    const start = dateRange && dateRange[0] ? dateRange[0].startOf('day').valueOf() : '';
    const end = dateRange && dateRange[1] ? dateRange[1].endOf('day').valueOf() : '';
    return `Bookings:list:${JSON.stringify({ branchFilter, statusFilter, q: debouncedQ||'', start, end, page, pageSize, USE_SERVER_PAG })}`;
  })();

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
        const data = js.data.map((o, idx) => ({
          key: idx,
          ts: pick(o, HEAD.ts),
          tsMs: parseTsMs(pick(o, HEAD.ts)),
          bookingId: pick(o, HEAD.bookingId),
          name: pick(o, HEAD.name),
          mobile: pick(o, HEAD.mobile),
          company: pick(o, HEAD.company),
          model: pick(o, HEAD.model),
          variant: pick(o, HEAD.variant),
          chassis: pick(o, HEAD.chassis),
          fileUrl: pick(o, HEAD.file),
          branch: pick(o, HEAD.branch),
          status: (pick(o, HEAD.status) || 'pending').toLowerCase(),
          availability: pick(o, HEAD.availability),
          _raw: o, // keep original for any extended fields like invoice/insurance/RTO
        }));
        const withRemarks = data.map(r => ({
          ...r,
          RemarkLevel: (r.RemarkLevel || r['RemarkLevel'] || '').toString(),
          RemarkText: r.RemarkText || r['Remark Text'] || ''
        }));
        const filteredRows = withRemarks.filter((r)=>r.bookingId || r.name || r.mobile);
        if (!cancelled) {
          setRows(filteredRows);
          const nextTotal = typeof js.total === 'number' ? js.total : filteredRows.length;
          setTotalCount(nextTotal);
          const map = {}; filteredRows.forEach(rr => { if (rr.bookingId) map[rr.bookingId] = { level: String(rr.RemarkLevel||'').toLowerCase(), text: rr.RemarkText||'' }; });
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

  const branches = useMemo(() => {
    const set = new Set(rows.map((r)=>r.branch).filter(Boolean));
    const all = ["all", ...Array.from(set)];
    const isPriv = ["owner","admin","backend"].includes(userRole);
    if (!isPriv && allowedBranches.length) {
      return all.filter((b)=> b==='all' || allowedBranches.includes(b));
    }
    return all;
  }, [rows, userRole, allowedBranches]);
  const statuses = useMemo(() => {
    const set = new Set(rows.map((r) => (r.status || "").toLowerCase()).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [rows]);

  const filtered = useMemo(() => {
    const allowedSet = new Set((allowedBranches || []).map((b)=>String(b||'').toLowerCase()));
    if (USE_SERVER_PAG) {
      const scoped = rows.filter((r) => {
        if (allowedSet.size && !["owner","admin"].includes(userRole)) {
          if (!allowedSet.has(String(r.branch||'').toLowerCase())) return false;
        }
        if (branchFilter !== "all" && r.branch !== branchFilter) return false;
        if (statusFilter !== "all" && (String(r.status || "").toLowerCase() !== statusFilter)) return false;
        if (dateRange && dateRange[0] && dateRange[1]) {
          const start = dateRange[0].startOf('day').valueOf();
          const end = dateRange[1].endOf('day').valueOf();
          const t = r.tsMs ?? parseTsMs(r.ts);
          if (!t || t < start || t > end) return false;
        }
        if (debouncedQ) {
          const s = debouncedQ.toLowerCase();
          if (![
            r.bookingId, r.name, r.mobile, r.company, r.model, r.variant, r.chassis, r.branch,
          ].some((v) => String(v || "").toLowerCase().includes(s))) return false;
        }
        return true;
      });
      return scoped.slice().sort((a,b)=> (b.tsMs||0)-(a.tsMs||0));
    }
    const list = rows.filter((r) => {
      if (allowedSet.size && !["owner","admin"].includes(userRole)) {
        if (!allowedSet.has(String(r.branch||'').toLowerCase())) return false;
      }
      if (branchFilter !== "all" && r.branch !== branchFilter) return false;
      if (statusFilter !== "all" && (String(r.status || "").toLowerCase() !== statusFilter)) return false;
      if (dateRange && dateRange[0] && dateRange[1]) {
        const start = dateRange[0].startOf('day').valueOf();
        const end = dateRange[1].endOf('day').valueOf();
        const t = r.tsMs ?? parseTsMs(r.ts);
        if (!t || t < start || t > end) return false;
      }
      if (debouncedQ) {
        const s = debouncedQ.toLowerCase();
        if (![
          r.bookingId, r.name, r.mobile, r.company, r.model, r.variant, r.chassis, r.branch,
        ].some((v) => String(v || "").toLowerCase().includes(s))) return false;
      }
      return true;
    });
    return list.sort((a,b)=> (b.tsMs||0)-(a.tsMs||0));
  }, [rows, branchFilter, statusFilter, debouncedQ, dateRange, userRole, allowedBranches, USE_SERVER_PAG]);

  // Reset page when filters/search change
  useEffect(() => {
    setPage(1);
    setLoadedCount(pageSize);
  }, [branchFilter, statusFilter, debouncedQ, dateRange]);

  useEffect(() => { setLoadedCount(pageSize); }, [pageSize]);

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
    try {
      setUpdating(bookingId);
      const DEFAULT_BOOKING_GAS_URL ="https://script.google.com/macros/s/AKfycbydOWWH1jbinBzNj_z5ZRU3906D-tS93o39QSVuH5IfD2YPgPqOTmzNH9FAwWGhorXylg/exec";
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
        next._raw = { ...(r._raw || {}), ...patch };
        return next;
      }));
      message.success('Updated');
    } catch { message.error('Update failed'); }
    finally { setUpdating(null); }
  };

  // Minimal upload helper to GAS (same endpoint used by BookingForm)
  const uploadFileToGAS = async (file) => {
    const DEFAULT_BOOKING_GAS_URL = "https://script.google.com/macros/s/AKfycbydOWWH1jbinBzNj_z5ZRU3906D-tS93o39QSVuH5IfD2YPgPqOTmzNH9FAwWGhorXylg/exec";
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
    const okSize = (file.size || 0) <= 5 * 1024 * 1024; // 5 MB
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

  let columns = [
    { title: 'Date', dataIndex: 'ts', key: 'ts', width: 50, ellipsis: true, render: (v) => {
      const ms = parseTsMs(v);
      return ms ? dayjs(ms).format('YY-MM-DD HH:mm') : '—';
    } },
    { title: 'Branch', dataIndex: 'branch', key: 'branch', width: 50 },
    { title: 'Customer', dataIndex: 'name', key: 'name', width: 50, ellipsis: true },
    { title: 'Mobile', dataIndex: 'mobile', key: 'mobile', width: 20 },
    { title: 'Model', dataIndex: 'model', key: 'model', width: 20 },
    { title: 'Variant', dataIndex: 'variant', key: 'variant', width: 20 },
    { title: 'File', dataIndex: 'fileUrl', key: 'file', width: 50, render: (v, r)=> (
      <Space size={6}>
        <LinkCell url={v} />
        <Button size='small' type='primary' onClick={()=> setPrintModal({ open: true, row: r })} title='Print' aria-label='Print'>🖨️</Button>
        <Button size='small' onClick={()=> setDetailModal({ open: true, row: r })} title='View details' aria-label='View details'>👁️</Button>
      </Space>
    ) },
    { title: 'Chassis', dataIndex: 'chassis', key: 'chassis', width: 20, ellipsis: false, render: (v)=> (
      <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{v || '-'}</span>
    ) },
    { title: 'Stk Status', dataIndex: 'availability', key: 'stk', width: 20, render: (v, r)=> {
      const lbl = stockLabel(r.chassis, v);
      return (<Tag color={stockColor(lbl)}>{lbl}</Tag>);
    } },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 20, render: (s)=> <Tag color={STATUS_COLOR[String(s||'').toLowerCase()] || 'default'}>{String(s||'pending').replace(/_/g,' ')}</Tag> },
  ];
  if (["backend","admin","owner"].includes(userRole)) {
    columns.push({ title: 'Remarks', key: 'remarks', width: 60, render: (_, r) => {
        const rem = remarksMap[r.bookingId];
        const color = rem?.level === 'alert' ? 'red' : rem?.level === 'warning' ? 'gold' : rem?.level === 'ok' ? 'green' : 'default';
        return (
          <Space size={6}>
            <Tag color={color}>{rem?.level ? rem.level.toUpperCase() : '—'}</Tag>
            <Button size='small' onClick={()=> setRemarkModal({ open: true, refId: r.bookingId, level: rem?.level || 'ok', text: rem?.text || '' })}>Remark</Button>
          </Space>
        );
      }
    });
  }
   
  
  columns.push({
      title: 'Actions', key: 'actions', width: 20,
      render: (_, r) => (
        <Space size={6}>
          <Select
            size='small'
            defaultValue={r.status || 'pending'}
            style={{ width: 90 }}
            onChange={(v)=> updateBooking(r.bookingId, { status: v }, r.mobile)}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'seen', label: 'Seen' },
              { value: 'approved', label: 'Approved' },
              { value: 'allotted', label: 'Allotted' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
          <Select
            size='small'
            placeholder='Quick note'
            style={{ width: 150 }}
            onChange={(v)=> updateBooking(r.bookingId, { status: r.status || 'seen', notes: v }, r.mobile)}
            options={[
              { value: 'Checked – proceed.', label: 'Checked – proceed.' },
              { value: 'Allot vehicle.', label: 'Allot vehicle.' },
              { value: 'Please call showroom.', label: 'Please call showroom.' },
            ]}
          />
          {/* Removed per request: Mark Seen button */}
        </Space>
      )
  });

  // Extended actions: Invoice / Insurance / RTO / Vehicle No
  columns.push({
    title: 'More', key: 'more', width: 60,
    render: (_, r) => (
      <Space size={6} wrap>
        <Select
          size='small'
          placeholder='Invoice'
          style={{ width: 130 }}
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
          style={{ width: 130 }}
          onChange={(v)=> handleInsuranceChange(r, v)}
          options={[
            { value: 'sent', label: 'Sent insurance' },
            { value: 'received', label: 'Received (upload)' },
          ]}
        />
        <Select
          size='small'
          placeholder='RTO status'
          style={{ width: 150 }}
          onChange={(v)=> handleRtoChange(r, v)}
          options={[
            { value: 'finance_otp_pending', label: 'Finance Payment pending' },
            { value: 'customer_otp_taken', label: 'Customer OTP Pending' },
            { value: 'registration_done', label: 'Registration done' },
          ]}
        />
        <Input
          size='small'
          placeholder='KA55HY5666'
          style={{ width: 140 }}
          value={vehNoDraft[r.bookingId] ?? (r.vehicleNo || '')}
          onChange={(e)=> setVehNoDraft((m)=> ({ ...m, [r.bookingId]: normalizeVehNo(e.target.value) }))}
          onPressEnter={()=> handleSaveVehNo(r)}
        />
        <Button size='small' onClick={()=> handleSaveVehNo(r)}>Save</Button>
      </Space>
    )
  });

  // Show snapshot of extended statuses
  columns.push({
    title: 'Progress', key: 'progress', width: 80,
    render: (_, r) => {
      const raw = r._raw || {};
      const inv = raw['Invoice Status'] || raw['invoiceStatus'] || r.invoiceStatus || '';
      const invUrl = raw['Invoice File URL'] || raw['Invoice_File_URL'] || raw['invoiceFileUrl'] || r.invoiceFileUrl || '';
      const ins = raw['Insurance Status'] || raw['insuranceStatus'] || r.insuranceStatus || '';
      const insUrl = raw['Insurance File URL'] || raw['Insurance_File_URL'] || raw['insuranceFileUrl'] || r.insuranceFileUrl || '';
      const rto = raw['RTO Status'] || raw['rtoStatus'] || r.rtoStatus || '';
      const vno = raw['Vehicle No'] || raw['Vehicle_No'] || raw['vehicleNo'] || r.vehicleNo || '';
      return (
        <Space size={4} wrap>
          <Tag color='geekblue' title='Invoice'>{String(inv||'-').replace(/_/g,' ')}</Tag>
          {invUrl ? <a href={invUrl} target="_blank" rel="noopener noreferrer">📎</a> : null}
          <Tag color='cyan' title='Insurance'>{String(ins||'-').replace(/_/g,' ')}</Tag>
          {insUrl ? <a href={insUrl} target="_blank" rel="noopener noreferrer">📎</a> : null}
          <Tag title='RTO'>{String(rto||'-').replace(/_/g,' ')}</Tag>
          <Tag title='Vehicle No'>{vno || '-'}</Tag>
        </Space>
      );
    }
  });

  columns.push({ title: 'Booking ID', dataIndex: 'bookingId', key: 'bookingId', width: 20, ellipsis: true });
  

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
          <Button onClick={() => {
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
        size={isMobile ? 'small' : 'middle'}
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
        scroll={{ x: 'max-content', y: tableHeight }}
      />

      {!USE_SERVER_PAG && renderMode==='loadMore' && visibleRows.length < filtered.length ? (
        <div style={{ display:'flex', justifyContent:'center', padding: 8 }}>
          <Button onClick={()=> setLoadedCount((n)=> Math.min(n + pageSize, filtered.length))}>
            Load more ({filtered.length - visibleRows.length} more)
          </Button>
        </div>
      ) : null}

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
        open={remarkModal.open}
        title={`Update Remark: ${remarkModal.refId}`}
        onCancel={()=> setRemarkModal({ open: false, refId: '', level: 'ok', text: '' })}
        onOk={async ()=>{
          try {
            if (!GAS_URL_STATIC) { message.error('Booking GAS URL not configured'); return; }
            const body = GAS_SECRET_STATIC ? { action: 'remark', bookingId: remarkModal.refId, level: remarkModal.level, text: remarkModal.text, secret: GAS_SECRET_STATIC } : { action: 'remark', bookingId: remarkModal.refId, level: remarkModal.level, text: remarkModal.text };
            const resp = await saveBookingViaWebhook({ webhookUrl: GAS_URL_STATIC, method: 'POST', payload: body });
            if (resp && (resp.ok || resp.success)) {
              setRemarksMap((m)=> ({ ...m, [remarkModal.refId]: { level: remarkModal.level, text: remarkModal.text } }));
              setRows(prev => prev.map(x => x.bookingId === remarkModal.refId ? { ...x, RemarkLevel: remarkModal.level.toUpperCase(), RemarkText: remarkModal.text } : x));
              message.success('Remark saved to sheet');
              setRemarkModal({ open: false, refId: '', level: 'ok', text: '' });
            } else { message.error('Save failed'); }
          } catch { message.error('Save failed'); }
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
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (m) {
    let a = parseInt(m[1], 10), b = parseInt(m[2], 10), y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    let month, day;
    // If first part > 12 treat as day/month else month/day
    if (a > 12) { day = a; month = b - 1; } else { month = a - 1; day = b; }
    let hh = m[4] ? parseInt(m[4], 10) : 0;
    const mm = m[5] ? parseInt(m[5], 10) : 0;
    const ss = m[6] ? parseInt(m[6], 10) : 0;
    const ap = (m[7] || '').toUpperCase();
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
