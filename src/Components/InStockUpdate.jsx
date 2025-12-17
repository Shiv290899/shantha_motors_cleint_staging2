import React, { useEffect, useMemo, useState } from "react";
import { Table, Grid, Space, Button, Select, Input, Tag, DatePicker, message, Modal, Form } from "antd";
import { listCurrentStocks, createStock, updateStock } from "../apiCalls/stocks";
import BookingForm from "./BookingForm";
import { listBranches, listBranchesPublic } from "../apiCalls/branches";
import { exportToCsv } from "../utils/csvExport";

export default function InStockUpdate() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [hasCache, setHasCache] = useState(false);
  const [branchOptions, setBranchOptions] = useState([]);
  const [branch, setBranch] = useState("all");
  const [q, setQ] = useState("");
  const [companies, setCompanies] = useState([]);
  const [, setModels] = useState([]);
  const [, setVariants] = useState([]);
  const [colors, setColors] = useState([]);

  const [selCompanies, setSelCompanies] = useState([]);
  const [selModels, setSelModels] = useState([]);
  const [selVariants, setSelVariants] = useState([]);
  const [selColors, setSelColors] = useState([]);
  const [dateRange, setDateRange] = useState([]);
  // Controlled pagination to avoid resets on re-render
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const cacheKey = useMemo(() => `InStock:list:${branch || 'all'}`, [branch]);

  // Owner-only Invoice modal state
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoicePrefill, setInvoicePrefill] = useState(null);
  const [invoiceBaseRow, setInvoiceBaseRow] = useState(null);

  // Admin/Owner edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm] = Form.useForm();

  // Vehicle catalog (for prefilled dropdowns in Edit)
  const CATALOG_CSV_URL = import.meta.env.VITE_VEHICLE_SHEET_CSV_URL ||
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQYGuNPY_2ivfS7MTX4bWiu1DWdF2mrHSCnmTznZVEHxNmsrgcGWjVZN4UDUTOzQQdXTnbeM-ylCJbB/pub?gid=408799621&single=true&output=csv";
  const HEADERS = { company: ["Company","Company Name"], model: ["Model","Model Name"], variant: ["Variant"], color: ["Color","Colours"] };
  const pick = (row, keys) => String(keys.map((k)=> row[k] ?? "").find((v)=> v !== "") || "").trim();
  const normalizeCatalogRow = (row={}) => ({ company: pick(row, HEADERS.company), model: pick(row, HEADERS.model), variant: pick(row, HEADERS.variant), color: pick(row, HEADERS.color) });
  const parseCsv = (text) => { const rows=[]; let r=[],c="",q=false; for(let i=0;i<text.length;i++){ const ch=text[i],n=text[i+1]; if(ch==='"'&&!q){q=true;continue;} if(ch==='"'&&q){ if(n==='"'){c+='"';i++;continue;} q=false; continue;} if(ch===','&&!q){ r.push(c); c=""; continue;} if((ch==='\n'||ch==='\r')&&!q){ if(c!==""||r.length){ r.push(c); rows.push(r); r=[]; c="";} if(ch==='\r'&&n==='\n') i++; continue;} c+=ch;} if(c!==""||r.length){ r.push(c); rows.push(r);} return rows; };
  const fetchSheetRowsCSV = async (url) => { const res = await fetch(url, { cache: 'no-store' }); if(!res.ok) throw new Error('Sheet fetch failed'); const csv = await res.text(); if(csv.trim().startsWith('<')) throw new Error('Expected CSV, got HTML'); const rows=parseCsv(csv); if(!rows.length) return []; const headers = rows[0].map(h=> (h||'').trim()); return rows.slice(1).map(r=>{ const obj={}; headers.forEach((h,i)=> obj[h]= r[i] ?? ''); return obj; }); };
  const [catalog, setCatalog] = useState([]);
  const [sheetOk, setSheetOk] = useState(false);
  const [selCompany, setSelCompany] = useState("");
  const [selModel, setSelModel] = useState("");
  const [selVariant, setSelVariant] = useState("");
  useEffect(()=>{ (async()=>{ try{ const raw=await fetchSheetRowsCSV(CATALOG_CSV_URL); const cleaned=raw.map(normalizeCatalogRow).filter(r=>r.company&&r.model&&r.variant); setCatalog(cleaned); setSheetOk(cleaned.length>0);} catch{ setCatalog([]); setSheetOk(false);} })(); },[]);
  const companyOptions = useMemo(()=> [...new Set(catalog.map(r=>r.company))], [catalog]);
  const modelOptions = useMemo(()=> [...new Set(catalog.filter(r=>r.company===selCompany).map(r=>r.model))], [catalog, selCompany]);
  const variantOptions = useMemo(()=> [...new Set(catalog.filter(r=>r.company===selCompany && r.model===selModel).map(r=>r.variant))], [catalog, selCompany, selModel]);
  const colorOptions = useMemo(()=> { const dyn=catalog.filter(r=>r.company===selCompany && r.model===selModel && r.variant===selVariant).map(r=>r.color).filter(Boolean); return dyn.length? Array.from(new Set(dyn)): []; }, [catalog, selCompany, selModel, selVariant]);

  // Current user for prefill & createdBy
  const currentUser = useMemo(() => { try { return JSON.parse(localStorage.getItem('user')||'null'); } catch { return null; } }, []);
  const myRole = useMemo(() => String(currentUser?.role || '').toLowerCase(), [currentUser]);
  const isAdminOwner = useMemo(() => ['admin'].includes(myRole), [myRole]);

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

  // Instant paint from cache for current branch scope
  useEffect(() => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) { setHasCache(false); return; }
      const cached = JSON.parse(raw);
      if (cached && Array.isArray(cached.items)) {
        setItems(cached.items);
        setHasCache(true);
      } else {
        setHasCache(false);
      }
    } catch {
      setHasCache(false);
    }
  }, [cacheKey]);

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
        movementId: r.movementId || r.lastMovementId || "",
        lastMovementId: r.lastMovementId || r.movementId || "",
      }));
      setItems(rows);
      setHasCache(true);
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), items: rows }));
      } catch {
        // ignore cache write issues
      }
    } catch {
      if (!hasCache) setItems([]);
      setHasCache(false);
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

  // Helper for dependent option lists
  const uniqList = (arr) => Array.from(new Set(arr.map((v) => String(v || "").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b));

  // Dependent options for Model and Variant based on current selections
  const modelOptionsFiltered = useMemo(() => {
    const base = selCompanies.length
      ? items.filter((r) => selCompanies.includes(String(r.company || '').trim()))
      : items;
    return uniqList(base.map((r) => r.model));
  }, [items, selCompanies]);

  const variantOptionsFiltered = useMemo(() => {
    const base1 = selCompanies.length
      ? items.filter((r) => selCompanies.includes(String(r.company || '').trim()))
      : items;
    const base2 = selModels.length
      ? base1.filter((r) => selModels.includes(String(r.model || '').trim()))
      : base1;
    return uniqList(base2.map((r) => r.variant));
  }, [items, selCompanies, selModels]);

  // When upstream selections change, prune downstream selections so they remain valid
  const onCompaniesChange = (vals) => {
    const base = vals.length
      ? items.filter((r) => vals.includes(String(r.company || '').trim()))
      : items;
    const allowedModels = uniqList(base.map((r) => r.model));
    const nextModels = selModels.filter((m) => allowedModels.includes(m));
    const base2 = nextModels.length
      ? base.filter((r) => nextModels.includes(String(r.model || '').trim()))
      : base;
    const allowedVariants = uniqList(base2.map((r) => r.variant));
    const nextVariants = selVariants.filter((v) => allowedVariants.includes(v));
    setSelModels(nextModels);
    setSelVariants(nextVariants);
    setSelCompanies(vals);
  };

  const onModelsChange = (vals) => {
    const base1 = selCompanies.length
      ? items.filter((r) => selCompanies.includes(String(r.company || '').trim()))
      : items;
    const base2 = vals.length
      ? base1.filter((r) => vals.includes(String(r.model || '').trim()))
      : base1;
    const allowedVariants = uniqList(base2.map((r) => r.variant));
    const nextVariants = selVariants.filter((v) => allowedVariants.includes(v));
    setSelVariants(nextVariants);
    setSelModels(vals);
  };

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

  // Availability summary for filtered results
  const availabilityByBranch = useMemo(() => {
    const map = new Map();
    (filtered || []).forEach((r) => {
      const b = String(r.branch || "").trim() || "Unassigned";
      map.set(b, (map.get(b) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a,b)=>b[1]-a[1]);
  }, [filtered]);

  // Whenever filters/search/branch change, reset to first page
  useEffect(() => { setPage(1); }, [q, selCompanies, selModels, selVariants, selColors, dateRange, branch]);

  // Summary counts (independent of search filter)
  const totalCount = items.length;
  

  const col = (v) => String(v || "").trim();
  const colorDot = (name) => {
    const n = String(name || "").toLowerCase();
    // Handle specific variants first
    let hex = "#d1d5db";
    if (n.includes("white")) hex = "#ffffff";
    else if (n.includes("black")) hex = "#111827";
    else if (n.includes("maroon") || n.includes("wine")) hex = "#800000";
    else if (n.includes("gold")) hex = "#d4af37";
    else if (n.includes("copper")) hex = "#b87333";
    else if (n.includes("purple") || n.includes("violet")) hex = "#8b5cf6";
    else if (n.includes("brown")) hex = "#8b4513";

    // Blues: starlight/decent/ps must come before generic blue
    else if (n.includes("starlight") && n.includes("blue")) hex = "#60a5fa";
    else if (n.includes("ps") && n.includes("blue")) hex = "#1e3a8a";
    else if (n.includes("decent") && n.includes("blue")) hex = "#3b82f6";
    else if (n.includes("blue")) hex = "#2563eb";

    // Greys: deep ground / mat grey / genny grey / silver
    else if (n.includes("deep") && n.includes("ground") && n.includes("grey")) hex = "#374151";
    else if (n.includes("mat") && n.includes("grey")) hex = "#6b7280";
    else if (n.includes("genny") && n.includes("grey")) hex = "#9ca3af";
    else if (n.includes("silver")) hex = "#c0c0c0";
    else if (n.includes("grey")) hex = "#9ca3af";

    else if (n.includes("milit")) hex = "#4b5320"; // military green
    else if (n.includes("green")) hex = "#10b981";
    else if (n.includes("yellow")) hex = "#f59e0b";
    else if (n.includes("orange")) hex = "#f97316";
    else if (n.includes("red")) hex = "#ef4444";

    const border = hex === "#ffffff" ? "#e5e7eb" : (n.includes("silver") ? "#9ca3af" : "#d1d5db");
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 12, height: 12, borderRadius: 3, background: hex, border: `1px solid ${border}` }} />
        {name || '-'}
      </span>
    );
  };

  const baseColumns = [
    { title: "Chassis", dataIndex: "chassis", key: "chassis", width: 30, ellipsis: false, render: (v)=> (
      <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{v || '-'}</span>
    ) },
    { title: "Company", dataIndex: "company", key: "company", width: 20, ellipsis: false },
    { title: "Model", dataIndex: "model", key: "model", width: 50, ellipsis: false },
    { title: "Variant", dataIndex: "variant", key: "variant", width: 50, ellipsis: false },
    { title: "Color", dataIndex: "color", key: "color", width: 50, render: (v) => colorDot(v) },
    { title: "Branch", dataIndex: "branch", key: "branch", width: 50 },
    { title: "Status", dataIndex: "status", key: "status", width: 50, render: (v) => <Tag color="green">{col(v) || 'in stock'}</Tag> },
  ];

  const actionsColumn = {
    title: "Actions",
    key: "actions",
    width: 260,
    fixed: isMobile ? undefined : 'right',
    render: (_, r) => (
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
        }}>Book</Button>
            <Button size="small" onClick={() => {
              setEditingRow(r);
              setSelCompany(r.company || '');
              setSelModel(r.model || '');
              setSelVariant(r.variant || '');
              editForm.setFieldsValue({
                company: r.company || '',
                model: r.model || '',
                variant: r.variant || '',
                color: r.color || '',
                notes: '',
              });
              setEditModalOpen(true);
            }}>Edit</Button>
            {/* Delete removed per request */}
      </Space>
    )
  };

  const columns = isAdminOwner ? [...baseColumns, actionsColumn] : baseColumns;

  const handleExportCsv = () => {
    if (!filtered.length) {
      message.info('No vehicles to export for current filters');
      return;
    }
    const headers = [
      { key: 'ts', label: 'Timestamp' },
      { key: 'chassis', label: 'Chassis' },
      { key: 'company', label: 'Company' },
      { key: 'model', label: 'Model' },
      { key: 'variant', label: 'Variant' },
      { key: 'color', label: 'Color' },
      { key: 'branch', label: 'Branch' },
      { key: 'status', label: 'Status' },
      { key: 'movementId', label: 'Movement Id' },
    ];
    const rowsForCsv = filtered.map((r) => ({
      ts: r.ts,
      chassis: r.chassis,
      company: r.company,
      model: r.model,
      variant: r.variant,
      color: r.color,
      branch: r.branch,
      status: r.status,
      movementId: r.movementId || r.lastMovementId,
    }));
    exportToCsv({ filename: 'in-stock.csv', headers, rows: rowsForCsv });
    message.success(`Exported ${rowsForCsv.length} vehicles`);
  };

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
            onChange={onCompaniesChange}
            options={companies.map((v)=>({ value: v, label: v }))}
            maxTagCount={isMobile ? 1 : 3}
          />
          <Select
            mode="multiple"
            allowClear
            placeholder="Model"
            style={{ minWidth: 180 }}
            value={selModels}
            onChange={onModelsChange}
            options={modelOptionsFiltered.map((v)=>({ value: v, label: v }))}
            maxTagCount={isMobile ? 1 : 3}
          />
          <Select
            mode="multiple"
            allowClear
            placeholder="Variant"
            style={{ minWidth: 200 }}
            value={selVariants}
            onChange={setSelVariants}
            options={variantOptionsFiltered.map((v)=>({ value: v, label: v }))}
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
          <Button onClick={handleExportCsv}>Export CSV</Button>
          <Button onClick={() => { setSelCompanies([]); setSelModels([]); setSelVariants([]); setSelColors([]); setDateRange([]); setQ(""); }}>Reset Filters</Button>
          <Button onClick={fetchData} loading={loading}>Refresh</Button>
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
        
      </div>

      {/* Availability for current filters */}
      {branch === 'all' && availabilityByBranch.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontWeight: 600, marginRight: 8 }}>Available at:</span>
          <Space size={[6,6]} wrap>
            {availabilityByBranch.map(([b,c]) => (
              <Tag key={`avail-${b}`} color="green">{b}: {c}</Tag>
            ))}
          </Space>
        </div>
      )}

  <Table
        dataSource={filtered}
        columns={columns}
        loading={loading && !hasCache}
        size={isMobile ? 'small' : 'middle'}
        pagination={{
          current: page,
          pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10','25','50','100'],
          onChange: (p, ps) => { setPage(p); if (ps !== pageSize) setPageSize(ps); },
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
        }}
        rowKey={(r) => r.chassis || r.key}
        scroll={{ x: 'max-content' }}
      />

      {/* Edit Modal (Admin/Owner) */}
      <Modal
        title={editingRow ? `Edit In-Stock – ${editingRow.chassis}` : 'Edit In-Stock'}
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); setEditingRow(null); editForm.resetFields(); }}
        onOk={async () => {
          try {
            const vals = await editForm.validateFields();
            setEditSaving(true);
            const patch = {
              Company: vals.company,
              Model: vals.model,
              Variant: vals.variant,
              Color: vals.color,
              Notes: vals.notes,
            };
            const id = editingRow?.movementId || editingRow?.lastMovementId;
            if (!id) { message.warning('No movement found for this chassis. Try Refresh.'); setEditSaving(false); return; }
            const res = await updateStock(id, patch);
            if (res?.success) {
              message.success('Saved');
              setEditModalOpen(false);
              setEditingRow(null);
              editForm.resetFields();
              fetchData();
            } else {
              message.error(res?.message || 'Save failed');
            }
          } catch (e) {
            if (e?.errorFields) return; // antd validation error
            message.error('Save failed');
          } finally {
            setEditSaving(false);
          }
        }}
        okText="Save"
        confirmLoading={editSaving}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="company" label="Company" rules={[{ required: true }]}> 
            <Select 
              showSearch 
              optionFilterProp="children" 
              placeholder={sheetOk ? 'Select company' : 'Type company'}
              value={selCompany || undefined}
              onChange={(v)=>{ setSelCompany(v); setSelModel(''); setSelVariant(''); editForm.setFieldsValue({ model: undefined, variant: undefined }); }}
              disabled={!sheetOk}
            >
              {companyOptions.map((c)=> <Select.Option key={c} value={c}>{c}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="model" label="Model" rules={[{ required: true }]}> 
            <Select 
              showSearch 
              optionFilterProp="children"
              placeholder={sheetOk ? 'Select model' : 'Type model'}
              value={selModel || undefined}
              onChange={(v)=>{ setSelModel(v); setSelVariant(''); editForm.setFieldsValue({ variant: undefined }); }}
              disabled={!sheetOk || !selCompany}
            >
              {modelOptions.map((m)=> <Select.Option key={m} value={m}>{m}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="variant" label="Variant" rules={[{ required: true }]}> 
            <Select 
              showSearch 
              optionFilterProp="children"
              placeholder={sheetOk ? 'Select variant' : 'Type variant'}
              value={selVariant || undefined}
              onChange={(v)=> setSelVariant(v)}
              disabled={!sheetOk || !selModel}
            >
              {variantOptions.map((v)=> <Select.Option key={v} value={v}>{v}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="color" label="Color" rules={[{ required: true }]}> 
            {colorOptions.length ? (
              <Select showSearch optionFilterProp="children" placeholder="Select color">
                {colorOptions.map((c)=> <Select.Option key={c} value={c}>{c}</Select.Option>)}
              </Select>
            ) : (
              <Input placeholder="Color" />
            )}
          </Form.Item>
          <Form.Item name="notes" label="Notes"> <Input.TextArea rows={3} placeholder="Optional notes" /> </Form.Item>
        </Form>
      </Modal>

      {/* Book Modal (Owner) */}
      <Modal
        title="Book"
        open={invoiceModalOpen}
        onCancel={() => { setInvoiceModalOpen(false); setInvoicePrefill(null); setInvoiceBaseRow(null); }}
        footer={null}
        destroyOnClose
        width={980}
      >
        <BookingForm
          asModal
          initialValues={invoicePrefill || {}}
          autoUpdateStockOnSave={false}
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
                Notes: response?.bookingId ? `Book via Booking ID ${response.bookingId}` : 'Book via Booking form',
              };
              await createStock({ data: row, createdBy: currentUser?.name || currentUser?.email || 'owner' });
              message.success('Stock updated: vehicle marked booked / out of stock');
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
