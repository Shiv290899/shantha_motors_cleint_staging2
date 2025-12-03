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
    'https://script.google.com/macros/s/AKfycbwqJMP0YxZaoxWL3xcL-4rz8-uzrw4pyq7JgghNPI08FxXLk738agMcozmk7A7RpoC5zw/exec';
  const DEFAULT_JC_URL =
    'https://script.google.com/macros/s/AKfycbw-_96BCshSZqrJqZDl2XveC0yVmLcwogwih6K_VNfrb-JiI1H-9y04z7eaeFlh7rwSWg/exec';
  const QUOT_URL = import.meta.env.VITE_QUOTATION_GAS_URL || DEFAULT_QUOT_URL;
  const JC_URL = import.meta.env.VITE_JOBCARD_GAS_URL || DEFAULT_JC_URL;
  const DEFAULT_BOOKING_URL =
    import.meta.env.VITE_BOOKING_GAS_URL || 'https://script.google.com/macros/s/AKfycbydOWWH1jbinBzNj_z5ZRU3906D-tS93o39QSVuH5IfD2YPgPqOTmzNH9FAwWGhorXylg/exec';

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
