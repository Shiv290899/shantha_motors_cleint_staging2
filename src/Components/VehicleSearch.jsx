import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  List,
  Radio,
  Row,
  Space,
  Tag,
  Typography,
  message,
} from "antd";
import dayjs from "dayjs";
import { saveBookingViaWebhook, saveJobcardViaWebhook } from "../apiCalls/forms";
import PostServiceSheet from "./PostServiceSheet";
import { handleSmartPrint } from "../utils/printUtils";

const { Text } = Typography;

const DEFAULT_BOOKING_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwjkChHx31B3d961Yn_SkVqI5PGrT4VvGNaUmLzs2Z5V7JK8xhAl4wbjYvdw0CBtq71kg/exec";
const DEFAULT_JOBCARD_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwX0-KYGAGl7Gte4f_rF8OfnimU7T5WetLIv6gba_o7-kOOjzgOM3JnsHkoqrDJK83GCQ/exec";
const GAS_SECRET = import.meta.env.VITE_JOBCARD_GAS_SECRET || "";
const BOOKING_SECRET = import.meta.env.VITE_BOOKING_GAS_SECRET || "";

const BOOKING_GAS_URL =
  import.meta.env.VITE_BOOKING_GAS_URL || DEFAULT_BOOKING_GAS_URL;
const JOBCARD_GAS_URL =
  import.meta.env.VITE_JOBCARD_GAS_URL || DEFAULT_JOBCARD_GAS_URL;

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

const normalizeMobile = (x) => String(x || "").replace(/\D/g, "").slice(-10);
const isMobileLike = (x) => normalizeMobile(x).length === 10;
const normalizeReg = (x) => String(x || "").toUpperCase().replace(/\s+/g, "");
const VEHICLE_FULL_RX = /^[A-Z]{2}\d{2}[A-Z]{2}\d{4}$/;
const isVehiclePartial = (val) => {
  const v = String(val || "").toUpperCase();
  if (!/^[A-Z0-9]*$/.test(v)) return false;
  const stages = [
    /^[A-Z]{0,2}$/,
    /^[A-Z]{2}\d{0,2}$/,
    /^[A-Z]{2}\d{2}[A-Z]{0,2}$/,
    /^[A-Z]{2}\d{2}[A-Z]{2}\d{0,4}$/,
  ];
  return stages.some((rx) => rx.test(v));
};

// Optional mechanic contacts (best-effort; show only if known)
const MECHANIC_CONTACTS = {
  SONU: "7033558306",
  KARTHIK: "7338386813",
  MANMOHAN: "9956079799",
  MANSUR: "7795047627",
  IRSHAD: "6207176821",
  DAKSHAT: "7829096931",
  SALMAN: "7892335161",
};

const getMechanicContact = (name) => {
  const key = String(name || "").trim();
  if (!key) return "";
  return MECHANIC_CONTACTS[key] || MECHANIC_CONTACTS[key.toUpperCase()] || "";
};

const parseDate = (val) => {
  const d = dayjs(val);
  return d.isValid() ? d : null;
};

const _pick = (obj = {}, keys = []) =>
  String(keys.map((k) => obj?.[k] ?? "").find((v) => v !== "") || "").trim();

const parseBookingRow = (row) => {
  const vTop = row?.values || {};
  const p = row?.payload || row || {};
  const v = p.vehicle || {};
  const mobile = normalizeMobile(p.mobileNumber || p.mobile || "");
  const when = parseDate(p.ts || p.createdAt);
  const attachments =
    (Array.isArray(p.attachments) ? p.attachments : []) ||
    (Array.isArray(p.files) ? p.files : []);
  const pickByName = (needle) => {
    const n = String(needle || "").toLowerCase();
    const hit = attachments.find((a) =>
      String(a?.name || "").toLowerCase().includes(n)
    );
    return hit?.url || hit?.fileId || null;
  };
  const pickDirect = (obj, keys) =>
    keys
      .map((k) => obj?.[k])
      .find((v) => v != null && String(v).trim() !== "");

  let invoiceUrl =
    p.invoiceFileUrl ||
    row?.invoiceFileUrl ||
    p.invoiceUrl ||
    p.invoiceLink ||
    pickDirect(vTop, ["Invoice File URL", "Invoice", "InvoiceFileUrl", "InvoiceFileURL"]) ||
    pickDirect(p, ["Invoice File URL", "Invoice", "InvoiceFileUrl", "InvoiceFileURL"]) ||
    vTop?.invoiceFileUrl ||
    vTop?.invoiceUrl ||
    vTop?.invoiceLink ||
    vTop?.["Invoice File URL"] ||
    vTop?.["Invoice"] ||
    p["Invoice File URL"] ||
    p["Invoice"] ||
    pickByName("invoice") ||
    null;
  let insuranceUrl =
    p.insuranceFileUrl ||
    row?.insuranceFileUrl ||
    p.insuranceUrl ||
    p.insuranceLink ||
    vTop?.insuranceFileUrl ||
    vTop?.insuranceUrl ||
    vTop?.insuranceLink ||
    vTop?.["Insurance File URL"] ||
    vTop?.["Insurance"] ||
    p["Insurance File URL"] ||
    p["Insurance"] ||
    pickByName("insurance") ||
    null;
  // Fallback to attachments when explicit URLs missing
  if (!invoiceUrl && attachments?.length) invoiceUrl = attachments[0]?.url || attachments[0]?.fileId || invoiceUrl;
  if (!insuranceUrl && attachments?.length > 1) insuranceUrl = attachments[1]?.url || attachments[1]?.fileId || insuranceUrl;
  const billLink =
    invoiceUrl ||
    p.bookingSheetUrl ||
    p.file?.url ||
    p.file?.fileId ||
    vTop?.bookingSheetUrl ||
    vTop?.file?.url ||
    vTop?.file?.fileId ||
    attachments?.[0]?.url ||
    null;
  return {
    id: p.bookingId || p.serialNo || p.id || "",
    customerName: p.customerName || p.name || "",
    mobile,
    vehicle: [v.company, v.model, v.variant].filter(Boolean).join(" "),
    color: v.color || "",
    chassis: v.chassisNo || "",
    branch: p.branch || "",
    purchaseMode: p.purchaseMode || p.purchaseType || "",
    createdAt: when,
    raw: p,
    billLink,
    invoiceUrl,
    insuranceUrl,
  };
};

const parseJobRow = (row) => {
  const root = row || {};
  const p = row?.payload || row?.values || root;
  const fv = p.formValues || p.values || {};
  const custName =
    fv.custName ||
    p.custName ||
    p.customerName ||
    p["Customer Name"] ||
    p.name ||
    "";
  const mobile = normalizeMobile(
    fv.custMobile ||
      p.custMobile ||
      p.mobile ||
      p["Mobile Number"] ||
      p["Mobile"] ||
      ""
  );
  const ts =
    p.ts ||
    p.timestamp ||
    p.createdAt ||
    p["Created At"] ||
    fv.createdAt ||
    fv.created_at ||
    fv.timestamp ||
    "";
  const regNo =
    fv.regNo ||
    fv.vehicleNo ||
    fv.registrationNumber ||
    p.RegNo ||
    p["Vehicle No"] ||
    p["Registration Number"] ||
    "";
  const billLink =
    p.billUrl ||
    p.billLink ||
    p.bill?.url ||
    p.file?.url ||
    (Array.isArray(p.attachments) ? p.attachments[0]?.url : null) ||
    null;
  return {
    jcNo:
      fv.jcNo ||
      p.jcNo ||
      p["JC No"] ||
      p["Job Card No"] ||
      p["JC Number"] ||
      "",
    serviceType:
      fv.serviceType || p.serviceType || p["Service Type"] || p.Service || "",
    regNo,
    model: fv.model || p.model || "",
    company: fv.company || p.company || "",
    color: fv.color || p.color || "",
    colour: fv.colour || p.colour || p.color || "",
    custName,
    amount:
      (p.totals && p.totals.grand) ||
      p.amount ||
      p["Service Amount"] ||
      p["Collected Amount"] ||
      "",
    paymentMode:
      p.paymentMode ||
      p["Payment Mode"] ||
      p.Payment_Mode ||
      fv.paymentMode ||
      "",
    branch: fv.branch || p.branch || "",
    mechanic: fv.mechanic || p.mechanic || "",
    executive: fv.executive || p.executive || "",
    remarks:
      p.remark ||
      p.Remarks ||
      p.remarkText ||
      p["Remark Text"] ||
      fv.remarks ||
      root.remarks ||
      root.Remarks ||
      root.remarkText ||
      root["Remark Text"] ||
      "",
    km: (() => {
      const raw =
        fv.km ||
        p.km ||
        p.KM ||
        p["KM"] ||
        p["Odometer Reading"] ||
        p["Odometer"] ||
        (p.totals && p.totals.km) ||
        (p.payload && p.payload.km) ||
        (p.payload && p.payload.formValues && p.payload.formValues.km) ||
        root.KM ||
        root["KM"] ||
        (root.values && (root.values.KM || root.values["KM"] || root.values["Odometer Reading"] || root.values["Odometer"]));
      const digits = String(raw || "").replace(/\D/g, "");
      return digits || raw || "";
    })(),
    serviceNo:
      (() => {
        const sn =
          p.serviceNo ||
          p.serviceNumber ||
          p.visitNo ||
          p.visit ||
          fv.serviceNo ||
          p["Service No"] ||
          p["Service #"] ||
          p["Visit No"] ||
          "";
        const n = Number.parseInt(sn, 10);
        return Number.isFinite(n) ? n : null;
      })() || null,
    mobile,
    createdAt: parseDate(ts),
    billLink,
    raw: p,
  };
};

export default function VehicleSearch() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("vehicle"); // mobile | vehicle
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [error, setError] = useState("");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const invoiceRef = useRef(null);

  const mainBooking = bookings[0] || null;
  const serviceTimeline = useMemo(() => {
    const sorted = [...services].sort((a, b) => {
      const ta = a.createdAt ? a.createdAt.valueOf() : 0;
      const tb = b.createdAt ? b.createdAt.valueOf() : 0;
      if (ta !== tb) return ta - tb;
      const sa = Number.isFinite(a.serviceNo) ? a.serviceNo : 0;
      const sb = Number.isFinite(b.serviceNo) ? b.serviceNo : 0;
      return sa - sb;
    });
    return sorted;
  }, [services]);

  const fetchServiceHistory = async (searchQuery) => {
    if (!JOBCARD_GAS_URL) return [];
    const payload = GAS_SECRET
      ? { action: "getServiceHistory", query: searchQuery, mode, secret: GAS_SECRET }
      : { action: "getServiceHistory", query: searchQuery, mode };
    const call = async (method) => {
      const resp = await saveJobcardViaWebhook({
        webhookUrl: JOBCARD_GAS_URL,
        method,
        payload,
      });
      const js = resp?.data || resp;
      return Array.isArray(js?.rows) ? js.rows : [];
    };
    try {
      let rows = [];
      try {
        rows = await call("GET");
      } catch (e) {
        console.warn("Service history GET failed", e);
      }
      if (!rows.length) {
        try {
          rows = await call("POST");
        } catch (e) {
          console.warn("Service history POST failed", e);
        }
      }
      return rows;
    } catch (e) {
      console.warn("Service history fetch failed", e);
      return [];
    }
  };

  const runSearch = async () => {
    const qRaw = String(query || "").trim();
    if (!qRaw) {
      message.warning("Enter mobile or vehicle number to search");
      return;
    }
    // Validate/normalize based on mode
    let q = qRaw;
    if (mode === "mobile") {
      const digits = normalizeMobile(qRaw);
      if (digits.length !== 10) {
        message.error("Enter a valid 10-digit mobile number.");
        return;
      }
      q = digits;
    } else {
      const reg = normalizeReg(qRaw);
      if (!VEHICLE_FULL_RX.test(reg)) {
        message.error("Enter vehicle as KA03AB1234 (AA##AA####).");
        return;
      }
      q = reg;
    }
    setLoading(true);
    setError("");
    try {
      const nextBookings = [];
      const nextServices = [];
      const searchQuery = mode === "mobile" ? normalizeMobile(q) || q : normalizeReg(q);
      const fetchBookings = async (payload, method = "GET") => {
        const resp = await saveBookingViaWebhook({
          webhookUrl: BOOKING_GAS_URL,
          method,
          payload,
        });
        const js = resp?.data || resp;
        return Array.isArray(js?.rows) ? js.rows : [];
      };

      const bookingPromise = (async () => {
        if (!BOOKING_GAS_URL) return;
        if (!(mode === "mobile" || isMobileLike(q) || q.toUpperCase().startsWith("BK-") || mode === "vehicle")) return;
        const payload = (() => {
          if (q.toUpperCase().startsWith("BK-")) return { action: "search", mode: "booking", query: q.toUpperCase() };
          if (mode === "vehicle" && !isMobileLike(q)) return { action: "search", mode: "vehicle", query: normalizeReg(q) };
          return { action: "search", mode: "mobile", query: normalizeMobile(q) || q };
        })();
        if (BOOKING_SECRET) payload.secret = BOOKING_SECRET;
        try {
          const rows = await fetchBookings(payload, "GET");
          rows.forEach((r) => nextBookings.push(parseBookingRow(r)));
        } catch (e) {
          console.warn("Booking search failed", e);
        }
      })();

      const servicesPromise = (async () => {
        if (!JOBCARD_GAS_URL) return;
        let foundHistory = false;
        try {
          const hist = await fetchServiceHistory(searchQuery);
          if (hist.length) {
            hist.forEach((r) => nextServices.push(parseJobRow(r)));
            foundHistory = true;
          }
        } catch (e) {
          console.warn("History lookup failed", e);
        }

        if (foundHistory) return;
        const jobModes = mode === "vehicle" && !isMobileLike(q) ? ["reg", "vehicle"] : ["mobile", "reg"];
        for (const m of jobModes) {
          try {
            const payload = { action: "search", mode: m, query: searchQuery };
            if (GAS_SECRET) payload.secret = GAS_SECRET;
            let resp = await saveJobcardViaWebhook({
              webhookUrl: JOBCARD_GAS_URL,
              method: "GET",
              payload,
            });
            let js = resp?.data || resp;
            let rows = Array.isArray(js?.rows) ? js.rows : [];
            if (!rows.length) {
              resp = await saveJobcardViaWebhook({
                webhookUrl: JOBCARD_GAS_URL,
                method: "POST",
                payload,
              });
              js = resp?.data || resp;
              rows = Array.isArray(js?.rows) ? js.rows : [];
            }
            if (rows.length) {
              rows.forEach((r) => nextServices.push(parseJobRow(r)));
              return;
            }
          } catch (e) {
            console.warn("Jobcard search failed", e);
          }
        }
        if (mode === "mobile" && !isMobileLike(q)) {
          setError("No matching job cards found. Try vehicle number search.");
        }
      })();

      await Promise.allSettled([bookingPromise, servicesPromise]);

      // Fallback: if no bookings from vehicle search, but we have service rows with a mobile, fetch bookings by that mobile
      if (!nextBookings.length && mode === "vehicle" && BOOKING_GAS_URL && nextServices.length) {
        const m = normalizeMobile(nextServices[0]?.mobile || nextServices[0]?.custMobile || "");
        if (m.length === 10) {
          const payloadMobile = BOOKING_SECRET
            ? { action: "search", mode: "mobile", query: m, secret: BOOKING_SECRET }
            : { action: "search", mode: "mobile", query: m };
          try {
            let rows = await fetchBookings(payloadMobile, "GET");
            if (!rows.length) {
              rows = await fetchBookings(payloadMobile, "POST").catch(() => []);
            }
            rows.forEach((r) => nextBookings.push(parseBookingRow(r)));
          } catch (e) {
            console.warn("Fallback booking-by-mobile failed", e);
          }
        }
      }

      setBookings(nextBookings);
      setServices(nextServices);
      if (!nextBookings.length && !nextServices.length) {
        setError("No records found. Check the number and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const bookingMeta = mainBooking
    ? [
        { label: "Customer", value: mainBooking.customerName || "-" },
        { label: "Mobile", value: mainBooking.mobile || "-" },
        { label: "Vehicle", value: mainBooking.vehicle || "-" },
        { label: "Color", value: mainBooking.color || "-" },
        { label: "Chassis", value: mainBooking.chassis || "-" },
        { label: "Branch", value: mainBooking.branch || "-" },
        {
          label: "Mode",
          value: (mainBooking.purchaseMode || "").toUpperCase() || "-",
        },
        {
          label: "Created",
          value: mainBooking.createdAt
            ? mainBooking.createdAt.format("DD MMM YYYY")
            : "-",
        },
      ]
    : [];

  const newJobcardQuery = useMemo(() => {
    const latestService =
      serviceTimeline && serviceTimeline.length
        ? serviceTimeline[serviceTimeline.length - 1]
        : null;
    const source = latestService || mainBooking;
    if (!source) return "";
    const params = new URLSearchParams();
    const regNo = source.regNo || source.vehicle || "";
    const model = source.model || source.company || source.vehicle || "";
    const colour = source.colour || source.color || source.colour || "";
    const custName = source.custName || source.customerName || "";
    const mobileVal = source.mobile || source.custMobile || "";
    if (regNo) params.set("regNo", regNo);
    if (model) params.set("model", model);
    if (colour) params.set("colour", colour);
    if (custName) params.set("custName", custName);
    if (mobileVal) params.set("custMobile", mobileVal);
    return params.toString();
  }, [serviceTimeline, mainBooking]);

  const handleNewJobcard = () => {
    if (newJobcardQuery) {
      navigate(`/jobcard?${newJobcardQuery}`);
    } else {
      navigate("/jobcard");
    }
  };

  const buildInvoicePayload = (s) => {
    if (!s) return null;
    const payload = s?.raw?.payload || s?.raw || {};
    const fv = payload.formValues || s?.raw?.formValues || {};
    const labourRows = Array.isArray(payload.labourRows) ? payload.labourRows : [];
    const totalsIn = payload.totals || {};
    const computedSub = labourRows.reduce(
      (sum, r) => sum + (Number(r?.qty || 0) * Number(r?.rate || 0)),
      0
    );
    const totals = {
      labourSub: totalsIn.labourSub ?? computedSub,
      labourGST: totalsIn.labourGST ?? 0,
      labourDisc: totalsIn.labourDisc ?? 0,
      grand: totalsIn.grand ?? computedSub,
    };
    const createdAt =
      (s.createdAt && s.createdAt.toDate && s.createdAt.toDate()) ||
      s.createdAt ||
      payload.postServiceAt ||
      payload.createdAt ||
      new Date();
    return {
      vals: {
        jcNo: s.jcNo || fv.jcNo || "",
        regNo: s.regNo || fv.regNo || "",
        custName: s.custName || fv.custName || "",
        custMobile: s.mobile || fv.custMobile || "",
        km: fv.km || "",
        model: s.model || fv.model || "",
        colour: s.colour || fv.colour || "",
        branch: s.branch || fv.branch || "",
        executive: s.executive || fv.executive || "",
        createdAt,
        labourRows,
        gstLabour: totalsIn.gstLabour || totalsIn.labourGST || 0,
      },
      totals,
    };
  };

  const handleInvoice = (s) => {
    const built = buildInvoicePayload(s);
    if (!built) return;
    setInvoiceData(built);
    setInvoiceOpen(true);
    setTimeout(() => {
      try {
        handleSmartPrint(invoiceRef.current);
      } catch {
        /* ignore */
      }
      setTimeout(() => setInvoiceOpen(false), 500);
    }, 50);
  };

  return (
    <>
    <div
      style={{
        padding: 24,
        maxWidth: 1200,
        margin: "24px auto",
        borderRadius: 24,
        background: "radial-gradient(circle at top, #0f172a 0%, #020617 40%, #020617 100%)",
        boxShadow: "0 24px 60px rgba(15, 23, 42, 0.8)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
      }}
    >
      <Card
        title={
          <Space align="center" size={8}>
            <span
              style={{
                fontSize: 22,
                color: "#ef4444",
              }}
            >
              🏍️
            </span>
            <span>Vehicle Search</span>
          </Space>
        }
        extra={
          <Space>
            <Radio.Group
              value={mode}
              onChange={(e) => {
                const next = e.target.value;
                setMode(next);
                setQuery("");
              }}
              size="small"
            >
              <Radio.Button value="vehicle">Vehicle No</Radio.Button>
              <Radio.Button value="mobile">Mobile</Radio.Button>
            </Radio.Group>
          </Space>
        }
        bodyStyle={{ padding: 16, paddingBottom: 12 }}
        style={{
          borderRadius: 20,
          boxShadow: "0 18px 45px rgba(15, 23, 42, 0.25)",
          border: "1px solid rgba(148, 163, 184, 0.3)",
          overflow: "hidden",
        }}
        headStyle={{
          background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 60%, #22c55e 100%)",
          color: "#ffffff",
          borderBottom: "none",
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: 0.4,
        }}
      >
        <Space.Compact style={{ width: "100%" }}>
          <Input
            size="large"
            placeholder={
              mode === "mobile"
                ? "Enter mobile number"
                : "Enter vehicle number (e.g., KA03AB1234)"
            }
            value={query}
            onChange={(e) => {
              const val = e.target.value || "";
              if (mode === "mobile") {
                const digits = val.replace(/\D/g, "").slice(0, 10);
                setQuery(digits);
                return;
              }
              const up = val.toUpperCase().replace(/[^A-Z0-9]/g, "");
              if (!isVehiclePartial(up)) return;
              setQuery(up);
            }}
            onPressEnter={runSearch}
            allowClear
            style={{
              borderRadius: 999,
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.2)",
              border: "1px solid rgba(148, 163, 184, 0.5)",
            }}
          />
          <Button
            type="primary"
            size="large"
            loading={loading}
            onClick={runSearch}
            style={{
              borderRadius: 999,
              paddingInline: 28,
              boxShadow: "0 12px 30px rgba(37, 99, 235, 0.45)",
              fontWeight: 600,
            }}
          >
            Search
          </Button>
        </Space.Compact>
        {error && (
          <Alert
            style={{ marginTop: 12 }}
            type="warning"
            message={error}
            showIcon
          />
        )}
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card
            title={
              <Space align="center" size={6}>
                <span style={{ fontSize: 18 }}>📒</span>
                <span>Booking Details</span>
              </Space>
            }
            extra={
              <Tag color={bookings.length ? "green" : "default"}>
                {bookings.length ? `${bookings.length} found` : "None"}
              </Tag>
            }
            style={{
              borderRadius: 16,
              boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
              border: "none",
              height: "100%",
            }}
            headStyle={{
              fontWeight: 600,
              borderBottom: "1px solid #e5e7eb",
            }}
            bodyStyle={{ padding: 16 }}
          >
            {!bookings.length ? (
              <Empty description="No booking data" />
            ) : (
              <>
                <Descriptions
                  size="small"
                  column={1}
                  colon
                  bordered
                  items={bookingMeta.map((m) => ({
                    key: m.label,
                    label: m.label,
                    children: m.value || "-",
                  }))}
                />
                <Space wrap style={{ marginTop: 8 }}>
                  {mainBooking.invoiceUrl ? (
                    <Button
                      size="small"
                      type="default"
                      href={mainBooking.invoiceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Invoice
                    </Button>
                  ) : null}
                  {mainBooking.insuranceUrl ? (
                    <Button
                      size="small"
                      type="default"
                      href={mainBooking.insuranceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Insurance
                    </Button>
                  ) : null}
                </Space>
                {bookings.length > 1 && (
                  <List
                    style={{ marginTop: 12 }}
                    size="small"
                    bordered
                    dataSource={bookings.slice(1)}
                    renderItem={(b) => (
                      <List.Item>
                        <Space direction="vertical" size={2}>
                          <Text strong>{b.customerName || "Booking"}</Text>
                          <Text type="secondary">
                            {b.vehicle || "-"} • {b.mobile || "-"}
                          </Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                )}
              </>
            )}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card
            title={
              <Space align="center" size={6}>
                <span style={{ fontSize: 18 }}>🔧</span>
                <span>Service History</span>
              </Space>
            }
            extra={
              <Space size="small">
                <Button size="small" onClick={handleNewJobcard}>
                  New Jobcard
                </Button>
                <Tag color={services.length ? "blue" : "default"}>
                  {services.length ? `${services.length} found` : "None"}
                </Tag>
              </Space>
            }
            style={{
              borderRadius: 16,
              boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
              border: "none",
              height: "100%",
            }}
            headStyle={{
              fontWeight: 600,
              borderBottom: "1px solid #e5e7eb",
            }}
            bodyStyle={{ padding: 16 }}
          >
            {!services.length ? (
              <Empty description="No service history" />
            ) : (
              <List
                size="small"
                dataSource={serviceTimeline}
                renderItem={(s, idx) => (
                  <List.Item>
                    <div
                      style={{
                        width: "100%",
                        border: "1px solid #e5e7eb",
                        borderRadius: 14,
                        padding: 18,
                        background: "linear-gradient(135deg, #f9fafb 0%, #e5e7eb 100%)",
                        minWidth: 0,
                        boxShadow: "0 6px 16px rgba(15, 23, 42, 0.06)",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                        <Tag color="gold" style={{ fontWeight: 600 }}>
                          {s.createdAt ? s.createdAt.format("DD MMM YYYY") : "-"}
                        </Tag>
                        <Space wrap size={[8, 8]}>
                          <Tag color="geekblue">{ordinal(s.serviceNo || idx + 1)} Service</Tag>
                          {s.serviceType ? <Tag color="cyan">{s.serviceType}</Tag> : null}
                          {s.branch ? <Tag color="purple">{s.branch}</Tag> : null}
                          {s.jcNo ? <Tag color="green">JC #{s.jcNo}</Tag> : null}
                        </Space>
                      </div>
                      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1.2fr 1fr 0.6fr", gap: 10 }}>
                        <div style={{ fontSize: 16, }}>{s.model || s.company || "-"}</div>
                        <div style={{ fontSize: 16 }}>{s.colour || s.color || "-"}</div>
                        <div style={{ fontSize: 16 }}>{s.km ? `${s.km} KM` : "-"}</div>
                      </div>
                      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "center" }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{s.custName || s.customerName || "-"}</div>
                        <div style={{ fontSize: 15 }}>
                          {s.mechanic || "-"}
                          {getMechanicContact(s.mechanic)
                            ? ` • ${getMechanicContact(s.mechanic)}`
                            : ""}
                        </div>
                        <Button
                          key="invoice"
                          size="small"
                          type="primary"
                          ghost
                          onClick={() => handleInvoice(s)}
                        >
                          Service Invoice
                        </Button>
                      </div>
                      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        {s.billLink ? (
                          <Button
                            key="bill"
                            size="small"
                            type="link"
                            href={s.billLink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View Bill
                          </Button>
                        ) : null}
                      </div>
                      {s.remarks ? (
                        <div style={{ marginTop: 6 }}>
                          <Text strong>Remarks:</Text> <Text type="secondary">{s.remarks}</Text>
                        </div>
                      ) : null}
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>

      <PostServiceSheet
        ref={invoiceRef}
        active={invoiceOpen}
        vals={invoiceData?.vals || {}}
        totals={invoiceData?.totals || {}}
      />
    </>
  );
}
