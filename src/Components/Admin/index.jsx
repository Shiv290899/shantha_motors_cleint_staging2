import React from "react";
import { Tabs, Grid, Typography } from "antd";
import Branches from "./Branches";
import StockUpdate from "../StockUpdate";
import InStockUpdate from "../InStockUpdate";
import Users from "./Users";
import Bookings from "../Bookings";
import Quotations from "../Quotations";
import Announcements from "../Announcements";
import useAnnouncementBadge from "../../hooks/useAnnouncementBadge";
import Jobcards from "../Jobcards";
// Announcements tab/banner removed as requested

const { Title, Paragraph } = Typography;

export default function Admin() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const container = { maxWidth: 1200, margin: "0 auto", padding: isMobile ? 12 : 16 };

  const Placeholder = ({ title, desc }) => (
    <div style={{ padding: 12 }}>
      <Title level={4} style={{ marginTop: 0 }}>{title}</Title>
      <Paragraph style={{ marginBottom: 0 }}>{desc}</Paragraph>
    </div>
  );

  const { hasNew, latestItem } = useAnnouncementBadge();
  const pillColor = (t) => (t === 'alert' ? '#fa541c' : t === 'warning' ? '#faad14' : '#2f54eb');
  const NewPill = () => hasNew ? (
    <span style={{ marginLeft:6, padding:'0 6px', borderRadius:10, fontSize:11, color:'#fff', fontWeight:700, background:pillColor(latestItem?.type), display:'inline-block', animation:'annPulse 1.6s ease-in-out infinite' }}>NEW</span>
  ) : null;
  const items = [
    // 1) Quotations, 2) Job Cards, 3) Bookings
    { key: "quotations", label: "Quotations", children: <Quotations /> },
    { key: "jobcards", label: "Job Cards", children: <Jobcards /> },
    { key: "bookings", label: "Bookings", children: <Bookings /> },
    // 4) Stock Update, 5) In-Stock Update
    { key: "stock", label: "Stock Update", children: <StockUpdate /> },
    { key: "in-stock", label: "In-Stock Update", children: <InStockUpdate /> },
    // 6) Branches, 7) Users, 8) Announcements
    { key: "branches", label: "Branches", children: <Branches /> },
    { key: "users", label: "Users", children: <Users /> },
    { key: "announcements", label: (<><style>{`@keyframes annPulse{0%{transform:scale(1);}60%{transform:scale(1.05);}100%{transform:scale(1);}}`}</style><span>Announcements<NewPill/></span></>), children: <Announcements /> },
    // 9) Analytics & Reports, 10) Branch-level Sales, 11) Multi-branch Compare, 12) Sales Performance
    { key: "analytics", label: "Analytics & Reports", children: (
        <Placeholder title="Analytics & Reports" desc="KPIs, trends, and printable/exportable reports. (UI coming soon)" />
      ) },
    { key: "branchSales", label: "Branch-level Sales", children: (
        <Placeholder title="Branch-level Sales" desc="Sales metrics per branch with filters. (UI coming soon)" />
      ) },
    { key: "multiBranch", label: "Multi-branch Compare", children: (
        <Placeholder title="Multi-branch Comparison" desc="Compare branches across time periods. (UI coming soon)" />
      ) },
    { key: "performance", label: "Sales Performance", children: (
        <Placeholder title="Sales Performance Tracking" desc="Targets vs actuals and leaderboards. (UI coming soon)" />
      ) },
  ];

  return (
    <div style={container}>
      <h2 style={{ marginTop: 0 }}>Admin Dashboard</h2>
      <Tabs
        defaultActiveKey="quotations"
        items={items}
        destroyInactiveTabPane
        size={isMobile ? "small" : "middle"}
        tabBarGutter={isMobile ? 8 : 16}
        tabBarStyle={{ marginBottom: isMobile ? 8 : 12 }}
        style={{ width: "100%" }}
      />
    </div>
  );
}
