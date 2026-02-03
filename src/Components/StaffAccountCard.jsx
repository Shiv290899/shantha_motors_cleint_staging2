import React, { useEffect, useMemo, useState } from 'react';
import { Card, Space, Typography, message, Button, Divider, Tag, Tooltip, Progress, Modal, Table, Grid, Spin, Empty } from 'antd';
import { saveBookingViaWebhook, saveJobcardViaWebhook } from '../apiCalls/forms';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;

export default function StaffAccountCard() {
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const DEFAULT_JC_URL = 'https://script.google.com/macros/s/AKfycbw7DzKCy3wZeeRBEM5XKIu6w0gt_2ouCaSkpaKv0UkjkQThCtVoRciOkkYT8sNViQuEaw/exec';
  const GAS_URL = import.meta.env.VITE_JOBCARD_GAS_URL || DEFAULT_JC_URL;
  const SECRET = import.meta.env.VITE_JOBCARD_GAS_SECRET || '';
  const DEFAULT_BOOKING_URL = 'https://script.google.com/macros/s/AKfycbwSn5hp1cSWlJMGhe2cYUtid2Ruqh9H13mZbq0PwBpYB0lMLufZbIjZ5zioqtKgE_0sNA/exec';
  const BOOKING_GAS_URL = import.meta.env.VITE_BOOKING_GAS_URL || DEFAULT_BOOKING_URL;
  const BOOKING_SECRET = import.meta.env.VITE_BOOKING_GAS_SECRET || '';

  const [data, setData] = useState({ bookingAmountPending:0, jcAmountPending:0, minorSalesAmountPending:0, totalPending:0, prevDueAssigned:0 });
  const [loading, setLoading] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [txMode, setTxMode] = useState('cash'); // 'cash' | 'online'
  const [txRows, setTxRows] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [hasCache, setHasCache] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingServiceRows, setPendingServiceRows] = useState([]);
  const [pendingSalesRows, setPendingSalesRows] = useState([]);
  const [pendingRefreshedAt, setPendingRefreshedAt] = useState(null);

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
    const id = setInterval(() => {
      try { load(); } catch { /* ignore */ }
      try { loadPendingSummary(); } catch { /* ignore */ }
    }, REFRESH_MS);
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

  const openPostServiceFromPending = (row) => {
    const mobile = String(row?.mobile || '').replace(/\D/g, '').slice(-10);
    const jcNo = String(row?.jcNo || row?.serialNo || '').trim();
    const params = new URLSearchParams();
    params.set('autoFetch', '1');
    if (mobile) {
      params.set('mode', 'mobile');
      params.set('query', mobile);
    } else if (jcNo) {
      params.set('mode', 'jc');
      params.set('query', jcNo);
    }
    if (jcNo) params.set('jcNo', jcNo);
    const qs = params.toString();
    navigate(qs ? `/jobcard?${qs}` : '/jobcard');
  };

  const loadPendingSummary = async () => {
    if (!branch) return;
    setPendingLoading(true);
    try {
      const [jobcards, bookings] = await Promise.all([
        fetchPendingJobcards({ GAS_URL, SECRET, branch }),
        fetchPendingBookings({ BOOKING_GAS_URL, BOOKING_SECRET, branch }),
      ]);
      setPendingServiceRows(jobcards);
      setPendingSalesRows(bookings);
      setPendingRefreshedAt(new Date());
    } catch {
      message.error('Could not load pending summary');
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    loadPendingSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch, GAS_URL, BOOKING_GAS_URL]);

  const pendingTotals = useMemo(() => {
    const service = Array.isArray(pendingServiceRows) ? pendingServiceRows.length : 0;
    const sales = Array.isArray(pendingSalesRows) ? pendingSalesRows.length : 0;
    const salesBalance = (Array.isArray(pendingSalesRows) ? pendingSalesRows : [])
      .reduce((sum, r) => sum + (Number(r.balanceValue || 0) || 0), 0);
    return { service, sales, salesBalance };
  }, [pendingServiceRows, pendingSalesRows]);

  return (
    <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, alignItems: 'start' }}>
      <Card
        size='small'
        loading={loading && !hasCache}
        title='Account Summary'
        style={{ width: '100%' }}
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

      <Card
        size='small'
        title='Pending Summary'
        style={{ width: '100%' }}
        extra={<Button size='small' onClick={loadPendingSummary} disabled={pendingLoading}>Refresh</Button>}
      >
        <Space direction='vertical' style={{ width: '100%' }} size={12}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <Tag color='orange'>Service Pending: {pendingTotals.service}</Tag>
            <Tag color='blue'>Sales Pending: {pendingTotals.sales}</Tag>
            <Tag color='geekblue'>Sales Balance: ₹ {formatINR(pendingTotals.salesBalance)}</Tag>
            {pendingRefreshedAt ? (
              <Text type='secondary' style={{ fontSize: 11 }}>Last refresh: {formatShortDate(pendingRefreshedAt)}</Text>
            ) : null}
          </div>

          <div>
            <Text strong>Service</Text>
            <Text type='secondary' style={{ fontSize: 12, marginLeft: 6 }}>Pending Job Cards</Text>
            <div style={{ marginTop: 8, display:'grid', gap: 8 }}>
              {pendingLoading ? (
                <div style={{ padding: 8 }}><Spin size='small' /></div>
              ) : pendingServiceRows.length ? (
                pendingServiceRows.slice(0, 8).map((r) => (
                  <div
                    key={r.key}
                    style={{
                      padding:'8px 10px',
                      border:'1px solid #f0f0f0',
                      borderRadius:10,
                      background:'#fff',
                      display:'flex',
                      alignItems:'center',
                      gap: isMobile ? 6 : 10,
                      flexWrap: isMobile ? 'wrap' : 'nowrap',
                      fontSize: isMobile ? 10 : 11,
                    }}
                  >
                    <Text
                      strong
                      style={{
                        fontSize: isMobile ? 10 : 11,
                        minWidth: isMobile ? 0 : 110,
                        whiteSpace: isMobile ? 'normal' : 'nowrap',
                        overflow:'hidden',
                        textOverflow:'ellipsis',
                        flex: isMobile ? '1 1 100%' : '0 0 auto',
                      }}
                    >
                      {r.name || '—'}
                    </Text>
                    <Text type='secondary' style={{ fontSize: isMobile ? 9 : 10, minWidth: isMobile ? 0 : 90, whiteSpace:'nowrap' }}>{r.mobile || '—'}</Text>
                    <Text style={{ fontSize: isMobile ? 10 : 11, minWidth: isMobile ? 0 : 140, whiteSpace: isMobile ? 'normal' : 'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {[r.model, r.regNo].filter(Boolean).join(' | ') || '—'}
                    </Text>
                    <Text type='secondary' style={{ fontSize: isMobile ? 9 : 10, minWidth: isMobile ? 0 : 120, whiteSpace:'nowrap' }}>{r.dateAt ? formatShortDate(r.dateAt) : ''}</Text>
                    <Button
                      size="small"
                      type="primary"
                      style={{ marginLeft: isMobile ? 0 : 'auto', height: 22, padding: '0 8px', fontSize: 10 }}
                      onClick={() => openPostServiceFromPending(r)}
                    >
                      Post Service
                    </Button>
                  </div>
                ))
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No pending job cards" />
              )}
            </div>
          </div>

          <Divider style={{ margin: '6px 0' }} />

          <div>
            <Text strong>Sales</Text>
            <Text type='secondary' style={{ fontSize: 12, marginLeft: 6 }}>Pending Balance (Bookings)</Text>
            <div style={{ marginTop: 8, display:'grid', gap: 8 }}>
              {pendingLoading ? (
                <div style={{ padding: 8 }}><Spin size='small' /></div>
              ) : pendingSalesRows.length ? (
                pendingSalesRows.slice(0, 8).map((r) => (
                  <div
                    key={r.key}
                    style={{
                      padding:'8px 10px',
                      border:'1px solid #f0f0f0',
                      borderRadius:10,
                      background:'#fff',
                      display:'flex',
                      alignItems:'center',
                      gap: isMobile ? 6 : 10,
                      flexWrap: isMobile ? 'wrap' : 'nowrap',
                      fontSize: isMobile ? 10 : 11,
                    }}
                  >
                    <Text
                      strong
                      style={{
                        fontSize: isMobile ? 10 : 11,
                        minWidth: isMobile ? 0 : 110,
                        whiteSpace: isMobile ? 'normal' : 'nowrap',
                        overflow:'hidden',
                        textOverflow:'ellipsis',
                        flex: isMobile ? '1 1 100%' : '0 0 auto',
                      }}
                    >
                      {r.name || '—'}
                    </Text>
                    <Text type='secondary' style={{ fontSize: isMobile ? 9 : 10, minWidth: isMobile ? 0 : 90, whiteSpace:'nowrap' }}>{r.mobile || '—'}</Text>
                    <Text style={{ fontSize: isMobile ? 10 : 11, minWidth: isMobile ? 0 : 170, whiteSpace: isMobile ? 'normal' : 'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {[r.model, r.variant, r.color].filter(Boolean).join(' | ') || '—'}
                    </Text>
                    <Text type='secondary' style={{ fontSize: isMobile ? 9 : 10, minWidth: isMobile ? 0 : 120, whiteSpace:'nowrap' }}>{r.dateAt ? formatShortDate(r.dateAt) : ''}</Text>
                    <Tag color='blue' style={{ marginLeft: isMobile ? 0 : 'auto', fontSize: 10, lineHeight: '14px', padding: '0 6px' }}>
                      ₹ {formatINR(r.balanceValue || 0)}
                    </Tag>
                  </div>
                ))
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No pending balances" />
              )}
            </div>
          </div>
        </Space>
      </Card>
    </div>
  );
}

// Helpers for transactions modal
async function fetchLedgerTransactions({ GAS_URL, SECRET, branch, staff, mode }){
  const payload = SECRET ? { action:'staff_ledger_transactions', branch, staff, mode, secret: SECRET } : { action:'staff_ledger_transactions', branch, staff, mode };
  const resp = await saveJobcardViaWebhook({ webhookUrl: GAS_URL, method:'GET', payload });
  const js = resp?.data || resp || {};
  if (!js?.success) throw new Error('Failed');
  const rows = Array.isArray(js.rows) ? js.rows : [];
  // De-dupe identical ledger rows (same source + payment details)
  const normKey = (v) => String(v ?? '').trim().toLowerCase();
  const rowTs = (r) => {
    const raw = r?.dateTimeIso || r?.date;
    const n = Number(new Date(String(raw)));
    return Number.isFinite(n) ? n : 0;
  };
  const rowGroupKey = (r) => {
    const sourceId = normKey(r?.sourceId || r?.sourceID || r?.jcNo || r?.source || '');
    const tsKey = normKey(r?.dateTimeIso || r?.date || '');
    return ([
      normKey(r?.branch),
      normKey(r?.staff),
      normKey(r?.sourceType),
      sourceId || tsKey,
      normKey(r?.customerMobile),
      normKey(r?.paymentMode),
      normKey(r?.cashAmount ?? r?.cashPending),
      normKey(r?.onlineAmount ?? r?.onlinePending),
      normKey(r?.utr),
    ]).join('|');
  };
  const map = new Map();
  rows.forEach((r) => {
    const key = rowGroupKey(r);
    const prev = map.get(key);
    if (!prev || rowTs(r) >= rowTs(prev)) {
      map.set(key, r);
    }
  });
  return Array.from(map.values());
}

// (openTx defined inside component)

// Pending summary helpers
async function fetchPendingJobcards({ GAS_URL, SECRET, branch }){
  if (!GAS_URL || !branch) return [];
  const payload = SECRET
    ? { action:'list', branch, page: 1, pageSize: 10000, secret: SECRET }
    : { action:'list', branch, page: 1, pageSize: 10000 };
  const resp = await saveJobcardViaWebhook({ webhookUrl: GAS_URL, method:'GET', payload });
  const js = resp?.data || resp || {};
  const rows = Array.isArray(js?.rows) ? js.rows : (Array.isArray(js?.data) ? js.data : []);
  const branchNorm = normalizeText(branch);
  const items = rows.map((r, i) => {
    const p = parsePayloadFromRow(r) || {};
    const fv = p.formValues || {};
    const values = r?.values && typeof r.values === 'object' ? r.values : (r || {});
    const branchDisp = fv.branch || p.branch || values.Branch || values['Branch Name'] || values['Branch'] || '';
    const postServiced = isPostServicedJobcard(p, values);
    const serial = fv.jcNo || fv.JCNo || p.jcNo || p.JCNo || fv.serialNo || p.serialNo || values['JC No'] || values['JC No.'] || values['Job Card No'] || '-';
    return {
      key: serial || i,
      jcNo: serial || '-',
      name: fv.custName || fv.name || values.Customer_Name || values['Customer Name'] || values.Customer || values.Name || '-',
      mobile: fv.custMobile || fv.mobile || values.Mobile || values['Mobile Number'] || values.Phone || '-',
      model: p.model || p.vehicle?.model || fv.bikeModel || fv.model || values.Model || '',
      regNo: fv.regNo || values['Vehicle No'] || values['Vehicle_No'] || '',
      branch: String(branchDisp || '').trim(),
      dateAt: pickRowDate(p, values),
      postServiced,
    };
  });
  return items
    .filter((r) => normalizeText(r.branch) === branchNorm)
    .filter((r) => !r.postServiced)
    .sort((a, b) => (asTimeMs(b.dateAt) - asTimeMs(a.dateAt)))
    .slice(0, 50);
}

async function fetchPendingBookings({ BOOKING_GAS_URL, BOOKING_SECRET, branch }){
  if (!BOOKING_GAS_URL || !branch) return [];
  const payload = BOOKING_SECRET
    ? { action:'list', page: 1, pageSize: 10000, secret: BOOKING_SECRET }
    : { action:'list', page: 1, pageSize: 10000 };
  const resp = await saveBookingViaWebhook({ webhookUrl: BOOKING_GAS_URL, method:'GET', payload });
  const js = resp?.data || resp || {};
  const rows = Array.isArray(js?.rows) ? js.rows : (Array.isArray(js?.data) ? js.data : []);
  const branchNorm = normalizeText(branch);
  const items = rows.map((r, i) => {
    const p = parsePayloadFromRow(r) || {};
    const fv = p.formValues || {};
    const values = r?.values && typeof r.values === 'object' ? r.values : (r || {});
    const rawPayload = extractRawPayloadObject(
      p.rawPayload,
      values?.['Raw Payload'],
      values?.rawPayload,
      values?.RawPayload,
      values?.rawpayload,
      r.rawPayload,
      r.payload?.rawPayload
    );
    const branchDisp = fv.branch || p.branch || values.Branch || values['Branch Name'] || values['Branch'] || '';
    const { balanceValue, balanceLabel } = computeBookingBalance({
      payload: p,
      values,
      rawPayload,
    });
    return {
      key: fv.bookingId || p.bookingId || values['Booking ID'] || values['Booking_Id'] || values['Booking Id'] || i,
      bookingId: fv.bookingId || p.bookingId || values['Booking ID'] || values['Booking_Id'] || values['Booking Id'] || '',
      name: fv.custName || fv.name || values.Customer_Name || values['Customer Name'] || values.Customer || values.Name || '-',
      mobile: fv.custMobile || fv.mobile || values.Mobile || values['Mobile Number'] || values.Phone || '-',
      model: p.model || p.vehicle?.model || fv.bikeModel || fv.model || values.Model || '',
      variant: p.variant || p.vehicle?.variant || fv.variant || values.Variant || '',
      color: p.color || p.vehicle?.color || fv.color || values.Color || values.Colour || values['Vehicle Color'] || values['Vehicle Colour'] || '',
      branch: String(branchDisp || '').trim(),
      dateAt: pickRowDate(p, values),
      balanceValue,
      balanceLabel,
    };
  });
  return items
    .filter((r) => normalizeText(r.branch) === branchNorm)
    .filter((r) => Number(r.balanceValue || 0) > 0.01)
    .sort((a, b) => (asTimeMs(b.dateAt) - asTimeMs(a.dateAt)))
    .slice(0, 50);
}

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const asTimeMs = (value) => {
  if (!value) return 0;
  const d = value instanceof Date ? value : new Date(String(value));
  const n = Number(d.getTime());
  return Number.isFinite(n) ? n : 0;
};

const pickRowDate = (payload = {}, values = {}) => {
  const raw = [
    payload.postServiceAt,
    payload.savedAt,
    payload.ts,
    payload.tsMs,
    payload.createdAt,
    values['Post Service At'],
    values['PostServiceAt'],
    values['Post_Service_At'],
    values['Saved At'],
    values['savedAt'],
    values['Timestamp'],
    values['timestamp'],
    values['DateTime'],
    values['Date Time'],
    values['Date_Time'],
    values['Submitted At'],
    values['SubmittedAt'],
    values['submittedAt'],
    values['Created At'],
    values['CreatedAt'],
    values['createdAt'],
  ].find((v) => v !== null && v !== undefined && String(v).trim() !== '');
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(String(raw));
  return Number.isFinite(d.getTime()) ? d : null;
};

const parsePayloadFromRow = (r) => {
  if (!r) return null;
  if (r.payload && typeof r.payload === 'object') return r.payload;
  if (typeof r.payload === 'string') {
    try { return JSON.parse(r.payload); } catch { /* ignore */ }
  }
  const payloadStr = (r.values && (r.values.Payload || r.values['payload'] || r.values['PAYLOAD'])) || r.Payload || r['PAYLOAD'];
  if (typeof payloadStr === 'string') {
    try { return JSON.parse(payloadStr); } catch { /* ignore */ }
  }
  if (r.formValues && (r.followUp || r.savedAt || r.postServiceAt)) return r;
  return null;
};

const isPostServicedJobcard = (payload = {}, values = {}) => {
  if (payload.postServiceAt) return true;
  if (Array.isArray(payload.payments) && payload.payments.some(x => Number(x?.amount || 0) > 0)) return true;
  const postAt = values['Post Service At'] || values['PostServiceAt'] || values['Post_Service_At'];
  if (postAt) return true;
  const vs = (k) => String(values[k] || '').trim().toLowerCase();
  if (['yes','done','completed','true'].includes(vs('Post Service'))) return true;
  return false;
};

const parseMoneyValue = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
};

const parseJsonValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try { return JSON.parse(value); } catch { return null; }
};

const extractRawPayloadObject = (...sources) => {
  for (const source of sources) {
    if (!source && source !== 0) continue;
    if (typeof source === "object") return source;
    const parsed = parseJsonValue(source);
    if (parsed) return parsed;
  }
  return null;
};

const safePositiveNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
};

const readNumberCandidate = (value) => {
  if (value === null || value === undefined) return { found: false };
  const valueType = typeof value;
  if (valueType === "object" || valueType === "boolean") return { found: false };
  const normalized =
    valueType === "string" ? value.trim() : String(value).trim();
  if (normalized === "") return { found: false };
  const amount = parseMoneyValue(value);
  if (!Number.isFinite(amount)) return { found: false };
  return { found: true, value: amount };
};

const getNumberValue = (value) => {
  const candidate = readNumberCandidate(value);
  return candidate.found ? candidate.value : null;
};

const readValueAtPath = (source, path = []) => {
  if (!source || !path.length) return undefined;
  return path.reduce((cur, key) => {
    if (!cur || typeof cur !== "object") return undefined;
    return cur[key];
  }, source);
};

const scanPathsForNumbers = (sources, paths = []) => {
  if (!Array.isArray(sources)) return [];
  const results = [];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const path of paths) {
      const value = readValueAtPath(source, path);
      if (value === null || value === undefined) continue;
      const candidate = readNumberCandidate(value);
      if (candidate.found) results.push(candidate.value);
    }
  }
  return results;
};

const collectPaymentEntries = (...candidates) => {
  const out = [];
  const enqueueEntries = (item) => {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) {
      item.forEach(enqueueEntries);
      return;
    }
    if ("payments" in item && Array.isArray(item.payments)) {
      enqueueEntries(item.payments);
    }
    if ("paymentSplit" in item && Array.isArray(item.paymentSplit)) {
      item.paymentSplit.forEach((entry) => {
        if (entry && typeof entry === "object") out.push(entry);
      });
    }
    if ("paymentDetails" in item && Array.isArray(item.paymentDetails)) {
      enqueueEntries(item.paymentDetails);
    }
    if (!("payments" in item) && !("paymentSplit" in item) && !("paymentDetails" in item)) {
      out.push(item);
    }
  };

  candidates.forEach((source) => {
    if (!source) return;
    if (Array.isArray(source)) {
      source.forEach(enqueueEntries);
      return;
    }
    if (typeof source === "string") {
      try {
        const parsed = JSON.parse(source);
        enqueueEntries(parsed);
      } catch {
        return;
      }
      return;
    }
    enqueueEntries(source);
  });
  return out;
};

const derivePaymentTotalsFromRow = ({ payload, values, rawPayload }) => {
  const rawVals = values || {};
  const candidatePayments = collectPaymentEntries(
    payload?.payments,
    rawVals.payments,
    rawVals.paymentDetails,
    payload?.paymentSplit,
    rawVals.paymentSplit,
    rawPayload?.payments,
    rawPayload?.paymentSplit,
    rawPayload?.paymentDetails
  );
  const sums = { cash: 0, online: 0, total: 0 };
  candidatePayments.forEach((entry) => {
    const amount = safePositiveNumber(entry?.amount);
    if (amount === null) return;
    const mode = String(entry?.mode || "").trim().toLowerCase();
    if (mode === "cash") sums.cash += amount;
    else if (mode === "online") sums.online += amount;
    sums.total += amount;
  });
  const totalDpCandidate =
    safePositiveNumber(payload?.dp?.totalDp) ??
    safePositiveNumber(payload?.totalDp) ??
    safePositiveNumber(payload?.downPayment) ??
    safePositiveNumber(rawVals.totalDp) ??
    safePositiveNumber(rawVals.downPayment) ??
    safePositiveNumber(rawPayload?.dp?.totalDp) ??
    safePositiveNumber(rawPayload?.totalDp) ??
    safePositiveNumber(rawPayload?.downPayment);
  const hasTotalDp = totalDpCandidate !== null;
  const totalDpValue = hasTotalDp ? totalDpCandidate : 0;
  const balancedDpValue = Math.max(0, totalDpValue - sums.total);
  return {
    cashCollected: sums.cash,
    onlineCollected: sums.online,
    totalCollected: sums.total,
    totalDp: totalDpValue,
    balancedDp: balancedDpValue,
    hasTotals: hasTotalDp,
  };
};

const getPurchaseTypeFromRow = (row) => {
  const payload = row?.payload || {};
  const values = row?.values || {};
  const valueKeys = [
    "purchaseMode",
    "purchase_mode",
    "purchase type",
    "Purchase Mode",
    "Purchase_Mode",
    "Purchase Type",
    "paymentMode",
    "payment_mode",
    "Payment Mode",
    "Payment Type",
    "paymentType",
    "payment_type",
  ];
  const candidates = [
    payload.purchaseMode,
    payload.purchaseType,
    payload.paymentType,
    ...valueKeys.map((key) => values[key]),
  ];
  const found = candidates.find((c) => typeof c === "string" && c.trim());
  return String(found || "cash").trim().toLowerCase();
};

const isFinancedPurchaseType = (type) => {
  if (!type) return false;
  const normalized = String(type).trim().toLowerCase();
  return ["loan", "nohp", "hp", "finance"].includes(normalized);
};

const computePendingBalance = ({ payload = {}, values = {}, rawPayload = null, purchaseType } = {}) => {
  if (!payload || typeof payload !== "object") {
    return { pendingAmount: null, pendingLabel: "" };
  }
  const rawObj =
    extractRawPayloadObject(
      rawPayload,
      values?.rawPayload,
      values?.["Raw Payload"],
      payload?.rawPayload,
      payload?.["Raw Payload"]
    ) || {};

  const bookingAmount =
    [
      parseMoneyValue(payload?.bookingAmount),
      parseMoneyValue(values?.["Booking Amount"]),
      parseMoneyValue(values?.bookingAmount),
      parseMoneyValue(values?.["Booking_Amount"]),
      parseMoneyValue(rawObj?.bookingAmount),
    ].find((v) => v > 0) ?? 0;

  const totalVehicleCost =
    [
      parseMoneyValue(rawObj?.totalVehicleCost),
      parseMoneyValue(rawObj?.cash?.totalVehicleCost),
      parseMoneyValue(rawObj?.cash?.onRoadPrice),
      parseMoneyValue(payload?.totalVehicleCost),
      parseMoneyValue(payload?.onRoadPrice),
      parseMoneyValue(values?.["Total Vehicle Cost"]),
      parseMoneyValue(values?.["On Road Price"]),
    ].find((v) => v > 0) ?? 0;

  const totalDpDirect =
    [
      parseMoneyValue(rawObj?.totalDp),
      parseMoneyValue(rawObj?.dp?.totalDp),
      parseMoneyValue(payload?.totalDp),
      parseMoneyValue(payload?.dp?.totalDp),
      parseMoneyValue(values?.["Total DP"]),
    ].find((v) => v > 0) ?? 0;
  const totalDpCalculated = (
    parseMoneyValue(rawObj?.downPayment || payload?.downPayment || values?.["Down Payment"]) +
    parseMoneyValue(rawObj?.extraFittingAmount || payload?.extraFittingAmount || values?.["Extra Fitting Amount"]) +
    parseMoneyValue(rawObj?.affidavitCharges || payload?.affidavitCharges || values?.["Affidavit Charges"])
  );
  const totalDp = totalDpDirect || totalDpCalculated || 0;

  const normalizedPurchaseType = String(
    purchaseType ||
    payload?.purchaseMode ||
    values?.["Purchase Mode"] ||
    rawObj?.purchaseMode ||
    "cash"
  ).trim().toLowerCase();
  const isFinanced = ["loan", "nohp", "hp", "finance"].includes(normalizedPurchaseType);
  const label = isFinanced ? "Balanced DP" : "Balance Amount";
  const baseAmount = isFinanced ? totalDp - bookingAmount : totalVehicleCost - bookingAmount;
  const pending = Math.max(0, Number.isFinite(baseAmount) ? baseAmount : 0);
  return { pendingAmount: pending, pendingLabel: label };
};

const FINANCED_BALANCE_PATHS = [
  ["dp", "balancedDp"],
  ["dp", "balanceTP"],
  ["dp", "balanceTPIC"],
  ["balanceTP"],
  ["balancedDp"],
  ["balance"],
];

const CASH_BALANCE_PATHS = [
  ["balancedAmount"],
  ["balanceAmount"],
  ["cash", "balancedAmount"],
  ["balance"],
  ["dp", "balancedDp"],
];

const VEHICLE_COST_PATHS = [
  ["cash", "totalVehicleCost"],
  ["cash", "onRoadPrice"],
  ["cash", "price"],
  ["vehicle", "totalVehicleCost"],
  ["vehicle", "onRoadPrice"],
  ["vehicle", "price"],
  ["totalVehicleCost"],
  ["onRoadPrice"],
  ["price"],
];

const computeBookingBalance = ({ payload = {}, values = {}, rawPayload = null }) => {
  const sources = [];
  if (payload && typeof payload === "object") sources.push(payload);
  if (values && typeof values === "object") sources.push(values);
  if (rawPayload) {
    const parsed = parseJsonValue(rawPayload);
    if (parsed && typeof parsed === "object") sources.push(parsed);
  }
  const rowForType = { payload, values };
  const financedPurchase = isFinancedPurchaseType(
    getPurchaseTypeFromRow(rowForType)
  );
  const derivedTotals = derivePaymentTotalsFromRow({
    payload,
    values,
    rawPayload,
  });
  const pendingInfo = computePendingBalance({
    payload,
    values,
    rawPayload,
    purchaseType: getPurchaseTypeFromRow(rowForType),
  });

  const cashCandidates = scanPathsForNumbers(
    sources,
    CASH_BALANCE_PATHS
  );
  const dpCandidates = scanPathsForNumbers(
    sources,
    FINANCED_BALANCE_PATHS
  );
  const vehicleCostCandidates = scanPathsForNumbers(
    sources,
    VEHICLE_COST_PATHS
  );
  const totalCollectedFromTotals = Number.isFinite(derivedTotals.totalCollected)
    ? derivedTotals.totalCollected
    : 0;
  const totalVehicleCost = vehicleCostCandidates.length
    ? Math.max(...vehicleCostCandidates)
    : null;
  const cashBalanceFromTotals =
    totalVehicleCost !== null
      ? Math.max(0, totalVehicleCost - totalCollectedFromTotals)
      : null;
  const cashValue =
    getNumberValue(payload?.cash?.balancedAmount) ??
    getNumberValue(payload?.balancedAmount) ??
    getNumberValue(values?.balancedAmount) ??
    getNumberValue(values?.balanceAmount) ??
    (cashCandidates.length ? Math.max(...cashCandidates) : null) ??
    (cashBalanceFromTotals !== null ? cashBalanceFromTotals : null);
  const dpValue =
    getNumberValue(payload?.dp?.balancedDp) ??
    getNumberValue(payload?.balancedDp) ??
    getNumberValue(values?.balancedDp) ??
    (dpCandidates.length ? Math.max(...dpCandidates) : null) ??
    (derivedTotals.hasTotals ? derivedTotals.balancedDp : null);

  const computedBalanceValue = Number.isFinite(pendingInfo?.pendingAmount)
    ? pendingInfo.pendingAmount
    : null;
  const computedBalanceLabel = pendingInfo?.pendingLabel || "";
  const balanceValue =
    computedBalanceValue !== null
      ? computedBalanceValue
      : financedPurchase && dpValue !== null
        ? dpValue
        : cashValue;
  const balanceLabel =
    computedBalanceLabel ||
    (financedPurchase && balanceValue !== null ? "Balanced DP" : "Balanced Amount");

  return { balanceValue: Number(balanceValue || 0), balanceLabel };
};

// Local helpers
function formatShortDate(raw){
  try {
    if (!raw) return '';
    const d = raw instanceof Date ? raw : new Date(String(raw));
    if (Number.isNaN(d.getTime())) return String(raw);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `${day}-${m}-${y} ${hh}:${mm}`;
  } catch { return String(raw||''); }
}
