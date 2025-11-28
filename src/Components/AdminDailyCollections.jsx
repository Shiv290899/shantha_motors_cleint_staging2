import React, { useEffect, useMemo, useState } from 'react';
import { Table, Space, Button, Select, message, Segmented } from 'antd';

import { saveJobcardViaWebhook } from '../apiCalls/forms';

export default function AdminDailyCollections() {
  const DEFAULT_JC_URL = 'https://script.google.com/macros/s/AKfycbwsL1cOyLa_Rpf-YvlGxWG9v6dNt6-YqeX_-L2IZpmKoy6bQT5LrEeTmDrR5XYjVVb1Mg/exec';
  const GAS_URL = import.meta.env.VITE_JOBCARD_GAS_URL || DEFAULT_JC_URL;
  const SECRET = import.meta.env.VITE_JOBCARD_GAS_SECRET || '';

  // DailyCollections (date-based) removed; only StaffLedger is used
  const [viewMode, setViewMode] = useState('summary'); // 'summary' | 'transactions'
  // Ledger view state
  const [ledgerRows, setLedgerRows] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerStatus, setLedgerStatus] = useState('unsettled'); // unsettled | settled | all
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [hasCache, setHasCache] = useState(false);
  // Multi-branch filter (same UX as staff filter)
  const [branchFilter, setBranchFilter] = useState([]); // [] = all branches
  // No date pagination/total when using ledger-only summary
  const [staffFilter, setStaffFilter] = useState([]); // [] = all
  // Per-row/bulk action spinners
  const [rowBusy, setRowBusy] = useState({});
  const [bulkBusyMode, setBulkBusyMode] = useState(''); // '' | 'cash' | 'online'
  

  // (Removed legacy DailyCollections date-based fetch)

  const CACHE_KEY = (status) => `OwnerLedger:list:${String(status||'unsettled')}`;

  // Seed from cache for instant UI
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY(ledgerStatus));
      if (!raw) { setHasCache(false); return; }
      const cached = JSON.parse(raw);
      if (cached && Array.isArray(cached.rows)) {
        setLedgerRows(cached.rows);
        setHasCache(true);
      } else { setHasCache(false); }
    } catch { setHasCache(false); }
  }, [ledgerStatus]);

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
      try { localStorage.setItem(CACHE_KEY(ledgerStatus), JSON.stringify({ at: Date.now(), rows: list })); } catch {
        //sdhjv
      }
      setHasCache(true);
    } catch { message.error('Failed to load transactions'); }
    finally { setLedgerLoading(false); }
  };

  useEffect(() => {
    fetchLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, JSON.stringify(branchFilter), JSON.stringify(staffFilter), ledgerStatus, GAS_URL]);

  // Clear row selections when filters change so totals reflect visible rows
  useEffect(() => { setSelectedKeys([]); }, [JSON.stringify(branchFilter), JSON.stringify(staffFilter)]);

  // DailyCollections date-based fetch disabled; working purely from StaffLedger
  // useEffect(() => { fetchRows(); }, []);

  // Build staff + branch lists for filters (dynamic from data)
  const staffOptions = Array.from(new Set(ledgerRows.map(r => (r.staff || '').toString()))).map(s => ({ value: s, label: s || '(Unknown)' }));
  const branchOptions = Array.from(new Set(ledgerRows.map(r => (r.branch || '').toString()))).map(b => ({ value: b, label: b || '(Unknown)' }));

  // (Removed DailyCollections date-based summary calculations)

  
  // (Removed DailyCollections edit/settle helpers)

  // (No DailyCollections columns in ledger-only mode)

  // Ledger table setup
  const fmtLocalShort = (raw) => {
    try {
      if (!raw) return '';
      const d = raw instanceof Date ? raw : new Date(String(raw));
      if (Number.isNaN(d.getTime())) return String(raw);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      let h = d.getHours() % 12; if (h === 0) h = 12;
      const hh = String(h).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${day} ${hh}:${mm}`;
    } catch { return String(raw || ''); }
  };
  const ledgerCols = [
    { title:'DateTime', dataIndex:'dateTimeIso', key:'dt', render:(v,r)=> fmtLocalShort(v || r.dateTimeIso || r.date) },
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
      const busy = !!rowBusy[r.id];
      const onClick = async (mode) => {
        if (busy) return;
        setRowBusy(prev => ({ ...prev, [r.id]: true }));
        try { await settleRows([mode], [r.id]); }
        finally { setRowBusy(prev => ({ ...prev, [r.id]: false })); }
      };
      return (
        <Space size={6}>
          {canCash ? <Button size='small' loading={busy} disabled={busy} onClick={()=>onClick('cash')}>Collect</Button> : null}
          {canOn ? <Button size='small' loading={busy} disabled={busy} onClick={()=>onClick('online')}>Verify</Button> : null}
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

  // Filter transactions by selected branches/staff for the Transactions table
  const ledgerRowsFiltered = useMemo(() => {
    const wantBranches = new Set((branchFilter||[]).map(lc));
    const wantStaffs = new Set((staffFilter||[]).map(lc));
    return (ledgerRows||[]).filter(r => {
      const b = lc(r.branch);
      const s = lc(r.staff);
      if (wantBranches.size && !wantBranches.has(b)) return false;
      if (wantStaffs.size && !wantStaffs.has(s)) return false;
      return true;
    });
  }, [ledgerRows, branchFilter, staffFilter]);

  const selected = useMemo(() => {
    const set = new Set(selectedKeys);
    const rows = ledgerRowsFiltered.filter(r => set.has(r.id));
    const cash = rows.reduce((a,r)=>a+(Number(r.cashPending||0)||0), 0);
    const on = rows.reduce((a,r)=>a+(Number(r.onlinePending||0)||0), 0);
    return { cash, online: on };
  }, [selectedKeys, ledgerRowsFiltered]);

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
        loading={ledgerLoading && !hasCache}
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
            <Button type='primary' disabled={selected.cash<=0 || !!bulkBusyMode} loading={bulkBusyMode==='cash'} onClick={async ()=>{ setBulkBusyMode('cash'); try { await settleRows(['cash'], selectedKeys); } finally { setBulkBusyMode(''); } }}>Collect Cash</Button>
            <Button type='primary' disabled={selected.online<=0 || !!bulkBusyMode} loading={bulkBusyMode==='online'} onClick={async ()=>{ setBulkBusyMode('online'); try { await settleRows(['online'], selectedKeys); } finally { setBulkBusyMode(''); } }}>Verify Online</Button>
          </Space>
        </div>
        <Table
          rowKey={(r)=>r.id}
          dataSource={ledgerRowsFiltered}
          columns={ledgerCols}
          loading={ledgerLoading && !hasCache}
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
