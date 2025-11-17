// FetchBooking.jsx
import React, { useState } from "react";
import {
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
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("mobile"); // 'mobile' | 'booking'
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState([]);

  const tenDigits = (x) =>
    String(x || "").replace(/\D/g, "").slice(-10);

  const fetchRows = async () => {
    if (!webhookUrl) throw new Error("Booking webhook URL not configured");
    const payload = { action: "search", mode, query: String(query || "") };
    const resp = await saveBookingViaWebhook({
      webhookUrl,
      method: "GET",
      payload,
    });
    const j = resp?.data || resp;
    const rows = Array.isArray(j?.rows) ? j.rows : [];
    return rows;
  };

  const payloadFromRow = (row) => {
    const p = row && row.payload ? row.payload : row;
    return p && typeof p === "object" ? p : {};
  };

  const applyToForm = (payload) => {
    try {
      const p = payloadFromRow(payload);
      const v = p.vehicle || {};
      const pvMode =
        String(p.purchaseMode || p.purchaseType || "").toLowerCase() ||
        "cash";
      const toNumber = (x) =>
        Number(String(x ?? 0).replace(/[,₹\s]/g, "")) || 0;
      const apTypes = Array.isArray(p.addressProofTypes)
        ? p.addressProofTypes
        : String(p.addressProofTypes || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

      const patch = {
        executive: p.executive || undefined,
        branch: p.branch || undefined,
        customerName: p.customerName || p.name || "",
        mobileNumber: tenDigits(p.mobileNumber || p.mobile || ""),
        address: p.address || "",
        company: v.company || "",
        bikeModel: v.model || "",
        variant: v.variant || "",
        color: v.color || undefined,
        chassisNo:
          v.chassisNo || v.availability === "allot"
            ? "__ALLOT__"
            : v.chassisNo || undefined,
        rtoOffice: p.rtoOffice || "KA",
        purchaseType: pvMode,
        financier:
          pvMode === "loan" ? p.financier || undefined : undefined,
        nohpFinancier:
          pvMode === "nohp"
            ? p.financier || p.nohpFinancier || undefined
            : undefined,
        disbursementAmount:
          pvMode === "loan" || pvMode === "nohp"
            ? toNumber(p.disbursementAmount) || undefined
            : undefined,
        addressProofMode: p.addressProofMode || p.addressProof || "aadhaar",
        addressProofTypes: apTypes,
        bookingAmount1:
          Array.isArray(p.payments) && p.payments[0]
            ? toNumber(p.payments[0].amount)
            : toNumber(p.bookingAmount),
        paymentMode1:
          Array.isArray(p.payments) && p.payments[0]
            ? p.payments[0].mode || "cash"
            : p.paymentMode || "cash",
        paymentReference1:
          Array.isArray(p.payments) && p.payments[0]
            ? p.payments[0].reference || ""
            : p.paymentReference || "",
        bookingAmount2:
          Array.isArray(p.payments) && p.payments[1]
            ? toNumber(p.payments[1].amount)
            : undefined,
        paymentMode2:
          Array.isArray(p.payments) && p.payments[1]
            ? p.payments[1].mode || "cash"
            : undefined,
        paymentReference2:
          Array.isArray(p.payments) && p.payments[1]
            ? p.payments[1].reference || ""
            : undefined,
        bookingAmount3:
          Array.isArray(p.payments) && p.payments[2]
            ? toNumber(p.payments[2].amount)
            : undefined,
        paymentMode3:
          Array.isArray(p.payments) && p.payments[2]
            ? p.payments[2].mode || "cash"
            : undefined,
        paymentReference3:
          Array.isArray(p.payments) && p.payments[2]
            ? p.payments[2].reference || ""
            : undefined,
        // DP breakdown
        downPayment: toNumber((p.dp && p.dp.downPayment) ?? p.downPayment),
        extraFittingAmount: toNumber(
          (p.dp && p.dp.extraFittingAmount) ?? p.extraFittingAmount
        ),
        affidavitCharges: toNumber(
          (p.dp && p.dp.affidavitCharges) ?? p.affidavitCharges
        ),
      };

      form.setFieldsValue(patch);
      if (patch.company) setSelectedCompany?.(patch.company);
      if (patch.bikeModel) setSelectedModel?.(patch.bikeModel);
      message.success("Booking details filled.");
      setOpen(false);
      setMatches([]);
      setQuery("");
      try {
        onApplied?.({
          bookingId: p.bookingId || p.serialNo || undefined,
          mobile: tenDigits(p.mobileNumber || p.mobile || ""),
        });
      } catch { /* noop */ }
    } catch (e) {
      console.warn("applyToForm error:", e);
      message.error("Could not apply booking details.");
    }
  };

  const runSearch = async () => {
    const q = String(query || "").trim();
    if (!q) {
      message.warning(
        mode === "mobile" ? "Enter Mobile" : "Enter Booking ID"
      );
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchRows();
      const items = rows.map((r) => ({ payload: payloadFromRow(r) }));
      if (!items.length) {
        message.warning("No matching booking found.");
        setMatches([]);
        return;
      }
      if (items.length === 1) {
        applyToForm(items[0].payload);
        return;
      }
      setMatches(items.slice(0, 10));
      message.info(`Found ${items.length} matches. Pick one.`);
    } catch (e) {
      console.warn("Booking search error:", e);
      message.error("Could not fetch bookings. Check webhook.");
    } finally {
      setLoading(false);
    }
  };

  const renderItem = (item) => {
    const p = payloadFromRow(item.payload);
    const v = p.vehicle || {};
    const labelVeh = [v.company, v.model, v.variant]
      .filter(Boolean)
      .join(" ");
    const mobile = tenDigits(p.mobileNumber || p.mobile || "");
    const branch = p.branch || "-";
    const created = p.ts
      ? dayjs(p.ts).format("DD/MM/YYYY")
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
        onClick={() => setOpen(true)}
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
          <Button
            key="search"
            type="primary"
            loading={loading}
            onClick={runSearch}
          >
            Search
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Radio.Group
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <Radio.Button value="mobile">By Mobile</Radio.Button>
            <Radio.Button value="booking">By Booking ID</Radio.Button>
          </Radio.Group>
          <Input
            placeholder={
              mode === "mobile"
                ? "Enter 10-digit Mobile"
                : "Enter Booking ID"
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
