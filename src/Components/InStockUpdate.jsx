import React, { useEffect, useMemo, useState } from "react";
import { Table, Grid, Space, Button, Select, Input, Tag } from "antd";
import { listCurrentStocks } from "../apiCalls/stocks";
import { listBranches, listBranchesPublic } from "../apiCalls/branches";

export default function InStockUpdate() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [branchOptions, setBranchOptions] = useState([]);
  const [branch, setBranch] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await listBranches({ limit: 100, status: "active" }).catch(() => null);
        const data = res?.data?.items || (await listBranchesPublic({ status: "active", limit: 100 })).data.items || [];
        const names = Array.from(new Set((data || []).map((b) => String(b?.name || "").trim()).filter(Boolean)));
        setBranchOptions(names);
      } catch {
        setBranchOptions([]);
      }
    })();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const resp = await listCurrentStocks({ branch: branch === "all" ? undefined : branch, limit: 1000 });
      const list = Array.isArray(resp?.data) ? resp.data : [];
      const rows = list.map((r, i) => ({
        key: r._id || r.movementId || i,
        ts: r.timestamp || r.createdAt || "",
        chassis: r.chassisNo || "",
        company: r.company || "",
        model: r.model || "",
        variant: r.variant || "",
        color: r.color || "",
        branch: r.sourceBranch || r.branch || "",
        status: r.status || "in stock",
      }));
      setItems(rows);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [branch]);

  const filtered = useMemo(() => {
    if (!q) return items;
    const s = q.toLowerCase();
    return items.filter((r) =>
      [r.chassis, r.company, r.model, r.variant, r.color, r.branch].some((v) => String(v || "").toLowerCase().includes(s))
    );
  }, [items, q]);

  // Summary counts (independent of search filter)
  const totalCount = items.length;
  const countsByBranch = useMemo(() => {
    const map = new Map();
    items.forEach((r) => {
      const b = String(r.branch || "").trim() || "Unassigned";
      map.set(b, (map.get(b) || 0) + 1);
    });
    // Sort desc by count
    return Array.from(map.entries()).sort((a,b)=>b[1]-a[1]);
  }, [items]);

  const col = (v) => String(v || "").trim();
  const colorDot = (name) => {
    const n = String(name || "").toLowerCase();
    const hex = n.includes("black") ? "#111827"
      : n.includes("white") ? "#ffffff"
      : n.includes("red") ? "#ef4444"
      : n.includes("blue") ? "#2563eb"
      : n.includes("grey") || n.includes("silver") ? "#9ca3af"
      : n.includes("green") ? "#10b981"
      : n.includes("yellow") ? "#f59e0b"
      : n.includes("orange") ? "#f97316"
      : n.includes("maroon") || n.includes("wine") ? "#800000"
      : "#d1d5db";
    const border = hex === "#ffffff" ? "#e5e7eb" : "#d1d5db";
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: hex, border: `1px solid ${border}` }} />
      {name || '-'}
    </span>;
  };

  const columns = [
    { title: "Chassis", dataIndex: "chassis", key: "chassis", width: 160, ellipsis: true },
    { title: "Company", dataIndex: "company", key: "company", width: 120, ellipsis: true, responsive: ['md'] },
    { title: "Model", dataIndex: "model", key: "model", width: 140, ellipsis: true },
    { title: "Variant", dataIndex: "variant", key: "variant", width: 160, ellipsis: true },
    { title: "Color", dataIndex: "color", key: "color", width: 150, render: (v) => colorDot(v) },
    { title: "Branch", dataIndex: "branch", key: "branch", width: 140 },
    { title: "Status", dataIndex: "status", key: "status", width: 110, render: (v) => <Tag color="green">{col(v) || 'in stock'}</Tag> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <Space size="small" wrap>
          <Select
            value={branch}
            onChange={setBranch}
            style={{ minWidth: 180 }}
            options={[{ value: 'all', label: 'All Branches' }, ...branchOptions.map((b) => ({ value: b, label: b }))]}
          />
          <Input placeholder="Search chassis / model / color" allowClear value={q} onChange={(e)=>setQ(e.target.value)} style={{ minWidth: 220 }} />
        </Space>
        <div style={{ flex: 1 }} />
        <Space>
          <Button onClick={fetchData}>Refresh</Button>
        </Space>
      </div>

      {/* Summary counts */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <Tag color="blue" style={{ fontSize: 12, padding: '4px 10px' }}>
          {branch === 'all' ? `Total In-Stock (All Branches): ${totalCount}` : `In-Stock (${branch}): ${totalCount}`}
        </Tag>
        <Tag color="geekblue" style={{ fontSize: 12, padding: '4px 10px' }}>
          Showing: {filtered.length}
        </Tag>
        {branch === 'all' && (
          <Space size={[6,6]} wrap>
            {countsByBranch.map(([b,c]) => (
              <Tag key={b} color="green" style={{ marginInlineEnd: 6 }}>
                {b}: {c}
              </Tag>
            ))}
          </Space>
        )}
      </div>

      <Table
        dataSource={filtered}
        columns={columns}
        loading={loading}
        size={isMobile ? 'small' : 'middle'}
        pagination={{ pageSize: 10 }}
        rowKey={(r) => r.key}
        scroll={{ x: isMobile ? 900 : undefined }}
      />
    </div>
  );
}
