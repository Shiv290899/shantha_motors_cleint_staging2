const toDigits10 = (value) =>
  String(value || "").replace(/\D/g, "").slice(-10);

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/[,₹\s]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
};

const parseJsonSafe = (value) => {
  if (!value || typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const read = (obj = {}, keys = []) => {
  for (const key of keys) {
    const val = obj?.[key];
    if (val === undefined || val === null) continue;
    if (typeof val === "string" && val.trim() === "") continue;
    return val;
  }
  return undefined;
};

const normalizeMode = (mode) => {
  const m = String(mode || "").toLowerCase().trim();
  if (m === "cash" || m === "online") return m;
  if (m === "upi" || m === "card" || m === "netbanking" || m === "bank")
    return "online";
  return "";
};

const MIN_PAYMENT_PARTS = 3;
const MAX_PAYMENT_PARTS = 10;

const detectPartCountFromSource = (payments = [], source = {}) => {
  let maxPart = MIN_PAYMENT_PARTS;
  for (let idx = 1; idx <= MAX_PAYMENT_PARTS; idx++) {
    const hasAmt =
      toNumber(read(source, [`bookingAmount${idx}Cash`])) > 0 ||
      toNumber(read(source, [`bookingAmount${idx}Online`])) > 0 ||
      toNumber(read(source, [`bookingAmount${idx}`])) > 0;
    const hasRef = String(read(source, [`paymentReference${idx}`, `paymentRef${idx}`, `utr${idx}`]) || "").trim() !== "";
    if (hasAmt || hasRef) maxPart = idx;
  }
  if (Array.isArray(payments)) {
    payments.forEach((payment) => {
      const part = Number(payment?.part) || 0;
      if (part >= 1 && part <= MAX_PAYMENT_PARTS) maxPart = Math.max(maxPart, part);
    });
  }
  return Math.min(MAX_PAYMENT_PARTS, Math.max(MIN_PAYMENT_PARTS, maxPart));
};

const buildPaymentParts = (payments = [], source = {}) => {
  const partCount = detectPartCountFromSource(payments, source);
  const split = Array.from({ length: partCount }, () => ({
    cash: 0,
    online: 0,
    ref: undefined,
  }));

  const assign = (payment, idxHint = 0) => {
    if (!payment) return;
    const amount = toNumber(payment.amount);
    if (!amount) return;
    const mode = normalizeMode(payment.mode) || "cash";
    const part =
      Number(payment.part) && Number(payment.part) >= 1 && Number(payment.part) <= MAX_PAYMENT_PARTS
        ? Number(payment.part) - 1
        : Math.min(Math.max(idxHint, 0), partCount - 1);
    if (mode === "online") {
      split[part].online += amount;
      if (!split[part].ref) {
        split[part].ref =
          payment.reference || payment.utr || payment.ref || payment.txnId || "";
      }
    } else {
      split[part].cash += amount;
    }
  };

  payments.forEach((payment, idx) => assign(payment, idx));

  for (let idx = 0; idx < partCount; idx++) {
    const cashKey = `bookingAmount${idx + 1}Cash`;
    const onlineKey = `bookingAmount${idx + 1}Online`;
    split[idx].cash = split[idx].cash || toNumber(read(source, [cashKey]));
    split[idx].online = split[idx].online || toNumber(read(source, [onlineKey]));
    if (!split[idx].ref) {
      split[idx].ref =
        read(source, [
          `paymentReference${idx + 1}`,
          `paymentRef${idx + 1}`,
          `utr${idx + 1}`,
        ]) ||
        undefined;
    }
    const legacyAmount = toNumber(read(source, [`bookingAmount${idx + 1}`]));
    const legacyMode = normalizeMode(read(source, [`paymentMode${idx + 1}`]));
    if (!split[idx].cash && !split[idx].online && legacyAmount) {
      if (legacyMode === "online") split[idx].online = legacyAmount;
      else split[idx].cash = legacyAmount;
    }
  }

  if (!split[0].cash && !split[0].online) {
    const bookingAmount = toNumber(
      read(source, ["bookingAmount", "Booking Amount", "Booking_Amount"])
    );
    const paymentMode = normalizeMode(
      read(source, ["paymentMode", "Payment Mode", "Purchase Mode", "purchaseMode"])
    );
    if (bookingAmount > 0) {
      if (paymentMode === "online") split[0].online = bookingAmount;
      else split[0].cash = bookingAmount;
    }
  }

  return split;
};

const parseAddressProofTypes = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

export const buildBookingFormPatch = (payload = {}) => {
  const row = payload && typeof payload === "object" ? payload : {};
  const nestedRaw = parseJsonSafe(read(row, ["rawPayload", "Raw Payload"]));
  const source = { ...nestedRaw, ...row };
  const rawVehicle =
    nestedRaw.vehicle && typeof nestedRaw.vehicle === "object" ? nestedRaw.vehicle : {};
  const rowVehicle =
    row.vehicle && typeof row.vehicle === "object" ? row.vehicle : {};
  const vehicle = { ...rawVehicle, ...rowVehicle };

  const purchaseMode = String(
    read(source, ["purchaseMode", "purchaseType", "Purchase Mode"]) || "cash"
  ).toLowerCase();
  const addressProofTypes = parseAddressProofTypes(
    read(source, ["addressProofTypes", "Address Proof Types"])
  );

  const payments = Array.isArray(source.payments) ? source.payments : [];
  const parts = buildPaymentParts(payments, source);

  const financier = read(source, ["financier", "Financier"]) || undefined;
  const nohpFinancier = read(source, ["nohpFinancier"]) || financier || undefined;

  const patch = {
    executive: read(source, ["executive", "Executive"]) || undefined,
    branch: read(source, ["branch", "Branch"]) || undefined,
    customerName: read(source, ["customerName", "name", "Customer Name"]) || "",
    mobileNumber: toDigits10(
      read(source, ["mobileNumber", "mobile", "Mobile Number"]) || ""
    ),
    address: read(source, ["address", "Address"]) || "",
    company: read(source, ["company", "Company", "Company Name", "brand"]) || vehicle.company || "",
    bikeModel: read(source, ["bikeModel", "model", "Model"]) || vehicle.model || "",
    variant: read(source, ["variant", "Variant"]) || vehicle.variant || "",
    color:
      read(source, ["color", "colour", "Color", "Colour"]) ||
      vehicle.color ||
      undefined,
    chassisNo:
      String(vehicle.availability || "").toLowerCase() === "allot"
        ? "__ALLOT__"
        : read(source, ["chassisNo", "Chassis Number"]) || vehicle.chassisNo || undefined,
    rtoOffice: read(source, ["rtoOffice", "RTO Office"]) || "KA",
    purchaseType: purchaseMode,
    financier: purchaseMode === "loan" ? financier : undefined,
    nohpFinancier: purchaseMode === "nohp" ? nohpFinancier : undefined,
    disbursementAmount:
      purchaseMode === "loan" || purchaseMode === "nohp"
        ? toNumber(
            read(source, ["disbursementAmount", "Disbursement Amount"]) ||
              read(source, ["loanDisbursementAmount"])
          ) || undefined
        : undefined,
    emiAmount:
      purchaseMode === "loan" || purchaseMode === "nohp"
        ? toNumber(read(source, ["emiAmount", "EMI Amount"])) || undefined
        : undefined,
    tenure:
      purchaseMode === "loan" || purchaseMode === "nohp"
        ? toNumber(read(source, ["tenure", "tenureMonths", "Tenure", "Tenure Months"])) ||
          undefined
        : undefined,
    addressProofMode:
      read(source, ["addressProofMode", "addressProof", "Address Proof Mode"]) ||
      "aadhaar",
    addressProofTypes,
    downPayment: toNumber(
      read(source, ["downPayment"]) ?? read(source, ["dp"])?.downPayment
    ),
    extraFittingAmount: toNumber(
      read(source, ["extraFittingAmount"]) ?? read(source, ["dp"])?.extraFittingAmount
    ),
    affidavitCharges: toNumber(
      read(source, ["affidavitCharges"]) ?? read(source, ["dp"])?.affidavitCharges
    ),
    discountAmount: toNumber(
      read(source, ["discountAmount"]) ?? read(source, ["dp"])?.discountAmount
    ),
  };
  parts.forEach((part, idx) => {
    const key = idx + 1;
    patch[`bookingAmount${key}Cash`] = part.cash || undefined;
    patch[`bookingAmount${key}Online`] = part.online || undefined;
    patch[`paymentReference${key}`] = part.ref || undefined;
  });

  return {
    patch,
    metadata: {
      bookingId: read(source, ["bookingId", "Booking ID", "serialNo"]) || undefined,
      mobile: toDigits10(read(source, ["mobileNumber", "mobile", "Mobile Number"]) || ""),
      vehicle,
      paymentCount: parts.length,
    },
  };
};
