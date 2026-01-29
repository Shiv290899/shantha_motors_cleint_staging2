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
    if (pv && typeof pv === 'object') {
      const branch = values.branch || values.Branch || '';
      if (branch) {
        pv.branch = pv.branch || branch;
        pv.formValues = { ...(pv.formValues || {}), branch: (pv.formValues && pv.formValues.branch) || branch };
      }
      return pv;
    }
    const toNumber = (x) => Number(String(x || 0).replace(/[,₹\s]/g, '')) || 0;
    return {
      version: 0,
      brand: 'SHANTHA',
      mode: 'cash',
      vehicleType: 'scooter',
      fittings: [],
      docsReq: [],
      emiSet: '12',
      downPayment: 0,
      onRoadPrice: toNumber(values.onRoadPrice || values.OnRoadPrice || values['On-Road Price']),
      company: values.company || values.Company || '',
      model: values.bikeModel || values.Model || '',
      variant: values.variant || values.Variant || '',
      branch: values.branch || values.Branch || '',
      formValues: {
        serialNo: values.serialNo || values.Quotation_ID || values['Quotation_ID'] || values['Quotation No'] || '',
        name: values.name || values.Customer_Name || values['Customer_Name'] || '',
        mobile: values.mobile || values.Mobile || values['Mobile'] || '',
        address: values.address || values.Address || '',
        company: values.company || values.Company || '',
        bikeModel: values.bikeModel || values.Model || '',
        variant: values.variant || values.Variant || '',
        onRoadPrice: toNumber(values.onRoadPrice || values.OnRoadPrice || values['On-Road Price']),
        executive: values.executive || values.Executive_Name || EXECUTIVES[0]?.name || '',
        remarks: values.remarks || values.Remarks || '',
        branch: values.branch || values.Branch || '',
      },
      extraVehicles: [],
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

  useEffect(() => {
    if (!autoApply?.payload) return;
    const key = String(autoApply?.token || '') + ':' + String(autoApply?.payload?.formValues?.serialNo || autoApply?.payload?.serialNo || autoApply?.payload?.formValues?.mobile || '');
    if (lastAutoRef.current === key) return;
    lastAutoRef.current = key;
    applyToForm(autoApply.payload);
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
