import React, { useEffect, useMemo, useState } from "react";
import { Table, Grid, Space, Button, Select, Input, Tag, Typography, message, DatePicker } from "antd";
import { saveBookingViaWebhook } from "../apiCalls/forms";
import dayjs from "dayjs";

const { Text } = Typography;

// Head aliases for common quotation sheet headers
const HEAD = {
  ts: ["Timestamp", "Time", "Date"],
  name: ["Customer_Name", "Customer", "Name"],
  mobile: ["Mobile", "Phone", "Mobile Number"],
  branch: ["Branch"],
  executive: ["Executive"],
  serialNo: ["Quotation No.", "Quotation No", "Serial", "Serial No", "Quote Id"],
  company: ["Company"],
  model: ["Model", "Bike Model"],
  variant: ["Variant"],
  price: ["On-Road Price", "On Road Price", "Price"],
  payload: ["Payload"],
  status: ["Status", "FollowUp Status", "Quotation Status"],
};

const pick = (obj, aliases) => String(aliases.map((k) => obj[k] ?? "").find((v) => v !== "") || "").trim();

export default function Quotations() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [branchFilter, setBranchFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all"); // cash | loan | all
  const [statusFilter, setStatusFilter] = useState("all");
  const [q, setQ] = useState("");
  const [dateRange, setDateRange] = useState(null); // [dayjs, dayjs]
  const [quickKey, setQuickKey] = useState(null); // today | yesterday | null
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
    const isPriv = ["owner","admin"].includes(userRole);
    if (!isPriv && allowedBranches.length && branchFilter === 'all') {
      setBranchFilter(allowedBranches[0]);
    }
  }, [userRole, allowedBranches, branchFilter]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const DEFAULT_QUOT_URL =
          "https://script.google.com/macros/s/AKfycbwqJMP0YxZaoxWL3xcL-4rz8-uzrw4pyq7JgghNPI08FxXLk738agMcozmk7A7RpoC5zw/exec";
        const GAS_URL = import.meta.env.VITE_QUOTATION_GAS_URL || DEFAULT_QUOT_URL;
        const SECRET = import.meta.env.VITE_QUOTATION_GAS_SECRET || '';
        if (!GAS_URL) {
          message.info('Quotations: Apps Script URL not configured — showing empty list.');
          if (!cancelled) setRows([]);
          return;
        }
        const resp = await saveBookingViaWebhook({
          webhookUrl: GAS_URL,
          method: 'GET',
          payload: SECRET ? { action: 'list', secret: SECRET } : { action: 'list' },
        });
        const js = resp?.data || resp;
        if (!js || (!js.ok && !js.success)) throw new Error('Invalid response');
        const dataArr = Array.isArray(js.data) ? js.data : (Array.isArray(js.rows) ? js.rows : []);
        const data = dataArr.map((o, idx) => {
          const obj = (o && o.values) ? o.values : o; // support {values,payload}
          const payloadRaw = (o && o.payload) ? o.payload : (obj ? obj[HEAD.payload[0]] : undefined) || '';
          let payload = null;
          try { payload = typeof payloadRaw === 'object' ? payloadRaw : JSON.parse(String(payloadRaw || '{}')); } catch { payload = null; }
          const fv = (payload && payload.formValues) ? payload.formValues : {};
          const mode = (payload && payload.mode) || '';
          const status = (payload && payload.followUp && payload.followUp.status) || pick(obj, HEAD.status) || '';
          const brand = (payload && payload.brand) || '';
          const company = fv.company || pick(obj, HEAD.company);
          const model = fv.bikeModel || fv.model || pick(obj, HEAD.model);
          const variant = fv.variant || pick(obj, HEAD.variant);
          const price = String(fv.onRoadPrice || pick(obj, HEAD.price) || '').trim();
          return {
            key: idx,
            ts: pick(obj, HEAD.ts),
            tsMs: parseTsMs(pick(obj, HEAD.ts)),
            name: fv.name || pick(obj, HEAD.name),
            mobile: fv.mobile || pick(obj, HEAD.mobile),
            branch: fv.branch || pick(obj, HEAD.branch),
            executive: fv.executive || pick(obj, HEAD.executive),
            serialNo: fv.serialNo || pick(obj, HEAD.serialNo),
            company,
            model,
            variant,
            price,
            mode: mode || (payload && payload.mode) || '',
            brand,
            status,
          };
        });
        if (!cancelled) setRows(data.filter((r)=>r.name || r.mobile || r.serialNo));
      } catch  {
        message.error('Could not load quotations via Apps Script. Check QUOTATION Web App URL / access.');
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const handler = () => load();
    window.addEventListener('reload-quotations', handler);
    return () => { cancelled = true; window.removeEventListener('reload-quotations', handler); };
  }, []);

  const branches = useMemo(() => {
    const set = new Set(rows.map((r)=>r.branch).filter(Boolean));
    const all = Array.from(set);
    const isPriv = ["owner","admin"].includes(userRole);
    if (!isPriv && allowedBranches.length) return [...Array.from(new Set(all.filter((b)=>allowedBranches.includes(b))))];
    return ["all", ...all];
  }, [rows, userRole, allowedBranches]);
  const modes = useMemo(() => {
    const set = new Set(rows.map((r)=> (r.mode || '').toLowerCase()).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [rows]);
  const statuses = useMemo(() => {
    const set = new Set(
      rows
        .map((r)=> String(r.status||'').toLowerCase())
        .filter((s) => s && s !== 'lost')
    );
    return ["all", ...Array.from(set)];
  }, [rows]);

  const filtered = useMemo(() => {
    const allowedSet = new Set((allowedBranches || []).map((b)=>String(b||'').toLowerCase()));
    return rows.filter((r) => {
      if (allowedSet.size && !["owner","admin"].includes(userRole)) {
        if (!allowedSet.has(String(r.branch||'').toLowerCase())) return false;
      }
      if (branchFilter !== "all" && r.branch !== branchFilter) return false;
      if (modeFilter !== "all" && String(r.mode||'').toLowerCase() !== modeFilter) return false;
      if (statusFilter !== 'all' && String(r.status||'').toLowerCase() !== statusFilter) return false;
      if (dateRange && dateRange[0] && dateRange[1]) {
        const start = dateRange[0].startOf('day').valueOf();
        const end = dateRange[1].endOf('day').valueOf();
        const t = r.tsMs ?? parseTsMs(r.ts);
        if (!t || t < start || t > end) return false;
      }
      if (q) {
        const s = q.toLowerCase();
        if (![
          r.name, r.mobile, r.serialNo, r.company, r.model, r.variant, r.branch, r.executive, r.status
        ].some((v) => String(v || "").toLowerCase().includes(s))) return false;
      }
      return true;
    });
  }, [rows, branchFilter, modeFilter, statusFilter, q, dateRange, userRole, allowedBranches]);

  const statusColor = (s) => {
    const k = String(s || '').toLowerCase();
    return k === 'converted' ? 'green'
      : k === 'completed' ? 'green'
      : k === 'pending' ? 'orange'
      : k === 'not_interested' ? 'default'
      : k === 'unreachable' ? 'volcano'
      : k === 'wrong_number' ? 'magenta'
      : k === 'purchased_elsewhere' ? 'geekblue'
      : k === 'no_response' ? 'gold'
      : 'default';
  };

  const columns = [
    { title: "Time", dataIndex: "ts", key: "ts", width: 170, ellipsis: true, responsive: ['md'], render: (v)=> formatTs(v) },
    { title: "Quotation No", dataIndex: "serialNo", key: "serialNo", width: 180, ellipsis: true },
    { title: "Customer", dataIndex: "name", key: "name", width: 200, ellipsis: true },
    { title: "Mobile", dataIndex: "mobile", key: "mobile", width: 140 },
    { title: "Status", dataIndex: "status", key: "status", width: 130, render: (v)=> <Tag color={statusColor(v)}>{String(v||'').replace(/_/g,' ')||'—'}</Tag> },
    { title: "Company", dataIndex: "company", key: "company", width: 140, responsive: ['md'] },
    { title: "Model", dataIndex: "model", key: "model", width: 140, responsive: ['md'] },
    { title: "Variant", dataIndex: "variant", key: "variant", width: 140, responsive: ['lg'] },
    { title: "On-Road Price", dataIndex: "price", key: "price", width: 140, align: 'right' },
    { title: "Mode", dataIndex: "mode", key: "mode", width: 110, align: 'center', render: (v)=> String(v||'').toUpperCase() },
    { title: "Branch", dataIndex: "branch", key: "branch", width: 160 },
    { title: "Executive", dataIndex: "executive", key: "executive", width: 160 },
  ];

  const total = rows.length;

  return (
    <div style={{ paddingTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <Space wrap>
          <Select value={branchFilter} onChange={setBranchFilter} style={{ minWidth: 160 }}
                  options={branches.map(b => ({ value: b, label: b === 'all' ? 'All Branches' : b }))} />
          <Select value={modeFilter} onChange={setModeFilter} style={{ minWidth: 140 }}
                  options={modes.map(m => ({ value: m, label: m === 'all' ? 'All Modes' : String(m).toUpperCase() }))} />
          <Select value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 160 }}
                  options={statuses.map(s => ({ value: s, label: s === 'all' ? 'All Statuses' : String(s).replace(/_/g,' ') }))} />
          <DatePicker.RangePicker value={dateRange} onChange={(v)=>{ setDateRange(v); setQuickKey(null); }} allowClear />
          <Button size="small" type={quickKey==='today'?'primary':'default'} onClick={()=>{ const t = dayjs(); setDateRange([t,t]); setQuickKey('today'); }}>Today</Button>
          <Button size="small" type={quickKey==='yesterday'?'primary':'default'} onClick={()=>{ const y = dayjs().subtract(1,'day'); setDateRange([y,y]); setQuickKey('yesterday'); }}>Yesterday</Button>
          <Button size="small" onClick={()=>{ setDateRange(null); setQuickKey(null); }}>Clear</Button>
          <Input placeholder="Search name/mobile/quotation/company/model" allowClear value={q} onChange={(e)=>setQ(e.target.value)} style={{ minWidth: 260 }} />
        </Space>
        <div style={{ flex: 1 }} />
        <Space>
          <Tag color="blue">Total: {total}</Tag>
          <Tag color="geekblue">Showing: {filtered.length}</Tag>
          <Button onClick={() => {
            const ev = new Event('reload-quotations');
            window.dispatchEvent(ev);
          }}>Refresh</Button>
        </Space>
      </div>

      <Table
        dataSource={filtered}
        columns={columns}
        loading={loading}
        size={isMobile ? 'small' : 'middle'}
        pagination={{ pageSize: 10 }}
        rowKey={(r) => `${r.serialNo}-${r.mobile}-${r.ts}-${r.key}`}
        scroll={{ x: 'max-content' }}
      />
    </div>
  );
}

// --- Helpers (copied from Bookings) ---
function formatTs(v) {
  if (!v) return <Text type="secondary">—</Text>;
  try {
    const d = v instanceof Date ? v : new Date(String(v));
    if (isNaN(d.getTime())) return String(v);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return String(v); }
}

function parseTsMs(v) {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  const dIso = new Date(s);
  if (!isNaN(dIso.getTime())) return dIso.getTime();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (m) {
    let a = parseInt(m[1], 10), b = parseInt(m[2], 10), y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    let month, day;
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
