// FetchQuot.jsx
import React, { useState } from "react";
import { Button, Modal, Radio, Input, List, Space, Spin, message } from "antd";

/**
 * Props:
 * - form
 * - responsesCsvUrl
 * - parseCsv
 * - EXECUTIVES
 * - setBrand, setMode, setVehicleType, setFittings, setDocsReq, setEmiSet,
 *   setDownPayment, setOnRoadPrice, setCompany, setModel, setVariant, setExtraVehicles
 * - buttonText, buttonProps
 */
export default function FetchQuot({
  form,
  responsesCsvUrl,
  parseCsv,
  EXECUTIVES = [],
  setBrand,
  setMode,
  setVehicleType,
  setFittings,
  setDocsReq,
  setEmiSet,
  setDownPayment,
  setOnRoadPrice,
  setCompany,
  setModel,
  setVariant,
  setExtraVehicles,
  buttonText = "Fetch Details",
  buttonProps = {},
}) {
  const [open, setOpen] = useState(false);
  const [mode, setSearchMode] = useState("serial"); // 'serial' | 'mobile'
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState([]);

  // ---------------- helpers ----------------
  const tenDigits = (x) =>
    String(x || "").replace(/\D/g, "").replace(/^0+/, "").slice(-10);

  const findHeader = (headers = [], needle) =>
    headers.findIndex((h) =>
      String(h || "").toLowerCase().includes(String(needle).toLowerCase())
    );

  const payloadColIndex = (headers) => findHeader(headers, "payload");
  const serialColIndex = (headers) => {
    for (const k of ["quotation no", "quotation number", "quote no", "serial"]) {
      const i = findHeader(headers, k);
      if (i >= 0) return i;
    }
    return -1;
  };
  const phoneColIndex = (headers) => {
    for (const k of ["phone", "mobile", "contact"]) {
      const i = findHeader(headers, k);
      if (i >= 0) return i;
    }
    return -1;
  };
  // NEW: branch column picker
  const branchColIndex = (headers) => {
    for (const k of ["branch", "branches"]) {
      const i = findHeader(headers, k);
      if (i >= 0) return i;
    }
    return -1;
  };

  const safeJson = (txt) => {
    try {
      const obj = JSON.parse(String(txt || "{}"));
      return obj && typeof obj === "object" ? obj : null;
    } catch {
      return null;
    }
  };

  const fetchRows = async () => {
    const res = await fetch(responsesCsvUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to download responses CSV");
    const csv = await res.text();
    if (csv.trim().startsWith("<")) throw new Error("Expected CSV, got HTML");
    return parseCsv(csv);
  };

  // newest first using a loose timestamp guess (first col often is Timestamp)
  const toTime = (row) => {
    const t = row?.[0];
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? ms : 0;
  };

  const normalizePayloadShape = (raw) => {
    // If our app saved the payload, it's already in the right shape.
    if (raw && raw.formValues) return raw;

    // Fallback minimal object when payload missing (very old rows)
    return {
      version: 0,
      brand: "SHANTHA",
      mode: "cash",
      vehicleType: "scooter",
      fittings: [],
      docsReq: [],
      emiSet: "12",
      downPayment: 0,
      onRoadPrice: 0,
      company: "",
      model: "",
      variant: "",
      branch: "", // may be injected from sheet later
      formValues: {
        serialNo: "",
        name: "",
        mobile: "",
        address: "",
        company: "",
        bikeModel: "",
        variant: "",
        onRoadPrice: 0,
        executive: EXECUTIVES[0]?.name || "",
        remarks: "",
        branch: "", // may be injected from sheet later
      },
      extraVehicles: [],
    };
  };

  // Try payload column first, then scan entire row for JSON-looking cell
  const parseAnyJsonCell = (row, pIdx) => {
    if (pIdx >= 0) {
      const maybe = safeJson(row[pIdx]);
      if (maybe) return maybe;
    }
    for (let j = 0; j < row.length; j++) {
      const cell = row[j];
      if (cell && typeof cell === "string" && cell.trim().startsWith("{")) {
        const maybe = safeJson(cell);
        if (maybe) return maybe;
      }
    }
    return null;
  };

  // apply into form + local states
  const applyToForm = (dataRaw) => {
    const data = normalizePayloadShape(dataRaw);
    try {
      // top-level states
      setBrand?.(data.brand || "SHANTHA");
      setMode?.(data.mode || "cash");
      setVehicleType?.(data.vehicleType || "scooter");
      setFittings?.(Array.isArray(data.fittings) ? data.fittings : []);
      setDocsReq?.(Array.isArray(data.docsReq) ? data.docsReq : []);
      setEmiSet?.(data.emiSet || "12");
      setDownPayment?.(Number(data.downPayment || 0));
      setOnRoadPrice?.(Number(data.onRoadPrice || 0));
      setCompany?.(data.company || "");
      setModel?.(data.model || "");
      setVariant?.(data.variant || "");
      setExtraVehicles?.(Array.isArray(data.extraVehicles) ? data.extraVehicles : []);

      const fv = data.formValues || {};
      form.setFieldsValue({
        serialNo: fv.serialNo || "",
        name: fv.name || "",
        mobile: tenDigits(fv.mobile || ""),
        address: fv.address || "",
        company: fv.company || data.company || "",
        bikeModel: fv.bikeModel || data.model || "",
        variant: fv.variant || data.variant || "",
        onRoadPrice: Number(fv.onRoadPrice ?? data.onRoadPrice ?? 0),
        executive: fv.executive || EXECUTIVES[0]?.name || "",
        remarks: fv.remarks || "",
        branch: fv.branch || data.branch || "", // <-- branch set here
      });

      // keep mirror in sync
      setOnRoadPrice?.(Number(fv.onRoadPrice ?? data.onRoadPrice ?? 0));

      message.success("Quotation loaded.");
      setOpen(false);
      setMatches([]);
      setQuery("");
    } catch (e) {
      console.warn("applyToForm error:", e);
      message.error("Could not apply fetched details.");
    }
  };

  // ---------------- search ----------------
  const runSearch = async () => {
    const q = String(query || "").trim();
    if (!q) {
      message.warning(mode === "serial" ? "Enter a Quotation No." : "Enter a Mobile number.");
      return;
    }

    setLoading(true);
    try {
      const rows = await fetchRows(); // array of arrays
      if (!rows?.length) throw new Error("Empty CSV");

      const headers = (rows[0] || []).map((h) => (h || "").trim());
      const body = rows.slice(1);

      const pIdx = payloadColIndex(headers);
      const sIdx = serialColIndex(headers);
      const mIdx = phoneColIndex(headers);
      const bIdx = branchColIndex(headers); // NEW

      const candidates = [];
      const qMobile = tenDigits(q);

      // scan newest first
      for (let i = body.length - 1; i >= 0; i--) {
        const r = body[i];
        const payload = parseAnyJsonCell(r, pIdx);

        const serial = payload?.formValues?.serialNo
          ? String(payload.formValues.serialNo).trim()
          : (sIdx >= 0 ? String(r[sIdx] || "").trim() : "");

        const mobInPayload = tenDigits(payload?.formValues?.mobile);
        const phoneCell = mIdx >= 0 ? tenDigits(r[mIdx]) : "";
        const branchCell = bIdx >= 0 ? String(r[bIdx] || "").trim() : ""; // NEW

        // Merge the branch from sheet into payload so UI can use it
        const mergedPayload = (() => {
          const base = payload ? { ...payload } : {};
          base.branch = base.branch || branchCell;
          base.formValues = {
            ...(base.formValues || {}),
            branch: (base.formValues && base.formValues.branch) || branchCell,
          };
          return base;
        })();

        const isSerialMatch = mode === "serial" && serial && serial === q;

        const isMobileMatch =
          mode === "mobile" &&
          ((mobInPayload && mobInPayload === qMobile) ||
            (phoneCell && phoneCell === qMobile) ||
            (qMobile.length < 10 &&
              ((mobInPayload && mobInPayload.endsWith(qMobile)) ||
                (phoneCell && phoneCell.endsWith(qMobile)))));

        if (isSerialMatch || isMobileMatch) {
          candidates.push({ row: r, payload: mergedPayload, ts: toTime(r) });
        }
      }

      if (!candidates.length) {
        message.warning("No matching record found.");
        setMatches([]);
        return;
      }

      // latest first
      candidates.sort((a, b) => b.ts - a.ts);

      if (candidates.length === 1) {
        applyToForm(candidates[0].payload);
        return;
      }

      setMatches(candidates.slice(0, 10));
      message.info(`Found ${candidates.length} matches. Pick one.`);

    } catch (e) {
      console.warn("FetchQuot search error:", e);
      message.error("Could not fetch the responses CSV. Check the published link.");
    } finally {
      setLoading(false);
    }
  };

  const renderItem = (item) => {
    const p = item.payload || {};
    const fv = p.formValues || {};
    const serial = fv.serialNo || "—";
    const name = fv.name || "—";
    const mobile = tenDigits(fv.mobile) || "—";
    const veh =
      [fv.company || p.company, fv.bikeModel || p.model, fv.variant || p.variant]
        .filter(Boolean)
        .join(" ") || "—";
    const price = Number(fv.onRoadPrice ?? p.onRoadPrice ?? 0);
    const branch = fv.branch || p.branch || "—";

    return (
      <List.Item
        actions={[
          <Button type="link" onClick={() => applyToForm(item.payload)}>
            Use
          </Button>,
        ]}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", width: "100%" }}>
          <div><b>Quotation:</b> {serial} &nbsp; <b>Name:</b> {name}</div>
          <div><b>Mobile:</b> {mobile} &nbsp; <b>Vehicle:</b> {veh}</div>
          <div style={{ gridColumn: "1 / span 2", color: "#999" }}>
            <b>Branch:</b> {branch} &nbsp; <b>Price:</b> ₹{price.toLocaleString("en-IN")}
          </div>
        </div>
      </List.Item>
    );
  };

  return (
    <>
      <Button {...buttonProps} onClick={() => setOpen(true)}>
        {buttonText}
      </Button>

      <Modal
        title="Fetch Quotation (Google Form Responses)"
        open={open}
        onCancel={() => {
          setOpen(false);
          setMatches([]);
        }}
        footer={[
          <Button
            key="close"
            onClick={() => {
              setOpen(false);
              setMatches([]);
            }}
          >
            Close
          </Button>,
          <Button key="search" type="primary" loading={loading} onClick={runSearch}>
            Search
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Radio.Group
            value={mode}
            onChange={(e) => {
              setSearchMode(e.target.value);
              setMatches([]);
            }}
          >
            <Radio.Button value="serial">Quotation No</Radio.Button>
            <Radio.Button value="mobile">Mobile</Radio.Button>
          </Radio.Group>

          <Input
            placeholder={
              mode === "serial"
                ? "Enter Quotation No. (exact, e.g., 57)"
                : "Enter Mobile (10-digit or last few digits)"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onPressEnter={runSearch}
            allowClear
          />

          {loading && <Spin />}

          {matches.length > 1 && (
            <List
              size="small"
              bordered
              dataSource={matches}
              renderItem={renderItem}
            />
          )}
        </Space>
      </Modal>
    </>
  );
}