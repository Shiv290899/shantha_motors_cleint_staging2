import React, { useEffect, useState } from 'react';
import { Button, Table, Space, Tag, Select, DatePicker, message, Modal, Input, Tooltip, Popover, Card, Typography, Segmented, Badge, Divider, Avatar, Progress, Spin, Grid } from 'antd';
import { CheckCircleOutlined, ReloadOutlined, FilterOutlined, SearchOutlined, CalendarOutlined, ShopOutlined, PhoneOutlined, FileTextOutlined, ThunderboltOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { GetCurrentUser } from "../apiCalls/users";
import { saveBookingViaWebhook, saveJobcardViaWebhook } from "../apiCalls/forms";
import { useNavigate } from "react-router-dom";
import BookingPrintQuickModal from './BookingPrintQuickModal';
import { saveFollowUpBookingPrefill } from '../utils/followUpPrefill';
import PostServiceSheet from "./PostServiceSheet";
import { handleSmartPrint } from "../utils/printUtils";

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
const rupeeFormatter =
  typeof Intl !== 'undefined'
    ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : null;

const formatCurrency = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const num = Number(value);
  const formatted = rupeeFormatter ? rupeeFormatter.format(Math.abs(num)) : String(Math.abs(num));
  return `${num < 0 ? '-' : ''}₹${formatted}`;
};

const QUOT_RATE_LOW = 9;
const QUOT_RATE_HIGH = 11;
const QUOT_PROCESSING_FEE = 8000;

const rateForQuotation = (price, dp) => {
  const p = Number(price || 0);
  const d = Number(dp || 0);
  const dpPct = p > 0 ? d / p : 0;
  return dpPct >= 0.3 ? QUOT_RATE_LOW : QUOT_RATE_HIGH;
};

const monthlyForQuotation = (price, dp, months) => {
  const principalBase = Math.max(Number(price || 0) - Number(dp || 0), 0);
  const principal = principalBase + QUOT_PROCESSING_FEE;
  const years = months / 12;
  const rate = rateForQuotation(price, dp);
  const totalInterest = principal * (rate / 100) * years;
  const total = principal + totalInterest;
  return months > 0 ? total / months : 0;
};

const tenuresForSet = (s) => (String(s || "") === "12" ? [12, 18, 24, 36] : [24, 30, 36, 48]);

const buildEmiText = (price, dp, emiSet) => {
  const tenures = tenuresForSet(emiSet);
  if (!Number(price || 0)) return "";
  const parts = tenures.map((mo) => `${mo}:${formatCurrency(monthlyForQuotation(price, dp, mo))}`);
  return parts.length ? `EMI(${emiSet || "12"}): ${parts.join(" | ")}` : "";
};



const uniqueNonEmpty = (list = []) =>
  Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );

const normalizePurchaseMode = (value) => String(value || "").trim().toLowerCase();
const isFinancedMode = (value) => ["loan", "nohp", "hp", "finance"].includes(normalizePurchaseMode(value));

const buildQuotationOfferingDetails = (row) => {
  if (!row) return { remarks: "", vehicles: [] };
  const p = row.payload || {};
  const fv = p.formValues || {};
  const globalFittings = uniqueNonEmpty(p.fittings);
  const globalMode =
    fv.mode ??
    p.mode ??
    p.purchaseMode ??
    p.purchaseType ??
    p.paymentType ??
    row.mode ??
    row.purchaseMode ??
    row.purchaseType ??
    row.paymentType ??
    row.values?.mode ??
    row.values?.Mode ??
    row.values?.purchaseMode ??
    row.values?.purchaseType ??
    row.values?.paymentType ??
    "cash";
  const remarks = String(row.remarks || fv.remarks || p.remarks || "").trim();
  const vehicles = [];

  const addVehicle = ({
    label,
    company,
    model,
    variant,
    priceRaw,
    dpRaw,
    emiSetRaw,
    fittingsRaw,
    modeRaw,
  }) => {
    const cleanCompany = String(company || "").trim();
    const cleanModel = String(model || "").trim();
    const cleanVariant = String(variant || "").trim();
    const price = Number(priceRaw || 0);
    const dp = Number(dpRaw || 0);
    const fittings = uniqueNonEmpty(fittingsRaw || globalFittings);
    const title = [cleanCompany, cleanModel, cleanVariant].filter(Boolean).join(" ");
    const hasMeta = Boolean(title || fittings.length || price || dp);
    const showFinance = isFinancedMode(modeRaw ?? globalMode);
    if (!hasMeta) return;

    vehicles.push({
      label,
      title: title || "Vehicle details not available",
      fittings,
      priceText: price ? formatCurrency(price) : "—",
      dpText: dp ? formatCurrency(dp) : "—",
      emiText: showFinance && price ? buildEmiText(price, dp, emiSetRaw || p.emiSet || "12") : "",
      showFinance,
    });
  };

  addVehicle({
    label: "Vehicle 1",
    company: fv.company ?? p.company,
    model: fv.bikeModel ?? fv.model ?? p.model ?? row.model,
    variant: fv.variant ?? p.variant ?? row.variant,
    priceRaw: fv.onRoadPrice ?? p.onRoadPrice ?? row.price,
    dpRaw: fv.downPayment ?? p.downPayment,
    emiSetRaw: p.emiSet,
    fittingsRaw: p.fittings,
    modeRaw: fv.mode ?? p.mode ?? p.purchaseMode ?? p.purchaseType ?? p.paymentType,
  });

  const extra = Array.isArray(p.extraVehicles) ? p.extraVehicles : [];
  extra.forEach((ev, idx) => {
    addVehicle({
      label: `Vehicle ${idx + 2}`,
      company: ev.company,
      model: ev.model,
      variant: ev.variant,
      priceRaw: ev.onRoadPrice,
      dpRaw: ev.downPayment,
      emiSetRaw: ev.emiSet || p.emiSet,
      fittingsRaw: ev.fittings,
      modeRaw: ev.mode ?? ev.purchaseMode ?? ev.purchaseType ?? ev.paymentType,
    });
  });

  return { remarks, vehicles };
};

/**
 * FollowUps list component
 * Props:
 * - mode: 'quotation' | 'jobcard' (default: 'quotation')
 * - webhookUrl: GAS URL for the selected mode
 */
export default function FollowUps({ mode = 'quotation', webhookUrl, onClose }) {
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
  const [selectedBranch, setSelectedBranch] = useState('all');
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
  const [printModal, setPrintModal] = useState({ open: false, row: null });
  const invoiceRef = React.useRef(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const [invoiceLoadingId, setInvoiceLoadingId] = useState(null);
  const [q, setQ] = useState('');
  const [dateRange, setDateRange] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [preparingBooking, setPreparingBooking] = useState(false);

  const normalizedUserRole = String(userRole || '').toLowerCase();
  const isPrivilegedUser = ['owner','admin','backend'].includes(normalizedUserRole);
  const resolvedMyBranch = String(me.branch || allowedBranches[0] || '').trim();
  const branchFilterValue = isPrivilegedUser
    ? (selectedBranch && selectedBranch !== 'all' ? selectedBranch : '')
    : resolvedMyBranch;
  const branchCacheKeyValue = isPrivilegedUser ? (selectedBranch || 'all') : (resolvedMyBranch || 'all');
  const branchParamForFetch = isPrivilegedUser ? branchFilterValue : resolvedMyBranch;
  const needsBranch = !isPrivilegedUser || Boolean(branchFilterValue);
  const branchOptions = React.useMemo(() => {
    const seen = new Set();
    const list = [];
    const add = (value) => {
      const trimmed = String(value || '').trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      list.push(trimmed);
    };
    allowedBranches.forEach(add);
    add(resolvedMyBranch);
    return [
      { value: 'all', label: 'All Branches' },
      ...list.map((branch) => ({
        value: branch,
        label: branch === resolvedMyBranch ? `${branch} (My Branch)` : branch,
      })),
    ];
  }, [allowedBranches, resolvedMyBranch]);

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
  const getRowEffectiveStatus = (row) => {
    if (isBooking) {
      const balanceStatus = getRowBalanceStatus(row);
      if (balanceStatus) return balanceStatus;
      if (row.bookingPayment?.hasTarget) {
        return row.bookingPayment.isPending ? 'pending' : 'completed';
      }
    }
    return String(row.status || '').toLowerCase();
  };
  const isRowPendingStatus = (row) => getRowEffectiveStatus(row) === 'pending';

  // Jobcard: force filter to 'all' so nothing gets hidden by date
  React.useEffect(() => {
    if (isJobcard && filter !== 'all') setFilter('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJobcard]);
  React.useEffect(() => {
    if (isBooking && filter !== 'all') setFilter('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBooking]);
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
      branch: branchCacheKeyValue,
      jobStatus,
    };
    return `FollowUps:${JSON.stringify(keyObj)}`;
  }, [modeKey, filter, branchCacheKeyValue, jobStatus]);

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

  const parseMoneyValue = (value) => {
    if (value === null || value === undefined || value === "") return 0;
    const cleaned = String(value).replace(/[^0-9.-]/g, "");
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  };

  const sumByKeys = (obj = {}, keys = []) =>
    keys.reduce((sum, key) => sum + parseMoneyValue(obj?.[key]), 0);

  const sumPaymentsArray = (payments) =>
    (Array.isArray(payments) ? payments : []).reduce(
      (sum, pay) => sum + parseMoneyValue(pay?.amount),
      0
    );

  const deriveBookingPaymentInfo = ({ payload = {}, values = {}, collected = 0 }) => {
    const mainTarget = [
      payload.bookingAmount,
      payload.bookingTarget,
      values["Booking Amount"],
      values["Booking_Amount"],
      values.bookingAmount,
      values["Total Booking Amount"],
    ]
      .map(parseMoneyValue)
      .find((v) => v > 0);
    const fallbackTarget =
      sumByKeys(payload, ["bookingAmount1", "bookingAmount2", "bookingAmount3"]) ||
      sumByKeys(values, [
        "Booking Amount 1",
        "Booking Amount 2",
        "Booking Amount 3",
      ]);
    const target = mainTarget || fallbackTarget || 0;

    const paidCandidates = [
      parseMoneyValue(payload.totalCollected),
      parseMoneyValue(payload.cashCollected) + parseMoneyValue(payload.onlineCollected),
      sumPaymentsArray(payload.payments),
      sumByKeys(payload, [
        "bookingAmount1Cash",
        "bookingAmount1Online",
        "bookingAmount2Cash",
        "bookingAmount2Online",
        "bookingAmount3Cash",
        "bookingAmount3Online",
      ]),
      sumByKeys(values, [
        "Booking Amount 1 Cash",
        "Booking Amount 1 Online",
        "Booking Amount 2 Cash",
        "Booking Amount 2 Online",
        "Booking Amount 3 Cash",
        "Booking Amount 3 Online",
      ]),
      parseMoneyValue(values["Collected Amount"]),
      parseMoneyValue(values.Amount),
      parseMoneyValue(collected),
    ];
    const paid = Math.max(...paidCandidates, 0);

    const hasTarget = target > 0;
    const tolerance = 0.01;
    const isPending = hasTarget ? paid + tolerance < target : null;
    return { target, paid, hasTarget, isPending };
  };

  const BALANCE_TOLERANCE = 0.01;
  const BALANCE_KEY_PATTERN = /balance/i;
  const BALANCED_AMOUNT_KEY_PATTERNS = [
    /(?:balanced|balance)\s*amount/i,
    /balanceamount/i,
    /balance_amt/i,
  ];
  const BALANCED_DP_KEY_PATTERNS = [
    /(?:balanced|balance)\s*(?:dp|tp|tpic|tpi)/i,
    /balancetp(?:ic)?/i,
    /finance\s*dp/i,
  ];

const parseJsonValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const safePositiveNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
};



const extractRawPayloadObject = (...sources) => {
  for (const source of sources) {
    if (!source && source !== 0) continue;
    if (typeof source === "object") return source;
    const parsed = parseJsonValue(source);
    if (parsed) return parsed;
  }
  return null;
};

  const readNumberCandidate = (value) => {
    if (value === null || value === undefined) return { found: false };
    const valueType = typeof value;
    if (valueType === "object" || valueType === "boolean") return { found: false };
    const normalized =
      valueType === "string" ? value.trim() : String(value).trim();
    if (normalized === "") return { found: false };
    const amount = parseMoneyValue(value);
    if (!Number.isFinite(amount)) return { found: false };
    return { found: true, value: amount };
  };

  const getNumberValue = (value) => {
    const candidate = readNumberCandidate(value);
    return candidate.found ? candidate.value : null;
  };

  const gatherNumbersByPattern = (source, pattern, depth = 3, seen = new WeakSet()) => {
    if (!source || typeof source !== "object" || depth < 0) return [];
    if (seen.has(source)) return [];
    seen.add(source);
    const entries = Array.isArray(source)
      ? source.map((value, idx) => [String(idx), value])
      : Object.entries(source);
    const results = [];
    for (const [key, value] of entries) {
      if (pattern.test(String(key || ""))) {
        const candidate = readNumberCandidate(value);
        if (candidate.found) results.push(candidate.value);
      }
      if (value && typeof value === "object") {
        results.push(
          ...gatherNumbersByPattern(value, pattern, depth - 1, seen)
        );
      } else if (typeof value === "string") {
        const parsed = parseJsonValue(value);
        if (parsed && typeof parsed === "object") {
          results.push(
            ...gatherNumbersByPattern(parsed, pattern, depth - 1, seen)
          );
        }
      }
    }
    return results;
  };

  function getRowBalanceStatus(row) {
    if (!isBooking) return null;
    const balanceValue = typeof row?.balanceValue === "number" ? row.balanceValue : null;
    if (balanceValue !== null) {
      return balanceValue > BALANCE_TOLERANCE ? "pending" : "completed";
    }
    const payloadCandidates = gatherNumbersByPattern(
      row.payload,
      BALANCE_KEY_PATTERN,
      3
    );
    const valuesCandidates = gatherNumbersByPattern(
      row.values,
      BALANCE_KEY_PATTERN,
      2
    );
    const candidates = [...payloadCandidates, ...valuesCandidates];
    if (!candidates.length) return null;
    const hasOutstanding = candidates.some((value) => value > BALANCE_TOLERANCE);
    return hasOutstanding ? "pending" : "completed";
  }

  

 

  const gatherCandidateSources = (row) => {
    const sources = [];
    if (row?.payload && typeof row.payload === "object") {
      sources.push(row.payload);
    }
    if (row?.values && typeof row.values === "object") {
      sources.push(row.values);
      if (row.values.payload) {
        const parsed = parseJsonValue(row.values.payload);
        if (parsed && typeof parsed === "object") sources.push(parsed);
      }
      if (row.values['Raw Payload'] || row.values['rawPayload']) {
        const parsed = parseJsonValue(row.values['Raw Payload'] || row.values['rawPayload']);
        if (parsed && typeof parsed === "object") sources.push(parsed);
      }
    }
    if (row?.payload?.rawPayload) {
      const parsed = parseJsonValue(row.payload.rawPayload);
      if (parsed && typeof parsed === "object") sources.push(parsed);
    }
    if (row?.rawPayload) {
      const parsed = parseJsonValue(row.rawPayload);
      if (parsed && typeof parsed === "object") sources.push(parsed);
    }
    return sources;
  };

  const buildBalanceSources = ({ payload, values, rawPayload, fallback }) => {
    const sources = [];
    if (payload && typeof payload === "object") sources.push(payload);
    if (values && typeof values === "object") sources.push(values);
    if (rawPayload) {
      const parsed = parseJsonValue(rawPayload);
      if (parsed && typeof parsed === "object") sources.push(parsed);
    }
    if (fallback && typeof fallback === "object") sources.push(fallback);
    return sources;
  };


  const scanPathsForNumbers = (sources, paths = []) => {
    if (!Array.isArray(sources)) return [];
    const results = [];
    for (const source of sources) {
      if (!source || typeof source !== "object") continue;
      for (const path of paths) {
        const value = readValueAtPath(source, path);
        if (value === null || value === undefined) continue;
        const candidate = readNumberCandidate(value);
        if (candidate.found) results.push(candidate.value);
      }
    }
    return results;
  };

  const readValueAtPath = (source, path = []) => {
    if (!source || !path.length) return undefined;
    return path.reduce((cur, key) => {
      if (!cur || typeof cur !== "object") return undefined;
      return cur[key];
    }, source);
  };

  const _collectNumbersFromPaths = (row, paths = []) => {
    const results = [];
    const sources = gatherCandidateSources(row);
    for (const source of sources) {
      for (const path of paths) {
        const value = readValueAtPath(source, path);
        if (value === null || value === undefined) continue;
        const candidate = readNumberCandidate(value);
        if (candidate.found) results.push(candidate.value);
      }
    }
    return results;
  };

  const getPurchaseTypeFromRow = (row) => {
    const payload = row?.payload || {};
    const values = row?.values || {};
    const valueKeys = [
      "purchaseMode",
      "purchase_mode",
      "purchase type",
      "Purchase Mode",
      "Purchase_Mode",
      "Purchase Type",
      "paymentMode",
      "payment_mode",
      "Payment Mode",
      "Payment Type",
      "paymentType",
      "payment_type",
    ];
    const candidates = [
      payload.purchaseMode,
      payload.purchaseType,
      payload.paymentType,
      ...valueKeys.map((key) => values[key]),
    ];
    const found = candidates.find((c) => typeof c === "string" && c.trim());
    return String(found || "cash").trim().toLowerCase();
  };

  const isFinancedPurchaseType = (type) => {
    if (!type) return false;
    const normalized = String(type).trim().toLowerCase();
    return ["loan", "nohp", "hp", "finance"].includes(normalized);
  };

  const computePendingBalance_ = ({ payload = {}, values = {}, rawPayload = null, purchaseType } = {}) => {
    if (!payload || typeof payload !== "object") {
      return { pendingAmount: null, pendingLabel: "" };
    }
    const rawObj =
      extractRawPayloadObject(
        rawPayload,
        values?.rawPayload,
        values?.["Raw Payload"],
        payload?.rawPayload,
        payload?.["Raw Payload"]
      ) || {};

    const bookingAmount =
      [
        parseMoneyValue(payload?.bookingAmount),
        parseMoneyValue(values?.["Booking Amount"]),
        parseMoneyValue(values?.bookingAmount),
        parseMoneyValue(values?.["Booking_Amount"]),
        parseMoneyValue(rawObj?.bookingAmount),
      ].find((v) => v > 0) ?? 0;

    const totalVehicleCost =
      [
        parseMoneyValue(rawObj?.totalVehicleCost),
        parseMoneyValue(rawObj?.cash?.totalVehicleCost),
        parseMoneyValue(rawObj?.cash?.onRoadPrice),
        parseMoneyValue(payload?.totalVehicleCost),
        parseMoneyValue(payload?.onRoadPrice),
        parseMoneyValue(values?.["Total Vehicle Cost"]),
        parseMoneyValue(values?.["On Road Price"]),
      ].find((v) => v > 0) ?? 0;

    const totalDpDirect =
      [
        parseMoneyValue(rawObj?.totalDp),
        parseMoneyValue(rawObj?.dp?.totalDp),
        parseMoneyValue(payload?.totalDp),
        parseMoneyValue(payload?.dp?.totalDp),
        parseMoneyValue(values?.["Total DP"]),
      ].find((v) => v > 0) ?? 0;
    const totalDpCalculated = (
      parseMoneyValue(rawObj?.downPayment || payload?.downPayment || values?.["Down Payment"]) +
      parseMoneyValue(rawObj?.extraFittingAmount || payload?.extraFittingAmount || values?.["Extra Fitting Amount"]) +
      parseMoneyValue(rawObj?.affidavitCharges || payload?.affidavitCharges || values?.["Affidavit Charges"])
    );
    const totalDp = totalDpDirect || totalDpCalculated || 0;

    const normalizedPurchaseType = String(
      purchaseType ||
      payload?.purchaseMode ||
      values?.["Purchase Mode"] ||
      rawObj?.purchaseMode ||
      "cash"
    ).trim().toLowerCase();
    const isFinanced = ["loan", "nohp", "hp", "finance"].includes(normalizedPurchaseType);
    const label = isFinanced ? "Balanced DP" : "Balance Amount";
    const baseAmount = isFinanced ? totalDp - bookingAmount : totalVehicleCost - bookingAmount;
    const pending = Math.max(0, Number.isFinite(baseAmount) ? baseAmount : 0);
    payload.pendingBalance = pending;
    payload.pendingType = label;
    return { pendingAmount: pending, pendingLabel: label };
  };

  const collectPaymentEntries = (...candidates) => {
    const out = [];
    const enqueueEntries = (item) => {
      if (!item || typeof item !== "object") return;
      if (Array.isArray(item)) {
        item.forEach(enqueueEntries);
        return;
      }
      if ("payments" in item && Array.isArray(item.payments)) {
        enqueueEntries(item.payments);
      }
      if ("paymentSplit" in item && Array.isArray(item.paymentSplit)) {
        item.paymentSplit.forEach((entry) => {
          if (entry && typeof entry === "object") out.push(entry);
        });
      }
      if ("paymentDetails" in item && Array.isArray(item.paymentDetails)) {
        enqueueEntries(item.paymentDetails);
      }
      if (
        !("payments" in item) &&
        !("paymentSplit" in item) &&
        !("paymentDetails" in item)
      ) {
        out.push(item);
      }
    };

    candidates.forEach((source) => {
      if (!source) return;
      if (Array.isArray(source)) {
        source.forEach(enqueueEntries);
        return;
      }
      if (typeof source === "string") {
        try {
          const parsed = JSON.parse(source);
          enqueueEntries(parsed);
        } catch {
          return;
        }
        return;
      }
      enqueueEntries(source);
    });
    return out;
  };

  const derivePaymentTotalsFromRow = ({ payload, values, rawPayload }) => {
    const rawVals = values || {};
    const candidatePayments = collectPaymentEntries(
      payload?.payments,
      rawVals.payments,
      rawVals.paymentDetails,
      payload?.paymentSplit,
      rawVals.paymentSplit,
      rawPayload?.payments,
      rawPayload?.paymentSplit,
      rawPayload?.paymentDetails
    );
    const sums = { cash: 0, online: 0, total: 0 };
    candidatePayments.forEach((entry) => {
      const amount = safePositiveNumber(entry?.amount);
      if (amount === null) return;
      const mode = String(entry?.mode || "").trim().toLowerCase();
      if (mode === "cash") {
        sums.cash += amount;
      } else if (mode === "online") {
        sums.online += amount;
      }
      sums.total += amount;
    });
    const totalDpCandidate =
      safePositiveNumber(payload?.dp?.totalDp) ??
      safePositiveNumber(payload?.totalDp) ??
      safePositiveNumber(payload?.downPayment) ??
      safePositiveNumber(rawVals.totalDp) ??
      safePositiveNumber(rawVals.downPayment) ??
      safePositiveNumber(rawPayload?.dp?.totalDp) ??
      safePositiveNumber(rawPayload?.totalDp) ??
      safePositiveNumber(rawPayload?.downPayment);
    const hasTotalDp = totalDpCandidate !== null;
    const totalDpValue = hasTotalDp ? totalDpCandidate : 0;
    const balancedDpValue = Math.max(0, totalDpValue - sums.total);
    return {
      cashCollected: sums.cash,
      onlineCollected: sums.online,
      totalCollected: sums.total,
      totalDp: totalDpValue,
      balancedDp: balancedDpValue,
      hasTotals: hasTotalDp,
      hasPayments: candidatePayments.length > 0,
    };
  };
  const FINANCED_BALANCE_PATHS = [
    ["dp", "balancedDp"],
    ["dp", "balanceTP"],
    ["dp", "balanceTPIC"],
    ["balanceTP"],
    ["balancedDp"],
    ["balance"],
  ];
  const CASH_BALANCE_PATHS = [
    ["balancedAmount"],
    ["balanceAmount"],
    ["cash", "balancedAmount"],
    ["balance"],
    ["dp", "balancedDp"],
  ];
  const VEHICLE_COST_PATHS = [
    ["cash", "totalVehicleCost"],
    ["cash", "onRoadPrice"],
    ["cash", "price"],
    ["vehicle", "totalVehicleCost"],
    ["vehicle", "onRoadPrice"],
    ["vehicle", "price"],
    ["totalVehicleCost"],
    ["onRoadPrice"],
    ["price"],
  ];

  const shouldSkipRowClick = (event) => {
    const target = event?.target;
    if (!target || typeof target.closest !== 'function') return false;
    return Boolean(
      target.closest("button, a, input, textarea, [role='button']")
    );
  };

  const normalizeMobileForFetch = (value) => String(value || "").replace(/\D/g, "").slice(-10);

  const handleBookingRowClick = (row) => {
    if (!row) return;
    setPreparingBooking(true);
    saveFollowUpBookingPrefill({
      payload: row.payload,
      values: row.values,
      bookingId: row.bookingId,
      mobile: row.mobile,
      serialNo: row.serialNo,
    });
    const mobileQuery = normalizeMobileForFetch(row.mobile || row.values?.Mobile || row.values?.mobile);
    if (typeof onClose === 'function') {
      onClose();
    }
    navigate("/bookingform", {
      state: mobileQuery ? { autoFetch: { mode: "mobile", query: mobileQuery } } : undefined,
    });
    setPreparingBooking(false);
  };

  useEffect(() => {
    return () => {
      setPreparingBooking(false);
    };
  }, []);

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
      const requestBranch = branchParamForFetch;
      const payload = isBooking ? (() => {
        const base = BOOKING_SECRET
          ? { action: 'list', page: 1, pageSize: LIST_PAGE_SIZE, secret: BOOKING_SECRET }
          : { action: 'list', page: 1, pageSize: LIST_PAGE_SIZE };
        return requestBranch ? { ...base, branch: requestBranch } : base;
      })() : (() => {
        return {
          action: 'list',
          branch: requestBranch || '',
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
        const fv = p.formValues || {};
        // For booking list, values are top-level keys
        const values = (r && r.values) ? r.values : (r || {});
        const rp = extractRawPayloadObject(
          p.rawPayload,
          values?.['Raw Payload'],
          values?.rawPayload,
          values?.RawPayload,
          values?.rawpayload,
          r.rawPayload,
          r.payload?.rawPayload
        );
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

        const collectedAmountValue = fv.amount || values['Collected Amount'] || values.Amount || 0;
        const bookingPayment = isBooking
          ? deriveBookingPaymentInfo({ payload: p, values, collected: collectedAmountValue })
          : null;
        const parsedPayloadFallback =
          rp ||
          p.rawPayload ||
          values?.rawPayload ||
          values?.['Raw Payload'] ||
          values?.RawPayload ||
          r.rawPayload;
        const helperRowForBalance = {
          payload: p,
          values,
          rawPayload: parsedPayloadFallback,
        };
        const balanceSources = buildBalanceSources({
          payload: p,
          values,
          rawPayload: helperRowForBalance.rawPayload,
          fallback: rp || parseJsonValue(helperRowForBalance.rawPayload),
        });
        const financedPurchase = isFinancedPurchaseType(
          getPurchaseTypeFromRow(helperRowForBalance)
        );
        const derivedTotals = derivePaymentTotalsFromRow({
          payload: p,
          values,
          rawPayload: rp || helperRowForBalance.rawPayload,
        });
        const purchaseType = getPurchaseTypeFromRow(helperRowForBalance);
        const pendingInfo = computePendingBalance_({
          payload: p,
          values,
          rawPayload: helperRowForBalance.rawPayload,
          purchaseType,
        });
        const computedBookingStatus =
          isBooking && derivedTotals.hasTotals
            ? (derivedTotals.balancedDp > BALANCE_TOLERANCE ? 'pending' : 'completed')
            : null;

        const cashCandidates = scanPathsForNumbers(
          balanceSources,
          CASH_BALANCE_PATHS
        );
        const dpCandidates = scanPathsForNumbers(
          balanceSources,
          FINANCED_BALANCE_PATHS
        );
        const vehicleCostCandidates = scanPathsForNumbers(
          balanceSources,
          VEHICLE_COST_PATHS
        );
        const totalCollectedFromTotals = Number.isFinite(derivedTotals.totalCollected)
          ? derivedTotals.totalCollected
          : 0;
        const totalVehicleCost = vehicleCostCandidates.length
          ? Math.max(...vehicleCostCandidates)
          : null;
        const cashBalanceFromTotals =
          totalVehicleCost !== null
            ? Math.max(0, totalVehicleCost - totalCollectedFromTotals)
            : null;
        const cashValue =
          getNumberValue(p?.cash?.balancedAmount) ??
          getNumberValue(p?.balancedAmount) ??
          getNumberValue(values?.balancedAmount) ??
          getNumberValue(values?.balanceAmount) ??
          (cashCandidates.length ? Math.max(...cashCandidates) : null) ??
          (cashBalanceFromTotals !== null ? cashBalanceFromTotals : null);
        const dpValue =
          getNumberValue(p?.dp?.balancedDp) ??
          getNumberValue(p?.balancedDp) ??
          getNumberValue(values?.balancedDp) ??
          (dpCandidates.length ? Math.max(...dpCandidates) : null) ??
          (derivedTotals.hasTotals ? derivedTotals.balancedDp : null);

        const computedBalanceValue = Number.isFinite(pendingInfo?.pendingAmount)
          ? pendingInfo.pendingAmount
          : null;
        const computedBalanceLabel = pendingInfo?.pendingLabel || "";
        const balanceValue =
          computedBalanceValue !== null
            ? computedBalanceValue
            : financedPurchase && dpValue !== null
              ? dpValue
              : cashValue;
        const balanceLabel =
          computedBalanceLabel ||
          (financedPurchase && balanceValue !== null ? "Balanced DP" : "Balanced Amount");

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
          status: isJobcard
            ? (postServiced ? 'completed' : 'pending')
            : isBooking
              ? (computedBookingStatus || (() => {
                  const s = fu.status || p.status || fv.status || values.Status || values['Booking Status'] || '';
                  return String(s || 'pending').toLowerCase();
                })())
              : (() => {
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
          bookingPayment,
          balanceValue,
          balanceLabel,
          cashCollected: derivedTotals.cashCollected,
          onlineCollected: derivedTotals.onlineCollected,
          totalCollected: derivedTotals.totalCollected,
          totalDp: derivedTotals.hasTotals ? derivedTotals.totalDp : undefined,
          balancedDp: derivedTotals.balancedDp,
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
        const meB = norm(resolvedMyBranch);
        const branchFilterNorm = branchFilterValue ? norm(branchFilterValue) : '';

        if (!isPrivilegedUser) {
          if (!meB || itB !== meB) return false;
        } else if (branchFilterNorm) {
          if (itB !== branchFilterNorm) return false;
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
      const statusRank = (row) => (isRowPendingStatus(row) ? 0 : 1);
      // Pending first, then others; most recent first within each group
      filtered.sort((a, b) => {
        const ra = statusRank(a);
        const rb = statusRank(b);
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
    const branchNeeded = needsBranch;
    const branchAvailable = Boolean(branchParamForFetch);
    if (branchNeeded && !branchAvailable) {
      return;
    }
    fetchFollowUps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    webhookUrl,
    filter,
    mineOnly,
    selectedBranch,
    resolvedMyBranch,
    mode,
    normalizedUserRole,
    allowedBranches.length,
    jobStatus,
    needsBranch,
    branchParamForFetch,
    isPrivilegedUser,
  ]);

  const updateFollowUp = async (serialNo, patch, opts = {}) => {
    const {
      refreshOnSuccess = true,
      showSuccessMessage = true,
      showErrorMessage = true,
    } = opts || {};
    try {
      // Ensure branch travels with update (some GAS scripts depend on it)
      const branchForUpdate = !isPrivilegedUser
        ? (resolvedMyBranch || patch?.branch || allowedBranches[0] || '')
        : (branchFilterValue || patch?.branch || resolvedMyBranch);
      const withBranch = {
        branch: branchForUpdate,
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
      if (showSuccessMessage) message.success('Updated');
      if (refreshOnSuccess) await fetchFollowUps();
      return true;
    } catch  {
      if (showErrorMessage) message.error('Update failed');
      return false;
    }
  };

  const applyOptimisticFollowUpPatch = (serialNo, patch) => {
    let previousRow = null;
    const serial = String(serialNo || '').trim();
    setAllRows((prev) => (prev || []).map((r) => {
      if (String(r?.serialNo || '').trim() !== serial) return r;
      previousRow = { ...r };
      const next = { ...r };
      if (Object.prototype.hasOwnProperty.call(patch || {}, 'status')) {
        next.status = String(patch?.status || '').toLowerCase();
      }
      if (Object.prototype.hasOwnProperty.call(patch || {}, 'closeReason')) {
        next.closeReason = patch?.closeReason || '';
      }
      if (Object.prototype.hasOwnProperty.call(patch || {}, 'closeNotes')) {
        next.closeNotes = patch?.closeNotes || '';
      }
      const noteText = patch?.followUp?.notes ?? patch?.followupNotes ?? patch?.notes ?? patch?.closeNotes;
      if (Object.prototype.hasOwnProperty.call(patch || {}, 'followUp') || Object.prototype.hasOwnProperty.call(patch || {}, 'closeNotes') || Object.prototype.hasOwnProperty.call(patch || {}, 'notes')) {
        next.followUpNotes = String(noteText || '').trim();
      }
      if (patch?.followUp && Object.prototype.hasOwnProperty.call(patch.followUp, 'at')) {
        const raw = patch.followUp.at;
        if (!raw) {
          next.followUpAt = null;
        } else {
          const d = dayjs(raw);
          if (d.isValid()) {
            next.followUpAt = d;
            next.sortAtMs = d.valueOf();
          }
        }
      }
      return next;
    }));
    return previousRow;
  };

  const rollbackOptimisticFollowUpPatch = (serialNo, previousRow) => {
    if (!previousRow) return;
    const serial = String(serialNo || '').trim();
    setAllRows((prev) => (prev || []).map((r) => (
      String(r?.serialNo || '').trim() === serial ? previousRow : r
    )));
  };

  const buildStampedNote = (note) => {
    const ts = dayjs().format('DD-MM-YYYY HH:mm');
    const text = String(note || '').trim();
    return text ? `${ts} - ${text}` : ts;
  };

  const fmt = (d) => (d && d.isValid && d.isValid()) ? d.format('DD-MM-YYYY HH:mm') : '—';
  const stackStyle = { display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.2 };
  const lineStyle = { whiteSpace: isMobile ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: isMobile ? 'clip' : 'ellipsis' };
  const smallLineStyle = { ...lineStyle, fontSize: isMobile ? 12 : 11 };
  
  const twoLineClamp = {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: isMobile ? 4 : 3,
    overflow: 'hidden',
    whiteSpace: 'normal',
    fontSize: isMobile ? 11 : 10,
    lineHeight: 1.25,
  };
  const offeringClamp = {
    ...twoLineClamp,
    WebkitLineClamp: 2,
    fontSize: isMobile ? 11 : 10.5,
    fontWeight: 600,
    color: '#1f2937',
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
    const pending = rows.filter((r) => getRowEffectiveStatus(r) === 'pending').length;
    const completed = rows.filter((r) => getRowEffectiveStatus(r) !== 'pending').length;
    return {
      total,
      pending,
      completed,
      other: 0,
    };
  }, [filteredRows, isBooking]);

  useEffect(() => {
    setPage(1);
  }, [q, dateRange, filter, jobStatus, selectedBranch, mode]);

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

  const parsePayloadFromRow = (row) => {
    if (!row) return null;
    if (row.payload && typeof row.payload === 'object') return row.payload;
    const raw =
      row.payload ||
      row.Payload ||
      row.PAYLOAD ||
      row?.values?.Payload ||
      row?.values?.payload ||
      row?.values?.PAYLOAD ||
      row?._raw?.payload ||
      row?._raw?.Payload ||
      row?._raw?.PAYLOAD ||
      row?._raw?.values?.Payload ||
      row?._raw?.values?.payload ||
      row?._raw?.values?.PAYLOAD ||
      '';
    if (raw && typeof raw === 'object') return raw;
    if (raw && typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return null; }
    }
    if (row.formValues || row.values) return row;
    return null;
  };

  const buildInvoicePayload = (payload, row) => {
    if (!payload) return null;
    const fv = payload.formValues || payload.values || {};
    const labourRows = Array.isArray(payload.labourRows)
      ? payload.labourRows
      : Array.isArray(fv.labourRows)
      ? fv.labourRows
      : [];
    const totalsIn = payload.totals || fv.totals || {};
    const computedSub = labourRows.reduce(
      (sum, r) => sum + Number(r?.qty || 0) * Number(r?.rate || 0),
      0
    );
    const totals = {
      labourSub: totalsIn.labourSub ?? computedSub,
      labourGST: totalsIn.labourGST ?? 0,
      labourDisc: totalsIn.labourDisc ?? 0,
      grand: totalsIn.grand ?? computedSub,
    };
    const createdAt =
      payload.postServiceAt ||
      payload.createdAt ||
      payload.savedAt ||
      row?.postAt ||
      row?.ts ||
      new Date();
    return {
      vals: {
        jcNo: row?.jcNo || fv.jcNo || "",
        regNo: row?.regNo || fv.regNo || "",
        custName: row?.name || fv.custName || fv.name || "",
        custMobile: row?.mobile || fv.custMobile || fv.mobile || "",
        km: row?.km || fv.km || "",
        model: row?.model || fv.model || "",
        colour: fv.colour || row?.colour || "",
        branch: row?.branch || fv.branch || "",
        executive: row?.executive || fv.executive || "",
        createdAt,
        labourRows,
        gstLabour: totalsIn.gstLabour || totalsIn.labourGST || 0,
      },
      totals,
    };
  };

  const handleServiceInvoice = async (row) => {
    if (!row) return;
    const status = String(row.status || "").toLowerCase();
    if (status !== 'completed') {
      message.warning("Complete post-service to generate the service invoice.");
      return;
    }
    if (!webhookUrl) {
      message.error("Jobcard webhook is not configured.");
      return;
    }
    const key = row.jcNo || row.key || row.mobile || '';
    setInvoiceLoadingId(key);
    try {
      let payload = parsePayloadFromRow(row);
      let built = payload ? buildInvoicePayload(payload, row) : null;
      const hasItems = Array.isArray(built?.vals?.labourRows) && built.vals.labourRows.length > 0;
      if (!built || !hasItems) {
        const mobile = String(row.mobile || "").replace(/\D/g, "").slice(-10);
        if (mobile.length === 10) {
          const JOB_SECRET = import.meta.env?.VITE_JOBCARD_GAS_SECRET || '';
          const base = { action: 'search', mode: 'mobile', query: mobile };
          const payloadReq = JOB_SECRET ? { ...base, secret: JOB_SECRET } : base;
          const resp = await saveJobcardViaWebhook({ webhookUrl, method: 'GET', payload: payloadReq });
          const js = resp?.data || resp;
          const rows = Array.isArray(js?.rows) ? js.rows : (Array.isArray(js?.data) ? js.data : []);
          if (rows.length) {
            let target = rows[0];
            if (row.jcNo) {
              const match = rows.find((r) => {
                const p = parsePayloadFromRow(r);
                const fv = p?.formValues || p?.values || {};
                const id =
                  fv.jcNo ||
                  r?.jcNo ||
                  r?.values?.['JC No'] ||
                  r?.values?.['JC No.'] ||
                  r?.values?.['Job Card No'] ||
                  '';
                return String(id || '').trim() === String(row.jcNo || '').trim();
              });
              if (match) target = match;
            }
            const fetchedPayload = parsePayloadFromRow(target);
            built = fetchedPayload ? buildInvoicePayload(fetchedPayload, row) : built;
          }
        }
      }
      if (!built) {
        message.error("Could not load service invoice data.");
        return;
      }
      setInvoiceData(built);
      setInvoiceOpen(true);
      setTimeout(() => {
        try { handleSmartPrint(invoiceRef.current); } catch { /* ignore */ }
        setTimeout(() => setInvoiceOpen(false), 500);
      }, 50);
    } catch {
      message.error("Could not generate service invoice.");
    } finally {
      setInvoiceLoadingId(null);
    }
  };

  const statusTagStyle = {
    fontSize: isMobile ? (isQuotation ? 10 : 9) : (isQuotation ? 11 : 10),
    lineHeight: '1.1',
    marginRight: 0,
  };
  const actionBtnStyle = { height: isMobile ? 22 : 26, padding: isMobile ? '0 8px' : '0 10px', borderRadius: 999, fontSize: isMobile ? 11 : 12, fontWeight: 700 };
  const actionBtnSecondaryStyle = { height: isMobile ? 22 : 26, padding: isMobile ? '0 8px' : '0 10px', borderRadius: 999, fontSize: isMobile ? 11 : 12 };
  const quotationActionBtnStyle = { height: isMobile ? 24 : 26, padding: isMobile ? '0 8px' : '0 10px', borderRadius: 999, fontSize: isMobile ? 11 : 12, fontWeight: 700 };
  const quotationActionBtnSecondaryStyle = { height: isMobile ? 24 : 26, padding: isMobile ? '0 8px' : '0 10px', borderRadius: 999, fontSize: isMobile ? 11 : 12 };
  const iconBtnStyle = { height: isMobile ? 20 : 18, padding: '0 6px', fontSize: isMobile ? 11 : 10 };

  const renderJobcardStatusActions = (r) => {
    const status = String(r.status || '').toLowerCase();
    const isPending = status === 'pending';
    const isCompleted = status === 'completed';
    const isInvoiceLoading = invoiceLoadingId === (r.jcNo || r.key || r.mobile || '');
    const miniStack = { display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.1 };
    const mobile = String(r?.mobile || '').replace(/[^\d+]/g, '');
    return (
      <div style={miniStack}>
        <Tooltip title={r.closeReason || r.followUpNotes || ''}>
          <Tag color={STATUS_COLOR[r.status] || 'default'} style={statusTagStyle}>
            {STATUS_LABEL[r.status] || r.status}
          </Tag>
        </Tooltip>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Button
            size="small"
            icon={<PhoneOutlined />}
            style={actionBtnSecondaryStyle}
            onClick={() => {
              if (!mobile) {
                message.warning('Mobile number not available');
                return;
              }
              window.location.href = `tel:${mobile}`;
            }}
          >
            Call
          </Button>
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
          ) : isCompleted ? (
            <Button
              size="small"
              type="default"
              icon={<FileTextOutlined />}
              loading={isInvoiceLoading}
              style={actionBtnSecondaryStyle}
              onClick={() => handleServiceInvoice(r)}
            >
              Service Invoice
            </Button>
          ) : null}
        </div>
      </div>
    );
  };

  const handleQuotationCall = (r) => {
    const mobile = String(r?.mobile || '').replace(/[^\d+]/g, '');
    if (!mobile) {
      message.warning('Mobile number not available');
      return;
    }
    window.location.href = `tel:${mobile}`;
  };

  const renderQuotationStatusActions = (r) => {
    const statusKey = String(r?.status || 'pending').toLowerCase();
    const isPending = statusKey === 'pending';

    if (!isPending) {
      return (
        <div style={{ display: 'flex', lineHeight: 1.1 }}>
          <Tooltip title={r.closeReason || r.followUpNotes || ''}>
            <Tag color={STATUS_COLOR[statusKey] || 'default'} style={statusTagStyle}>
              {STATUS_LABEL[statusKey] || statusKey}
            </Tag>
          </Tooltip>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.1 }}>
        <Tooltip title={r.closeReason || r.followUpNotes || ''}>
          <Tag color={STATUS_COLOR[statusKey] || 'default'} style={statusTagStyle}>
            {STATUS_LABEL[statusKey] || statusKey}
          </Tag>
        </Tooltip>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Tooltip title="Call customer">
            <Button
              size="small"
              icon={<PhoneOutlined />}
              style={quotationActionBtnSecondaryStyle}
              onClick={() => handleQuotationCall(r)}
            >
              Call
            </Button>
          </Tooltip>
          <Tooltip title="Mark done/booked with reason">
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              style={quotationActionBtnStyle}
              onClick={() => setClosing({ open: true, serial: r.serialNo, status: 'converted', reason: '', notes: '' })}
            >
              Done
            </Button>
          </Tooltip>
          <Button
            size="small"
            style={quotationActionBtnSecondaryStyle}
            onClick={() => setReschedule({ open: true, serial: r.serialNo, at: r.followUpAt || dayjs(), notes: r.followUpNotes || '' })}
          >
            Reschedule
          </Button>
        </div>
      </div>
    );
  };

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
          onClick={(event) => {
            event.stopPropagation();
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

  const renderBookingBalance = (r) => (
    <div style={stackStyle}>
      <div style={lineStyle}>{formatCurrency(r.balanceValue)}</div>
      <div style={smallLineStyle}>{r.balanceLabel || 'Balance'}</div>
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
      const secondLineParts = [color].filter(Boolean);
      const secondLine = secondLineParts.length ? secondLineParts.join(' | ') : '—';
      return (
        <div style={stackStyle}>
          <div style={smallLineStyle}>{[model, variant].filter(Boolean).join(' || ') || '—'}</div>
          <div style={smallLineStyle}>{secondLine}</div>
        </div>
      );
    } },
    { title: 'Invoice + Insurance', key: 'invoiceInsurance', width: 140, render: (_, r) => renderBookingInvoiceInsurance(r) },
    { title: 'RTO + Vehicle No', key: 'rtoVehicle', width: 140, render: (_, r) => renderBookingRtoVehicle(r) },
    { title: 'Status + File', key: 'statusFile', width: 170, render: (_, r) => renderBookingStatusFile(r) },
    { title: 'Balance', key: 'balance', width: 140, render: (_, r) => renderBookingBalance(r) },
  ] : [
    { title: 'Date / Branch', key: 'dateBranch', width: 145, render: (_, r) => (
      <div style={stackStyle}>
        <div style={{ ...smallLineStyle, fontWeight: 700 }}>{fmt(r.dateAt)}</div>
        <div style={{ ...smallLineStyle, color: '#475569' }}>{r.branch || '—'}</div>
      </div>
    ) },
    { title: 'Customer / Mobile', key: 'customerMobile', width: 165, render: (_, r) => (
      <div style={stackStyle}>
        <div style={{ ...smallLineStyle, fontWeight: 700 }}>{r.name || '—'}</div>
        <div style={{ ...smallLineStyle, color: '#334155' }}>{r.mobile || '—'}</div>
      </div>
    ) },
    { title: 'Offerings', key: 'remarks', width: 265, render: (_, r) => {
      const details = buildQuotationOfferingDetails(r);
      const count = details.vehicles.length;
      const popoverContent = (
        <div className="fu-offering-pop">
          <div className="fu-offering-head">
            <span>{count ? `${count} Vehicle Offer${count > 1 ? 's' : ''}` : 'Offer Details'}</span>
          </div>
          
          {details.vehicles.length ? details.vehicles.map((v) => (
            <div key={v.label} className="fu-offering-vehicle">
              <div className="fu-offering-vehicle-title">{v.label}</div>
              <div className="fu-offering-vehicle-model">{v.title}</div>
              <div className="fu-offering-metrics">
                <span><b>Price</b>: {v.priceText}</span>
                {v.showFinance ? <span><b>DP</b>: {v.dpText}</span> : null}
              </div>
              {v.showFinance && v.emiText ? <div className="fu-offering-emi">{v.emiText}</div> : null}
              {v.fittings.length ? (
                <div className="fu-offering-fit">
                  <b>Fittings</b>: {v.fittings.join(', ')}
                </div>
              ) : null}
            </div>
          )) : (
            <div className="fu-offering-empty">No vehicle-wise offer added.</div>
          )}
        </div>
      );
      return (
        <Popover content={popoverContent} trigger={['hover', 'click']} placement="topLeft" overlayClassName="fu-offering-popover">
          <div className="fu-offering-list">
            {count ? details.vehicles.map((v) => (
              <div key={v.label} className="fu-offering-list-item">
                <span className="fu-offering-list-label">{v.label}:</span> {v.title}
              </div>
            )) : (
              <div style={offeringClamp}>No offering details</div>
            )}
          </div>
        </Popover>
      );
    } },
    { title: 'Status + Actions', key: 'statusActions', width: 160, render: (_, r) => renderQuotationStatusActions(r) },
    { title: 'Follow-up Notes', key: 'followUpNotes', width: 190, render: (_, r) => {
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
        {renderBookingBalance(r)}
      </div>
    ) },
  ] : [
    { title: 'Details', key: 'details', render: (_, r) => {
      const dateBranch = [fmt(r.dateAt), r.branch || '—'].filter(Boolean).join(' | ');
      const custMobile = [r.name || '—', r.mobile || '—'].filter(Boolean).join(' | ');
      const details = buildQuotationOfferingDetails(r);
      const count = details.vehicles.length;
      const notes = String(r.followUpNotes || '').trim();
      const popoverContent = (
        <div className="fu-offering-pop">
          <div className="fu-offering-head">
            <span>{count ? `${count} Vehicle Offer${count > 1 ? 's' : ''}` : 'Offer Details'}</span>
          </div>
          {details.vehicles.length ? details.vehicles.map((v) => (
            <div key={v.label} className="fu-offering-vehicle">
              <div className="fu-offering-vehicle-title">{v.label}</div>
              <div className="fu-offering-vehicle-model">{v.title}</div>
              <div className="fu-offering-metrics">
                <span><b>Price</b>: {v.priceText}</span>
                {v.showFinance ? <span><b>DP</b>: {v.dpText}</span> : null}
              </div>
              {v.showFinance && v.emiText ? <div className="fu-offering-emi">{v.emiText}</div> : null}
              {v.fittings.length ? (
                <div className="fu-offering-fit">
                  <b>Fittings</b>: {v.fittings.join(', ')}
                </div>
              ) : null}
            </div>
          )) : (
            <div className="fu-offering-empty">No vehicle-wise offer added.</div>
          )}
        </div>
      );
      return (
        <div style={stackStyle}>
          <div style={lineStyle}>{dateBranch || '—'}</div>
          <div style={smallLineStyle}>{custMobile || '—'}</div>
          {count ? (
            <Popover
              content={popoverContent}
              trigger={['click']}
              placement="topLeft"
              overlayClassName="fu-offering-popover"
            >
              <div className="fu-offering-list">
                {details.vehicles.map((v) => (
                  <div key={v.label} className="fu-offering-list-item">
                    <span className="fu-offering-list-label">{v.label}:</span> {v.title}
                  </div>
                ))}
              </div>
            </Popover>
          ) : (
            <div style={offeringClamp}>No offering details</div>
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
      <div className={`fu-bg ${isQuotation ? 'fu-mode-quotation' : ''}`}>
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
          .fu-mode-quotation {
            background:
              radial-gradient(1200px 620px at 2% 0%, rgba(29, 78, 216, 0.18), transparent 58%),
              radial-gradient(980px 540px at 96% 0%, rgba(14, 165, 233, 0.12), transparent 56%),
              radial-gradient(820px 420px at 50% 100%, rgba(34, 197, 94, 0.10), transparent 62%),
              linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(255, 255, 255, 0.88));
          }
          .fu-mode-quotation .fu-card-quotation {
            border: 1px solid #dbeafe;
            box-shadow: 0 14px 36px rgba(30, 64, 175, 0.12);
          }
          .fu-head-grid {
            display: flex;
            gap: 14px;
            flex-wrap: wrap;
            align-items: flex-start;
            justify-content: space-between;
          }
          .fu-head-controls-wrap {
            border: 1px solid #dbeafe;
            border-radius: 14px;
            background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,250,252,0.92));
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.6);
            padding: 10px;
          }
          .fu-mode-quotation .compact-table-quotation .ant-table-thead > tr > th {
            text-transform: uppercase;
            font-size: 11px;
            letter-spacing: 0.35px;
            color: #0f172a;
          }
          .fu-mode-quotation .compact-table-quotation .ant-table-tbody > tr:nth-child(even) > td {
            background: rgba(248, 250, 252, 0.78);
          }
          .fu-mode-quotation .compact-table-quotation .ant-table-tbody > tr > td {
            padding-top: 10px;
            padding-bottom: 10px;
          }
          .fu-mode-quotation .compact-table-quotation .ant-table-tbody > tr:hover > td {
            background: rgba(30, 64, 175, 0.08) !important;
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
          .fu-offering-popover .ant-popover-inner {
            border-radius: 14px;
            border: 1px solid #dbeafe;
            box-shadow: 0 18px 40px rgba(15, 23, 42, 0.2);
            padding: 10px;
            min-width: 360px;
            max-width: 520px;
            background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
          }
          .fu-offering-pop { display: flex; flex-direction: column; gap: 8px; }
          .fu-offering-head {
            font-size: 13px;
            font-weight: 800;
            color: #1d4ed8;
            letter-spacing: 0.2px;
          }
          .fu-offering-remarks {
            border-left: 3px solid #93c5fd;
            padding-left: 8px;
            color: #0f172a;
            font-size: 12px;
            line-height: 1.35;
          }
          .fu-offering-vehicle {
            border: 1px solid #dbeafe;
            border-radius: 10px;
            padding: 8px;
            background: #f8fbff;
          }
          .fu-offering-vehicle-title {
            font-size: 11px;
            font-weight: 800;
            color: #1e3a8a;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .fu-offering-vehicle-model {
            font-size: 12px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 4px;
          }
          .fu-offering-metrics {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            font-size: 12px;
            color: #1f2937;
          }
          .fu-offering-emi {
            margin-top: 4px;
            font-size: 11px;
            color: #334155;
            line-height: 1.3;
          }
          .fu-offering-fit {
            margin-top: 4px;
            font-size: 11px;
            color: #334155;
            line-height: 1.3;
          }
          .fu-offering-empty {
            font-size: 12px;
            color: #64748b;
          }
          .fu-offering-list {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .fu-offering-list-item {
            font-size: 10.5px;
            line-height: 1.3;
            color: #1f2937;
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 1;
            overflow: hidden;
            white-space: normal;
          }
          .fu-offering-list-label {
            font-weight: 800;
            color: #1d4ed8;
          }
          @media (max-width: 640px) {
            .fu-head-grid {
              flex-direction: column;
            }
            .fu-head-controls-wrap {
              padding: 8px;
            }
            .fu-offering-popover .ant-popover-inner {
              min-width: 280px;
              max-width: calc(100vw - 24px);
            }
          }
        `}</style>
        <Card className={isQuotation ? 'fu-card-quotation' : ''} style={softCard} bodyStyle={{ padding: isMobile ? 12 : 16 }}>
          <div className="fu-head-grid" style={{ alignItems: isMobile ? 'stretch' : 'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>
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
                <div className={isQuotation ? 'fu-head-controls-wrap' : ''} style={{ width: '100%' }}>
                <Space wrap={!isMobile} direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: '100%' }}>
                  {isJobcard ? (
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
                  ) : !isBooking ? (
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
                         
                        ] : [
                          { label: 'All', value: 'all' },
                          { label: 'Due Today', value: 'today' },
                         
                        ]}
                      />
                    </div>
                  ) : null}

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

                  {isPrivilegedUser && (
                    <Select
                      value={selectedBranch}
                      onChange={(v) => setSelectedBranch(v)}
                      options={branchOptions}
                      placeholder="Filter branch"
                      style={{ minWidth: isMobile ? '100%' : 150, width: controlWidth }}
                    />
                  )}

                  {isQuotation ? (
                    <Button
                      onClick={() => {
                        setFilter('all');
                        setDateRange(null);
                        setQ('');
                        if (isPrivilegedUser) setSelectedBranch('all');
                      }}
                      style={isMobile ? { ...pillBtn, width: '100%' } : pillBtn}
                    >
                      Reset
                    </Button>
                  ) : null}

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
            className={`compact-table ${isQuotation ? 'compact-table-quotation' : ''}`}
            rowClassName={(r) => (isRowPendingStatus(r) ? 'row-pending' : '')}
            onRow={(row) => ({
              onClick: (event) => {
                if (!isBooking) return;
                if (shouldSkipRowClick(event)) return;
                handleBookingRowClick(row);
              },
              style: isBooking ? { cursor: 'pointer' } : undefined,
            })}
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
        onCancel={() => setReschedule({ open: false, serial: null, at: null, notes: '' })}
        onOk={() => {
          const serial = reschedule.serial;
          const stamped = buildStampedNote(reschedule.notes);
          const patch = { followUp: { at: reschedule.at?.toISOString?.() || null, notes: stamped }, status: 'pending' };
          const previousRow = applyOptimisticFollowUpPatch(serial, patch);
          setReschedule({ open: false, serial: null, at: null, notes: '' });
          void (async () => {
            const ok = await updateFollowUp(serial, patch, { refreshOnSuccess: false, showSuccessMessage: false, showErrorMessage: true });
            if (!ok) {
              rollbackOptimisticFollowUpPatch(serial, previousRow);
              await fetchFollowUps();
              return;
            }
            void fetchFollowUps();
          })();
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
        onOk={() => {
          const serial = closing.serial;
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
          const previousRow = applyOptimisticFollowUpPatch(serial, patch);
          setClosing({ open: false, serial: null, status: 'converted', details: '', boughtFrom: '', offer: '' });
          void (async () => {
            const ok = await updateFollowUp(serial, patch, { refreshOnSuccess: false, showSuccessMessage: false, showErrorMessage: true });
            if (!ok) {
              rollbackOptimisticFollowUpPatch(serial, previousRow);
              await fetchFollowUps();
              return;
            }
            void fetchFollowUps();
          })();
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
      {isJobcard && (
        <PostServiceSheet
          ref={invoiceRef}
          active={invoiceOpen}
          vals={invoiceData?.vals || {}}
          totals={invoiceData?.totals || {}}
        />
      )}
      {preparingBooking && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1900,
            background: "rgba(255,255,255,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "all",
          }}
        >
          <div style={{ textAlign: "center", color: "#111" }}>
            <Spin tip="Preparing booking form..." size="large" />
            <div style={{ marginTop: 12, fontWeight: 600 }}>
              Redirecting to booking form...
            </div>
          </div>
        </div>
      )}
      </div>
    </ErrorBoundary>
  );
}
