import React from "react";
import { Link, useLocation } from "react-router-dom";

// A polished, attractive Navbar with:
// - Gradient topbar
// - Sticky, blurred header with subtle shadow
// - Animated hover underline and active pill for links
// - Prominent CTA button
// - Smooth, slide-in mobile drawer + backdrop
// - Fully responsive without extra libs

export default function Navbar() {
  // ---- simple responsive hook (unchanged API; refined) ----
  const useScreen = () => {
    // Track viewport width
    const [w, setW] = React.useState(typeof window !== "undefined" ? window.innerWidth : 1280);
    // Attach resize listener
    React.useEffect(() => {
      const onResize = () => setW(window.innerWidth);
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, []);
    // Breakpoints
    const isMobile = w <= 480;
    const isTablet = w > 480 && w <= 1024;
    const isDesktop = w > 1024;
    return { w, isMobile, isTablet, isDesktop };
  };
  // ^ Keeps your original hook, so it’s a drop-in.

  const { isMobile } = useScreen(); // read current breakpoint
  // Mobile drawer state
  const [menuOpen, setMenuOpen] = React.useState(false);
  // For active route styles
  const location = useLocation();

  // Close drawer on route change (UX!)
  React.useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Close on ESC (accessibility)
  React.useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Lock scroll when drawer is open (mobile UX)
  React.useEffect(() => {
    if (!isMobile) return;               // only for mobile layouts
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen, isMobile]);

  // --- Design tokens (one place to tweak look) ---
  const T = {
    maxW: 1200,
    radius: 12,
    brand: "#e11d48",          // primary accent (rose-600)
    ink: "#131417",            // strong text
    ink2: "#2a2f36",           // default text
    mute: "#6b7280",           // subtle text
    line: "#e5e7eb",           // hairline border
    glass: "rgba(255,255,255,0.65)", // glass background
    bg: "#f8fafc",             // page bg fallback
    // gradients
    gradTop: "linear-gradient(90deg, #ff8a05 0%, #ff4d4d 45%, #e11d48 100%)",
  };

  // --- Styles ---
  const styles = {
    // full-width topbar with gradient
    topbar: {
      background: T.gradTop,       // vibrant gradient
      color: "#fff",               // white text on gradient
      fontSize: 13,                // compact
      padding: "6px 0",            // vertical rhythm
    },
    container: {
      maxWidth: T.maxW,            // center column max width
      margin: "0 auto",            // center horizontally
      padding: `0 ${isMobile ? 12 : 20}px`, // responsive side padding
    },
    // sticky, blurred header
    headerWrap: {
      position: "sticky",          // stick to top on scroll
      top: 0,                      // anchored at top
      zIndex: 60,                  // above page content
      backdropFilter: "saturate(140%) blur(10px)", // glass effect
      WebkitBackdropFilter: "saturate(140%) blur(10px)", // Safari
      background: T.glass,         // translucent white
      borderBottom: `1px solid ${T.line}`, // subtle bottom line
    },
    header: {
      display: "flex",             // horizontal layout
      alignItems: "center",        // vertical center
      justifyContent: "space-between", // space between logo and nav
      padding: isMobile ? "10px 0" : "14px 0", // breathing room
    },
    // left: logo + wordmark
    logoWrap: { display: "flex", alignItems: "center", gap: 12 },
    logoImg: { height: isMobile ? 36 : 44, width: "auto", objectFit: "contain" },
    brandTitle: { fontSize: isMobile ? 18 : 20, fontWeight: 800, color: T.ink },
    tagline: { fontSize: 12, color: T.mute, marginTop: 2 },

    // center/right: nav links (desktop/tablet)
    nav: {
      display: isMobile ? "none" : "flex", // hidden on mobile
      gap: 4,                               // small gap (we’ll pad links)
      alignItems: "center",                 // vertically centered
      flexWrap: "wrap",                     // wrap if long
    },
    // animated underline link
    navLink: (active) => ({
      position: "relative",          // for underline pseudo
      textDecoration: "none",        // no default underline
      color: active ? T.brand : T.ink2, // highlight active
      fontWeight: active ? 800 : 600,   // bolder when active
      padding: "10px 12px",          // bigger click target
      borderRadius: 10,              // soft corners
      transition: "color .2s ease, background .2s ease", // smooth
      background: active ? "rgba(225,29,72,0.08)" : "transparent", // active pill
    }),
    // CTA button styling
    cta: {
      textDecoration: "none",
      padding: "10px 14px",
      borderRadius: 12,
      fontWeight: 800,
      background: T.brand,
      color: "#fff",
      border: "1px solid rgba(0,0,0,0.05)",
      boxShadow: "0 6px 16px rgba(225,29,72,0.25)",
      transition: "transform .15s ease",
      display: "inline-block",
    },

    // mobile burger button
    burger: {
      display: isMobile ? "flex" : "none", // only on mobile
      height: 40,
      width: 44,
      alignItems: "center",
      justifyContent: "center",
      border: `1px solid ${T.line}`,
      borderRadius: 10,
      background: "#fff",
      cursor: "pointer",
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    },
    // fullscreen backdrop (mobile drawer)
    backdrop: {
      position: "fixed",
      inset: 0,                   // cover full screen
      background: "rgba(0,0,0,0.25)", // dim page
      zIndex: 55,                 // behind drawer but above content
      opacity: menuOpen ? 1 : 0,  // fade in/out
      pointerEvents: menuOpen ? "auto" : "none", // click-through when closed
      transition: "opacity .2s ease",
    },
    // slide-in drawer panel
    drawer: {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      width: Math.min(300, Math.floor((typeof window !== "undefined" ? window.innerWidth : 320) * 0.82)),
      background: "#fff",
      borderLeft: `1px solid ${T.line}`,
      boxShadow: "-10px 0 30px rgba(0,0,0,0.12)",
      zIndex: 60,
      transform: menuOpen ? "translateX(0)" : "translateX(100%)", // slide
      transition: "transform .24s ease",
      display: isMobile ? "flex" : "none", // only on mobile
      flexDirection: "column",
    },
    drawerHead: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "14px 14px",
      borderBottom: `1px solid ${T.line}`,
    },
    drawerLinks: {
      padding: 8,
      overflowY: "auto",
    },
    drawerLink: (active) => ({
      display: "block",
      padding: "12px 12px",
      textDecoration: "none",
      color: active ? T.brand : T.ink2,
      fontWeight: 700,
      borderRadius: 10,
      background: active ? "rgba(225,29,72,0.08)" : "transparent",
    }),

    // phone/open-hours row inside the gradient topbar
    phoneRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    topbarText: { fontWeight: 700, letterSpacing: 0.2 },
    hours: { fontSize: 12, opacity: 0.95 },
  };

  // map labels to your actual paths (so no 404s)
  const navItems = [
    { label: "Home", path: "/" },
    { label: "Quotation", path: "/quotation" },
    { label: "JobCard", path: "/jobcard" },
    { label: "BookingForm", path: "/bookingform" },
    { label: "EMICalculator", path: "/emicalculator" },
    { label: "Contact", path: "/contact" },
    { label: "Login", path: "/login" },
    { label: "About Us", path: "/about-us" },
  ];

  // Small helper to render the animated underline (pseudo-element via span)
  const Underline = ({ active }) => (
    <span
      aria-hidden
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 6,
        height: 2,
        borderRadius: 2,
        background: active ? T.brand : "currentColor",
        transform: active ? "scaleX(1)" : "scaleX(0)",
        transformOrigin: "center",
        transition: "transform .2s ease",
        opacity: active ? 1 : 0.22,
      }}
    />
  );

  return (
    <>
      {/* Gradient Topbar */}
      <div style={styles.topbar}>
        {/* Container centers content */}
        <div style={styles.container}>
          {/* Contact + Hours */}
          <div style={styles.phoneRow}>
            <div style={styles.topbarText}>
              📞 Sales: <strong>9731366921 / 8073283502</strong>
            </div>
            <div style={styles.hours}>
              ⏰ Mon–Sat: 9:00 AM – 8:30 PM • Sun: 9:00 AM – 2:30 PM
            </div>
          </div>
        </div>
      </div>

      {/* Sticky, blurred header */}
      <div style={styles.headerWrap}>
        <div style={styles.container}>
          <header style={styles.header}>
            {/* Logo + Wordmark */}
            <div style={styles.logoWrap}>
              <img
                src="/shantha-logo.png"
                alt="Shantha Motors Logo"
                style={styles.logoImg}
                onError={(e) => {
                  // graceful fallback if logo missing
                  e.currentTarget.src = "https://via.placeholder.com/200x48?text=Shantha+Motors";
                }}
              />
              <div>
                <div style={styles.brandTitle}>Shantha Motors</div>
                <div style={styles.tagline}>The Power of Trust</div>
              </div>
            </div>

            {/* Desktop/Tablet nav */}
            <nav style={styles.nav} aria-label="Primary">
              {navItems.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <div key={item.path} style={{ position: "relative" }}>
                    {/* Each link with animated underline */}
                    <Link
                      to={item.path}
                      style={styles.navLink(active)}
                      onMouseEnter={(e) => {
                        // show underline on hover
                        const u = e.currentTarget.querySelector(".u");
                        if (u) u.style.transform = "scaleX(1)";
                        if (u) u.style.opacity = active ? 1 : 0.45;
                      }}
                      onMouseLeave={(e) => {
                        // hide underline off hover if not active
                        const u = e.currentTarget.querySelector(".u");
                        if (u && !active) {
                          u.style.transform = "scaleX(0)";
                          u.style.opacity = 0.22;
                        }
                      }}
                    >
                      {item.label}
                      {/* underline */}
                      <span className="u" style={{
                        position: "absolute",
                        left: 12,
                        right: 12,
                        bottom: 6,
                        height: 2,
                        borderRadius: 2,
                        background: active ? T.brand : "currentColor",
                        transform: active ? "scaleX(1)" : "scaleX(0)",
                        transformOrigin: "center",
                        transition: "transform .2s ease, opacity .2s ease",
                        opacity: active ? 1 : 0.22,
                      }} />
                    </Link>
                  </div>
                );
              })}
              {/* Persistent CTA on the right */}
              <Link
                to="/quotation"
                style={styles.cta}
                onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(1px)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
              >
                Get Quote
              </Link>
            </nav>

            {/* Mobile burger */}
            <button
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-drawer"
              style={styles.burger}
              onClick={() => setMenuOpen((s) => !s)}
            >
              <div style={{ display: "grid", gap: 4 }}>
                <span style={{ height: 2, width: 20, background: T.ink, display: "block" }} />
                <span style={{ height: 2, width: 16, background: T.ink, display: "block" }} />
                <span style={{ height: 2, width: 20, background: T.ink, display: "block" }} />
              </div>
            </button>
          </header>
        </div>
      </div>

      {/* Mobile Backdrop */}
      <div
        role="button"
        aria-label="Close menu backdrop"
        onClick={() => setMenuOpen(false)}
        style={styles.backdrop}
      />

      {/* Mobile Drawer */}
      <aside id="mobile-drawer" style={styles.drawer}>
        {/* Drawer header */}
        <div style={styles.drawerHead}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src="/shantha-logo.png"
              alt="Shantha Motors Logo"
              style={{ height: 28, width: "auto" }}
              onError={(e) => {
                e.currentTarget.src = "https://via.placeholder.com/120x28?text=SM";
              }}
            />
            <strong>Menu</strong>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            style={{
              height: 36,
              width: 36,
              borderRadius: 10,
              border: `1px solid ${T.line}`,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Drawer links */}
        <div style={styles.drawerLinks}>
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                style={styles.drawerLink(active)}
              >
                {item.label}
              </Link>
            );
          })}
          {/* CTA inside drawer */}
          <Link
            to="/quotation"
            style={{ ...styles.drawerLink(false), background: T.brand, color: "#fff", textAlign: "center", marginTop: 8 }}
          >
            Get Quote
          </Link>
        </div>
      </aside>
    </>
  );
}
