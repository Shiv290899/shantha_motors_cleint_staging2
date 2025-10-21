import React from 'react'
import { Tabs, Grid } from 'antd'
import InStockUpdate from '../InStockUpdate'
import StockUpdate from '../StockUpdate'
import Bookings from '../Bookings'
import Quotations from '../Quotations'
import Jobcards from '../Jobcards'
import Branches from '../Admin/Branches'
import Users from '../Admin/Users'
// Announcements tab/banner removed as requested

// Owner dashboard: Analytics & Reports in tabs
export default function OwnerIndex() {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const styles = {
    wrap: { maxWidth: 1200, margin: '0 auto', padding: isMobile ? 12 : 16 },
    h1: { fontSize: 28, marginBottom: 4 },
    sub: { color: '#6b7280', marginBottom: 16 },
    panel: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 },
    h2: { fontSize: 18, fontWeight: 600, margin: '0 0 8px' },
    p: { color: '#4b5563', margin: 0 },
  }

  const BranchSales = () => (
    <div style={styles.panel}>
      <div style={styles.h2}>Branch-level Sales</div>
      <p style={styles.p}>Track sales and revenue by each branch. Add filters for branch, date range, and product lines.</p>
    </div>
  )

  const MultiBranchCompare = () => (
    <div style={styles.panel}>
      <div style={styles.h2}>Multi-branch Compare</div>
      <p style={styles.p}>Compare KPIs across branches over time. Useful for ranking and benchmarking.</p>
    </div>
  )

  const SalesPerformance = () => (
    <div style={styles.panel}>
      <div style={styles.h2}>Sales Performance</div>
      <p style={styles.p}>See top performers and conversion trends. Start with total bookings → quotations → job cards.</p>
    </div>
  )

  const items = [
    { key: 'branches', label: 'Branches', children: <Branches readOnly /> },
    { key: 'users', label: 'Users', children: <Users readOnly /> },
    { key: 'instock', label: 'In-Stock Update', children: <InStockUpdate /> },
    { key: 'stock', label: 'Stock Update', children: <StockUpdate /> },
    { key: 'bookings', label: 'Bookings', children: <Bookings /> },
    { key: 'quotations', label: 'Quotations', children: <Quotations /> },
    { key: 'jobcards', label: 'Job Cards', children: <Jobcards /> },
    { key: 'branch', label: 'Branch-level Sales', children: <BranchSales /> },
    { key: 'compare', label: 'Multi-branch Compare', children: <MultiBranchCompare /> },
    { key: 'performance', label: 'Sales Performance', children: <SalesPerformance /> },
  ]

  return (
    <div style={styles.wrap}>
      <h2 style={styles.h1}>Analytics & Reports</h2>
      <div style={styles.sub}>Owner insights across all branches</div>
      <Tabs
        defaultActiveKey="branches"
        items={items}
        animated
        size={isMobile ? 'small' : 'middle'}
        tabBarGutter={isMobile ? 8 : 16}
        tabBarStyle={{ marginBottom: isMobile ? 8 : 12 }}
        style={{ width: '100%' }}
      />
    </div>
  )
}
