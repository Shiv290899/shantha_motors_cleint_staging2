// components/MinorSalesPrintSheet.jsx
import React, { forwardRef } from "react";

function fmtDate(d) {
  try {
    const dt = d instanceof Date ? d : new Date(d);
    const dd = dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const tt = dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    return `${dd} ${tt}`;
  } catch { return "-"; }
}

const MinorSalesPrintSheet = forwardRef(function MinorSalesPrintSheet({ active = true, vals = {} }, ref) {
  const branch = String(vals?.branchName || "").trim();
  const isNH = branch === "Byadarahalli";
  const createdAt = vals?.dateTimeIso || new Date();

  const rows = Array.isArray(vals?.items) ? vals.items : [];
  const total = Number(vals?.summaryTotal || 0) || 0;

  return (
    <div ref={ref} className={`print-sheet ${active ? "active" : ""}`}>
      <style>{`
@page { size: A4 portrait; margin: 0; }
@media screen { body:not(.print-host) .print-sheet { display: none !important; } }
@media print {
  body * { visibility: hidden !important; }
  .print-sheet { display: block; }
  .print-sheet.active, .print-sheet.active * { visibility: visible !important; }
  .print-sheet.active { position: absolute; inset: 0; width: 100%; }
}
.wrap { padding: 10mm; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, Helvetica, sans-serif; color: #000; }
.box { border: 1px solid #111; border-radius: 2mm; padding: 4mm; }
.hdr { display: grid; grid-template-columns: 26mm 1fr 26mm; align-items: center; gap: 4mm; }
.shop { text-align: center; }
.shop .en { font-size: 14.5pt; font-weight: 700; line-height: 1.08; }
.shop .sub { font-size: 9.5pt; margin-top: 1mm; }
.title { text-align: center; font-size: 16.5pt; font-weight: 800; margin: 6px 0 10px; letter-spacing: .4px; }
.kv{ display:grid; grid-template-columns: 32mm 1fr; column-gap:3mm; padding:1.5mm 0; border-bottom:1px solid #e5e7eb; }
.kv .name{ font-weight:600; }
.grid{ display:grid; grid-template-columns:1fr 1fr; gap:2mm; }
.full{ grid-column:1 / -1; }
table { width: 100%; border-collapse: collapse; font-size: 11pt; margin-top: 2mm; }
th, td { border: 1px solid #111; padding: 2.5mm; }
th { background: #fafafa; }
.right { text-align: right; }
.center { text-align: center; }
.sign-row { display:grid; grid-template-columns: 1fr 1fr; gap:6mm; margin-top:8mm; }
.sign { border-top: 1px dashed #777; padding-top: 3mm; text-align: center; font-size: 10pt; }
      `}</style>
      <div className="wrap">
        <div className="box">
          <div className="hdr">
            <img src={isNH ? "/honda-logo.png" : "/shantha-logoprint.jpg"} alt="Logo" style={{ width: "100%", maxHeight: 92 }} />
            <div className="shop">
              {isNH ? (
                <>
                  <div className="en">NH MOTORS | ಎನ್ ಎಚ್ ಮೋಟರ್ಸ್</div>
                  <div className="sub">Site No. 116/1, Bydarahalli, Magadi Main Road, Opp.<br/>HP Petrol Bunk, Bangalore - 560091</div>
                  <div className="sub">Mob: 9731366921 / 8073283502 / 9741609799</div>
                </>
              ) : (
                <>
                  <div className="en">SHANTHA MOTORS | ಶಾಂತ ಮೋಟರ್ಸ್</div>
                  <div className="sub">Multi Brand Two Wheeler Sales & Service</div>
                  <div className="sub">Mob No : 9731366921 / 8073283502</div>
                </>
              )}
            </div>
            <div>
              <img src="/location-qr.png" alt="QR" style={{ width: "100%", maxHeight: 92 }} />
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, textAlign:'center' }}>Scan for Location</div>
            </div>
          </div>

          <div className="title">Minor Sales Receipt</div>

          <div className="grid">
            <div className="kv"><div className="name">Date/Time:</div><div>{fmtDate(createdAt)}</div></div>
            <div className="kv"><div className="name">Order ID:</div><div>{vals?.orderId || '-'}</div></div>
            <div className="kv"><div className="name">Branch:</div><div>{branch || '-'}</div></div>
            <div className="kv"><div className="name">Executive:</div><div>{vals?.staffName || '-'}</div></div>
            <div className="kv full"><div className="name">Customer:</div><div>{String(vals?.customer?.name || '-').toUpperCase()} ({vals?.customer?.mobile || '-'})</div></div>
            <div className="kv"><div className="name">Payment Mode:</div><div>{String(vals?.customer?.paymentMode || '').toUpperCase() || '-'}</div></div>
            {String(vals?.customer?.paymentMode || '').toLowerCase() === 'online' && (
              <div className="kv"><div className="name">UTR / Ref:</div><div>{vals?.customer?.utr || '-'}</div></div>
            )}
          </div>

          <table>
            <thead>
              <tr><th>Item</th><th className="center" style={{width:'16mm'}}>Qty</th><th className="right" style={{width:'26mm'}}>Unit</th><th className="right" style={{width:'30mm'}}>Amount</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}><td>{r.item}</td><td className="center">{r.qty}</td><td className="right">₹{r.unitPrice}</td><td className="right">₹{r.amount}</td></tr>
              ))}
              <tr><td colSpan={3} className="right" style={{ fontWeight:700 }}>Total</td><td className="right" style={{ fontWeight:700 }}>₹{total}</td></tr>
            </tbody>
          </table>

          <div className="sign-row">
            <div className="sign">Customer Signature</div>
            <div className="sign">Authorized Signature</div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default MinorSalesPrintSheet;
