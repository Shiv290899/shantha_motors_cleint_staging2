import React, { useEffect, useMemo, useState } from 'react';
import { Card, Space, Typography, message, Button, Divider, Tag, Tooltip, Progress, Modal, Table, Grid } from 'antd';
import { saveJobcardViaWebhook } from '../apiCalls/forms';

const { Text } = Typography;

export default function StaffAccountCard() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const DEFAULT_JC_URL = 'https://script.google.com/macros/s/AKfycbw-_96BCshSZqrJqZDl2XveC0yVmLcwogwih6K_VNfrb-JiI1H-9y04z7eaeFlh7rwSWg/exec';
  const GAS_URL = import.meta.env.VITE_JOBCARD_GAS_URL || DEFAULT_JC_URL;
  const SECRET = import.meta.env.VITE_JOBCARD_GAS_SECRET || '';

  const [data, setData] = useState({ bookingAmountPending:0, jcAmountPending:0, minorSalesAmountPending:0, totalPending:0, prevDueAssigned:0 });
  const [loading, setLoading] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [txMode, setTxMode] = useState('cash'); // 'cash' | 'online'
  const [txRows, setTxRows] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [hasCache, setHasCache] = useState(false);

  const readUser = () => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } };
  const me = readUser();
  const branch = me?.formDefaults?.branchName || me?.primaryBranch?.name || '';
  const staff = me?.formDefaults?.staffName || me?.name || '';

  const CACHE_KEY = `StaffAccount:${branch}|${staff}`;

  // Seed UI from last cached summary (instant paint)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && cached.data) {
          setData(cached.data);
          setHasCache(true);
        }
      }
    } catch {/* ignore */}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [CACHE_KEY]);

  const saveCache = (obj) => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: obj })); } catch {/* ignore */}
  };

  const load = async () => {
    if (!GAS_URL || !branch || !staff) return;
    setLoading(true);
    try {
      // Prefer new StaffLedger summary
      const payload = SECRET ? { action:'staff_ledger_summary', branch, staff, secret: SECRET } : { action:'staff_ledger_summary', branch, staff };
      const resp = await saveJobcardViaWebhook({ webhookUrl: GAS_URL, method:'GET', payload });
      const js = resp?.data || resp || {};
      if (!js?.success) throw new Error('Failed');
      const payloadData = js?.data && typeof js.data === 'object' ? js.data : js;

      // Only use ledger summary for totals (single source of truth)
      const prevDueAssigned = Number(
        payloadData.prevDueAssigned ?? payloadData.openingBalance ?? payloadData.opening ?? 0
      ) || 0;
      const base = {
        bookingAmountPending: 0,
        jcAmountPending: 0,
        minorSalesAmountPending: 0,
        totalPending: Number(payloadData.totalPending||0) || 0,
        cashAmountPending: Number(payloadData.cashPending||0) || 0,
        onlineAmountPending: Number(payloadData.onlinePending||0) || 0,
        total: Number(payloadData.totalPending||0) || 0,
        cashAmount: Number(payloadData.cashPending||0) || 0,
        onlineAmount: Number(payloadData.onlinePending||0) || 0,
        settlementDone: false,
        lastSettledAt: payloadData.lastSettledAt || undefined,
        prevDueAssigned,
        prevDueNote: payloadData.prevDueNote || '',
        prevDueUpdatedAt: payloadData.prevDueUpdatedAt || payloadData.prevDueAssignedAt || '',
        prevDueUpdatedBy: payloadData.prevDueUpdatedBy || '',
      };
      // Paint immediately and cache
      setData(base);
      saveCache(base);
      setLoading(false); // stop spinner while we compute detailed breakdown

      // Also fetch transactions to compute per-source breakdown from ledger
      try {
        const all = await fetchLedgerTransactions({ GAS_URL, SECRET, branch, staff, mode: 'all' });
        const normType = (x) => {
          const s = String(x||'').toLowerCase().trim();
          const z = s.replace(/[^a-z]/g,'');
          if (z.startsWith('book')) return 'booking';
          if (z==='jc' || z.includes('jobcard') || z.includes('job')) return 'jc';
          if (z.includes('minor')) return 'minor';
          return 'other';
        };
        const sums = all.reduce((a, r) => {
          // Accept multiple casings/aliases from GAS rows
          const t = normType(r.sourceType ?? r.SourceType ?? r.srcType ?? r.SrcType);
          const cashVal = Number(
            r.cashPending ?? r.CashPending ?? r.cash ?? r.Cash ?? 0
          ) || 0;
          const onlineVal = Number(
            r.onlinePending ?? r.OnlinePending ?? r.onLinePending ?? r.online ?? r.Online ?? 0
          ) || 0;
          const amt = cashVal + onlineVal;
          if (t === 'booking') a.booking += amt;
          else if (t === 'jc') a.jc += amt;
          else if (t === 'minor') a.minor += amt;
          else a.other += amt;
          return a;
        }, { booking:0, jc:0, minor:0, other:0 });
        if (import.meta && import.meta.env && import.meta.env.DEV) {
          // Helpful debug in dev: see how we classified
          // eslint-disable-next-line no-console
          console.log('[StaffAccountCard] ledger breakdown', { input: all, sums });
        }
        // Write both the generic and *Pending fields so totals coalesce correctly
        const nextData = {
          ...base,
          bookingAmount: sums.booking,
          jcAmount: sums.jc,
          minorSalesAmount: sums.minor,
          bookingAmountPending: sums.booking,
          jcAmountPending: sums.jc,
          minorSalesAmountPending: sums.minor,
        };
        setData(nextData);
        saveCache(nextData);
      } catch {
        setData(base);
        saveCache(base);
      }
    } catch { message.error('Could not load account summary'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [GAS_URL]);
  // Auto-refresh so staff sees updated pending after owner collections
  // Configurable via Vite env: VITE_STAFF_ACCOUNT_REFRESH_MS (default 20000ms)
  const REFRESH_MS = Math.max(1000, parseInt(import.meta.env.VITE_STAFF_ACCOUNT_REFRESH_MS || '600000', 10) || 600000);
  useEffect(() => {
    const id = setInterval(() => { try { load(); } catch { /* ignore */ } }, REFRESH_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [GAS_URL, REFRESH_MS]);

  const formatINR = (v) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(v || 0));

  // Derive cash vs online safely, with multiple possible field names supported
  const totals = useMemo(() => {
    const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
    // Prefer explicit cash/online if present; otherwise derive
    const cash = num(
      data.cashAmount ?? data.cashAmountPending ?? data.cash ?? data.cashPending ?? 0
    );
    const online = num(
      data.onlineAmount ?? data.onlineAmountPending ?? data.online ?? data.onlinePending ?? 0
    );
    let total = num(data.total ?? data.totalPending ?? (cash + online));
    if (!total) total = cash + online;
    const booking = num(data.bookingAmountPending ?? data.bookingAmount ?? 0);
    const minor = num(data.minorSalesAmountPending ?? data.minorSalesAmount ?? 0);
    const jcSales = num(data.jcAmountPending ?? data.jcAmount ?? 0);
    const salesSum = booking + minor + jcSales; // S (today's sales)
    const opening = num(
      data.prevDueAssigned ?? data.prevDue ?? data.openingBalance ?? data.opening ?? 0
    ); // carry forward (owner-assigned)
    const breakdownTotal = opening + salesSum;
    // Prefer explicit JC collected fields if API provides them
    const jcCash = num(data.jcCashPending ?? data.jcCash ?? 0);
    const jcOnline = num(data.jcOnlinePending ?? data.jcOnline ?? 0);
    let jcCollected = jcCash + jcOnline;
    if (!jcCollected) {
      // Derive JC collected as (cash+online) - (booking+minor) when explicit fields are absent
      const derived = cash + online - (booking + minor);
      jcCollected = derived > 0 ? derived : 0;
    }
    // Compute pending if API didn't send it: S - C
    let pending = num(data.closingPending ?? data.outstandingPending ?? data.closing ?? 0);
    if (!pending) pending = Math.max(0, salesSum - total); // only today's pending
    const pendingAll = Math.max(0, opening + salesSum - total); // include previous unsettled
    const cashToHandOver = cash; // physical handover is only cash
    const totalCollected = cashToHandOver + online;
    const base = {
      total, // pending/collected from ledger
      cash: cashToHandOver,
      online,
      totalCollected,
      // Breakdowns (prefer collected JC; others already represent collected amounts)
      // Use category totals from ledger for breakdown
      jc: jcSales,
      booking,
      minor,
      prevDue: opening,
      breakdownTotal,
      prevDueNote: data.prevDueNote || '',
      prevDueUpdatedAt: data.prevDueUpdatedAt || undefined,
      prevDueUpdatedBy: data.prevDueUpdatedBy || '',
      settlementDone: Boolean(data.settlementDone),
      lastSettledAt: data.lastSettledAt || data.lastSettlementAt || undefined,
      pending,
      pendingAll,
      sales: salesSum, // S
    };
    // If owner has settled the row, show a fresh zeroed view for the staff
    if (base.settlementDone) {
      return {
        total: 0,
        cash: 0,
        online: 0,
        totalCollected: 0,
        jc: 0,
        booking: 0,
        minor: 0,
        prevDue: 0,
        breakdownTotal: 0,
        prevDueNote: '',
        prevDueUpdatedAt: undefined,
        prevDueUpdatedBy: '',
        settlementDone: true,
        lastSettledAt: base.lastSettledAt,
        pending: 0,
        pendingAll: 0,
        sales: 0,
      };
    }
    return base;
  }, [data]);

  const prevDueMetaLine = useMemo(() => {
    const bits = [];
    if (data.prevDueNote) bits.push(`Note: ${data.prevDueNote}`);
    if (data.prevDueUpdatedBy || data.prevDueUpdatedAt) {
      const when = data.prevDueUpdatedAt ? formatShortDate(data.prevDueUpdatedAt) : '';
      const who = data.prevDueUpdatedBy ? `by ${data.prevDueUpdatedBy}` : '';
      const chunk = ['Assigned', who.trim(), when ? `on ${when}` : ''].filter(Boolean).join(' ');
      if (chunk.trim()) bits.push(chunk.trim());
    }
    return bits.join(' • ');
  }, [data.prevDueNote, data.prevDueUpdatedAt, data.prevDueUpdatedBy]);

  const Item = ({ label, value, subtle }) => (
    <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap: 6, opacity: subtle ? 0.9 : 1 }}>
      <Text type={subtle ? 'secondary' : undefined}>{label}</Text>
      <Text strong>₹ {formatINR(value)}</Text>
    </div>
  );

  const openTx = async (mode) => {
    try {
      setTxMode(mode);
      setTxOpen(true);
      setTxRows([]);
      setTxLoading(true);
      const rows = await fetchLedgerTransactions({ GAS_URL, SECRET, branch, staff, mode });
      setTxRows(rows);
      // Lazy-enrich names for JC rows missing customerName (older entries)
      try {
        const missing = rows.filter(r => !r.customerName && String(r.sourceType||'').toLowerCase()==='jc');
        if (missing.length) {
          const filled = await Promise.all(rows.map(async (r) => {
            if (r.customerName || String(r.sourceType||'').toLowerCase() !== 'jc') return r;
            try {
              const payload = SECRET ? { action:'search', mode:'jc', query: String(r.sourceId||''), secret: SECRET } : { action:'search', mode:'jc', query: String(r.sourceId||'') };
              const resp = await saveJobcardViaWebhook({ webhookUrl: GAS_URL, method:'GET', payload });
              const js = resp?.data || resp || {};
              const first = Array.isArray(js.rows) && js.rows.length ? js.rows[0] : null;
              const nm = first?.values?.Customer_Name || first?.payload?.formValues?.custName || '';
              return nm ? { ...r, customerName: nm } : r;
            } catch { return r; }
          }));
          setTxRows(filled);
        }
      } catch { /* keep base rows */ }
    } catch { message.error('Could not load transactions'); }
    finally { setTxLoading(false); }
  };

  return (
    <Card
      size='small'
      loading={loading && !hasCache}
      title='Account Summary'
      style={{ width: '100%', maxWidth: isMobile ? '100%' : 520, margin: isMobile ? '0 auto' : undefined }}
      extra={<Button size='small' onClick={load} disabled={loading}>Refresh</Button>}
    >
      <Space direction='vertical' style={{ width: '100%' }}>
        <div style={{
          display:'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: 12,
        }}>
          <div style={{
            padding:12,
            border:'1px solid #f0f0f0',
            borderRadius:8,
            background:'#fff',
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <Text strong>Cash to Hand Over</Text>
              <Space size={6}>
                <Button size='small' onClick={()=>openTx('cash')}>View</Button>
                <Tag color='green'>Cash</Tag>
              </Space>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>₹ {formatINR(totals.cash)}</div>
            
          </div>

          <div style={{
            padding:12,
            border:'1px solid #f0f0f0',
            borderRadius:8,
            background:'#fafafa',
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <Text strong>Online Collected</Text>
              <Space size={6}>
                <Button size='small' onClick={()=>openTx('online')}>View</Button>
                <Tag color='blue'>Online</Tag>
              </Space>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>₹ {formatINR(totals.online)}</div>
            <Text type='secondary' style={{ fontSize: 12 }}>Shown for record, not handed over</Text>
          </div>
        </div>

        <div style={{ paddingTop: 6 }}>
          <Text strong>Total Sales</Text>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:12 }}>
            <Progress percent={
              (() => {
                const baseVal = totals.totalCollected || 0;
                return baseVal ? 100 : 0;
              })()
            } showInfo={false} strokeColor={{ from: '#52c41a', to: '#2f54eb' }} />
            <Text style={{ fontSize: 18, fontWeight: 700 }}>₹ {formatINR(totals.totalCollected)}</Text>
          </div>
          <Text type='secondary' style={{ fontSize: 12 }}>Cash to hand over + Online collected</Text>
        </div>

        <Divider style={{ margin: '8px 0' }} />
        <Text type='secondary' style={{ fontSize: 12 }}>Breakdown</Text>
        <Item label='Previous Due (carry forward)' value={totals.prevDue} subtle />
        {prevDueMetaLine ? (
          <Text type='secondary' style={{ fontSize: 11, marginTop: -6, marginBottom: 4 }}>{prevDueMetaLine}</Text>
        ) : null}
        <Item label='From Job Cards' value={totals.jc} subtle />
        <Item label='From Bookings' value={totals.booking} subtle />
        <Item label='From Minor Sales' value={totals.minor} subtle />
        <Item label='Total Pending Payments' value={totals.breakdownTotal} />

        <Divider style={{ margin: '8px 0' }} />
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <Tooltip title='After owner collects cash, only the owner can reset amounts to zero.'>
            <Tag color='orange'>Owner resets to zero after collection</Tag>
          </Tooltip>
          {totals.settlementDone ? (
            <Tag color='green'>Settled</Tag>
          ) : null}
          {totals.lastSettledAt ? (
            <Tag color='default'>Last settled: {String(totals.lastSettledAt)}</Tag>
          ) : null}
        </div>
      </Space>
      <Modal
        open={txOpen}
        title={txMode === 'cash' ? 'Cash Transactions (Pending)' : 'Online Transactions (Pending)'}
        onCancel={()=>{ setTxOpen(false); setTxRows([]); }}
        footer={null}
        width={isMobile ? Math.min((typeof window!=='undefined'? window.innerWidth : 360) - 24, 520) : 800}
      >
        <Table
          size='small'
          rowKey={(r)=>`${r.dateTimeIso}-${r.sourceType}-${r.sourceId}`}
          dataSource={txRows}
          loading={txLoading}
          locale={txLoading ? { emptyText: ' ' } : undefined}
          columns={[
            { title:'Date', key:'date', render:(_,r)=> formatShortDate(r.dateTimeIso || r.date) },
            { title:'Customer', dataIndex:'customerName', key:'customer' },
            { title:'Mobile', dataIndex:'customerMobile', key:'mobile' },
            { title:'Source', key:'src', render:(_,r)=> `${String(r.sourceType||'').toUpperCase()} ${r.sourceId||''}` },
            { title:'Amount', key:'amt', align:'right', render:(_,r)=> (txMode==='cash' ? r.cashPending : r.onlinePending).toLocaleString('en-IN') },
            { title:'UTR', key:'utr', render:(_,r)=> {
              // For cash transactions, UTR is not applicable → show blank
              const mode = String(r?.paymentMode || (txMode||'')).toLowerCase();
              if (mode === 'cash') return '';
              const v = r?.utr ?? r?.utrNo ?? r?.reference ?? r?.ref;
              const s = String(v ?? '').trim();
              if (!s || s.toLowerCase()==='undefined' || s.toLowerCase()==='null') return '';
              return s;
            } },
          ]}
          pagination={{ pageSize: isMobile ? 6 : 10, size: isMobile ? 'small' : 'default' }}
          scroll={{ x: 'max-content' }}
        />
      </Modal>
    </Card>
  );
}

// Helpers for transactions modal
async function fetchLedgerTransactions({ GAS_URL, SECRET, branch, staff, mode }){
  const payload = SECRET ? { action:'staff_ledger_transactions', branch, staff, mode, secret: SECRET } : { action:'staff_ledger_transactions', branch, staff, mode };
  const resp = await saveJobcardViaWebhook({ webhookUrl: GAS_URL, method:'GET', payload });
  const js = resp?.data || resp || {};
  if (!js?.success) throw new Error('Failed');
  return Array.isArray(js.rows) ? js.rows : [];
}

// (openTx defined inside component)

// Local helpers
function formatShortDate(raw){
  try {
    if (!raw) return '';
    const d = raw instanceof Date ? raw : new Date(String(raw));
    if (Number.isNaN(d.getTime())) return String(raw);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    let h = d.getHours()%12; if (h===0) h = 12;
    const hh = String(h).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch { return String(raw||''); }
}
