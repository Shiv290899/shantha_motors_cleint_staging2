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
    'https://script.google.com/macros/s/AKfycbw7DzKCy3wZeeRBEM5XKIu6w0gt_2ouCaSkpaKv0UkjkQThCtVoRciOkkYT8sNViQuEaw/exec';
  const QUOT_URL = import.meta.env.VITE_QUOTATION_GAS_URL || DEFAULT_QUOT_URL;
  const JC_URL = import.meta.env.VITE_JOBCARD_GAS_URL || DEFAULT_JC_URL;
  const DEFAULT_BOOKING_URL =
    import.meta.env.VITE_BOOKING_GAS_URL || 'https://script.google.com/macros/s/AKfycbwSn5hp1cSWlJMGhe2cYUtid2Ruqh9H13mZbq0PwBpYB0lMLufZbIjZ5zioqtKgE_0sNA/exec';

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
    
  ];

  return (
    <Tabs
      defaultActiveKey="quotation"
      items={items}
      destroyInactiveTabPane
    />
  );
}
