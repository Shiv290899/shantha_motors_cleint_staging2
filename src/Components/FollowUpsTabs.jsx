import React from 'react';
import { Tabs } from 'antd';
import { FileTextOutlined, ToolOutlined, CalendarOutlined } from '@ant-design/icons';
import FollowUps from './FollowUps';

export default function FollowUpsTabs() {
  const tabLabel = (icon, text) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {icon}
      <span>{text}</span>
    </span>
  );

  const DEFAULT_QUOT_URL =
    'https://script.google.com/macros/s/AKfycbxXtfRVEFeaKu10ijzfQdOVlgkZWyH1q1t4zS3PHTX9rQQ7ztRJdpFV5svk98eUs3UXuw/exec';
  const DEFAULT_JC_URL =
    'https://script.google.com/macros/s/AKfycbyImL9EFtRT7DBis6GtPnGdT5wi39lTl5y-sew09VC7aDL2GM6mikKwLDrrUekZIcC2pw/exec';
  const QUOT_URL = import.meta.env.VITE_QUOTATION_GAS_URL || DEFAULT_QUOT_URL;
  const JC_URL = import.meta.env.VITE_JOBCARD_GAS_URL || DEFAULT_JC_URL;
  const DEFAULT_BOOKING_URL =
    import.meta.env.VITE_BOOKING_GAS_URL || 'https://script.google.com/macros/s/AKfycbzAn8Ahu2Mp59Uh0i7jLi1XEzRU44A6xzrMl3X-n1u_EECxSAWCjpNo0Ovk4LeCjvPzeA/exec';

  const items = [
    {
      key: 'quotation',
      label: tabLabel(<FileTextOutlined />, 'Quotation'),
      children: <FollowUps mode="quotation" webhookUrl={QUOT_URL} />,
    },
    {
      key: 'jobcard',
      label: tabLabel(<ToolOutlined />, 'Job Card'),
      children: <FollowUps mode="jobcard" webhookUrl={JC_URL} />,
    },
    {
      key: 'booking',
      label: tabLabel(<CalendarOutlined />, 'Booking'),
      children: <FollowUps mode="booking" webhookUrl={DEFAULT_BOOKING_URL} />,
    },
    
  ];

  return (
    <Tabs
      defaultActiveKey="quotation"
      items={items}
      destroyInactiveTabPane
    />
  );
}
