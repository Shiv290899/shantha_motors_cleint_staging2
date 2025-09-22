// FetchJobcard.jsx
import React, { useMemo, useState } from "react";
import { Button, Modal, Radio, Input, List, Space, Spin, message } from "antd";
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
  sheetUrl,
  parseCSV,
  formatReg,
  buildRows,
  defaultGstLabour = 0,
  lists,
  setServiceTypeLocal,
  setVehicleTypeLocal,
  setRegDisplay,
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("jc"); // 'jc' | 'mobile'
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
      ExpectedDelivery: ["Expected Delivery Date", "Expected Delivery"],
      RegNo: [
        "Vehicle No",
        "Vehicle Number",
        "Registration Number",
        "Reg No",
        "RegNo",
      ],
      Model: ["Model"],
      Colour: ["Colour", "Color"],
      KM: ["Odometer Reading", "Odomete Reading", "KM", "Odometer"],
      CustName: ["Customer Name", "Name"],
      Mobile: ["Mobile", "Mobile No", "Mobile Number", "Phone", "Phone Number"],
      Obs: ["Customer Observation", "Observation", "Notes"],
      VehicleType: ["Vehicle Type", "Type of Vehicle"],
      ServiceType: ["Service Type", "Service"],
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

  // ---------- CSV fetch ----------
  const fetchRows = async () => {
    if (!sheetUrl) throw new Error("Missing sheetUrl for FetchJobcard");
    const res = await fetch(sheetUrl, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to download sheet CSV");
    const csv = await res.text();
    const parsed = parseCSV(csv);
    return parsed?.rows || [];
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

    message.success("Details filled from sheet.");
    setOpen(false);
    setMatches([]);
    setQuery("");
  };

  // ---------- search ----------
  const runSearch = async () => {
    const raw = (query || "").trim();
    if (!raw) {
      message.warning("Enter a JC No or Mobile.");
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchRows();
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
      message.error("Could not fetch the sheet. Check the published CSV link.");
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
        title="Fetch Details from Google Sheet"
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
              setMode(e.target.value);
              setMatches([]);
            }}
          >
            <Radio.Button value="jc">JC No</Radio.Button>
            <Radio.Button value="mobile">Mobile</Radio.Button>
          </Radio.Group>

          <Input
            placeholder={
              mode === "jc"
                ? "Enter JC No (exact)"
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
              renderItem={(item) => {
                const jc = pick(item, COL.JCNo) || "—";
                const nm = pick(item, COL.CustName) || "—";
                const mb = tenDigits(pick(item, COL.Mobile)) || "—";
                const rn = pick(item, COL.RegNo) || "—";
                const ts = parseTimestamp(item).format("DD/MM/YYYY HH:mm");
                return (
                  <List.Item
                    actions={[
                      <Button type="link" onClick={() => applyRowToForm(item)}>
                        Use
                      </Button>,
                    ]}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", width: "100%" }}>
                      <div><b>JC:</b> {jc} &nbsp; <b>Name:</b> {nm}</div>
                      <div><b>Mobile:</b> {mb} &nbsp; <b>Vehicle:</b> {rn}</div>
                      <div style={{ gridColumn: "1 / span 2", color: "#999" }}>
                        <b>Timestamp:</b> {ts}
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
