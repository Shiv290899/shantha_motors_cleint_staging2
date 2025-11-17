import React, { useEffect, useMemo, useState } from "react";
import { Table, Grid, Space, Button, Select, Input, Tag, Typography, message, DatePicker, Modal } from "antd";
import useDebouncedValue from "../hooks/useDebouncedValue";
// Sheet-only remarks; no backend remarks API
import dayjs from "dayjs";
import { saveJobcardViaWebhook } from "../apiCalls/forms";

// GAS endpoints (module-level) so both list + remark share same URL/secret
const DEFAULT_JC_URL = "https://script.google.com/macros/s/AKfycbz8RbqoPJ4EfkrDVRBg5qthQHRWIkz8v_fjvt41TNq-b26urfqWQy3K3KRndtrlBLf9ug/exec";
const GAS_URL = import.meta.env.VITE_JOBCARD_GAS_URL || DEFAULT_JC_URL;
const GAS_SECRET = import.meta.env.VITE_JOBCARD_GAS_SECRET || '';

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
  amount: ["Service Amount", "Collected Amount", "Collected_Amount", "Amount"],
  paymentMode: ["Payment Mode", "Mode of Payment", "Payment_Mode", "paymentMode"],
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
  const USE_SERVER_PAG = String(import.meta.env.VITE_USE_SERVER_PAGINATION || '').toLowerCase() === 'true';
  
  const [remarksMap, setRemarksMap] = useState({});
  const [remarkModal, setRemarkModal] = useState({ open: false, refId: '', level: 'ok', text: '' });

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

  // Server-mode: refetch on filters/page/date change
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        if (!GAS_URL) {
          message.info('Jobcards: Apps Script URL not configured — showing empty list.');
          if (!cancelled) { setRows([]); setTotalCount(0); }
          return;
        }
        const base = { action: 'list' };
        const filters = {
          q: debouncedQ || '',
          branch: branchFilter !== 'all' ? branchFilter : '',
          service: serviceFilter !== 'all' ? serviceFilter : '',
        };
        if (dateRange && dateRange[0] && dateRange[1]) {
          filters.start = dateRange[0].startOf('day').valueOf();
          filters.end = dateRange[1].endOf('day').valueOf();
        }
        const payload = USE_SERVER_PAG
          ? (GAS_SECRET ? { ...base, page, pageSize, ...filters, secret: GAS_SECRET } : { ...base, page, pageSize, ...filters })
          : (GAS_SECRET ? { ...base, secret: GAS_SECRET } : base);
        const resp = await saveJobcardViaWebhook({
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
          const company = fv.company || '';
          const model = fv.model || pick(obj, HEAD.model);
          const regNo = fv.regNo || pick(obj, HEAD.regNo);
          // Prefer authoritative values from payload when available
          const serviceAmount = (() => {
            const g = payload?.totals?.grand;
            if (g !== undefined && g !== null && g !== '') return String(g);
            return String(pick(obj, HEAD.amount) || '');
          })();
          const payMode = (() => {
            const fromSheet = pick(obj, HEAD.paymentMode);
            return String(fromSheet || payload?.paymentMode || '');
          })();

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
            amount: serviceAmount.trim(),
            paymentMode: payMode.trim(),
            // remarks (if present in sheet)
            RemarkLevel: (obj && (obj.RemarkLevel || obj['Remark Level'])) || '',
            RemarkText: (obj && (obj.RemarkText || obj['Remark Text'])) || '',
          };
        });
        const filteredRows = data.filter((r)=>r.jcNo || r.name || r.mobile);
        if (!cancelled) {
          setRows(filteredRows);
          setTotalCount(typeof js.total === 'number' ? js.total : filteredRows.length);
          const map = {}; filteredRows.forEach(rr => { if (rr.jcNo) map[rr.jcNo] = { level: String(rr.RemarkLevel||'').toLowerCase(), text: rr.RemarkText||'' }; });
          setRemarksMap(map);
        }
      } catch  {
        message.error('Could not load job cards via Apps Script. Check JOBCARD Web App URL / access.');
        if (!cancelled) { setRows([]); setTotalCount(0); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const handler = () => load();
    window.addEventListener('reload-jobcards', handler);
    return () => { cancelled = true; window.removeEventListener('reload-jobcards', handler); };
  }, [branchFilter, serviceFilter, debouncedQ, dateRange, page, pageSize, USE_SERVER_PAG]);

  const branches = useMemo(() => {
    const set = new Set(rows.map((r)=>r.branch).filter(Boolean));
    const all = Array.from(set);
    const isPriv = ["owner","admin"].includes(userRole);
    if (!isPriv && allowedBranches.length) return [...Array.from(new Set(all.filter((b)=>allowedBranches.includes(b))))];
    return ["all", ...all];
  }, [rows, userRole, allowedBranches]);
  const services = useMemo(() => {
    const set = new Set(rows.map((r)=> String(r.serviceType||'').toLowerCase()).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [rows]);

  const filtered = useMemo(() => {
    const allowedSet = new Set((allowedBranches || []).map((b)=>String(b||'').toLowerCase()));
    if (USE_SERVER_PAG) {
      const scoped = rows.filter((r)=>{
        if (allowedSet.size && !["owner","admin","backend"].includes(userRole)) {
          if (!allowedSet.has(String(r.branch||'').toLowerCase())) return false;
        }
        return true;
      });
      return scoped.sort((a,b)=> (b.tsMs||0) - (a.tsMs||0));
    }
    const list = rows.filter((r) => {
      if (allowedSet.size && !["owner","admin","backend"].includes(userRole)) {
        if (!allowedSet.has(String(r.branch||'').toLowerCase())) return false;
      }
      if (branchFilter !== "all" && r.branch !== branchFilter) return false;
      if (serviceFilter !== "all" && String(r.serviceType||'').toLowerCase() !== serviceFilter) return false;
      if (dateRange && dateRange[0] && dateRange[1]) {
        const start = dateRange[0].startOf('day').valueOf();
        const end = dateRange[1].endOf('day').valueOf();
        const t = r.tsMs ?? parseTsMs(r.ts);
        if (!t || t < start || t > end) return false;
      }
      if (debouncedQ) {
        const s = debouncedQ.toLowerCase();
        if (![
          r.name, r.mobile, r.jcNo, r.regNo, r.model, r.branch, r.executive, r.paymentMode
        ].some((v) => String(v || "").toLowerCase().includes(s))) return false;
      }
      return true;
    });
    return list.sort((a,b)=> (b.tsMs||0) - (a.tsMs||0));
  }, [rows, branchFilter, serviceFilter, debouncedQ, dateRange, userRole, allowedBranches, USE_SERVER_PAG]);

  // Reset pagination when filters/search/date change
  useEffect(() => {
    setPage(1);
    setLoadedCount(pageSize);
  }, [branchFilter, serviceFilter, debouncedQ, dateRange]);
  useEffect(() => { setLoadedCount(pageSize); }, [pageSize]);

  const columns = [
    { title: "Time", dataIndex: "ts", key: "ts", width: 20, ellipsis: true, render: (v)=> formatTs(v) },
    { title: "Branch", dataIndex: "branch", key: "branch", width: 50 },
    { title: "Customer Name", dataIndex: "name", key: "name", width: 50, ellipsis: true },
    { title: "Mobile", dataIndex: "mobile", key: "mobile", width: 50 },
    { title: "Model", dataIndex: "model", key: "model", width: 20 },
    { title: "Service Type", dataIndex: "serviceType", key: "serviceType", width: 20, align: 'center', render: (v)=> String(v||'') },
    { title: "Service Amount", dataIndex: "amount", key: "amount", width: 20, align: 'right' },
    { title: "Mode of Payment", dataIndex: "paymentMode", key: "paymentMode", width: 20, align: 'center', render: (v)=> String(v||'').toUpperCase() },
    { title: "Executive", dataIndex: "executive", key: "executive", width: 50 },
    { title: "Job Card", dataIndex: "jcNo", key: "jcNo", width: 20, ellipsis: true },
    { title: "Vehicle No.", dataIndex: "regNo", key: "regNo", width: 20 },
    { title: "Type", dataIndex: "vehicleType", key: "vehicleType", width: 20, align: 'center', render: (v)=> String(v||'') },
  ];
  if (["backend","admin","owner"].includes(userRole)) {
    columns.push({ title: "Remarks", key: "remarks", width: 60, render: (_, r) => {
        const rem = remarksMap[r.jcNo];
        const color = rem?.level === 'alert' ? 'red' : rem?.level === 'warning' ? 'gold' : rem?.level === 'ok' ? 'green' : 'default';
        return (
          <Space size={6}>
            <Tag color={color}>{rem?.level ? rem.level.toUpperCase() : '—'}</Tag>
            <Button size="small" onClick={()=> setRemarkModal({ open: true, refId: r.jcNo, level: rem?.level || 'ok', text: rem?.text || '' })}>Remark</Button>
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
          <Select value={serviceFilter} onChange={setServiceFilter} style={{ minWidth: 140 }}
                  options={services.map(m => ({ value: m, label: m === 'all' ? 'All Services' : String(m).toUpperCase() }))} />
          <DatePicker.RangePicker value={dateRange} onChange={(v)=>{ setDateRange(v); setQuickKey(null); }} allowClear />
          <Button size="small" type={quickKey==='today'?'primary':'default'} onClick={()=>{ const t = dayjs(); setDateRange([t,t]); setQuickKey('today'); }}>Today</Button>
          <Button size="small" type={quickKey==='yesterday'?'primary':'default'} onClick={()=>{ const y = dayjs().subtract(1,'day'); setDateRange([y,y]); setQuickKey('yesterday'); }}>Yesterday</Button>
          <Button size="small" onClick={()=>{ setDateRange(null); setQuickKey(null); }}>Clear</Button>
          <Input placeholder="Search name/mobile/jc/vehicle/model/mode" allowClear value={q} onChange={(e)=>setQ(e.target.value)} style={{ minWidth: 280 }} />
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
            const ev = new Event('reload-jobcards');
            window.dispatchEvent(ev);
          }}>Refresh</Button>
        </Space>
      </div>

      <Table
        dataSource={visibleRows}
        columns={columns}
        loading={loading}
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
        rowKey={(r) => `${r.jcNo}-${r.mobile}-${r.ts}-${r.key}`}
        scroll={{ x: 'max-content', y: tableHeight }}
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
            if (!GAS_URL) { message.error('Jobcards GAS URL not configured'); return; }
            const body = GAS_SECRET ? { action: 'remark', jcNo: remarkModal.refId, level: remarkModal.level, text: remarkModal.text, secret: GAS_SECRET } : { action: 'remark', jcNo: remarkModal.refId, level: remarkModal.level, text: remarkModal.text };
            const resp = await saveJobcardViaWebhook({ webhookUrl: GAS_URL, method: 'POST', payload: body });
            if (resp && (resp.ok || resp.success)) {
              setRemarksMap((m)=> ({ ...m, [remarkModal.refId]: { level: remarkModal.level, text: remarkModal.text } }));
              setRows(prev => prev.map(x => x.jcNo === remarkModal.refId ? { ...x, RemarkLevel: remarkModal.level.toUpperCase(), RemarkText: remarkModal.text } : x));
              message.success('Remark saved to sheet');
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
