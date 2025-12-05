import React from 'react'
import { Tabs, Grid } from 'antd'
import InStockUpdate from '../InStockUpdate'
import StockUpdate from '../StockUpdate'
import Bookings from '../Bookings'
import Quotations from '../Quotations'
import Jobcards from '../Jobcards'
import Branches from '../Admin/Branches'
import Announcements from '../Announcements'
import useAnnouncementBadge from '../../hooks/useAnnouncementBadge'
import AdminDailyCollections from '../AdminDailyCollections'
import Users from '../Admin/Users'
// Announcements tab/banner removed as requested

// Owner dashboard: Analytics & Reports in tabs
export default function Backend() {
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

  


  const { hasNew, latestItem } = useAnnouncementBadge()
  const pillColor = (t) => (t === 'alert' ? '#fa541c' : t === 'warning' ? '#faad14' : '#2f54eb')
  const NewPill = () => hasNew ? (
    <span style={{ marginLeft:6, padding:'0 6px', borderRadius:10, fontSize:11, color:'#fff', fontWeight:700, background:pillColor(latestItem?.type), display:'inline-block', animation:'annPulse 1.6s ease-in-out infinite' }}>NEW</span>
  ) : null
  const items = [
    // 1) Quotation (form), 2) Quotations (list), 3) Job Cards, 4) Bookings
    { key: 'quotations', label: 'Quotations', children: <Quotations /> },
    { key: 'jobcards', label: 'Job Cards', children: <Jobcards /> },
    { key: 'bookings', label: 'Bookings', children: <Bookings /> },
    // 4) Stock Update, 5) In-Stock Update
    { key: 'stock', label: 'Stock Update', children: <StockUpdate /> },
    { key: 'instock', label: 'In-Stock Update', children: <InStockUpdate /> },
    // 6) Branches, 7) Users, 8) Announcements
    { key: 'branches', label: 'Branches', children: <Branches readOnly /> },
    { key: 'users', label: 'Users', children: <Users readOnly /> },
    { key: 'collections', label: 'Daily Collections', children: <AdminDailyCollections /> },
    { key: 'announcements', label: (<><style>{`@keyframes annPulse{0%{transform:scale(1);}60%{transform:scale(1.05);}100%{transform:scale(1);}}`}</style><span>Announcements<NewPill/></span></>), children: <Announcements /> },
    
  ]

  return (
    <div style={styles.wrap}>
      <h2 style={styles.h1}>Analytics & Reports</h2>
      <div style={styles.sub}>Owner insights across all branches</div>
      <Tabs
        defaultActiveKey="quotations"
        items={items}
        animated
        size={isMobile ? 'small' : 'middle'}
        tabBarGutter={isMobile ? 8 : 16}
        tabBarStyle={{ marginBottom: isMobile ? 8 : 12 }}
        style={{ width: '100%' }}
        destroyInactiveTabPane
      />
    </div>
  )
}
