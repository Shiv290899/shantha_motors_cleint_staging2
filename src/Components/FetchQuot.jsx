// FetchQuot.jsx
import React, { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { saveBookingViaWebhook } from "../apiCalls/forms";
import { Alert, Button, Modal, Input, List, Space, Spin, message } from "antd";

/**
 * Props:
 * - form
 * - EXECUTIVES
 * - setBrand, setMode, setVehicleType, setFittings, setDocsReq, setEmiSet,
 *   setDownPayment, setOnRoadPrice, setCompany, setModel, setVariant, setExtraVehicles
 * - buttonText, buttonProps
 */
export default function FetchQuot({
  form,
  webhookUrl, // NEW: Apps Script Web App URL (preferred over CSV)
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
  setFollowUpEnabled,
  setFollowUpAt,
  setFollowUpNotes,
  onPayloadApplied,
  autoApply,
  buttonText = "Fetch Details",
  buttonProps = {},
}) {
  const [open, setOpen] = useState(false);
  // Restrict to Mobile-only search
  
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState([]);
  const [notFoundText, setNotFoundText] = useState("");
  const lastAutoRef = useRef("");

  // ---------------- helpers ----------------
  const tenDigits = (x) =>
    String(x || "").replace(/\D/g, "").replace(/^0+/, "").slice(-10);

  const showNotFoundModal = () => {
    const pretty = tenDigits(query) || String(query || "").trim();
    const txt = pretty
      ? `The mobile number "${pretty}" is not in our quotation records.`
      : "No matching record found in our quotation records.";
    setNotFoundText(txt);
    Modal.warning({
      centered: true,
      title: "No quotation found",
      content: txt,
      okText: "Got it",
    });
  };

  // CSV parsing helpers are removed; webhook is the only source

  const fetchRows = async () => {
    if (!webhookUrl) {
      throw new Error("Quotation search webhook is not configured");
    }
    const resp = await saveBookingViaWebhook({
      webhookUrl,
      method: 'GET',
      payload: { action: 'search', mode: 'mobile', query: String(query || '') },
    });
    const j = resp?.data || resp;
    const rows = Array.isArray(j?.rows) ? j.rows : [];
    return { mode: 'webhook', rows };
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
      followUp: { enabled: false, at: null, notes: "", status: 'pending' },
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

  // Convert a webhook row into a usable payload
  const payloadFromWebhook = (row) => {
    const pv = row && typeof row === 'object' ? row.payload : null;
    const values = row && typeof row === 'object' ? (row.values || {}) : {};
    const toNumber = (x) => Number(String(x || 0).replace(/[,₹\s]/g, '')) || 0;
    const pick = (...vals) => vals.find((v) => v !== undefined && v !== null && String(v).trim() !== '') || '';
    const pickValue = (obj, keys) => {
      for (const k of keys) {
        const v = obj?.[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') return v;
      }
      return '';
    };
    const downPaymentFromValues =
      toNumber(
        values.downPayment ||
        values.DownPayment ||
        values["Down Payment"] ||
        values.DP ||
        values.dp ||
        values["Down_Payment"]
      );
    const payload = (pv && typeof pv === 'object') ? pv : {};
    const fv = payload.formValues || {};

    const serialNo = pick(
      pickValue(values, ['serialNo', 'Quotation_ID', 'Quotation ID', 'Quotation_Id', 'Serial', 'Quotation No', 'Quotation No.']),
      fv.serialNo,
      payload.serialNo
    );
    const name = pick(
      pickValue(values, ['name', 'Customer_Name', 'Customer Name', 'Customer', 'Name']),
      fv.name
    );
    const mobile = pick(
      pickValue(values, ['mobile', 'Mobile', 'Mobile Number', 'Phone']),
      fv.mobile
    );
    const company = pick(
      pickValue(values, ['company', 'Company']),
      fv.company,
      payload.company
    );
    const bikeModel = pick(
      pickValue(values, ['bikeModel', 'Bike Model', 'Model']),
      fv.bikeModel,
      fv.model,
      payload.model
    );
    const variant = pick(
      pickValue(values, ['variant', 'Variant']),
      fv.variant,
      payload.variant
    );
    const branch = pick(
      pickValue(values, ['branch', 'Branch', 'Branch Name']),
      fv.branch,
      payload.branch
    );
    const executive = pick(
      pickValue(values, ['executive', 'Executive_Name', 'Executive Name', 'Executive']),
      fv.executive,
      EXECUTIVES[0]?.name || ''
    );
    const remarks = pick(
      pickValue(values, ['remarks', 'Remarks', 'Offerings']),
      fv.remarks,
      payload.remarks
    );

    const onRoadPrice = toNumber(
      pick(
        pickValue(values, ['onRoadPrice', 'OnRoadPrice', 'On-Road Price', 'On Road Price', 'Price']),
        fv.onRoadPrice,
        payload.onRoadPrice
      )
    );
    const downPayment = toNumber(
      pick(
        pickValue(values, ['downPayment', 'DownPayment', 'Down Payment', 'DP', 'dp']),
        fv.downPayment,
        payload.downPayment,
        downPaymentFromValues
      )
    );

    return {
      version: payload.version || 0,
      brand: payload.brand || 'SHANTHA',
      mode: payload.mode || 'cash',
      vehicleType: payload.vehicleType || 'scooter',
      fittings: Array.isArray(payload.fittings) ? payload.fittings : [],
      docsReq: Array.isArray(payload.docsReq) ? payload.docsReq : [],
      emiSet: payload.emiSet || '12',
      downPayment,
      onRoadPrice,
      company,
      model: bikeModel,
      variant,
      branch,
      savedAt: payload.savedAt || '',
      createdAt: payload.createdAt || '',
      followUp: payload.followUp || { enabled: false, at: null, notes: '', status: 'pending' },
      formValues: {
        serialNo,
        name,
        mobile,
        address: pick(values.address, values.Address, fv.address, payload.address),
        company,
        bikeModel,
        variant,
        onRoadPrice,
        downPayment,
        executive,
        remarks,
        branch,
      },
      extraVehicles: Array.isArray(payload.extraVehicles) ? payload.extraVehicles : [],
    };
  };

  // Try payload column first, then scan entire row for JSON-looking cell
  // Legacy CSV cell parsing removed

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
      const fu = data.followUp || {};
      setFollowUpEnabled?.(Boolean(fu.enabled));
      setFollowUpAt?.(fu.at ? dayjs(fu.at) : null);
      setFollowUpNotes?.(fu.notes || "");

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
        downPayment: Number(fv.downPayment ?? data.downPayment ?? 0),
        executive: fv.executive || EXECUTIVES[0]?.name || "",
        remarks: fv.remarks || "",
        branch: fv.branch || data.branch || "", // <-- branch set here
      });

      // keep mirror in sync
      setOnRoadPrice?.(Number(fv.onRoadPrice ?? data.onRoadPrice ?? 0));
      onPayloadApplied?.({
        serialNo: fv.serialNo || data.serialNo || "",
        savedAt: data.savedAt || "",
        createdAt: data.createdAt || fv.createdAt || "",
      });

      message.success("Quotation loaded.");
      setOpen(false);
      setMatches([]);
      setQuery("");
    } catch (e) {
      console.warn("applyToForm error:", e);
      message.error("Could not apply fetched details.");
    }
  };

  useEffect(() => {
    if (!autoApply?.payload && !autoApply?.values) return;
    const key = String(autoApply?.token || '') + ':' + String(autoApply?.values?.serialNo || autoApply?.payload?.formValues?.serialNo || autoApply?.payload?.serialNo || autoApply?.values?.mobile || autoApply?.payload?.formValues?.mobile || '');
    if (lastAutoRef.current === key) return;
    lastAutoRef.current = key;
    const normalized = payloadFromWebhook({ payload: autoApply?.payload || {}, values: autoApply?.values || {} });
    applyToForm(normalized);
  }, [autoApply]);

  // ---------------- search ----------------
  const runSearch = async () => {
    const raw = String(query || "").trim();
    const digits = tenDigits(raw);
    if (!digits || digits.length !== 10) { message.warning("Enter a valid 10-digit mobile number."); return; }
    setQuery(digits);

    setNotFoundText("");
    setLoading(true);
    try {
      const result = await fetchRows();
      if (!result) throw new Error("No result");

      const rows = (result.rows || []).map(r => ({ payload: payloadFromWebhook(r) }));
      if (!rows.length) {
        showNotFoundModal();
        setMatches([]);
        return;
      }

      if (rows.length === 1) {
        applyToForm(rows[0].payload);
        return;
      }
      setMatches(rows.slice(0, 10));
      message.info(`Found ${rows.length} matches. Pick one.`);

    } catch (e) {
      console.warn("FetchQuot search error:", e);
      message.error("Could not fetch quotations. Check the Apps Script/Webhook.");
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
      <Button
        {...buttonProps}
        onClick={() => {
          setNotFoundText("");
          setOpen(true);
        }}
      >
        {buttonText}
      </Button>

      <Modal
        title="Fetch Quotation"
        open={open}
        onCancel={() => {
          setOpen(false);
          setMatches([]);
          setNotFoundText("");
        }}
        footer={[
          <Button
            key="close"
            onClick={() => {
              setOpen(false);
              setMatches([]);
              setNotFoundText("");
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
          <Input
            placeholder={"Enter Mobile (10-digit or last few digits)"}
            value={query}
          inputMode="numeric"
          onChange={(e) => setQuery(tenDigits(e.target.value))}
          onPressEnter={runSearch}
          allowClear
        />

          {notFoundText && (
            <Alert
              type="warning"
              showIcon
              message={notFoundText}
            />
          )}

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
