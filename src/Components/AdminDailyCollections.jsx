import React, { useEffect, useMemo, useState } from 'react';
import { Table, Space, Button, Select, DatePicker, message, Tag, Segmented, InputNumber, Tooltip, Modal, Radio } from 'antd';
import dayjs from 'dayjs';
import { saveJobcardViaWebhook } from '../apiCalls/forms';

export default function AdminDailyCollections() {
  const DEFAULT_JC_URL = 'https://script.google.com/macros/s/AKfycbzhUcfXt2RA4sxKedNxpiJNwbzygmuDQxt-r5oYyZyJuMZDw3o4sRl-lO2pSPS_ijugGA/exec';
  const GAS_URL = import.meta.env.VITE_JOBCARD_GAS_URL || DEFAULT_JC_URL;
  const SECRET = import.meta.env.VITE_JOBCARD_GAS_SECRET || '';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  // Multi-branch filter (same UX as staff filter)
  const [branchFilter, setBranchFilter] = useState([]); // [] = all branches
  const [date, setDate] = useState(dayjs());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('all'); // all | pending | settled
  const [staffFilter, setStaffFilter] = useState([]); // [] = all
  // Collect modal state
  const [collectOpen, setCollectOpen] = useState(false);
  const [collectRow, setCollectRow] = useState(null);
  const [collectMode, setCollectMode] = useState('partial'); // partial | full
  const [collectAmt, setCollectAmt] = useState(0);
  
  
  const norm = (s) => String(s || '').trim().toLowerCase();

  const fetchRows = async () => {
    if (!GAS_URL) { message.error('Job Card GAS URL not configured'); return; }
    setLoading(true);
    try {
      // Helper: fetch and compact a single date
      const fetchOne = async (isoDate) => {
        const branchForFetch = Array.isArray(branchFilter) && branchFilter.length === 1 ? branchFilter[0] : '';
        const payload = SECRET
          ? { action:'collections', branch: branchForFetch, date: isoDate, page, pageSize, secret: SECRET }
          : { action:'collections', branch: branchForFetch, date: isoDate, page, pageSize };
        const resp = await saveJobcardViaWebhook({ webhookUrl: GAS_URL, method:'GET', payload });
        const js = resp?.data || resp || {};
        const list = Array.isArray(js.data) ? js.data : (Array.isArray(js.rows) ? js.rows : []);
        const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
        const grouped = new Map();
        list.forEach((r) => {
          const d = r.date || r.Date || isoDate;
          const b = r.branch || r.Branch || '';
          const s = r.staff || r.Staff || '';
          const key = `${d}|${norm(b)}|${norm(s)}`;
          const g = grouped.get(key) || {
            date: d,
            branch: b,
            staff: s,
            bookingAmount: 0,
            jcAmount: 0,
            minorSalesAmount: 0,
            cashAmount: 0,
            onlineAmount: 0,
            total: 0,
            collectedToday: 0,
            settlementDone: true,
            lastSettledAt: r.lastSettledAt || r.lastSettlementAt || r.settlementAt || undefined,
          };
          g.bookingAmount += num(r.bookingAmount ?? r.booking ?? r.bookingPending ?? 0);
          g.jcAmount += num(r.jcAmount ?? r.jc ?? r.jcPending ?? 0);
          g.minorSalesAmount += num(r.minorSalesAmount ?? r.minor ?? r.minorPending ?? 0);
          g.cashAmount += num(r.cashAmount ?? r.cash ?? r.cashPending ?? 0);
          g.onlineAmount += num(r.onlineAmount ?? r.online ?? r.onlinePending ?? 0);
          const t = num(r.total ?? r.totalPending ?? 0);
          g.total += t || 0;
          // carry forward collectedToday if provided
          const cToday = num(r.collectedToday ?? r.collected ?? 0);
          if (cToday > (g.collectedToday || 0)) g.collectedToday = cToday;
          const settled = (r.settlementDone === true) || String(r.settlementDone).toLowerCase() === 'true';
          g.settlementDone = g.settlementDone && settled;
          grouped.set(key, g);
        });
        return Array.from(grouped.values()).map((g) => ({ ...g, total: g.cashAmount + g.onlineAmount }));
      };

      const todayIso = date ? date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
      const todayRows = await fetchOne(todayIso);
      setRows(todayRows);
      setTotal(todayRows.length);
      // Preload previous day's rows for Opening computation
      try {
        const prevIso = dayjs(todayIso).subtract(1, 'day').format('YYYY-MM-DD');
        const prevRows = await fetchOne(prevIso);
        (window.__DC_PREV__ = window.__DC_PREV__ || new Map()).set(prevIso, prevRows);
      } catch { /* ignore */ }
    } catch  {
      message.error('Load failed');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchRows(); /* eslint-disable-next-line */ }, [branchFilter, date, page, pageSize]);

  // Build staff + branch lists for filters (dynamic from data)
  const staffOptions = Array.from(new Set(rows.map(r => (r.staff || '').toString()))).map(s => ({ value: s, label: s || '(Unknown)' }));
  const branchOptions = Array.from(new Set(rows.map(r => (r.branch || '').toString()))).map(b => ({ value: b, label: b || '(Unknown)' }));

  // Filter rows for display (base)
  const visibleBase = rows.filter((r) => {
    if (Array.isArray(branchFilter) && branchFilter.length) {
      if (!branchFilter.includes(String(r.branch || ''))) return false;
    }
    if (status !== 'all') {
      const ok = Boolean(r.settlementDone);
      if (status === 'pending' && ok) return false;
      if (status === 'settled' && !ok) return false;
    }
    if (staffFilter && staffFilter.length && !staffFilter.includes(r.staff)) return false;
    return true;
  });

  // Compute Opening/Due/Closing using previous day's closing (client-side helper)
  const visibleRows = useMemo(() => {
    const todayIso = date ? date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
    const prevIso = dayjs(todayIso).subtract(1, 'day').format('YYYY-MM-DD');
    const prevList = (window.__DC_PREV__ && window.__DC_PREV__.get(prevIso)) || [];
    const normKey = (b,s) => `${String(b||'').trim().toLowerCase()}|${String(s||'').trim().toLowerCase()}`;
    const prevClose = new Map();
    prevList.forEach(r => {
      const key = normKey(r.branch, r.staff);
      const close = Number(r.closingBalance ?? r.closing ?? r.closingAmount ?? 0) || 0;
      if (!prevClose.has(key)) prevClose.set(key, close);
    });
    return visibleBase.map(r => {
      const key = normKey(r.branch, r.staff);
      const opening = Number(r.openingBalance ?? r.opening ?? prevClose.get(key) ?? 0) || 0;
      const dueToday = (Number(r.bookingAmount || r.booking || 0) || 0)
        + (Number(r.jcAmount || r.jc || 0) || 0)
        + (Number(r.minorSalesAmount || r.minor || 0) || 0);
      const collectedToday = Number(r.collectedToday ?? r.collected ?? 0) || 0;
      const closing = Number(r.closingBalance ?? r.closing ?? (opening + dueToday - collectedToday)) || 0;
      const toCollect = opening + dueToday;
      return { ...r, opening, dueToday, collectedToday, closing, toCollect };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleBase, date]);

  // Aggregate across visible rows (branch totals)
  const agg = visibleRows.reduce((a, r) => {
    const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
    a.booking += num(r.bookingAmount);
    a.jc += num(r.jcAmount);
    a.minor += num(r.minorSalesAmount);
    // Cash card should show staff handover (Collected Today) where available
    a.cash += (Number.isFinite(Number(r.collectedToday)) ? Number(r.collectedToday) : num(r.cashAmount));
    a.online += num(r.onlineAmount);
    a.total += num(r.total);
    a.opening += num(r.opening);
    a.due += num(r.dueToday);
    a.toCollect = (a.toCollect || 0) + num(r.toCollect);
    a.collected += num(r.collectedToday);
    a.closing += num(r.closing);
    a.pending = (a.pending || 0) + Math.max(0, num(r.closing));
    if (!r.settlementDone) {
      // Pending should reflect outstanding (Closing), not sales cash
      a.pendingCash = (a.pendingCash || 0) + Math.max(0, num(r.closing));
      a.pendingOnline = (a.pendingOnline || 0) + 0; // not tracked separately
    }
    return a;
  }, { booking:0, jc:0, minor:0, cash:0, online:0, total:0, opening:0, due:0, toCollect:0, collected:0, closing:0, pending:0, pendingCash:0, pendingOnline:0 });

  
  const onUpdateCollected = async (r, val) => {
    try {
      const amt = Number(val);
      if (!Number.isFinite(amt) || amt < 0) { message.error('Enter a valid amount'); return; }
      const payload = SECRET
        ? { action:'update_collection', date: r.date, branch: r.branch, staff: r.staff, collectedToday: amt, secret: SECRET }
        : { action:'update_collection', date: r.date, branch: r.branch, staff: r.staff, collectedToday: amt };
      const resp = await saveJobcardViaWebhook({ webhookUrl: GAS_URL, method:'POST', payload });
      const ok = (resp?.data || resp)?.success !== false;
      if (!ok) throw new Error('Failed');
      message.success('Updated');
      fetchRows();
    } catch { message.error('Update failed'); }
  };

  // Open Collect modal for a row
  const openCollect = (row) => {
    setCollectRow(row);
    setCollectMode('partial');
    setCollectAmt(0);
    setCollectOpen(true);
  };

  const handleCollectSave = async () => {
    if (!collectRow) return;
    const r = collectRow;
    const totalToCollect = Number(r.toCollect || 0) || 0;
    const collectedSoFar = Number(r.collectedToday || 0) || 0;
    let nextCollected;
    if (collectMode === 'full') {
      nextCollected = totalToCollect;
    } else {
      const inc = Number(collectAmt || 0) || 0;
      if (!(inc > 0)) { message.error('Enter partial amount'); return; }
      if (inc > Math.max(0, totalToCollect - collectedSoFar)) {
        message.error('Amount exceeds remaining');
        return;
      }
      nextCollected = collectedSoFar + inc;
    }

    await onUpdateCollected(r, nextCollected);
    setCollectOpen(false);
    setCollectRow(null);
  };

  const cols = [
    { title:'Date', dataIndex:'date', key:'date' },
    { title:'Staff', dataIndex:'staff', key:'staff' },
    { title:'Opening', key:'opening', align:'right', render:(_,r)=> (r.opening||0).toLocaleString('en-IN') },
    { title:'Booking', dataIndex:'bookingAmount', key:'booking', align:'right' },
    { title:'JC', dataIndex:'jcAmount', key:'jc', align:'right' },
    { title:'Minor Sales', dataIndex:'minorSalesAmount', key:'minor', align:'right' },
    { title:'Cash', key:'cash', align:'right', render:(_,r)=> {
      const cash = Number(r.cashAmount ?? r.cash ?? r.cashPending ?? 0) || 0;
      return cash.toLocaleString('en-IN');
    } },
    { title:'Online', key:'online', align:'right', render:(_,r)=> {
      const onlineRaw = r.onlineAmount ?? r.online ?? r.onlinePending;
      const online = Number.isFinite(Number(onlineRaw))
        ? Number(onlineRaw)
        : Math.max(0, (Number(r.total || r.totalPending || 0) || 0) - (Number(r.cashAmount ?? r.cash ?? r.cashPending ?? 0) || 0));
      return online.toLocaleString('en-IN');
    } },
    { title:'Total to be Collected', key:'toCollect', align:'right', render:(_,r)=> (r.toCollect||0).toLocaleString('en-IN') },
    { title:'Collected Today', key:'collected', align:'right', render:(_,r)=> (Number(r.collectedToday||0)).toLocaleString('en-IN') },
    { title:'Pending Amount', key:'pending', align:'right', render:(_,r)=> (Math.max(0, Number(r.closing||0))||0).toLocaleString('en-IN') },
    { title:'Status', key:'status', render:(_,r)=> (
      <Tag color={r.settlementDone ? 'green' : 'orange'}>
        {r.settlementDone ? 'Settled' : 'Pending'}
      </Tag>
    )},
    { title:'Action', key:'act', render:(_,r)=> (
      <Button size='small' onClick={()=>openCollect(r)}>Collect</Button>
    )},
  ];

  return (
    <div>
      <Space style={{ marginBottom: 12, width:'100%', justifyContent:'space-between', flexWrap:'wrap' }}>
        <Space wrap>
          <Select
            mode='multiple'
            allowClear
            placeholder='Branches'
            value={branchFilter}
            onChange={setBranchFilter}
            style={{ minWidth: 220 }}
            options={branchOptions}
          />
          <DatePicker value={date} onChange={setDate} />
          <Segmented
            value={status}
            onChange={setStatus}
            options={[{label:'All', value:'all'}, {label:'Pending', value:'pending'}, {label:'Settled', value:'settled'}]}
          />
          <Select
            mode='multiple'
            allowClear
            placeholder='Staff'
            value={staffFilter}
            onChange={setStaffFilter}
            style={{ minWidth: 220 }}
            options={staffOptions}
          />
        </Space>
        <Space>
          <Button onClick={fetchRows} loading={loading}>Refresh</Button>
        </Space>
      </Space>

      {/* Summary cards for current filter */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(8, 1fr)', gap:12, marginBottom:12 }}>
        <div style={{padding:12,borderRadius:10,background:'linear-gradient(135deg,#e0f7fa,#b2ebf2)'}}>
          <div style={{fontSize:12,opacity:0.8}}>Staff</div>
          <div style={{fontSize:22,fontWeight:800}}>{visibleRows.length}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:'linear-gradient(135deg,#f1f8e9,#dcedc8)'}}>
          <div style={{fontSize:12,opacity:0.8}}>Booking</div>
          <div style={{fontSize:22,fontWeight:800}}>{agg.booking.toLocaleString('en-IN')}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:'linear-gradient(135deg,#fff3e0,#ffe0b2)'}}>
          <div style={{fontSize:12,opacity:0.8}}>Job Cards</div>
          <div style={{fontSize:22,fontWeight:800}}>{agg.jc.toLocaleString('en-IN')}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:'linear-gradient(135deg,#f3e5f5,#e1bee7)'}}>
          <div style={{fontSize:12,opacity:0.8}}>Minor Sales</div>
          <div style={{fontSize:22,fontWeight:800}}>{agg.minor.toLocaleString('en-IN')}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:'linear-gradient(135deg,#e8f5e9,#c8e6c9)'}}>
          <div style={{fontSize:12,opacity:0.8}}>Cash</div>
          <div style={{fontSize:22,fontWeight:800}}>{agg.cash.toLocaleString('en-IN')}</div>
          <div style={{fontSize:11,opacity:0.8}}>Pending: {agg.pendingCash.toLocaleString('en-IN')}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:'linear-gradient(135deg,#e3f2fd,#bbdefb)'}}>
          <div style={{fontSize:12,opacity:0.8}}>Online</div>
          <div style={{fontSize:22,fontWeight:800}}>{agg.online.toLocaleString('en-IN')}</div>
          <div style={{fontSize:11,opacity:0.8}}>Pending: {agg.pendingOnline.toLocaleString('en-IN')}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:'linear-gradient(135deg,#fff3e0,#ffe0b2)'}}>
          <div style={{fontSize:12,opacity:0.8}}>Collected Today</div>
          <div style={{fontSize:22,fontWeight:800}}>{agg.collected.toLocaleString('en-IN')}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:'linear-gradient(135deg,#ffebee,#ffcdd2)'}}>
          <div style={{fontSize:12,opacity:0.8}}>Pending</div>
          <div style={{fontSize:22,fontWeight:800}}>{agg.pending.toLocaleString('en-IN')}</div>
        </div>
      </div>

      <Table
        rowKey={(r)=>`${r.date}-${r.branch}-${r.staff}`}
        dataSource={visibleRows}
        columns={cols}
        loading={loading}
        pagination={{
          current: page, pageSize, total,
          showSizeChanger: true,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={2}><strong>{(branchFilter && branchFilter.length ? branchFilter.join(', ') : 'All Branches')} Total</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={2} align='right'><strong>{agg.opening.toLocaleString('en-IN')}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={3} align='right'><strong>{agg.booking.toLocaleString('en-IN')}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={4} align='right'><strong>{agg.jc.toLocaleString('en-IN')}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={5} align='right'><strong>{agg.minor.toLocaleString('en-IN')}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={6} align='right'><strong>{agg.cash.toLocaleString('en-IN')}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={7} align='right'><strong>{agg.online.toLocaleString('en-IN')}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={8} align='right'><strong>{agg.toCollect.toLocaleString('en-IN')}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={9} align='right'><strong>{agg.collected.toLocaleString('en-IN')}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={10} align='right'><strong>{agg.pending.toLocaleString('en-IN')}</strong></Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />

      {/* Collect Modal */}
      <Modal
        open={collectOpen}
        title="Collect"
        onCancel={()=>{ setCollectOpen(false); setCollectRow(null); }}
        onOk={handleCollectSave}
        okText="Save"
      >
        {collectRow ? (
          <div style={{ display:'grid', gap: 10 }}>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap', fontSize:13 }}>
              <div><strong>Date:</strong> {collectRow.date}</div>
              <div><strong>Staff:</strong> {collectRow.staff}</div>
              <div><strong>Branch:</strong> {collectRow.branch}</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div><div style={{opacity:0.7}}>Total to be collected</div><div style={{fontWeight:700}}>₹ {(collectRow.toCollect||0).toLocaleString('en-IN')}</div></div>
              <div><div style={{opacity:0.7}}>Collected so far</div><div style={{fontWeight:700}}>₹ {(collectRow.collectedToday||0).toLocaleString('en-IN')}</div></div>
            </div>
            <Radio.Group value={collectMode} onChange={(e)=>setCollectMode(e.target.value)}>
              <Radio value='partial'>Partial</Radio>
              <Radio value='full'>Full</Radio>
            </Radio.Group>
            {collectMode === 'partial' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
                <div>
                  <div style={{opacity:0.7, marginBottom:4}}>Enter amount</div>
                  <InputNumber min={0} value={collectAmt} onChange={(v)=>setCollectAmt(Number(v||0))} style={{ width:'100%' }} />
                </div>
                <div>
                  <div style={{opacity:0.7}}>Pending after save</div>
                  <div style={{fontWeight:700}}>₹ {Math.max(0, Number((collectRow.toCollect||0) - (Number(collectRow.collectedToday||0) + Number(collectAmt||0)))).toLocaleString('en-IN')}</div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
