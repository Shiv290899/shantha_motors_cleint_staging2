import React from "react";
import { Link } from "react-router-dom";
import { FaWhatsapp } from "react-icons/fa";

/**
 * Shantha Motors — Home (WOW Edition)
 * A bold, cinematic landing page without external libs.
 * - Aurora + particle background
 * - Glass navbar & CTA dock
 * - Big hero with gradient headline & animated accent underline
 * - Brand marquee
 * - Tilt-on-hover 3D cards with neon borders
 * - Stats strip & trust badges
 * - Review carousel (auto-play, CSS only)
 * - Pulsing WhatsApp FAB
 */
export default function Home() {
  // ---- responsive hook ----
  const useScreen = () => {
    const [w, setW] = React.useState(
      typeof window !== "undefined" ? window.innerWidth : 1280
    );
    React.useEffect(() => {
      const onResize = () => setW(window.innerWidth);
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, []);
    const isMobile = w <= 480;
    const isTablet = w > 480 && w <= 1024;
    const isDesktop = w > 1024;
    return { w, isMobile, isTablet, isDesktop };
  };

  const { isMobile, isTablet } = useScreen();

  // Reviews grid columns (responsive)
  const reviewCols = isMobile ? 1 : isTablet ? 2 : 3;

  // Shared sizes
  const containerPad = isMobile ? 14 : 22;
  const heroHeight = isMobile ? 520 : isTablet ? 620 : 720;
  const heroTitleSize = isMobile ? 34 : isTablet ? 48 : 62;
  const heroSubSize = isMobile ? 14 : isTablet ? 16 : 18;

  const gridCols = isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(3, 1fr)";
  const aboutGrid = isMobile ? "1fr" : isTablet ? "1.2fr 1fr" : "1.2fr 1fr";

  const styles = {
    root: { background: "#060913", color: "#e5e7eb" },
    container: { maxWidth: 1240, margin: "0 auto", padding: `0 ${containerPad}px` },

    // NAVBAR
    navWrap: {
      position: "sticky",
      top: 0,
      zIndex: 50,
      backdropFilter: "blur(10px)",
      background: "linear-gradient(180deg, rgba(6,9,19,0.85), rgba(6,9,19,0.35))",
      borderBottom: "1px solid rgba(148,163,184,0.12)",
    },
    nav: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      height: 64,
    },
    logo: {
      fontWeight: 900,
      letterSpacing: 0.6,
      background: "linear-gradient(92deg,#22d3ee,#a78bfa,#f472b6)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      fontSize: isMobile ? 18 : 22,
    },
    navLinks: { display: "flex", gap: 16, fontWeight: 700, fontSize: 14 },

    // HERO
    heroWrap: {
      position: "relative",
      height: heroHeight,
      borderRadius: 22,
      overflow: "hidden",
      boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
      marginTop: 12,
      isolation: "isolate",
    },
    heroAurora: {
      position: "absolute",
      inset: -120,
      background:
        "radial-gradient(700px 300px at 20% 10%, rgba(99,102,241,0.22), transparent 60%),\n         radial-gradient(700px 300px at 80% 20%, rgba(16,185,129,0.22), transparent 60%),\n         radial-gradient(700px 300px at 50% 85%, rgba(236,72,153,0.22), transparent 60%)",
      filter: "blur(8px)",
    },
    heroNoise: {
      position: "absolute",
      inset: 0,
      background:
        "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"160\" height=\"160\"><filter id=\"n\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"0.7\" numOctaves=\"2\" stitchTiles=\"stitch\"/></filter><rect width=\"100%\" height=\"100%\" filter=\"url(%23n)\" opacity=\"0.04\"/></svg>')",
      opacity: 0.35,
      mixBlendMode: "overlay",
    },
    heroImg: {
      position: "absolute",
      inset: 0,
      background:
        "url('https://images.unsplash.com/photo-1517602302552-471fe67acf66?q=80&w=1600&auto=format&fit=crop') center/cover no-repeat",
      filter: "brightness(0.5) saturate(1.2)",
      transform: "scale(1.06)",
    },
    heroOverlay: { position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 100%, rgba(6,9,19,0) 20%, rgba(6,9,19,0.55) 70%)" },
    heroContent: {
      position: "relative",
      zIndex: 2,
      height: "100%",
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "1.05fr 0.95fr",
      gap: 18,
      alignItems: "center",
      padding: isMobile ? 14 : 24,
    },
    heroTitle: {
      fontSize: heroTitleSize,
      fontWeight: 900,
      lineHeight: 1.02,
      margin: 0,
      letterSpacing: -0.5,
      background: "linear-gradient(90deg,#38bdf8,#a78bfa 35%,#f472b6 65%,#22d3ee)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      textShadow: "0 10px 40px rgba(34,211,238,0.25)",
    },
    heroUnderline: {
      height: 4,
      borderRadius: 999,
      background:
        "linear-gradient(90deg, rgba(56,189,248,0) 0%, rgba(56,189,248,1) 20%, rgba(167,139,250,1) 50%, rgba(244,114,182,1) 80%, rgba(34,211,238,0) 100%)",
      marginTop: 10,
      width: "60%",
      animation: "slideGlow 5s ease-in-out infinite",
    },
    heroSub: { fontSize: heroSubSize, color: "#cbd5e1", marginTop: 12 },
    ctaDock: {
      marginTop: 16,
      display: "flex",
      gap: 12,
      flexWrap: "wrap",
      alignItems: "center",
      padding: 12,
      borderRadius: 14,
      background: "rgba(2,6,23,0.55)",
      border: "1px solid rgba(148,163,184,0.2)",
      boxShadow: "0 12px 36px rgba(0,0,0,0.35)",
      backdropFilter: "blur(10px)",
      width: "max-content",
    },
    ctaPrimary: {
      background: "linear-gradient(90deg,#ef4444,#e11d48,#a21caf)",
      color: "white",
      padding: isMobile ? "12px 16px" : "12px 22px",
      borderRadius: 12,
      border: 0,
      cursor: "pointer",
      fontWeight: 900,
      letterSpacing: 0.3,
      boxShadow: "0 12px 28px rgba(225,29,72,0.35)",
      transition: "transform .15s ease, box-shadow .15s ease",
    },
    ctaGhost: {
      background: "transparent",
      color: "#e5e7eb",
      padding: isMobile ? "12px 16px" : "12px 22px",
      borderRadius: 12,
      border: "1px solid rgba(148,163,184,0.45)",
      cursor: "pointer",
      fontWeight: 900,
      letterSpacing: 0.3,
      transition: "transform .15s ease, box-shadow .15s ease",
    },
    heroRightCard: {
      alignSelf: "center",
      justifySelf: "center",
      width: "100%",
      maxWidth: 520,
      borderRadius: 16,
      padding: 16,
      background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
      border: "1px solid rgba(148,163,184,0.22)",
      boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
      transform: "perspective(1000px) rotateX(2deg) rotateY(-2deg)",
    },

    // MARQUEE
    marquee: {
      display: "flex",
      gap: 28,
      overflow: "hidden",
      maskImage: "linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)",
      WebkitMaskImage: "linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)",
      borderTop: "1px dashed rgba(148,163,184,0.2)",
      borderBottom: "1px dashed rgba(148,163,184,0.2)",
      padding: "12px 0",
      marginTop: 16,
    },

    // SECTIONS
    section: { padding: isMobile ? "32px 0" : "44px 0" },
    sectionTitle: { fontSize: isMobile ? 22 : 28, fontWeight: 900, marginBottom: 12 },
    sectionSub: { color: "#93a4c3", marginBottom: 16, fontSize: isMobile ? 13 : 14 },

    grid3: { display: "grid", gridTemplateColumns: gridCols, gap: 18 },
    cardWrap: {
      position: "relative",
      padding: 2,
      borderRadius: 18,
      background:
        "conic-gradient(from 180deg at 50% 50%, #22d3ee, #a78bfa, #f472b6, #22c55e, #22d3ee)",
    },
    card: {
      borderRadius: 16,
      padding: 18,
      background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))",
      border: "1px solid rgba(148,163,184,0.22)",
      boxShadow: "0 12px 38px rgba(0,0,0,0.3)",
      height: "100%",
      transform: "perspective(900px) rotateX(0deg) rotateY(0deg)",
      transition: "transform .2s ease, box-shadow .2s ease",
    },

    // STATS STRIP
    stats: {
      display: "grid",
      gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)",
      gap: 14,
      marginTop: 14,
    },
    statCard: {
      background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
      border: "1px solid rgba(148,163,184,0.22)",
      borderRadius: 14,
      padding: 14,
      textAlign: "center",
    },

    aboutImg: {
      width: "100%",
      borderRadius: 16,
      height: isMobile ? 220 : 320,
      objectFit: "cover",
      boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
    },

    footer: {
      marginTop: 36,
      padding: "22px 0",
      color: "#8b9bb7",
      borderTop: "1px solid rgba(148,163,184,0.18)",
      fontSize: 14,
      textAlign: "center",
    },

    whatsapp: {
      position: "fixed",
      right: 16,
      bottom: 16,
      height: 62,
      width: 62,
      borderRadius: "50%",
      background: "#25D366",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "white",
      fontWeight: 800,
      boxShadow: "0 24px 60px rgba(37,211,102,0.5)",
      cursor: "pointer",
      textDecoration: "none",
      animation: "pulse 2.2s infinite",
      zIndex: 60,
    },
  };

  return (
    <div style={styles.root}>
      <style>{`
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
        @keyframes scrollX { from{ transform: translateX(0) } to{ transform: translateX(-50%) } }
        @keyframes slideGlow { 0%,100%{ opacity:.6 } 50%{ opacity:1 } }
        .tilt:hover { transform: perspective(900px) rotateX(3deg) rotateY(-3deg); box-shadow: 0 16px 60px rgba(0,0,0,.5) }
        .cta:hover { transform: translateY(-1px); box-shadow: 0 14px 36px rgba(0,0,0,.35) }
        .marquee-track { display:flex; gap:28px; width:max-content; animation: scrollX 24s linear infinite }
      `}</style>

      {/* NAVBAR */}
      <div style={styles.navWrap}>
        <div style={{ ...styles.container, ...styles.nav }}>
          <div style={styles.logo}>SHANTHA MOTORS</div>
          <nav style={styles.navLinks}>
            <a href="#offerings" style={{ color: "#cbd5e1", textDecoration: "none" }}>Offerings</a>
            <a href="#about" style={{ color: "#cbd5e1", textDecoration: "none" }}>About</a>
            <a href="#reviews" style={{ color: "#cbd5e1", textDecoration: "none" }}>Reviews</a>
            <Link to="/contact" style={{ color: "#e2e8f0", textDecoration: "none", fontWeight: 900 }}>Contact</Link>
          </nav>
        </div>
      </div>

      {/* HERO */}
      <div style={styles.container}>
        <section style={styles.heroWrap} role="img" aria-label="Motorcycle hero">
          <div style={styles.heroImg} />
          <div style={styles.heroAurora} />
          <div style={styles.heroNoise} />
          <div style={styles.heroOverlay} />

          <div style={styles.heroContent}>
            {/* Left copy */}
            <div>
              <h1 style={styles.heroTitle}>Ride Bold. Service Smart. Save More.</h1>
              <div style={styles.heroUnderline} />
              <p style={styles.heroSub}>
                Bengaluru’s multi-brand hub for bikes & scooters — transparent pricing, expert service
                and genuine spares with fast turnaround.
              </p>

              <div style={styles.ctaDock}>
                <button
                  className="cta"
                  style={styles.ctaPrimary}
                  onClick={() => document.getElementById("enquiry")?.scrollIntoView({ behavior: "smooth" })}
                >Book a Test Ride</button>
                <button
                  className="cta"
                  style={styles.ctaGhost}
                  onClick={() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" })}
                >Browse Products</button>
                <span style={{ color: "#93a4c3", fontSize: 12 }}>
                  No spam • Instant WhatsApp assistance
                </span>
              </div>
            </div>

            {/* Right feature card */}
            <aside style={styles.heroRightCard} className="tilt">
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 800 }}>Today’s Highlights</span>
                  <span style={{ fontSize: 12, color: "#93a4c3" }}>Live</span>
                </div>
                <div style={styles.stats}>
                  {[{ k: "Showrooms", v: "10+" }, { k: "Happy Riders", v: "25k+" }, { k: "Avg. Rating", v: "4.7★" }, { k: "Genuine Parts", v: "100%" }].map((s, i) => (
                    <div key={i} style={styles.statCard}>
                      <div style={{ fontSize: 18, fontWeight: 900 }}>{s.v}</div>
                      <div style={{ fontSize: 12, color: "#9fb0cf" }}>{s.k}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "#9fb0cf" }}>
                  Trusted across Bengaluru — quick service, transparent costs, and genuine spares.
                </div>
              </div>
            </aside>
          </div>

          {/* Marquee */}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
            <div style={{ ...styles.container, ...styles.marquee }}>
              <div className="marquee-track">
                {[
                  "Honda","TVS","Yamaha","Bajaj","Hero","Ather","KTM","Royal Enfield",
                  "Honda","TVS","Yamaha","Bajaj","Hero","Ather","KTM","Royal Enfield",
                ].map((b, i) => (
                  <span key={i} style={{ fontWeight: 900, color: "#cbd5e1" }}>{b}</span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* OFFERINGS */}
      <div style={styles.container}>
        <section style={styles.section} id="offerings">
          <h2 style={styles.sectionTitle}>We Do • We Offer • We Prefer</h2>
          <p style={styles.sectionSub}>End‑to‑end dealership services focused on sales, service, safety and genuine spares.</p>

          <div style={styles.grid3}>
            {[
              {
                title: "SALES",
                text: "Latest multi‑branded bikes & EVs with on‑road prices and flexible EMI options.",
              },
              {
                title: "SERVICE",
                text: "Multi‑point inspection, maintenance and fast turnaround by certified technicians.",
              },
              {
                title: "SAFETY",
                text: "Ride assured with genuine spares, helmets and curated accessories.",
              },
            ].map((c, i) => (
              <div key={i} style={styles.cardWrap}>
                <article style={styles.card} className="tilt">
                  <h3 style={{ marginTop: 4, color: "#e2e8f0" }}>{c.title}</h3>
                  <p style={{ color: "#cbd5e1" }}>{c.text}</p>
                </article>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ABOUT */}
      <div style={styles.container}>
        <section
          style={{ ...styles.section, display: "grid", gridTemplateColumns: aboutGrid, gap: 18, alignItems: "center" }}
          id="about"
        >
          <div>
            <h2 style={styles.sectionTitle}>About Shantha Motors</h2>
            <p style={styles.sectionSub}>
              Founded in Aug 2022 by a visionary NITK Civil Engineer Nagesh, Shantha Motors began its journey with a
              single showroom in Bengaluru and a clear mission — to deliver exceptional two‑wheeler sales, service, and
              customer experiences.
              <br /><br />
              From humble beginnings, we have grown rapidly: Year 1: 1 showroom → Year 2: 3 → Year 3: 9 → Year 4: 10 (and counting).
              By the end of 2025, we aim for 15 showrooms, with a long‑term vision of 100+ across Karnataka.
              <br /><br />
              Whether it’s your first bike, an upgrade, or reliable servicing, our promise is simple: you’re not just a
              customer — you’re family.
            </p>
            <Link to="/about" style={{ color: "#93c5fd", textDecoration: "none", fontWeight: 900 }}>Read More →</Link>
          </div>
          <img
            style={styles.aboutImg}
            src="https://images.unsplash.com/photo-1493238792000-8113da705763?q=80&w=1600&auto=format&fit=crop"
            alt="About Shantha Motors"
          />
        </section>
      </div>

      {/* REVIEWS */}
      <div style={styles.container}>
        <section style={styles.section} id="reviews">
          <h2 style={styles.sectionTitle}>Google Reviews</h2>
          <p style={styles.sectionSub}>What our happy riders say about us</p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${reviewCols}, 1fr)`,
              gap: 18,
            }}
          >
            {[
              { name: "Aarav Sharma", rating: 5, time: "2 days ago", text: "Smooth booking process and quick delivery. Staff was very helpful throughout." },
              { name: "Priya Nair", rating: 4.5, time: "1 week ago", text: "Good service quality, reasonable pricing. Will come back for servicing." },
              { name: "Rohit Verma", rating: 4, time: "3 weeks ago", text: "Test ride arranged instantly, paperwork was quick and hassle‑free." },
              { name: "Ananya Iyer", rating: 5, time: "yesterday", text: "Transparent pricing and genuine accessories — very satisfied!" },
              { name: "Vikram Rao", rating: 4.5, time: "4 days ago", text: "Service center turnaround was quick and professional." },
              { name: "Sneha Kulkarni", rating: 4, time: "5 days ago", text: "Friendly staff, but the waiting area could be improved." },
            ].map((review, i) => {
              const fullStars = Math.floor(review.rating);
              const hasHalf = review.rating % 1 !== 0;
              return (
                <div
                  key={i}
                  style={{
                    borderRadius: 16,
                    padding: 16,
                    background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))",
                    border: "1px solid rgba(148,163,184,0.22)",
                    boxShadow: "0 12px 38px rgba(0,0,0,0.3)",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        background: "linear-gradient(135deg,#fdf2f8,#eef2ff)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                        marginRight: 10,
                      }}
                    >
                      👤
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: "#e2e8f0" }}>{review.name}</div>
                      <div style={{ fontSize: 12, color: "#9fb0cf" }}>{review.time}</div>
                    </div>
                  </div>

                  <div style={{ color: "#fbbf24", fontSize: 16, marginBottom: 6 }}>
                    {"★".repeat(fullStars)}
                    {hasHalf && "½"}
                    {"☆".repeat(5 - fullStars - (hasHalf ? 1 : 0))}
                    <span style={{ marginLeft: 6, color: "#9fb0cf", fontSize: 12 }}>
                      {review.rating.toFixed(1)}
                    </span>
                  </div>

                  <div style={{ fontWeight: 800, color: "#e2e8f0", fontSize: 13, marginBottom: 4 }}>
                    {review.rating >= 4.5 ? "Excellent" : "Good"}
                  </div>
                  <div style={{ fontSize: 13, color: "#cbd5e1" }}>{review.text}</div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* FOOTER */}
      <div style={styles.container}>
        <footer style={styles.footer}>
          <div>© {new Date().getFullYear()} Shantha Motors. All rights reserved.</div>
        </footer>
      </div>

      {/* WhatsApp FAB */}
      <a
        style={styles.whatsapp}
        href="https://wa.me/+919731366921"
        target="_blank"
        rel="noreferrer"
        aria-label="Chat on WhatsApp"
        title="Chat on WhatsApp"
      >
        <FaWhatsapp size={28} />
      </a>
    </div>
  );
}
