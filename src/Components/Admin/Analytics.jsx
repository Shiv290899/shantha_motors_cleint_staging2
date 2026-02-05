import React, { useEffect, useMemo, useState } from "react";
import { Card, Col, DatePicker, Row, Select, Space, Typography, Table, Button, message, Grid, Spin, Tag, Divider, Checkbox } from "antd";
import dayjs from "dayjs";
import { saveBookingViaWebhook, saveJobcardViaWebhook } from "../../apiCalls/forms";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { FiTrendingUp, FiUsers, FiCheckCircle, FiFileText, FiActivity } from "react-icons/fi";

const { Title, Text } = Typography;

const DEFAULT_BOOKING_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwSn5hp1cSWlJMGhe2cYUtid2Ruqh9H13mZbq0PwBpYB0lMLufZbIjZ5zioqtKgE_0sNA/exec";
const DEFAULT_QUOT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbxXtfRVEFeaKu10ijzfQdOVlgkZWyH1q1t4zS3PHTX9rQQ7ztRJdpFV5svk98eUs3UXuw/exec";
const DEFAULT_JOBCARD_GAS_URL =
  "https://script.google.com/macros/s/AKfycbxwuwETUUiAoFyksSoEOHVimCtlIZYb6JTQ7yJ8-vkwth9xYwEOlMA8ktiE45UQ6VA3Lg/exec";

const HEAD_BOOKING = { ts: ["Submitted At", "Timestamp", "Time", "Date"], branch: ["Branch"] };
const HEAD_QUOT = { ts: ["Timestamp", "Time", "Date"], branch: ["Branch"], executive: ["Executive"], payload: ["Payload"] };
const HEAD_JC = {
  ts: ["Timestamp", "Time", "Date"],
  branch: ["Branch"],
  executive: ["Executive"],
  payload: ["Payload"],
};

const pick = (obj, aliases) => String(aliases.map((k) => obj?.[k] ?? "").find((v) => v !== "") || "").trim();
const normalizeKey = (v) => String(v || "").trim().toLowerCase();
function parseTsMs(v) {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  const s = String(v).trim();
  const dIso = new Date(s);
  if (!isNaN(dIso.getTime())) return dIso.getTime();
  const m = s.match(/^(\d{1,2})([/-])(\d{1,2})\2(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (m) {
    const sep = m[2];
    let a = parseInt(m[1], 10);
    let b = parseInt(m[3], 10);
    let y = parseInt(m[4], 10);
    if (y < 100) y += 2000;
    let month;
    let day;
    if (sep === "-") {
      day = a;
      month = b - 1;
    } else if (a > 12) {
      day = a;
      month = b - 1;
    } else {
      month = a - 1;
      day = b;
    }
    let hh = m[5] ? parseInt(m[5], 10) : 0;
    const mm = m[6] ? parseInt(m[6], 10) : 0;
    const ss = m[7] ? parseInt(m[7], 10) : 0;
    const ap = (m[8] || "").toUpperCase();
    if (ap === "PM" && hh < 12) hh += 12;
    if (ap === "AM" && hh === 12) hh = 0;
    const d = new Date(y, month, day, hh, mm, ss);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

export default function Analytics() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const [dateRange, setDateRange] = useState(null);
  const [datePreset, setDatePreset] = useState("all"); // all | today | yesterday | last7 | last30 | mtd | ytd
  const [branchFilter, setBranchFilter] = useState([]); // array of normalized keys
  const [executiveFilter, setExecutiveFilter] = useState([]); // array of normalized keys
  const [sourceFilter, setSourceFilter] = useState(["bookings", "quotations", "jobcards"]);
  const [groupBy, setGroupBy] = useState("day"); // day | week | month
  const [loading, setLoading] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [jobcards, setJobcards] = useState([]);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);

  const BOOKING_GAS_URL = import.meta.env.VITE_BOOKING_GAS_URL || DEFAULT_BOOKING_GAS_URL;
  const BOOKING_SECRET = import.meta.env.VITE_BOOKING_GAS_SECRET || "";
  const QUOT_GAS_URL = import.meta.env.VITE_QUOTATION_GAS_URL || DEFAULT_QUOT_GAS_URL;
  const QUOT_SECRET = import.meta.env.VITE_QUOTATION_GAS_SECRET || "";
  const JOBCARD_GAS_URL = import.meta.env.VITE_JOBCARD_GAS_URL || DEFAULT_JOBCARD_GAS_URL;
  const JOBCARD_SECRET = import.meta.env.VITE_JOBCARD_GAS_SECRET || "";

  const fetchBookings = async () => {
    if (!BOOKING_GAS_URL) return [];
    const pageSize = 5000;
    const all = [];
    let page = 1;
    for (;;) {
      const payload = BOOKING_SECRET
        ? { action: "list", page, pageSize, secret: BOOKING_SECRET }
        : { action: "list", page, pageSize };
      const resp = await saveBookingViaWebhook({ webhookUrl: BOOKING_GAS_URL, method: "GET", payload });
      const js = resp?.data || resp;
      const dataArr = Array.isArray(js?.data) ? js.data : [];
      all.push(...dataArr);
      const total = typeof js?.total === "number" ? js.total : null;
      if (total !== null && all.length >= total) break;
      if (dataArr.length === 0) break;
      page += 1;
      if (page > 100) break;
    }
    return all.map((o) => {
      const obj = o?.values ? o.values : o;
      const ts = pick(obj, HEAD_BOOKING.ts);
      return {
        ts,
        tsMs: parseTsMs(ts),
        branch: pick(obj, HEAD_BOOKING.branch),
        _raw: o,
      };
    });
  };

  const fetchQuotations = async () => {
    if (!QUOT_GAS_URL) return [];
    const pageSize = 5000;
    const all = [];
    let page = 1;
    for (;;) {
      const payload = QUOT_SECRET
        ? { action: "list", page, pageSize, secret: QUOT_SECRET }
        : { action: "list", page, pageSize };
      const resp = await saveBookingViaWebhook({ webhookUrl: QUOT_GAS_URL, method: "GET", payload });
      const js = resp?.data || resp;
      const dataArr = Array.isArray(js?.data) ? js.data : [];
      all.push(...dataArr);
      const total = typeof js?.total === "number" ? js.total : null;
      if (total !== null && all.length >= total) break;
      if (dataArr.length === 0) break;
      page += 1;
      if (page > 100) break;
    }
    return all.map((o) => {
      const obj = o?.values ? o.values : o;
      const payloadRaw = o?.payload || obj?.[HEAD_QUOT.payload[0]] || "";
      let payloadObj = null;
      try {
        payloadObj = typeof payloadRaw === "object" ? payloadRaw : JSON.parse(String(payloadRaw || "{}"));
      } catch {
        payloadObj = null;
      }
      const fv = payloadObj?.formValues || {};
      const ts = pick(obj, HEAD_QUOT.ts);
      return {
        ts,
        tsMs: parseTsMs(ts),
        branch: fv.branch || pick(obj, HEAD_QUOT.branch),
        executive: fv.executive || pick(obj, HEAD_QUOT.executive),
        _raw: o,
      };
    });
  };

  const fetchJobcards = async () => {
    if (!JOBCARD_GAS_URL) return [];
    const pageSize = 5000;
    const all = [];
    let page = 1;
    for (;;) {
      const payload = JOBCARD_SECRET
        ? { action: "list", page, pageSize, secret: JOBCARD_SECRET }
        : { action: "list", page, pageSize };
      const resp = await saveJobcardViaWebhook({ webhookUrl: JOBCARD_GAS_URL, method: "GET", payload });
      const js = resp?.data || resp;
      const dataArr = Array.isArray(js?.data) ? js.data : [];
      all.push(...dataArr);
      const total = typeof js?.total === "number" ? js.total : null;
      if (total !== null && all.length >= total) break;
      if (dataArr.length === 0) break;
      page += 1;
      if (page > 100) break;
    }
    return all.map((o) => {
      const obj = o?.values ? o.values : o;
      const payloadRaw = o?.payload || obj?.[HEAD_JC.payload[0]] || "";
      let payloadObj = null;
      try {
        payloadObj = typeof payloadRaw === "object" ? payloadRaw : JSON.parse(String(payloadRaw || "{}"));
      } catch {
        payloadObj = null;
      }
      const fv = payloadObj?.formValues || {};
      const ts = pick(obj, HEAD_JC.ts);
      return {
        ts,
        tsMs: parseTsMs(ts),
        branch: fv.branch || pick(obj, HEAD_JC.branch),
        executive: fv.executive || pick(obj, HEAD_JC.executive),
        _raw: o,
      };
    });
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const [b, q, j] = await Promise.all([fetchBookings(), fetchQuotations(), fetchJobcards()]);
      setBookings(b);
      setQuotations(q);
      setJobcards(j);
      setLastLoadedAt(Date.now());
    } catch {
      message.error("Could not load analytics data. Check Apps Script URLs / access.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filterByRange = (list, { hasExec }) => {
    const start = dateRange?.[0] ? dateRange[0].startOf("day").valueOf() : null;
    const end = dateRange?.[1] ? dateRange[1].endOf("day").valueOf() : null;
    return (list || []).filter((r) => {
      if (branchFilter.length) {
        const key = normalizeKey(r.branch);
        if (!branchFilter.includes(key)) return false;
      }
      if (hasExec && executiveFilter.length) {
        const key = normalizeKey(r.executive);
        if (!executiveFilter.includes(key)) return false;
      }
      if (start && (!r.tsMs || r.tsMs < start)) return false;
      if (end && (!r.tsMs || r.tsMs > end)) return false;
      return true;
    });
  };

  const filteredBookings = useMemo(
    () => (sourceFilter.includes("bookings") ? filterByRange(bookings, { hasExec: false }) : []),
    [bookings, dateRange, branchFilter, sourceFilter]
  );
  const filteredQuotations = useMemo(
    () => (sourceFilter.includes("quotations") ? filterByRange(quotations, { hasExec: true }) : []),
    [quotations, dateRange, branchFilter, executiveFilter, sourceFilter]
  );
  const filteredJobcards = useMemo(
    () => (sourceFilter.includes("jobcards") ? filterByRange(jobcards, { hasExec: true }) : []),
    [jobcards, dateRange, branchFilter, executiveFilter, sourceFilter]
  );

  const { branchOptions, branchLabelByKey } = useMemo(() => {
    const metaByKey = new Map();
    const add = (raw) => {
      const label = String(raw || "").trim();
      if (!label) return;
      const key = normalizeKey(label);
      const meta = metaByKey.get(key);
      if (!meta) {
        metaByKey.set(key, { label, count: 1 });
        return;
      }
      meta.count += 1;
      if (meta.label !== label && label.length > meta.label.length) {
        meta.label = label;
      }
    };
    [...bookings, ...quotations, ...jobcards].forEach((r) => add(r.branch));
    const options = Array.from(metaByKey.entries()).map(([key, meta]) => ({
      key,
      label: meta.label,
    }));
    options.sort((a, b) => a.label.localeCompare(b.label));
    return {
      branchOptions: options.map((o) => o.key),
      branchLabelByKey: new Map(options.map((o) => [o.key, o.label])),
    };
  }, [bookings, quotations, jobcards]);

  const { executiveOptions, executiveLabelByKey } = useMemo(() => {
    const metaByKey = new Map();
    const add = (raw) => {
      const label = String(raw || "").trim();
      if (!label) return;
      const key = normalizeKey(label);
      const meta = metaByKey.get(key);
      if (!meta) {
        metaByKey.set(key, { label, count: 1 });
        return;
      }
      meta.count += 1;
      if (meta.label !== label && label.length > meta.label.length) {
        meta.label = label;
      }
    };
    [...quotations, ...jobcards].forEach((r) => add(r.executive));
    const options = Array.from(metaByKey.entries()).map(([key, meta]) => ({
      key,
      label: meta.label,
    }));
    options.sort((a, b) => a.label.localeCompare(b.label));
    return {
      executiveOptions: options.map((o) => o.key),
      executiveLabelByKey: new Map(options.map((o) => [o.key, o.label])),
    };
  }, [quotations, jobcards]);

  const branchSummary = useMemo(() => {
    const map = new Map();
    const upsert = (branch, field, delta) => {
      if (!branch) return;
      const key = normalizeKey(branch);
      if (!map.has(key)) {
        map.set(key, {
          key,
          branch: branchLabelByKey.get(key) || branch,
          bookings: 0,
          quotations: 0,
          jobcards: 0,
          total: 0,
        });
      }
      const row = map.get(key);
      row[field] += delta;
    };
    filteredBookings.forEach((r) => {
      upsert(r.branch, "bookings", 1);
      upsert(r.branch, "total", 1);
    });
    filteredQuotations.forEach((r) => {
      upsert(r.branch, "quotations", 1);
      upsert(r.branch, "total", 1);
    });
    filteredJobcards.forEach((r) => {
      upsert(r.branch, "jobcards", 1);
      upsert(r.branch, "total", 1);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredBookings, filteredQuotations, filteredJobcards, branchLabelByKey]);

  const executiveSummary = useMemo(() => {
    const map = new Map();
    const add = (exec, field, delta) => {
      if (!exec) return;
      const key = normalizeKey(exec);
      if (!map.has(key)) {
        map.set(key, {
          key,
          executive: executiveLabelByKey.get(key) || exec,
          jobcards: 0,
          quotations: 0,
          total: 0,
        });
      }
      const row = map.get(key);
      row[field] += delta;
    };
    filteredJobcards.forEach((r) => {
      add(r.executive, "jobcards", 1);
      add(r.executive, "total", 1);
    });
    filteredQuotations.forEach((r) => {
      add(r.executive, "quotations", 1);
      add(r.executive, "total", 1);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredJobcards, filteredQuotations, executiveLabelByKey]);

  const totals = useMemo(() => {
    return {
      bookings: filteredBookings.length,
      quotations: filteredQuotations.length,
      jobcards: filteredJobcards.length,
      total: filteredBookings.length + filteredQuotations.length + filteredJobcards.length,
    };
  }, [filteredBookings, filteredQuotations, filteredJobcards]);

  const ratios = useMemo(() => {
    const bookings = totals.bookings || 0;
    const quotations = totals.quotations || 0;
    const jobcards = totals.jobcards || 0;
    const quotRate = bookings ? (quotations / bookings) * 100 : 0;
    const jcRate = bookings ? (jobcards / bookings) * 100 : 0;
    return {
      quotRate,
      jcRate,
    };
  }, [totals]);

  const dailySeries = useMemo(() => {
    const map = new Map();
    const add = (ms, field, delta) => {
      if (!ms) return;
      const base = dayjs(ms);
      const key =
        groupBy === "month"
          ? base.startOf("month").format("YYYY-MM")
          : groupBy === "week"
          ? base.startOf("week").format("YYYY-MM-DD")
          : base.format("YYYY-MM-DD");
      if (!map.has(key)) {
        map.set(key, { date: key, bookings: 0, quotations: 0, jobcards: 0, total: 0 });
      }
      const row = map.get(key);
      row[field] += delta;
    };
    filteredBookings.forEach((r) => {
      add(r.tsMs, "bookings", 1);
      add(r.tsMs, "total", 1);
    });
    filteredQuotations.forEach((r) => {
      add(r.tsMs, "quotations", 1);
      add(r.tsMs, "total", 1);
    });
    filteredJobcards.forEach((r) => {
      add(r.tsMs, "jobcards", 1);
      add(r.tsMs, "total", 1);
    });
    return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [filteredBookings, filteredQuotations, filteredJobcards, groupBy]);

  const branchExecutiveSummary = useMemo(() => {
    const map = new Map();
    const add = (branch, exec, field, delta) => {
      if (!branch || !exec) return;
      const bKey = normalizeKey(branch);
      const eKey = normalizeKey(exec);
      const key = `${bKey}__${eKey}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          branch: branchLabelByKey.get(bKey) || branch,
          executive: executiveLabelByKey.get(eKey) || exec,
          jobcards: 0,
          quotations: 0,
          total: 0,
        });
      }
      const row = map.get(key);
      row[field] += delta;
    };
    filteredJobcards.forEach((r) => {
      add(r.branch, r.executive, "jobcards", 1);
      add(r.branch, r.executive, "total", 1);
    });
    filteredQuotations.forEach((r) => {
      add(r.branch, r.executive, "quotations", 1);
      add(r.branch, r.executive, "total", 1);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredJobcards, filteredQuotations, branchLabelByKey, executiveLabelByKey]);

  const kpiCards = [
    {
      key: "bookings",
      label: "Bookings",
      value: totals.bookings,
      icon: <FiUsers />,
      color: "#0ea5e9",
      bg: "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)",
    },
    {
      key: "quotations",
      label: "Quotations",
      value: totals.quotations,
      icon: <FiFileText />,
      color: "#f59e0b",
      bg: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
    },
    {
      key: "jobcards",
      label: "Job Cards",
      value: totals.jobcards,
      icon: <FiCheckCircle />,
      color: "#22c55e",
      bg: "linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)",
    },
    {
      key: "quotRate",
      label: "Quotations / Bookings",
      value: `${ratios.quotRate.toFixed(1)}%`,
      icon: <FiTrendingUp />,
      color: "#ef4444",
      bg: "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)",
    },
    {
      key: "jcRate",
      label: "Job Cards / Bookings",
      value: `${ratios.jcRate.toFixed(1)}%`,
      icon: <FiTrendingUp />,
      color: "#0ea5e9",
      bg: "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)",
    },
    {
      key: "total",
      label: "Total Activity",
      value: totals.total,
      icon: <FiActivity />,
      color: "#0f172a",
      bg: "linear-gradient(135deg, #e2e8f0 0%, #cbd5f5 100%)",
    },
  ];

  const branchColumns = [
    { title: "Branch", dataIndex: "branch", key: "branch" },
    { title: "Bookings", dataIndex: "bookings", key: "bookings", width: 110 },
    { title: "Quotations", dataIndex: "quotations", key: "quotations", width: 120 },
    { title: "Job Cards", dataIndex: "jobcards", key: "jobcards", width: 110 },
    {
      title: "Total",
      dataIndex: "total",
      key: "total",
      render: (v) => <Text strong>{v}</Text>,
    },
  ];

  const executiveColumns = [
    { title: "Executive", dataIndex: "executive", key: "executive" },
    { title: "Job Cards", dataIndex: "jobcards", key: "jobcards", width: 110 },
    { title: "Quotations", dataIndex: "quotations", key: "quotations", width: 120 },
    {
      title: "Total",
      dataIndex: "total",
      key: "total",
      render: (v) => <Text strong>{v}</Text>,
    },
  ];

  return (
    <div style={{ padding: isMobile ? 4 : 12 }}>
      <Row justify="space-between" align="middle" gutter={[12, 12]}>
        <Col xs={24} md={12}>
          <Title level={3} style={{ margin: 0 }}>Analytics</Title>
          <Text type="secondary">
            {lastLoadedAt ? `Last refreshed ${dayjs(lastLoadedAt).format("DD-MM-YYYY HH:mm")}` : "Ready"}
          </Text>
        </Col>
        <Col xs={24} md={12}>
          <Space wrap style={{ justifyContent: "flex-end", width: "100%" }}>
            <Select
              mode="multiple"
              value={branchFilter}
              onChange={(vals) => setBranchFilter(vals)}
              style={{ minWidth: 200 }}
              options={branchOptions.map((b) => ({
                label: branchLabelByKey.get(b) || b,
                value: b,
              }))}
              maxTagCount="responsive"
              placeholder="All Branches"
              allowClear
            />
            <Select
              mode="multiple"
              value={executiveFilter}
              onChange={(vals) => setExecutiveFilter(vals)}
              style={{ minWidth: 200 }}
              options={executiveOptions.map((b) => ({
                label: executiveLabelByKey.get(b) || b,
                value: b,
              }))}
              maxTagCount="responsive"
              placeholder="All Executives"
              allowClear
            />
            <Select
              value={datePreset}
              onChange={(val) => {
                setDatePreset(val);
                if (val === "all") { setDateRange(null); return; }
                const now = dayjs();
                if (val === "today") setDateRange([now.startOf("day"), now.endOf("day")]);
                else if (val === "yesterday") {
                  const y = now.subtract(1, "day");
                  setDateRange([y.startOf("day"), y.endOf("day")]);
                } else if (val === "last7") setDateRange([now.subtract(6, "day").startOf("day"), now.endOf("day")]);
                else if (val === "last30") setDateRange([now.subtract(29, "day").startOf("day"), now.endOf("day")]);
                else if (val === "mtd") setDateRange([now.startOf("month"), now.endOf("day")]);
                else if (val === "ytd") setDateRange([now.startOf("year"), now.endOf("day")]);
              }}
              style={{ minWidth: 160 }}
              options={[
                { value: "all", label: "All Time" },
                { value: "today", label: "Today" },
                { value: "yesterday", label: "Yesterday" },
                { value: "last7", label: "Last 7 Days" },
                { value: "last30", label: "Last 30 Days" },
                { value: "mtd", label: "Month to Date" },
                { value: "ytd", label: "Year to Date" },
              ]}
            />
            <DatePicker.RangePicker
              value={dateRange}
              onChange={(val) => { setDateRange(val); if (val) setDatePreset("custom"); }}
              allowClear
            />
            <Select
              value={groupBy}
              onChange={setGroupBy}
              style={{ minWidth: 120 }}
              options={[
                { value: "day", label: "Group: Day" },
                { value: "week", label: "Group: Week" },
                { value: "month", label: "Group: Month" },
              ]}
            />
            <Checkbox.Group
              value={sourceFilter}
              onChange={(vals) => setSourceFilter((prev) => (vals.length ? vals : prev))}
              options={[
                { label: "Bookings", value: "bookings" },
                { label: "Quotations", value: "quotations" },
                { label: "Job Cards", value: "jobcards" },
              ]}
            />
            <Button onClick={refresh} loading={loading}>Refresh</Button>
          </Space>
        </Col>
      </Row>

      <Divider />

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24}>
          <Row gutter={[12, 12]}>
            {kpiCards.map((kpi) => (
              <Col key={kpi.key} xs={24} sm={12} lg={8} xl={4}>
                <Card
                  bodyStyle={{ padding: 14 }}
                  style={{ borderRadius: 12, background: kpi.bg, border: "1px solid rgba(0,0,0,0.06)" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(255,255,255,0.75)",
                      color: kpi.color,
                      fontSize: 18,
                    }}>
                      {kpi.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "#334155", fontWeight: 600 }}>{kpi.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{kpi.value}</div>
                    </div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Branch-level Activity" bodyStyle={{ padding: 12 }}>
            {loading ? (
              <Spin />
            ) : (
              <>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={branchSummary.slice(0, 8)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="branch" tick={{ fontSize: 11 }} interval={0} angle={-15} height={50} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="bookings" stackId="a" fill="#06b6d4" name="Bookings" />
                      <Bar dataKey="quotations" stackId="a" fill="#f59e0b" name="Quotations" />
                      <Bar dataKey="jobcards" stackId="a" fill="#2563eb" name="Job Cards" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <Table
                  size="small"
                  columns={branchColumns}
                  dataSource={branchSummary}
                  pagination={false}
                  locale={{ emptyText: "No data" }}
                  scroll={{ x: 540 }}
                  style={{ marginTop: 12 }}
                />
              </>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title="Trends Over Time"
            extra={
              <Tag color="blue">
                {groupBy === "day" ? "Daily" : groupBy === "week" ? "Weekly" : "Monthly"}
              </Tag>
            }
            bodyStyle={{ padding: 12 }}
          >
            {loading ? (
              <Spin />
            ) : (
              <>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailySeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="bookings" stroke="#06b6d4" name="Bookings" strokeWidth={2} />
                      <Line type="monotone" dataKey="quotations" stroke="#f59e0b" name="Quotations" strokeWidth={2} />
                      <Line type="monotone" dataKey="jobcards" stroke="#2563eb" name="Job Cards" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <Table
                  size="small"
                  columns={[
                    { title: "Date", dataIndex: "date", key: "date" },
                    { title: "Bookings", dataIndex: "bookings", key: "bookings" },
                    { title: "Quotations", dataIndex: "quotations", key: "quotations" },
                    { title: "Job Cards", dataIndex: "jobcards", key: "jobcards" },
                    { title: "Total", dataIndex: "total", key: "total" },
                  ]}
                  dataSource={dailySeries.slice(-10).reverse()}
                  pagination={false}
                  locale={{ emptyText: "No data" }}
                  style={{ marginTop: 12 }}
                />
              </>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Performance Tracking" bodyStyle={{ padding: 12 }}>
            {loading ? (
              <Spin />
            ) : (
              <>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={executiveSummary.slice(0, 8)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="executive" tick={{ fontSize: 11 }} interval={0} angle={-15} height={50} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="jobcards" stackId="a" fill="#2563eb" name="Job Cards" />
                      <Bar dataKey="quotations" stackId="a" fill="#f59e0b" name="Quotations" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <Table
                  size="small"
                  columns={executiveColumns}
                  dataSource={executiveSummary.slice(0, 10)}
                  pagination={false}
                  locale={{ emptyText: "No data" }}
                  style={{ marginTop: 12 }}
                />
              </>
            )}
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="Branch x Executive Performance" bodyStyle={{ padding: 12 }}>
            {loading ? (
              <Spin />
            ) : (
              <Table
                size="small"
                columns={[
                  { title: "Branch", dataIndex: "branch", key: "branch" },
                  { title: "Executive", dataIndex: "executive", key: "executive" },
                  { title: "Quotations", dataIndex: "quotations", key: "quotations" },
                  { title: "Job Cards", dataIndex: "jobcards", key: "jobcards" },
                  { title: "Total", dataIndex: "total", key: "total" },
                ]}
                dataSource={branchExecutiveSummary}
                pagination={{ pageSize: 15, showSizeChanger: true }}
                locale={{ emptyText: "No data" }}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
