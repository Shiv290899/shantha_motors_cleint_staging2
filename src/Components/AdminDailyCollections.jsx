import React, { useEffect, useMemo, useState } from 'react';
import { Table, Space, Button, Select, message, Segmented, Grid, Modal, Form, Input, InputNumber, Divider, Typography } from 'antd';

import { saveJobcardViaWebhook } from '../apiCalls/forms';
import { listUsersPublic } from '../apiCalls/adminUsers';
import { exportToCsv } from '../utils/csvExport';

const { Text } = Typography;

export default function AdminDailyCollections() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const DEFAULT_JC_URL = 'https://script.google.com/macros/s/AKfycbyywiLgLkeZcbvOn-7rjoyMMddLesuq2Bl9Vj_AQl2zSVdj_Y_bGAfg5H7AiF_3FwPhsw/exec';
  const GAS_URL = import.meta.env.VITE_JOBCARD_GAS_URL || DEFAULT_JC_URL;
  const SECRET = import.meta.env.VITE_JOBCARD_GAS_SECRET || '';
  const readUser = () => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } };
  const me = useMemo(() => readUser(), []);
  const ownerName = me?.name || me?.displayName || me?.email || me?.username || 'OWNER';

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
  // Bulk action spinners
  const [bulkBusyMode, setBulkBusyMode] = useState(''); // '' | 'cash' | 'online'
  // Previous due modal state
  const [prevDueOpen, setPrevDueOpen] = useState(false);
  const [prevDueList, setPrevDueList] = useState([]);
  const [prevDueLoading, setPrevDueLoading] = useState(false);
  const [prevDueSaving, setPrevDueSaving] = useState(false);
  const [prevDueForm] = Form.useForm();
  const [staffOptions, setStaffOptions] = useState([]);
  const [staffOptionsLoading, setStaffOptionsLoading] = useState(false);
  

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

  const fetchPrevDue = async () => {
    if (!GAS_URL) return;
    setPrevDueLoading(true);
    try {
      const payload = SECRET ? { action: 'owner_prev_due_list', secret: SECRET } : { action: 'owner_prev_due_list' };
      const resp = await saveJobcardViaWebhook({ webhookUrl: GAS_URL, method: 'GET', payload });
      const js = resp?.data || resp || {};
      const rows = Array.isArray(js.rows) ? js.rows.slice() : [];
      const toTs = (raw) => {
        const n = Number(new Date(String(raw || '')));
        return Number.isFinite(n) ? n : 0;
      };
      rows.sort((a, b) => toTs(b?.updatedAt) - toTs(a?.updatedAt));
      setPrevDueList(rows);
    } catch {
      message.error('Could not load previous due entries');
    } finally {
      setPrevDueLoading(false);
    }
  };

  const loadStaffOptions = async () => {
    setStaffOptionsLoading(true);
    try {
      const res = await listUsersPublic({ role: 'staff', status: 'active', limit: 100000 });
      const items = Array.isArray(res?.data?.items) ? res.data.items : [];
      const opts = items.map((u) => {
        const staffName = u?.formDefaults?.staffName || u?.name || '';
        const branchName =
          u?.formDefaults?.branchName ||
          (u?.primaryBranch && (u.primaryBranch.name || u.primaryBranch.branchName)) ||
          '';
        const labelPieces = [staffName || '(No name)'];
        if (branchName) labelPieces.push(`· ${branchName}`);
        return {
          value: staffName,
          label: labelPieces.join(' '),
          branchName,
        };
      }).filter((o) => o.value);
      setStaffOptions(opts);
    } catch {
      message.error('Could not load staff list');
    } finally {
      setStaffOptionsLoading(false);
    }
  };

  const onPrevDueFinish = async (values) => {
    if (!GAS_URL) return;
    setPrevDueSaving(true);
    try {
      const payload = {
        action: 'owner_prev_due_set',
        branch: String(values.branch || '').trim(),
        staff: String(values.staff || '').trim(),
        amount: values.amount,
        note: values.note || '',
        updatedBy: ownerName,
      };
      if (SECRET) payload.secret = SECRET;
      const resp = await saveJobcardViaWebhook({ webhookUrl: GAS_URL, method: 'POST', payload });
      const result = resp?.data || resp || {};
      if (result.success === false) throw new Error(result.message || 'Failed');
      message.success('Previous due updated');
      fetchPrevDue();
    } catch (err) {
      message.error(err?.message || 'Could not update previous due');
    } finally {
      setPrevDueSaving(false);
    }
  };

  useEffect(() => {
    if (!prevDueOpen) return;
    prevDueForm.resetFields();
    const defaults = {};
    if ((branchFilter || []).length === 1) defaults.branch = branchFilter[0];
    if ((staffFilter || []).length === 1) defaults.staff = staffFilter[0];
    if (Object.keys(defaults).length) prevDueForm.setFieldsValue(defaults);
    loadStaffOptions();
    fetchPrevDue();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevDueOpen]);

  // Clear row selections when filters change so totals reflect visible rows
  useEffect(() => { setSelectedKeys([]); }, [JSON.stringify(branchFilter), JSON.stringify(staffFilter)]);

  // DailyCollections date-based fetch disabled; working purely from StaffLedger
  // useEffect(() => { fetchRows(); }, []);

  // Build staff + branch lists for filters (dynamic from data)
  const staffFilterOptions = Array.from(new Set(ledgerRows.map(r => (r.staff || '').toString()))).map(s => ({ value: s, label: s || '(Unknown)' }));
  const branchOptions = Array.from(new Set(ledgerRows.map(r => (r.branch || '').toString()))).map(b => ({ value: b, label: b || '(Unknown)' }));

  // (Removed DailyCollections date-based summary calculations)


  // (Removed DailyCollections edit/settle helpers)

  // (No DailyCollections columns in ledger-only mode)

  const num0 = (v) => Number(v || 0) || 0;
  const normKey = (v) => String(v ?? '').trim().toLowerCase();
  const rowTs = (r) => {
    const raw = r?.dateTimeIso || r?.date;
    const n = Number(new Date(String(raw)));
    return Number.isFinite(n) ? n : 0;
  };
  const rowGroupKey = (r) => ([
    normKey(r?.branch),
    normKey(r?.staff),
    normKey(r?.sourceType),
    normKey(r?.sourceId),
    normKey(r?.customerMobile),
    normKey(r?.paymentMode),
    normKey(r?.cashAmount ?? r?.cashPending),
    normKey(r?.onlineAmount ?? r?.onlinePending),
    normKey(r?.utr),
  ]).join('|');
  const deriveAmounts = (row) => {
    const cashPending = num0(row?.cashPending);
    const onlinePending = num0(row?.onlinePending);
    const cashAmount = num0(row?.cashAmount ?? row?.cashPending);
    const onlineAmount = num0(row?.onlineAmount ?? row?.onlinePending);
    const cashSettled = Math.max(0, cashAmount - cashPending);
    const onlineSettled = Math.max(0, onlineAmount - onlinePending);
    return { cashPending, onlinePending, cashAmount, onlineAmount, cashSettled, onlineSettled };
  };

  const getDisplayAmounts = (row) => {
    const a = deriveAmounts(row);
    return {
      cash: a.cashAmount,
      online: a.onlineAmount,
    };
  };

  const cashLabel = 'Cash';
  const onlineLabel = 'Online';
  const totalLabel = 'Total Amount';

  // Ledger table setup
  const fmtLocalShort = (raw) => {
    try {
      if (!raw) return '';
      const d = raw instanceof Date ? raw : new Date(String(raw));
      if (Number.isNaN(d.getTime())) return String(raw);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${day}-${m}-${y} ${hh}:${mm}`;
    } catch { return String(raw || ''); }
  };
  const stackStyle = { display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.2 };
  const lineStyle = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  const mutedStyle = { ...lineStyle, opacity: 0.7 };

  const ledgerCols = [
    { title:'DateTime / Branch', key:'dt', width: 150, render:(_,r)=> (
      <div style={stackStyle}>
        <div style={lineStyle}>{fmtLocalShort(r.dateTimeIso || r.date)}</div>
        <div style={mutedStyle}>{r.branch || '—'}</div>
      </div>
    ) },
    { title:'Source / Staff', key:'src', width: 180, render:(_,r)=> {
      const source = `${String(r.sourceType||'').toUpperCase()} ${r.sourceId||''}`.trim();
      return (
        <div style={stackStyle}>
          <div style={lineStyle}>{source || '—'}</div>
          <div style={mutedStyle}>{r.staff || '—'}</div>
        </div>
      );
    } },
    { title:'Customer / Mobile', key:'cust', width: 170, render:(_,r)=> (
      <div style={stackStyle}>
        <div style={lineStyle}>{r.customerName || '—'}</div>
        <div style={mutedStyle}>{r.customerMobile || '—'}</div>
      </div>
    ) },
    { title:'Mode', dataIndex:'paymentMode', key:'mode', width: 80, render:(v)=> String(v || '—').toUpperCase() },
    { title:cashLabel, key:'cash', width: 80, align:'right', render:(_,r)=> Number(getDisplayAmounts(r).cash || 0).toLocaleString('en-IN') },
    { title:onlineLabel, key:'online', width: 80, align:'right', render:(_,r)=> Number(getDisplayAmounts(r).online || 0).toLocaleString('en-IN') },
    { title:'UTR / Ref', dataIndex:'utr', key:'utr', width: 120, render:(v, r) => {
      const mode = String(r?.paymentMode || '').toLowerCase();
      if (mode === 'cash') return '';
      const s = String(v ?? '').trim();
      if (!s || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null') return '';
      return s;
    } },
    { title:'Action', key:'act', width: 110, render:(_,r)=> {
      const canCash = Number(r.cashPending||0) > 0;
      const canOn = Number(r.onlinePending||0) > 0;
      const onClick = (mode) => {
        const key = rowGroupKey(r);
        const ids = Array.from(new Set((ledgerRows || [])
          .filter((row) => rowGroupKey(row) === key)
          .map((row) => row?.id)
          .filter(Boolean)));
        if (!ids.length) return;
        void settleRows([mode], ids);
      };
      return (
        <Space direction="vertical" size={4}>
          {canCash ? <Button size='small' onClick={()=>onClick('cash')}>Collect</Button> : null}
          {canOn ? <Button size='small' onClick={()=>onClick('online')}>Verify</Button> : null}
        </Space>
      );
    } },
  ];

  const prevDueCols = [
    { title:'Branch', dataIndex:'branch', key:'branch' },
    { title:'Staff', dataIndex:'staff', key:'staff' },
    { title:'Amount', dataIndex:'amount', key:'amount', align:'right', render:(v)=> (Number(v||0)).toLocaleString('en-IN') },
    { title:'Note', dataIndex:'note', key:'note', ellipsis:true },
    { title:'Updated By', dataIndex:'updatedBy', key:'updatedBy' },
    { title:'Updated At', dataIndex:'updatedAt', key:'updatedAt', render:(v)=> fmtLocalShort(v) },
  ];

  // Staff-wise aggregation from ledger (client-side filters for multi-select)
  const lc = (s) => String(s||'').trim().toLowerCase();
  const ledgerRowsUnique = useMemo(() => {
    const map = new Map();
    (ledgerRows || []).forEach((r) => {
      const key = rowGroupKey(r);
      const prev = map.get(key);
      if (!prev || rowTs(r) >= rowTs(prev)) {
        map.set(key, r);
      }
    });
    return Array.from(map.values());
  }, [ledgerRows]);
  const staffAgg = useMemo(() => {
    const wantBranches = new Set((branchFilter||[]).map(lc));
    const wantStaffs = new Set((staffFilter||[]).map(lc));
    const groups = new Map(); // key: branch|staff -> {branch,staff,cash,online}
    (ledgerRowsUnique||[]).forEach(r => {
      const b = String(r.branch||'');
      const s = String(r.staff||'');
      if (wantBranches.size && !wantBranches.has(lc(b))) return;
      if (wantStaffs.size && !wantStaffs.has(lc(s))) return;
      const key = `${lc(b)}|${lc(s)}`;
      const g = groups.get(key) || { branch: b, staff: s, cash:0, online:0 };
      const display = getDisplayAmounts(r);
      g.cash += display.cash;
      g.online += display.online;
      groups.set(key, g);
    });
    return Array.from(groups.values()).map(g => ({ ...g, total: g.cash + g.online }));
  }, [ledgerRows, branchFilter, staffFilter]);

  const staffAggCols = [
    { title:'Branch', dataIndex:'branch', key:'branch' },
    { title:'Staff', dataIndex:'staff', key:'staff' },
    { title:cashLabel, dataIndex:'cash', key:'cash', align:'right', render:(v)=> (Number(v||0)).toLocaleString('en-IN') },
    { title:onlineLabel, dataIndex:'online', key:'online', align:'right', render:(v)=> (Number(v||0)).toLocaleString('en-IN') },
    { title:totalLabel, dataIndex:'total', key:'total', align:'right', render:(v)=> (Number(v||0)).toLocaleString('en-IN') },
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
    const out = (ledgerRowsUnique||[]).filter(r => {
      const b = lc(r.branch);
      const s = lc(r.staff);
      if (wantBranches.size && !wantBranches.has(b)) return false;
      if (wantStaffs.size && !wantStaffs.has(s)) return false;
      return true;
    });
    out.sort((a,b) => rowTs(b) - rowTs(a)); // latest first
    return out;
  }, [ledgerRowsUnique, branchFilter, staffFilter]);

  const selected = useMemo(() => {
    const set = new Set(selectedKeys);
    const rows = ledgerRowsFiltered.filter(r => set.has(r.id));
    const cash = rows.reduce((a,r)=>a+(getDisplayAmounts(r).cash||0), 0);
    const on = rows.reduce((a,r)=>a+(getDisplayAmounts(r).online||0), 0);
    return { cash, online: on };
  }, [selectedKeys, ledgerRowsFiltered]);

  const selectedPending = useMemo(() => {
    const set = new Set(selectedKeys);
    const rows = ledgerRowsFiltered.filter(r => set.has(r.id));
    const cash = rows.reduce((a,r)=>a+(deriveAmounts(r).cashPending||0), 0);
    const on = rows.reduce((a,r)=>a+(deriveAmounts(r).onlinePending||0), 0);
    return { cash, online: on };
  }, [selectedKeys, ledgerRowsFiltered]);

  const settleRows = async (modes, ids, options = {}) => {
    const mode = modes.includes('cash') && modes.includes('online') ? 'both' : (modes[0] || 'both');
    if (!ids || !ids.length) return;
    const optimistic = options.optimistic !== false;
    const showMessage = options.showMessage !== false;
    const modeSet = new Set(modes);
    if (optimistic) {
      const removedIds = new Set();
      setLedgerRows((prev) => {
        const nextRows = (prev || [])
          .map((r) => {
            if (!ids.includes(r.id)) return r;
            const next = { ...r };
            if (modeSet.has('cash') || modeSet.has('both')) next.cashPending = 0;
            if (modeSet.has('online') || modeSet.has('both')) next.onlinePending = 0;
            const amt = deriveAmounts(next);
            if (amt.cashPending <= 0 && amt.onlinePending <= 0) {
              removedIds.add(next.id);
              return null;
            }
            return next;
          })
          .filter(Boolean);
        try { localStorage.setItem(CACHE_KEY(ledgerStatus), JSON.stringify({ at: Date.now(), rows: nextRows })); } catch {
          // ignore cache failures
        }
        return nextRows;
      });
      if (removedIds.size) {
        setSelectedKeys((prev) => prev.filter((k) => !removedIds.has(k)));
      }
      setHasCache(true);
    }
    try {
      const payload = SECRET
        ? { action:'owner_ledger_settle', mode, ids, secret: SECRET }
        : { action:'owner_ledger_settle', mode, ids };
      const resp = await saveJobcardViaWebhook({ webhookUrl: GAS_URL, method:'POST', payload });
      const ok = (resp?.data || resp)?.success !== false;
      if (!ok) throw new Error('Failed');
      if (showMessage) message.success('Updated');
    } catch {
      message.error('Update failed. Refresh to sync.');
    }
  };

  const handleExportCsv = () => {
    const isSummary = viewMode === 'summary';
    const headers = isSummary
      ? [
          { key: 'branch', label: 'Branch' },
          { key: 'staff', label: 'Staff' },
          { key: 'cash', label: cashLabel },
          { key: 'online', label: onlineLabel },
          { key: 'total', label: totalLabel },
        ]
      : [
          { key: 'date', label: 'DateTime' },
          { key: 'staff', label: 'Staff' },
          { key: 'branch', label: 'Branch' },
          { key: 'mode', label: 'Mode' },
          { key: 'cashAmount', label: cashLabel },
          { key: 'onlineAmount', label: onlineLabel },
          { key: 'cashPending', label: 'Cash Pending' },
          { key: 'onlinePending', label: 'Online Pending' },
          { key: 'utr', label: 'UTR / Ref' },
          { key: 'customer', label: 'Customer' },
          { key: 'mobile', label: 'Mobile' },
          { key: 'source', label: 'Source' },
        ];
    const source = isSummary ? staffAgg : ledgerRowsFiltered;
    if (!source.length) {
      message.info('No rows to export for current filters');
      return;
    }
    const rowsForCsv = isSummary
      ? staffAgg.map((r) => ({
          branch: r.branch,
          staff: r.staff,
          cash: r.cash,
          online: r.online,
          total: r.total,
        }))
      : ledgerRowsFiltered.map((r) => {
          const amounts = getDisplayAmounts(r);
          const pending = deriveAmounts(r);
          return {
            date: fmtLocalShort(r.dateTimeIso || r.date),
            staff: r.staff,
            branch: r.branch,
            mode: r.paymentMode,
            cashAmount: amounts.cash,
            onlineAmount: amounts.online,
            cashPending: pending.cashPending,
            onlinePending: pending.onlinePending,
            utr: r.utr,
            customer: r.customerName,
            mobile: r.customerMobile,
            source: `${String(r.sourceType || '').toUpperCase()} ${r.sourceId || ''}`.trim(),
          };
        });
    const filename = isSummary ? 'daily-collections-summary.csv' : 'daily-collections-transactions.csv';
    exportToCsv({ filename, headers, rows: rowsForCsv });
    message.success(`Exported ${rowsForCsv.length} ${isSummary ? 'rows' : 'transactions'}`);
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
            style={{ minWidth: isMobile ? 140 : 220 }}
            options={branchOptions}
          />
          <Segmented value={ledgerStatus} onChange={setLedgerStatus} options={[{label:'Unsettled', value:'unsettled'},{label:'Settled', value:'settled'},{label:'All', value:'all'}]} />
          <Select
            mode='multiple'
            allowClear
            placeholder='Staff'
            value={staffFilter}
            onChange={setStaffFilter}
            style={{ minWidth: isMobile ? 140 : 220 }}
            options={staffFilterOptions}
          />
        </Space>
        <Space>
          <Button onClick={handleExportCsv}>Export CSV</Button>
          <Button onClick={fetchLedger} loading={ledgerLoading}>Refresh</Button>
          <Button type='primary' ghost onClick={()=>setPrevDueOpen(true)}>Assign Previous Due</Button>
        </Space>
      </Space>
      {viewMode==='summary' ? (
      <>
      {/* Staff-wise (ledger) summary */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(6, 1fr)', gap:12, marginBottom:12 }}>
        <div style={{padding:12,borderRadius:10,background:'linear-gradient(135deg,#e0f7fa,#b2ebf2)'}}>
          <div style={{fontSize:12,opacity:0.8}}>Staff</div>
          <div style={{fontSize:22,fontWeight:800}}>{(staffAggTotals.count||0)}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:'linear-gradient(135deg,#e8f5e9,#c8e6c9)'}}>
          <div style={{fontSize:12,opacity:0.8}}>{cashLabel}</div>
          <div style={{fontSize:22,fontWeight:800}}>{(Number(staffAggTotals.cash||0)).toLocaleString('en-IN')}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:'linear-gradient(135deg,#e3f2fd,#bbdefb)'}}>
          <div style={{fontSize:12,opacity:0.8}}>{onlineLabel}</div>
          <div style={{fontSize:22,fontWeight:800}}>{(Number(staffAggTotals.online||0)).toLocaleString('en-IN')}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:'linear-gradient(135deg,#fff3e0,#ffe0b2)'}}>
          <div style={{fontSize:12,opacity:0.8}}>{totalLabel}</div>
          <div style={{fontSize:22,fontWeight:800}}>{(Number(staffAggTotals.total||0)).toLocaleString('en-IN')}</div>
        </div>
      </div>

      <Table
        rowKey={(r)=>`${r.branch}-${r.staff}`}
        dataSource={staffAgg}
        columns={staffAggCols}
        loading={ledgerLoading && !hasCache}
        size={isMobile ? 'small' : 'middle'}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: isMobile ? 10 : 20, size: isMobile ? 'small' : 'default' }}
      />
      </>
      ) : (
      <>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
          <div style={{ display:'flex', gap:16, alignItems:'center' }}>
            <div><strong>Selected {cashLabel}:</strong> {selected.cash.toLocaleString('en-IN')}</div>
            <div><strong>Selected {onlineLabel}:</strong> {selected.online.toLocaleString('en-IN')}</div>
          </div>
          <Space>
            <Button type='primary' disabled={selectedPending.cash<=0 || !!bulkBusyMode} loading={bulkBusyMode==='cash'} onClick={async ()=>{ setBulkBusyMode('cash'); try { await settleRows(['cash'], selectedKeys); } finally { setBulkBusyMode(''); } }}>Collect Cash</Button>
            <Button type='primary' disabled={selectedPending.online<=0 || !!bulkBusyMode} loading={bulkBusyMode==='online'} onClick={async ()=>{ setBulkBusyMode('online'); try { await settleRows(['online'], selectedKeys); } finally { setBulkBusyMode(''); } }}>Verify Online</Button>
          </Space>
        </div>
        <Table
          rowKey={(r)=>r.id}
          dataSource={ledgerRowsFiltered}
          columns={ledgerCols}
          loading={ledgerLoading && !hasCache}
          size="small"
          className="compact-table"
          tableLayout="fixed"
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: setSelectedKeys
          }}
          pagination={{ pageSize: isMobile ? 10 : 20, size: isMobile ? 'small' : 'default' }}
        />
      </>
      )}

      {/* No DailyCollections modal in ledger-only mode */}

      <Modal
        open={prevDueOpen}
        title='Assign Previous Due'
        onCancel={()=>setPrevDueOpen(false)}
        width={isMobile ? Math.min((typeof window !== 'undefined' ? window.innerWidth : 360) - 24, 720) : 720}
        footer={[
          <Button key='close' onClick={()=>setPrevDueOpen(false)}>Close</Button>,
          <Button key='save' type='primary' loading={prevDueSaving} onClick={()=>prevDueForm.submit()}>Save</Button>
        ]}
        destroyOnClose
      >
        <Form layout='vertical' form={prevDueForm} onFinish={onPrevDueFinish}>
          <Form.Item label='Staff' name='staff' rules={[{ required:true, message:'Staff is required' }]}>
            <Select
              showSearch
              placeholder='Select staff'
              optionFilterProp='label'
              loading={staffOptionsLoading}
              options={staffOptions}
              onChange={(val) => {
                try {
                  const found = staffOptions.find((o) => o.value === val);
                  if (found?.branchName) {
                    prevDueForm.setFieldsValue({ branch: found.branchName });
                  }
                } catch {
                  // ignore
                }
              }}
            />
          </Form.Item>
          <Form.Item label='Branch' name='branch' rules={[{ required:true, message:'Branch is required' }]}>
            <Input placeholder='Auto-filled from staff primary branch' autoComplete='off' disabled />
          </Form.Item>
          <Form.Item label='Amount (₹)' name='amount' rules={[{ required:true, message:'Amount is required' }]}>
            <InputNumber min={0} step={100} style={{ width: '100%' }} placeholder='Enter amount' />
          </Form.Item>
          <Form.Item label='Owner Note' name='note'>
            <Input.TextArea rows={2} maxLength={240} placeholder='Optional note shown to staff' />
          </Form.Item>
        </Form>
        <Divider orientation='left' plain>Assigned amounts</Divider>
        <Table
          rowKey={(r)=>r.id || `${r.branch}-${r.staff}`}
          dataSource={prevDueList}
          columns={prevDueCols}
          loading={prevDueLoading}
          size={isMobile ? 'small' : 'middle'}
          pagination={{ pageSize: isMobile ? 5 : 8, size: isMobile ? 'small' : 'default' }}
          scroll={{ x: 'max-content' }}
        />
        <Text type='secondary' style={{ fontSize: 12 }}>Amounts assigned here appear as Previous Due on the staff dashboard without inflating the cash/online pending cards.</Text>
      </Modal>
    </div>
  );
}
