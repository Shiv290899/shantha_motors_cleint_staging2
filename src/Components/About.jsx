// src/Pages/About.jsx
import React from "react"; // React core
// ↓ Ant Design UI imports
import {
  Typography,        // Titles, Paragraph, Text
  Row,               // Grid row (responsive)
  Col,               // Grid column (responsive)
  Card,              // Cards
  Timeline,          // Timeline
  Statistic,         // Stats tiles
  Descriptions,      // Key-value facts
  Tag,               // Colored labels
  Button,            // CTA buttons
  Divider,           // Section separator
  Grid,              // AntD responsive hooks (useBreakpoint)
} from "antd";       // Import all from antd
// ↓ Icons
import {
  FlagOutlined,
  EnvironmentOutlined,
  ThunderboltOutlined,
  SmileOutlined,
  CheckCircleOutlined,
  RocketOutlined,
  TrophyOutlined,
  TeamOutlined,
  ToolOutlined,
  AimOutlined,
} from "@ant-design/icons"; // AntD icons

const { Title, Paragraph, Text } = Typography; // Shorthands for typography
const { useBreakpoint } = Grid;                // Hook to detect breakpoints

export default function About() { // Default export of the About page
  // ---------- RESPONSIVE BREAKPOINTS ----------
  const bp = useBreakpoint();                    // { xs, sm, md, lg, xl, xxl } booleans
  // Decide device buckets
  const isMobile = !!bp.xs && !bp.md;            // < md
  const isTablet = !!bp.md && !bp.lg;            // md only                     // ≥ lg

  // ---------- DATA ----------
  const facts = [                                // Quick facts for Descriptions
    { label: "Founded", value: "Aug 2022" },     // Founded month/year
    { label: "Headquarters", value: "Bengaluru" },// HQ city
    { label: "Current Showrooms", value: "10" }, // Current count
    { label: "2025 Target", value: "15" },       // Near-term target
    { label: "Vision", value: "100+ (aiming 200+)" }, // Long-term vision
  ];

  const timeline = [                             // Growth timeline items
    { year: "2022", title: "Year 1", desc: "Launched our first showroom in Bengaluru. Premium, transparent buying experience and dependable after-sales.", stat: 1 },   // Y1
    { year: "2023", title: "Year 2", desc: "Expanded to more neighborhoods for easy access to sales, service, and genuine spares.", stat: 3 },                        // Y2
    { year: "2024", title: "Year 3", desc: "Scaled rapidly while cloning our service DNA—bright spaces, trained teams, and customer-first process.", stat: 9 },      // Y3
    { year: "2025", title: "Year 4", desc: "Operational excellence across the city. Targeting city-wide coverage by year-end.", stat: "10 → 15" },                   // Y4
    { year: "Next", title: "Momentum", desc: "Extending the ~3× trajectory—next milestone: 27 showrooms—on the path to 100+.", stat: "27 • 100+" },                  // Next
  ];

  const whyUs = [                                // Why choose us cards
    { icon: <TrophyOutlined />, title: "Proven Track Record", desc: "From 1 to 10 showrooms in three years—growth powered by customer trust." }, // Card 1
    { icon: <SmileOutlined />, title: "Customer-First", desc: "Every decision—from inventory to processes—centers your needs." },               // Card 2
    { icon: <ToolOutlined />, title: "Skilled Teams", desc: "Friendly advisors & trained technicians using only genuine parts." },              // Card 3
    { icon: <EnvironmentOutlined />, title: "Close to You", desc: "Strategic locations for quick access to sales & service." },                // Card 4
    { icon: <CheckCircleOutlined />, title: "Consistent Quality", desc: "Every branch upholds the same high Shantha Motors standard." },       // Card 5
  ];

  // ---------- STYLES (responsive via breakpoints) ----------
  const heroHeight = isMobile ? 300 : isTablet ? 360 : 420; // Adaptive hero height
  const heroTitleSize = isMobile ? 28 : isTablet ? 36 : 44; // Adaptive H1 size
  const heroSubSize = isMobile ? 14 : isTablet ? 16 : 18;   // Adaptive subtitle size

  const styles = {                                // Inline style object
    hero: {
      position: "relative",                       // Needed for overlay
      minHeight: heroHeight,                      // Responsive height
      borderRadius: 16,                           // Rounded corners
      overflow: "hidden",                         // Clip overlay edges
      background:
        "url('https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=2100&auto=format&fit=crop') center / cover no-repeat", // Background image
      display: "flex",                            // Center content
      alignItems: "center",                       // Vertically center
    },
    heroOverlay: {
      position: "absolute",                       // Cover entire hero
      inset: 0,                                   // top/right/bottom/left = 0
      background: "linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.35))", // Darken image
    },
    heroContent: {
      position: "relative",                       // Sit above overlay
      color: "#fff",                              // White text
      padding: isMobile ? "36px 16px" : "56px 24px", // Responsive padding
      width: "100%",                              // Full width container
      maxWidth: 1180,                             // Center cap
      margin: "0 auto",                           // Center horizontally
      textAlign: isMobile ? "center" : "left",    // Center text on mobile
    },
    heroBadge: {
      background: "rgba(255,255,255,0.92)",       // Light badge
      color: "#e11d48",                           // Brand magenta
      borderRadius: 999,                          // Pill
      padding: "6px 12px",                        // Spacing
      fontWeight: 700,                            // Bold
      fontSize: 12,                               // Small
      display: "inline-block",                    // Inline box
      border: "1px solid rgba(225,29,72,0.2)",    // Subtle border
      marginBottom: 8,                            // Space under badge
    },
    section: { padding: isMobile ? "28px 0" : "40px 0" }, // Section vertical rhythm
    container: { maxWidth: 1180, margin: "0 auto", padding: "0 16px" }, // Page container
    muted: { color: "rgba(0,0,0,0.45)" },         // Muted text color
  };

  return (                                        // Component render
    <main>                                        {/* Semantic main wrapper */}
      {/* HERO */}
      <section style={styles.hero}>               {/* Visual hero section */}
        <div style={styles.heroOverlay} />        {/* Dark overlay */}
        <div style={styles.heroContent}>          {/* Text block container */}
          <span style={styles.heroBadge}>Since 2022 • Bengaluru</span> {/* Small badge */}
          <Title
            level={1}                              // H1
            style={{ color: "#fff", marginTop: 8, marginBottom: 10, fontSize: heroTitleSize }} // Responsive font
          >
            About Shantha Motors                    {/* Page title */}
          </Title>
          <Paragraph
            style={{ color: "#fff", opacity: 0.95, maxWidth: 860, fontSize: heroSubSize }} // Responsive subtitle
          >
            Founded by <Text strong style={{ color: "white" }}>Nagesh</Text>, an <Text strong style={{ color: "white" }}>NITK Civil Engineer</Text>,
            Shantha Motors began with a single showroom and a bold mission: redefine the
            two-wheeler buying and ownership experience through trust, transparency, and joyful service.
          </Paragraph>
          <Tag color="magenta" style={{ fontWeight: 700 }}> {/* Badge line */}
            <ThunderboltOutlined /> Fast-growing • Customer-first • Trusted
          </Tag>
        </div>
      </section>

      {/* STORY + FACTS */}
      <section style={styles.section}>            {/* Padded section */}
        <div style={styles.container}>            {/* Centered container */}
          <Row gutter={[16, 16]} align="top">     {/* Responsive grid row */}
            <Col xs={24} md={14}>                 {/* Story card: full on mobile, 14/24 on md+ */}
              <Card bordered>                     {/* AntD card */}
                <Title level={2} style={{ marginBottom: 8 }}>
                  Our Story                         {/* Section title */}
                </Title>
                <Paragraph>
                  In August 2022, Shantha Motors opened its doors in Bengaluru. From day one, we
                  focused on more than vehicles—we built an experience. Our founder rolled up his
                  sleeves to set up operations from scratch: sourcing, layout, hiring, training,
                  and crafting processes rooted in <Text strong>trust</Text>,{" "}
                  <Text strong>transparency</Text>, and <Text strong>care</Text>. Each satisfied
                  rider became an ambassador, and our reputation accelerated.
                </Paragraph>
                <Paragraph>
                  Today, we proudly operate <Text strong>10 showrooms</Text> across the city, and by the
                  end of <Text strong>2025</Text> we’re on track for <Text strong>15</Text>. Our long-term
                  vision is expansive: a resilient network of <Text strong>100+</Text> (and possibly{" "}
                  <Text strong>200+</Text>) showrooms across Karnataka and beyond—bringing Shantha
                  Motors quality within easy reach of every rider.
                </Paragraph>

                <Divider style={{ margin: isMobile ? "12px 0" : "16px 0" }} /> {/* Compact divider on mobile */}

                <Row gutter={[16, 16]}>           {/* Stats grid */}
                  <Col xs={12} sm={6}>            {/* 2-up on mobile, 4-up on sm+ */}
                    <Statistic title="Year 1" value={1} suffix="Showroom" />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="Year 2" value={3} suffix="Showrooms" />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="Year 3" value={9} suffix="Showrooms" />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="Year 4" value={10} suffix="→ 15" />
                  </Col>
                </Row>
              </Card>
            </Col>

            <Col xs={24} md={10}>                 {/* Facts card: full on mobile, 10/24 on md+ */}
              <Card bordered title="Quick Facts" extra={<FlagOutlined />}>
                <Descriptions
                  column={isMobile ? 1 : 1}       // Keep 1 column; readable on all devices
                  colon
                  size={isMobile ? "small" : "middle"} // Smaller density on mobile
                  labelStyle={{ width: 140, color: "rgba(0,0,0,0.65)" }} // Label look
                >
                  {facts.map((f) => (              // Map facts to items
                    <Descriptions.Item key={f.label} label={f.label}>
                      <Text strong>{f.value}</Text>
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              </Card>
            </Col>
          </Row>
        </div>
      </section>

      {/* GROWTH TIMELINE */}
      <section style={{ ...styles.section, background: "#faf6f8" }}> {/* Themed background */}
        <div style={styles.container}>            {/* Centered container */}
          <Title level={2} style={{ textAlign: "center", marginBottom: 0 }}>
            Growth Timeline                           {/* Section heading */}
          </Title>
          <Paragraph style={{ textAlign: "center", ...styles.muted }}>
            Nearly 3× scale-up year over year         {/* Subheading */}
          </Paragraph>

          <Row gutter={[16, 16]}>
            <Col span={24}>                         {/* Full-width timeline card */}
              <Card bordered>
                <Timeline
                  mode={isMobile ? "left" : "alternate"} // Vertical left on mobile, alternate on larger
                  items={timeline.map((t) => ({     // Convert data to Timeline items
                    label: <Tag color="magenta">{t.year}</Tag>, // Year tag
                    children: (                     // Body content
                      <div>
                        <Title level={4} style={{ marginBottom: 4 }}>
                          {t.title}
                        </Title>
                        <Paragraph style={{ marginBottom: 8 }}>{t.desc}</Paragraph>
                        <Tag color="red">
                          <RocketOutlined /> Showrooms: <Text strong>{t.stat}</Text>
                        </Tag>
                      </div>
                    ),
                    dot: <AimOutlined style={{ color: "#e11d48" }} />, // Custom dot
                  }))}
                />
              </Card>
            </Col>
          </Row>
        </div>
      </section>

      {/* MISSION & VISION */}
      <section style={styles.section}>            {/* Padded section */}
        <div style={styles.container}>            {/* Centered container */}
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>                 {/* Mission card: stacks on mobile */}
              <Card bordered title="Our Mission" extra={<CheckCircleOutlined />}>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Deliver excellence at every touchpoint</li>
                  <li>Transparent, fair pricing—no surprises</li>
                  <li>Service you can trust with genuine parts</li>
                  <li>Continuous innovation for convenience</li>
                  <li>Create happy customers, not just sales</li>
                </ul>
              </Card>
            </Col>
            <Col xs={24} md={12}>                 {/* Vision card: side-by-side on md+ */}
              <Card bordered title="Our Vision" extra={<RocketOutlined />}>
                <Paragraph style={{ marginBottom: 0 }}>
                  To be the most trusted two-wheeler brand in Bengaluru and beyond—recognized
                  for quality vehicles, delightful service, and an ownership experience that
                  feels effortless. Bringing Shantha Motors within 15–20 minutes of every rider.
                </Paragraph>
              </Card>
            </Col>
          </Row>
        </div>
      </section>

      {/* WHY CHOOSE US */}
      <section style={{ ...styles.section, background: "#faf6f8" }}> {/* Themed background */}
        <div style={styles.container}>            {/* Centered container */}
          <Title level={2} style={{ textAlign: "center" }}>
            Why Riders Choose Shantha Motors          {/* Section title */}
          </Title>

          <Row gutter={[16, 16]}>
            {whyUs.map((card) => (                 // Map cards
              <Col
                key={card.title}
                xs={24}                            // 1 per row on mobile
                sm={12}                            // 2 per row on small
                md={12}                            // 2 per row on tablet
                lg={8}                             // 3 per row on desktop
                xl={6}                             // 4 per row on large desktop
              >
                <Card
                  bordered
                  hoverable
                  style={{ height: "100%" }}       // Make equal height columns
                  actions={[<SmileOutlined key="smile" />]} // Cute icon action
                >
                  <div style={{ fontSize: 22, marginBottom: 8, color: "#e11d48" }}>
                    {card.icon}                     {/* Icon */}
                  </div>
                  <Title level={4} style={{ marginBottom: 6 }}>
                    {card.title}                    {/* Card title */}
                  </Title>
                  <Paragraph style={{ marginBottom: 0 }}>
                    {card.desc}                     {/* Card description */}
                  </Paragraph>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* CTA */}
      <section style={styles.section}>            {/* Final CTA section */}
        <div
          style={{
            maxWidth: 820,                         // Narrower for readability
            margin: "0 auto",                      // Center
            textAlign: "center",                   // Center text
            padding: "0 16px",                     // Side padding
          }}
        >
          <Title level={isMobile ? 3 : 2}>        {/* Slightly smaller on mobile */}
            Ride into the Future with Us           {/* CTA headline */}
          </Title>
          <Paragraph style={{ fontSize: isMobile ? 14 : 16 }}>
            From first bike to lifelong service partner, we’re here with expertise, warmth,
            and a genuine smile. Visit your nearest showroom and feel the difference.
          </Paragraph>
          <div
            style={{
              display: "flex",                     // Button row
              gap: 12,                             // Space between buttons
              justifyContent: "center",            // Centered buttons
              flexWrap: "wrap",                    // Wrap on small screens
            }}
          >
            <Button
              type="primary"                       // Primary CTA
              size={isMobile ? "middle" : "large"} // Smaller button on mobile
              href="/locations"                    // Link to locations
              icon={<EnvironmentOutlined />}       // Icon
            >
              Find a Showroom                       {/* Button label */}
            </Button>
            <Button
              size={isMobile ? "middle" : "large"} // Secondary size
              href="/service"                      // Link to service
              icon={<ToolOutlined />}              // Icon
            >
              Book a Service                        {/* Button label */}
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
