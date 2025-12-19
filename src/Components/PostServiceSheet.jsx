// components/PostServiceSheet.jsx
import React, { useMemo, forwardRef } from "react";
import { inr, fmtDate, amountInWords } from "../utils/printUtils";

/**
 * Updated for Android-safe printing (when used with handleSmartPrint in parent)
 * - Forwarded ref so parent can pass DOM node to print helper
 * - Stronger print CSS: A4, zero body margins, resets transforms/sticky/fixed
 * - Scopes print to the active sheet to avoid blank/extra pages
 */
const PostServiceSheet = forwardRef(function PostServiceSheet({ active, vals, totals }, ref) {
  const rows = Array.isArray(vals?.labourRows) ? vals.labourRows : [];
  const items = rows.map((r, idx) => ({
    sn: idx + 1,
    particulars: r?.desc || "-",
    qty: Number(r?.qty || 0),
    rate: Number(r?.rate || 0),
    amount: Math.max(0, Number(r?.qty || 0) * Number(r?.rate || 0)),
  }));

  // Prefer computed totals passed from parent for consistency with billing
  const computedSub = useMemo(() => items.reduce((s, x) => s + x.amount, 0), [items]);
  const gstPct = Number(vals?.gstLabour ?? 0);
  const subTotal = Math.round(Number(totals?.labourSub ?? computedSub));
  const gstAmt = Math.round(Number(totals?.labourGST ?? (subTotal * (gstPct / 100))));
  const discountAmt = Math.round(Number(totals?.labourDisc ?? 0));
  const grandTotal = Math.max(0, Math.round(Number(totals?.grand ?? (subTotal + gstAmt - discountAmt))));
  const grandInWords = amountInWords(grandTotal);

  const parseKm = (v) => {
    const digits = String(v ?? "").replace(/\D/g, "");
    return digits ? parseInt(digits, 10) : null;
  };
  const kmVal = parseKm(vals?.km);
  const nextServiceKm = kmVal != null ? kmVal + 2000 : null;
  const branch = String(vals?.branch || "").trim();
  const isNH = branch.toLowerCase().includes("byadarahalli"); // Switch branding for Byadarahalli (tolerant casing/phrasing)
  const mobileDigits = useMemo(() => {
    const d = String(vals?.custMobile || "").replace(/\D/g, "").slice(-10);
    return d || "";
  }, [vals?.custMobile]);

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
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, Helvetica, sans-serif;
}
img { max-width: 100%; height: auto; background: transparent; }

/* Tame layout quirks during print */
@media print {
  * { transform: none !important; }
  .fixed, .sticky, [style*="position: sticky"], [style*="position: fixed"] { position: static !important; }
  .no-print { display: none !important; }
}

/* Hide on screen only inside the main app, not in the special print window */
@media screen {
  body:not(.print-host) 
  .print-sheet { display: none !important; }
}

/* Scope print to only the active sheet and avoid blank extra pages */
@media print {
  body * { visibility: hidden !important; }
  .print-sheet { display: block; }
  .print-sheet.active,
  .print-sheet.active * { visibility: visible !important; }
  .print-sheet:not(.active) { display: none !important; }
  .print-sheet.active { position: absolute; inset: 0; width: 100%; }
  .post-a4 { display: block !important; min-height: auto !important; height: auto !important; }

  /* Keep large blocks together */
  .bill-wrap, .bill-box, .hdr-grid, .id-grid, .totals, .tandc, .sign-row { break-inside: avoid; page-break-inside: avoid; }
  .tbl { page-break-inside: auto; }
  .tbl thead { display: table-header-group; }
  .tbl tr { page-break-inside: avoid; }
}

/* =========================
   COMPONENT STYLES
   ========================= */
.doc-title {
  display: block;
  width: max-content;
  margin: 4mm auto 0;
  text-align: center;
  font-size: 20pt;
  font-weight: 700;
  letter-spacing: 0.8px;
}

/* Provide inner page padding instead of @page margins (more consistent on Android) */
.post-a4 { display: block; }
.bill-wrap { padding: 8mm; color: #000; }
.bill-box { border: 1px solid #000; border-radius: 1mm; padding: 3mm; }

.hdr-grid { display: grid; grid-template-columns: 28mm 1fr 28mm; align-items: center; gap: 3mm; }
.shop-title { text-align: center; }
.shop-title .en { font-size: 18pt; font-weight: 500; line-height: 1.05; }
.shop-sub { font-size: 10pt; margin-top: 1mm; }

.id-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; margin-top: 3mm; }
.label { font-weight: 600; }

.tbl { width: 100%; border-collapse: collapse; margin-top: 3mm; }
.tbl th, .tbl td { border: 1px solid #111; padding: 1.8mm; font-size: 11pt; }
.tbl th { font-weight: 700; text-align: center; }
.right { text-align: right; }
.center { text-align: center; }
.tiny { font-size: 10px; }

  .totals { display: grid; grid-template-columns: 1fr 70mm; gap: 3mm; margin-top: 4mm; }
  /* Compact single box for all totals */
  .sum-box { border: 1px solid #111; border-radius: 2mm; overflow: hidden; }
  .sum-row { display: grid; grid-template-columns: 1fr 1fr; align-items: center; }
  .sum-row > div { padding: 2mm 2.5mm; font-size: 11pt; line-height: 1.25; }
  .sum-row .label { font-weight: 600; border-right: 1px solid #111; }
  .sum-row + .sum-row { border-top: 1px solid #111; }
  .sum-row .value { text-align: right; }
  .sum-row.emph > div { font-weight: 700; }

.tandc { margin-top: 4mm; }
.tandc-title { font-weight: 700; margin-bottom: 2mm; }
.tandc ol { margin: 0; padding-left: 4mm; }

.sign-row { display: grid; grid-template-columns: 1fr 40mm; margin-top: 8mm; gap: 3mm; align-items: end; }
.sign-box { text-align: center; border-top: 1px solid #111; padding-top: 2mm; }
      `}</style>

      <div className="post-a4">
        <div className="doc-title">SERVICE INVOICE</div>

        <div className="bill-wrap">
          <div className="bill-box">
            <div className="hdr-grid">
              <img
                src={isNH ? "/honda-logo.png" : "/shantha-logoprint.jpg"}
                alt={isNH ? "NH Motors" : "Shantha Motors"}
                style={{ width: "100%", maxHeight: 100 }}
              />
              <div className="shop-title">
                {isNH ? (
                  <>
                    <div className="en">NH Motors | ಎನ್ ಎಚ್ ಮೋಟರ್ಸ್</div>
                    <div className="shop-sub" style={{ marginTop: 4 }}>
                      Site No. 116/1, Bydarahalli, Magadi Main Road, Opp.<br />
                      HP Petrol Bunk, Bangalore - 560091
                    </div>
                    <div className="shop-sub">Mob: 9731366921 / 8073283502 / 9741609799</div>
                  </>
                ) : (
                  <>
                    <div className="en">SHANTHA MOTORS | ಶಾಂತ ಮೋಟರ್ಸ್</div>
                    <div className="shop-sub">Multi Brand Two Wheeler Sales &amp; Service</div>
                    <div className="shop-sub">Mob No : 9731366921 / 8073283502 </div>
                    <div className="tiny">Kadabagere • Muddinapalya  • Andrahalli • Tavarekere • Hegganahalli • Channenahalli • Nelagadrahalli</div>
                  </>
                )}
              </div>
              <div>
                <img src="/location-qr.png" alt="Location QR" style={{ width: "100%", maxHeight: 100 }} />
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>Scan for Location</div>
              </div>
            </div>

            <div className="id-grid">
              <div><span className="label">Bill To (Customer):</span> {vals?.custName || "-"}</div>
              <div><span className="label">Invoice No:</span> {vals?.jcNo || "-"}</div>
              <div><span className="label">Vehicle No:</span> {vals?.regNo || "-"}{mobileDigits ? `(${mobileDigits})` : ''}</div>
              <div><span className="label">Date:</span> {fmtDate(vals?.createdAt)}</div>
              <div><span className="label">Odometer Reading:</span> {kmVal != null ? `${kmVal} KM` : "-"}</div>
              <div><span className="label">Next Service:</span> {nextServiceKm != null ? `${nextServiceKm} KM` : "-"}</div>
              
            </div>

            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: "8mm" }}>S/N</th>
                  <th>Particulars</th>
                  <th style={{ width: "20mm" }}>Qty</th>
                  <th style={{ width: "28mm" }}>Price</th>
                  <th style={{ width: "30mm" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={5} className="center">No items</td></tr>
                ) : items.map((r) => (
                  <tr key={r.sn}>
                    <td className="center">{r.sn}</td>
                    <td>{r.particulars}</td>
                    <td className="center">{r.qty}</td>
                    <td className="right">{inr(r.rate)}</td>
                    <td className="right">{inr(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="totals">
              <div className="bill-to">
                <div><span className="label">Invoice Amount (in words):</span></div>
                <div style={{ border: "1px solid #111", borderRadius: "2mm", padding: "3mm", minHeight: 18 }}>
                  {grandInWords}
                </div>
              </div>

              <div className="sum-box">
                {(gstAmt > 0 || discountAmt > 0) && (
                  <div className="sum-row">
                    <div className="label">Labour Subtotal</div>
                    <div className="value">{inr(subTotal)}</div>
                  </div>
                )}
                {gstAmt > 0 && (
                  <div className="sum-row">
                    <div className="label">GST {gstPct ? `(${gstPct}% on Labour)` : "(on Labour)"}</div>
                    <div className="value">{inr(gstAmt)}</div>
                  </div>
                )}
                {discountAmt > 0 && (
                  <div className="sum-row">
                    <div className="label">Discount</div>
                    <div className="value">{inr(discountAmt)}</div>
                  </div>
                )}
                <div className="sum-row emph">
                  <div className="label">Grand Total</div>
                  <div className="value">{inr(grandTotal)}</div>
                </div>
              </div>
            </div>

            <div className="tandc">
              <div className="tandc-title">Terms &amp; Conditions</div>
              <ol>
                <li>All services/parts once billed are non-returnable.</li>
                <li>Vehicle will be delivered against full and final payment only.</li>
                <li>Company is not responsible for loss/damage to valuables left in vehicle.</li>
                <li>Kindly verify items and amounts before making payment.</li>
                <li>Vehicle left unclaimed beyond 7 days may attract parking charges.</li>
                <li>Any damages must be reported at the time of delivery.</li>
              </ol>
            </div>

            <div className="sign-row">
              <div />
              <div className="sign-box tiny">
                {isNH ? "For NH Motors" : "For Shantha Motors"}<br/>Authorised Signatory
              </div>
            </div>

            <div className="center tiny" style={{ marginTop: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Thank you for your business — please visit again.</div>
              <div>Ride Smooth. Ride Safe.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default PostServiceSheet;
