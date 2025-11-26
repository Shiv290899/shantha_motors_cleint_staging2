import React, { useEffect, useMemo, useState } from 'react';
import { Card, Space, Typography, message, Button, Divider, Tag, Tooltip, Progress } from 'antd';
import { saveJobcardViaWebhook } from '../apiCalls/forms';

const { Text } = Typography;

export default function StaffAccountCard() {
  const DEFAULT_JC_URL = 'https://script.google.com/macros/s/AKfycbzhUcfXt2RA4sxKedNxpiJNwbzygmuDQxt-r5oYyZyJuMZDw3o4sRl-lO2pSPS_ijugGA/exec';
  const GAS_URL = import.meta.env.VITE_JOBCARD_GAS_URL || DEFAULT_JC_URL;
  const SECRET = import.meta.env.VITE_JOBCARD_GAS_SECRET || '';

  const [data, setData] = useState({ bookingAmountPending:0, jcAmountPending:0, minorSalesAmountPending:0, totalPending:0 });
  const [loading, setLoading] = useState(false);

  const readUser = () => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } };
  const me = readUser();
  const branch = me?.formDefaults?.branchName || me?.primaryBranch?.name || '';
  const staff = me?.formDefaults?.staffName || me?.name || '';

  const load = async () => {
    if (!GAS_URL || !branch || !staff) return;
    setLoading(true);
    try {
      const payload = SECRET ? { action:'staff_collection_summary', branch, staff, secret: SECRET } : { action:'staff_collection_summary', branch, staff };
      const resp = await saveJobcardViaWebhook({ webhookUrl: GAS_URL, method:'GET', payload });
      const js = resp?.data || resp || {};
      if (!js?.success) throw new Error('Failed');
      const payloadData = js?.data && typeof js.data === 'object' ? js.data : js;
      setData(payloadData);
    } catch { message.error('Could not load account summary'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [GAS_URL]);

  const formatINR = (v) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(v || 0));

  // Derive cash vs online safely, with multiple possible field names supported
  const totals = useMemo(() => {
    const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
    let total = num(data.totalPending ?? data.total ?? 0); // C (collected today)
    const cash = num(
      data.cashPending ?? data.cashAmountPending ?? data.cash ?? data.cashAmount ?? 0
    );
    // If API didn't send online explicitly, derive it
    const onlineRaw = data.onlinePending ?? data.onlineAmountPending ?? data.online ?? data.onlineAmount;
    let online = num(onlineRaw);
    if (!onlineRaw && total && cash >= 0) {
      online = Math.max(0, total - cash);
    }
    // If webhook's total is missing or inconsistent, prefer cash+online
    const sumCO = cash + online;
    if (!total || Math.abs(total - sumCO) > 0) {
      total = sumCO;
    }
    const booking = num(data.bookingAmountPending ?? data.bookingAmount ?? 0);
    const minor = num(data.minorSalesAmountPending ?? data.minorSalesAmount ?? 0);
    const jcSales = num(data.jcAmountPending ?? data.jcAmount ?? 0);
    const salesSum = booking + minor + jcSales; // S (today's sales)
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
    if (!pending) pending = Math.max(0, salesSum - total);
    const cashToHandOver = pending; // show S - C in the card
    return {
      total, // C
      cash: cashToHandOver,
      online,
      // Breakdowns (prefer collected JC; others already represent collected amounts)
      jc: jcCollected || jcSales,
      booking,
      minor,
      settlementDone: Boolean(data.settlementDone),
      lastSettledAt: data.lastSettledAt || data.lastSettlementAt || undefined,
      pending,
      sales: salesSum, // S
    };
  }, [data]);

  const Item = ({ label, value, subtle }) => (
    <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap: 6, opacity: subtle ? 0.9 : 1 }}>
      <Text type={subtle ? 'secondary' : undefined}>{label}</Text>
      <Text strong>₹ {formatINR(value)}</Text>
    </div>
  );

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
              <Tag color='green'>Cash</Tag>
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
              <Tag color='blue'>Online</Tag>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>₹ {formatINR(totals.online)}</div>
            <Text type='secondary' style={{ fontSize: 12 }}>Shown for record, not handed over</Text>
          </div>
        </div>

        <div style={{ paddingTop: 6 }}>
          <Text strong>Today’s Sales</Text>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:12 }}>
            <Progress percent={
              totals.sales ? Math.round(((totals.total || 0) / (totals.sales || 1)) * 100) : 0
            } showInfo={false} strokeColor={{ from: '#52c41a', to: '#2f54eb' }} />
            <Text style={{ fontSize: 18, fontWeight: 700 }}>₹ {formatINR(totals.sales)}</Text>
          </div>
          <Text type='secondary' style={{ fontSize: 12 }}>Collected today: ₹ {formatINR(totals.total)} • Pending today: ₹ {formatINR(totals.pending)}</Text>
        </div>

        <Divider style={{ margin: '8px 0' }} />
        <Text type='secondary' style={{ fontSize: 12 }}>Breakdown</Text>
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
    </Card>
  );
}
