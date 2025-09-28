import React from "react";
import { Tabs, Grid } from "antd";
import { ToolOutlined, SoundOutlined } from "@ant-design/icons";
import JobCard from "../JobCard";
import Announcements from "../Announcements";

export default function Mechanic() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const items = [
    {
      key: "jobcard",
      label: (
        <span><ToolOutlined /> Job Card</span>
      ),
      children: (
        <div style={{ paddingTop: 12, width: "100%", overflowX: "auto" }}>
          <JobCard />
        </div>
      ),
    },
    {
      key: "announcements",
      label: (
        <span><SoundOutlined /> Announcements</span>
      ),
      children: (
        <div style={{ paddingTop: 12 }}>
          <Announcements />
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: isMobile ? 12 : 16 }}>
      <h2 style={{ marginTop: 0 }}>Mechanic Dashboard</h2>
      <Tabs
        defaultActiveKey="jobcard"
        items={items}
        destroyInactiveTabPane
        size={isMobile ? "small" : "middle"}
        tabBarGutter={isMobile ? 8 : 16}
      />
    </div>
  );
}
