import React from "react";
import { Tabs, Grid } from "antd";
// Replaced Ant icons with simple emojis for clearer tab labels

import Quotation from "../Quotation";
import JobCard from "../JobCard";
import BookingForm from "../BookingForm";
import InStockUpdate from "../InStockUpdate";
import StockUpdate from "../StockUpdate";
import FollowUpsTabs from "../FollowUpsTabs";
import Announcements from "../Announcements";
import MinorSales from "../MinorSales";
import VehicleSearch from "../VehicleSearch";
import useAnnouncementBadge from "../../hooks/useAnnouncementBadge";
import { GetCurrentUser } from "../../apiCalls/users";
import StaffAccountCard from "../StaffAccountCard";



export default function Staff() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md; // < md considered mobile/tablet portrait
  const [branchName, setBranchName] = React.useState("");

  const container = { maxWidth: 1200, margin: "0 auto", padding: isMobile ? 12 : 16 };
  const wrap = { paddingTop: 12, width: "100%", overflowX: "auto", minWidth: 0 };
  const { hasNew, latestItem } = useAnnouncementBadge();
  const pillColor = (t) => (t === 'alert' ? '#fa541c' : t === 'warning' ? '#faad14' : '#2f54eb');
  const NewPill = () => hasNew ? (
    <span style={{
      marginLeft: 6,
      padding: '0 6px',
      borderRadius: 10,
      fontSize: 11,
      color: '#fff',
      fontWeight: 700,
      background: pillColor(latestItem?.type),
      display: 'inline-block',
      animation: 'annPulse 1.6s ease-in-out infinite'
    }}>NEW</span>
  ) : null;

  const tabLabel = (emoji, text) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span aria-hidden style={{ fontSize: 16 }}>{emoji}</span>
      <span>{text}</span>
    </span>
  );

  // Resolve branch name for the logged-in staff
  React.useEffect(() => {
    (async () => {
      try {
        let user = null;
        try { const raw = localStorage.getItem('user'); user = raw ? JSON.parse(raw) : null; } catch { /* ignore */ }
        if (!user) {
          const resp = await GetCurrentUser().catch(() => null);
          if (resp?.success && resp.data) { user = resp.data; try { localStorage.setItem('user', JSON.stringify(user)); } catch { /* ignore */ } }
        }
        const bn = user?.formDefaults?.branchName || user?.primaryBranch?.name || (Array.isArray(user?.branches) ? (typeof user.branches[0] === 'string' ? user.branches[0] : (user.branches[0]?.name || '')) : '');
        setBranchName(bn || "");
      } catch { setBranchName(""); }
    })();
  }, []);

  const items = [
    {
      key: "quotation",
      label: tabLabel('🧾', "Quotation"),
      children: (
        <div style={wrap}>
          <Quotation />
        </div>
      ),
    },
    {
      key: "jobcard",
      label: tabLabel('🔧', "Job Card"),
      children: (
        <div style={wrap}>
          <JobCard />
        </div>
      ),
    },
    {
      key: "followups",
      label: tabLabel('📞', "Follow-ups"),
      children: (
        <div style={wrap}>
          <FollowUpsTabs />
        </div>
      ),
    },
    {
      key: "booking",
      label: tabLabel('📅', "Booking"),
      children: (
        <div style={wrap}>
          <BookingForm />
        </div>
      ),
    },
    {
      key: "vehicle-search",
      label: tabLabel('🏍️', "Vehicle Search"),
      children: (
        <div style={wrap}>
          <VehicleSearch />
        </div>
      ),
    },
    {
      key: "stock",
      label: tabLabel('🔎', "Stock Finder"),
      children: (
        <div style={wrap}>
          <InStockUpdate />
        </div>
      ),
    },
    {
      key: "stock-update",
      label: tabLabel('📦', "Stock Update"),
      children: (
        <div style={wrap}>
          <StockUpdate />
        </div>
      ),
    },
    {
      key: "minorsales",
      label: (
        <>
          <style>{`@keyframes annPulse{0%{transform:scale(1);}60%{transform:scale(1.05);}100%{transform:scale(1);}}`}</style>
          <span>{tabLabel('🛒', "Minor Sales")}<NewPill/></span>
        </>
      ),
      children: (
        <div style={wrap}>
          <MinorSales />
        </div>
      ),
    },
    {
      key: "account",
      label: tabLabel('💼', 'Account'),
      children: (
        <div style={wrap}>
          <StaffAccountCard />
        </div>
      ),
    },

    {
      key: "announcements",
      label: (
        <>
          <style>{`@keyframes annPulse{0%{transform:scale(1);}60%{transform:scale(1.05);}100%{transform:scale(1);}}`}</style>
          <span>{tabLabel('📣', "Announcements")}<NewPill/></span>
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
      <h2
        style={{
          marginTop: 0,
          display: "flex",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: isMobile ? 8 : 12,
          lineHeight: 1.15,
        }}
      >
        <span>Staff Dashboard</span>
        {branchName ? (
          <span
            title="Your branch"
            style={{
              marginLeft: 0,
              fontSize: isMobile ? 18 : 28,
              fontWeight: 800,
              letterSpacing: 0.3,
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              lineHeight: 1.1,
              background: "linear-gradient(90deg,#2f54eb 0%, #13c2c2 45%, #52c41a 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              textShadow: "0 1px 1px rgba(0,0,0,0.08)",
            }}
          >
            {branchName}
          </span>
        ) : null}
      </h2>
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
