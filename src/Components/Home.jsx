import React from "react";
import { Link } from "react-router-dom";
import { FaWhatsapp } from "react-icons/fa";

import { findShowroomById, PRIMARY_SHOWROOM } from "../data/showrooms";
import {
  SALES_DISPLAY,
  SALES_TEL_LINK,
  SALES_WHATSAPP_LINK,
  BUSINESS_HOURS,
  CONTACT_EMAIL,
} from "../data/contactInfo";

/**
 * Shantha Motors - Heroic Home
 * Built with plain React + CSS-in-JS styles for quick drop-in.
 * Sections:
 *  - Neon glass hero with marquee
 *  - Why-us highlight grid
 *  - CTA ribbon
 *  - Services trio
 *  - Featured products
 *  - Ownership journey timeline
 *  - Visit & enquiry panel with QR
 *  - About + Reviews
 *  - WhatsApp floating action button
 */
export default function Home() {
  const useScreen = () => {
    const [width, setWidth] = React.useState(
      typeof window !== "undefined" ? window.innerWidth : 1280
    );
    React.useEffect(() => {
      const onResize = () => setWidth(window.innerWidth);
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, []);
    const isMobile = width <= 480;
    const isTablet = width > 480 && width <= 1024;
    const isDesktop = width > 1024;
    return { width, isMobile, isTablet, isDesktop };
  };

  const { isMobile, isTablet } = useScreen();

  const muddinapalya = findShowroomById("muddinapalya") || PRIMARY_SHOWROOM;

  const toEmbed = (url) => {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (!parsed.searchParams.has("output")) {
        parsed.searchParams.set("output", "embed");
      }
      return parsed.toString();
    } catch (err) {
      console.error("Failed to format map URL", err);
      return null;
    }
  };

  const mapEmbedUrl = toEmbed(muddinapalya?.mapUrl) ||
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3888.251083025643!2d77.54763557508214!3d12.956528587360554!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bae3da9b0d76597%3A0x4788d4bcee66216b!2sRajajinagar%2C%20Bengaluru!5e0!3m2!1sen!2sin!4v1700000000000";

  const reviewCols = isMobile ? 1 : isTablet ? 2 : 3;
  const containerPad = isMobile ? 14 : 22;
  const heroHeight = isMobile ? 520 : isTablet ? 620 : 720;
  const heroTitleSize = isMobile ? 34 : isTablet ? 48 : 62;
  const heroSubSize = isMobile ? 14 : isTablet ? 16 : 18;
  const gridCols = isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(3, 1fr)";
  const aboutGrid = isMobile ? "1fr" : "1.2fr 1fr";
  const highlightCols = isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)";
  const modelCols = isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(3, 1fr)";
  const journeyCols = isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))";
  const mapHeight = isMobile ? 240 : isTablet ? 300 : 340;

  const styles = {
    root: { background: "#060913", color: "#e5e7eb" },
    container: { maxWidth: 1240, margin: "0 auto", padding: `0 ${containerPad}px` },
    navWrap: {
      position: "sticky",
      top: 0,
      zIndex: 50,
      backdropFilter: "blur(12px)",
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
    navLinks: {
      display: isMobile ? "none" : "flex",
      gap: 16,
      fontWeight: 700,
      fontSize: 14,
    },
    navLink: { color: "#cbd5e1", textDecoration: "none" },
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
    heroOverlay: {
      position: "absolute",
      inset: 0,
      background: "radial-gradient(ellipse at 50% 100%, rgba(6,9,19,0) 20%, rgba(6,9,19,0.55) 70%)",
    },
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
    heroSub: { fontSize: heroSubSize, color: "#cbd5e1", marginTop: 12, maxWidth: 520 },
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
    highlightGrid: {
      display: "grid",
      gridTemplateColumns: highlightCols,
      gap: 16,
      marginTop: 26,
    },
    highlightCard: {
      position: "relative",
      borderRadius: 18,
      padding: 18,
      background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
      border: "1px solid rgba(148,163,184,0.24)",
      boxShadow: "0 18px 48px rgba(0,0,0,0.32)",
      overflow: "hidden",
    },
    highlightGlow: {
      position: "absolute",
      inset: -40,
      opacity: 0.55,
      filter: "blur(14px)",
      mixBlendMode: "screen",
      pointerEvents: "none",
    },
    highlightIcon: { fontSize: 28, marginBottom: 12 },
    highlightTitle: { fontWeight: 800, fontSize: 16, color: "#e2e8f0", marginBottom: 6 },
    highlightText: { fontSize: 13, color: "#cbd5e1", lineHeight: 1.6 },
    ribbon: {
      marginTop: 12,
      borderRadius: 18,
      padding: isMobile ? "18px 20px" : "26px 32px",
      display: "flex",
      flexDirection: isMobile ? "column" : "row",
      alignItems: isMobile ? "flex-start" : "center",
      justifyContent: "space-between",
      gap: 14,
      background: "linear-gradient(95deg,#0f172a 0%,#1d4ed8 45%,#be123c 100%)",
      boxShadow: "0 24px 70px rgba(29,78,216,0.55)",
      border: "1px solid rgba(59,130,246,0.35)",
    },
    ribbonText: { color: "#e2e8f0", fontWeight: 900, fontSize: isMobile ? 18 : 24, lineHeight: 1.2 },
    ribbonSub: { color: "#cbd5e1", fontSize: 13, marginTop: 6, maxWidth: 520 },
    ribbonCta: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      background: "rgba(15,23,42,0.85)",
      color: "#f8fafc",
      padding: "12px 20px",
      borderRadius: 12,
      fontWeight: 800,
      textDecoration: "none",
      border: "1px solid rgba(226,232,240,0.25)",
      boxShadow: "0 14px 34px rgba(15,23,42,0.45)",
    },
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
    modelsGrid: {
      display: "grid",
      gridTemplateColumns: modelCols,
      gap: 18,
      marginTop: 18,
    },
    modelCard: {
      position: "relative",
      borderRadius: 20,
      padding: 18,
      background: "linear-gradient(180deg, rgba(15,23,42,0.92), rgba(15,23,42,0.6))",
      border: "1px solid rgba(148,163,184,0.26)",
      boxShadow: "0 24px 60px rgba(0,0,0,0.38)",
      display: "grid",
      gap: 14,
      overflow: "hidden",
    },
    modelBadge: {
      alignSelf: "start",
      fontSize: 12,
      padding: "4px 10px",
      borderRadius: 999,
      background: "rgba(56,189,248,0.16)",
      color: "#38bdf8",
      fontWeight: 800,
      width: "max-content",
    },
    modelImageWrap: {
      position: "relative",
      borderRadius: 16,
      overflow: "hidden",
      background: "linear-gradient(135deg, rgba(56,189,248,0.18), rgba(244,114,182,0.12))",
    },
    modelImage: {
      width: "100%",
      height: isMobile ? 160 : 200,
      objectFit: "cover",
      display: "block",
      borderRadius: 16,
    },
    modelTitle: { fontWeight: 900, fontSize: 18, color: "#f8fafc" },
    modelMeta: { display: "flex", justifyContent: "space-between", color: "#cbd5e1", fontSize: 13 },
    modelCta: {
      display: "inline-flex",
      gap: 8,
      alignItems: "center",
      padding: "10px 16px",
      borderRadius: 12,
      border: "1px solid rgba(148,163,184,0.35)",
      textDecoration: "none",
      color: "#93c5fd",
      fontWeight: 800,
      background: "rgba(15,23,42,0.55)",
      width: "max-content",
    },
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
    journeyGrid: {
      display: "grid",
      gridTemplateColumns: journeyCols,
      gap: 18,
      marginTop: 22,
    },
    journeyCard: {
      position: "relative",
      borderRadius: 18,
      padding: 18,
      background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(15,23,42,0.5))",
      border: "1px solid rgba(148,163,184,0.25)",
      boxShadow: "0 18px 50px rgba(0,0,0,0.32)",
      display: "grid",
      gap: 12,
    },
    journeyMarker: {
      display: "flex",
      alignItems: "center",
      gap: 12,
    },
    journeyDot: {
      height: 14,
      width: 14,
      borderRadius: "50%",
      background: "linear-gradient(135deg,#38bdf8,#f472b6)",
      boxShadow: "0 0 12px rgba(244,114,182,0.6)",
    },
    journeyLine: {
      flex: 1,
      height: 2,
      background: "linear-gradient(90deg, rgba(56,189,248,0.1), rgba(244,114,182,0.6), rgba(56,189,248,0.1))",
    },
    journeyStage: { color: "#e2e8f0", fontWeight: 800, fontSize: 15 },
    journeyText: { color: "#cbd5e1", fontSize: 13, lineHeight: 1.6 },
    visitGrid: {
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1.1fr 0.9fr" : "1.1fr 0.9fr",
      gap: 18,
      alignItems: "stretch",
      marginTop: 18,
    },
    mapFrame: {
      width: "100%",
      border: "none",
      borderRadius: 18,
      height: mapHeight,
      boxShadow: "0 22px 50px rgba(0,0,0,0.35)",
      filter: "saturate(1.2) contrast(1.05)",
    },
    visitCard: {
      borderRadius: 18,
      padding: 18,
      background: "linear-gradient(180deg, rgba(15,23,42,0.9), rgba(15,23,42,0.55))",
      border: "1px solid rgba(148,163,184,0.28)",
      boxShadow: "0 22px 60px rgba(0,0,0,0.38)",
      display: "grid",
      gap: 14,
    },
    visitRow: {
      display: "flex",
      gap: 12,
      alignItems: "center",
      color: "#cbd5e1",
      fontSize: 13,
    },
    visitIcon: {
      height: 36,
      width: 36,
      borderRadius: 12,
      background: "rgba(71,85,105,0.28)",
      display: "grid",
      placeItems: "center",
      fontSize: 18,
    },
    qrImage: {
      width: 120,
      height: 120,
      objectFit: "contain",
      borderRadius: 12,
      alignSelf: "center",
      background: "rgba(15,23,42,0.6)",
      border: "1px solid rgba(148,163,184,0.25)",
      padding: 10,
    },
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
    section: { padding: isMobile ? "32px 0" : "44px 0" },
    sectionTitle: { fontSize: isMobile ? 22 : 28, fontWeight: 900, marginBottom: 12 },
    sectionSub: { color: "#93a4c3", marginBottom: 16, fontSize: isMobile ? 13 : 14 },
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
    burger: {
      display: isMobile ? "flex" : "none",
      height: 40,
      width: 44,
      alignItems: "center",
      justifyContent: "center",
      border: "1px solid rgba(148,163,184,0.3)",
      borderRadius: 10,
      background: "#fff",
      cursor: "pointer",
      boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
    },
  };

  const highlightCards = [
    {
      icon: "🛠️",
      title: "On-Demand Service",
      text: "Quick pick-up, doorstep delivery and live job card tracking.",
      glow: "linear-gradient(135deg, rgba(14,165,233,0.6), rgba(129,140,248,0.1))",
    },
    {
      icon: "💡",
      title: "Transparent Pricing",
      text: "Upfront estimates, genuine spares and no surprise billing.",
      glow: "linear-gradient(135deg, rgba(192,132,252,0.6), rgba(244,114,182,0.12))",
    },
    {
      icon: "⚡",
      title: "EV Expertise",
      text: "Certified EV bays, diagnostics and charging guidance.",
      glow: "linear-gradient(135deg, rgba(45,212,191,0.6), rgba(56,189,248,0.12))",
    },
    {
      icon: "🤝",
      title: "Relationship First",
      text: "Personal advisors, loyalty rewards and custom finance help.",
      glow: "linear-gradient(135deg, rgba(248,113,113,0.6), rgba(251,191,36,0.12))",
    },
  ];

  const modelCards = [
    {
      name: "Honda Shine",
      badge: "Hot Seller",
      price: "Starts Rs 87K",
      range: "65 kmpl city mileage",
      image: "https://imgd.aeplcdn.com/664x374/n/cw/ec/1/versions/honda-shine-drum1751549564957.jpg?q=80",
    },
    {
      name: "TVS iQube ST",
      badge: "EV Ready",
      price: "Starts Rs 1.24L",
      range: "145 km certified range",
      image: "https://www.tvsmotor.com/electric-scooters/tvs-iqube/-/media/Vehicles/Feature/Iqube/Variant/TVS-iQube/Vehicle-Highlights/Ride-In-style/v-tg-matte.webp",
    },
    {
      name: "Yamaha MT-15",
      badge: "Performance",
      price: "Starts Rs 1.67L",
      range: "155 cc - Liquid cooled",
      image: "https://imgd.aeplcdn.com/664x374/n/bw/models/colors/yamaha-select-model-metallic-black-2023-1680847548270.png?q=80",
    },
  ];

  const journeySteps = [
    {
      stage: "Discover",
      copy: "Browse 40+ two-wheelers, compare on-road pricing and explore EMI calculators online.",
    },
    {
      stage: "Experience",
      copy: "Instant test rides scheduled from your nearest Shantha Motors experience center.",
    },
    {
      stage: "Purchase",
      copy: "Paperwork, insurance and delivery handled in a single sitting with digital updates.",
    },
    {
      stage: "Care",
      copy: "Scheduled service reminders, free health checks and priority support for loyal riders.",
    },
  ];

  const visitRows = [
    { icon: "📍", text: muddinapalya?.address || "Muddinapalya, Bengaluru" },
    { icon: "⏰", text: BUSINESS_HOURS },
    { icon: "📞", text: `Sales: ${SALES_DISPLAY}` },
    { icon: "✉️", text: CONTACT_EMAIL },
  ];

  const reviewList = [
    { name: "Aarav Sharma", rating: 5, time: "2 days ago", text: "Smooth booking process and quick delivery. Staff was very helpful throughout." },
    { name: "Priya Nair", rating: 4.5, time: "1 week ago", text: "Good service quality, reasonable pricing. Will come back for servicing." },
    { name: "Rohit Verma", rating: 4, time: "3 weeks ago", text: "Test ride arranged instantly, paperwork was quick and hassle-free." },
    { name: "Ananya Iyer", rating: 5, time: "yesterday", text: "Transparent pricing and genuine accessories - very satisfied!" },
    { name: "Vikram Rao", rating: 4.5, time: "4 days ago", text: "Service center turnaround was quick and professional." },
    { name: "Sneha Kulkarni", rating: 4, time: "5 days ago", text: "Friendly staff, but the waiting area could be improved." },
  ];

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

      <div style={styles.navWrap}>
        <div style={{ ...styles.container, ...styles.nav }}>
          <div style={styles.logo}>SHANTHA MOTORS</div>
          <nav style={styles.navLinks} aria-label="Primary">
            <a href="#offerings" style={styles.navLink}>Offerings</a>
            <a href="#products" style={styles.navLink}>Vehicles</a>
            <a href="#about" style={styles.navLink}>About</a>
            <a href="#reviews" style={styles.navLink}>Reviews</a>
            <a href="#enquiry" style={styles.navLink}>Visit</a>
            <Link to="/contact" style={{ ...styles.navLink, fontWeight: 900 }}>Contact</Link>
          </nav>
          <button type="button" style={styles.burger} onClick={() => document.getElementById("offerings")?.scrollIntoView({ behavior: "smooth" })}>
            <div style={{ display: "grid", gap: 4 }}>
              <span style={{ height: 2, width: 20, background: "#131417", display: "block" }} />
              <span style={{ height: 2, width: 16, background: "#131417", display: "block" }} />
              <span style={{ height: 2, width: 20, background: "#131417", display: "block" }} />
            </div>
          </button>
        </div>
      </div>

      <div style={styles.container}>
        <section style={styles.heroWrap} role="img" aria-label="Motorcycle hero">
          <div style={styles.heroImg} />
          <div style={styles.heroAurora} />
          <div style={styles.heroNoise} />
          <div style={styles.heroOverlay} />

          <div style={styles.heroContent}>
            <div>
              <h1 style={styles.heroTitle}>Ride Bold. Service Smart. Save More.</h1>
              <div style={styles.heroUnderline} />
              <p style={styles.heroSub}>
                Bengaluru's multi-brand hub for bikes and scooters - transparent pricing, expert service and genuine spares with fast turnaround.
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
                <span style={{ color: "#93a4c3", fontSize: 12 }}>No spam - Instant WhatsApp assistance</span>
              </div>
            </div>

            <aside style={styles.heroRightCard} className="tilt">
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 800 }}>Today's Highlights</span>
                  <span style={{ fontSize: 12, color: "#93a4c3" }}>Live</span>
                </div>
                <div style={styles.stats}>
                  {[{ k: "Showrooms", v: "10+" }, { k: "Happy Riders", v: "25k+" }, { k: "Avg. Rating", v: "4.7★" }, { k: "Genuine Parts", v: "100%" }].map((stat) => (
                    <div key={stat.k} style={styles.statCard}>
                      <div style={{ fontSize: 18, fontWeight: 900 }}>{stat.v}</div>
                      <div style={{ fontSize: 12, color: "#9fb0cf" }}>{stat.k}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "#9fb0cf" }}>
                  Trusted across Bengaluru - quick service, transparent costs and genuine spares.
                </div>
              </div>
            </aside>
          </div>

          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
            <div style={{ ...styles.container, ...styles.marquee }}>
              <div className="marquee-track">
                {["Honda","TVS","Yamaha","Bajaj","Hero","Ather","KTM","Royal Enfield","Honda","TVS","Yamaha","Bajaj","Hero","Ather","KTM","Royal Enfield"].map((brand, index) => (
                  <span key={`${brand}-${index}`} style={{ fontWeight: 900, color: "#cbd5e1" }}>{brand}</span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div style={styles.container}>
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Why Riders Choose Shantha Motors</h2>
          <p style={styles.sectionSub}>A premium dealership journey built on trust, transparency and tech-enabled service.</p>

          <div style={styles.highlightGrid}>
            {highlightCards.map((card) => (
              <div key={card.title} style={styles.highlightCard} className="tilt">
                <span style={{ ...styles.highlightGlow, background: card.glow }} />
                <div style={{ position: "relative", display: "grid", gap: 12 }}>
                  <span style={styles.highlightIcon} aria-hidden>{card.icon}</span>
                  <h3 style={styles.highlightTitle}>{card.title}</h3>
                  <p style={styles.highlightText}>{card.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div style={styles.container}>
        <section style={{ ...styles.section, paddingTop: 0 }}>
          <div style={styles.ribbon}>
            <div>
              <div style={styles.ribbonText}>Upgrade your ride with launch offers and instant delivery slots.</div>
              <p style={styles.ribbonSub}>
                Speak with an advisor now - curated vehicle options, EMI plans and service packages shared in minutes.
              </p>
            </div>
            <a href={SALES_TEL_LINK || "tel:+919731366921"} style={styles.ribbonCta}>Call Sales Desk</a>
          </div>
        </section>
      </div>

      <div style={styles.container}>
        <section style={styles.section} id="offerings">
          <h2 style={styles.sectionTitle}>We Do - We Offer - We Prefer</h2>
          <p style={styles.sectionSub}>End-to-end dealership services focused on sales, service, safety and genuine spares.</p>

          <div style={styles.grid3}>
            {[
              {
                title: "Sales",
                text: "Latest multi-branded bikes and EVs with on-road prices and flexible EMI options.",
              },
              {
                title: "Service",
                text: "Multi-point inspection, maintenance and quick turnaround by certified technicians.",
              },
              {
                title: "Safety",
                text: "Ride assured with genuine spares, helmets and curated accessories.",
              },
            ].map((card) => (
              <div key={card.title} style={styles.cardWrap}>
                <article style={styles.card} className="tilt">
                  <h3 style={{ marginTop: 4, color: "#e2e8f0" }}>{card.title}</h3>
                  <p style={{ color: "#cbd5e1" }}>{card.text}</p>
                </article>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div style={styles.container}>
        <section style={styles.section} id="products">
          <h2 style={styles.sectionTitle}>Featured Two-Wheelers</h2>
          <p style={styles.sectionSub}>Handpicked machines ready for immediate delivery with finance and exchange support.</p>

          <div style={styles.modelsGrid}>
            {modelCards.map((item) => (
              <article key={item.name} style={styles.modelCard} className="tilt">
                <span style={styles.modelBadge}>{item.badge}</span>
                <div style={styles.modelImageWrap}>
                  <img src={item.image} alt={item.name} style={styles.modelImage} />
                </div>
                <h3 style={styles.modelTitle}>{item.name}</h3>
                <div style={styles.modelMeta}>
                  <span>{item.price}</span>
                  <span>{item.range}</span>
                </div>
                <Link to="/quotation" style={styles.modelCta}>Get On-Road Price  &rarr;</Link>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div style={styles.container}>
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Your Shantha Motors Journey</h2>
          <p style={styles.sectionSub}>We stay with you at every milestone - from first test ride to scheduled service.</p>

          <div style={styles.journeyGrid}>
            {journeySteps.map((step) => (
              <article key={step.stage} style={styles.journeyCard}>
                <div style={styles.journeyMarker}>
                  <span style={styles.journeyDot} />
                  <div style={styles.journeyLine} />
                </div>
                <h3 style={styles.journeyStage}>{step.stage}</h3>
                <p style={styles.journeyText}>{step.copy}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div style={styles.container}>
        <section style={styles.section} id="enquiry">
          <h2 style={styles.sectionTitle}>Visit & Connect</h2>
          <p style={styles.sectionSub}>Drop by our flagship outlet or book a callback. We respond within 15 minutes.</p>

          <div style={styles.visitGrid}>
            <iframe
              style={styles.mapFrame}
              title="Shantha Motors Map"
              loading="lazy"
              src={mapEmbedUrl}
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
            />

            <aside style={styles.visitCard}>
              <div style={{ display: "grid", gap: 12 }}>
                {visitRows.map((row) => (
                  <div key={row.text} style={styles.visitRow}>
                    <span style={styles.visitIcon}>{row.icon}</span>
                    <span>{row.text}</span>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: "1px solid rgba(148,163,184,0.22)", paddingTop: 14, display: "grid", gap: 10 }}>
                <strong style={{ color: "#e2e8f0" }}>Quick Links</strong>
                <Link to="/bookingform" style={{ color: "#93c5fd", textDecoration: "none", fontWeight: 800 }}>Book a Service Slot  &rarr;</Link>
                <Link to="/jobcard" style={{ color: "#93c5fd", textDecoration: "none", fontWeight: 800 }}>Create Job Card  &rarr;</Link>
                <Link to="/quotation" style={{ color: "#93c5fd", textDecoration: "none", fontWeight: 800 }}>Request Quotation  &rarr;</Link>
              </div>

              <img src="/location-qr.png" alt="Location QR" style={styles.qrImage} />
            </aside>
          </div>
        </section>
      </div>

      <div style={styles.container}>
        <section
          style={{ ...styles.section, display: "grid", gridTemplateColumns: aboutGrid, gap: 18, alignItems: "center" }}
          id="about"
        >
          <div>
            <h2 style={styles.sectionTitle}>About Shantha Motors</h2>
            <p style={styles.sectionSub}>
              Shantha Motors began in 2022 with one compact outlet and a promise to make premium two-wheelers and transparent servicing accessible to every rider in Bengaluru.
              In just a few years we have grown into a multi-brand network that blends curated bikes, quick finance approvals and certified workshops equipped for EV diagnostics.
              Our rider-first crew keeps the journey personal with doorstep pick-ups, real-time updates and a culture that treats every delivery like day one.
            </p>
            <Link to="/about" style={{ color: "#93c5fd", textDecoration: "none", fontWeight: 900 }}>Discover Our Story  &rarr;</Link>
          </div>
          <img
            style={styles.aboutImg}
            src="/about-bike.jpg"
            alt="Rider on a motorcycle"
          />
        </section>
      </div>

      <div style={styles.container}>
        <section style={styles.section} id="reviews">
          <h2 style={styles.sectionTitle}>Google Reviews</h2>
          <p style={styles.sectionSub}>What our happy riders say about us</p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${reviewCols}, 1fr)` ,
              gap: 18,
            }}
          >
            {reviewList.map((review) => {
              const fullStars = Math.floor(review.rating);
              const hasHalf = review.rating % 1 !== 0;
              return (
                <div
                  key={review.name}
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

      <div style={styles.container}>
        <footer style={styles.footer}>
          <div>© {new Date().getFullYear()} Shantha Motors. All rights reserved.</div>
        </footer>
      </div>

      <a
        style={styles.whatsapp}
        href={SALES_WHATSAPP_LINK || "https://wa.me/919731366921"}
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
