// src/pages/Contact.jsx
import React from "react"; // React import

// Ant Design components
import {
  Card,
  Row,
  Col,
  Typography,
  Space,
  Button,
  Divider,
  Tag,
  Grid,
} from "antd";

// Ant Design icons
import {
  PhoneFilled,
  EnvironmentFilled,
  WhatsAppOutlined,
  AimOutlined,
} from "@ant-design/icons";

import { SHOWROOMS } from "../data/showrooms";

const { Title, Text } = Typography;          // Pull common Typography items
const { useBreakpoint } = Grid;              // Responsive breakpoints helper

/* ---------------------------
   Phone + WhatsApp helpers
   --------------------------- */

// Keep only digits from a string (handles nulls safely)
const digits = (num) => (num || "").replace(/\D/g, "");

// Normalize to Indian E.164-ish strings: +91XXXXXXXXXX
const toIN = (d) => {
  if (!d) return null;                       // No digits → no phone
  if (d.startsWith("91") && d.length === 12) return `+${d}`;   // Already 91 + 10-digit
  if (d.length === 10) return `+91${d}`;     // Local 10-digit → add +91
  if (d.startsWith("+")) return d;           // Already prefixed with +
  return `+${d}`;                            // Fallback: prefix with +
};

// Build tel: link if a valid phone exists
const tel = (num) => {
  const d = toIN(digits(num));
  return d ? `tel:${d}` : null;
};

// Build WhatsApp deep link if a valid phone exists
const wa = (num) => {
  const d = toIN(digits(num));
  return d ? `https://wa.me/${d.replace("+", "")}` : null;
};

// Quick check to decide whether to render call/wa buttons
const hasPhone = (num) => !!toIN(digits(num));

/* ------------------------------------
   Try to embed Google Maps when possible
   Accepts a full Google Maps URL or q-based URL
   Returns embeddable URL or null
   ------------------------------------ */
const toEmbed = (url) => {
  try {
    const u = new URL(url);
    if (u.hostname.includes("google") || u.hostname.includes("maps")) {
      if (!u.searchParams.has("output")) u.searchParams.set("output", "embed");
      return u.toString();
    }
  } catch {
    // Ignore invalid URLs
  }
  return null;
};

/* ------------------------------------
   Contact page component
   ------------------------------------ */
export default function Contact() {
  const screens = useBreakpoint();              // Read responsive breakpoints
  const isMobile = !screens.sm;                 // < 576px
  const isTablet = screens.sm && !screens.lg;   // 576–992px
  const containerPad = isMobile ? "16px 12px 40px" : "24px 16px 56px"; // Responsive padding
  const mapHeight = isMobile ? 180 : isTablet ? 220 : 260;             // Responsive map height

  return (
    <div
      style={{
        maxWidth: 1200,            // Layout container width
        margin: "0 auto",          // Center container
        padding: containerPad,     // Responsive padding
      }}
    >
      {/* Header */}
      <Space direction="vertical" size={4} style={{ width: "100%" }}>
        <Title level={2} style={{ marginBottom: 0 }}>
          Contact & Locations
        </Title>
        <Text type="secondary">
          Call, WhatsApp, or visit your nearest Shantha Motors showroom.
        </Text>
      </Space>

      <Divider style={{ margin: isMobile ? "16px 0" : "24px 0" }} />

      {/* Cards Grid */}
      <Row
        gutter={[
          { xs: 8, sm: 12, md: 16, lg: 16, xl: 20 }, // horizontal gutters
          { xs: 8, sm: 12, md: 16, lg: 16, xl: 20 }, // vertical gutters
        ]}
      >
        {SHOWROOMS.map((s, idx) => {
          const embed = toEmbed(s.mapUrl); // Precompute embed URL if possible

          return (
            <Col
              key={idx}
              xs={24}
              sm={24}
              md={12}
              lg={8}
              xl={8}
              style={{ display: "flex" }}     // Stretch cards equal height
            >
              <Card
                bordered
                hoverable
                style={{
                  borderRadius: 16,           // Soft corners
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                }}
                bodyStyle={{ padding: isMobile ? 14 : 16, flex: 1 }}
                title={
                  <Space align="center" wrap>
                    <EnvironmentFilled />
                    <span>{s.name}</span>
                    {s.isPrimary && <Tag color="blue">Primary</Tag>}
                  </Space>
                }
                // Neutral branch label (was hours)
                extra={
                  <Tag bordered={false} color="processing">
                    {s.isPrimary ? "Primary branch" : "Branch"}
                  </Tag>
                }
              >
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  {/* Phone */}
                  <Space direction="vertical" size={4}>
                    <Text strong>
                      <PhoneFilled /> Mobile
                    </Text>

                    {hasPhone(s.phone) ? (
                      <Space wrap>
                        {/* Show normalized copyable number */}
                        <Text copyable>{toIN(digits(s.phone))}</Text>

                        <Button
                          type="primary"
                          size="middle"
                          block={isMobile}
                          href={tel(s.phone)}
                          icon={<PhoneFilled />}
                        >
                          Call
                        </Button>

                        <Button
                          size="middle"
                          block={isMobile}
                          href={wa(s.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          icon={<WhatsAppOutlined />}
                        >
                          WhatsApp
                        </Button>
                      </Space>
                    ) : (
                      <Tag color="default">Phone not available</Tag>
                    )}
                  </Space>

                  {/* Address */}
                  <Space direction="vertical" size={4}>
                    <Text strong>
                      <EnvironmentFilled /> Address
                    </Text>
                    <Text style={{ lineHeight: 1.6 }}>{s.address}</Text>
                  </Space>

                  {/* Map / External Link */}
                  <Space wrap>
                    <Button
                      type="default"
                      size="middle"
                      block={isMobile}
                      href={s.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer" // Security best practice
                      icon={<AimOutlined />}
                    >
                      Open in Google Maps
                    </Button>
                  </Space>

                  {/* Inline map embed (if we could convert to an embed URL) */}
                  {embed ? (
                    <div
                      style={{
                        borderRadius: 12,
                        overflow: "hidden",
                        border: "1px solid #f0f0f0",
                      }}
                    >
                      <iframe
                        title={`${s.name} map`}
                        src={embed}
                        width="100%"
                        height={mapHeight}
                        style={{ border: 0, display: "block" }}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                  ) : null}
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );
}
