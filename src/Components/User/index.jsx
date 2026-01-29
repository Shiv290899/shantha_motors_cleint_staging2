import React from "react";
import { Tabs, Grid } from "antd";
import { HomeOutlined, FileTextOutlined, GiftOutlined, EnvironmentOutlined } from "@ant-design/icons";
import Home from "../Home";
import Quotation from "../Quotation";
import Contact from "../Contact";

export default function User() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const items = [
    {
      key: "home",
      label: (
        <span><HomeOutlined /> Home</span>
      ),
      children: (
        <div style={{ paddingTop: 12 }}>
          <Home />
        </div>
      ),
    },
    {
      key: "quotation",
      label: (
        <span><FileTextOutlined /> Quotation Request</span>
      ),
      children: (
        <div style={{ paddingTop: 12, width: "100%", overflowX: "auto" }}>
          <Quotation />
        </div>
      ),
    },
    {
      key: "offers",
      label: (
        <span><GiftOutlined /> Offers & Discounts</span>
      ),
      children: (
        <div style={{ paddingTop: 12 }}>
          <div style={{ padding: 12, border: "1px dashed #d9d9d9", borderRadius: 8 }}>
            Coming soon: seasonal offers and branch-specific discounts.
          </div>
        </div>
      ),
    },
    {
      key: "location",
      label: (
        <span><EnvironmentOutlined /> Locations</span>
      ),
      children: (
        <div style={{ paddingTop: 12 }}>
          <Contact />
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: isMobile ? 12 : 16 }}>
      <h2 style={{ marginTop: 0 }}>User</h2>
      <Tabs
        defaultActiveKey="home"
        items={items}
        destroyInactiveTabPane
        size={isMobile ? "small" : "middle"}
        tabBarGutter={isMobile ? 8 : 16}
      />
    </div>
  );
}
