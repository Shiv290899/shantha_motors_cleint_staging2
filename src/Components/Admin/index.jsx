import React from "react";
import { Tabs, Grid, Typography } from "antd";
import Branches from "./Branches";
import StockUpdate from "../StockUpdate";
import Users from "./Users";

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

  const items = [
    {
      key: "branches",
      label: "CRUD Branches",
      children: <Branches />,
    },
    {
      key: "users",
      label: "CRUD Users",
      children: <Users />,
    },
    {
      key: "stock",
      label: "Stock Update",
      children: <StockUpdate />,
    },
    {
      key: "analytics",
      label: "Analytics & Reports",
      children: (
        <Placeholder
          title="Analytics & Reports"
          desc="KPIs, trends, and printable/exportable reports. (UI coming soon)"
        />
      ),
    },
    {
      key: "branchSales",
      label: "Branch-level Sales",
      children: (
        <Placeholder
          title="Branch-level Sales"
          desc="Sales metrics per branch with filters. (UI coming soon)"
        />
      ),
    },
    {
      key: "multiBranch",
      label: "Multi-branch Compare",
      children: (
        <Placeholder
          title="Multi-branch Comparison"
          desc="Compare branches across time periods. (UI coming soon)"
        />
      ),
    },
    {
      key: "performance",
      label: "Sales Performance",
      children: (
        <Placeholder
          title="Sales Performance Tracking"
          desc="Targets vs actuals and leaderboards. (UI coming soon)"
        />
      ),
    },
  ];

  return (
    <div style={container}>
      <h2 style={{ marginTop: 0 }}>Admin Dashboard</h2>
      <Tabs
        defaultActiveKey="branches"
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
