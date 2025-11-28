import React, { useEffect, useMemo, useState } from "react";
import { Table, Grid, Space, Button, Select, Input, Tag, Typography, message, DatePicker, Modal } from "antd";
import useDebouncedValue from "../hooks/useDebouncedValue";
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
  const debouncedQ = useDebouncedValue(q, 300);
  const [dateRange, setDateRange] = useState(null); // [dayjs, dayjs]
  const [quickKey, setQuickKey] = useState(null); // today | yesterday | null
  const [userRole, setUserRole] = useState("");
  const [allowedBranches, setAllowedBranches] = useState([]);
  // Controlled pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [renderMode, setRenderMode] = useState('pagination');
  const [loadedCount, setLoadedCount] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  // Default to server pagination so no env is required
  const USE_SERVER_PAG = String((import.meta.env.VITE_USE_SERVER_PAGINATION ?? 'true')).toLowerCase() === 'true';
  const [remarksMap, setRemarksMap] = useState({}); // key: serialNo -> { level, text }
  const [remarkModal, setRemarkModal] = useState({ open: false, refId: '', level: 'ok', text: '' });
  const [hasCache, setHasCache] = useState(false);

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

  // Server-mode: refetch on filters/page/date change
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
            // carry remark fields through for display
            RemarkLevel: obj.RemarkLevel || obj.remarkLevel || '',
            RemarkText: obj.RemarkText || obj.remarkText || '',
          };
        });
        // Extract remarks from list rows (RemarkLevel/RemarkText columns)
        const withRemarks = data.map(r => {
          const lvlRaw = (r.remarkLevel || r.RemarkLevel || '').toString().toLowerCase();
          const txt = r.remarkText || r.RemarkText || '';
          return { ...r, _remarkLevel: lvlRaw, _remarkText: txt };
        });
        const filteredRows = withRemarks.filter((r)=>r.name || r.mobile || r.serialNo);
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

  const branches = useMemo(() => {
    const set = new Set(rows.map((r)=>r.branch).filter(Boolean));
    const all = ["all", ...Array.from(set)];
    const isPriv = ["owner","admin","backend"].includes(userRole);
    if (!isPriv && allowedBranches.length) return all.filter((b)=> b==='all' || allowedBranches.includes(b));
    return all;
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
    if (USE_SERVER_PAG) {
      return rows.slice().sort((a,b)=> (b.tsMs||0) - (a.tsMs||0));
    }
    const allowedSet = new Set((allowedBranches || []).map((b)=>String(b||'').toLowerCase()));
    const list = rows.filter((r) => {
      if (allowedSet.size && !["owner","admin","backend"].includes(userRole)) {
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
      if (debouncedQ) {
        const s = debouncedQ.toLowerCase();
        if (![
          r.name, r.mobile, r.serialNo, r.company, r.model, r.variant, r.branch, r.executive, r.status
        ].some((v) => String(v || "").toLowerCase().includes(s))) return false;
      }
      return true;
    });
    // Always show most recent first
    return list.sort((a,b)=> (b.tsMs||0) - (a.tsMs||0));
  }, [rows, branchFilter, modeFilter, statusFilter, debouncedQ, dateRange, userRole, allowedBranches, USE_SERVER_PAG]);

  // Reset pagination on filters/search/date change
  useEffect(() => {
    setPage(1);
    setLoadedCount(pageSize);
  }, [branchFilter, modeFilter, statusFilter, debouncedQ, dateRange]);
  useEffect(() => { setLoadedCount(pageSize); }, [pageSize]);

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
    { title: "Time", dataIndex: "ts", key: "ts", width: 20, ellipsis: true, render: (v)=> formatTs(v) },
    { title: "Branch", dataIndex: "branch", key: "branch", width: 50 },
    { title: "Customer Name", dataIndex: "name", key: "name", width: 50, ellipsis: true },
    { title: "Mobile No", dataIndex: "mobile", key: "mobile", width: 80 },
    { title: "Status", dataIndex: "status", key: "status", width: 50, render: (v)=> <Tag color={statusColor(v)}>{String(v||'').replace(/_/g,' ')||'—'}</Tag> },
    { title: "Model", dataIndex: "model", key: "model", width: 50 },
    { title: "Variant", dataIndex: "variant", key: "variant", width: 50 },
    { title: "On-Road Price", dataIndex: "price", key: "price", width: 30, align: 'right' },
    { title: "Mode", dataIndex: "mode", key: "mode", width: 30, align: 'center', render: (v)=> String(v||'').toUpperCase() },
    { title: "Executive", dataIndex: "executive", key: "executive", width: 30 },
    { title: "Company", dataIndex: "company", key: "company", width: 30 },
    { title: "Quotation No", dataIndex: "serialNo", key: "serialNo", width: 50, ellipsis: true },
  ];
  if (["backend","admin","owner"].includes(userRole)) {
    columns.push({ title: "Remarks", key: "remarks", width: 60, render: (_, r) => {
        const rem = remarksMap[r.serialNo];
        const color = rem?.level === 'alert' ? 'red' : rem?.level === 'warning' ? 'gold' : rem?.level === 'ok' ? 'green' : 'default';
        return (
          <Space size={6}>
            <Tag color={color}>{rem?.level ? rem.level.toUpperCase() : '—'}</Tag>
            <Button size="small" onClick={()=> setRemarkModal({ open: true, refId: r.serialNo, level: rem?.level || 'ok', text: rem?.text || '' })}>Remark</Button>
          </Space>
        );
      }
    });
  }

  const total = USE_SERVER_PAG ? totalCount : rows.length;
  const tableHeight = isMobile ? 420 : 600;
  const visibleRows = USE_SERVER_PAG ? filtered : (renderMode === 'loadMore' ? filtered.slice(0, loadedCount) : filtered);

  return (
    <div style={{ paddingTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <Space wrap>
          <Select
            value={branchFilter}
            onChange={setBranchFilter}
            style={{ minWidth: 160 }}
            disabled={!['owner','admin','backend'].includes(userRole)}
            options={branches.map(b => ({ value: b, label: b === 'all' ? 'All Branches' : b }))}
          />
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
          <Tag color="geekblue">Showing: {USE_SERVER_PAG ? visibleRows.length : (renderMode==='loadMore' ? visibleRows.length : filtered.length)}</Tag>
          {!USE_SERVER_PAG && (
          <Select
            size='small'
            value={renderMode}
            onChange={(v)=>{ setRenderMode(v); setLoadedCount(pageSize); }}
            options={[{value:'pagination',label:'Pagination'},{value:'loadMore',label:'Load More'}]}
            style={{ width: 130 }}
          />)}
          <Button onClick={() => {
            const ev = new Event('reload-quotations');
            window.dispatchEvent(ev);
          }}>Refresh</Button>
        </Space>
      </div>

      <Table
        dataSource={visibleRows}
        columns={columns}
        loading={loading && !hasCache}
        size={isMobile ? 'small' : 'middle'}
        scroll={{ x: 'max-content', y: tableHeight }}
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
        onOk={async ()=>{
          try {
            // Sheet-only: call GAS to persist
            if (!GAS_URL) { message.error('Quotation GAS URL not configured'); return; }
            const body = GAS_SECRET ? { action: 'remark', serialNo: remarkModal.refId, level: remarkModal.level, text: remarkModal.text, secret: GAS_SECRET } : { action: 'remark', serialNo: remarkModal.refId, level: remarkModal.level, text: remarkModal.text };
            const resp = await saveBookingViaWebhook({ webhookUrl: GAS_URL, method: 'POST', payload: body });
            if (resp && (resp.ok || resp.success)) {
              setRemarksMap((m)=> ({ ...m, [remarkModal.refId]: { level: remarkModal.level, text: remarkModal.text } }));
              // also update rows array for immediate tag color
              setRows(prev => prev.map(x => x.serialNo === remarkModal.refId ? { ...x, _remarkLevel: remarkModal.level, _remarkText: remarkModal.text } : x));
              message.success('Remark saved to sheet');
              // Also mirror to Google Sheet via Apps Script (kept short and resilient)
              setRemarkModal({ open: false, refId: '', level: 'ok', text: '' });
            } else { message.error('Save failed'); }
          } catch { message.error('Save failed'); }
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
  // GAS endpoints (same as used for list)
  const DEFAULT_QUOT_URL = "https://script.google.com/macros/s/AKfycbwqJMP0YxZaoxWL3xcL-4rz8-uzrw4pyq7JgghNPI08FxXLk738agMcozmk7A7RpoC5zw/exec";
  const GAS_URL = import.meta.env.VITE_QUOTATION_GAS_URL || DEFAULT_QUOT_URL;
  const GAS_SECRET = import.meta.env.VITE_QUOTATION_GAS_SECRET || '';
