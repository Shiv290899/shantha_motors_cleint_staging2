import React from "react";
import { Tabs, Grid } from "antd";
import { FileTextOutlined, ToolOutlined, CalendarOutlined, SoundOutlined, AppstoreAddOutlined } from "@ant-design/icons";

import Quotation from "../Quotation";
import JobCard from "../JobCard";
import BookingForm from "../BookingForm";

export default function Staff() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md; // < md considered mobile/tablet portrait

  const items = [
    {
      key: "stock",
      label: (
        <span>
          <AppstoreAddOutlined /> Stock Updates
        </span>
      ),
      children: (
        <div style={{ paddingTop: 12 }}>
          <div style={{ padding: 12, border: "1px dashed #d9d9d9", borderRadius: 8 }}>
            Record vehicle stock changes and availability. (UI coming soon)
          </div>
        </div>
      ),
    },
    {
      key: "quotation",
      label: (
        <span>
          <FileTextOutlined /> Quotation
        </span>
      ),
      children: (
        <div style={{ paddingTop: 12, width: "100%", overflowX: "auto" }}>
          <Quotation />
        </div>
      ),
    },
    {
      key: "jobcard",
      label: (
        <span>
          <ToolOutlined /> Job Card
        </span>
      ),
      children: (
        <div style={{ paddingTop: 12, width: "100%", overflowX: "auto" }}>
          <JobCard />
        </div>
      ),
    },
    {
      key: "booking",
      label: (
        <span>
          <CalendarOutlined /> Booking
        </span>
      ),
      children: (
        <div style={{ paddingTop: 12, width: "100%", overflowX: "auto" }}>
          <BookingForm />
        </div>
      ),
    },
    {
      key: "announcements",
      label: (
        <span>
          <SoundOutlined /> Announcements
        </span>
      ),
      children: (
        <div style={{ paddingTop: 12 }}>
          <div style={{ padding: 12, border: "1px dashed #d9d9d9", borderRadius: 8 }}>
            Branch-wide messages and notices. (UI coming soon)
          </div>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: isMobile ? 12 : 16 }}>
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
