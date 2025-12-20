import React from "react";
import { Tabs, Grid } from "antd";
import { ToolOutlined, SoundOutlined } from "@ant-design/icons";
import JobCard from "../JobCard";
import Announcements from "../Announcements";
import useAnnouncementBadge from "../../hooks/useAnnouncementBadge";

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
  const { hasNew, latestItem } = useAnnouncementBadge();
  const pillColor = (t) => (t === 'alert' ? '#fa541c' : t === 'warning' ? '#faad14' : '#2f54eb');
  const NewPill = () => hasNew ? (
    <span style={{ marginLeft:6, padding:'0 6px', borderRadius:10, fontSize:11, color:'#fff', fontWeight:700, background:pillColor(latestItem?.type), display:'inline-block', animation: 'annPulse 1.6s ease-in-out infinite' }}>NEW</span>
  ) : null;

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
