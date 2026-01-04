import React, { useEffect, useState } from 'react';
import { Button, Table, Space, Tag, Select, DatePicker, message, Modal, Input, Tooltip, Popover, Card, Typography, Segmented, Badge, Divider, Avatar, Progress, Grid } from 'antd';
import { CheckCircleOutlined, ReloadOutlined, FilterOutlined, SearchOutlined, CalendarOutlined, ShopOutlined, PhoneOutlined, FileTextOutlined, ThunderboltOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { GetCurrentUser } from "../apiCalls/users";
import { saveBookingViaWebhook, saveJobcardViaWebhook } from "../apiCalls/forms";
import { useNavigate } from "react-router-dom";
import BookingPrintQuickModal from './BookingPrintQuickModal';

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
  booked: 'green',
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
  converted: 'Booked',
  booked: 'Booked',
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

const { Title, Text } = Typography;

const pillBtn = {
  height: 32,
  padding: '0 14px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
};

const softCard = {
  borderRadius: 18,
  border: '1px solid #eef2f7',
  boxShadow: '0 10px 34px rgba(15, 23, 42, 0.08)',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.92))',
};

const softPanel = {
  borderRadius: 16,
  border: '1px solid #eef2f7',
  background: 'rgba(255,255,255,0.9)',
  boxShadow: '0 10px 26px rgba(15, 23, 42, 0.06)',
};

const kpiCard = {
  borderRadius: 16,
  border: '1px solid #eef2f7',
  background: 'rgba(255,255,255,0.92)',
  boxShadow: '0 8px 22px rgba(15, 23, 42, 0.05)',
};

const kpiNum = { fontSize: 22, fontWeight: 800, lineHeight: 1 };
const kpiLabel = { fontSize: 11, color: '#64748b', marginTop: 6 };

/**
 * FollowUps list component
 * Props:
 * - mode: 'quotation' | 'jobcard' (default: 'quotation')
 * - webhookUrl: GAS URL for the selected mode
 */
export default function FollowUps({ mode = 'quotation', webhookUrl }) {
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [loading, setLoading] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [allRows, setAllRows] = useState([]);
  const [hasCache, setHasCache] = useState(false);
  const [filter, setFilter] = useState('all'); // today | overdue | upcoming | all
  // Show follow-ups based on Branch only (not executive)
  // Set to false so we never filter by executive name
  const [mineOnly,] = useState(false);
  const [branchOnly, setBranchOnly] = useState(true);
  // Fetch all rows in one go for staff follow-ups
  const LIST_PAGE_SIZE = 10000;
  // Jobcard-only status filter: all | pending | completed
  const [jobStatus, setJobStatus] = useState('all');
  // Jobcard: always show every row for the branch (no completed toggle)

  const [me, setMe] = useState({ name: '', branch: '' });
  const [userRole, setUserRole] = useState('');
  const [allowedBranches, setAllowedBranches] = useState([]); // names only

  const [reschedule, setReschedule] = useState({ open: false, serial: null, at: null, notes: '' });
  const [closing, setClosing] = useState({ open: false, serial: null, status: 'converted', details: '', boughtFrom: '', offer: '' });
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [closingSaving, setClosingSaving] = useState(false);
  const [printModal, setPrintModal] = useState({ open: false, row: null });
  const [q, setQ] = useState('');
  const [dateRange, setDateRange] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const BOOKING_SECRET = import.meta.env?.VITE_BOOKING_GAS_SECRET || '';
  // Jobcard follow-ups now include a Post Service action

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
  const isQuotation = !isJobcard && !isBooking;

  // Jobcard: force filter to 'all' so nothing gets hidden by date
  React.useEffect(() => {
    if (isJobcard && filter !== 'all') setFilter('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJobcard]);
  React.useEffect(() => {
    if (isQuotation && filter === 'overdue') setFilter('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQuotation]);

  const callWebhook = async ({ method = 'GET', payload }) => {
    if (isJobcard) {
      return await saveJobcardViaWebhook({ webhookUrl, method, payload });
    }
    return await saveBookingViaWebhook({ webhookUrl, method, payload });
  };

  // Cache key (tab + filters + branch)
  const cacheKey = React.useMemo(() => {
    const keyObj = {
      mode: modeKey,
      filter,
      branchOnly,
      jobStatus,
      branch: me?.branch || '',
    };
    return `FollowUps:${JSON.stringify(keyObj)}`;
  }, [modeKey, filter, branchOnly, jobStatus, me?.branch]);

  const toDayjs = (v) => {
    if (!v) return null;
    if (dayjs.isDayjs(v)) return v;
    const d = dayjs(v);
    return d.isValid() ? d : null;
  };

  const hydrateCachedRows = (rows = []) => rows.map((r) => {
    const followUpAt = toDayjs(r.followUpAt);
    const dateAt = toDayjs(r.dateAt);
    return {
      ...r,
      followUpAt,
      dateAt,
      sortAtMs: r.sortAtMs || (dateAt ? dateAt.valueOf() : 0),
    };
  });

  // Seed from cache for instant tab switch
  useEffect(() => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) { setHasCache(false); return; }
      const cached = JSON.parse(raw);
      if (cached && Array.isArray(cached.rows)) {
        setAllRows(hydrateCachedRows(cached.rows));
        if (cached.at) setLastRefreshedAt(dayjs(cached.at));
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
        setAllRows([]);
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
        const base = BOOKING_SECRET
          ? { action: 'list', page: 1, pageSize: LIST_PAGE_SIZE, secret: BOOKING_SECRET }
          : { action: 'list', page: 1, pageSize: LIST_PAGE_SIZE };
        return shouldRestrict ? { ...base, branch: meBranch } : base;
      })() : (() => {
        // Jobcard: fetch full list for the branch, not just followups
        const meBranch = (me.branch || allowedBranches[0] || '');
        const shouldRestrict = !['owner','admin'].includes(userRole) ? true : !!branchOnly;
        return {
          action: 'list',
          branch: shouldRestrict ? meBranch : '',
          page: 1,
          pageSize: LIST_PAGE_SIZE,
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
          if (dayjs.isDayjs(v)) return v.isValid() ? v : null;
          if (v instanceof Date) {
            const d = dayjs(v);
            return d.isValid() ? d : null;
          }
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
          // Try DD/MM/YYYY or DD-MM-YYYY with optional time + AM/PM
          const m = s.match(/^(\d{1,2})([/-])(\d{1,2})\2(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
          if (m) {
            const sep = m[2];
            let a = parseInt(m[1], 10), b = parseInt(m[3], 10), y = parseInt(m[4], 10);
            if (y < 100) y += 2000;
            let month, day;
            if (sep === '-') { day = a; month = b - 1; }
            else if (a > 12) { day = a; month = b - 1; } else { month = a - 1; day = b; }
            let hh = m[5] ? parseInt(m[5], 10) : 0;
            const mm = m[6] ? parseInt(m[6], 10) : 0;
            const ss = m[7] ? parseInt(m[7], 10) : 0;
            const ap = (m[8] || '').toUpperCase();
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
        const fu = p.followUp || p.followup || p.follow_up || {};
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
        const company = p.company || fv.company || values.Company || '';
        const model = p.model || p.vehicle?.model || fv.bikeModel || fv.model || values.Model || '';
        const variant = p.variant || p.vehicle?.variant || fv.variant || values.Variant || '';
        const color = p.color || p.vehicle?.color || fv.color || values.Color || values.Colour || values['Vehicle Color'] || values['Vehicle Colour'] || '';
        const vehicle = [company, model, variant].filter(Boolean).join(' ');
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
        let followUpAtRaw = (
          fu.at ?? fu.followUpAt ?? fu.followupAt ?? fu.date ?? fu.datetime ??
          p.followUpAt ?? p.followupAt ?? p.followUpDate ?? p.followupDate ??
          values['Follow-up At'] ?? values['Follow Up At'] ?? values['Followup At'] ??
          values['Follow-up Date'] ?? values['Follow Up Date'] ?? values['Followup Date'] ??
          values['Next Follow-up'] ?? values['Next Follow Up'] ?? values['Next Followup'] ??
          values['Follow-up'] ?? values['Follow Up'] ?? values['Followup']
        );
        if (!followUpAtRaw) {
          const fuDate = values['Follow-up Date'] || values['Follow Up Date'] || values['Followup Date'] || '';
          const fuTime = values['Follow-up Time'] || values['Follow Up Time'] || values['Followup Time'] || '';
          if (fuDate && fuTime) followUpAtRaw = `${fuDate} ${fuTime}`;
        }
        const fallbackFuAt = parseTime(followUpAtRaw);
        const sortAt = savedAt || fallbackFuAt;
        const sortAtMs = sortAt && typeof sortAt.valueOf === 'function' ? sortAt.valueOf() : 0;
        const createdAt = savedAt || null;

        return {
          key: serial || i,
          serialNo: serial || '-',
          bookingId: isBooking && serial && serial !== '-' ? serial : '',
          name: fv.custName || fv.name || values.Customer_Name || values['Customer Name'] || values.Customer || values.Name || '-',
          mobile: fv.custMobile || fv.mobile || values.Mobile || values['Mobile Number'] || values.Phone || '-',
          vehicle,
          branch: String(branchDisp || '-').trim(),
          executive: fv.executive || fu.assignedTo || values.Executive || '-',
          followUpAt: fallbackFuAt,
          dateAt: createdAt || fallbackFuAt || null,
          sortAtMs,
          // Follow-up notes only (do not fall back to remarks)
          followUpNotes: (
            fu.notes ??
            p.followupNotes ??
            p.followUpNotes ??
            values['Follow-up Notes'] ??
            values['Follow Up Notes'] ??
            values['Followup Notes'] ??
            ''
          ),
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
          model,
          variant,
          color,
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
        const d = (it.followUpAt && it.followUpAt.isValid && it.followUpAt.isValid()) ? it.followUpAt : it.dateAt;
        if (!d || !d.isValid()) return false;
        if (filter === 'today') return !d.isBefore(startToday) && !d.isAfter(endToday);
        if (filter === 'overdue') return d.isBefore(startToday);
        if (filter === 'upcoming') return d.isAfter(endToday);
        return true;
      });
      const statusRank = (s) => (String(s || '').toLowerCase() === 'pending' ? 0 : 1);
      // Pending first, then others; most recent first within each group
      filtered.sort((a, b) => {
        const ra = statusRank(a.status);
        const rb = statusRank(b.status);
        if (ra !== rb) return ra - rb;
        const tb = Number(b.sortAtMs || 0);
        const ta = Number(a.sortAtMs || 0);
        return tb - ta;
      });
      setAllRows(filtered);
      setLastRefreshedAt(dayjs());
      try { localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), rows: filtered })); } catch {
        //bgahdh
      }
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
      }
      if (withBranch?.closeNotes) {
        const cn = withBranch.closeNotes;
        withBranch.notes = withBranch.notes ?? cn;
        withBranch.followupNotes = withBranch.followupNotes ?? cn;
      }
      const resp = await callWebhook({ method: 'POST', payload: { action: 'updateFollowup', serialNo, patch: withBranch } });
      const j = resp?.data || resp;
      if (!j?.success) throw new Error('Failed');
      message.success('Updated');
      await fetchFollowUps();
      return true;
    } catch  {
      message.error('Update failed');
      return false;
    }
  };

  const buildStampedNote = (note) => {
    const ts = dayjs().format('DD-MM-YYYY HH:mm');
    const text = String(note || '').trim();
    return text ? `${ts} - ${text}` : ts;
  };

  const fmt = (d) => (d && d.isValid && d.isValid()) ? d.format('DD-MM-YYYY HH:mm') : '—';
  const stackStyle = { display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.2 };
  const lineStyle = { whiteSpace: isMobile ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: isMobile ? 'clip' : 'ellipsis' };
  const smallLineStyle = { ...lineStyle, fontSize: isMobile ? 11 : 10 };
  const twoLineClamp = {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: isMobile ? 4 : 3,
    overflow: 'hidden',
    whiteSpace: 'normal',
    fontSize: isMobile ? 9 : 8,
    lineHeight: 1,
  };

  const filteredRows = React.useMemo(() => {
    let next = Array.isArray(allRows) ? allRows.slice() : [];

    // Date range filter (uses follow-up date when available, else saved date)
    if (dateRange && dateRange[0] && dateRange[1]) {
      const start = dateRange[0].startOf('day');
      const end = dateRange[1].endOf('day');
      next = next.filter((r) => {
        const d = r.followUpAt || r.dateAt;
        if (!d || !d.isValid || !d.isValid()) return false;
        return !d.isBefore(start) && !d.isAfter(end);
      });
    }

    const needle = String(q || '').trim().toLowerCase();
    if (needle) {
      next = next.filter((r) => {
        const parts = [
          r.serialNo,
          r.bookingId,
          r.jcNo,
          r.name,
          r.mobile,
          r.branch,
          r.executive,
          r.vehicle,
          r.model,
          r.variant,
          r.color,
          r.regNo,
          r.status,
          r.remarks,
          r.followUpNotes,
          r.closeReason,
        ];
        const hay = parts.filter(Boolean).join(' ').toLowerCase();
        return hay.includes(needle);
      });
    }

    return next;
  }, [allRows, dateRange, q]);

  const summary = React.useMemo(() => {
  const rows = Array.isArray(filteredRows) ? filteredRows : [];
  const total = rows.length;

  const statusOf = (r) => String(r?.status || '').toLowerCase();

  // Pending = only pending
  const pending = rows.filter(r => statusOf(r) === 'pending').length;

  // Completed = everything NOT pending
  // (converted, completed, not_interested, unreachable, etc.)
  const completed = rows.filter(r => statusOf(r) !== 'pending').length;

  return {
    total,
    pending,
    completed,
    other: 0,
  };
}, [filteredRows]);

  useEffect(() => {
    setPage(1);
  }, [q, dateRange, filter, jobStatus, branchOnly, mode]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    if (page > maxPage) setPage(1);
  }, [filteredRows.length, page, pageSize]);

  const controlWidth = isMobile ? '100%' : undefined;
  const kpiPad = isMobile ? 10 : 12;
  const kpiMin = isMobile ? 110 : 120;
  const kpiWideMin = isMobile ? 160 : 180;
  const kpiNumStyle = isMobile ? { ...kpiNum, fontSize: 18 } : kpiNum;
  const kpiLabelStyle = isMobile ? { ...kpiLabel, fontSize: 10 } : kpiLabel;

  const openPostService = (row) => {
    const mobile = String(row?.mobile || '').replace(/\D/g, '').slice(-10);
    const jcNo = String(row?.jcNo || row?.serialNo || '').trim();
    const params = new URLSearchParams();
    params.set('autoFetch', '1');
    if (mobile) {
      params.set('mode', 'mobile');
      params.set('query', mobile);
    } else if (jcNo) {
      params.set('mode', 'jc');
      params.set('query', jcNo);
    }
    if (jcNo) params.set('jcNo', jcNo);
    const qs = params.toString();
    navigate(qs ? `/jobcard?${qs}` : '/jobcard');
  };

  const statusTagStyle = { fontSize: isMobile ? 9 : 10, lineHeight: '1.1', marginRight: 0 };
  const actionBtnStyle = { height: isMobile ? 22 : 26, padding: isMobile ? '0 8px' : '0 10px', borderRadius: 999, fontSize: isMobile ? 11 : 12, fontWeight: 700 };
  const actionBtnSecondaryStyle = { height: isMobile ? 22 : 26, padding: isMobile ? '0 8px' : '0 10px', borderRadius: 999, fontSize: isMobile ? 11 : 12 };
  const iconBtnStyle = { height: isMobile ? 20 : 18, padding: '0 6px', fontSize: isMobile ? 11 : 10 };

  const renderJobcardStatusActions = (r) => {
    const isPending = String(r.status || '').toLowerCase() === 'pending';
    const miniStack = { display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.1 };
    return (
      <div style={miniStack}>
        <Tooltip title={r.closeReason || r.followUpNotes || ''}>
          <Tag color={STATUS_COLOR[r.status] || 'default'} style={statusTagStyle}>
            {STATUS_LABEL[r.status] || r.status}
          </Tag>
        </Tooltip>
        {isPending ? (
          <Button
            size="small"
            type="primary"
            icon={<PhoneOutlined />}
            style={actionBtnStyle}
            onClick={() => openPostService(r)}
          >
            Post Service
          </Button>
        ) : (
          <span style={{ fontSize: 10, color: '#999' }}>—</span>
        )}
      </div>
    );
  };

  const renderQuotationStatusActions = (r) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.1 }}>
      <Tooltip title={r.closeReason || r.followUpNotes || ''}>
        <Tag color={STATUS_COLOR[r.status] || 'default'} style={statusTagStyle}>
          {STATUS_LABEL[r.status] || r.status}
        </Tag>
      </Tooltip>
      <div style={{ display: 'flex', gap: 4 }}>
        <Tooltip title="Mark done/booked with reason">
          <Button
            size="small"
            type="primary"
            icon={<CheckCircleOutlined />}
            style={actionBtnStyle}
            onClick={() => setClosing({ open: true, serial: r.serialNo, status: 'converted', reason: '', notes: '' })}
          >
            Done
          </Button>
        </Tooltip>
        <Button
          size="small"
          style={actionBtnSecondaryStyle}
          onClick={() => setReschedule({ open: true, serial: r.serialNo, at: r.followUpAt || dayjs(), notes: r.followUpNotes || '' })}
        >
          Reschedule
        </Button>
      </div>
    </div>
  );

  const renderBookingInvoiceInsurance = (r) => {
    const vals = r.values || {};
    const inv = vals['Invoice Status'] || vals['Invoice_Status'] || vals['invoiceStatus'] || (r.payload?.invoiceStatus) || '';
    const invUrl = vals['Invoice File URL'] || vals['Invoice_File_URL'] || vals['invoiceFileUrl'] || (r.payload?.invoiceFileUrl) || '';
    const ins = vals['Insurance Status'] || vals['Insurance_Status'] || vals['insuranceStatus'] || (r.payload?.insuranceStatus) || '';
    const insUrl = vals['Insurance File URL'] || vals['Insurance_File_URL'] || vals['insuranceFileUrl'] || (r.payload?.insuranceFileUrl) || '';
    return (
      <div style={stackStyle}>
        <div style={lineStyle}>
          <Tag color="geekblue">{String(inv || '-').replace(/_/g, ' ')}</Tag>
          {invUrl ? <a href={invUrl} target="_blank" rel="noopener noreferrer">📎</a> : null}
        </div>
        <div style={lineStyle}>
          <Tag color="cyan">{String(ins || '-').replace(/_/g, ' ')}</Tag>
          {insUrl ? <a href={insUrl} target="_blank" rel="noopener noreferrer">📎</a> : null}
        </div>
      </div>
    );
  };

  const renderBookingRtoVehicle = (r) => {
    const vals = r.values || {};
    const rto = vals['RTO Status'] || vals['RTO_Status'] || vals['rtoStatus'] || (r.payload?.rtoStatus) || '';
    const reg = r.regNo || vals['Vehicle No'] || vals['Vehicle_No'] || vals['vehicleNo'] || (r.payload?.vehicleNo) || '';
    return (
      <div style={stackStyle}>
        <div style={lineStyle}><Tag>{String(rto || '-').replace(/_/g, ' ')}</Tag></div>
        <div style={lineStyle}><Tag>{reg || '-'}</Tag></div>
      </div>
    );
  };

  const renderBookingStatusFile = (r) => (
    <div style={stackStyle}>
      <div style={lineStyle}>
        <Tooltip title={r.followUpNotes || ''}>
          <Tag color={STATUS_COLOR[r.status] || 'default'} style={statusTagStyle}>
            {STATUS_LABEL[r.status] || r.status}
          </Tag>
        </Tooltip>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <LinkCell url={r.fileUrl} />
        <Button
          size="small"
          style={iconBtnStyle}
          title="Print booking"
          aria-label="Print booking"
          onClick={() => {
            if (!r.bookingId) {
              message.warning('Booking ID missing for print');
              return;
            }
            setPrintModal({ open: true, row: r });
          }}
        >
          🖨️
        </Button>
      </div>
    </div>
  );

  const columnsDesktop = isJobcard ? [
    { title: 'Date / Branch', key: 'dateBranch', width: 130, render: (_, r) => (
      <div style={stackStyle}>
        <div style={lineStyle}>{fmt(r.dateAt)}</div>
        <div style={smallLineStyle}>{r.branch || '—'}</div>
      </div>
    ) },
    { title: 'Customer / Mobile', key: 'customerMobile', width: 140, render: (_, r) => (
      <div style={stackStyle}>
        <div style={lineStyle}>{r.name || '—'}</div>
        <div style={smallLineStyle}>{r.mobile || '—'}</div>
      </div>
    ) },
    { title: 'Model / Vehicle No', key: 'modelVehicle', width: 140, render: (_, r) => (
      <div style={stackStyle}>
        <div style={lineStyle}>{r.model || '—'}</div>
        <div style={smallLineStyle}>{r.regNo || '—'}</div>
      </div>
    ) },
    { title: 'Status + Actions', key: 'statusActions', width: 150, render: (_, r) => renderJobcardStatusActions(r) },
  ] : (isBooking ? [
    { title: 'Date / Branch', key: 'dateBranch', width: 130, render: (_, r) => (
      <div style={stackStyle}>
        <div style={lineStyle}>{fmt(r.dateAt)}</div>
        <div style={smallLineStyle}>{r.branch || '—'}</div>
      </div>
    ) },
    { title: 'Customer / Mobile', key: 'customerMobile', width: 140, render: (_, r) => (
      <div style={stackStyle}>
        <div style={lineStyle}>{r.name || '—'}</div>
        <div style={smallLineStyle}>{r.mobile || '—'}</div>
      </div>
    ) },
    { title: 'Model / Variant || Color', key: 'modelVariantColor', width: 160, render: (_, r) => {
      const model = String(r.model || '').trim();
      const variant = String(r.variant || '').trim();
      const color = String(r.color || '').trim();
      return (
        <div style={stackStyle}>
          <div style={smallLineStyle}>{[model, variant].filter(Boolean).join(' || ') || '—'}</div>
          <div style={smallLineStyle}>{color || '—'}</div>
        </div>
      );
    } },
    { title: 'Invoice + Insurance', key: 'invoiceInsurance', width: 140, render: (_, r) => renderBookingInvoiceInsurance(r) },
    { title: 'RTO + Vehicle No', key: 'rtoVehicle', width: 140, render: (_, r) => renderBookingRtoVehicle(r) },
    { title: 'Status + File', key: 'statusFile', width: 170, render: (_, r) => renderBookingStatusFile(r) },
  ] : [
    { title: 'Date / Branch', key: 'dateBranch', width: 130, render: (_, r) => (
      <div style={stackStyle}>
        <div style={lineStyle}>{fmt(r.dateAt)}</div>
        <div style={smallLineStyle}>{r.branch || '—'}</div>
      </div>
    ) },
    { title: 'Customer / Mobile', key: 'customerMobile', width: 140, render: (_, r) => (
      <div style={stackStyle}>
        <div style={lineStyle}>{r.name || '—'}</div>
        <div style={smallLineStyle}>{r.mobile || '—'}</div>
      </div>
    ) },
    { title: 'Offerings', key: 'remarks', width: 190, render: (_, r) => {
      const remarks = String(r.remarks || '').trim();
      return (
        <Tooltip title={remarks || undefined}>
          <div style={twoLineClamp}>{remarks || ''}</div>
        </Tooltip>
      );
    } },
    { title: 'Status + Actions', key: 'statusActions', width: 170, render: (_, r) => renderQuotationStatusActions(r) },
    { title: 'Follow-up Notes', key: 'followUpNotes', width: 170, render: (_, r) => {
      const notes = String(r.followUpNotes || '').trim();
      return notes ? (
        <Tooltip title={notes}>
          <div style={twoLineClamp}>{notes}</div>
        </Tooltip>
      ) : (
        <div style={twoLineClamp}></div>
      );
    } },
  ]);

  const columnsMobile = isJobcard ? [
    { title: 'Details', key: 'details', render: (_, r) => {
      const dateBranch = [fmt(r.dateAt), r.branch || '—'].filter(Boolean).join(' | ');
      const custMobile = [r.name || '—', r.mobile || '—'].filter(Boolean).join(' | ');
      const modelReg = [r.model || '—', r.regNo || '—'].filter(Boolean).join(' || ');
      return (
        <div style={stackStyle}>
          <div style={lineStyle}>{dateBranch || '—'}</div>
          <div style={smallLineStyle}>{custMobile || '—'}</div>
          <div style={smallLineStyle}>{modelReg || '—'}</div>
        </div>
      );
    } },
    { title: 'Status', key: 'statusActions', render: (_, r) => renderJobcardStatusActions(r) },
  ] : (isBooking ? [
    { title: 'Details', key: 'details', render: (_, r) => {
      const dateBranch = [fmt(r.dateAt), r.branch || '—'].filter(Boolean).join(' | ');
      const custMobile = [r.name || '—', r.mobile || '—'].filter(Boolean).join(' | ');
      const model = String(r.model || '').trim();
      const variant = String(r.variant || '').trim();
      const color = String(r.color || '').trim();
      return (
        <div style={stackStyle}>
          <div style={lineStyle}>{dateBranch || '—'}</div>
          <div style={smallLineStyle}>{custMobile || '—'}</div>
          <div style={smallLineStyle}>{[model, variant].filter(Boolean).join(' || ') || '—'}</div>
          <div style={smallLineStyle}>{color || '—'}</div>
        </div>
      );
    } },
    { title: 'Docs / Status', key: 'docsStatus', render: (_, r) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {renderBookingInvoiceInsurance(r)}
        {renderBookingRtoVehicle(r)}
        {renderBookingStatusFile(r)}
      </div>
    ) },
  ] : [
    { title: 'Details', key: 'details', render: (_, r) => {
      const dateBranch = [fmt(r.dateAt), r.branch || '—'].filter(Boolean).join(' | ');
      const custMobile = [r.name || '—', r.mobile || '—'].filter(Boolean).join(' | ');
      const remarks = String(r.remarks || '').trim();
      const notes = String(r.followUpNotes || '').trim();
      return (
        <div style={stackStyle}>
          <div style={lineStyle}>{dateBranch || '—'}</div>
          <div style={smallLineStyle}>{custMobile || '—'}</div>
          {remarks ? (
            <div style={twoLineClamp}><span style={{ color: '#64748b' }}>Offer: </span>{remarks}</div>
          ) : (
            <div style={twoLineClamp}></div>
          )}
          {notes ? (
            <div style={twoLineClamp}><span style={{ color: '#64748b' }}>Notes: </span>{notes}</div>
          ) : (
            <div style={twoLineClamp}></div>
          )}
        </div>
      );
    } },
    { title: 'Status', key: 'statusActions', render: (_, r) => renderQuotationStatusActions(r) },
  ]);

  const columns = isMobile ? columnsMobile : columnsDesktop;

  return (
    <ErrorBoundary>
      <div className="fu-bg">
        <style>{`
          .fu-bg {
            background:
              radial-gradient(1200px 600px at 10% 0%, rgba(99, 102, 241, 0.14), transparent 55%),
              radial-gradient(1000px 520px at 90% 5%, rgba(34, 197, 94, 0.12), transparent 55%),
              radial-gradient(900px 480px at 50% 100%, rgba(250, 140, 22, 0.10), transparent 60%),
              linear-gradient(180deg, rgba(248,250,252,0.95), rgba(255,255,255,0.86));
            border-radius: 18px;
            padding: 14px;
          }
          .row-pending td { background: rgba(250, 140, 22, 0.09) !important; }
          .compact-table { border-radius: 16px; overflow: hidden; }
          .compact-table .ant-table { border-radius: 16px; }
          .compact-table .ant-table-thead > tr > th {
            background: rgba(255,255,255,0.92);
            backdrop-filter: blur(8px);
            position: sticky;
            top: 0;
            z-index: 2;
            font-weight: 700;
            color: #0f172a;
            border-bottom: 1px solid #eef2f7;
          }
          .compact-table .ant-table-tbody > tr:hover > td {
            background: rgba(99, 102, 241, 0.06) !important;
          }
          .compact-table .ant-pagination {
            padding: 10px 12px;
            margin: 0;
            background: rgba(255,255,255,0.88);
            border-top: 1px solid #eef2f7;
          }
          .fu-pill-input .ant-input-affix-wrapper {
            border-radius: 999px !important;
            box-shadow: 0 6px 16px rgba(15, 23, 42, 0.06);
          }
          .fu-seg .ant-segmented {
            border-radius: 999px;
            padding: 4px;
            background: rgba(255,255,255,0.86);
            box-shadow: 0 6px 16px rgba(15, 23, 42, 0.05);
          }
          .fu-seg .ant-segmented-item {
            border-radius: 999px !important;
            font-weight: 600;
          }
        `}</style>
        <Card style={softCard} bodyStyle={{ padding: isMobile ? 12 : 16 }}>
          <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'flex-start', justifyContent: isMobile ? 'flex-start' : 'space-between', gap: 14, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
            {/* Left: identity */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: isMobile ? '100%' : 260, width: isMobile ? '100%' : undefined }}>
              <Avatar size={isMobile ? 36 : 44} style={{ background: '#111827' }}>
                {(String(me?.name || 'S').trim()[0] || 'S').toUpperCase()}
              </Avatar>
              <div>
                <Title level={isMobile ? 5 : 4} style={{ margin: 0, lineHeight: 1.15 }}>
                  {isJobcard ? 'Job Card Follow-Ups' : (isBooking ? 'Booking Follow-Ups' : 'Quotation Follow-Ups')}
                </Title>
                <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Tag icon={<ShopOutlined />} style={{ borderRadius: 999, marginRight: 0 }}>
                    {me?.branch || allowedBranches?.[0] || '—'}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <CalendarOutlined />{' '}
                    Last refresh: <b>{lastRefreshedAt ? lastRefreshedAt.format('DD-MM-YYYY HH:mm') : '—'}</b>
                  </Text>
                </div>
              </div>
            </div>

            {/* Middle: KPIs */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap', width: isMobile ? '100%' : undefined }}>
              <Card size="small" style={kpiCard} bodyStyle={{ padding: kpiPad, minWidth: kpiMin }}>
                <div style={kpiNumStyle}>{summary.total}</div>
                <div style={kpiLabelStyle}><FileTextOutlined /> Total</div>
              </Card>
              <Card size="small" style={kpiCard} bodyStyle={{ padding: kpiPad, minWidth: kpiMin }}>
                <div style={{ ...kpiNumStyle, color: '#fa8c16' }}>{summary.pending}</div>
                <div style={kpiLabelStyle}><ThunderboltOutlined /> Pending</div>
              </Card>
              {isJobcard ? (
                <Card size="small" style={kpiCard} bodyStyle={{ padding: kpiPad, minWidth: kpiMin }}>
                  <div style={{ ...kpiNumStyle, color: '#52c41a' }}>{summary.completed}</div>
                  <div style={kpiLabelStyle}><CheckCircleOutlined /> Completed</div>
                </Card>
              ) : null}

              <Card size="small" style={kpiCard} bodyStyle={{ padding: kpiPad, minWidth: kpiWideMin }}>
                <Text type="secondary" style={{ fontSize: isMobile ? 10 : 11 }}>Completion</Text>
                <Progress
                  percent={summary.total ? Math.round((summary.completed / summary.total) * 100) : 0}
                  size="small"
                  status="active"
                  showInfo
                />
              </Card>
            </div>

            {/* Right: controls */}
            <div style={{ flex: 1, minWidth: isMobile ? '100%' : 320 }}>
              <div style={{ display: 'flex', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
                <Space wrap={!isMobile} direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: '100%' }}>
                  {!isJobcard ? (
                    <div className="fu-seg" style={{ display: 'flex', alignItems: 'center', gap: 8, width: controlWidth, flexWrap: 'wrap' }}>
                      <FilterOutlined style={{ color: '#64748b' }} />
                      <Segmented
                        value={filter}
                        onChange={setFilter}
                        block={isMobile}
                        size={isMobile ? 'small' : 'middle'}
                        options={isQuotation ? [
                          { label: 'All', value: 'all' },
                          { label: 'Due Today', value: 'today' },
                          { label: 'Upcoming', value: 'upcoming' },
                        ] : [
                          { label: 'All', value: 'all' },
                          { label: 'Due Today', value: 'today' },
                          { label: 'Overdue', value: 'overdue' },
                          { label: 'Upcoming', value: 'upcoming' },
                        ]}
                      />
                    </div>
                  ) : (
                    <Select
                      value={jobStatus}
                      onChange={setJobStatus}
                      style={{ minWidth: isMobile ? '100%' : 180, width: controlWidth }}
                      options={[
                        { value: 'all', label: 'All statuses' },
                        { value: 'pending', label: 'Pending' },
                        { value: 'completed', label: 'Completed' },
                      ]}
                    />
                  )}

                  <DatePicker.RangePicker
                    value={dateRange}
                    onChange={(v) => setDateRange(v)}
                    allowClear
                    size={isMobile ? 'small' : 'middle'}
                    style={{ width: controlWidth }}
                  />

                  <div className="fu-pill-input" style={{ width: controlWidth }}>
                    <Input
                      allowClear
                      prefix={<SearchOutlined />}
                      placeholder="Search name / mobile / model / notes"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      size={isMobile ? 'small' : 'middle'}
                      style={{ width: isMobile ? '100%' : 280 }}
                    />
                  </div>

                  {['owner','admin'].includes(userRole) && (
                    <Select
                      value={branchOnly ? 'mybranch' : 'all'}
                      onChange={(v)=>setBranchOnly(v==='mybranch')}
                      options={[{value:'mybranch',label:'My Branch'},{value:'all',label:'All Branches'}]}
                      style={{ minWidth: isMobile ? '100%' : 150, width: controlWidth }}
                    />
                  )}

                  <Button
                    onClick={fetchFollowUps}
                    loading={loading}
                    icon={<ReloadOutlined />}
                    type="primary"
                    style={isMobile ? { ...pillBtn, width: '100%' } : pillBtn}
                  >
                    Refresh
                  </Button>
                </Space>
              </div>
            </div>
          </div>
        </Card>

        <div style={{ height: 12 }} />

        <Card style={softPanel} bodyStyle={{ padding: 0 }}>
          <Table
            rowKey={(r)=>String(r.key)}
            dataSource={filteredRows}
            columns={columns}
            loading={loading && !hasCache}
            size="small"
            sticky={!isMobile}
            tableLayout={isMobile ? 'auto' : 'fixed'}
            className="compact-table"
            rowClassName={(r) => {
              const s = String(r.status || '').toLowerCase();
              return s === 'pending' ? 'row-pending' : '';
            }}
            locale={{
              emptyText: (
                <div style={{ padding: 26, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, marginBottom: 6 }}>No follow-ups found</div>
                  <div style={{ color: '#64748b' }}>Try changing filters, date range, or search.</div>
                </div>
              )
            }}
            pagination={{
              current: page,
              pageSize,
              total: filteredRows.length,
              showSizeChanger: !isMobile,
              simple: isMobile,
              size: isMobile ? 'small' : 'default',
              pageSizeOptions: ['10','20','50','100','200'],
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
          />
        </Card>

      {/* No jobcard inline actions/modal */}

      <Modal
        title={`Reschedule ${reschedule.serial || ''}`}
        open={reschedule.open}
        confirmLoading={rescheduleSaving}
        maskClosable={!rescheduleSaving}
        keyboard={!rescheduleSaving}
        closable={!rescheduleSaving}
        onCancel={() => rescheduleSaving ? null : setReschedule({ open: false, serial: null, at: null, notes: '' })}
        onOk={async () => {
          if (rescheduleSaving) return;
          setRescheduleSaving(true);
          try {
            const stamped = buildStampedNote(reschedule.notes);
            const ok = await updateFollowUp(reschedule.serial, { followUp: { at: reschedule.at?.toISOString?.() || null, notes: stamped }, status: 'pending' });
            if (ok) setReschedule({ open: false, serial: null, at: null, notes: '' });
          } finally {
            setRescheduleSaving(false);
          }
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
        confirmLoading={closingSaving}
        maskClosable={!closingSaving}
        keyboard={!closingSaving}
        closable={!closingSaving}
        cancelButtonProps={{ disabled: closingSaving }}
        okButtonProps={{ disabled: closingSaving }}
        onCancel={() => closingSaving ? null : setClosing({ open: false, serial: null, status: 'converted', details: '', boughtFrom: '', offer: '' })}
        onOk={async () => {
          if (closingSaving) return;
          setClosingSaving(true);
          try {
            const stamped = buildStampedNote(closing.details);
            const patch = {
              status: closing.status || 'converted',
              closeReason: closing.status || 'converted',
              closeNotes: closing.details || '',
              closedAt: new Date().toISOString(),
              followUp: { notes: stamped },
            };
            if (closing.status === 'purchased_elsewhere') {
              patch.purchasedElsewhere = {
                boughtFrom: closing.boughtFrom || '',
                offer: closing.offer || '',
              };
            }
            const ok = await updateFollowUp(closing.serial, patch);
            if (ok) {
              setClosing({ open: false, serial: null, status: 'converted', details: '', boughtFrom: '', offer: '' });
            }
          } finally {
            setClosingSaving(false);
          }
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select
            style={{ width: '100%' }}
            value={closing.status}
            onChange={(v)=>setClosing(s=>({...s, status:v}))}
            options={[
              { value: 'converted', label: 'Booked' },
              { value: 'not_interested', label: 'Not Interested' },
              { value: 'unreachable', label: 'Unreachable' },
              { value: 'purchased_elsewhere', label: 'Purchased SomeWhereElse' },
            ]}
          />
          {closing.status === 'purchased_elsewhere' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                placeholder="Bought from (dealer name)"
                value={closing.boughtFrom}
                onChange={(e)=>setClosing(s=>({...s, boughtFrom: e.target.value}))}
              />
              <Input
                placeholder="Offer / price"
                value={closing.offer}
                onChange={(e)=>setClosing(s=>({...s, offer: e.target.value}))}
              />
            </div>
          ) : null}
          <Input.TextArea rows={2} placeholder="Notes" value={closing.details} onChange={(e)=>setClosing(s=>({...s, details:e.target.value}))} />
        </Space>
      </Modal>
      {isBooking && (
        <BookingPrintQuickModal
          open={printModal.open}
          onClose={() => setPrintModal({ open: false, row: null })}
          row={printModal.row}
          webhookUrl={webhookUrl}
          secret={BOOKING_SECRET}
        />
      )}
      </div>
    </ErrorBoundary>
  );
}
