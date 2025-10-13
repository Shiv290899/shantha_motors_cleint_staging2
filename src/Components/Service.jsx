import React from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  Row,
  Space,
  Table,
  Typography,
  message,
  Tag,
} from "antd";
import { PhoneFilled, WhatsAppOutlined, AimOutlined, EnvironmentFilled } from "@ant-design/icons";
import { SHOWROOMS } from "../data/showrooms";
import { SALES_NUMBERS, SALES_DISPLAY, SALES_TEL_LINK, SALES_WHATSAPP_LINK, BUSINESS_HOURS } from "../data/contactInfo";

const { Title, Paragraph, Text } = Typography;

export default function Service() {
  const [form] = Form.useForm();

  const onSubmit = async () => {
    message.success("Service request submitted. We will call you shortly.");
    form.resetFields();
  };

  const tableScooter = {
    columns: [
      { title: "Plan", dataIndex: "plan" },
      { title: "Extra Months", dataIndex: "months", width: 140 },
      { title: "Extra KMs", dataIndex: "kms", width: 140 },
    ],
    data: [
      { key: 1, plan: "3Y + 1Y", months: 12, kms: "12,000" },
      { key: 2, plan: "3Y + 2Y", months: 24, kms: "24,000" },
      { key: 3, plan: "3Y + 3Y", months: 36, kms: "36,000" },
    ],
  };

  const tableMotorcycle = {
    columns: [
      { title: "Plan", dataIndex: "plan" },
      { title: "Extra Months", dataIndex: "months", width: 140 },
      { title: "Extra KMs", dataIndex: "kms", width: 140 },
    ],
    data: [
      { key: 1, plan: "3Y + 1Y", months: 12, kms: "16,000" },
      { key: 2, plan: "3Y + 2Y", months: 24, kms: "28,000" },
      { key: 3, plan: "3Y + 3Y", months: 36, kms: "40,000" },
    ],
  };

  const container = { maxWidth: 1100, margin: "0 auto", padding: 16 };
  const section = { padding: "24px 0" };
  const heroImgSrc = "/about-bike.jpg"; // public asset fallback

  // Phone helpers (reuse same approach as Contact.jsx, simplified)
  const digits = (num) => (num || "").replace(/\D/g, "");
  const toIN = (d) => {
    if (!d) return null;
    if (d.startsWith("91") && d.length === 12) return `+${d}`;
    if (d.length === 10) return `+91${d}`;
    if (d.startsWith("+")) return d; return `+${d}`;
  };
  const tel = (num) => { const d = toIN(digits(num)); return d ? `tel:${d}` : null; };
  const wa = (num) => { const d = toIN(digits(num)); return d ? `https://wa.me/${d.replace("+","")}` : null; };
  const toEmbed = (url) => { try { const u = new URL(url); if (u.hostname.includes("google")||u.hostname.includes("maps")) { if(!u.searchParams.has("output")) u.searchParams.set("output","embed"); return u.toString(); } } catch{
    //gyiuyiy
  } return null; };

  return (
    <div>
      {/* Top help bar */}
      <div style={{ background: "#0f172a", color: "#fff" }}>
        <div style={container}>
          <Row align="middle" justify="space-between" gutter={12} style={{ padding: "8px 0" }}>
            <Col>
              <Text style={{ color: "#fff" }}>
                Sales & Service: <strong>{SALES_DISPLAY}</strong>
                {SALES_NUMBERS?.[0] && (
                  <>
                    {" "}
                    <a href={SALES_TEL_LINK} style={{ color: "#93c5fd", marginLeft: 6 }}>Call</a>
                    {" "}
                    <span style={{ opacity: 0.5 }}>|</span>
                    {" "}
                    <a href={SALES_WHATSAPP_LINK} target="_blank" rel="noopener" style={{ color: "#93c5fd", marginLeft: 6 }}>WhatsApp</a>
                  </>
                )}
              </Text>
            </Col>
            <Col>
              <Text style={{ color: "#e2e8f0", opacity: 0.85 }}>Hours: {BUSINESS_HOURS.replaceAll("-", "•")}</Text>
            </Col>
          </Row>
        </div>
      </div>

      {/* Hero */}
      <section id="service" style={{ ...section }}>
        <div style={container}>
          <Row gutter={[24, 24]} align="middle">
            <Col xs={24} md={12}>
              <Title level={1} style={{ marginBottom: 0 }}>Service</Title>
              <Title level={2} style={{ marginTop: 8 }}>We love to care for your ride.</Title>
              <Paragraph type="secondary">
                Shantha Motors operates manufacturer‑grade workshops with trained technicians,
                genuine spares and modern diagnostic tools. From routine service to accident repair,
                we’ve got you covered.
              </Paragraph>
              <Space size="middle" wrap>
                <Button type="primary" size="large" href="#book">Book a Slot</Button>
                <Button size="large" href="#whatsapp">WhatsApp Us</Button>
              </Space>
              <div style={{ marginTop: 12 }}>
                <Text type="secondary">Customer Care: </Text>
                <a href={SALES_TEL_LINK}>{SALES_NUMBERS?.[0]}</a>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <img
                src={heroImgSrc}
                alt="Workshop"
                style={{ width: "100%", height: 320, objectFit: "cover", borderRadius: 16, boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            </Col>
          </Row>
        </div>
      </section>

      {/* Locations (from shared data) */}
      <section id="locations" style={{ ...section, background: "#f8fafc" }}>
        <div style={container}>
          <Title level={2}>Locations</Title>
          <Row gutter={[16, 16]} style={{ marginTop: 12 }}>
            {SHOWROOMS.map((s, i) => {
              const embed = toEmbed(s.mapUrl);
              return (
                <Col xs={24} md={12} lg={8} key={s.id || i}>
                  <Card bordered hoverable title={
                    <Space align="center">
                      <EnvironmentFilled />
                      <span>{s.name}</span>
                      {s.isPrimary && <Tag color="blue">Primary</Tag>}
                    </Space>
                  }>
                    <Space direction="vertical" size={8} style={{ width: "100%" }}>
                      <Text>{s.address}</Text>
                      <Space wrap>
                        {s.phone ? (
                          <>
                            <Button type="primary" icon={<PhoneFilled />} href={tel(s.phone)}>Call</Button>
                            <Button icon={<WhatsAppOutlined />} href={wa(s.phone)} target="_blank" rel="noopener">WhatsApp</Button>
                          </>
                        ) : (
                          <Tag>Phone not available</Tag>
                        )}
                        <Button icon={<AimOutlined />} href={s.mapUrl} target="_blank" rel="noopener">Open in Maps</Button>
                      </Space>
                      {embed && (
                        <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #f0f0f0" }}>
                          <iframe title={`${s.name} map`} src={embed} width="100%" height={200} style={{ border: 0, display: "block" }} loading="lazy" />
                        </div>
                      )}
                    </Space>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </div>
      </section>

      {/* About services */}
      <section style={section}>
        <div style={container}>
          <Title level={2}>Know more about our service</Title>
          <Paragraph type="secondary">
            Our service bays, tools and processes follow OEM guidelines. All technicians undergo periodic certification.
            We focus on first‑time‑right repair quality, transparent billing and quick turnaround.
          </Paragraph>
          <Row gutter={[16, 16]} style={{ marginTop: 12 }}>
            <Col xs={24} md={12}>
              <Card bordered>
                <Title level={4} style={{ marginTop: 0 }}>What we offer</Title>
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  {[
                    "Online service booking",
                    "Doorstep pick‑up & drop",
                    "Roadside assistance",
                    "Free / paid periodic services",
                    "Wear & tear repairs",
                    "Accident / body repairs",
                    "Customization & accessories fitment",
                    "Genuine spares & engine oil",
                    "Insurance claim support",
                  ].map((t, i) => (
                    <li key={i} style={{ marginBottom: 8 }}>{t}</li>
                  ))}
                </ul>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card bordered>
                <Title level={4} style={{ marginTop: 0 }}>Why choose us</Title>
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  {[
                    "OEM‑approved methods & torque specs",
                    "Transparent estimates & updates",
                    "Warranty‑safe procedures",
                    "Quick‑service lanes",
                    "Customer lounge & live status",
                  ].map((t, i) => (
                    <li key={i} style={{ marginBottom: 8 }}>{t}</li>
                  ))}
                </ul>
              </Card>
            </Col>
          </Row>
        </div>
      </section>

      {/* Extended Warranty */}
      <section style={{ ...section, background: "#f8fafc" }}>
        <div style={container}>
          <Title level={2}>Extended Warranty</Title>
          <Paragraph type="secondary">
            Protect your two‑wheeler beyond the standard warranty with comprehensive coverage on major components and related labour.
          </Paragraph>
          <Row gutter={[16, 16]} style={{ marginTop: 12 }}>
            <Col xs={24} md={12}>
              <Card bordered>
                <Title level={4} style={{ marginTop: 0 }}>For Scooters</Title>
                <Table
                  size="small"
                  pagination={false}
                  columns={tableScooter.columns}
                  dataSource={tableScooter.data}
                />
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card bordered>
                <Title level={4} style={{ marginTop: 0 }}>For Motorcycles</Title>
                <Table
                  size="small"
                  pagination={false}
                  columns={tableMotorcycle.columns}
                  dataSource={tableMotorcycle.data}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 12 }}>
            <Col xs={24} md={12}>
              <Card bordered>
                <Title level={4} style={{ marginTop: 0 }}>Highlights</Title>
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  {[
                    "Major parts covered at minimal cost",
                    "Genuine spares & trained technicians",
                    "Pan‑India validity (as per OEM)",
                    "Transferable on resale",
                  ].map((t, i) => (
                    <li key={i} style={{ marginBottom: 8 }}>{t}</li>
                  ))}
                </ul>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card bordered>
                <Title level={4} style={{ marginTop: 0 }}>Benefits</Title>
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  {[
                    "Fast, quality replacement for up to 5 years",
                    "Lower ownership cost over time",
                    "Better resale value",
                    "Peace of mind wherever you ride",
                  ].map((t, i) => (
                    <li key={i} style={{ marginBottom: 8 }}>{t}</li>
                  ))}
                </ul>
              </Card>
            </Col>
          </Row>
        </div>
      </section>

      {/* AMC */}
      <section id="amc" style={section}>
        <div style={container}>
          <Title level={2}>Annual Maintenance Contract (AMC)</Title>
          <Paragraph type="secondary">
            Get a year of scheduled maintenance at a discounted bundle price after your free services are over.
          </Paragraph>
          <Row gutter={[16, 16]} style={{ marginTop: 12 }}>
            {[
              { big: "30%", sub: "Savings (up to)" },
              { big: "4", sub: "Maintenance visits" },
              { big: "2", sub: "Free wash" },
              { big: "10%", sub: "Labour discount" },
              { big: "5%", sub: "Parts & oil discount" },
            ].map((k, i) => (
              <Col xs={12} md={4} key={i}>
                <Card bordered style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>{k.big}</div>
                  <div style={{ color: "#64748b", marginTop: 6 }}>{k.sub}</div>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* RSA */}
      <section id="rsa" style={{ ...section, background: "#f8fafc" }}>
        <div style={container}>
          <Title level={2}>Roadside Assistance</Title>
          <Paragraph type="secondary">
            Stuck with a puncture, drained battery or breakdown? Call us — we’ll help on the spot or arrange towing to the nearest Shantha Motors workshop.
          </Paragraph>
          <Row gutter={[16, 16]} style={{ marginTop: 12 }}>
            {[
              { h: "Phone Support", p: "Guidance and triage over call" },
              { h: "On‑road Repairs", p: "Minor mechanical & electrical fixes" },
              { h: "Towing & Fuel", p: "Towing to service center, fuel delivery*" },
            ].map((x, i) => (
              <Col xs={24} md={8} key={i}>
                <Card bordered>
                  <Title level={4} style={{ marginTop: 0 }}>{x.h}</Title>
                  <Paragraph type="secondary">{x.p}</Paragraph>
                </Card>
              </Col>
            ))}
          </Row>
          <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
            *Fuel charged as per actuals. Coverage typically up to 25 km from dealership; ask your branch for limits.
          </Paragraph>
        </div>
      </section>

      {/* Engine Health Assurance */}
      <section id="engine-health" style={section}>
        <div style={container}>
          <Title level={2}>Engine Health Assurance</Title>
          <Paragraph type="secondary">Assurance on engine work carried out at Shantha Motors after the standard/extended warranty period.</Paragraph>
          <Row gutter={[16, 16]} style={{ marginTop: 12 }}>
            {[
              { big: "1 Year", sub: "or 12,000 km (whichever earlier)" },
              { big: "1 Free", sub: "Engine service" },
              { big: "Genuine", sub: "OEM parts & procedures" },
            ].map((k, i) => (
              <Col xs={24} md={8} key={i}>
                <Card bordered style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>{k.big}</div>
                  <div style={{ color: "#64748b", marginTop: 6 }}>{k.sub}</div>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* Terms */}
      <section id="terms" style={{ ...section, background: "#f8fafc" }}>
        <div style={container}>
          <Title level={2}>Terms & Conditions</Title>
          <ul style={{ paddingLeft: 18, marginTop: 12 }}>
            {[
              "Programs and benefits vary by OEM and model. Please check exact coverage with your branch.",
              "All images are placeholders; vehicle visuals may differ.",
              "Prices, plans and discounts are indicative and may change without notice.",
            ].map((t, i) => (
              <li key={i} style={{ marginBottom: 8 }}>{t}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Booking */}
      <section id="book" style={section}>
        <div style={container}>
          <Card style={{ background: "linear-gradient(90deg,#1d4ed8,#3b82f6)", color: "#fff" }}>
            <Title level={2} style={{ color: "#fff", marginTop: 0 }}>Book Your Service</Title>
            <Paragraph style={{ color: "#e2e8f0" }}>Fill your details and we’ll confirm your slot.</Paragraph>
            <Form
              form={form}
              layout="vertical"
              onFinish={onSubmit}
              style={{ marginTop: 12 }}
            >
              <Row gutter={[12, 12]}>
                <Col xs={24} sm={12} md={8}>
                  <Form.Item name="name" label={<Text style={{ color: "#fff" }}>Full Name</Text>} rules={[{ required: true }]}>
                    <Input placeholder="Full Name" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <Form.Item name="mobile" label={<Text style={{ color: "#fff" }}>Mobile Number</Text>} rules={[{ required: true }]}>
                    <Input placeholder="Mobile Number" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <Form.Item name="model" label={<Text style={{ color: "#fff" }}>Vehicle Model</Text>}>
                    <Input placeholder="Vehicle Model" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={16}>
                  <Form.Item name="date" label={<Text style={{ color: "#fff" }}>Preferred Date</Text>}>
                    <Input placeholder="YYYY-MM-DD" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <Form.Item label={<span />} colon={false}>
                    <Button htmlType="submit" size="large">Submit Request</Button>
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </Card>
        </div>
      </section>

      {/* Footer in-page note (main footer is global) */}
      <div style={{ ...section, paddingTop: 0 }}>
        <div style={container}>
          <Divider style={{ marginTop: 0 }} />
          <Space size="large" wrap>
            <Text>© {new Date().getFullYear()} Shantha Motors</Text>
            <a href="#terms">Terms & Conditions</a>
            <a href="#">Privacy</a>
          </Space>
        </div>
      </div>
    </div>
  );
}
