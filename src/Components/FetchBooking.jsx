// FetchBooking.jsx
import React, { useState, useEffect, useRef } from "react";
import {
  Alert,
  Button,
  Modal,
  Input,
  List,
  Space,
  Spin,
  message,
  Radio,
} from "antd";
import dayjs from "dayjs";
import { saveBookingViaWebhook } from "../apiCalls/forms";
import { buildBookingFormPatch } from "../utils/bookingFormPrefill";

/**
 * Fetch existing Booking by Booking ID or Mobile and fill the BookingForm.
 * Props:
 * - form: AntD form instance from BookingForm
 * - webhookUrl: Booking Apps Script URL
 * - setSelectedCompany, setSelectedModel: mirrors for selects in BookingForm
 */
export default function FetchBooking({
  form,
  webhookUrl,
  setSelectedCompany,
  setSelectedModel,
  onApplied,
  autoSearch,
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("mobile"); // 'mobile' | 'booking'
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState([]);
  const [notFoundText, setNotFoundText] = useState("");
  const autoSearchRequestRef = useRef(null);
  const tenDigits = (x) =>
    String(x || "").replace(/\D/g, "").slice(-10);
  const cleanBookingId = (x) =>
    String(x || "").toUpperCase().replace(/\s+/g, "");
  const normalizeReg = (x) => String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const VEH_RX = /^[A-Z]{2}\d{2}[A-Z]{2}\d{4}$/;
  const isVehiclePartial = (val) => {
    const v = normalizeReg(val);
    if (v.length > 10) return false;
    if (!/^[A-Z0-9]*$/.test(v)) return false;
    const stages = [
      /^[A-Z]{0,2}$/,
      /^[A-Z]{2}\d{0,2}$/,
      /^[A-Z]{2}\d{2}[A-Z]{0,2}$/,
      /^[A-Z]{2}\d{2}[A-Z]{2}\d{0,4}$/,
    ];
    return stages.some((rx) => rx.test(v));
  };

  const showNotFoundModal = (modeOverride) => {
    const resolvedMode = modeOverride || mode;
    const pretty =
      resolvedMode === "mobile"
        ? tenDigits(query) || String(query || "").trim()
        : String(query || "").trim();
    const txt =
      pretty
        ? `The ${
            resolvedMode === "mobile"
              ? "mobile number"
              : resolvedMode === "vehicle"
              ? "vehicle number"
              : "booking ID"
          } "${pretty}" is not in our records.`
        : "No matching booking found in our records.";
    setNotFoundText(txt);
    Modal.warning({
      centered: true,
      title: "No booking found",
      content: txt,
      okText: "Got it",
    });
  };

  const fetchRows = async (queryOverride, modeOverride) => {
    if (!webhookUrl) throw new Error("Booking webhook URL not configured");
    const nextMode = modeOverride || mode || "mobile";
    const qStr = String(queryOverride ?? query ?? "").trim();
    const payloadBase = { action: "search", mode: nextMode, query: qStr };
    const primary = await saveBookingViaWebhook({
      webhookUrl,
      method: "GET",
      payload: payloadBase,
    });
    let rows = Array.isArray((primary?.data || primary)?.rows)
      ? (primary?.data || primary).rows
      : [];
    if (!rows.length && nextMode === "vehicle") {
      const alt = await saveBookingViaWebhook({
        webhookUrl,
        method: "GET",
        payload: { ...payloadBase, mode: "reg" },
      }).catch(() => null);
      const altRows = Array.isArray((alt?.data || alt)?.rows)
        ? (alt?.data || alt).rows
        : [];
      rows = altRows;
    }
    if (!rows.length && nextMode === "vehicle") {
      try {
        const listResp = await saveBookingViaWebhook({
          webhookUrl,
          method: "GET",
          payload: { action: "list" },
        });
        const lj = listResp?.data || listResp;
        const dataArr = Array.isArray(lj?.rows)
          ? lj.rows
          : Array.isArray(lj?.data)
          ? lj.data
          : [];
        const qreg = normalizeReg(qStr);
        const filtered = dataArr.filter((r) => {
          const vals = r?.values || {};
          const payload = r?.payload || r || {};
          const regFromVals = normalizeReg(
            vals["Vehicle No"] ||
              vals.Vehicle_No ||
              vals.RegNo ||
              vals["Reg No"] ||
              vals["Registration Number"] ||
              vals["Vehicle Number"] ||
              ""
          );
          const regFromPayload = normalizeReg(
            payload.vehicle?.regNo ||
              payload.vehicle?.registrationNumber ||
              payload.vehicleNo ||
              payload.regNo ||
              payload.registrationNumber ||
              ""
          );
          const regFromRaw = normalizeReg(
            typeof payload.rawPayload === "string" ? payload.rawPayload : ""
          );
          return (
            (qreg && regFromVals === qreg) ||
            (qreg && regFromPayload === qreg) ||
            (qreg && regFromRaw.includes(qreg))
          );
        });
        rows = filtered;
      } catch {
        // ignore list failure
      }
    }
    return rows;
  };

  const payloadFromRow = (row) => {
    const p = row && row.payload ? row.payload : row;
    return p && typeof p === "object" ? p : {};
  };

  const applyToForm = (payload) => {
    try {
      const p = payloadFromRow(payload);
      const { patch, metadata } = buildBookingFormPatch(p);
      form.setFieldsValue(patch);
      if (patch.company) setSelectedCompany?.(patch.company);
      if (patch.bikeModel) setSelectedModel?.(patch.bikeModel);
      message.success("Booking details filled.");
      setOpen(false);
      setMatches([]);
      setQuery("");
      try {
        onApplied?.(metadata);
      } catch {
        // noop
      }
      window.dispatchEvent(new CustomEvent("bookingPrefillComplete"));
    } catch (e) {
      console.warn("applyToForm error:", e);
      message.error("Could not apply booking details.");
      window.dispatchEvent(new CustomEvent("bookingPrefillComplete"));
    }
  };

  const runSearch = async ({ modeOverride, queryOverride, silent, autoSearch = false } = {}) => {
    const raw = String(queryOverride ?? query ?? "").trim();
    const nextMode = modeOverride || mode || "mobile";
    const dispatchAutoCompletion = () => {
      if (autoSearch && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("bookingPrefillComplete"));
      }
    };
    if (!raw) {
      if (!silent) {
        message.warning(
          nextMode === "mobile"
            ? "Enter 10-digit Mobile"
            : nextMode === "vehicle"
            ? "Enter vehicle no. (KA03AB1234)"
            : "Enter Booking ID"
        );
      }
      dispatchAutoCompletion();
      return;
    }
    let qNorm = raw;
    if (nextMode === "mobile") {
      const digits = tenDigits(raw);
      if (digits.length !== 10) {
        if (!silent) message.error("Enter a valid 10-digit mobile number.");
        dispatchAutoCompletion();
        return;
      }
      qNorm = digits;
      setQuery(digits);
    } else if (nextMode === "vehicle") {
      const reg = normalizeReg(raw);
      if (!VEH_RX.test(reg)) {
        if (!silent) message.error("Enter vehicle as KA03AB1234.");
        dispatchAutoCompletion();
        return;
      }
      qNorm = reg;
      setQuery(reg);
    } else {
      qNorm = cleanBookingId(raw);
      setQuery(qNorm);
    }
    setMode(nextMode);
    setNotFoundText("");
    setLoading(true);
    try {
      const rows = await fetchRows(qNorm, nextMode);
      const items = rows.map((r) => ({ payload: payloadFromRow(r) }));
      if (!items.length) {
        if (!silent) showNotFoundModal(nextMode);
        setMatches([]);
        return;
      }
      if (items.length === 1) {
        applyToForm(items[0].payload);
        return;
      }
      setMatches(items.slice(0, 10));
      if (!silent) message.info(`Found ${items.length} matches. Pick one.`);
    } catch (e) {
      console.warn("Booking search error:", e);
      if (!silent) message.error("Could not fetch bookings. Check webhook.");
    } finally {
      setLoading(false);
      if (autoSearch && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("bookingPrefillComplete"));
      }
    }
  };

  useEffect(() => {
    const queryValue = String(autoSearch?.query || "").trim();
    if (!queryValue) return;
    const nextMode = autoSearch?.mode || "mobile";
    const key = `${nextMode}:${queryValue}`;
    if (autoSearchRequestRef.current === key) return;
    autoSearchRequestRef.current = key;
    runSearch({
      modeOverride: nextMode,
      queryOverride: queryValue,
      silent: true,
      autoSearch: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSearch?.mode, autoSearch?.query]);

  const renderItem = (item) => {
    const p = payloadFromRow(item.payload);
    const v = p.vehicle || {};
    const labelVeh = [v.company, v.model, v.variant]
      .filter(Boolean)
      .join(" ");
    const mobile = tenDigits(p.mobileNumber || p.mobile || "");
    const branch = p.branch || "-";
    const created = p.ts
      ? dayjs(p.ts).format("DD-MM-YYYY HH:mm")
      : "-";
    return (
      <List.Item
        actions={[
          <Button type="link" onClick={() => applyToForm(item.payload)}>
            Use
          </Button>,
        ]}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            width: "100%",
          }}
        >
          <div>
            <b>Name:</b> {p.customerName || p.name || "-"} &nbsp;
            <b>Mobile:</b> {mobile || "-"}
          </div>
          <div>
            <b>Vehicle:</b> {labelVeh || "-"} &nbsp;
            <b>Branch:</b> {branch}
          </div>
          <div
            style={{
              gridColumn: "1 / span 2",
              color: "#999",
            }}
          >
            <b>Mode:</b>{" "}
            {String(p.purchaseMode || p.purchaseType || "cash").toUpperCase()}{" "}
            &nbsp; <b>Date:</b> {created}
          </div>
        </div>
      </List.Item>
    );
  };

  return (
    <>
      <Button
        onClick={() => {
          setNotFoundText("");
          setOpen(true);
        }}
        style={{
          background: "#2ECC71",
          borderColor: "#2ECC71",
          color: "#fff",
        }}
      >
        Fetch Details
      </Button>
      <Modal
        title="Fetch Booking"
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
          <Button
            key="search"
            type="primary"
            loading={loading}
            onClick={() => runSearch()}
          >
            Search
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Radio.Group
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setQuery("");
            }}
          >
            <Radio.Button value="mobile">By Mobile</Radio.Button>
            <Radio.Button value="booking">By Booking ID</Radio.Button>
            <Radio.Button value="vehicle">By Vehicle</Radio.Button>
          </Radio.Group>
          <Input
            placeholder={
              mode === "mobile"
                ? "Enter 10-digit Mobile"
                : mode === "vehicle"
                ? "Enter Vehicle No (KA03AB1234)"
                : "Enter Booking ID"
            }
            value={query}
            inputMode={mode === "mobile" ? "numeric" : "text"}
            onChange={(e) => {
              const val = e.target.value || "";
              if (mode === "mobile") {
                const digits = val.replace(/\D/g, "").slice(0, 10);
                setQuery(digits);
              } else if (mode === "vehicle") {
                const reg = val.toUpperCase().replace(/[^A-Z0-9]/g, "");
                if (!isVehiclePartial(reg)) return;
                setQuery(reg);
              } else {
                setQuery(cleanBookingId(val));
              }
            }}
            onPressEnter={() => runSearch()}
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
