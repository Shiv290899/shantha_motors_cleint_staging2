import React from 'react';
import { Tabs } from 'antd';
import { FileTextOutlined, ToolOutlined } from '@ant-design/icons';
import FollowUps from './FollowUps';

export default function FollowUpsTabs() {
  const tabLabel = (icon, text) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {icon}
      <span>{text}</span>
    </span>
  );

  const QUOT_URL = import.meta.env.VITE_QUOTATION_GAS_URL || '';
  const JC_URL = import.meta.env.VITE_JOBCARD_GAS_URL || '';

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

