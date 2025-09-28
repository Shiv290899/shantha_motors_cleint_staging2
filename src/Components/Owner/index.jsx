import React from 'react'
import { Tabs } from 'antd'

// Owner dashboard: Analytics & Reports in tabs
export default function OwnerIndex() {
  const styles = {
    wrap: { maxWidth: 1100, margin: '32px auto', padding: '0 16px' },
    h1: { fontSize: 28, marginBottom: 8 },
    sub: { color: '#6b7280', marginBottom: 20 },
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
    { key: 'branch', label: 'Branch-level Sales', children: <BranchSales /> },
    { key: 'compare', label: 'Multi-branch Compare', children: <MultiBranchCompare /> },
    { key: 'performance', label: 'Sales Performance', children: <SalesPerformance /> },
  ]

  return (
    <div style={styles.wrap}>
      <h1 style={styles.h1}>Analytics & Reports</h1>
      <div style={styles.sub}>Owner insights across all branches</div>
      <Tabs defaultActiveKey="branch" items={items} animated />
    </div>
  )
}
