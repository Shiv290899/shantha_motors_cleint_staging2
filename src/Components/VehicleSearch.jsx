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
  Modal,
  Radio,
  Row,
  Space,
  Tag,
  Typography,
  message,
  Grid,
} from "antd";
import dayjs from "dayjs";
import { saveBookingViaWebhook, saveJobcardViaWebhook } from "../apiCalls/forms";
import PostServiceSheet from "./PostServiceSheet";
import { handleSmartPrint } from "../utils/printUtils";
import { exportToCsv } from "../utils/csvExport";

const { Text } = Typography;

const DEFAULT_BOOKING_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwSn5hp1cSWlJMGhe2cYUtid2Ruqh9H13mZbq0PwBpYB0lMLufZbIjZ5zioqtKgE_0sNA/exec";
const DEFAULT_JOBCARD_GAS_URL =
  "https://script.google.com/macros/s/AKfycbxwuwETUUiAoFyksSoEOHVimCtlIZYb6JTQ7yJ8-vkwth9xYwEOlMA8ktiE45UQ6VA3Lg/exec";
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
  const cleanLink = (val) => {
    const next = String(val || "").trim();
    return next || null;
  };
  const attachments =
    (Array.isArray(p.attachments) ? p.attachments : []) ||
    (Array.isArray(p.files) ? p.files : []);
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
    null;
  const attachmentUrls = attachments
    .map((a) => cleanLink(a?.url || a?.fileId))
    .filter(Boolean);
  const docsUrl =
    attachmentUrls.find(
      (u) =>
        u !== cleanLink(invoiceUrl) &&
        u !== cleanLink(insuranceUrl)
    ) ||
    cleanLink(p.file?.url) ||
    cleanLink(p.file?.fileId) ||
    null;
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
    regNo:
      p.regNo ||
      p.vehicleNo ||
      p.registrationNumber ||
      p["Vehicle No"] ||
      p["Vehicle_No"] ||
      p["Registration Number"] ||
      p.RegNo ||
      vTop["Vehicle No"] ||
      vTop["Vehicle_No"] ||
      vTop["vehicleNo"] ||
      vTop["Reg No"] ||
      vTop["RegNo"] ||
      vTop["Registration Number"] ||
      v.regNo ||
      v.vehicleNo ||
      v.registrationNumber ||
      "",
    company: v.company || "",
    model: v.model || "",
    variant: v.variant || "",
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
    docsUrl,
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
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const navigate = useNavigate();
  const [mode, setMode] = useState("vehicle"); // mobile | vehicle
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [error, setError] = useState("");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const [docPreview, setDocPreview] = useState({ open: false, url: "", title: "", mobile: "" });
  const invoiceRef = useRef(null);
  const activeSearchRef = useRef(0);

  const toPreviewUrl = (url) => {
    const raw = String(url || "").trim();
    if (!raw) return "";
    const driveMatch = raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch?.[1]) return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    const ucMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (raw.includes("drive.google.com") && ucMatch?.[1]) {
      return `https://drive.google.com/file/d/${ucMatch[1]}/preview`;
    }
    return raw;
  };

  const extractDriveFileId = (url) => {
    const raw = String(url || "").trim();
    if (!raw) return "";
    const dMatch = raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (dMatch?.[1]) return dMatch[1];
    const idMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return idMatch?.[1] || "";
  };

  const toDownloadUrl = (url) => {
    const raw = String(url || "").trim();
    const fileId = extractDriveFileId(raw);
    if (fileId) return `https://drive.google.com/uc?export=download&id=${fileId}`;
    return raw;
  };

  const openDocPreview = (title, url, mobile = "") => {
    const next = String(url || "").trim();
    if (!next) return;
    setDocPreview({ open: true, title, url: next, mobile: String(mobile || "") });
  };

  const handlePreviewPrint = () => {
    const previewUrl = toPreviewUrl(docPreview.url);
    if (!previewUrl) return;
    const w = window.open(previewUrl, "_blank", "noopener,noreferrer");
    if (!w) {
      message.warning("Allow pop-ups to print this file.");
      return;
    }
    try {
      w.focus();
      setTimeout(() => {
        try { w.print(); } catch { /* ignore cross-origin */ }
      }, 900);
    } catch {
      // noop
    }
  };

  const handlePreviewDownload = () => {
    const dlUrl = toDownloadUrl(docPreview.url);
    if (!dlUrl) return;
    window.open(dlUrl, "_blank", "noopener,noreferrer");
  };

  const handleCopyDocLink = async () => {
    const raw = String(docPreview.url || "").trim();
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      message.success("Link copied.");
    } catch {
      message.error("Could not copy link.");
    }
  };

  const handleWhatsAppShare = () => {
    const rawUrl = String(docPreview.url || "").trim();
    if (!rawUrl) return;
    const digits = String(docPreview.mobile || "").replace(/\D/g, "");
    if (!digits || digits.length < 10) {
      message.warning("Customer mobile number is not available for WhatsApp.");
      return;
    }
    const waNumber = digits.length === 10 ? `91${digits}` : digits;
    const msg = `${docPreview.title || "Document"}\n${rawUrl}`;
    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

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
    setBookings([]);
    setServices([]);
    const searchId = Date.now();
    activeSearchRef.current = searchId;
    try {
      const searchQuery = mode === "mobile" ? normalizeMobile(q) || q : normalizeReg(q);
      const isActiveSearch = () => activeSearchRef.current === searchId;
      const dedupeServices = (list = []) => {
        const seen = new Set();
        return list.filter((s) => {
          const key = [
            String(s.jcNo || "").trim(),
            String(s.regNo || "").trim(),
            String(s.mobile || "").trim(),
            s.createdAt?.valueOf?.() || "",
          ].join("|");
          if (!key) return true;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };
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
        let best = [];
        if (!BOOKING_GAS_URL) return;
        if (!(mode === "mobile" || isMobileLike(q) || q.toUpperCase().startsWith("BK-") || mode === "vehicle")) return;
        const payload = (() => {
          if (q.toUpperCase().startsWith("BK-")) return { action: "search", mode: "booking", query: q.toUpperCase() };
          if (mode === "vehicle" && !isMobileLike(q)) return { action: "search", mode: "vehicle", query: normalizeReg(q) };
          return { action: "search", mode: "mobile", query: normalizeMobile(q) || q };
        })();
        if (BOOKING_SECRET) payload.secret = BOOKING_SECRET;
        let rendered = false;
        const runBookingCall = async (method) => {
          try {
            const rows = await fetchBookings(payload, method);
            const mapped = rows.map((r) => parseBookingRow(r));
            if (mapped.length && !rendered && isActiveSearch()) {
              rendered = true;
              best = mapped;
              setBookings(mapped);
            }
            return mapped;
          } catch (e) {
            console.warn(`Booking search ${method} failed`, e);
            return [];
          }
        };
        const results = await Promise.allSettled([
          runBookingCall("GET"),
          runBookingCall("POST"),
        ]);
        if (!best.length) {
          const merged = results.flatMap((r) =>
            r.status === "fulfilled" && Array.isArray(r.value) ? r.value : []
          );
          if (merged.length && isActiveSearch()) {
            best = merged;
            setBookings(merged);
          }
        }
        return best;
      })();

      const servicesPromise = (async () => {
        let best = [];
        if (!JOBCARD_GAS_URL) return;
        const jobModes = mode === "vehicle" && !isMobileLike(q) ? ["reg", "vehicle"] : ["mobile", "reg"];
        let rendered = false;
        const maybeRenderServices = (rows = []) => {
          const mapped = dedupeServices(rows.map((r) => parseJobRow(r)));
          if (mapped.length && !rendered && isActiveSearch()) {
            rendered = true;
            best = mapped;
            setServices(mapped);
          }
          return mapped;
        };
        const serviceCalls = [];
        const addServiceCall = (method, payload, label) => {
          serviceCalls.push(
            saveJobcardViaWebhook({
              webhookUrl: JOBCARD_GAS_URL,
              method,
              payload,
            })
              .then((resp) => {
                const js = resp?.data || resp;
                const rows = Array.isArray(js?.rows) ? js.rows : [];
                maybeRenderServices(rows);
                return { label, rows };
              })
              .catch((e) => {
                console.warn(`Service call failed: ${label}`, e);
                return { label, rows: [] };
              })
          );
        };

        const historyPayload = GAS_SECRET
          ? { action: "getServiceHistory", query: searchQuery, mode, secret: GAS_SECRET }
          : { action: "getServiceHistory", query: searchQuery, mode };
        addServiceCall("GET", historyPayload, "history-get");
        addServiceCall("POST", historyPayload, "history-post");

        jobModes.forEach((m) => {
          const payload = GAS_SECRET
            ? { action: "search", mode: m, query: searchQuery, secret: GAS_SECRET }
            : { action: "search", mode: m, query: searchQuery };
          addServiceCall("GET", payload, `search-${m}-get`);
          addServiceCall("POST", payload, `search-${m}-post`);
        });

        const settled = await Promise.allSettled(serviceCalls);
        if (!best.length) {
          const merged = settled.flatMap((r) =>
            r.status === "fulfilled" && Array.isArray(r.value?.rows) ? r.value.rows : []
          );
          const mapped = maybeRenderServices(merged);
          if (mapped.length) best = mapped;
        }
        return best;
      })();

      const [bookingSettled, servicesSettled] = await Promise.allSettled([bookingPromise, servicesPromise]);
      const nextBookings = bookingSettled.status === "fulfilled" && Array.isArray(bookingSettled.value) ? bookingSettled.value : [];
      const nextServices = servicesSettled.status === "fulfilled" && Array.isArray(servicesSettled.value) ? servicesSettled.value : [];

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
            const fallbackBookings = rows.map((r) => parseBookingRow(r));
            if (fallbackBookings.length && isActiveSearch()) {
              setBookings(fallbackBookings);
            }
          } catch (e) {
            console.warn("Fallback booking-by-mobile failed", e);
          }
        }
      }

      if (isActiveSearch() && !nextBookings.length && !nextServices.length) {
        setBookings([]);
        setServices([]);
        setError("No records found. Check the number and try again.");
      }
    } finally {
      if (activeSearchRef.current === searchId) setLoading(false);
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
            ? mainBooking.createdAt.format("DD-MM-YYYY HH:mm")
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
    const parseVehicleText = (text) => {
      const raw = String(text || "").trim();
      if (!raw) return { company: "", model: "" };
      const parts = raw.split(/\s+/).filter(Boolean);
      if (!parts.length) return { company: "", model: "" };
      const company = parts[0];
      const model = parts.length > 1 ? parts.slice(1).join(" ") : raw;
      return { company, model };
    };
    const parsedVehicle = parseVehicleText(source.vehicle);
    const fallbackBooking = mainBooking || {};
    const params = new URLSearchParams();
    const regNoRaw =
      source.regNo ||
      source.vehicleNo ||
      source.registrationNumber ||
      source.chassis ||
      fallbackBooking.regNo ||
      fallbackBooking.vehicleNo ||
      fallbackBooking.registrationNumber ||
      fallbackBooking.chassis ||
      "";
    const vehicleLike = normalizeReg(source.vehicle || fallbackBooking.vehicle || "");
    const searchedVehicle = normalizeReg(query || "");
    const regNo = (mode === "vehicle" && VEHICLE_FULL_RX.test(searchedVehicle))
      ? searchedVehicle
      : VEHICLE_FULL_RX.test(normalizeReg(regNoRaw))
      ? normalizeReg(regNoRaw)
      : (VEHICLE_FULL_RX.test(vehicleLike) ? vehicleLike : "");
    const company =
      source.company ||
      fallbackBooking.company ||
      parsedVehicle.company ||
      "";
    const model =
      source.model ||
      fallbackBooking.model ||
      parsedVehicle.model ||
      source.company ||
      source.vehicle ||
      "";
    const colour = source.colour || source.color || source.colour || "";
    const custName = source.custName || source.customerName || "";
    const mobileVal = source.mobile || source.custMobile || "";
    if (regNo) params.set("regNo", regNo);
    if (company) params.set("company", company);
    if (model) params.set("model", model);
    if (colour) params.set("colour", colour);
    if (custName) params.set("custName", custName);
    if (mobileVal) params.set("custMobile", mobileVal);
    return params.toString();
  }, [serviceTimeline, mainBooking, mode, query]);

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

  const handleExportCsv = () => {
    const fmt = (v) => {
      const d = dayjs(v);
      return d.isValid() ? d.format("DD-MM-YYYY HH:mm") : "";
    };
    const rowsForCsv = [];
    bookings.forEach((b, idx) => {
      rowsForCsv.push({
        type: "Booking",
        ref: b.id || `booking-${idx + 1}`,
        customer: b.customerName,
        mobile: b.mobile,
        vehicle: b.vehicle,
        color: b.color,
        chassis: b.chassis,
        branch: b.branch,
        createdAt: fmt(b.createdAt),
      });
    });
    serviceTimeline.forEach((s, idx) => {
      rowsForCsv.push({
        type: "Service",
        ref: s.jcNo || `service-${idx + 1}`,
        customer: s.custName || s.customerName,
        mobile: s.mobile,
        vehicle: s.model || s.company,
        color: s.colour || s.color,
        chassis: s.regNo,
        branch: s.branch,
        createdAt: fmt(s.createdAt),
      });
    });
    if (!rowsForCsv.length) {
      message.info("No search results to export");
      return;
    }
    const headers = [
      { key: "type", label: "Type" },
      { key: "ref", label: "Reference" },
      { key: "customer", label: "Customer" },
      { key: "mobile", label: "Mobile" },
      { key: "vehicle", label: "Vehicle" },
      { key: "color", label: "Color" },
      { key: "chassis", label: "Chassis / Reg No" },
      { key: "branch", label: "Branch" },
      { key: "createdAt", label: "Created At" },
    ];
    exportToCsv({ filename: "vehicle-search.csv", headers, rows: rowsForCsv });
    message.success(`Exported ${rowsForCsv.length} records`);
  };

  return (
    <>
    <div
      style={{
        padding: isMobile ? 12 : 24,
        maxWidth: 1200,
        margin: isMobile ? "12px auto" : "24px auto",
        borderRadius: isMobile ? 16 : 24,
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
            <Button
              size="small"
              onClick={handleExportCsv}
              disabled={!bookings.length && !services.length}
            >
              Export CSV
            </Button>
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
        bodyStyle={{ padding: isMobile ? 12 : 16, paddingBottom: isMobile ? 10 : 12 }}
        style={{
          borderRadius: isMobile ? 16 : 20,
          boxShadow: "0 18px 45px rgba(15, 23, 42, 0.25)",
          border: "1px solid rgba(148, 163, 184, 0.3)",
          overflow: "hidden",
        }}
        headStyle={{
          background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 60%, #22c55e 100%)",
          color: "#ffffff",
          borderBottom: "none",
          fontSize: isMobile ? 16 : 18,
          fontWeight: 700,
          letterSpacing: 0.4,
        }}
      >
        <Space.Compact style={{ width: "100%" }}>
          <Input
            size={isMobile ? "middle" : "large"}
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
            size={isMobile ? "middle" : "large"}
            loading={loading}
            onClick={runSearch}
            style={{
              borderRadius: 999,
              paddingInline: isMobile ? 18 : 28,
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
                      onClick={() => openDocPreview("Invoice Preview", mainBooking.invoiceUrl, mainBooking.mobile)}
                    >
                      Invoice
                    </Button>
                  ) : null}
                  {mainBooking.insuranceUrl ? (
                    <Button
                      size="small"
                      type="default"
                      onClick={() => openDocPreview("Insurance Preview", mainBooking.insuranceUrl, mainBooking.mobile)}
                    >
                      Insurance
                    </Button>
                  ) : null}
                  {mainBooking.docsUrl ? (
                    <Button
                      size="small"
                      type="default"
                      onClick={() => openDocPreview("Docs Preview", mainBooking.docsUrl, mainBooking.mobile)}
                    >
                      Docs
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
                          {s.createdAt ? s.createdAt.format("DD-MM-YYYY HH:mm") : "-"}
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
      <Modal
        open={docPreview.open}
        title={docPreview.title || "Document Preview"}
        width={isMobile ? "96vw" : 1000}
        onCancel={() => setDocPreview({ open: false, url: "", title: "", mobile: "" })}
        footer={[
          <Button key="whatsapp" type="primary" ghost onClick={handleWhatsAppShare}>
            WhatsApp
          </Button>,
          <Button key="copy-link" onClick={handleCopyDocLink}>
            Copy Link
          </Button>,
          <Button key="download" onClick={handlePreviewDownload}>
            Download
          </Button>,
          <Button key="print" onClick={handlePreviewPrint}>
            Print
          </Button>,
          <Button
            key="new-tab"
            type="primary"
            onClick={() => window.open(docPreview.url, "_blank", "noopener,noreferrer")}
          >
            Open in new tab
          </Button>,
          <Button key="close" onClick={() => setDocPreview({ open: false, url: "", title: "", mobile: "" })}>
            Close
          </Button>,
        ]}
      >
        {docPreview.url ? (
          <iframe
            title={docPreview.title || "Document Preview"}
            src={toPreviewUrl(docPreview.url)}
            style={{
              width: "100%",
              height: isMobile ? "62vh" : "70vh",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
            }}
          />
        ) : (
          <Empty description="No document URL available" />
        )}
      </Modal>
    </>
  );
}
