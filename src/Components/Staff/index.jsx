import React from "react";
import { Tabs, Grid } from "antd";
import { FileTextOutlined, ToolOutlined, CalendarOutlined, SoundOutlined, AppstoreAddOutlined, PhoneOutlined } from "@ant-design/icons";

import Quotation from "../Quotation";
import JobCard from "../JobCard";
import BookingForm from "../BookingForm";
import StockUpdate from "../StockUpdate";
import FollowUpsTabs from "../FollowUpsTabs";
// Announcements banner removed; keep placeholder tab content

export default function Staff() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md; // < md considered mobile/tablet portrait

  const container = { maxWidth: 1200, margin: "0 auto", padding: isMobile ? 12 : 16 };
  const wrap = { paddingTop: 12, width: "100%", overflowX: "auto", minWidth: 0 };
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
      label: tabLabel(<SoundOutlined />, "Announcements"),
      children: (
        <div style={wrap}>
          <div style={{ padding: 12, border: "1px dashed #d9d9d9", borderRadius: 8 }}>
            Branch-wide messages and notices. (UI coming soon)
          </div>
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
