import React, { useEffect, useMemo, useState } from 'react';
import { Card, Space, Typography, message, Button, Divider, Tag, Tooltip, Progress, Modal, Table } from 'antd';
import { saveJobcardViaWebhook } from '../apiCalls/forms';

const { Text } = Typography;

export default function StaffAccountCard() {
  const DEFAULT_JC_URL = 'https://script.google.com/macros/s/AKfycby1vN6naQNj8k_sRNLwUQoD_vX1rbAhrpT5bJk0FgyuYuS27Zj_5i_DVXzyWPsttrInzQ/exec';
  const GAS_URL = import.meta.env.VITE_JOBCARD_GAS_URL || DEFAULT_JC_URL;
  const SECRET = import.meta.env.VITE_JOBCARD_GAS_SECRET || '';

  const [data, setData] = useState({ bookingAmountPending:0, jcAmountPending:0, minorSalesAmountPending:0, totalPending:0 });
  const [loading, setLoading] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [txMode, setTxMode] = useState('cash'); // 'cash' | 'online'
  const [txRows, setTxRows] = useState([]);

  const readUser = () => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } };
  const me = readUser();
  const branch = me?.formDefaults?.branchName || me?.primaryBranch?.name || '';
  const staff = me?.formDefaults?.staffName || me?.name || '';

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
      };

      // Also fetch transactions to compute per-source breakdown from ledger
      try {
        const all = await fetchLedgerTransactions({ GAS_URL, SECRET, branch, staff, mode: 'all' });
        const sums = all.reduce((a, r) => {
          const t = String(r.sourceType||'').toLowerCase();
          const amt = (Number(r.cashPending||0)||0) + (Number(r.onlinePending||0)||0);
          if (t === 'booking') a.booking += amt;
          else if (t === 'jc') a.jc += amt;
          else if (t === 'minorsales') a.minor += amt;
          else a.other += amt;
          return a;
        }, { booking:0, jc:0, minor:0, other:0 });
        setData({ ...base, bookingAmount: sums.booking, jcAmount: sums.jc, minorSalesAmount: sums.minor });
      } catch {
        setData(base);
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
    const opening = num(data.openingBalance ?? data.opening ?? 0); // carry forward (previous unsettled)
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
    const base = {
      total, // C
      cash: cashToHandOver,
      online,
      // Breakdowns (prefer collected JC; others already represent collected amounts)
      jc: jcCollected || jcSales,
      booking,
      minor,
      prevDue: opening,
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
        jc: 0,
        booking: 0,
        minor: 0,
        prevDue: 0,
        settlementDone: true,
        lastSettledAt: base.lastSettledAt,
        pending: 0,
        pendingAll: 0,
        sales: 0,
      };
    }
    return base;
  }, [data]);

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
      const rows = await fetchLedgerTransactions({ GAS_URL, SECRET, branch, staff, mode });
      setTxRows(rows);
    } catch { message.error('Could not load transactions'); }
  };

  return (
    <Card
      size='small'
      loading={loading}
      title='Account Summary'
      style={{ maxWidth: 520 }}
      extra={<Button size='small' onClick={load} disabled={loading}>Refresh</Button>}
    >
      <Space direction='vertical' style={{ width: '100%' }}>
        <div style={{
          display:'grid',
          gridTemplateColumns:'1fr 1fr',
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
          <Text strong>Today’s Sales</Text>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:12 }}>
            <Progress percent={
              (() => { const base = (totals.sales || 0) + (totals.prevDue || 0); return base ? Math.round(((totals.total || 0) / base) * 100) : 0; })()
            } showInfo={false} strokeColor={{ from: '#52c41a', to: '#2f54eb' }} />
            <Text style={{ fontSize: 18, fontWeight: 700 }}>₹ {formatINR(totals.sales)}</Text>
          </div>
          <Text type='secondary' style={{ fontSize: 12 }}>
            Collected: ₹ {formatINR(totals.total)} • Pending today: ₹ {formatINR(totals.pending)} • Previous due: ₹ {formatINR(totals.prevDue)} • Pending (total): ₹ {formatINR(totals.pendingAll)}
          </Text>
        </div>

        <Divider style={{ margin: '8px 0' }} />
        <Text type='secondary' style={{ fontSize: 12 }}>Breakdown</Text>
        <Item label='Previous Due (carry forward)' value={totals.prevDue} subtle />
        <Item label='From Job Cards' value={totals.jc} subtle />
        <Item label='From Bookings' value={totals.booking} subtle />
        <Item label='From Minor Sales' value={totals.minor} subtle />

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
        width={800}
      >
        <Table
          size='small'
          rowKey={(r)=>`${r.dateTimeIso}-${r.sourceType}-${r.sourceId}`}
          dataSource={txRows}
          columns={[
            { title:'Date', dataIndex:'date', key:'date' },
            { title:'Customer', dataIndex:'customerName', key:'customer' },
            { title:'Mobile', dataIndex:'customerMobile', key:'mobile' },
            { title:'Source', key:'src', render:(_,r)=> `${String(r.sourceType||'').toUpperCase()} ${r.sourceId||''}` },
            { title:'Amount', key:'amt', align:'right', render:(_,r)=> (txMode==='cash' ? r.cashPending : r.onlinePending).toLocaleString('en-IN') },
            { title:'UTR', dataIndex:'utr', key:'utr' },
          ]}
          pagination={{ pageSize: 10 }}
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
