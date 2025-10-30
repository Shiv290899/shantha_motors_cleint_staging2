import React, { useEffect, useState } from 'react';
import { Button, Table, Space, Tag, Select, DatePicker, message, Modal, Input, Tooltip } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { GetCurrentUser } from "../apiCalls/users";
import { saveBookingViaWebhook, saveJobcardViaWebhook } from "../apiCalls/forms";
import PostServiceQuickModal from "./PostServiceQuickModal";
import JobCardInlineModal from "./JobCardInlineModal";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    // Log for diagnostics
    if (typeof window !== 'undefined' && window.console) {
      console.error('FollowUps crashed', error, info);
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16 }}>
          <h3>Something went wrong in Follow-Ups.</h3>
          <Space>
            <Button size="small" type="primary" onClick={() => this.setState({ hasError: false, error: null })}>
              Try Again
            </Button>
            <Button size="small" onClick={() => window.location.reload()}>Reload</Button>
          </Space>
          {this.state.error && (
            <pre style={{ marginTop: 12, whiteSpace: 'pre-wrap', color: '#a00' }}>{String(this.state.error)}</pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

const STATUS_COLOR = {
  // Shared
  pending: 'orange',
  cancelled: 'red',
  // Quotation/Jobcard
  completed: 'green',
  converted: 'green',
  not_interested: 'default',
  unreachable: 'volcano',
  wrong_number: 'magenta',
  purchased_elsewhere: 'geekblue',
  no_response: 'gold',
  // Booking-specific
  seen: 'blue',
  approved: 'green',
  allotted: 'purple',
  // 'lost' removed per request
};

const STATUS_LABEL = {
  // Shared
  pending: 'Pending',
  cancelled: 'Cancelled',
  // Quotation/Jobcard
  completed: 'Completed',
  converted: 'Converted',
  not_interested: 'Not Interested',
  unreachable: 'Unreachable',
  wrong_number: 'Wrong Number',
  purchased_elsewhere: 'Purchased Elsewhere',
  no_response: 'No Response',
  // Booking-specific
  seen: 'Seen',
  approved: 'Approved',
  allotted: 'Allotted',
  // 'lost' removed per request
};

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
  // Show follow-ups based on Branch only (not executive)
  // Set to false so we never filter by executive name
  const [mineOnly,] = useState(false);
  const [branchOnly, setBranchOnly] = useState(true);
  // pagination (controlled to allow changing page size)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [me, setMe] = useState({ name: '', branch: '' });
  const [userRole, setUserRole] = useState('');
  const [allowedBranches, setAllowedBranches] = useState([]); // names only

  const [reschedule, setReschedule] = useState({ open: false, serial: null, at: null, notes: '' });
  const [closing, setClosing] = useState({ open: false, serial: null, status: 'converted', details: '', boughtFrom: '', offer: '' });
  const [postModal, setPostModal] = useState({ open: false, row: null });
  const [prefillModal, setPrefillModal] = useState({ open: false, row: null });

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
      const primaryBranch = user?.formDefaults?.branchName || user?.primaryBranch?.name || '';
      const branches = [];
      if (primaryBranch) branches.push(primaryBranch);
      if (Array.isArray(user?.branches)) {
        user.branches.forEach((b) => {
          const nm = (typeof b === 'string') ? b : (b?.name || b?.label || b?.title || '');
          if (nm) branches.push(nm);
        });
      }
      const uniq = Array.from(new Set(branches.filter(Boolean)));
      setAllowedBranches(uniq);
      setUserRole(String(user?.role || '').toLowerCase());
      setMe({ name, branch: uniq[0] || primaryBranch || '' });
    })();
  }, []);

  const modeKey = String(mode || '').toLowerCase();
  const isJobcard = modeKey === 'jobcard';
  const isBooking = modeKey === 'booking';

  const callWebhook = async ({ method = 'GET', payload }) => {
    if (isJobcard) {
      return await saveJobcardViaWebhook({ webhookUrl, method, payload });
    }
    return await saveBookingViaWebhook({ webhookUrl, method, payload });
  };

  // Normalize branch names for strict comparisons
  const norm = (s) => String(s || '').trim().toLowerCase();

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
      // For bookings, many deployments expose only `action=list`.
      // Use that and client-side filter instead of `followups`.
      const BOOKING_SECRET = import.meta.env?.VITE_BOOKING_GAS_SECRET || '';
      const payload = isBooking ? (
        BOOKING_SECRET ? { action: 'list', secret: BOOKING_SECRET } : { action: 'list' }
      ) : (() => {
        // Always pass branch to the webhook for strict server-side scoping
        const meBranch = (me.branch || allowedBranches[0] || '');
        const shouldRestrict = !['owner','admin'].includes(userRole) ? true : !!branchOnly;
        return {
          action: 'followups',
          filter, // today|overdue|upcoming|all
          branch: shouldRestrict ? meBranch : '',
          executive: '', // never restrict by executive
        };
      })();
      const resp = await callWebhook({ method: 'GET', payload });
      const j = resp?.data || resp;
      const list = Array.isArray(j?.rows) ? j.rows : (Array.isArray(j?.data) ? j.data : []);
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
        // For booking list, values are top-level keys
        const values = (r && r.values) ? r.values : (r || {});
        const fu = p.followUp || {};
        // Serial helpers (quotation vs jobcard)
        const serial = (() => {
          if (isJobcard) {
            return (
              fv.jcNo || fv.JCNo || p.jcNo || p.JCNo || fv.serialNo || p.serialNo || '-'
            );
          }
          if (isBooking) {
            return (
              fv.bookingId || p.bookingId || values['Booking ID'] || values['Booking_Id'] || values['Booking Id'] || '-'
            );
          }
          // quotation
          return fv.serialNo || p.serialNo || values['Quotation No.'] || values['Quotation No'] || values['Serial'] || '-';
        })();
        const vehicle = [
          p.company || fv.company || values.Company,
          p.model || fv.bikeModel || fv.model || values.Model,
          p.variant || fv.variant || values.Variant,
        ].filter(Boolean).join(' ');
        // Prefer trimmed branch for display; filtering uses `norm`
        const branchDisp = (fv.branch || p.branch || values.Branch || values['Branch Name'] || '-');
        return {
          key: serial || i,
          serialNo: serial || '-',
          name: fv.name || values.Customer_Name || values['Customer Name'] || values.Customer || values.Name || '-',
          mobile: fv.mobile || values.Mobile || values['Mobile Number'] || values.Phone || '-',
          vehicle,
          branch: String(branchDisp || '-').trim(),
          executive: fv.executive || fu.assignedTo || values.Executive || '-',
          followUpAt: fu.at ? dayjs(fu.at) : null,
          // Make notes resilient to varying key names from webhook/sheet
          followUpNotes: fu.notes || p.notes || p.closeNotes || fv.remarks || p.remarks || values['Follow-up Notes'] || values['Follow Up Notes'] || values['Notes'] || '',
          closeReason: fu.closeReason || p.closeReason || fv.closeReason || '',
          status: (() => {
            const s = fu.status || p.status || fv.status || values.Status || values['Booking Status'] || '';
            return String(s || 'pending').toLowerCase();
          })(),
          price: Number((fv.onRoadPrice ?? p.onRoadPrice ?? fv.price ?? p.price) || 0),
          brand: (p.brand || '').toUpperCase() || 'SHANTHA',
          remarks: fv.remarks || p.remarks || values.Remarks || values.remarks || '',
          jcNo: fv.jcNo || p.jcNo || values['JC No'] || values['JC No.'] || values['Job Card No'] || serial || '-',
          regNo: fv.regNo || values['Vehicle No'] || values['Vehicle_No'] || '',
          model: fv.model || values.Model || '',
          amount: fv.amount || values['Collected Amount'] || values.Amount || 0,
          availability: values['Chassis Availability'] || values['Availability'] || values['Stock'] || values['Stock Status'] || (p?.vehicle?.availability || fv?.vehicle?.availability || ''),
          payload: p,
          values,
        };
      });
      // Client-side filtering as a fallback (in case webhook returns unfiltered rows)
      const startToday = dayjs().startOf('day');
      const endToday = dayjs().endOf('day');
      const filtered = items.filter((it) => {
        const itB = norm(it.branch);
        const meB = norm(me.branch || allowedBranches[0] || '');

        // Strict branch gate for non-admin roles
        if (!['owner','admin'].includes(userRole)) {
          if (!meB || itB !== meB) return false;
        } else {
          // Admins can opt into strict view with the toggle
          if (branchOnly && meB && itB !== meB) return false;
        }
        // Do not filter by executive name (per requirement)
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

  useEffect(() => { if (webhookUrl) fetchFollowUps(); }, [webhookUrl, filter, mineOnly, branchOnly, me.branch, me.name, mode, userRole, allowedBranches.length]);

  const updateFollowUp = async (serialNo, patch) => {
    try {
      // Ensure branch travels with update (some GAS scripts depend on it)
      const withBranch = {
        branch: branchOnly ? (me.branch || allowedBranches[0] || '') : (patch?.branch || ''),
        ...patch,
      };
      // Normalise notes fields for maximum compatibility with various GAS handlers
      if (withBranch?.followUp?.notes) {
        const n = withBranch.followUp.notes;
        withBranch.notes = withBranch.notes ?? n;           // top-level alias
        withBranch.followupNotes = withBranch.followupNotes ?? n; // alt key
        withBranch.remarks = withBranch.remarks ?? n;       // some sheets store as remarks
      }
      if (withBranch?.closeNotes) {
        const cn = withBranch.closeNotes;
        withBranch.notes = withBranch.notes ?? cn;
        withBranch.followupNotes = withBranch.followupNotes ?? cn;
        withBranch.remarks = withBranch.remarks ?? cn;
      }
      const resp = await callWebhook({ method: 'POST', payload: { action: 'updateFollowup', serialNo, patch: withBranch } });
      const j = resp?.data || resp;
      if (!j?.success) throw new Error('Failed');
      message.success('Updated');
      fetchFollowUps();
    } catch  {
      message.error('Update failed');
    }
  };

  const columns = isJobcard ? [
    { title: 'JC No.', dataIndex: 'serialNo', key: 'serialNo', width: 160 },
    { title: 'Customer', dataIndex: 'name', key: 'name', width: 180 },
    { title: 'Mobile', dataIndex: 'mobile', key: 'mobile', width: 140 },
    { title: 'Notes', dataIndex: 'followUpNotes', key: 'followUpNotes', ellipsis: true },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (_, r) => (
      <Tooltip title={r.closeReason || r.followUpNotes || ''}>
        <Tag color={STATUS_COLOR[r.status] || 'default'}>{STATUS_LABEL[r.status] || r.status}</Tag>
      </Tooltip>
    ) },
    { title: 'Branch', dataIndex: 'branch', key: 'branch', width: 160 },
    {
      title: 'Actions', key: 'actions',
      render: (_, r) => (
        <Space>
          <Button size="small" type="primary" onClick={() => setPostModal({ open: true, row: r })}>Post Service</Button>
          <Button size="small" onClick={() => setPrefillModal({ open: true, row: r })}>Open Prefilled JC</Button>
          <Button size="small" onClick={() => setReschedule({ open: true, serial: r.serialNo, at: r.followUpAt || dayjs(), notes: r.followUpNotes || '' })}>Reschedule</Button>
        </Space>
      ),
    }
  ] : (isBooking ? [
    { title: 'Booking ID', dataIndex: 'serialNo', key: 'serialNo', width: 160 },
    { title: 'Customer', dataIndex: 'name', key: 'name', width: 180 },
    { title: 'Mobile', dataIndex: 'mobile', key: 'mobile', width: 140 },
    { title: 'Vehicle', dataIndex: 'vehicle', key: 'vehicle', width: 220, ellipsis: true },
    { title: 'Availability', dataIndex: 'availability', key: 'availability', width: 130 },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (_, r) => (
      <Tooltip title={r.followUpNotes || ''}>
        <Tag color={STATUS_COLOR[r.status] || 'default'}>{STATUS_LABEL[r.status] || r.status}</Tag>
      </Tooltip>
    ) },
    { title: 'Branch', dataIndex: 'branch', key: 'branch', width: 160 },
  ] : [
    // Quotation ordering: Quotation_ID, Customer, Mobile, Notes, Status, Actions, Remarks
    { title: 'Quotation ID', dataIndex: 'serialNo', key: 'serialNo', width: 160 },
    { title: 'Customer', dataIndex: 'name', key: 'name', width: 180 },
    { title: 'Mobile', dataIndex: 'mobile', key: 'mobile', width: 140 },
    { title: 'Notes', dataIndex: 'followUpNotes', key: 'followUpNotes', ellipsis: true },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (_, r) => (
      <Tooltip title={r.closeReason || r.followUpNotes || ''}>
        <Tag color={STATUS_COLOR[r.status] || 'default'}>{STATUS_LABEL[r.status] || r.status}</Tag>
      </Tooltip>
    ) },
    {
      title: 'Actions', key: 'actions',
      render: (_, r) => (
        <Space>
          <Tooltip title="Mark done/converted with reason">
            <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => setClosing({ open: true, serial: r.serialNo, status: 'converted', reason: '', notes: '' })}>
              Done
            </Button>
          </Tooltip>
          <Button size="small" onClick={() => setReschedule({ open: true, serial: r.serialNo, at: r.followUpAt || dayjs(), notes: r.followUpNotes || '' })}>Reschedule</Button>
        </Space>
      ),
    },
    { title: 'Remarks', dataIndex: 'remarks', key: 'remarks', render: (t) => (
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(t || '-')}
      </div>
    ) },
    { title: 'Branch', dataIndex: 'branch', key: 'branch', width: 160 },
  ]);

  return (
    <ErrorBoundary>
      <div>
      <Space style={{ marginBottom: 24 }} wrap>
        <Select
          value={filter}
          onChange={setFilter}
          style={{ minWidth: 130 }}
          options={[
            { value: 'all', label: 'All' },
            { value: 'today', label: 'Due Today' },
            { value: 'overdue', label: 'Overdue' },
            { value: 'upcoming', label: 'Upcoming' },
            
          ]}
        />
        {/* Only admins/owners can switch branch scope; staff locked to own branch */}
        {['owner','admin'].includes(userRole) && (
          <Select
            value={branchOnly ? 'mybranch' : 'all'}
            onChange={(v)=>setBranchOnly(v==='mybranch')}
            options={[{value:'mybranch',label:'My Branch'},{value:'all',label:'All Branches'}]}
          />
        )}
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
          pageSizeOptions: ['25','50','75','100'],
          onChange: (p, ps) => {
            setPage(p);
            if (ps !== pageSize) setPageSize(ps);
          },
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
        }}
        scroll={{ x: true }}
      />

      {/* Inline modals for Jobcard follow-ups */}
      {isJobcard && (
        <>
          <PostServiceQuickModal
            open={postModal.open}
            onClose={() => setPostModal({ open: false, row: null })}
            row={postModal.row}
            webhookUrl={webhookUrl}
          />
          <JobCardInlineModal
            open={prefillModal.open}
            onClose={() => setPrefillModal({ open: false, row: null })}
            initialValues={(prefillModal.row?.payload && prefillModal.row.payload.formValues) ? prefillModal.row.payload : (prefillModal.row ? { formValues: {
              jcNo: prefillModal.row.jcNo || prefillModal.row.serialNo,
              branch: prefillModal.row.branch,
              executive: prefillModal.row.executive,
              regNo: prefillModal.row.regNo,
              model: prefillModal.row.model,
              custName: prefillModal.row.name,
              custMobile: prefillModal.row.mobile,
              serviceType: prefillModal.row.serviceType,
              vehicleType: prefillModal.row.vehicleType,
              obs: prefillModal.row.followUpNotes,
            } } : null)}
          />
        </>
      )}

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

      <Modal
        title={`Mark Done – ${closing.serial || ''}`}
        open={closing.open}
        onCancel={() => setClosing({ open: false, serial: null, status: 'converted', details: '', boughtFrom: '', offer: '' })}
        onOk={async () => {
          const patch = {
            status: closing.status || 'converted',
            closeReason: closing.status || 'converted',
            closeNotes: closing.details || '',
            closedAt: new Date().toISOString(),
          };
          if (closing.status === 'purchased_elsewhere') {
            patch.purchasedElsewhere = {
              boughtFrom: closing.boughtFrom || '',
              offer: closing.offer || '',
            };
          }
          await updateFollowUp(closing.serial, patch);
          setClosing({ open: false, serial: null, status: 'converted', details: '', boughtFrom: '', offer: '' });
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select
            style={{ width: '100%' }}
            value={closing.status}
            onChange={(v)=>setClosing(s=>({...s, status:v}))}
            options={[
              { value: 'converted', label: 'Converted (Booked/Purchased)' },
              { value: 'not_interested', label: 'Not Interested' },
              { value: 'unreachable', label: 'Unreachable' },
              { value: 'purchased_elsewhere', label: 'Purchased SomeWhereElse' },

            ]}
          />
          {closing.status === 'purchased_elsewhere' && (
            <>
              <Input placeholder="Bought From" value={closing.boughtFrom} onChange={(e)=>setClosing(s=>({...s, boughtFrom:e.target.value}))} />
               </>
          )}
          <Input.TextArea rows={2} placeholder="Notes" value={closing.details} onChange={(e)=>setClosing(s=>({...s, details:e.target.value}))} />
        </Space>
      </Modal>
      </div>
    </ErrorBoundary>
  );
}
