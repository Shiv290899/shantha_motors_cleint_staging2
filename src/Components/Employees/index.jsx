import React from "react";
import { Tabs, Grid, List, Typography } from "antd";
import { CheckSquareOutlined, SoundOutlined } from "@ant-design/icons";
import Announcements from "../Announcements";

const { Text } = Typography;

export default function Employees() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const sampleTasks = [
    { title: "Follow up pending quotations", due: "Today" },
    { title: "Update stock entries", due: "Today" },
    { title: "Close yesterday job cards", due: "Tomorrow" },
  ];

  const items = [
    {
      key: "tasks",
      label: (
        <span><CheckSquareOutlined /> Tasks</span>
      ),
      children: (
        <div style={{ paddingTop: 12 }}>
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
      <h2 style={{ marginTop: 0 }}>Employees Dashboard</h2>
      <Tabs
        defaultActiveKey="tasks"
        items={items}
        destroyInactiveTabPane
        size={isMobile ? "small" : "middle"}
        tabBarGutter={isMobile ? 8 : 16}
      />
    </div>
  );
}
