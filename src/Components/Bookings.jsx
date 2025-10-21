import React, { useEffect, useMemo, useState } from "react";
import { Table, Grid, Space, Button, Select, Input, Tag, Typography, message, Popover } from "antd";
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
  const [updating, setUpdating] = useState(null);
  const [printModal, setPrintModal] = useState({ open: false, row: null });
  const [prefillModal, setPrefillModal] = useState({ open: false, row: null });
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const DEFAULT_BOOKING_GAS_URL =
          "https://script.google.com/macros/s/AKfycbyDnwl-dS1TBNXsJe77yZaq_DW0tQhTTGRtesBOBhpvCTXRcSOhCrYUdWFo8UfNNJLm/exec"
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
        }));
        if (!cancelled) setRows(data.filter((r)=>r.bookingId || r.name || r.mobile));
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
  const statuses = useMemo(() => {
    const set = new Set(rows.map((r) => (r.status || "").toLowerCase()).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [rows]);

  const filtered = useMemo(() => {
    const list = rows.filter((r) => {
      if (branchFilter !== "all" && r.branch !== branchFilter) return false;
      if (statusFilter !== "all" && (String(r.status || "").toLowerCase() !== statusFilter)) return false;
      if (q) {
        const s = q.toLowerCase();
        if (![
          r.bookingId, r.name, r.mobile, r.company, r.model, r.variant, r.chassis, r.branch,
        ].some((v) => String(v || "").toLowerCase().includes(s))) return false;
      }
      return true;
    });
    return list.sort((a,b)=> (b.tsMs||0)-(a.tsMs||0));
  }, [rows, branchFilter, statusFilter, q]);

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
      const DEFAULT_BOOKING_GAS_URL ="https://script.google.com/macros/s/AKfycbyDnwl-dS1TBNXsJe77yZaq_DW0tQhTTGRtesBOBhpvCTXRcSOhCrYUdWFo8UfNNJLm/exec";
      const GAS_URL = import.meta.env.VITE_BOOKING_GAS_URL || DEFAULT_BOOKING_GAS_URL;
      await saveBookingViaWebhook({ webhookUrl: GAS_URL, method: 'POST', payload: { action: 'update', bookingId, mobile, patch } });
      setRows((prev)=> prev.map(r=> r.bookingId===bookingId ? { ...r, status: String(patch.status || r.status).toLowerCase() } : r));
      message.success('Updated');
    } catch { message.error('Update failed'); }
    finally { setUpdating(null); }
  };

  const columns = [
    
    { title: 'Branch', dataIndex: 'branch', key: 'branch', width: 160 },
    { title: 'Customer', dataIndex: 'name', key: 'name', width: 200, ellipsis: true },
    { title: 'Mobile', dataIndex: 'mobile', key: 'mobile', width: 140 },
    { title: 'Model', dataIndex: 'model', key: 'model', width: 160 },
    { title: 'Variant', dataIndex: 'variant', key: 'variant', width: 140 },
    { title: 'Stk Status', dataIndex: 'availability', key: 'stk', width: 120, render: (v, r)=> {
      const lbl = stockLabel(r.chassis, v);
      return (<Tag color={stockColor(lbl)}>{lbl}</Tag>);
    } },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 120, render: (s)=> <Tag color={STATUS_COLOR[String(s||'').toLowerCase()] || 'default'}>{String(s||'pending').replace(/_/g,' ')}</Tag> },
   
    
     
    {
      title: 'Actions', key: 'actions', width: 320,
      render: (_, r) => (
        <Space size={6}>
          <Select
            size='small'
            defaultValue={r.status || 'pending'}
            style={{ width: 130 }}
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
            style={{ width: 170 }}
            onChange={(v)=> updateBooking(r.bookingId, { status: r.status || 'seen', notes: v }, r.mobile)}
            options={[
              { value: 'Checked – proceed.', label: 'Checked – proceed.' },
              { value: 'Allot vehicle.', label: 'Allot vehicle.' },
              { value: 'Please call showroom.', label: 'Please call showroom.' },
            ]}
          />
          <Button size='small' loading={updating===r.bookingId} onClick={()=> updateBooking(r.bookingId, { status: 'seen' }, r.mobile)}>Mark Seen</Button>
        </Space>
      )
    },
    { title: 'File', dataIndex: 'fileUrl', key: 'file', width: 300, render: (v, r)=> (
      <Space size={6}>
        <LinkCell url={v} />
        <Button size='small' onClick={()=> setPrintModal({ open: true, row: r })}>Print</Button>
        <Button size='small' onClick={()=> setPrefillModal({ open: true, row: r })}>Prefilled Form</Button>
      </Space>
    ) },
    { title: 'Booking ID', dataIndex: 'bookingId', key: 'bookingId', width: 180, ellipsis: true },
    
  ];

  const total = rows.length;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <Space size="small" wrap>
          <Select value={branchFilter} onChange={setBranchFilter} style={{ minWidth: 160 }}
                  options={branches.map(b => ({ value: b, label: b === 'all' ? 'All Branches' : b }))} />
          <Select value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 160 }}
                  options={statuses.map(s => ({ value: s, label: s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') }))} />
          <Input placeholder="Search name/mobile/booking" allowClear value={q} onChange={(e)=>setQ(e.target.value)} style={{ minWidth: 220 }} />
        </Space>
        <div style={{ flex: 1 }} />
        <Space>
          <Tag color="blue">Total: {total}</Tag>
          <Tag color="geekblue">Showing: {filtered.length}{statusFilter !== 'all' ? ` (status: ${statusFilter})` : ''}</Tag>
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

      <BookingPrintQuickModal
        open={printModal.open}
        onClose={()=> setPrintModal({ open: false, row: null })}
        row={printModal.row}
        webhookUrl={import.meta.env.VITE_BOOKING_GAS_URL || 'https://script.google.com/macros/s/AKfycbyeAGWyqVSln9CSmbU_m6n35z9ko9KdtPAqRKRBcmQbCl7tnapQPVtpN3jb6pBNmDjX/exec'}
      />
      <BookingInlineModal
        open={prefillModal.open}
        onClose={()=> setPrefillModal({ open: false, row: null })}
        row={prefillModal.row}
        webhookUrl={import.meta.env.VITE_BOOKING_GAS_URL || 'https://script.google.com/macros/s/AKfycbyeAGWyqVSln9CSmbU_m6n35z9ko9KdtPAqRKRBcmQbCl7tnapQPVtpN3jb6pBNmDjX/exec'}
      />
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
