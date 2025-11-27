import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom"; // <-- added useNavigate
// ^ We import useNavigate to programmatically redirect after sign-out.
//   Link/location are already used for routing and active styling.

const parseJwt = (token) => {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    // ignore malformed tokens
    return null;
  }
};

// A polished, attractive Navbar with:
// - Gradient topbar
// - Sticky, blurred header with subtle shadow
// - Animated hover underline and active pill for links
// - Prominent CTA button
// - Smooth, slide-in mobile drawer + backdrop
// - Fully responsive without extra libs
// - NEW: Account chip that shows "Accounting Admin" for admins, otherwise user's email/name with dropdown
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
  // ^ useLocation tells us the current path for active link highlight.
  const navigate = useNavigate();
  // ^ useNavigate lets us redirect after logout.

  // Close drawer on route change (UX!)
  React.useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);
  // ^ When route changes, close the mobile drawer for a clean UX.

  // Close on ESC (accessibility)
  React.useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // ^ Enables ESC to close the drawer.

  // Lock scroll when drawer is open (mobile UX)
  React.useEffect(() => {
    if (!isMobile) return;               // only for mobile layouts
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen, isMobile]);
  // ^ Prevents background scrolling when the drawer is open.

  // --- Lightweight auth helpers (read from localStorage or JWT) ---
  const getCurrentUser = React.useCallback(() => {
    // 1) Try a saved user object (recommended)
    const raw = localStorage.getItem("user");
    if (raw) {
      try {
        const u = JSON.parse(raw);
        return {
          name: u?.name || "",
          email: u?.email || "",
          role: u?.role || "",
        };
      } catch {
        // ignore parse errors and fall back to token
      }
    }
    // 2) Fallback: decode the JWT payload (if app stores claims in token)
    const token = localStorage.getItem("token");
    const payload = parseJwt(token);
    if (payload) {
      return {
        name: payload?.name || "",
        email: payload?.email || "",
        role: payload?.role || "",
      };
    }
    // 3) Not logged in
    return null;
  }, []);
  // ^ Centralized way to read current user info.

  const [user, setUser] = React.useState(() => getCurrentUser());
  // ^ Holds the current user object or null when logged out.

  // Keep user state in sync when localStorage changes (e.g., in other tabs)
  React.useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "user" || e.key === "token") {
        setUser(getCurrentUser());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [getCurrentUser]);
  // ^ Updates the chip if login/logout happens in another tab.

  // Refresh account chip when route changes (covers same-tab logins)
  React.useEffect(() => {
    setUser(getCurrentUser());
  }, [location.pathname, getCurrentUser]);

  // Simple avatar initial (first char of name/email)
  const avatarInitial = React.useMemo(() => {
    const seed = user?.name?.trim() || user?.email?.trim() || "";
    return seed ? seed.charAt(0).toUpperCase() : "U";
  }, [user]);
  // ^ Shows a single-letter avatar fallback.

  // What text to display in the chip?
  const chipText = React.useMemo(() => {
    if (!user) return "Guest";
    const role = String(user.role || "").toLowerCase();
    if (role === "admin") return "Accounting Admin";
    if (role === "owner") return "Owner";
    // Prefer name; fallback to email; else generic
    return user.name || user.email || "User";
  }, [user]);
  // ^ Matches your requirement: show "Accounting Admin" for admin, otherwise the user’s email (or name).

  // Profile always navigates to /profile

  // Dropdown open/close state for the account chip (desktop)
  const [accOpen, setAccOpen] = React.useState(false);
  // ^ Controls visibility of the small profile dropdown.

  // Close dropdown when clicking outside
  const accRef = React.useRef(null);
  React.useEffect(() => {
    const onDocClick = (e) => {
      if (!accRef.current) return;
      if (!accRef.current.contains(e.target)) setAccOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);
  // ^ A simple outside click handler.

  // Sign out clears localStorage & redirects
  const onSignOut = () => {
    localStorage.removeItem("user");   // remove saved user (if used)
    localStorage.removeItem("token");  // remove token (if used)
    setUser(null);                     // update local state
    setAccOpen(false);                 // close dropdown
    navigate("/login");                // go to login page
  };
  // ^ A minimal sign-out flow without extra libs.

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
  // ^ Shared color/spacing tokens for consistent styling.

  // --- Styles ---
  const styles = {
    // full-width topbar with gradient
    topbar: {
      background: T.gradTop,
      color: "#fff",
      fontSize: 13,
      padding: "6px 0",
    },
    container: {
      maxWidth: T.maxW,
      margin: "0 auto",
      padding: `0 ${isMobile ? 12 : 20}px`,
    },
    // sticky, blurred header
    headerWrap: {
      position: "sticky",
      top: 0,
      zIndex: 60,
      backdropFilter: "saturate(140%) blur(10px)",
      WebkitBackdropFilter: "saturate(140%) blur(10px)",
      background: T.glass,
      borderBottom: `1px solid ${T.line}`,
    },
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: isMobile ? "10px 0" : "14px 0",
    },
    // left: logo + wordmark
    logoWrap: { display: "flex", alignItems: "center", gap: 12 },
    logoImg: { height: isMobile ? 36 : 44, width: "auto", objectFit: "contain" },
    brandTitle: { fontSize: isMobile ? 18 : 20, fontWeight: 800, color: T.ink },
    tagline: { fontSize: 12, color: T.mute, marginTop: 2 },

    // center/right: nav links (desktop/tablet)
    nav: {
      display: isMobile ? "none" : "flex",
      gap: 4,
      alignItems: "center",
      flexWrap: "wrap",
    },
    // animated underline link
    navLink: (active) => ({
      position: "relative",
      textDecoration: "none",
      color: active ? T.brand : T.ink2,
      fontWeight: active ? 800 : 600,
      padding: "10px 12px",
      borderRadius: 10,
      transition: "color .2s ease, background .2s ease",
      background: active ? "rgba(225,29,72,0.08)" : "transparent",
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

    // NEW: account chip (desktop)
    accWrap: {
      position: "relative",
      // ^ Needed for absolute-positioned dropdown list.
    },
    accBtn: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 10px",
      borderRadius: 12,
      border: `1px solid ${T.line}`,
      background: "#fff",
      color: T.ink2,
      fontWeight: 700,
      cursor: "pointer",
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    },
    accAvatar: {
      height: 28,
      width: 28,
      borderRadius: "50%",
      display: "grid",
      placeItems: "center",
      background: "rgba(225,29,72,0.1)",
      color: T.brand,
      fontWeight: 800,
      fontSize: 14,
    },
    accBadge: {
      fontSize: 11,
      padding: "2px 6px",
      borderRadius: 999,
      background: "rgba(16,185,129,0.12)", // green-ish
      color: "#065f46",
      fontWeight: 800,
    },
    accMenu: {
      position: "absolute",
      right: 0,
      top: "calc(100% + 8px)",
      minWidth: 180,
      background: "#fff",
      border: `1px solid ${T.line}`,
      borderRadius: 12,
      boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
      overflow: "hidden",
      zIndex: 70,
    },
    accItem: {
      padding: "10px 12px",
      fontWeight: 600,
      color: T.ink2,
      textDecoration: "none",
      display: "block",
      borderBottom: `1px solid ${T.line}`,
    },

    // mobile burger button
    burger: {
      display: isMobile ? "flex" : "none",
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
      inset: 0,
      background: "rgba(0,0,0,0.25)",
      zIndex: 55,
      opacity: menuOpen ? 1 : 0,
      pointerEvents: menuOpen ? "auto" : "none",
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
      transform: menuOpen ? "translateX(0)" : "translateX(100%)",
      transition: "transform .24s ease",
      display: isMobile ? "flex" : "none",
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
    { label: "Service", path: "/service" },
    { label: "Gallery", path: "/gallery" },
    { label: "Contact", path: "/contact" },
    { label: "About Us", path: "/about-us" },
  ];
  // ^ Your existing navigation items.

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
                src="/shantha-logo.jpg"
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
                      <span
                        className="u"
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
                          transition: "transform .2s ease, opacity .2s ease",
                          opacity: active ? 1 : 0.22,
                        }}
                      />
                    </Link>
                  </div>
                );
              })}


              {/* NEW: Account Chip (desktop only) */}
              <div ref={accRef} style={{ ...styles.accWrap, marginLeft: 8 }}>
                <button
                  type="button"
                  style={styles.accBtn}
                  onClick={() => setAccOpen((s) => !s)}
                  aria-haspopup="menu"
                  aria-expanded={accOpen}
                  aria-label="Account menu"
                >
                  {/* Avatar circle with initial */}
                  <span style={styles.accAvatar}>{avatarInitial}</span>
                  {/* Label: "Accounting Admin" if admin, else email/name */}
                  <span>{chipText}</span>
                  {/* Small role badge for admin/owner (visual only) */}
                  {(() => {
                    const r = String(user?.role || "").toLowerCase();
                    const txt = r === "admin" ? "Admin" : r === "owner" ? "Owner" : r === "backend" ? "Backend" : null;
                    return txt ? <span style={styles.accBadge}>{txt}</span> : null;
                  })()}
                  {/* Chevron */}
                  <span aria-hidden>▾</span>
                </button>

                {/* Dropdown */}
                {accOpen && (
                  <div role="menu" style={styles.accMenu}>
                    {user ? (
                      <>
                        <span
                          style={styles.accItem}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            const role = String(user?.role || "").toLowerCase();
                            const target =
                              role === "admin" ? "/admin" :
                              role === "owner" ? "/owner" :
                              role === "mechanic" ? "/mechanic" :
                              role === "backend" ? "/backend" :
                              role === "employees" ? "/employees" :
                              role === "staff" ? "/staff" :
                              "/staff";
                            setAccOpen(false);
                            navigate(target);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              const role = String(user?.role || "").toLowerCase();
                              const target =
                                role === "admin" ? "/admin" :
                                role === "owner" ? "/owner" :
                                role === "mechanic" ? "/mechanic" :
                                role === "backend" ? "/backend" :
                                role === "employees" ? "/employees" :
                                role === "staff" ? "/staff" :
                                "/staff";
                              setAccOpen(false);
                              navigate(target);
                            }
                          }}
                        >
                          My Profile
                        </span>
                       
                       
                        <button
                          type="button"
                          onClick={onSignOut}
                          style={{ ...styles.accItem, width: "100%", textAlign: "left", background: "white", border: "none", cursor: "pointer" }}
                        >
                      Logout
                        </button>
                      </>
                    ) : (
                      <>
                        <Link to="/login" style={styles.accItem} onClick={() => setAccOpen(false)}>
                          Login
                        </Link>
                        <Link to="/register" style={{ ...styles.accItem, borderBottom: "none" }} onClick={() => setAccOpen(false)}>
                          Create account
                        </Link>
                      </>
                    )}
                  </div>
                )}
              </div>
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
              src="/shantha-logo.jpg"
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

        {/* NEW: Mobile user panel (top of drawer) */}
        <div style={{ padding: 12, borderBottom: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={styles.accAvatar}>{avatarInitial}</span>
          <div style={{ display: "grid" }}>
            <strong style={{ color: T.ink2 }}>
              {chipText}
            </strong>
            {user ? (
              <span style={{ fontSize: 12, color: T.mute }}>
                {user.email || user.name}
              </span>
            ) : (
              <span style={{ fontSize: 12, color: T.mute }}>Not signed in</span>
            )}
          </div>
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


          {/* Mobile auth actions */}
          <div style={{ height: 8 }} />
          {user ? (
            <>
              <button
                type="button"
                onClick={() => {
                  const role = String(user?.role || "").toLowerCase();
                  const target =
                    role === "admin" ? "/admin" :
                    role === "owner" ? "/owner" :
                    role === "mechanic" ? "/mechanic" :
                    role === "backend" ? "/backend" :
                    role === "employees" ? "/employees" :
                    role === "staff" ? "/staff" :
                    "/staff";
                  navigate(target);
                  setMenuOpen(false);
                }}
                style={{ ...styles.drawerLink(false), width: "100%", textAlign: "left", background: "white", border: `1px solid ${T.line}`, cursor: "pointer" }}
              >
                Profile
              </button>
              <button
                type="button"
                onClick={() => { onSignOut(); setMenuOpen(false); }}
                style={{ ...styles.drawerLink(false), width: "100%", textAlign: "left", background: "white", border: `1px solid ${T.line}`, cursor: "pointer" }}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" style={styles.drawerLink(false)}>Login</Link>
              <Link to="/register" style={styles.drawerLink(false)}>Create account</Link>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
