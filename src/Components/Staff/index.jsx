import React from "react";
import { Tabs, Grid } from "antd";
import { FileTextOutlined, ToolOutlined, CalendarOutlined, SoundOutlined, AppstoreAddOutlined, PhoneOutlined } from "@ant-design/icons";
// dynamic new pill (animated) on tab label

import Quotation from "../Quotation";
import JobCard from "../JobCard";
import BookingForm from "../BookingForm";
import StockUpdate from "../StockUpdate";
import FollowUpsTabs from "../FollowUpsTabs";
import Announcements from "../Announcements";
import useAnnouncementBadge from "../../hooks/useAnnouncementBadge";

export default function Staff() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md; // < md considered mobile/tablet portrait

  const container = { maxWidth: 1200, margin: "0 auto", padding: isMobile ? 12 : 16 };
  const wrap = { paddingTop: 12, width: "100%", overflowX: "auto", minWidth: 0 };
  const { hasNew, latestItem } = useAnnouncementBadge();
  const pillColor = (t) => (t === 'alert' ? '#fa541c' : t === 'warning' ? '#faad14' : '#2f54eb');
  const NewPill = () => hasNew ? (
    <span style={{
      marginLeft: 6,
      padding: '0 6px',
      borderRadius: 10,
      fontSize: 11,
      color: '#fff',
      fontWeight: 700,
      background: pillColor(latestItem?.type),
      display: 'inline-block',
      animation: 'annPulse 1.6s ease-in-out infinite'
    }}>NEW</span>
  ) : null;
  const tabLabel = (icon, text) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {icon}
      <span>{text}</span>
    </span>
  );

  const items = [
    {
      key: "quotation",
      label: tabLabel(<FileTextOutlined />, "Quotation"),
      children: (
        <div style={wrap}>
          <Quotation />
        </div>
      ),
    },
    {
      key: "jobcard",
      label: tabLabel(<ToolOutlined />, "Job Card"),
      children: (
        <div style={wrap}>
          <JobCard />
        </div>
      ),
    },
    {
      key: "followups",
      label: tabLabel(<PhoneOutlined />, "Follow-ups"),
      children: (
        <div style={wrap}>
          <FollowUpsTabs />
        </div>
      ),
    },
    
    
    {
      key: "booking",
      label: tabLabel(<CalendarOutlined />, "Booking"),
      children: (
        <div style={wrap}>
          <BookingForm />
        </div>
      ),
    },
    {
      key: "stock",
      label: tabLabel(<AppstoreAddOutlined />, "Stock Updates"),
      children: (
        <div style={wrap}>
         <StockUpdate/>
        </div>
      ),
    },
    {
      key: "announcements",
      label: (
        <>
          <style>{`@keyframes annPulse{0%{transform:scale(1);}60%{transform:scale(1.05);}100%{transform:scale(1);}}`}</style>
          <span>{tabLabel(<SoundOutlined />, "Announcements")}<NewPill/></span>
        </>
      ),
      children: (
        <div style={wrap}>
          <Announcements />
        </div>
      ),
    },
  ];

  return (
    <div style={container}>
      <h2 style={{ marginTop: 0 }}>Staff Dashboard</h2>
      <Tabs
        defaultActiveKey="quotation"
        items={items}
        tabPosition="top"
        size={isMobile ? "small" : "middle"}
        tabBarGutter={isMobile ? 8 : 16}
        tabBarStyle={{ marginBottom: isMobile ? 8 : 12 }}
        style={{ width: "100%" }}
        destroyInactiveTabPane
      />
    </div>
  );
}
