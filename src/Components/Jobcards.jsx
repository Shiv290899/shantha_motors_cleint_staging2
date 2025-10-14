import React, { useEffect, useMemo, useState } from "react";
import { Table, Grid, Space, Button, Select, Input, Tag, Typography, message, DatePicker } from "antd";
import dayjs from "dayjs";
import { saveJobcardViaWebhook } from "../apiCalls/forms";

const { Text } = Typography;

// Header aliases for common Job Card sheet headers
const HEAD = {
  ts: ["Timestamp", "Time", "Date"],
  name: ["Customer Name", "Customer", "Name", "Customer_Name"],
  mobile: ["Mobile", "Phone", "Mobile Number"],
  branch: ["Branch"],
  executive: ["Executive"],
  jcNo: ["JC No.", "JC No", "Job Card No", "JobCard No", "JCNumber"],
  regNo: ["Vehicle No", "Vehicle_No", "Registration Number", "RegNo", "Reg No"],
  model: ["Model", "Bike Model"],
  serviceType: ["Service Type", "Service", "Service_Type"],
  vehicleType: ["Vehicle Type", "Type of Vehicle", "Vehicle_Type"],
  amount: ["Collected Amount", "Amount"],
  payload: ["Payload"],
};

const pick = (obj, aliases) => String(aliases.map((k) => obj?.[k] ?? "").find((v) => v !== "") || "").trim();

export default function Jobcards() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [branchFilter, setBranchFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all"); // free | paid | all
  const [q, setQ] = useState("");
  const [dateRange, setDateRange] = useState(null); // [dayjs, dayjs]
  const [quickKey, setQuickKey] = useState(null); // today | yesterday | null

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const DEFAULT_JC_URL =
          "https://script.google.com/macros/s/AKfycbx7Q36rQ4tzFCDZKJbR5SUabuunYL2NKd0jNJxdUgaqIQ8BUX2kfINq5WppF5NJLxA6YQ/exec";
        const GAS_URL = import.meta.env.VITE_JOBCARD_GAS_URL || DEFAULT_JC_URL;
        const SECRET = import.meta.env.VITE_JOBCARD_GAS_SECRET || '';
        if (!GAS_URL) {
          message.info('Jobcards: Apps Script URL not configured — showing empty list.');
          if (!cancelled) setRows([]);
          return;
        }
        const resp = await saveJobcardViaWebhook({
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
          const company = fv.company || '';
          const model = fv.model || pick(obj, HEAD.model);
          const regNo = fv.regNo || pick(obj, HEAD.regNo);
          return {
            key: idx,
            ts: pick(obj, HEAD.ts),
            tsMs: parseTsMs(pick(obj, HEAD.ts)),
            name: fv.custName || pick(obj, HEAD.name),
            mobile: fv.custMobile || pick(obj, HEAD.mobile),
            branch: fv.branch || pick(obj, HEAD.branch),
            executive: fv.executive || pick(obj, HEAD.executive),
            jcNo: fv.jcNo || pick(obj, HEAD.jcNo),
            regNo,
            company,
            model,
            serviceType: fv.serviceType || pick(obj, HEAD.serviceType),
            vehicleType: fv.vehicleType || pick(obj, HEAD.vehicleType),
            amount: String(fv.amount || pick(obj, HEAD.amount) || '').trim(),
          };
        });
        if (!cancelled) setRows(data.filter((r)=>r.jcNo || r.name || r.mobile));
      } catch  {
        message.error('Could not load job cards via Apps Script. Check JOBCARD Web App URL / access.');
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const handler = () => load();
    window.addEventListener('reload-jobcards', handler);
    return () => { cancelled = true; window.removeEventListener('reload-jobcards', handler); };
  }, []);

  const branches = useMemo(() => {
    const set = new Set(rows.map((r)=>r.branch).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [rows]);
  const services = useMemo(() => {
    const set = new Set(rows.map((r)=> String(r.serviceType||'').toLowerCase()).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (branchFilter !== "all" && r.branch !== branchFilter) return false;
      if (serviceFilter !== "all" && String(r.serviceType||'').toLowerCase() !== serviceFilter) return false;
      if (dateRange && dateRange[0] && dateRange[1]) {
        const start = dateRange[0].startOf('day').valueOf();
        const end = dateRange[1].endOf('day').valueOf();
        const t = r.tsMs ?? parseTsMs(r.ts);
        if (!t || t < start || t > end) return false;
      }
      if (q) {
        const s = q.toLowerCase();
        if (![
          r.name, r.mobile, r.jcNo, r.regNo, r.model, r.branch, r.executive
        ].some((v) => String(v || "").toLowerCase().includes(s))) return false;
      }
      return true;
    });
  }, [rows, branchFilter, serviceFilter, q, dateRange]);

  const columns = [
    { title: "Time", dataIndex: "ts", key: "ts", width: 170, ellipsis: true, responsive: ['md'], render: (v)=> formatTs(v) },
    { title: "Job Card", dataIndex: "jcNo", key: "jcNo", width: 160, ellipsis: true },
    { title: "Customer", dataIndex: "name", key: "name", width: 180, ellipsis: true },
    { title: "Mobile", dataIndex: "mobile", key: "mobile", width: 140 },
    { title: "Vehicle No.", dataIndex: "regNo", key: "regNo", width: 140 },
    { title: "Model", dataIndex: "model", key: "model", width: 140, responsive: ['md'] },
    { title: "Service", dataIndex: "serviceType", key: "serviceType", width: 110, align: 'center', render: (v)=> String(v||'') },
    { title: "Type", dataIndex: "vehicleType", key: "vehicleType", width: 110, align: 'center', render: (v)=> String(v||'') },
    { title: "Amount", dataIndex: "amount", key: "amount", width: 120, align: 'right' },
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
          <Select value={serviceFilter} onChange={setServiceFilter} style={{ minWidth: 140 }}
                  options={services.map(m => ({ value: m, label: m === 'all' ? 'All Services' : String(m).toUpperCase() }))} />
          <DatePicker.RangePicker value={dateRange} onChange={(v)=>{ setDateRange(v); setQuickKey(null); }} allowClear />
          <Button size="small" type={quickKey==='today'?'primary':'default'} onClick={()=>{ const t = dayjs(); setDateRange([t,t]); setQuickKey('today'); }}>Today</Button>
          <Button size="small" type={quickKey==='yesterday'?'primary':'default'} onClick={()=>{ const y = dayjs().subtract(1,'day'); setDateRange([y,y]); setQuickKey('yesterday'); }}>Yesterday</Button>
          <Button size="small" onClick={()=>{ setDateRange(null); setQuickKey(null); }}>Clear</Button>
          <Input placeholder="Search name/mobile/jc/vehicle/model" allowClear value={q} onChange={(e)=>setQ(e.target.value)} style={{ minWidth: 260 }} />
        </Space>
        <div style={{ flex: 1 }} />
        <Space>
          <Tag color="blue">Total: {total}</Tag>
          <Tag color="geekblue">Showing: {filtered.length}</Tag>
          <Button onClick={() => {
            const ev = new Event('reload-jobcards');
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
        rowKey={(r) => `${r.jcNo}-${r.mobile}-${r.ts}-${r.key}`}
        scroll={{ x: 'max-content' }}
      />
    </div>
  );
}

// --- Helpers (copied from Bookings/Quotations) ---
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
