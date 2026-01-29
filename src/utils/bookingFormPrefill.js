const toDigits10 = (value) =>
  String(value || "").replace(/\D/g, "").slice(-10);

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/[,₹\s]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
};

const buildPaymentParts = (payments = []) => {
  const split = [
    { cash: 0, online: 0, ref: undefined },
    { cash: 0, online: 0, ref: undefined },
    { cash: 0, online: 0, ref: undefined },
  ];

  const assign = (payment, idxHint = 0) => {
    if (!payment) return;
    const amount = toNumber(payment.amount);
    if (!amount) return;
    const mode = String(payment.mode || "").toLowerCase();
    const part =
      Number(payment.part) && Number(payment.part) >= 1 && Number(payment.part) <= 3
        ? Number(payment.part) - 1
        : Math.min(Math.max(idxHint, 0), 2);
    if (mode === "online") {
      split[part].online += amount;
      if (!split[part].ref) {
        split[part].ref = payment.reference || payment.utr || payment.ref || "";
      }
    } else {
      split[part].cash += amount;
    }
  };

  payments.forEach((payment, idx) => assign(payment, idx));
  return split;
};

export const buildBookingFormPatch = (payload = {}) => {
  const p = payload || {};
  const vehicle = p.vehicle || {};
  const purchaseMode =
    String(p.purchaseMode || p.purchaseType || "").toLowerCase() || "cash";
  const addressProofTypes = Array.isArray(p.addressProofTypes)
    ? p.addressProofTypes
    : String(p.addressProofTypes || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  let payments = Array.isArray(p.payments) ? p.payments : [];
  const hasPayments =
    Array.isArray(payments) && payments.some((pay) => toNumber(pay?.amount) > 0);
  const parts = buildPaymentParts(payments);
  if (!hasPayments) {
    for (let idx = 0; idx < 3; idx++) {
      const cashKey = `bookingAmount${idx + 1}Cash`;
      const onlineKey = `bookingAmount${idx + 1}Online`;
      parts[idx].cash = parts[idx].cash || toNumber(p[cashKey]);
      parts[idx].online = parts[idx].online || toNumber(p[onlineKey]);
      if (!parts[idx].ref) {
        parts[idx].ref =
          p[`paymentReference${idx + 1}`] ||
          p[`paymentRef${idx + 1}`] ||
          p[`utr${idx + 1}`] ||
          p.utr ||
          undefined;
      }
    }
    parts[0].cash =
      parts[0].cash ||
      toNumber(p.bookingAmount1Cash) ||
      toNumber(p.bookingAmount) ||
      0;
    parts[0].online =
      parts[0].online ||
      toNumber(p.bookingAmount1Online) ||
      (String(p.paymentMode || "").toLowerCase() === "online"
        ? toNumber(p.bookingAmount)
        : 0);
  }

  const patch = {
    executive: p.executive || undefined,
    branch: p.branch || undefined,
    customerName: p.customerName || p.name || "",
    mobileNumber: toDigits10(p.mobileNumber || p.mobile || ""),
    address: p.address || "",
    company: vehicle.company || "",
    bikeModel: vehicle.model || "",
    variant: vehicle.variant || "",
    color: vehicle.color || undefined,
    chassisNo:
      String(vehicle.availability || "").toLowerCase() === "allot"
        ? "__ALLOT__"
        : vehicle.chassisNo || undefined,
    rtoOffice: p.rtoOffice || "KA",
    purchaseType: purchaseMode,
    financier:
      purchaseMode === "loan" ? p.financier || undefined : undefined,
    nohpFinancier:
      purchaseMode === "nohp"
        ? p.financier || p.nohpFinancier || undefined
        : undefined,
    disbursementAmount:
      purchaseMode === "loan" || purchaseMode === "nohp"
        ? toNumber(p.disbursementAmount) || undefined
        : undefined,
    addressProofMode: p.addressProofMode || p.addressProof || "aadhaar",
    addressProofTypes,
    bookingAmount1Cash: parts[0].cash || undefined,
    bookingAmount1Online: parts[0].online || undefined,
    paymentReference1: parts[0].ref || undefined,
    bookingAmount2Cash: parts[1].cash || undefined,
    bookingAmount2Online: parts[1].online || undefined,
    paymentReference2: parts[1].ref || undefined,
    bookingAmount3Cash: parts[2].cash || undefined,
    bookingAmount3Online: parts[2].online || undefined,
    paymentReference3: parts[2].ref || undefined,
    downPayment: toNumber(
      (p.dp && p.dp.downPayment) ?? p.downPayment
    ),
    extraFittingAmount: toNumber(
      (p.dp && p.dp.extraFittingAmount) ?? p.extraFittingAmount
    ),
    affidavitCharges: toNumber(
      (p.dp && p.dp.affidavitCharges) ?? p.affidavitCharges
    ),
  };

  return {
    patch,
    metadata: {
      bookingId: p.bookingId || p.serialNo || undefined,
      mobile: toDigits10(p.mobileNumber || p.mobile || ""),
      vehicle,
    },
  };
};
