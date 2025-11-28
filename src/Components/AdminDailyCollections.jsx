import React, { useEffect, useMemo, useState } from 'react';
import { Table, Space, Button, Select, message, Segmented } from 'antd';

import { saveJobcardViaWebhook } from '../apiCalls/forms';

export default function AdminDailyCollections() {
  const DEFAULT_JC_URL = 'https://script.google.com/macros/s/AKfycby1vN6naQNj8k_sRNLwUQoD_vX1rbAhrpT5bJk0FgyuYuS27Zj_5i_DVXzyWPsttrInzQ/exec';
  const GAS_URL = import.meta.env.VITE_JOBCARD_GAS_URL || DEFAULT_JC_URL;
  const SECRET = import.meta.env.VITE_JOBCARD_GAS_SECRET || '';

  // DailyCollections (date-based) removed; only StaffLedger is used
  const [viewMode, setViewMode] = useState('summary'); // 'summary' | 'transactions'
  // Ledger view state
  const [ledgerRows, setLedgerRows] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerStatus, setLedgerStatus] = useState('unsettled'); // unsettled | settled | all
  const [selectedKeys, setSelectedKeys] = useState([]);
  // Multi-branch filter (same UX as staff filter)
  const [branchFilter, setBranchFilter] = useState([]); // [] = all branches
  // No date pagination/total when using ledger-only summary
  const [staffFilter, setStaffFilter] = useState([]); // [] = all
  

  // (Removed legacy DailyCollections date-based fetch)

  const fetchLedger = async () => {
    if (!GAS_URL) { message.error('Job Card GAS URL not configured'); return; }
    setLedgerLoading(true);
    try {
      // Always fetch full list by status; filter staff/branch client-side for multi-select support
      const payload = SECRET
        ? { action:'owner_ledger_list', status: ledgerStatus, secret: SECRET }
        : { action:'owner_ledger_list', status: ledgerStatus };
      const resp = await saveJobcardViaWebhook({ webhookUrl: GAS_URL, method:'GET', payload });
      const js = resp?.data || resp || {};
      const list = Array.isArray(js.rows) ? js.rows : [];
      setLedgerRows(list);
    } catch { message.error('Failed to load transactions'); }
    finally { setLedgerLoading(false); }
  };

  useEffect(() => {
    fetchLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, JSON.stringify(branchFilter), JSON.stringify(staffFilter), ledgerStatus, GAS_URL]);

  // DailyCollections date-based fetch disabled; working purely from StaffLedger
  // useEffect(() => { fetchRows(); }, []);

  // Build staff + branch lists for filters (dynamic from data)
  const staffOptions = Array.from(new Set(ledgerRows.map(r => (r.staff || '').toString()))).map(s => ({ value: s, label: s || '(Unknown)' }));
  const branchOptions = Array.from(new Set(ledgerRows.map(r => (r.branch || '').toString()))).map(b => ({ value: b, label: b || '(Unknown)' }));

  // (Removed DailyCollections date-based summary calculations)

  
  // (Removed DailyCollections edit/settle helpers)

  // (No DailyCollections columns in ledger-only mode)

  // Ledger table setup
  const ledgerCols = [
    { title:'DateTime', dataIndex:'dateTimeIso', key:'dt' },
    { title:'Branch', dataIndex:'branch', key:'branch' },
    { title:'Staff', dataIndex:'staff', key:'staff' },
    { title:'Source', key:'src', render:(_,r)=> `${String(r.sourceType||'').toUpperCase()} ${r.sourceId||''}` },
    { title:'Customer', dataIndex:'customerName', key:'cust' },
    { title:'Mobile', dataIndex:'customerMobile', key:'mob' },
    { title:'Mode', dataIndex:'paymentMode', key:'mode' },
    { title:'Cash Pending', dataIndex:'cashPending', key:'cp', align:'right', render:(v)=> (Number(v||0)).toLocaleString('en-IN') },
    { title:'Online Pending', dataIndex:'onlinePending', key:'op', align:'right', render:(v)=> (Number(v||0)).toLocaleString('en-IN') },
    { title:'UTR / Ref', dataIndex:'utr', key:'utr' },
    { title:'Action', key:'act', render:(_,r)=> {
      const canCash = Number(r.cashPending||0) > 0;
      const canOn = Number(r.onlinePending||0) > 0;
      return (
        <Space size={6}>
          {canCash ? <Button size='small' onClick={()=>settleRows(['cash'], [r.id])}>Collect</Button> : null}
          {canOn ? <Button size='small' onClick={()=>settleRows(['online'], [r.id])}>Verify</Button> : null}
        </Space>
      );
    } },
  ];

  // Staff-wise aggregation from ledger (client-side filters for multi-select)
  const lc = (s) => String(s||'').trim().toLowerCase();
  const staffAgg = useMemo(() => {
    const wantBranches = new Set((branchFilter||[]).map(lc));
    const wantStaffs = new Set((staffFilter||[]).map(lc));
    const groups = new Map(); // key: branch|staff -> {branch,staff,cash,online}
    (ledgerRows||[]).forEach(r => {
      const b = String(r.branch||'');
      const s = String(r.staff||'');
      if (wantBranches.size && !wantBranches.has(lc(b))) return;
      if (wantStaffs.size && !wantStaffs.has(lc(s))) return;
      const key = `${lc(b)}|${lc(s)}`;
      const g = groups.get(key) || { branch: b, staff: s, cash:0, online:0 };
      g.cash += Number(r.cashPending||0)||0;
      g.online += Number(r.onlinePending||0)||0;
      groups.set(key, g);
    });
    return Array.from(groups.values()).map(g => ({ ...g, total: g.cash + g.online }));
  }, [ledgerRows, branchFilter, staffFilter]);

  const staffAggCols = [
    { title:'Branch', dataIndex:'branch', key:'branch' },
    { title:'Staff', dataIndex:'staff', key:'staff' },
    { title:'Cash Pending', dataIndex:'cash', key:'cash', align:'right', render:(v)=> (Number(v||0)).toLocaleString('en-IN') },
    { title:'Online Pending', dataIndex:'online', key:'online', align:'right', render:(v)=> (Number(v||0)).toLocaleString('en-IN') },
    { title:'Total Pending', dataIndex:'total', key:'total', align:'right', render:(v)=> (Number(v||0)).toLocaleString('en-IN') },
  ];

  const staffAggTotals = useMemo(() => staffAgg.reduce((a,r)=>{
    a.count = (a.count||0) + 1;
    a.cash = (a.cash||0) + (Number(r.cash||0)||0);
    a.online = (a.online||0) + (Number(r.online||0)||0);
    a.total = (a.total||0) + (Number(r.total||0)||0);
    return a;
  }, {}), [staffAgg]);

  const selected = useMemo(() => {
    const set = new Set(selectedKeys);
    const rows = ledgerRows.filter(r => set.has(r.id));
    const cash = rows.reduce((a,r)=>a+(Number(r.cashPending||0)||0), 0);
    const on = rows.reduce((a,r)=>a+(Number(r.onlinePending||0)||0), 0);
    return { cash, online: on };
  }, [selectedKeys, ledgerRows]);

  const settleRows = async (modes, ids) => {
    const mode = modes.includes('cash') && modes.includes('online') ? 'both' : (modes[0] || 'both');
    if (!ids || !ids.length) return;
    try {
      const payload = SECRET
        ? { action:'owner_ledger_settle', mode, ids, secret: SECRET }
        : { action:'owner_ledger_settle', mode, ids };
      const resp = await saveJobcardViaWebhook({ webhookUrl: GAS_URL, method:'POST', payload });
      const ok = (resp?.data || resp)?.success !== false;
      if (!ok) throw new Error('Failed');
      message.success('Updated');
      setSelectedKeys([]);
      fetchLedger();
    } catch { message.error('Update failed'); }
  };

  return (
    <div>
      <Space style={{ marginBottom: 12, width:'100%', justifyContent:'space-between', flexWrap:'wrap' }}>
        <Space wrap>
          <Segmented value={viewMode} onChange={setViewMode} options={[{label:'Summary', value:'summary'},{label:'Transactions', value:'transactions'}]} />
          <Select
            mode='multiple'
            allowClear
            placeholder='Branches'
            value={branchFilter}
            onChange={setBranchFilter}
            style={{ minWidth: 220 }}
            options={branchOptions}
          />
          <Segmented value={ledgerStatus} onChange={setLedgerStatus} options={[{label:'Unsettled', value:'unsettled'},{label:'Settled', value:'settled'},{label:'All', value:'all'}]} />
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
          <Button onClick={fetchLedger} loading={ledgerLoading}>Refresh</Button>
        </Space>
      </Space>
      {viewMode==='summary' ? (
      <>
      {/* Staff-wise (ledger) summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:12, marginBottom:12 }}>
        <div style={{padding:12,borderRadius:10,background:'linear-gradient(135deg,#e0f7fa,#b2ebf2)'}}>
          <div style={{fontSize:12,opacity:0.8}}>Staff</div>
          <div style={{fontSize:22,fontWeight:800}}>{(staffAggTotals.count||0)}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:'linear-gradient(135deg,#e8f5e9,#c8e6c9)'}}>
          <div style={{fontSize:12,opacity:0.8}}>Cash Pending</div>
          <div style={{fontSize:22,fontWeight:800}}>{(Number(staffAggTotals.cash||0)).toLocaleString('en-IN')}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:'linear-gradient(135deg,#e3f2fd,#bbdefb)'}}>
          <div style={{fontSize:12,opacity:0.8}}>Online Pending</div>
          <div style={{fontSize:22,fontWeight:800}}>{(Number(staffAggTotals.online||0)).toLocaleString('en-IN')}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:'linear-gradient(135deg,#fff3e0,#ffe0b2)'}}>
          <div style={{fontSize:12,opacity:0.8}}>Total Pending</div>
          <div style={{fontSize:22,fontWeight:800}}>{(Number(staffAggTotals.total||0)).toLocaleString('en-IN')}</div>
        </div>
      </div>

      <Table
        rowKey={(r)=>`${r.branch}-${r.staff}`}
        dataSource={staffAgg}
        columns={staffAggCols}
        loading={ledgerLoading}
        pagination={{ pageSize: 20 }}
      />
      </>
      ) : (
      <>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
          <div style={{ display:'flex', gap:16, alignItems:'center' }}>
            <div><strong>Selected Cash:</strong> {selected.cash.toLocaleString('en-IN')}</div>
            <div><strong>Selected Online:</strong> {selected.online.toLocaleString('en-IN')}</div>
          </div>
          <Space>
            <Button type='primary' disabled={selected.cash<=0} onClick={()=>settleRows(['cash'], selectedKeys)}>Collect Cash</Button>
            <Button type='primary' disabled={selected.online<=0} onClick={()=>settleRows(['online'], selectedKeys)}>Verify Online</Button>
          </Space>
        </div>
        <Table
          rowKey={(r)=>r.id}
          dataSource={ledgerRows}
          columns={ledgerCols}
          loading={ledgerLoading}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: setSelectedKeys
          }}
          pagination={{ pageSize: 20 }}
        />
      </>
      )}

      {/* No DailyCollections modal in ledger-only mode */}
    </div>
  );
}
