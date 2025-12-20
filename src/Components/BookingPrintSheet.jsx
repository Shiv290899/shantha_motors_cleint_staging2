// components/BookingPrintSheet.jsx
import React, { forwardRef } from "react";
import { fmtDate, inr } from "../utils/printUtils";

/**
 * Printable A4 booking slip for vehicle bookings.
 *
 * Usage (inside a parent like BookingForm):
 *   const ref = useRef(null);
 *   <BookingPrintSheet ref={ref} active vals={valsForPrint} />
 *   handleSmartPrint(ref.current)
 *
 * Shows a concise booking slip including customer, vehicle and a payment
 * breakdown (cash/online with ref). One-page A4. Labels with inline values.
 */
const BookingPrintSheet = forwardRef(function BookingPrintSheet({ active = true, vals = {} }, ref) {
  // Normalize brand by branch (Byadarahalli => NH Motors)
  const branchRaw = String(vals?.branch || "").trim();
  const branch = branchRaw;
  const branchKey = branchRaw.toLowerCase();
  const isNH = branchKey === "byadarahalli";

  // Customer
  const custName =
    vals?.customerName ||
    vals?.name ||
    `${vals?.firstName || ""} ${vals?.lastName || ""}`.trim() ||
    "-";
  const mobile = vals?.mobileNumber || vals?.mobile || vals?.phone || "-";
  const address =
    vals?.address ||
    vals?.addressLine ||
    [vals?.addressLine1, vals?.addressLine2, vals?.city, vals?.pincode]
      .filter(Boolean)
      .join(", ") ||
    "-";

  // Vehicle
  const v = vals?.vehicle || {};
  const company = v?.company || vals?.company || vals?.make || "";
  const model = v?.model || vals?.bikeModel || vals?.modelName || "";
  const variant = v?.variant || vals?.variantName || vals?.trim || "";
  const color = v?.color || vals?.vehicleColor || "";
  const avail = v?.availability || vals?.availability || vals?.chassisStatus || ""; // 'allot'|'found'|'not_found'|...
  const chassisNo = v?.chassisNo || vals?.chassisNo || (avail === "allot" ? "To be allotted" : "-");

  // Purchase mode (accept various keys)
  const rawPurchaseMode =
    vals?.purchaseMode || vals?.purchaseType || vals?.paymentType || "-"; // 'hp'|'loan'|'cash'|'nohp'
  const purchaseMode = String(rawPurchaseMode || "-").toLowerCase();

  // Financier (map several possible keys)
  const financier =
    vals?.financierName ||
    vals?.financier ||
    vals?.hpFinancier ||
    vals?.nohpFinancier ||
    vals?.selectedFinancier ||
    "";

  // RTO
  const rtoOffice = vals?.rtoOffice || vals?.rto || vals?.rtoOfficeName || vals?.rtoCode || "";

  // Payment summary (accepts newer split + legacy fields)
  const num = (v) => {
    const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const payments = (() => {
    const rows = [];
    const pushPay = (part, mode, amount, reference) => {
      const amt = num(amount);
      if (!amt) return;
      rows.push({
        part: part ? `Part ${part}` : "",
        mode: String(mode || "").toLowerCase() === "online" ? "Online" : "Cash",
        amount: amt,
        reference: reference || "",
      });
    };

    if (Array.isArray(vals?.payments) && vals.payments.length) {
      vals.payments.forEach((p, idx) =>
        pushPay(
          p?.part || idx + 1,
          p?.mode || p?.paymentMode,
          p?.amount ?? p?.total ?? p?.value,
          p?.reference || p?.ref || p?.utr || p?.refNo
        )
      );
    } else if (Array.isArray(vals?.paymentSplit) && vals.paymentSplit.length) {
      vals.paymentSplit.forEach((p) => {
        pushPay(p?.part, "Cash", p?.cash);
        pushPay(p?.part, "Online", p?.online, p?.reference || p?.ref || p?.utr);
      });
    } else {
      [1, 2, 3].forEach((idx) => {
        const cash = num(vals?.[`bookingAmount${idx}Cash`]);
        const online = num(vals?.[`bookingAmount${idx}Online`]);
        const legacyAmount = num(vals?.[`bookingAmount${idx}`]);
        const mode = String(vals?.[`paymentMode${idx}`] || "").toLowerCase();
        const ref =
          vals?.[`paymentReference${idx}`] ||
          vals?.[`paymentRef${idx}`] ||
          vals?.[`utr${idx}`] ||
          vals?.utr;

        if (!cash && !online && legacyAmount) {
          if (mode === "online") pushPay(idx, "Online", legacyAmount, ref);
          else pushPay(idx, "Cash", legacyAmount);
        } else {
          if (cash) pushPay(idx, "Cash", cash);
          if (online) pushPay(idx, "Online", online, ref);
        }
      });
    }
    return rows;
  })();

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  // Meta
  const executive = vals?.executive || vals?.salesExecutive || vals?.salesperson || "-";
  const createdAt = vals?.createdAt || vals?.ts || new Date();

  // Pretty label for purchaseMode
  const purchaseModeLabel = (() => {
    if (["hp", "loan"].includes(purchaseMode)) return "HP (Loan)";
    if (["nohp", "self", "self-funded", "selffunded"].includes(purchaseMode))
      return "No Hypothecation";
    if (purchaseMode === "cash") return "Cash";
    return String(rawPurchaseMode || "-").toUpperCase();
  })();
  const showFinancier = ["loan", "hp", "nohp"].includes(purchaseMode);

  return (
    <div ref={ref} className={`print-sheet ${active ? "active" : ""}`}>
      <style>{`
/* =========================
   PRINT BASELINE (A4)
   ========================= */
@page { size: A4 portrait; margin: 0; }
html, body {
  margin: 0 !important;
  padding: 0 !important;
  background: #fff !important;
  -webkit-print-color-adjust: exact !important; /* helps keep intended colors */
  print-color-adjust: exact !important;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, Helvetica, sans-serif;
}
img { max-width: 100%; height: auto; background: transparent; }

/* Hide inside main app screens; visible in dedicated print doc or when printing */
@media screen {
  body:not(.print-host) .print-sheet { display: none !important; }
}

/* Scope print to only the active sheet and avoid blank extra pages */
@media print {
  body * { visibility: hidden !important; }
  .print-sheet { display: block; }
  .print-sheet.active,
  .print-sheet.active * { visibility: visible !important; }
  .print-sheet:not(.active) { display: none !important; }
  .print-sheet.active { position: absolute; inset: 0; width: 100%; }

  /* Keep large blocks together on one page */
  .bk-a4, .wrap, .box, .hdr, .grid, .grid-3, .sign-row { break-inside: avoid; page-break-inside: avoid; }
}

/* =========================
   COMPONENT STYLES
   ========================= */
.bk-a4 { display: block; }
.wrap { padding: 7mm; color: #000; }
.box { border: 1px solid #111; border-radius: 1mm; padding: 3mm; }

.title { text-align: center; font-size: 16.5pt; font-weight: 800; margin: 1.5mm 0 2.5mm; letter-spacing: 0.4px; }
.hdr { display: grid; grid-template-columns: 26mm 1fr 26mm; align-items: center; gap: 3mm; }
.shop { text-align: center; }
.shop .en { font-size: 14.5pt; font-weight: 600; line-height: 1.08; }
.shop .sub { font-size: 9.5pt; margin-top: 1mm; }
.tiny { font-size: 9px; }
.label { font-weight: 600; }

/* Label–value INLINE layout (no stacking) */
.kv {
  display: grid;
  grid-template-columns: 38mm 1fr; /* label width | flexible value */
  align-items: center;
  column-gap: 2mm;
  padding: 1mm 0;
  border: none;
  border-bottom: 1px solid #e5e7eb; /* light divider */
}
.kv .name { color: #111; }
.kv .val { font-weight: 600; white-space: pre-line; }

.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; margin-top: 2mm; }
.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2mm; margin-top: 2mm; }
.full { grid-column: 1 / -1; }
.pay-table { width: 100%; border-collapse: collapse; margin-top: 2mm; font-size: 11pt; }
.pay-table th, .pay-table td { border: 1px solid #d1d5db; padding: 2mm 2.5mm; text-align: left; }
.pay-table th { background: #f3f4f6; }

.sign-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-top: 6mm; }
.sign { border-top: 1px dashed #777; padding-top: 2mm; text-align: center; }

.note { margin-top: 3mm; font-size: 10.5pt; }
.note-title { font-weight: 700; margin-bottom: 2mm; }
.note ol { margin: 0; padding-left: 4mm; }
      `}</style>

      <div className="bk-a4">
        <div className="wrap">
          <div className="box">
            <div className="hdr">
              <img
                src={isNH ? "/honda-logo.png" : "/shantha-logoprint.jpg"}
                alt={isNH ? "NH Motors" : "Shantha Motors"}
                style={{ width: "100%", maxHeight: 92 }}
              />
              <div className="shop">
                {isNH ? (
                  <>
                    <div className="en">NH MOTORS | ಎನ್ ಎಚ್ ಮೋಟರ್ಸ್</div>
                    <div className="sub" style={{ marginTop: 4 }}>
                      Site No. 116/1, Bydarahalli, Magadi Main Road, Opp.<br />
                      HP Petrol Bunk, Bangalore - 560091
                    </div>
                    <div className="sub">Mob: 9731366921 / 8073283502 / 9741609799</div>
                  </>
                ) : (
                  <>
                    <div className="en">SHANTHA MOTORS | ಶಾಂತ ಮೋಟರ್ಸ್</div>
                    <div className="sub">Multi Brand Two Wheeler Sales &amp; Service</div>
                    <div className="sub">Mob No : 9731366921 / 8073283502</div>
                    <div className="tiny">Kadabagere • Muddinapalya  • Andrahalli • Tavarekere • Hegganahalli • Channenahalli • Nelagadrahalli</div>
                  </>
                )}
              </div>
              <div>
                <img src="/location-qr.png" alt="Location QR" style={{ width: "100%", maxHeight: 92 }} />
                <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 4 }}>Scan for Location</div>
              </div>
            </div>

            <div className="title">Vehicle Booking Form</div>

            {/* Top identifiers (no Payment Mode/UTR) */}
            <div className="grid-3">
              <div className="kv">
                <div className="name"><span className="label">Date:</span></div>
                <div className="val">{fmtDate(createdAt)}</div>
              </div>
              <div className="kv">
                <div className="name"><span className="label">Branch:</span></div>
                <div className="val">{branch || "-"}</div>
              </div>
              <div className="kv">
                <div className="name"><span className="label">Executive:</span></div>
                <div className="val">{executive}</div>
              </div>
            </div>

            {/* Customer */}
            <div className="grid">
              <div className="kv full">
                <div className="name"><span className="label">Customer Name:</span></div>
                <div className="val">{custName}</div>
              </div>
              <div className="kv">
                <div className="name"><span className="label">Mobile:</span></div>
                <div className="val">{mobile}</div>
              </div>
              <div className="kv">
                <div className="name"><span className="label">RTO Office:</span></div>
                <div className="val">{rtoOffice || "-"}</div>
              </div>
              <div className="kv full">
                <div className="name"><span className="label">Address:</span></div>
                <div className="val">{address}</div>
              </div>
            </div>

            {/* Vehicle */}
            <div className="grid">
              <div className="kv">
                <div className="name"><span className="label">Company:</span></div>
                <div className="val">{company || "-"}</div>
              </div>
              <div className="kv">
                <div className="name"><span className="label">Model:</span></div>
                <div className="val">{model || "-"}</div>
              </div>
              <div className="kv">
                <div className="name"><span className="label">Variant:</span></div>
                <div className="val">{variant || "-"}</div>
              </div>
              <div className="kv">
                <div className="name"><span className="label">Color:</span></div>
                <div className="val">{color || "-"}</div>
              </div>
              <div className="kv full">
                <div className="name"><span className="label">Chassis No:</span></div>
                <div className="val">{chassisNo || "-"}</div>
              </div>
            </div>

            {/* Mode */}
            <div className="grid">
              <div className="kv">
                <div className="name"><span className="label">Purchase Mode:</span></div>
                <div className="val">{purchaseModeLabel}</div>
              </div>

              {/* Show Financier for Loan/HP and No HP */}
              {showFinancier && (
                <div className="kv">
                  <div className="name"><span className="label">Financier:</span></div>
                  <div className="val">{financier || "-"}</div>
                </div>
              )}
            </div>

            {/* Payments */}
            <div className="grid">
              <div className="kv">
                <div className="name"><span className="label">Booking Amount Paid:</span></div>
                <div className="val">{totalPaid ? inr(totalPaid) : "-"}</div>
              </div>
            </div>

            <table className="pay-table">
              <thead>
                <tr>
                  <th style={{ width: "28%" }}>Payment Part</th>
                  <th style={{ width: "22%" }}>Mode</th>
                  <th style={{ width: "25%" }}>Amount</th>
                  <th>UTR / Ref</th>
                </tr>
              </thead>
              <tbody>
                {payments.length ? (
                  payments.map((p, i) => (
                    <tr key={`${p.part || "p"}-${i}`}>
                      <td>{p.part || `Part ${i + 1}`}</td>
                      <td>{p.mode}</td>
                      <td>{inr(p.amount)}</td>
                      <td>{p.reference || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center" }}>No payment recorded</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Notes */}
            <div className="note">
              <div className="note-title">Notes / Terms</div>
              <ol>
                <li>This slip acknowledges booking toward the above vehicle.</li>
                <li>Prices, delivery timelines and availability are subject to change by manufacturer/RTO.</li>
                <li>This is not a tax invoice.</li>
              </ol>
            </div>

            {/* Signatures */}
            <div className="sign-row">
              <div className="sign tiny">Customer Signature</div>
              <div className="sign tiny">
                {isNH ? "For NH Motors" : "For Shantha Motors"} — Authorised Signatory
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default BookingPrintSheet;
