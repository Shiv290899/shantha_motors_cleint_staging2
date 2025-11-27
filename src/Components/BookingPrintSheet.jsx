// components/BookingPrintSheet.jsx
import React, { forwardRef } from "react";
import { fmtDate } from "../utils/printUtils";

/**
 * Printable A4 booking slip for vehicle bookings.
 *
 * Usage (inside a parent like BookingForm):
 *   const ref = useRef(null);
 *   <BookingPrintSheet ref={ref} active vals={valsForPrint} />
 *   handleSmartPrint(ref.current)
 *
 * EXCLUDES (per spec):
 *  - Booking Amount
 *  - Payment Mode (Cash/Online) and UTR/Reference No.
 *  - Down Payment, Total DP, Balanced DP
 *  - Extra Fitting Amounts, Affidavit Charges
 *  - Total Vehicle Cost, Balanced Amount
 *  - On-road Price
 * Everything else is shown. One-page A4. Labels with inline values (no stacking).
 */
const BookingPrintSheet = forwardRef(function BookingPrintSheet({ active = true, vals = {} }, ref) {
  // Normalize brand by branch (Byadarahalli => NH Motors)
  const branch = String(vals?.branch || "").trim();
  const isNH = branch === "Byadarahalli";

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

  // Address proof (mode + types) – accept arrays or CSV strings across multiple field names
  const addressProofMode =
    vals?.addressProofMode ||
    vals?.addressProof ||
    vals?.addrProofMode ||
    vals?.addressProofType ||
    vals?.addressProofCategory ||
    "";

  const addressProofTypesRaw = Array.isArray(vals?.addressProofTypes)
    ? vals.addressProofTypes
    : Array.isArray(vals?.addressProofSelected)
    ? vals.addressProofSelected
    : Array.isArray(vals?.addrProofTypes)
    ? vals.addrProofTypes
    : typeof vals?.addressProofTypes === "string"
    ? vals.addressProofTypes.split(",").map((s) => s.trim()).filter(Boolean)
    : typeof vals?.addressProofSelected === "string"
    ? vals.addressProofSelected.split(",").map((s) => s.trim()).filter(Boolean)
    : typeof vals?.addrProofTypes === "string"
    ? vals.addrProofTypes.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // Friendly labels for proof type codes
  const PROOF_LABEL = {
    DL: 'Driving License',
    GasBill: 'Gas Bill',
    RentalAgreement: 'Rental Agreement',
    Others: 'Others',
  };
  const addressProofTypes = (addressProofTypesRaw || []).map((x) => PROOF_LABEL[x] || x);

  // File meta (if you want to show what was uploaded)
  const fileName =
    vals?.fileName ||
    vals?.documentName ||
    vals?.uploadedFileName ||
    (Array.isArray(vals?.files) && vals.files[0]?.name) ||
    "";

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
                    <div className="tiny">Kadabagere • Muddinapalya • D-Group Layout • Andrahalli • Tavarekere • Hegganahalli • Channenahalli • Nelagadrahalli</div>
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

            {/* Mode (no Payment Mode/UTR) */}
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

            {/* Address proof & document */}
            <div className="grid">
              <div className="kv">
                <div className="name"><span className="label">Address Proof:</span></div>
                <div className="val">
                  {addressProofMode
                    ? (String(addressProofMode).toLowerCase() === "aadhaar" ? "Aadhaar / Voter ID" : String(addressProofMode))
                    : "-"}
                </div>
              </div>
              <div className="kv">
                <div className="name"><span className="label">Proof Types:</span></div>
                <div className="val">
                  {(String(addressProofMode).toLowerCase() === 'additional' && addressProofTypes && addressProofTypes.length)
                    ? addressProofTypes.join(', ')
                    : '-'}
                </div>
              </div>
              <div className="kv full">
                <div className="name"><span className="label">Document Name:</span></div>
                <div className="val">{fileName || "-"}</div>
              </div>
            </div>

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
