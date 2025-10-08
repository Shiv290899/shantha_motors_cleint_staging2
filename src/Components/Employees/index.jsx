import React from "react";
import { Tabs, Grid, List, Typography } from "antd";
import { CheckSquareOutlined, SoundOutlined } from "@ant-design/icons";
import Announcements from "../Announcements";

const { Text } = Typography;

export default function Employees() {
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

  const sampleTasks = [
    { title: "Follow up pending quotations", due: "Today" },
    { title: "Update stock entries", due: "Today" },
    { title: "Close yesterday job cards", due: "Tomorrow" },
  ];

  const items = [
    {
      key: "tasks",
      label: tabLabel(<CheckSquareOutlined />, "Tasks"),
      children: (
        <div style={wrap}>
          <List
            bordered
            dataSource={sampleTasks}
            renderItem={(t) => (
              <List.Item>
                <Text strong>{t.title}</Text>
                <span style={{ marginLeft: "auto", color: "rgba(0,0,0,0.45)" }}>{t.due}</span>
              </List.Item>
            )}
          />
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
      <h2 style={{ marginTop: 0 }}>Employees Dashboard</h2>
      <Tabs
        defaultActiveKey="tasks"
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
