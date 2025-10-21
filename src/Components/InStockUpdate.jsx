import React, { useEffect, useMemo, useState } from "react";
import { Table, Grid, Space, Button, Select, Input, Tag, DatePicker, message, Modal } from "antd";
import { listCurrentStocks, createStock } from "../apiCalls/stocks";
import BookingForm from "./BookingForm";
import { listBranches, listBranchesPublic } from "../apiCalls/branches";

export default function InStockUpdate() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [branchOptions, setBranchOptions] = useState([]);
  const [branch, setBranch] = useState("all");
  const [q, setQ] = useState("");
  const [companies, setCompanies] = useState([]);
  const [models, setModels] = useState([]);
  const [variants, setVariants] = useState([]);
  const [colors, setColors] = useState([]);

  const [selCompanies, setSelCompanies] = useState([]);
  const [selModels, setSelModels] = useState([]);
  const [selVariants, setSelVariants] = useState([]);
  const [selColors, setSelColors] = useState([]);
  const [dateRange, setDateRange] = useState([]);

  // Owner-only Invoice modal state
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoicePrefill, setInvoicePrefill] = useState(null);
  const [invoiceBaseRow, setInvoiceBaseRow] = useState(null);

  // Current user for prefill & createdBy
  const currentUser = useMemo(() => { try { return JSON.parse(localStorage.getItem('user')||'null'); } catch { return null; } }, []);

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

  // Build option lists whenever items change (unique, sorted)
  useEffect(() => {
    const uniq = (arr) => Array.from(new Set(arr.map((v) => String(v || "").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
    setCompanies(uniq(items.map((r)=>r.company)));
    setModels(uniq(items.map((r)=>r.model)));
    setVariants(uniq(items.map((r)=>r.variant)));
    setColors(uniq(items.map((r)=>r.color)));
  }, [items]);

  const filtered = useMemo(() => {
    const s = String(q || "").toLowerCase();
    const hasSearch = !!s;
    const [start, end] = Array.isArray(dateRange) ? dateRange : [];
    const startTs = start && typeof start?.toDate === 'function' ? start.toDate() : null;
    const endTs = end && typeof end?.toDate === 'function' ? end.toDate() : null;

    return items.filter((r) => {
      // Free-text search across key fields
      if (hasSearch) {
        const ok = [r.chassis, r.company, r.model, r.variant, r.color, r.branch]
          .some((v) => String(v || "").toLowerCase().includes(s));
        if (!ok) return false;
      }

      // Company/model/variant/color multi-select filters
      const inCompanies = selCompanies.length ? selCompanies.includes(String(r.company || '').trim()) : true;
      if (!inCompanies) return false;
      const inModels = selModels.length ? selModels.includes(String(r.model || '').trim()) : true;
      if (!inModels) return false;
      const inVariants = selVariants.length ? selVariants.includes(String(r.variant || '').trim()) : true;
      if (!inVariants) return false;
      const inColors = selColors.length ? selColors.includes(String(r.color || '').trim()) : true;
      if (!inColors) return false;

      // Date range on last movement timestamp
      if (startTs || endTs) {
        const t = new Date(r.ts);
        if (Number.isNaN(t.getTime())) return false;
        if (startTs && t < startTs) return false;
        if (endTs) {
          // include end of day
          const endDay = new Date(endTs);
          endDay.setHours(23,59,59,999);
          if (t > endDay) return false;
        }
      }
      return true;
    });
  }, [items, q, selCompanies, selModels, selVariants, selColors, dateRange]);

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
    { title: "Actions", key: "actions", width: 120, fixed: isMobile ? undefined : 'right', render: (_, r) => (
      <Space size="small">
        <Button size="small" type="primary" onClick={() => {
          const pre = {
            company: r.company || '',
            bikeModel: r.model || '',
            variant: r.variant || '',
            color: r.color || '',
            chassisNo: r.chassis || '',
            purchaseType: 'cash',
            addressProofMode: 'aadhaar',
            executive: (currentUser?.name || currentUser?.email || ''),
            branch: r.branch || '',
          };
          setInvoicePrefill(pre);
          setInvoiceBaseRow(r);
          setInvoiceModalOpen(true);
        }}>Invoice</Button>
      </Space>
    ) },
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
          <Input placeholder="Search chassis / company / model / color" allowClear value={q} onChange={(e)=>setQ(e.target.value)} style={{ minWidth: 240 }} />
          <Select
            mode="multiple"
            allowClear
            placeholder="Company"
            style={{ minWidth: 180 }}
            value={selCompanies}
            onChange={setSelCompanies}
            options={companies.map((v)=>({ value: v, label: v }))}
            maxTagCount={isMobile ? 1 : 3}
          />
          <Select
            mode="multiple"
            allowClear
            placeholder="Model"
            style={{ minWidth: 180 }}
            value={selModels}
            onChange={setSelModels}
            options={models.map((v)=>({ value: v, label: v }))}
            maxTagCount={isMobile ? 1 : 3}
          />
          <Select
            mode="multiple"
            allowClear
            placeholder="Variant"
            style={{ minWidth: 200 }}
            value={selVariants}
            onChange={setSelVariants}
            options={variants.map((v)=>({ value: v, label: v }))}
            maxTagCount={isMobile ? 1 : 3}
          />
          <Select
            mode="multiple"
            allowClear
            placeholder="Color"
            style={{ minWidth: 180 }}
            value={selColors}
            onChange={setSelColors}
            options={colors.map((v)=>({ value: v, label: v }))}
            maxTagCount={isMobile ? 1 : 3}
          />
          <DatePicker.RangePicker value={dateRange} onChange={setDateRange} allowClear style={{ minWidth: 220 }} />
        </Space>
        <div style={{ flex: 1 }} />
        <Space>
          <Button onClick={() => { setSelCompanies([]); setSelModels([]); setSelVariants([]); setSelColors([]); setDateRange([]); setQ(""); }}>Reset Filters</Button>
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

      {/* Invoice Modal (Owner) */}
      <Modal
        title="Create Invoice"
        open={invoiceModalOpen}
        onCancel={() => { setInvoiceModalOpen(false); setInvoicePrefill(null); setInvoiceBaseRow(null); }}
        footer={null}
        destroyOnClose
        width={980}
      >
        <BookingForm
          asModal
          initialValues={invoicePrefill || {}}
          onSuccess={async ({ response, payload }) => {
            try {
              const veh = payload?.vehicle || {};
              const row = {
                Chassis_No: String(veh.chassisNo || invoiceBaseRow?.chassis || '').toUpperCase(),
                Company: veh.company || invoiceBaseRow?.company || '',
                Model: veh.model || invoiceBaseRow?.model || '',
                Variant: veh.variant || invoiceBaseRow?.variant || '',
                Color: veh.color || invoiceBaseRow?.color || '',
                Action: 'invoice',
                Customer_Name: payload?.customerName || '',
                Source_Branch: invoiceBaseRow?.branch || '',
                Notes: response?.bookingId ? `Invoice via Booking ID ${response.bookingId}` : 'Invoice via Booking form',
              };
              await createStock({ data: row, createdBy: currentUser?.name || currentUser?.email || 'owner' });
              message.success('Stock updated: vehicle marked invoiced / out of stock');
              setInvoiceModalOpen(false);
              setInvoicePrefill(null);
              setInvoiceBaseRow(null);
              fetchData();
            } catch {
              message.error('Saved booking but failed to update stock. Please refresh and try again.');
            }
          }}
        />
      </Modal>
    </div>
  );
}
