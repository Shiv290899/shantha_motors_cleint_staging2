// FetchJobcard.jsx
import React, { useMemo, useState } from "react";
import { Button, Modal, Input, List, Space, Spin, message } from "antd";
import { saveJobcardViaWebhook } from "../apiCalls/forms";
import dayjs from "dayjs";
import FetchQuot from "./FetchQuot"; // NEW: for fetching saved quotations

/**
 * Props:
 * - form
 * - sheetUrl
 * - parseCSV
 * - formatReg
 * - buildRows
 * - defaultGstLabour
 * - lists: { BRANCHES, MECHANIC, EXECUTIVES, VEHICLE_TYPES, SERVICE_TYPES }
 * - setServiceTypeLocal
 * - setVehicleTypeLocal
 * - setRegDisplay
 */
export default function FetchJobcard({
  form,
  formatReg,
  buildRows,
  defaultGstLabour = 0,
  lists,
  setServiceTypeLocal,
  setVehicleTypeLocal,
  setRegDisplay,
  webhookUrl, // NEW: Apps Script Web App URL
  setFollowUpEnabled,
  setFollowUpAt,
  setFollowUpNotes,
  setPostServiceLock,
}) {
  const JOB_SECRET = import.meta.env?.VITE_JOBCARD_GAS_SECRET || '';
  const [open, setOpen] = useState(false);
  // Restrict search to Mobile only
  const mode = "mobile";
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState([]);

  const { BRANCHES, MECHANIC, EXECUTIVES, VEHICLE_TYPES, SERVICE_TYPES } =
    useMemo(() => lists || {}, [lists]);

  // ---------- Column synonyms ----------
  const COL = useMemo(
    () => ({
      Branch: ["Branch"],
      Mechanic: ["Allotted Mechanic", "Mechanic", "Allocated Mechanic"],
      Executive: ["Executive"],
      ExpectedDelivery: ["Expected Delivery Date", "Expected Delivery", "Expected_Delivery_Date"],
      RegNo: [
        "Vehicle No", "Vehicle_No",
        "Vehicle Number",
        "Registration Number",
        "Reg No",
        "RegNo",
      ],
      Model: ["Model"],
      Colour: ["Colour", "Color"],
      KM: ["Odometer Reading", "Odomete Reading", "KM", "Odometer"],
      CustName: ["Customer Name", "Name", "Customer_Name"],
      Mobile: ["Mobile", "Mobile No", "Mobile Number", "Phone", "Phone Number"],
      Obs: ["Customer Observation", "Customer_Observation", "Observation", "Notes"],
      VehicleType: ["Vehicle Type", "Type of Vehicle", "Vehicle_Type"],
      ServiceType: ["Service Type", "Service", "Service_Type"],
      FloorMat: ["Floor Mat"],
      Amount: ["Collected Amount", "Amount"],
      JCNo: ["JC No", "JCNo", "Job Card No", "JC Number", "JC No."],
      CreatedAt: [
        "Created At",
        "Timestamp",
        "Form Timestamp",
        "Submission Time",
        "Submitted At",
      ],
    }),
    []
  );

  // ---------- helpers ----------
  const pick = (row, names) => {
    for (const n of names) {
      if (Object.prototype.hasOwnProperty.call(row, n)) {
        const v = row[n];
        if (v !== undefined && v !== null && String(v).trim() !== "")
          return String(v).trim();
      }
    }
    return "";
  };

  const tenDigits = (x) => String(x || "").replace(/\D/g, "").slice(-10);

  const parseDDMMYYYY = (s) => {
    const t = String(s || "").trim();
    if (!t) return null;
    const d = dayjs(
      t,
      ["DD/MM/YYYY", "D/M/YYYY", "DD-MM-YYYY", "YYYY-MM-DD", dayjs.ISO_8601],
      true
    );
    return d.isValid() ? d : null;
  };

  const parseTimestamp = (row) => {
    const t = pick(row, COL.CreatedAt);
    const d = dayjs(
      t,
      [
        dayjs.ISO_8601,
        "M/D/YYYY H:mm:ss",
        "D/M/YYYY H:mm:ss",
        "DD/MM/YYYY H:mm:ss",
        "DD/MM/YYYY",
      ],
      false
    );
    return d.isValid() ? d : dayjs(0);
  };

  const buildPostLockState = (payloadMaybe, valuesMaybe) => {
    const p = (payloadMaybe && payloadMaybe.payload) ? payloadMaybe.payload : (payloadMaybe || {});
    const v = valuesMaybe || payloadMaybe?._values || payloadMaybe?.values || {};
    const postAt =
      p?.postServiceAt ||
      p?.postService_at ||
      p?.formValues?.postServiceAt ||
      p?.formValues?.postService_at ||
      v?.Post_Service_At ||
      v?.Post_Service_at ||
      v?.Post_Service ||
      "";
    const mobileFromPayload =
      p?.formValues?.custMobile ||
      p?.custMobile ||
      v?.Mobile ||
      v?.["Mobile Number"] ||
      v?.Phone ||
      v?.["Phone Number"] ||
      "";
    const mobile10 = tenDigits(mobileFromPayload);
    const locked = Boolean(p?.postServiceLogged) || Boolean(postAt);
    return {
      locked,
      at: postAt || null,
      mobile: mobile10 || null,
      amount: p?.postServiceAmount ?? null,
      mode: p?.postServiceMode || p?.paymentMode || null,
    };
  };

  const updatePostLock = (payloadMaybe, valuesMaybe) => {
    if (!setPostServiceLock) return;
    const info = buildPostLockState(payloadMaybe, valuesMaybe);
    setPostServiceLock(info);
  };

  // smarter match: exact → startsWith → contains; ignore case/spaces
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
  const chooseBest = (list, val) => {
    if (!val || !list?.length) return undefined;
    const v = norm(val);
    let hit = list.find((x) => norm(x) === v);
    if (hit) return hit;
    hit = list.find((x) => norm(x).startsWith(v));
    if (hit) return hit;
    hit = list.find((x) => norm(x).includes(v));
    return hit; // may be undefined
  };

  // canonicalize service/vehicle strings from the sheet
  const canonServiceType = (val) => {
    const s = String(val || "").toLowerCase();
    if (s.includes("free")) return "Free";
    if (s.includes("paid")) return "Paid";
    return chooseBest(SERVICE_TYPES || [], val);
  };
  const canonVehicleType = (val) => {
    const s = String(val || "").toLowerCase();
    if (s.includes("scoot")) return "Scooter";
    if (s.includes("scooty")) return "Scooter";
    if (s.includes("bike")) return "Motorcycle";
    if (s.includes("motor")) return "Motorcycle";
    return chooseBest(VEHICLE_TYPES || [], val);
  };

  // ---------- Fetch rows (Webhook only) ----------
  const fetchRows = async () => {
    if (webhookUrl) {
      try {
        // Try GET first; some deployments allow only GET
        let resp = await saveJobcardViaWebhook({ webhookUrl, method: 'GET', payload: { action: 'search', mode: 'mobile', query: String(query || '') } });
        let j = resp?.data || resp;
        let rows = Array.isArray(j?.rows) ? j.rows : [];
        if (!rows.length) {
          // Fallback to POST
          resp = await saveJobcardViaWebhook({ webhookUrl, method: 'POST', payload: { action: 'search', mode: 'mobile', query: String(query || '') } });
          j = resp?.data || resp;
          rows = Array.isArray(j?.rows) ? j.rows : [];
        }
        if (!rows.length) {
          // Final fallback: fetch full list and filter client-side
          const listResp = await saveJobcardViaWebhook({
            webhookUrl,
            method: 'GET',
            payload: JOB_SECRET ? { action: 'list', secret: JOB_SECRET } : { action: 'list' },
          });
          const lj = listResp?.data || listResp;
          const dataArr = Array.isArray(lj?.data) ? lj.data : (Array.isArray(lj?.rows) ? lj.rows : []);
          const q = String(query || '').trim().toLowerCase();
          const filtered = dataArr.filter((o) => {
            const v = o && o.values ? o.values : o || {};
            
            const mobile = String(v['Mobile'] || v['Mobile Number'] || v['Phone'] || '').replace(/\D/g,'');
            const q10 = q.replace(/\D/g,'');
            return q10 && mobile.endsWith(q10);
          });
          rows = filtered.map((o) => ({ values: o && o.values ? o.values : o }));
        }
        // Normalize rows: merge sheet values into payload.formValues so all fields reflect
        const norm = rows.map((r) => {
          const v = r && r.values ? r.values : {};
          const postAtFromValues = String(v.Post_Service_At || v.Post_Service_at || v.Post_Service || '').trim();
          const fvFromValues = {
            jcNo: String(v['JC No.'] || ''),
            branch: String(v.Branch || ''),
            regNo: String(v.Vehicle_No || v['Vehicle No'] || ''),
            model: String(v.Model || ''),
            colour: String(v.Colour || v.Color || ''),
            km: String(v.KM || v['Odometer Reading'] || v['Odomete Reading'] || '').replace(/\D/g,'') || '',
            serviceType: String(v.Service_Type || v['Service Type'] || ''),
            custName: String(v.Customer_Name || ''),
            custMobile: String(v.Mobile || ''),
            obs: String(v.Customer_Observation || ''),
            expectedDelivery: String(v.Expected_Delivery_Date || ''),
            amount: String(v.Collected_Amount || ''),
          };
          if (r && r.payload && typeof r.payload === 'object') {
            const p = r.payload || {};
            // Prefer payload values (they represent what the app saved),
            // fill only missing keys from the sheet values
            const merged = { ...fvFromValues, ...(p.formValues || {}) };
            return {
              payload: {
                ...p,
                formValues: merged,
                postServiceAt: p.postServiceAt || p.postService_at || postAtFromValues || undefined,
                postServiceLogged: p.postServiceLogged || Boolean(p.postServiceAt || p.postService_at || postAtFromValues),
                _values: v,
              }
            };
          }
          return {
            payload: {
              formValues: fvFromValues,
              labourRows: [],
              totals: {},
              postServiceAt: postAtFromValues || undefined,
              postServiceLogged: Boolean(postAtFromValues),
              _values: v,
            }
          };
        });
        return { mode: 'webhook', rows: norm };
      } catch (e) {
        console.warn('Webhook search failed:', e);
        throw e;
      }
    }
    throw new Error("Webhook URL not configured");
  };

  // ---------- map & apply ----------
  const mapRowToForm = (row) => {
    const branch = pick(row, COL.Branch);
    const mechanicRaw = pick(row, COL.Mechanic);
    const executiveRaw = pick(row, COL.Executive);
    const expectedDelivery = parseDDMMYYYY(pick(row, COL.ExpectedDelivery));
    const regNo = formatReg(pick(row, COL.RegNo));
    const model = pick(row, COL.Model);
    const colour = pick(row, COL.Colour);
    const kmDigits = pick(row, COL.KM).replace(/\D/g, "");
    const custName = pick(row, COL.CustName);
    const custMobile10 = tenDigits(pick(row, COL.Mobile));
   const obsRaw = pick(row, COL.Obs);
 const obsMultiline = (() => {
   const s = String(obsRaw || "").trim();
   if (!s) return "";
   // If the row uses our separator, split → multiline; otherwise preserve existing newlines.
   if (s.includes("#")) {
     return s
       .split(/\s*#\s*/g)
       .map(x => x.trim())
       .filter(Boolean)
       .join("\n");
   }
   // fallback: normalize any stray CRLFs to LF
   return s.replace(/\r\n/g, "\n");
 })();
    const vehicleType = canonVehicleType(pick(row, COL.VehicleType));
    const serviceType = canonServiceType(pick(row, COL.ServiceType));
    const floorMat = pick(row, COL.FloorMat); // "Yes"/"No"
    const jcNo = pick(row, COL.JCNo);

    const mechanic = chooseBest(MECHANIC, mechanicRaw);
    const executive = chooseBest(
      (EXECUTIVES || []).map((e) => e.name),
      executiveRaw
    );

    const fields = {
      jcNo, // ← ensure JC No updates
      branch: chooseBest(BRANCHES, branch) || undefined,
      mechanic, // may be undefined if no close match
      executive, // may be undefined if no close match
      expectedDelivery: expectedDelivery || null,
      regNo,
      model,
      colour,
      km: kmDigits ? `${kmDigits} KM` : "",
      custName,
      custMobile: custMobile10,
      obs: obsMultiline,  // ← expand back to multiline for the form
      vehicleType,
      serviceType,
      floorMat: floorMat === "Yes" || floorMat === "No" ? floorMat : undefined,
      discounts: { labour: 0 },
      gstLabour: defaultGstLabour,
    };

    return { fields, serviceType, vehicleType };
  };

  const applyRowToForm = (row) => {
    const { fields, serviceType, vehicleType } = mapRowToForm(row);

    // sync UI toggles first (controls visibility)
    setServiceTypeLocal?.(serviceType || null);
    setVehicleTypeLocal?.(vehicleType || null);

    // push values
    form.setFieldsValue(fields);
    setRegDisplay?.(fields.regNo || "");

    // rebuild labour from presets when both types are known
    if (serviceType && vehicleType) {
      form.setFieldsValue({
        labourRows: buildRows(serviceType, vehicleType),
        gstLabour: defaultGstLabour,
        discounts: { labour: 0 },
      });
    }

    updatePostLock(row);

    message.success("Details filled from sheet.");
    setOpen(false);
    setMatches([]);
    setQuery("");
  };

  // Apply using our saved payload JSON (when fetched via webhook)
  const applyPayloadToForm = (p) => {
    try {
      const fv = p?.formValues || {};
      const serviceType = fv.serviceType || null;
      const vehicleType = fv.vehicleType || null;

      setServiceTypeLocal?.(serviceType);
      setVehicleTypeLocal?.(vehicleType);

      // Derive GST % from saved totals when available
      const sub = Number(p?.totals?.labourSub || 0) || 0;
      const gstAmt = Number(p?.totals?.labourGST || 0) || 0;
      const derivedGstPct = sub > 0 && gstAmt > 0 ? Math.round((gstAmt / sub) * 100) : defaultGstLabour;
      const savedDiscount = Number(p?.totals?.labourDisc || 0) || 0;

      form.setFieldsValue({
        jcNo: fv.jcNo || '',
        branch: fv.branch || undefined,
        mechanic: fv.mechanic || undefined,
        executive: fv.executive || undefined,
        expectedDelivery: fv.expectedDelivery ? dayjs(fv.expectedDelivery, ["DD/MM/YYYY","YYYY-MM-DD", dayjs.ISO_8601], true) : null,
        regNo: fv.regNo || '',
        model: fv.model || '',
        colour: fv.colour || '',
        km: fv.km ? `${String(fv.km).replace(/\D/g,'')} KM` : '',
        fuelLevel: fv.fuelLevel || undefined,
        callStatus: fv.callStatus || '',
        custName: fv.custName || '',
        custMobile: String(fv.custMobile || '').replace(/\D/g,'').slice(-10),
        obs: (fv.obs || '').replace(/\s*#\s*/g, "\n"),
        vehicleType: vehicleType || undefined,
        serviceType: serviceType || undefined,
        floorMat: fv.floorMat === 'Yes' ? 'Yes' : fv.floorMat === 'No' ? 'No' : undefined,
        discounts: { labour: savedDiscount },
        gstLabour: derivedGstPct,
        labourRows: Array.isArray(p?.labourRows) && p.labourRows.length ? p.labourRows : buildRows(serviceType, vehicleType),
      });
      setRegDisplay?.(fv.regNo || '');
      // Restore follow-up settings if provided in saved payload
      if (p?.followUp) {
        try {
          const fu = p.followUp;
          if (typeof fu.enabled !== 'undefined') setFollowUpEnabled?.(!!fu.enabled);
          if (fu.at) {
            const d = dayjs(fu.at);
            if (d.isValid()) setFollowUpAt?.(d);
          }
          if (typeof fu.notes !== 'undefined') setFollowUpNotes?.(String(fu.notes || ''));
        } catch { /* noop */ }
      }
      updatePostLock(p);
      message.success('Details filled from saved Job Card.');
      setOpen(false); setMatches([]); setQuery('');
    } catch (e) {
      console.warn('applyPayloadToForm error:', e);
      message.error('Could not apply fetched Job Card.');
    }
  };

  // ---------- search ----------
  const runSearch = async () => {
    const raw = (query || "").trim();
    if (!raw) {
      message.warning("Enter a mobile number.");
      return;
    }
    setLoading(true);
    try {
      const result = await fetchRows();
      if (!result) throw new Error('No result');
      if (result.mode === 'webhook') {
        const rows = result.rows || [];
        if (!rows.length) {
          message.warning('No matching record found.');
          setMatches([]);
          return;
        }
        if (rows.length === 1) {
          const p = rows[0]?.payload || rows[0];
          applyPayloadToForm(p);
          return;
        }
        setMatches(rows.map(r => r.payload || r).slice(0, 10));
        message.info(`Found ${rows.length} matches. Pick one.`);
        return;
      }
      const rows = result.rows;
      let candidates = [];
      if (mode === "jc") {
        // exact JC match
        candidates = rows.filter((r) => pick(r, COL.JCNo) === raw);
      } else {
        // mobile: exact 10-digit OR partial suffix (as requested)
        const q = tenDigits(raw) || raw.replace(/\D/g, "");
        candidates = rows.filter((r) => {
          const m = tenDigits(pick(r, COL.Mobile));
          if (!q) return false;
          if (q.length < 10) return m.endsWith(q);
          return m === q;
        });
      }

      if (!candidates.length) {
        message.warning("No matching record found.");
        setMatches([]);
        return;
      }

      // newest first
      candidates.sort(
        (a, b) => parseTimestamp(b).valueOf() - parseTimestamp(a).valueOf()
      );

      if (candidates.length === 1) {
        applyRowToForm(candidates[0]);
        return;
      }

      setMatches(candidates.slice(0, 10));
      message.info(`Found ${candidates.length} matches. Pick one.`);
    } catch (e) {
      console.error(e);
      message.error("Could not fetch job cards. Check the Apps Script/CSV link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
     <Button
  type="primary"
  style={{ background: "#52c41a", borderColor: "#52c41a" }} // AntD green-6
  onClick={() => setOpen(true)}
>
  Fetch Details
</Button>


      <Modal
        title="Fetch Job Card"
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
          <Input
            placeholder={"Enter Mobile (10-digit or last few digits)"}
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
              renderItem={(item) => {
                // item may be a row object (CSV) or payload (webhook)
                const isPayload = item && item.formValues;
                const fv = isPayload ? item.formValues : null;
                const jc = isPayload ? (fv.jcNo || '—') : (pick(item, COL.JCNo) || '—');
                const nm = isPayload ? (fv.custName || '—') : (pick(item, COL.CustName) || '—');
                const mb = isPayload ? (String(fv.custMobile || '').replace(/\D/g,'').slice(-10) || '—') : (tenDigits(pick(item, COL.Mobile)) || '—');
                const rn = isPayload ? (fv.regNo || '—') : (pick(item, COL.RegNo) || '—');
                const ts = isPayload ? (fv.expectedDelivery || '-') : (parseTimestamp(item).format("DD/MM/YYYY HH:mm"));
                return (
                  <List.Item
                    actions={[
                      <Button type="link" onClick={() => (isPayload ? applyPayloadToForm(item) : applyRowToForm(item))}>
                        Use
                      </Button>,
                    ]}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", width: "100%" }}>
                      <div><b>JC:</b> {jc} &nbsp; <b>Name:</b> {nm}</div>
                      <div><b>Mobile:</b> {mb} &nbsp; <b>Vehicle:</b> {rn}</div>
                      <div style={{ gridColumn: "1 / span 2", color: "#999" }}>
                        <b>{isPayload ? 'Expected Delivery' : 'Timestamp'}:</b> {ts}
                      </div>
                    </div>
                  </List.Item>
                );
              }}
            />
          )}
        </Space>
      </Modal>
    </>
  );
}
