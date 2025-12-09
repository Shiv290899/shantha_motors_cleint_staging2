import React, { useEffect, useMemo, useState } from 'react';
import { Table, Space, Button, Select, message, Segmented, Grid, Modal, Form, Input, InputNumber, Divider, Typography } from 'antd';

import { saveJobcardViaWebhook } from '../apiCalls/forms';
import { listUsersPublic } from '../apiCalls/adminUsers';

const { Text } = Typography;

export default function AdminDailyCollections() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const DEFAULT_JC_URL = 'https://script.google.com/macros/s/AKfycbwX0-KYGAGl7Gte4f_rF8OfnimU7T5WetLIv6gba_o7-kOOjzgOM3JnsHkoqrDJK83GCQ/exec';
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
  // Per-row/bulk action spinners
  const [rowBusy, setRowBusy] = useState({});
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
      let h = d.getHours() % 12; if (h === 0) h = 12;
      const hh = String(h).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${day} ${hh}:${mm}`;
    } catch { return String(raw || ''); }
  };
  const ledgerCols = [
    { title:'DateTime', dataIndex:'dateTimeIso', key:'dt', render:(v,r)=> fmtLocalShort(v || r.dateTimeIso || r.date) },
   
    { title:'Staff', dataIndex:'staff', key:'staff' },
    { title:'Source', key:'src', render:(_,r)=> `${String(r.sourceType||'').toUpperCase()} ${r.sourceId||''}` },
    { title:'Customer', dataIndex:'customerName', key:'cust' },
    { title:'Mobile', dataIndex:'customerMobile', key:'mob' },
    { title:'Mode', dataIndex:'paymentMode', key:'mode' },
    { title:cashLabel, dataIndex:'cashPending', key:'cp', align:'right', render:(_,r)=> (getDisplayAmounts(r).cash).toLocaleString('en-IN') },
    { title:onlineLabel, dataIndex:'onlinePending', key:'op', align:'right', render:(_,r)=> (getDisplayAmounts(r).online).toLocaleString('en-IN') },
    { title:'UTR / Ref', dataIndex:'utr', key:'utr', render:(v, r) => {
      // Hide undefined/null or cash-mode references
      const mode = String(r?.paymentMode || '').toLowerCase();
      if (mode === 'cash') return '';
      const s = String(v ?? '').trim();
      if (!s || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null') return '';
      return s;
    } },
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
     { title:'Branch', dataIndex:'branch', key:'branch' },
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
    const out = (ledgerRows||[]).filter(r => {
      const b = lc(r.branch);
      const s = lc(r.staff);
      if (wantBranches.size && !wantBranches.has(b)) return false;
      if (wantStaffs.size && !wantStaffs.has(s)) return false;
      return true;
    });
    const ts = (r) => {
      const raw = r?.dateTimeIso || r?.date;
      const n = Number(new Date(String(raw)));
      return Number.isFinite(n) ? n : 0;
    };
    out.sort((a,b) => ts(b) - ts(a)); // latest first
    return out;
  }, [ledgerRows, branchFilter, staffFilter]);

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
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: setSelectedKeys
          }}
          size={isMobile ? 'small' : 'middle'}
          scroll={{ x: 'max-content' }}
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
