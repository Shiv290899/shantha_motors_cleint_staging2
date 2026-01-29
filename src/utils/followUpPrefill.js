const KEY = "FollowUps:BookingFormPrefill";

const isStorageAvailable = () =>
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

const sanitizePayload = (payload) => {
  if (!payload || typeof payload !== "object") return payload;
  const { rawPayload: _rawPayload, files: _files, documents: _documents, attachments: _attachments, file: _file, ...rest } = payload;
  const clone = { ...rest };
  if (payload.vehicle && typeof payload.vehicle === "object") {
    clone.vehicle = { ...payload.vehicle };
  }
  if (Array.isArray(payload.payments)) {
    clone.payments = payload.payments.map((pay) => ({
      amount: pay?.amount,
      mode: pay?.mode,
      reference: pay?.reference || pay?.utr || pay?.ref || undefined,
      part: pay?.part,
    }));
  }
  return clone;
};

const sanitizeValues = (values) => {
  if (!values || typeof values !== "object") return {};
  const pick = (keyVariants) =>
    keyVariants
      .map((key) => values?.[key])
      .find((value) => value !== undefined && value !== null);
  return {
    bookingAmount: pick(["Booking Amount", "Booking_Amount", "bookingAmount"]),
    collectedAmount: pick(["Collected Amount", "Collected_Amount", "CollectedAmount", "Amount"]),
  };
};

export const saveFollowUpBookingPrefill = (entry) => {
  if (!isStorageAvailable()) return;
  try {
    const payload = sanitizePayload(entry?.payload);
    const values = sanitizeValues(entry?.values);
    const stored = {
      payload,
      values,
      metadata: {
        bookingId: entry?.bookingId,
        mobile: entry?.mobile,
        serialNo: entry?.serialNo,
      },
    };
    window.sessionStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // ignore storage errors
  }
};

export const consumeFollowUpBookingPrefill = () => {
  if (!isStorageAvailable()) return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
