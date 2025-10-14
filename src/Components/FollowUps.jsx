import React, { useEffect, useState } from 'react';
import { Button, Table, Space, Tag, Select, DatePicker, message, Modal, Input, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { GetCurrentUser } from "../apiCalls/users";
import { saveBookingViaWebhook, saveJobcardViaWebhook } from "../apiCalls/forms";

const STATUS_COLOR = { pending: 'orange', completed: 'green', cancelled: 'red' };

/**
 * FollowUps list component
 * Props:
 * - mode: 'quotation' | 'jobcard' (default: 'quotation')
 * - webhookUrl: GAS URL for the selected mode
 */
export default function FollowUps({ mode = 'quotation', webhookUrl }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('all'); // today | overdue | upcoming | all
  const [mineOnly, setMineOnly] = useState(true);
  const [branchOnly, setBranchOnly] = useState(true);
  // pagination (controlled to allow changing page size)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [me, setMe] = useState({ name: '', branch: '' });

  const [reschedule, setReschedule] = useState({ open: false, serial: null, at: null, notes: '' });

  useEffect(() => {
    (async () => {
      // Prefill user + branch
      const readLocalUser = () => { try { const raw = localStorage.getItem('user'); return raw ? JSON.parse(raw) : null; } catch { return null; } };
      let user = readLocalUser();
      if (!user || !user.formDefaults) {
        const resp = await GetCurrentUser().catch(() => null);
        if (resp?.success && resp.data) { user = resp.data; try { localStorage.setItem('user', JSON.stringify(user)); } catch 
        {
          //doij
        } }
      }
      const name = user?.formDefaults?.staffName || user?.name || '';
      const branch = user?.formDefaults?.branchName || user?.primaryBranch?.name || '';
      setMe({ name, branch });
    })();
  }, []);

  const isJobcard = String(mode).toLowerCase() === 'jobcard';

  const callWebhook = async ({ method = 'GET', payload }) => {
    if (isJobcard) {
      return await saveJobcardViaWebhook({ webhookUrl, method, payload });
    }
    return await saveBookingViaWebhook({ webhookUrl, method, payload });
  };

  const fetchFollowUps = async () => {
    setLoading(true);
    try {
      if (!webhookUrl) {
        // Optional: if webhook not configured, show empty list gracefully
        setRows([]);
        setLoading(false);
        message.info('Follow-ups webhook not configured.');
        return;
      }
      const payload = {
        action: 'followups',
        filter, // today|overdue|upcoming|all
        branch: branchOnly ? me.branch : '',
        executive: mineOnly ? me.name : '',
      };
      const resp = await callWebhook({ method: 'GET', payload });
      const j = resp?.data || resp;
      const list = Array.isArray(j?.rows) ? j.rows : [];
      // Normalize various row shapes from webhook
      const asPayload = (r) => {
        if (!r) return null;
        if (r.payload && typeof r.payload === 'object') return r.payload; // { payload, values? }
        if (r.formValues && r.followUp) return r; // payload returned directly
        return null;
      };
      const items = list.map((r, i) => {
        const p = asPayload(r) || {};
        const fv = p.formValues || {};
        const fu = p.followUp || {};
        // Serial helpers (quotation vs jobcard)
        const serial = (() => {
          if (isJobcard) {
            return (
              fv.jcNo || fv.JCNo || p.jcNo || p.JCNo || fv.serialNo || p.serialNo || '-'
            );
          }
          return fv.serialNo || p.serialNo || '-';
        })();
        const vehicle = [
          p.company || fv.company,
          p.model || fv.bikeModel || fv.model,
          p.variant || fv.variant,
        ].filter(Boolean).join(' ');
        return {
          key: serial || i,
          serialNo: serial || '-',
          name: fv.name || '-',
          mobile: fv.mobile || '-',
          vehicle,
          branch: fv.branch || p.branch || '-',
          executive: fv.executive || fu.assignedTo || '-',
          followUpAt: fu.at ? dayjs(fu.at) : null,
          followUpNotes: fu.notes || '',
          status: fu.status || 'pending',
          price: Number((fv.onRoadPrice ?? p.onRoadPrice ?? fv.price ?? p.price) || 0),
          brand: (p.brand || '').toUpperCase() || 'SHANTHA',
        };
      });
      // Client-side filtering as a fallback (in case webhook returns unfiltered rows)
      const startToday = dayjs().startOf('day');
      const endToday = dayjs().endOf('day');
      const filtered = items.filter((it) => {
        // branch/executive toggles
        if (branchOnly && me.branch && it.branch && it.branch !== me.branch) return false;
        if (mineOnly && me.name && it.executive && it.executive !== me.name) return false;
        // date filter
        if (filter === 'all') return true;
        const d = it.followUpAt;
        if (!d || !d.isValid()) return false;
        if (filter === 'today') return !d.isBefore(startToday) && !d.isAfter(endToday);
        if (filter === 'overdue') return d.isBefore(startToday);
        if (filter === 'upcoming') return d.isAfter(endToday);
        return true;
      });
      setRows(filtered);
      setPage(1); // reset to first page after refresh/filters
    } catch (e) {
      console.warn('followups fetch failed', e);
      message.error('Could not fetch follow-ups. Check the Apps Script.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (webhookUrl) fetchFollowUps(); }, [webhookUrl, filter, mineOnly, branchOnly, me.branch, me.name, mode]);

  const updateFollowUp = async (serialNo, patch) => {
    try {
      const resp = await callWebhook({ method: 'POST', payload: { action: 'updateFollowup', serialNo, patch } });
      const j = resp?.data || resp;
      if (!j?.success) throw new Error('Failed');
      message.success('Updated');
      fetchFollowUps();
    } catch  {
      message.error('Update failed');
    }
  };

  const columns = [
    { title: 'Due', dataIndex: 'followUpAt', key: 'followUpAt', render: (d) => (d ? d.format('DD MMM, HH:mm') : '-') },
    { title: 'Customer', dataIndex: 'name', key: 'name' },
    { title: 'Mobile', dataIndex: 'mobile', key: 'mobile' },
    { title: 'Vehicle', dataIndex: 'vehicle', key: 'vehicle' },
    { title: isJobcard ? 'Job Card' : 'Quotation', dataIndex: 'serialNo', key: 'serialNo' },
    { title: 'Branch', dataIndex: 'branch', key: 'branch' },
    { title: 'Executive', dataIndex: 'executive', key: 'executive' },
    { title: 'Notes', dataIndex: 'followUpNotes', key: 'followUpNotes', ellipsis: true },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s) => <Tag color={STATUS_COLOR[s] || 'default'}>{s}</Tag> },
    {
      title: 'Actions', key: 'actions',
      render: (_, r) => {
        const inr0 = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.max(0, Math.round(n || 0)));
        const showroomName = (String(r.brand).toUpperCase() === 'NH') ? 'NH Motors' : 'Shantha Motors';
        const buildWhatsApp = () => {
          const phone = String(r.mobile || '').replace(/\D/g, '');
          if (!phone) { message.warning('Missing mobile'); return null; }
          const lines = [
            `*Hi ${r.name}! Hope you're doing well 😊*`,
            isJobcard
              ? `This is a reminder about your job card *${r.serialNo}* for *${r.vehicle || '-'}*.`
              : `You had requested a quotation for *${r.vehicle || '-'}* (No. ${r.serialNo}).`,
            !isJobcard && r.price ? `On-road price: ${inr0(r.price)}.` : undefined,
            isJobcard
              ? `Please let me know a convenient time to proceed.`
              : `Would you like me to reserve one for you at ${r.branch}?`,
            `– ${r.executive}, ${showroomName}`,
          ].filter(Boolean);
          const text = encodeURIComponent(lines.join('\n'));
          return `https://wa.me/91${phone}?text=${text}`;
        };
        return (
          <Space>
            <Button size="small" onClick={() => updateFollowUp(r.serialNo, { status: 'completed' })}>Done</Button>
            <Button size="small" onClick={() => setReschedule({ open: true, serial: r.serialNo, at: r.followUpAt || dayjs(), notes: r.followUpNotes || '' })}>Reschedule</Button>
            <Tooltip title="Send WhatsApp reminder">
              <Button size="small" type="link" onClick={() => {
                const url = buildWhatsApp();
                if (!url) return;
                const w = window.open(url, '_blank', 'noopener,noreferrer');
                if (!w) window.location.href = url;
              }}>WhatsApp</Button>
            </Tooltip>
          </Space>
        );
      }
    }
  ];

  return (
    <div>
      <Space style={{ marginBottom: 24 }} wrap>
        <Select
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'today', label: 'Due Today' },
            { value: 'overdue', label: 'Overdue' },
            { value: 'upcoming', label: 'Upcoming' },
            
          ]}
        />
        <Select
          value={mineOnly ? 'all' : 'mine'}
          onChange={(v)=>setMineOnly(v==='mine')}
          options={[{value:'mine',label:'Assigned to me'},{value:'all',label:'Anyone'}]}
        />
        <Select
          value={branchOnly ? 'mybranch' : 'all'}
          onChange={(v)=>setBranchOnly(v==='mybranch')}
          options={[{value:'mybranch',label:'My Branch'},{value:'all',label:'All Branches'}]}
        />
        <Button onClick={fetchFollowUps} loading={loading}>Refresh</Button>
      </Space>

      <Table
        rowKey={(r)=>String(r.key)}
        dataSource={rows}
        columns={columns}
        loading={loading}
        size="small"
        pagination={{
          current: page,
          pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10','20','50','100'],
          onChange: (p, ps) => {
            setPage(p);
            if (ps !== pageSize) setPageSize(ps);
          },
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
        }}
        scroll={{ x: true }}
      />

      <Modal
        title={`Reschedule ${reschedule.serial || ''}`}
        open={reschedule.open}
        onCancel={() => setReschedule({ open: false, serial: null, at: null, notes: '' })}
        onOk={async () => {
          await updateFollowUp(reschedule.serial, { followUp: { at: reschedule.at?.toISOString?.() || null, notes: reschedule.notes || '' }, status: 'pending' });
          setReschedule({ open: false, serial: null, at: null, notes: '' });
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <DatePicker showTime style={{ width: '100%' }} value={reschedule.at} onChange={(v)=>setReschedule(s=>({...s, at:v}))} />
          <Input.TextArea rows={2} placeholder="Notes" value={reschedule.notes} onChange={(e)=>setReschedule(s=>({...s, notes:e.target.value}))} />
        </Space>
      </Modal>
    </div>
  );
}
