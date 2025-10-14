import React, { useEffect, useMemo, useState } from "react";
import { Table, Grid, Space, Button, Select, Input, Tag, Typography, message, Popover, DatePicker } from "antd";
import { saveBookingViaWebhook } from "../apiCalls/forms";
import dayjs from "dayjs";

const { Text } = Typography;

// Bookings are now loaded only through Apps Script JSON endpoint (no CSV)

const HEAD = {
  ts: ["Timestamp", "Time", "Date"],
  name: ["Customer_Name", "Customer", "Name"],
  mobile: ["Mobile", "Phone", "Mobile Number"],
  amount: ["Booking Amount", "Amount"],
  mode: ["Payment_Mode", "Payment Mode"],
  rto: ["RTO"],
  address: ["Address"],
  aadhar: ["Aadhar_Card", "Aadhar"],
  pan: ["Pan_Card", "PAN"],
  other: ["Additional_Documents", "Additional"],
  payload: ["Payload"],
  bookingId: ["Booking_ID", "Booking Id", "BookingID"],
  branch: ["Branch"],
};

const pick = (obj, aliases) => String(aliases.map((k) => obj[k] ?? "").find((v) => v !== "") || "").trim();

export default function Bookings() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [branchFilter, setBranchFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [q, setQ] = useState("");
  const [dateRange, setDateRange] = useState(null); // [dayjs, dayjs]
  const [quickKey, setQuickKey] = useState(null); // today | yesterday | null

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const DEFAULT_BOOKING_GAS_URL =
          "https://script.google.com/macros/s/AKfycbxgy5_MsllkytvWrOuQMukeZhwjIm7omEMPiMttaK9DEe0UsELzmgh6IPe4jqHNbga_/exec";
        const GAS_URL = import.meta.env.VITE_BOOKING_GAS_URL || DEFAULT_BOOKING_GAS_URL;
        const SECRET = import.meta.env.VITE_BOOKING_GAS_SECRET || '';
        // If still empty somehow, show empty list gracefully
        if (!GAS_URL) {
          message.info('Bookings: Apps Script URL not configured — showing empty list.');
          if (!cancelled) setRows([]);
          return;
        }
        const resp = await saveBookingViaWebhook({
          webhookUrl: GAS_URL,
          method: 'GET',
          payload: SECRET ? { action: 'list', secret: SECRET } : { action: 'list' },
        });
        const js = resp?.data || resp;
        if (!js?.ok || !Array.isArray(js?.data)) throw new Error('Invalid response');
        const data = js.data.map((o, idx) => ({
          key: idx,
          ts: pick(o, HEAD.ts),
          tsMs: parseTsMs(pick(o, HEAD.ts)),
          name: pick(o, HEAD.name),
          mobile: pick(o, HEAD.mobile),
          amount: pick(o, HEAD.amount),
          mode: pick(o, HEAD.mode),
          rto: pick(o, HEAD.rto),
          address: pick(o, HEAD.address),
          aadhar: pick(o, HEAD.aadhar),
          pan: pick(o, HEAD.pan),
          other: pick(o, HEAD.other),
          payload: pick(o, HEAD.payload),
          bookingId: pick(o, HEAD.bookingId),
          branch: pick(o, HEAD.branch),
        }));
        if (!cancelled) setRows(data.filter((r)=>r.name || r.mobile || r.bookingId));
      } catch {
        message.error('Could not load bookings via Apps Script. Check Web App URL / access.');
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    // allow refresh button to re-trigger load without page reload
    const handler = () => load();
    window.addEventListener('reload-bookings', handler);
    return () => { cancelled = true; };
  }, []);

  const branches = useMemo(() => {
    const set = new Set(rows.map((r)=>r.branch).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [rows]);
  const modes = useMemo(() => {
    const set = new Set(rows.map((r)=>r.mode).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (branchFilter !== "all" && r.branch !== branchFilter) return false;
      if (modeFilter !== "all" && r.mode !== modeFilter) return false;
      if (dateRange && dateRange[0] && dateRange[1]) {
        const start = dateRange[0].startOf('day').valueOf();
        const end = dateRange[1].endOf('day').valueOf();
        const t = r.tsMs ?? parseTsMs(r.ts);
        if (!t || t < start || t > end) return false;
      }
      if (q) {
        const s = q.toLowerCase();
        if (![
          r.name, r.mobile, r.bookingId, r.address, r.rto, r.mode, r.branch,
        ].some((v) => String(v || "").toLowerCase().includes(s))) return false;
      }
      return true;
    });
  }, [rows, branchFilter, modeFilter, q, dateRange]);

  const columns = [
    { title: "Time", dataIndex: "ts", key: "ts", width: 170, ellipsis: true, responsive: ['md'], render: (v)=> formatTs(v) },
    { title: "Booking ID", dataIndex: "bookingId", key: "bookingId", width: 180, ellipsis: true },
    { title: "Customer", dataIndex: "name", key: "name", width: 200, ellipsis: true },
    { title: "Mobile", dataIndex: "mobile", key: "mobile", width: 140 },
    { title: "Amount", dataIndex: "amount", key: "amount", width: 110, align: 'right' },
    { title: "Mode", dataIndex: "mode", key: "mode", width: 110, align: 'center' },
    { title: "RTO", dataIndex: "rto", key: "rto", width: 110, responsive: ['md'], align: 'center' },
    { title: "Branch", dataIndex: "branch", key: "branch", width: 160 },
    { title: "Aadhar", dataIndex: "aadhar", key: "aadhar", width: 170, render: (v)=> <LinkCell url={v} /> },
    { title: "PAN", dataIndex: "pan", key: "pan", width: 170, render: (v)=> <LinkCell url={v} /> },
    { title: "Additional", dataIndex: "other", key: "other", width: 170, render: (v)=> <LinkCell url={firstFromList(v)} count={countFromList(v)} /> },
  ];

  const total = rows.length;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <Space size="small" wrap>
          <Select value={branchFilter} onChange={setBranchFilter} style={{ minWidth: 160 }}
                  options={branches.map(b => ({ value: b, label: b === 'all' ? 'All Branches' : b }))} />
          <Select value={modeFilter} onChange={setModeFilter} style={{ minWidth: 160 }}
                  options={modes.map(m => ({ value: m, label: m === 'all' ? 'All Modes' : m }))} />
          <DatePicker.RangePicker value={dateRange} onChange={(v)=>{ setDateRange(v); setQuickKey(null); }} allowClear />
          <Button size="small" type={quickKey==='today'?'primary':'default'} onClick={()=>{ const t = dayjs(); setDateRange([t,t]); setQuickKey('today'); }}>Today</Button>
          <Button size="small" type={quickKey==='yesterday'?'primary':'default'} onClick={()=>{ const y = dayjs().subtract(1,'day'); setDateRange([y,y]); setQuickKey('yesterday'); }}>Yesterday</Button>
          <Button size="small" onClick={()=>{ setDateRange(null); setQuickKey(null); }}>Clear</Button>
          <Input placeholder="Search name/mobile/booking" allowClear value={q} onChange={(e)=>setQ(e.target.value)} style={{ minWidth: 220 }} />
        </Space>
        <div style={{ flex: 1 }} />
        <Space>
          <Tag color="blue">Total: {total}</Tag>
          <Tag color="geekblue">Showing: {filtered.length}</Tag>
          <Button onClick={() => {
            // re-run the loader without full page refresh
            const ev = new Event('reload-bookings');
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
        rowKey={(r) => `${r.bookingId}-${r.mobile}-${r.ts}-${r.key}`}
        scroll={{ x: 'max-content' }}
      />
    </div>
  );
}

// --- Helpers for alignment and preview ---
function formatTs(v) {
  if (!v) return <Text type="secondary">—</Text>;
  try {
    // Support both native Date objects and strings
    const d = v instanceof Date ? v : new Date(String(v));
    if (isNaN(d.getTime())) return String(v);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return String(v); }
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
    // Accept uc?export=view&id=, open?id=, file/d/<id>/view, and raw id
    const url = new URL(u);
    if (url.searchParams.get('id')) return url.searchParams.get('id');
    const m = url.pathname.match(/\/d\/([^/]+)/);
    if (m && m[1]) return m[1];
    return null;
  } catch {
    // Fallback: parse id= in raw string
    const m = String(u).match(/[?&]id=([^&]+)/);
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
    embed: `https://drive.google.com/file/d/${id}/preview`, // embeddable Drive preview
  };
}

function firstFromList(v) {
  if (!v) return '';
  const parts = String(v).split(' | ').filter(Boolean);
  return parts[0] || '';
}
function countFromList(v) {
  if (!v) return 0;
  return String(v).split(' | ').filter(Boolean).length;
}

function LinkCell({ url, count }) {
  if (!url) return <Text type="secondary">—</Text>;
  const { view, download, embed } = normalizeLink(url);
  const content = (
    <div style={{ width: 340 }}>
      <div style={{ height: 260, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
        <iframe src={embed} title="preview" width="100%" height="100%" style={{ display: 'block', border: '0' }} allow="fullscreen" />
      </div>
      <Space>
        <a href={view} target="_blank" rel="noopener">Open</a>
        <a href={download}>Download</a>
      </Space>
    </div>
  );
  return (
    <Space size={6}>
      <Popover content={content} title={count ? `${count} file(s)` : 'Preview'} trigger="click">
        <Button size="small">Preview</Button>
      </Popover>
      <a href={download}>Download</a>
    </Space>
  );
}
