// ViewSheet.jsx — read-only sheet viewer with date-only filter, search, Excel export,
// column chooser, density toggle, saved views, row highlighting, diff-aware refresh,
// and BRANCH dropdown in header.

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Button,
  Modal,
  Table,
  message,
  Space,
  DatePicker,
  Tooltip,
  Input,
  Dropdown,
  Checkbox,
  Badge,
  Select,
  Popconfirm,
  Segmented, // (kept import; control is commented below)
} from "antd";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
// Load xlsx only when the user exports to keep initial bundles small

dayjs.extend(customParseFormat);

const { RangePicker } = DatePicker;

/* ---------------------------------- Config ---------------------------------- */

// Date formats to try when parsing a date-like cell
const DATE_FORMATS = [
  "M/D/YYYY H:mm:ss",
  "D/M/YYYY H:mm:ss",
  "YYYY-MM-DD HH:mm:ss",
  "M/D/YYYY",
  "D/M/YYYY",
  "YYYY-MM-DD",
];

// Fallback date-like headers (case-insensitive)
const DEFAULT_DATE_KEYS = [
  "timestamp",
  "date",
  "created_at",
  "quotation_date",
  "job_date",
  "pickup_date",
  "shop_date",
];

// Amount-like headers for highlighting (case-insensitive)
const DEFAULT_AMOUNT_KEYS = [
  "amount",
  "price",
  "on_road_price",
  "onroadprice",
  "total",
  "grand_total",
  "estimate_total",
];

// Branch-like headers for filtering (case-insensitive)
const DEFAULT_BRANCH_KEYS = [
  "branch",
  "branch_name",
  "branches",
  "location",
  "pickup_station",
  "station",
];

// LocalStorage key helper (namespaced by sheet URL)
const keyFor = (url, suffix) => `ViewSheet:${url}:${suffix}`;

/* --------------------------------- Component -------------------------------- */

export default function ViewSheet({
  sheetCsvUrl,
  parseCSV,
  buttonText = "View Sheet",
  buttonProps = {},
  dateColumn,              // optional explicit date column
  amountColumn,            // optional explicit amount column (for highlight)
  highlightThreshold = 100000,
  presetsConfig,
  initialPreset = "Last 7 days",
}) {
  /* ------------------------------ UI / Data state ----------------------------- */
  const [open, setOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);

  // Filters
  const [range, setRange] = useState(null); // [dayjs|null, dayjs|null]
  const [searchText, setSearchText] = useState("");

  // Column chooser + density
  const [visibleCols, setVisibleCols] = useState([]);
  const [density, setDensity] = useState("compact"); // 'compact' | 'cozy'

  // Diff-aware refresh badge
  const [newCount, setNewCount] = useState(0);

  // Saved views
 
 

  // Branch filter state
  const [selectedBranches, setSelectedBranches] = useState([]); // array of labels/values

  /* ------------------------------ Column detect ------------------------------- */
  const detectedDateKey = useMemo(() => {
    if (dateColumn && headers.includes(dateColumn)) return dateColumn;
    const lower = headers.map((h) => h.toLowerCase());
    for (const k of DEFAULT_DATE_KEYS) {
      const i = lower.indexOf(k);
      if (i >= 0) return headers[i];
    }
    return null;
  }, [headers, dateColumn]);

  const detectedAmountKey = useMemo(() => {
    if (amountColumn && headers.includes(amountColumn)) return amountColumn;
    const lower = headers.map((h) => h.toLowerCase());
    for (const k of DEFAULT_AMOUNT_KEYS) {
      const i = lower.indexOf(k);
      if (i >= 0) return headers[i];
    }
    return null;
  }, [headers, amountColumn]);

  const detectedBranchKey = useMemo(() => {
    const lower = headers.map((h) => h.toLowerCase());
    for (const k of DEFAULT_BRANCH_KEYS) {
      const i = lower.indexOf(k);
      if (i >= 0) return headers[i];
    }
    return null;
  }, [headers]);

  /* ------------------------------- Helpers ----------------------------------- */
  const parseRowDate = useCallback(
    (r) => {
      if (!detectedDateKey) return null;
      const raw = r[detectedDateKey];
      if (!raw) return null;
      for (const fmt of DATE_FORMATS) {
        const d = dayjs(raw, fmt, true);
        if (d.isValid()) return d;
      }
      const d = dayjs(raw); // loose fallback
      return d.isValid() ? d : null;
    },
    [detectedDateKey]
  );

  const numericValue = (val) => {
    if (val === null || val === undefined) return NaN;
    const n = Number(String(val).replace(/[₹, ]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  };

  const computeMaxDate = useCallback(
    (data) => {
      let max = null;
      for (const r of data) {
        const d = parseRowDate(r);
        if (d && (max === null || d.isAfter(max))) max = d;
      }
      return max;
    },
    [parseRowDate]
  );

  /* -------------------------------- Presets ---------------------------------- */
  const today = dayjs();
  const defaultPresets = useCallback(
    () => [
      { label: "Today", range: [today.startOf("day"), today.endOf("day")] },
      { label: "Yesterday", range: [today.add(-1, "day").startOf("day"), today.add(-1, "day").endOf("day")] },
      { label: "Last 7 days", range: [today.add(-6, "day").startOf("day"), today.endOf("day")] },
      { label: "This Month", range: [today.startOf("month"), today.endOf("month")] },
    ],
    [today]
  );

  const presets = useMemo(
    () => (typeof presetsConfig === "function" ? presetsConfig(today) : defaultPresets()),
    [presetsConfig, today, defaultPresets]
  );

  /* -------------------------- Load cached UI settings ------------------------- */
  useEffect(() => {
    if (!open) return;

    // views
   

    // visible cols
    const rawCols = localStorage.getItem(keyFor(sheetCsvUrl, "visibleCols"));
    if (rawCols) {
      try { setVisibleCols(JSON.parse(rawCols)); } catch { /* ignore */ }
    }

    // density
    const rawDen = localStorage.getItem(keyFor(sheetCsvUrl, "density"));
    if (rawDen) setDensity(rawDen);

    // URL ?from=YYYY-MM-DD&to=YYYY-MM-DD
    const usp = new URLSearchParams(window.location.search);
    const from = usp.get("from");
    const to = usp.get("to");
    const start = from ? dayjs(from, "YYYY-MM-DD", true) : null;
    const end = to ? dayjs(to, "YYYY-MM-DD", true) : null;
    if ((start && start.isValid()) || (end && end.isValid())) {
      setRange([start && start.isValid() ? start : null, end && end.isValid() ? end : null]);
      return; // URL wins
    }

    // If a saved view applied earlier, it already set the range
    if (range && (range[0] || range[1])) return;

    // default preset
    const stored = localStorage.getItem(keyFor(sheetCsvUrl, "defaultPreset"));
    const wanted = stored || initialPreset;
    const match = presets.find((p) => p.label === wanted);
    if (match) setRange([match.range[0], match.range[1]]);
  }, [open, sheetCsvUrl, presets, initialPreset, range]);

  /* --------------------------------- Fetch ----------------------------------- */
  const fetchCsv = async () => {
    setLoading(true);
    try {
      const res = await fetch(sheetCsvUrl, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to download sheet CSV");
      const csv = await res.text();
      const parsed = parseCSV(csv);
      const hdrs = parsed.headers || [];
      const data = parsed.rows || [];

      setHeaders(hdrs);
      setRows(data);

      // init visible columns on first load
      if (!visibleCols?.length && hdrs.length) {
        setVisibleCols(hdrs);
        localStorage.setItem(keyFor(sheetCsvUrl, "visibleCols"), JSON.stringify(hdrs));
      }

      // diff-aware count
      const baselineStr = localStorage.getItem(keyFor(sheetCsvUrl, "baselineMaxDate"));
      const baseline = baselineStr ? dayjs(baselineStr) : null;
      const maxDate = computeMaxDate(data);

      if (baseline && baseline.isValid() && maxDate) {
        let count = 0;
        for (const r of data) {
          const d = parseRowDate(r);
          if (d && d.isAfter(baseline)) count++;
        }
        setNewCount(count);
      } else {
        setNewCount(0);
      }
    } catch (e) {
      console.error(e);
      message.error(e.message || "Unable to load sheet");
    } finally {
      setLoading(false);
    }
  };

  

  /* ------------------------------- Columns build ------------------------------ */
  const allColumns = useMemo(() => {
    return (headers || []).map((h) => ({
      title: h,
      dataIndex: h,
      key: h,
      ellipsis: true,
      ...(h === detectedDateKey
        ? {
            sorter: (a, b) => {
              const da = parseRowDate(a);
              const db = parseRowDate(b);
              if (!da && !db) return 0;
              if (!da) return -1;
              if (!db) return 1;
              return da.valueOf() - db.valueOf();
            },
            defaultSortOrder: "descend",
          }
        : {}),
    }));
  }, [headers, detectedDateKey, parseRowDate]);

  const columns = useMemo(
    () => allColumns.filter((c) => visibleCols.includes(c.key)),
    [allColumns, visibleCols]
  );

  /* ------------------------------ Branch options ------------------------------ */
  const branchOptions = useMemo(() => {
    if (!detectedBranchKey) return [];
    const vals = new Set();
    for (const r of rows) {
      const v = r[detectedBranchKey];
      if (v !== undefined && v !== null && String(v).trim()) {
        vals.add(String(v).trim());
      }
    }
    return Array.from(vals).sort((a, b) => a.localeCompare(b));
  }, [rows, detectedBranchKey]);

  /* ------------------------------ Filtering steps ----------------------------- */
  // 1) Date-only filter
  const dateFiltered = useMemo(() => {
    if (!detectedDateKey) return rows;
    if (!range || (!range[0] && !range[1])) return rows;
    const [start, end] = range;
    const startDay = start ? start.startOf("day") : null;
    const endDay = end ? end.endOf("day") : null;
    return rows.filter((r) => {
      const d = parseRowDate(r);
      if (!d) return false;
      const okStart = startDay ? !d.isBefore(startDay) : true;
      const okEnd = endDay ? !d.isAfter(endDay) : true;
      return okStart && okEnd;
    });
  }, [rows, range, detectedDateKey, parseRowDate]);

  // 2) Branch + text
  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return dateFiltered.filter((r) => {
      // Branch predicate
      if (detectedBranchKey && selectedBranches.length > 0) {
        const branchVal = String(r[detectedBranchKey] ?? "").trim();
        if (!selectedBranches.includes(branchVal)) return false;
      }
      // Text predicate
      if (!q) return true;
      return headers.some((h) => String(r[h] ?? "").toLowerCase().includes(q));
    });
  }, [dateFiltered, searchText, headers, detectedBranchKey, selectedBranches]);

  /* ------------------------------ Row highlight ------------------------------- */
  const rowClassName = (record) => {
    if (!detectedAmountKey) return "";
    const val = numericValue(record[detectedAmountKey]);
    if (!Number.isFinite(val)) return "";
    return val > highlightThreshold ? "vs-row-highlight" : "";
  };

  /* ------------------------------- URL share --------------------------------- */
  

  /* --------------------------------- Export ---------------------------------- */
  const exportExcel = async () => {
    if (!headers.length) return message.warning("No data to export");
    const ordered = filteredRows.map((r) => {
      const o = {};
      headers.forEach((h) => (o[h] = r[h]));
      return o;
    });
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(ordered, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet");
    const nameBits = [];
    if (range?.[0]?.isValid()) nameBits.push(range[0].format("YYYYMMDD"));
    if (range?.[1]?.isValid()) nameBits.push(range[1].format("YYYYMMDD"));
    const suffix = nameBits.length ? `_${nameBits.join("-")}` : "";
    XLSX.writeFile(wb, `sheet_export${suffix}.xlsx`);
  };

  /* --------------------------------- Menus ----------------------------------- */
  const columnMenu = {
    items: [
      {
        key: "columns",
        label: (
          <div style={{ padding: 8, maxHeight: 260, overflow: "auto" }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Columns</div>
            <Checkbox.Group
              value={visibleCols}
              onChange={(vals) => {
                setVisibleCols(vals);
                localStorage.setItem(keyFor(sheetCsvUrl, "visibleCols"), JSON.stringify(vals));
              }}
            >
              <Space direction="vertical">
                {headers.map((h) => (
                  <Checkbox key={h} value={h}>
                    {h}
                  </Checkbox>
                ))}
              </Space>
            </Checkbox.Group>
          </div>
        ),
      },
    ],
  };

  /* --------------------------------- Views ----------------------------------- */

  /* --------------------------------- Header ---------------------------------- */
  // Modal title with top-right search + branch filter
  const modalTitle = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontWeight: 600 }}>Sheet (read-only)</span>

      {/* Right-aligned controls */}
      <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
        {/* Branch dropdown */}
        <Select
          style={{ minWidth: 220 }}
          placeholder={
            detectedBranchKey
              ? `Filter by ${detectedBranchKey}…`
              : "Branch column not found"
          }
          mode="multiple"
          allowClear
          disabled={!detectedBranchKey || branchOptions.length === 0}
          value={selectedBranches}
          onChange={(vals) => setSelectedBranches(vals)}
          options={branchOptions.map((v) => ({ label: v, value: v }))}
          maxTagCount="responsive"
        />

        {/* Search box */}
        <Input.Search
          placeholder="Search name / mobile / model / remarks…"
          allowClear
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onSearch={(v) => setSearchText(v)}
          style={{ width: 280 }}
        />
      </div>
    </div>
  );

  /* --------------------------------- Render ---------------------------------- */
  return (
    <>
      <Button
        type="default"
        onClick={() => {
          setOpen(true);
          fetchCsv();
        }}
        {...buttonProps}
      >
        {buttonText}
      </Button>

      <Modal
        title={modalTitle}
        open={open}
        width="90%"
        onCancel={() => setOpen(false)}
        footer={[
          // Left section: filters & tools
          <Space key="left" style={{ marginRight: "auto", flexWrap: "wrap" }}>
            {/* Date range */}
            <Tooltip
              title={
                detectedDateKey
                  ? `Filtering by date column: ${detectedDateKey}`
                  : `No date column detected. Pass 'dateColumn' prop (e.g., "Timestamp").`
              }
            >
              <RangePicker
                allowClear
                value={range}
                onChange={(val) => setRange(val)}
                disabled={!detectedDateKey}
                format="YYYY-MM-DD"
              />
            </Tooltip>

            {/* Presets */}
            <Space size="small">
              {presets.map((p) => (
                <Button
                  key={p.label}
                  onClick={() => setRange([p.range[0], p.range[1]])}
                  disabled={!detectedDateKey}
                >
                  {p.label}
                </Button>
              ))}
            </Space>

            {/* Column chooser */}
            <Dropdown menu={columnMenu} trigger={["click"]}>
              <Button>Columns</Button>
            </Dropdown>

            {/* Excel export */}
            <Button onClick={exportExcel}>Download Excel (.xlsx)</Button>

            {/* Density (optional UI) */}
            {/* <Segmented
              value={density}
              onChange={(val) => {
                setDensity(val);
                localStorage.setItem(keyFor(sheetCsvUrl, "density"), String(val));
              }}
              options={[
                { label: "Cozy", value: "cozy" },
                { label: "Compact", value: "compact" },
              ]}
            /> */}

            {/* Saved views (optional UI) */}
            {/* <Space size="small" wrap>
              <Select
                placeholder="Load view…"
                style={{ width: 160 }}
                value={selectedView || undefined}
                onChange={(v) => applyView(v)}
                allowClear
                options={views.map((v) => ({ label: v.name, value: v.name }))}
              />
              <Input
                placeholder="New view name"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                style={{ width: 160 }}
              />
              <Button onClick={saveCurrentView}>Save view</Button>
              <Popconfirm
                title="Delete selected view?"
                okText="Delete"
                onConfirm={() => selectedView && deleteView(selectedView)}
                disabled={!selectedView}
              >
                <Button danger disabled={!selectedView}>Delete view</Button>
              </Popconfirm>
            </Space> */}
          </Space>,

          // Right section: refresh + close
          <Space key="right">
            <Badge
              count={newCount > 0 ? `+${newCount}` : 0}
              color="green"
              offset={[-6, 6]}
              style={{ boxShadow: "0 0 0 1px #fff inset" }}
            >
              <Button onClick={fetchCsv} loading={loading}>
                Refresh
              </Button>
            </Badge>

            {/* <Button onClick={markAsSeen}>Mark as seen</Button> */}

            <Button onClick={() => setOpen(false)}>Close</Button>
          </Space>,
        ]}
      >
        {/* highlight style */}
        <style>
          {`
            .vs-row-highlight td {
              background: #fff7e6 !important;
            }
          `}
        </style>

        <Table
          rowKey={(_, i) => String(i)}
          dataSource={filteredRows}
          columns={columns}
          loading={loading}
          scroll={{ x: true, y: 480 }}
          size={density === "compact" ? "small" : "middle"}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          rowClassName={rowClassName}
        />
      </Modal>
    </>
  );
}
