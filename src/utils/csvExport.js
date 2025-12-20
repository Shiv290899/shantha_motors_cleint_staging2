// Small helpers to build and download CSV files from tabular data

const normalizeValue = (value) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.join("; ");
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
};

const escapeCsv = (value) => {
  const raw = normalizeValue(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const needsQuotes = /["\n,]/.test(raw);
  const safe = raw.replace(/"/g, '""');
  return needsQuotes ? `"${safe}"` : safe;
};

export const buildCsv = (headers = [], rows = []) => {
  const headerLabels = headers.map((h) => escapeCsv(h.label ?? h.key ?? h));
  const body = rows.map((row) =>
    headers
      .map((h) => {
        const key = typeof h === "string" ? h : (h.key || h.dataIndex);
        if (typeof h.value === "function") return escapeCsv(h.value(row));
        return escapeCsv(key ? row?.[key] : "");
      })
      .join(",")
  );
  return [headerLabels.join(","), ...body].join("\n");
};

export const downloadCsv = (filename, csvText) => {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "export.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
};

export const exportToCsv = ({ filename = "export.csv", headers = [], rows = [] }) => {
  if (!Array.isArray(rows) || !rows.length) return false;
  const csv = buildCsv(headers, rows);
  downloadCsv(filename, csv);
  return true;
};
