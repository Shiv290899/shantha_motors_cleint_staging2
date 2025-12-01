import React, { useEffect, useState } from 'react';
import { Button, Table, Space, Tag, Select, DatePicker, message, Modal, Input, Tooltip, Popover } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { GetCurrentUser } from "../apiCalls/users";
import { saveBookingViaWebhook, saveJobcardViaWebhook } from "../apiCalls/forms";

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
  const [hasCache, setHasCache] = useState(false);
  const [filter, setFilter] = useState('all'); // today | overdue | upcoming | all
  // Show follow-ups based on Branch only (not executive)
  // Set to false so we never filter by executive name
  const [mineOnly,] = useState(false);
  const [branchOnly, setBranchOnly] = useState(true);
  // pagination (controlled to allow changing page size)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10); // target: 10 rows per page for snappy loads
  // Jobcard-only status filter: all | pending | completed
  const [jobStatus, setJobStatus] = useState('all');
  // Jobcard: always show every row for the branch (no completed toggle)

  const [me, setMe] = useState({ name: '', branch: '' });
  const [userRole, setUserRole] = useState('');
  const [allowedBranches, setAllowedBranches] = useState([]); // names only

  const [reschedule, setReschedule] = useState({ open: false, serial: null, at: null, notes: '' });
  const [closing, setClosing] = useState({ open: false, serial: null, status: 'converted', details: '', boughtFrom: '', offer: '' });
 
  // No inline actions/modal for Jobcard follow-ups as requested

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

  // Jobcard: force filter to 'all' so nothing gets hidden by date
  React.useEffect(() => {
    if (isJobcard && filter !== 'all') setFilter('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJobcard]);

  const callWebhook = async ({ method = 'GET', payload }) => {
    if (isJobcard) {
      return await saveJobcardViaWebhook({ webhookUrl, method, payload });
    }
    return await saveBookingViaWebhook({ webhookUrl, method, payload });
  };

  // Cache key (tab + filters + pagination + branch)
  const cacheKey = React.useMemo(() => {
    const keyObj = {
      mode: modeKey,
      filter,
      branchOnly,
      jobStatus,
      page,
      pageSize,
      branch: me?.branch || '',
    };
    return `FollowUps:${JSON.stringify(keyObj)}`;
  }, [modeKey, filter, branchOnly, jobStatus, page, pageSize, me?.branch]);

  // Seed from cache for instant tab switch
  useEffect(() => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) { setHasCache(false); return; }
      const cached = JSON.parse(raw);
      if (cached && Array.isArray(cached.rows)) {
        setRows(cached.rows);
        setHasCache(true);
      } else { setHasCache(false); }
    } catch { setHasCache(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  // Minimal Google Drive helper for booking file previews
  const extractDriveId = (u) => {
    try {
      const url = new URL(u);
      if (url.hostname.includes('drive.google.com')) {
        const parts = url.pathname.split('/');
        const i = parts.indexOf('d');
        if (i >= 0 && parts[i + 1]) return parts[i + 1];
        const id = url.searchParams.get('id');
        if (id) return id;
      }
    } catch { 

    //skfdv
    }
    const m = String(u || '').match(/[?&]id=([^&]+)/);
    return m ? m[1] : null;
  };
  const driveLinks = (u) => {
    if (!u) return { view: '', download: '', embed: '' };
    const id = extractDriveId(u);
    if (!id) return { view: u, download: u, embed: u };
    return {
      view: `https://drive.google.com/uc?export=view&id=${id}`,
      download: `https://drive.google.com/uc?export=download&id=${id}`,
      embed: `https://drive.google.com/file/d/${id}/preview`,
    };
  };
  const LinkCell = ({ url }) => {
    if (!url) return <span style={{ color: '#999' }}>—</span>;
    const { view, download, embed } = driveLinks(url);
    const content = (
      <div style={{ width: 320 }}>
        <div style={{ height: 220, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
          <iframe src={embed} title="preview" width="100%" height="100%" style={{ display: 'block', border: 0 }} allow="fullscreen" />
        </div>
        <Space>
          <a href={view} target="_blank" rel="noopener">Open</a>
          <a href={download}>Download</a>
        </Space>
      </div>
    );
    return (
      <Space size={6}>
        <Popover content={content} title="Preview" trigger="click">
          <Button size="small" title='Preview' aria-label='Preview'>🔍</Button>
        </Popover>
        <a href={download} title='Download' aria-label='Download'>⬇️</a>
      </Space>
    );
  };

  // Try to derive a usable file URL from payload or raw values
  const pickFileUrl = (payload, values) => {
    const v = values || {};
    const p = payload || {};
    const keys = [
      'File URL','File','Document URL','Document','Doc URL','Doc','Drive URL','Drive',
      'fileUrl','file','documentUrl','document','driveUrl'
    ];
    for (const k of keys) {
      const val = v[k] ?? p[k];
      if (typeof val === 'string' && val.trim()) return val.trim();
    }
    // Arrays inside payload: files, documents, attachments
    const arrays = [p.files, p.documents, p.attachments, p.docs];
    for (const arr of arrays) {
      if (Array.isArray(arr)) {
        const s = arr.find((x) => typeof x === 'string' && x.trim());
        if (s) return s.trim();
        const o = arr.find((x) => x && typeof x.url === 'string' && x.url.trim());
        if (o) return o.url.trim();
      }
    }
    // Last resort: scan all string fields for a plausible http(s) link
    const scan = (obj) => {
      try {
        for (const k of Object.keys(obj || {})) {
          const val = obj[k];
          if (typeof val === 'string' && /^https?:\/\//i.test(val)) return val;
        }
      } catch {
        //sdh
      }
      return '';
    };
    return scan(v) || scan(p) || '';
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
      const JOB_SECRET = import.meta.env?.VITE_JOBCARD_GAS_SECRET || '';
      const payload = isBooking ? (() => {
        // Branch-wise followups for Booking too (do not filter by executive)
        const meBranch = (me.branch || allowedBranches[0] || '');
        const shouldRestrict = !['owner','admin'].includes(userRole) ? true : !!branchOnly;
        const base = BOOKING_SECRET ? { action: 'list', page, pageSize, secret: BOOKING_SECRET } : { action: 'list', page, pageSize };
        return shouldRestrict ? { ...base, branch: meBranch } : base;
      })() : (() => {
        // Jobcard: fetch full list for the branch, not just followups
        const meBranch = (me.branch || allowedBranches[0] || '');
        const shouldRestrict = !['owner','admin'].includes(userRole) ? true : !!branchOnly;
        return {
          action: 'list',
          branch: shouldRestrict ? meBranch : '',
          page,
          pageSize,
        };
      })();
      let resp = await callWebhook({ method: 'GET', payload }).catch(() => null);
      let j = resp?.data || resp || {};
      let list = Array.isArray(j?.rows) ? j.rows : (Array.isArray(j?.data) ? j.data : []);
      // For jobcard we already call action=list above
      // Normalize various row shapes from webhook
      const asPayload = (r) => {
        if (!r) return null;
        // Direct object payload
        if (r.payload && typeof r.payload === 'object') return r.payload;
        // Stringified JSON payload at r.payload
        if (typeof r.payload === 'string') {
          try { return JSON.parse(r.payload); } catch { /* ignore */ }
        }
        // Payload stored under values.Payload (common pattern in GAS list)
        const payloadStr = (r.values && (r.values.Payload || r.values['payload'] || r.values['PAYLOAD'])) || r.Payload || r['PAYLOAD'];
        if (typeof payloadStr === 'string') {
          try { return JSON.parse(payloadStr); } catch { /* ignore */ }
        }
        // Some handlers return the payload shape directly
        if (r.formValues && (r.followUp || r.savedAt || r.postServiceAt)) return r;
        return null;
      };
      const parseTime = (v) => {
        if (v === null || v === undefined || v === '') return null;
        try {
          // numeric millis or numeric-like string
          if (typeof v === 'number') {
            const d = dayjs(v);
            return d.isValid() ? d : null;
          }
          const s = String(v).trim();
          if (!s) return null;
          const num = Number(s);
          if (!Number.isNaN(num) && s.length >= 10) {
            const d = dayjs(num);
            if (d.isValid()) return d;
          }
          // Try native Date first
          const d1 = new Date(s);
          if (!Number.isNaN(d1.getTime())) return dayjs(d1);
          // Try DD/MM/YYYY with optional time + AM/PM
          const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
          if (m) {
            let a = parseInt(m[1], 10), b = parseInt(m[2], 10), y = parseInt(m[3], 10);
            if (y < 100) y += 2000;
            let month, day;
            if (a > 12) { day = a; month = b - 1; } else { month = a - 1; day = b; }
            let hh = m[4] ? parseInt(m[4], 10) : 0;
            const mm = m[5] ? parseInt(m[5], 10) : 0;
            const ss = m[6] ? parseInt(m[6], 10) : 0;
            const ap = (m[7] || '').toUpperCase();
            if (ap === 'PM' && hh < 12) hh += 12;
            if (ap === 'AM' && hh === 12) hh = 0;
            const d = new Date(y, month, day, hh, mm, ss);
            if (!Number.isNaN(d.getTime())) return dayjs(d);
          }
          // Fallback
          const d2 = dayjs(s);
          return d2.isValid() ? d2 : null;
        } catch { return null; }
      };

      const pickFirst = (...vals) => vals.find((x) => typeof x === 'string' ? x.trim() : x) || null;

      const items = list.map((r, i) => {
        const p = asPayload(r) || {};
        // If booking payload stored a nested rawPayload JSON string, parse it for timestamps
        let rp = null;
        try {
          if (typeof p.rawPayload === 'string') rp = JSON.parse(p.rawPayload);
          else if (p.rawPayload && typeof p.rawPayload === 'object') rp = p.rawPayload;
        } catch { rp = null; }
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
        // Determine post-service completion for jobcard
        const postServiced = (() => {
          // Stricter completion detection to avoid hiding rows prematurely
          if (p.postServiceAt) return true;
          // Consider completed if payments[] has any positive amount
          if (Array.isArray(p.payments) && p.payments.some(x => Number(x?.amount || 0) > 0)) return true;
          // Fallback to sheet columns only if explicit timestamp/flag present
          const postAt = values['Post Service At'] || values['PostServiceAt'] || values['Post_Service_At'];
          if (postAt) return true;
          const vs = (k) => String(values[k] || '').trim().toLowerCase();
          if (['yes','done','completed','true'].includes(vs('Post Service'))) return true;
          return false;
        })();

        // Compute a unified sort time: prefer latest save/post-service timestamps
        // Be liberal about possible key names and formats across different GAS deployments
        let rawTime = pickFirst(
          // explicit follow-up / post-service/saved in payload
          p.postServiceAt, p.savedAt, p.ts, p.tsMs, p.createdAt,
          // nested booking rawPayload timestamps
          rp?.ts, rp?.createdAt,
          // sheet/common columns (case and spacing variants)
          values['Post Service At'], values['PostServiceAt'], values['Post_Service_At'],
          values['Saved At'], values['savedAt'],
          values['Timestamp'], values['timestamp'], values['TS'],
          values['DateTime'], values['Date Time'], values['Date_Time'], values['Submitted At'], values['SubmittedAt'], values['submittedAt'],
          values['Created At'], values['CreatedAt'], values['createdAt'],
          values['Time'], values['Date'],
          // some wrappers return numeric milliseconds
          r?.tsMs, r?.ts, r?.dateTimeIso
        );
        if ((rawTime === null || rawTime === undefined || rawTime === '') && (values['Date'] && values['Time'])) {
          rawTime = `${values['Date']} ${values['Time']}`;
        }
        const savedAt = (() => {
          if (rawTime === null || rawTime === undefined || rawTime === '') return null;
          // numeric ms (or numeric-like string)
          if (typeof rawTime === 'number') return parseTime(rawTime);
          const numlike = Number(rawTime);
          if (!Number.isNaN(numlike) && String(rawTime).trim() !== '') {
            // treat as millis if reasonably large
            if (numlike > 10_000_000) return parseTime(numlike);
          }
          return parseTime(rawTime);
        })();
        const fallbackFuAt = fu.at ? dayjs(fu.at) : null;
        const sortAt = savedAt || fallbackFuAt;
        const sortAtMs = sortAt && typeof sortAt.valueOf === 'function' ? sortAt.valueOf() : 0;

        return {
          key: serial || i,
          serialNo: serial || '-',
          name: fv.custName || fv.name || values.Customer_Name || values['Customer Name'] || values.Customer || values.Name || '-',
          mobile: fv.custMobile || fv.mobile || values.Mobile || values['Mobile Number'] || values.Phone || '-',
          vehicle,
          branch: String(branchDisp || '-').trim(),
          executive: fv.executive || fu.assignedTo || values.Executive || '-',
          followUpAt: fu.at ? dayjs(fu.at) : null,
          dateAt: fallbackFuAt || savedAt || null,
          sortAtMs,
          // Make notes resilient to varying key names from webhook/sheet
          followUpNotes: fu.notes || p.notes || p.closeNotes || fv.remarks || p.remarks || values['Follow-up Notes'] || values['Follow Up Notes'] || values['Notes'] || '',
          closeReason: fu.closeReason || p.closeReason || fv.closeReason || '',
          // For jobcard: force 'pending' until post-serviced; once post-serviced, we will hide it
          status: isJobcard ? (postServiced ? 'completed' : 'pending') : (() => {
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
          fileUrl: pickFileUrl(p, values),
          postServiced,
          payload: p,
          values,
        };
      });
      // Client-side filtering as a fallback (in case webhook returns unfiltered rows)
      const startToday = dayjs().startOf('day');
      const endToday = dayjs().endOf('day');
      const filtered = isJobcard ? (() => {
        let arr = items;
        if (jobStatus !== 'all') {
          const want = String(jobStatus).toLowerCase();
          arr = arr.filter((it) => String(it.status || '').toLowerCase() === want);
        }
        return arr;
      })() : items.filter((it) => {
        // For quotation follow-ups, hide rows that are marked done/closed (non-pending)
        if (!isJobcard && !isBooking) {
          const st = String(it.status || '').toLowerCase();
          if (st && st !== 'pending') return false;
        }
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
      // Always show most recent follow-ups first by scheduled time
      filtered.sort((a, b) => {
        const tb = Number(b.sortAtMs || 0);
        const ta = Number(a.sortAtMs || 0);
        return tb - ta;
      });
      setRows(filtered);
      try { localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), rows: filtered })); } catch {
        //bgahdh
      }
      //dkl
      setPage(1); // reset to first page after refresh/filters
    } catch (e) {
      console.warn('followups fetch failed', e);
      message.error('Could not fetch follow-ups. Check the Apps Script.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch when ready: ensure branch is resolved for staff before first call
  useEffect(() => {
    if (!webhookUrl) return;
    const needsBranch = !['owner','admin'].includes(userRole) || !!branchOnly;
    const hasBranch = Boolean(String(me.branch || allowedBranches[0] || '').trim());
    if (needsBranch && !hasBranch) {
      // Wait for branch resolution to avoid empty first render
      return;
    }
    fetchFollowUps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhookUrl, filter, mineOnly, branchOnly, me.branch, mode, userRole, allowedBranches.length, jobStatus]);

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

  // Render up to 3 lines for Notes with CSS line clamp
  const clamp3 = (text) => (
    <span
      style={{
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: 3,
        overflow: 'hidden',
        whiteSpace: 'normal',
      }}
    >
      {String(text || '')}
    </span>
  );

  const fmt = (d) => (d && d.isValid && d.isValid()) ? d.format('YY-MM-DD HH:mm') : '—';

  const columns = isJobcard ? [
    { title: 'Date', dataIndex: 'dateAt', key: 'date', width:70, render: (_, r) => fmt(r.dateAt) },
    { title: 'Vehicle No.', dataIndex: 'regNo', key: 'regNo', width: 30 },
    { title: 'Model', dataIndex: 'model', key: 'model', width: 20 },
    { title: 'Customer', dataIndex: 'name', key: 'name', width: 50 },
    { title: 'Mobile', dataIndex: 'mobile', key: 'mobile', width: 20 },
    { title: 'Status', dataIndex: 'status',width: 20, key: 'status', render: (_, r) => (
      <Tooltip title={r.closeReason || r.followUpNotes || ''}>
        <Tag color={STATUS_COLOR[r.status] || 'default'}>{STATUS_LABEL[r.status] || r.status}</Tag>
      </Tooltip>
    ) },
    { title: 'Branch', dataIndex: 'branch', key: 'branch', width: 20 },
  ] : (isBooking ? [

    { title: 'Date', dataIndex: 'dateAt', key: 'date', width: 200, render: (_, r) => fmt(r.dateAt) },
    { title: 'Customer', dataIndex: 'name', key: 'name', width: 50 },
    { title: 'Mobile', dataIndex: 'mobile', key: 'mobile', width: 50 },
    { title: 'Vehicle', dataIndex: 'vehicle', key: 'vehicle', width: 50, ellipsis: true },
    { title: 'File', dataIndex: 'fileUrl', key: 'file', width: 40, render: (v)=> <LinkCell url={v} /> },
    { title: 'Availability', dataIndex: 'availability', key: 'availability', width: 50 },
    // Extended booking progress
    { title: 'Invoice', key: 'invoice', width: 50, render: (_, r) => {
      const v = (() => {
        const vals = r.values || {};
        return vals['Invoice Status'] || vals['Invoice_Status'] || vals['invoiceStatus'] || (r.payload?.invoiceStatus) || '';
      })();
      const url = (() => {
        const vals = r.values || {};
        return vals['Invoice File URL'] || vals['Invoice_File_URL'] || vals['invoiceFileUrl'] || (r.payload?.invoiceFileUrl) || '';
      })();
      return (
        <Space size={4}>
          <Tag>{String(v || '-').replace(/_/g,' ')}</Tag>
          {url ? <a href={url} target="_blank" rel="noopener noreferrer">📎</a> : null}
        </Space>
      );
    } },
    { title: 'Insurance', key: 'insurance', width: 60, render: (_, r) => {
      const v = (() => {
        const vals = r.values || {};
        return vals['Insurance Status'] || vals['Insurance_Status'] || vals['insuranceStatus'] || (r.payload?.insuranceStatus) || '';
      })();
      const url = (() => {
        const vals = r.values || {};
        return vals['Insurance File URL'] || vals['Insurance_File_URL'] || vals['insuranceFileUrl'] || (r.payload?.insuranceFileUrl) || '';
      })();
      return (
        <Space size={4}>
          <Tag>{String(v || '-').replace(/_/g,' ')}</Tag>
          {url ? <a href={url} target="_blank" rel="noopener noreferrer">📎</a> : null}
        </Space>
      );
    } },
    { title: 'RTO', key: 'rto', width: 50, render: (_, r) => {
      const vals = r.values || {};
      const v = vals['RTO Status'] || vals['RTO_Status'] || vals['rtoStatus'] || (r.payload?.rtoStatus) || '';
      return <Tag>{String(v || '-').replace(/_/g,' ')}</Tag>;
    } },
    { title: 'Vehicle No', key: 'vehno', dataIndex: 'regNo', width: 50, render: (v, r) => {
      const vals = r.values || {};
      const reg = v || vals['Vehicle No'] || vals['Vehicle_No'] || vals['vehicleNo'] || (r.payload?.vehicleNo) || '';
      return reg || '-';
    } },
    { title: 'Status', dataIndex: 'status',width: 50, key: 'status', render: (_, r) => (
      <Tooltip title={r.followUpNotes || ''}>
        <Tag color={STATUS_COLOR[r.status] || 'default'}>{STATUS_LABEL[r.status] || r.status}</Tag>
      </Tooltip>
    ) },
    { title: 'Branch', dataIndex: 'branch', key: 'branch', width: 50 },
    
  ] : [
    // Quotation ordering: Quotation_ID, Customer, Mobile, Notes, Status, Actions, Remarks
    // Use nowrap titles to keep headers on a single line
    
    { title: 'Date', dataIndex: 'dateAt', key: 'date', width: 120, render: (_, r) => fmt(r.dateAt) },
    { title: (<span style={{ whiteSpace: 'nowrap' }}>Customer</span>), dataIndex: 'name', key: 'name', width: 180, align: 'left' },
    { title: (<span style={{ whiteSpace: 'nowrap' }}>Mobile</span>), dataIndex: 'mobile', key: 'mobile', width: 140, align: 'left' },
    { title: (<span style={{ whiteSpace: 'nowrap' }}>Notes</span>), dataIndex: 'followUpNotes', key: 'followUpNotes', width: 180, align: 'left', render: (v) => (
      <Tooltip title={String(v || '').trim() || undefined}>
        {clamp3(v)}
      </Tooltip>
    ) },
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
   
    { title: 'Branch', dataIndex: 'branch', key: 'branch', width: 160 },
    { title: (<span style={{ whiteSpace: 'nowrap' }}>Quotation ID</span>), dataIndex: 'serialNo', key: 'serialNo', width: 160, align: 'left' },
  ]);

  return (
    <ErrorBoundary>
      <div>
      <Space style={{ marginBottom: 24 }} wrap>
        {!isJobcard && (
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
        )}
        {isJobcard && (
          <Select
            value={jobStatus}
            onChange={setJobStatus}
            style={{ minWidth: 140 }}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'completed', label: 'Completed' },
            ]}
          />
        )}
        {/* Only admins/owners can switch branch scope; staff locked to own branch */}
        {['owner','admin'].includes(userRole) && (
          <Select
            value={branchOnly ? 'mybranch' : 'all'}
            onChange={(v)=>setBranchOnly(v==='mybranch')}
            options={[{value:'mybranch',label:'My Branch'},{value:'all',label:'All Branches'}]}
          />
        )}
        {/* Jobcard: we always show every row for the branch; no completed toggle */}
        <Button onClick={fetchFollowUps} loading={loading}>Refresh</Button>
      </Space>

      <Table
        rowKey={(r)=>String(r.key)}
        dataSource={rows}
        columns={columns}
        loading={loading && !hasCache}
        size="small"
        tableLayout="fixed"
        pagination={{
          current: page,
          pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10','25','50','100'],
          onChange: (p, ps) => {
            setPage(p);
            if (ps !== pageSize) setPageSize(ps);
          },
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
        }}
        scroll={{ x: true }}
      />

      {/* No jobcard inline actions/modal */}

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
