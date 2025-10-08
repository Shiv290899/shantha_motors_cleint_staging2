import React from "react";
import { Tabs, Grid } from "antd";
import { ToolOutlined, SoundOutlined } from "@ant-design/icons";
import JobCard from "../JobCard";
import Announcements from "../Announcements";

export default function Mechanic() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
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
      key: "jobcard",
      label: tabLabel(<ToolOutlined />, "Job Card"),
      children: (
        <div style={wrap}>
          <JobCard />
        </div>
      ),
    },
    {
      key: "announcements",
      label: tabLabel(<SoundOutlined />, "Announcements"),
      children: (
        <div style={wrap}>
          <Announcements />
        </div>
      ),
    },
  ];

  return (
    <div style={container}>
      <h2 style={{ marginTop: 0 }}>Mechanic Dashboard</h2>
      <Tabs
        defaultActiveKey="jobcard"
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
