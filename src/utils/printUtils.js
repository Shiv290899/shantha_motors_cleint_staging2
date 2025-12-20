// utils/printUtils.js
import dayjs from "dayjs";

/* =========================
   Basic helpers
   ========================= */

export const inr = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(Number(n || 0))));

export const fmtDate = (d) => (d ? dayjs(d).format("DD/MM/YYYY") : "");

export const tick = (cond) => (cond ? "☑" : "☐");

/** Number → Indian currency words (Rupees Only) */
export const amountInWords = (numInput) => {
  const n = Math.max(0, Math.floor(Number(numInput || 0)));
  if (n === 0) return "Zero Rupees Only";

  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
    "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
    "Sixteen", "Seventeen", "Eighteen", "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const two = (num) =>
    num < 20 ? ones[num] : tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "");
  const three = (num) => {
    const hundred = Math.floor(num / 100);
    const rest = num % 100;
    return (hundred ? ones[hundred] + " Hundred" + (rest ? " " : "") : "") + (rest ? two(rest) : "");
  };

  let out = "";
  const crore = Math.floor(n / 10000000);             // 1,00,00,000
  const lakh = Math.floor((n / 100000) % 100);
  const thousand = Math.floor((n / 1000) % 100);
  const hundred = n % 1000;

  if (crore) out += three(crore) + " Crore ";
  if (lakh) out += two(lakh) + " Lakh ";
  if (thousand) out += two(thousand) + " Thousand ";
  if (hundred) out += three(hundred);

  return (out.trim() + " Rupees Only").replace(/\s+/g, " ");
};

/* =========================
   Android-safe print pipeline
   ========================= */

/** Cache-bust a path or URL so printers don’t show stale images */
export const absBust = (p) => {
  if (!p) return p;
  const src = p.startsWith("http") ? p : `${window.location.origin}${p}`;
  const v = Date.now();
  return src.includes("?") ? `${src}&v=${v}` : `${src}?v=${v}`;
};

// --- private helpers (not exported) ---
const convertCanvasToImages = (root) => {
  root.querySelectorAll("canvas").forEach((cnv) => {
    try {
      const img = document.createElement("img");
      img.alt = cnv.getAttribute("aria-label") || "canvas";
      img.src = cnv.toDataURL("image/png");
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      if (cnv.parentNode) cnv.parentNode.replaceChild(img, cnv);
    } catch {
      /* ignore */
    }
  });
};

const bustImages = (root) => {
  root.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (src && !src.startsWith("data:")) img.setAttribute("src", absBust(src));
  });
};

const PRINT_STYLES = `
  @page { size: A4 portrait; margin: 0; }
  html, body {
    margin: 0 !important; padding: 0 !important; background: #fff !important;
    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, Helvetica, sans-serif;
  }
  * { box-sizing: border-box; }
  img { max-width: 100%; height: auto; background: transparent; }
  .print-wrap { margin: 0 auto; }
  @media print {
    * { transform: none !important; }
    .fixed, .sticky, [style*="position: sticky"], [style*="position: fixed"] { position: static !important; }
    .no-print { display: none !important; }
  }
`;

const writeDoc = (doc, bodyHtml, { inlineFallback = false } = {}) => {
  doc.open();
  const fallbackScript = inlineFallback
    ? `<script>setTimeout(function () { try { window.print(); } catch (e) {} }, 300);</script>`
    : "";
  doc.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <base href="${location.origin}${location.pathname}">
  <title>Print</title>
  <style>${PRINT_STYLES}</style>
</head>
<body class="print-host">
  <div class="print-wrap">${bodyHtml}</div>
  ${fallbackScript}
</body>
</html>`);
  doc.close();
};

const waitForAssets = async (doc) => {
  const imgs = Array.from(doc.images || []);
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth
        ? Promise.resolve()
        : new Promise((res) => {
            img.onload = img.onerror = () => res();
          })
    )
  );
  if (doc.fonts && doc.fonts.ready) {
    try { await doc.fonts.ready; } catch { /* ignore */ }
  }
  await new Promise((res) => setTimeout(res, 200)); // compositor settle
};

/**
 * Print a specific DOM node with Android-safe behavior.
 * Usage: handleSmartPrint(ref.current)
 */
export async function handleSmartPrint(sourceNode) {
  if (!sourceNode) {
    window.print();
    return;
  }

  // Ensure React has flushed the latest DOM
  await new Promise((r) => setTimeout(r, 0));

  const cloned = sourceNode.cloneNode(true);
  convertCanvasToImages(cloned);
  bustImages(cloned);

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobile) {
    // New-tab flow: most reliable on Android/iOS
    const win = window.open("", "_blank"); // no features → fewer Android quirks
    if (!win) {
      alert("Please allow pop-ups to print.");
      return;
    }
    // Avoid double prints: do not include inline fallback; print explicitly after assets load
    writeDoc(win.document, cloned.outerHTML, { inlineFallback: false });
    await waitForAssets(win.document);
    try { win.focus(); } catch { /* ignore */ }
    try { win.print(); } catch { /* inline fallback in the document will try */ }
    return;
  }

  // Desktop: hidden iframe flow
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win.document;
  // Avoid double prints on desktop as well
  writeDoc(doc, cloned.outerHTML, { inlineFallback: false });
  await waitForAssets(doc);

  try { win.focus(); } catch { /* ignore */ }
  try { win.print(); } catch { window.print(); }

  setTimeout(() => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }, 800);
}

/**
 * Intercept Ctrl/Cmd+P and route to our handler.
 * Pass either a node or a getter function that returns the node.
 *
 * Example:
 *   const ref = useRef(null);
 *   useEffect(() => installPrintShortcut(() => ref.current), []);
 */
export function installPrintShortcut(getNode) {
  const onKeyDown = (e) => {
    const isPrintShortcut = (e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P");
    if (!isPrintShortcut) return;
    e.preventDefault();
    const node = typeof getNode === "function" ? getNode() : getNode;
    handleSmartPrint(node);
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
