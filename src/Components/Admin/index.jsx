import React from "react";
import { Tabs, Grid } from "antd";
import Branches from "./Branches";
import StockUpdate from "../StockUpdate";
import InStockUpdate from "../InStockUpdate";
import Users from "./Users";
import Bookings from "../Bookings";
import Quotations from "../Quotations";
import Announcements from "../Announcements";
import useAnnouncementBadge from "../../hooks/useAnnouncementBadge";
import Jobcards from "../Jobcards";
import AdminDailyCollections from '../AdminDailyCollections'
import VehicleSearch from '../VehicleSearch'
import VehicleCatalogManager from '../VehicleCatalogManager'
import Analytics from "./Analytics";
// Announcements tab/banner removed as requested

export default function Admin() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const container = { maxWidth: 1200, margin: "0 auto", padding: isMobile ? 12 : 16 };

  const { hasNew, latestItem } = useAnnouncementBadge();
  const pillColor = (t) => (t === 'alert' ? '#fa541c' : t === 'warning' ? '#faad14' : '#2f54eb');
  const NewPill = () => hasNew ? (
    <span style={{ marginLeft:6, padding:'0 6px', borderRadius:10, fontSize:11, color:'#fff', fontWeight:700, background:pillColor(latestItem?.type), display:'inline-block', animation:'annPulse 1.6s ease-in-out infinite' }}>NEW</span>
  ) : null;
  const items = [
    // 1) Quotations, 2) Job Cards, 3) Bookings
    { key: "quotations", label: "Quotations", children: <Quotations /> },
    { key: "jobcards", label: "Job Cards", children: <Jobcards /> },
    { key: "bookings", label: "Bookings", children: <Bookings /> },
    { key: "vehiclesearch", label: "Vehicle Search", children: <VehicleSearch /> },
    // 4) Stock Update, 5) In-Stock Update
   { key: 'stock', label: 'Stock Movements', children: <StockUpdate /> },
       { key: 'instock', label: 'Display Vehicles', children: <InStockUpdate /> },
    { key: 'collections', label: 'Daily Collections', children: <AdminDailyCollections /> },
    // 6) Branches, 7) Users, 8) Announcements
    { key: "branches", label: "Branches", children: <Branches /> },
    { key: "users", label: "Users", children: <Users /> },
    { key: 'vehiclecatalog', label: 'Vehicle Catalog', children: <VehicleCatalogManager csvFallbackUrl={import.meta.env.VITE_VEHICLE_SHEET_CSV_URL || "https://docs.google.com/spreadsheets/d/e/2PACX-1vQYGuNPY_2ivfS7MTX4bWiu1DWdF2mrHSCnmTznZVEHxNmsrgcGWjVZN4UDUTOzQQdXTnbeM-ylCJbB/pub?gid=408799621&single=true&output=csv"} /> },
    { key: "announcements", label: (<><style>{`@keyframes annPulse{0%{transform:scale(1);}60%{transform:scale(1.05);}100%{transform:scale(1);}}`}</style><span>Announcements<NewPill/></span></>), children: <Announcements /> },
    // 9) Analytics & Reports, 10) Branch-level Sales, 11) Multi-branch Compare, 12) Sales Performance
    { key: "analytics", label: "Analytics", children: <Analytics /> },
  ];

  return (
    <div style={container}>
     
      <Tabs
        defaultActiveKey="quotations"
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
