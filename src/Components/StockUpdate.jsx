import React, { useEffect, useMemo, useState } from "react";
import { Row, Col, Form, Input, Select, Radio, Button, message, Divider, Modal, Table, Space, Tag, Grid, Tooltip } from "antd";
// Stock updates now use MongoDB backend only
import { listStocks, listCurrentStocks, createStock } from "../apiCalls/stocks";
import BookingForm from "./BookingForm";
import { listBranches, listBranchesPublic } from "../apiCalls/branches";

// --- Config ---
// Vehicle catalog CSV remains (read-only) for dropdowns
const CATALOG_CSV_URL = import.meta.env.VITE_VEHICLE_SHEET_CSV_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQsXcqX5kmqG1uKHuWUnBCjMXBugJn7xljgBsRPIm2gkk2PpyRnEp8koausqNflt6Q4Gnqjczva82oN/pub?output=csv";

// --- CSV loader ---
const HEADERS = {
  company: ["Company", "Company Name"],
  model: ["Model", "Model Name"],
  variant: ["Variant"],
  color: ["Color", "Colours"],
};

const parseCsv = (text) => {
  const rows = [];
  let row = [], col = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"' && !inQuotes) { inQuotes = true; continue; }
    if (c === '"' && inQuotes) { if (n === '"') { col += '"'; i++; continue; } inQuotes = false; continue; }
    if (c === "," && !inQuotes) { row.push(col); col = ""; continue; }
    if ((c === "\n" || c === "\r") && !inQuotes) { if (col !== "" || row.length) { row.push(col); rows.push(row); row = []; col = ""; } if (c === "\r" && n === "\n") i++; continue; }
    col += c;
  }
  if (col !== "" || row.length) { row.push(col); rows.push(row); }
  return rows;
};

const fetchSheetRowsCSV = async (url) => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Sheet fetch failed");
  const csv = await res.text();
  if (csv.trim().startsWith("<")) throw new Error("Expected CSV, got HTML");
  const rows = parseCsv(csv);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => (h || "").trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = r[i] ?? ""));
    return obj;
  });
};

const pick = (row, keys) => String(keys.map((k) => row[k] ?? "").find((v) => v !== "") || "").trim();

const normalizeCatalogRow = (row = {}) => ({
  company: pick(row, HEADERS.company),
  model: pick(row, HEADERS.model),
  variant: pick(row, HEADERS.variant),
  color: pick(row, HEADERS.color),
});

// Branch names come from MongoDB Branch collection via API
// We keep a local state array of names

export default function StockUpdate() {
  const { useBreakpoint } = Grid;
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [form] = Form.useForm();
  const [catalog, setCatalog] = useState([]);
  const [company, setCompany] = useState("");
  const [model, setModel] = useState("");
  const [variant, setVariant] = useState("");
  const [sheetOk, setSheetOk] = useState(false);
  const [action, setAction] = useState("add"); // add | transfer | return | invoice
  const [allowedActions, setAllowedActions] = useState(null); // null = all, ["add"] or [specific]
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoicePrefill, setInvoicePrefill] = useState(null);
  const [invoiceBaseRow, setInvoiceBaseRow] = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const [items, setItems] = useState([]);
  const [branchNames, setBranchNames] = useState([]);

  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
  }, []);
  const myBranch = useMemo(() => {
    const name = currentUser?.formDefaults?.branchName || currentUser?.primaryBranch?.name || (Array.isArray(currentUser?.branches) ? currentUser.branches[0]?.name : undefined);
    return name || '';
  }, [currentUser]);
  const myRole = useMemo(() => String(currentUser?.role || '').toLowerCase(), [currentUser]);
  const lockSourceBranch = useMemo(() => ['staff','mechanic','employees'].includes(myRole), [myRole]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await fetchSheetRowsCSV(CATALOG_CSV_URL);
        const cleaned = raw
          .map(normalizeCatalogRow)
          .filter((r) => r.company && r.model && r.variant);
        setCatalog(cleaned);
        setSheetOk(cleaned.length > 0);
      } catch {
        setCatalog([]);
        setSheetOk(false);
      }
    })();
  }, []);

  // Fetch branches from MongoDB (server API)
  useEffect(() => {
    (async () => {
      try {
        // Prefer authenticated route, fallback to public
        const res = await listBranches({ limit: 100, status: 'active' }).catch(() => null);
        const data = res?.data?.items || [];
        const list = (Array.isArray(data) && data.length ? data : (await listBranchesPublic({ status: 'active', limit: 100 })).data.items) || [];
        const names = Array.from(new Set(list.map((b) => String(b?.name || '').trim()).filter(Boolean)));
        setBranchNames(names);
      } catch {
        setBranchNames([]);
      }
    })();
  }, []);

  const companies = useMemo(() => [...new Set(catalog.map((r) => r.company))], [catalog]);
  const models = useMemo(() => [...new Set(catalog.filter((r) => r.company === company).map((r) => r.model))], [catalog, company]);
  const variants = useMemo(() => [...new Set(catalog.filter((r) => r.company === company && r.model === model).map((r) => r.variant))], [catalog, company, model]);
  // Preset color choices with hex samples for quick pick
  const PRESET_COLORS = useMemo(() => ([
    { name: "Black", hex: "#111827" },
    { name: "White", hex: "#ffffff", border: "#e5e7eb" },
    { name: "Red", hex: "#ef4444" },
    { name: "Blue", hex: "#2563eb" },
    { name: "Grey / Silver", hex: "#9ca3af" },
    { name: "Green", hex: "#10b981" },
    { name: "Yellow", hex: "#f59e0b" },
    { name: "Orange", hex: "#f97316" },
    { name: "Maroon / Wine Red", hex: "#800000" },
    { name: "Matte Black", hex: "#0f172a" },
  ]), []);

  const colors = useMemo(() => {
    const dyn = catalog
      .filter((r) => r.company === company && r.model === model && r.variant === variant)
      .map((r) => r.color)
      .filter(Boolean);
    const map = new Map();
    PRESET_COLORS.forEach((c) => map.set(c.name.toLowerCase(), c.name));
    dyn.forEach((c) => map.set(String(c).toLowerCase(), c));
    const out = Array.from(map.values());
    return out.length ? out : PRESET_COLORS.map((c) => c.name);
  }, [catalog, company, model, variant, PRESET_COLORS]);

  const swatch = (name) => {
    const m = PRESET_COLORS.find((x) => x.name.toLowerCase() === String(name || '').toLowerCase());
    return { bg: m?.hex || '#d1d5db', border: m?.border || '#d1d5db' };
  };

  const onCompany = (v) => { setCompany(v); setModel(""); setVariant(""); form.setFieldsValue({ model: undefined, variant: undefined, color: undefined }); };
  const onModel = (v) => { setModel(v); setVariant(""); form.setFieldsValue({ variant: undefined, color: undefined }); };
  const onVariant = (v) => { setVariant(v); form.setFieldsValue({ color: undefined }); };

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const user = (() => { try { return JSON.parse(localStorage.getItem('user')||'null') } catch { return null } })();
      const row = {
        Chassis_No: String(values.chassis || '').toUpperCase(),
        Company: values.company || '',
        Model: values.model || '',
        Variant: values.variant || '',
        Color: values.color || '',
        Action: action,
        Target_Branch: action === 'transfer' ? (values.targetBranch || '') : '',
        Return_To: action === 'return' ? (values.returnTo || '') : '',
        Customer_Name: action === 'invoice' ? (values.customerName || '') : '',
        Source_Branch: values.sourceBranch || '',
        Notes: values.notes || '',
      };
      await createStock({ data: row, createdBy: user?.name || user?.email || 'user' });
      message.success("Stock movement saved.");
      form.resetFields(["chassis", "notes", "targetBranch", "returnTo", "customerName"]);
      setModalOpen(false);
      fetchList();
    } catch (err) {
      if (err?.errorFields) return; // antd validation
      message.error("Failed to save. Check configuration or network.");
    } finally {
      setSubmitting(false);
    }
  };

  const label = (s) => <strong style={{ fontWeight: 700 }}>{s}</strong>;
  const isVehicleLocked = action !== 'add';
  const isChassisLocked = action !== 'add';
  const isSourceLocked = lockSourceBranch || action !== 'add';

  const fetchList = async () => {
    setLoadingList(true);
    try {
      // For staff-like roles, show current inventory only (latest per chassis)
      const isStaffLike = ['staff','mechanic','employees'].includes(myRole)
      const resp = isStaffLike
        ? await listCurrentStocks({ branch: myBranch })
        : await listStocks({ branch: myBranch, mode: undefined });
        const list = Array.isArray(resp?.data) ? resp.data : [];
        const rows = list.map((r, idx) => ({
          key: idx + 1,
          ts: r.timestamp || r.createdAt || '',
          chassis: r.chassisNo || '',
          company: r.company || '',
          model: r.model || '',
          variant: r.variant || '',
          color: r.color || '',
          action: r.action || '',
          targetBranch: r.targetBranch || '',
          returnTo: r.returnTo || '',
          customerName: r.customerName || '',
          sourceBranch: r.sourceBranch || '',
          lastSourceBranch: r.lastSourceBranch || '',
          notes: r.notes || '',
          movementId: r.movementId || '',
        }));
        setItems(rows);
    } catch {
      setItems([]);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => { fetchList(); }, [myBranch]);

  // When opening the modal, prefill and lock Source Branch for staff-like roles
  useEffect(() => {
    if (modalOpen && lockSourceBranch && myBranch) {
      form.setFieldsValue({ sourceBranch: myBranch });
    }
  }, [modalOpen, lockSourceBranch, myBranch, form]);

  const openWithAction = (base, act) => {
    try {
      if (act === 'invoice') {
        // Open Booking form modal with prefilled vehicle stock details
        const prefill = {
          company: base?.company || '',
          bikeModel: base?.model || '',
          variant: base?.variant || '',
          color: base?.color || '',
          chassisNo: base?.chassis || base?.chassisNo || '',
          purchaseType: 'cash',
          addressProofMode: 'aadhaar',
          executive: (currentUser?.name || currentUser?.email || ''),
          branch: (currentUser?.formDefaults?.branchName || currentUser?.primaryBranch?.name || myBranch || ''),
        };
        setInvoicePrefill(prefill);
        setInvoiceBaseRow(base || null);
        setInvoiceModalOpen(true);
        return;
      }

      setAllowedActions([act]);
      setAction(act);
      const patch = {
        chassis: base?.chassis || base?.chassisNo || undefined,
        company: base?.company || undefined,
        model: base?.model || undefined,
        variant: base?.variant || undefined,
        color: base?.color || undefined,
        // Prefer the row's current source (server-provided) for accurate chaining
        sourceBranch: base?.sourceBranch || myBranch || undefined,
        // For transfer, suggest previous source as the target (quick reverse)
        targetBranch: act === 'transfer' ? (base?.lastSourceBranch || base?.sourceBranch || undefined) : undefined,
        returnTo: undefined,
        customerName: undefined,
        notes: undefined,
      };
      form.setFieldsValue(patch);
      setModalOpen(true);
    } catch {
      // ignore
    }
  };

  const columns = [
    { title: "Timestamp", dataIndex: "ts", key: "ts", width: 180, ellipsis: true, responsive: ['md'] },
    { title: "Chassis", dataIndex: "chassis", key: "chassis", width: 150, ellipsis: true },
    { title: "Company", dataIndex: "company", key: "company", width: 130, ellipsis: true, responsive: ['md'] },
    { title: "Model", dataIndex: "model", key: "model", width: 130, ellipsis: true, responsive: ['md'] },
    { title: "Variant", dataIndex: "variant", key: "variant", width: 140, ellipsis: true, responsive: ['md'] },
    { title: "Color", dataIndex: "color", key: "color", width: 120, ellipsis: true, responsive: ['md'] },
    { title: "Action", dataIndex: "action", key: "action", width: 120, render: (v) => {
      const t = String(v || "").toLowerCase();
      const color = t === 'transfer' ? 'geekblue' : t === 'return' ? 'volcano' : t === 'invoice' ? 'green' : t === 'add' ? 'purple' : 'default';
      return <Tag color={color}>{v || '-'}</Tag>;
    } },
    { title: "Target/Return/Customer", key: "dest", ellipsis: true, render: (_, r) => r.targetBranch || r.returnTo || r.customerName || "—" },
    { title: "Source", dataIndex: "sourceBranch", key: "sourceBranch", width: 140, ellipsis: true },
    { title: "Notes", dataIndex: "notes", key: "notes", ellipsis: true, responsive: ['md'] },
    { title: "Actions", key: "actions", width: 220, render: (_, r) => (
      <Space size="small">
        <Button size="small" onClick={() => openWithAction(r, 'transfer')}>Transfer</Button>
        <Button size="small" onClick={() => openWithAction(r, 'return')}>Return</Button>
        <Button size="small" type="primary" onClick={() => openWithAction(r, 'invoice')}>Invoice</Button>
      </Space>
    ) },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <strong>Total:</strong> {items.length || 0}
        </div>
        <Space>
          <Button onClick={fetchList}>Refresh</Button>
          <Button
            type="primary"
            onClick={() => {
              setAllowedActions(["add"]);
              setAction("add");
              // reset form except locked fields
              form.resetFields();
              if (lockSourceBranch && myBranch) {
                form.setFieldsValue({ sourceBranch: myBranch });
              }
              setModalOpen(true);
            }}
          >
            New Movement
          </Button>
        </Space>
      </div>

      <Table
        dataSource={items}
        columns={columns}
        loading={loadingList}
        pagination={{ pageSize: 10 }}
        size={isMobile ? "small" : "middle"}
        scroll={{ x: isMobile ? 900 : undefined }}
        rowKey={(r) => `${r.ts}-${r.chassis}-${r.key}`}
      />

      <Modal
        title="New Stock Movement"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setAllowedActions(null); setAction("add"); }}
        onOk={onSubmit}
        okText="Save"
        confirmLoading={submitting}
        destroyOnClose
        forceRender
        width={720}
      >
        <Form form={form} layout="vertical" initialValues={{}}>
          <Row gutter={[12, 8]}>
            <Col xs={24} md={12}>
              <Form.Item name="chassis" label={label("Chassis No.")} rules={[{ required: true, message: "Chassis number is required" }]}>
                <Input
                  placeholder={isChassisLocked ? "Chassis fixed for this movement" : "Enter chassis number"}
                  disabled={isChassisLocked}
                  onChange={(e)=>{ const v = (e.target.value||"").toUpperCase(); form.setFieldsValue({ chassis: v }); }}
                />
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item name="sourceBranch" label={label("Source Branch")}> 
                <Select
                  allowClear={!isSourceLocked}
                  disabled={isSourceLocked}
                  placeholder={isSourceLocked ? (form.getFieldValue('sourceBranch') || myBranch || "Current branch") : "(Optional) Select current branch"}
                  value={isSourceLocked ? (form.getFieldValue('sourceBranch') || myBranch) : undefined}
                >
                  {branchNames.map((b) => <Select.Option key={b} value={b}>{b}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>

            <Col span={24}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ fontWeight: 700 }}>Vehicle Details (from CSV)</div>
                <div style={{ fontSize: 12, color: sheetOk ? "#10b981" : "#ef4444" }}>{sheetOk ? "Catalog loaded" : "Catalog unavailable"}</div>
              </div>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item name="company" label={label("Company")} rules={isVehicleLocked ? [] : [{ required: true, message: "Company is required" }]}> 
                <Select placeholder={sheetOk ? "Select company" : "Sheet unavailable"} disabled={!sheetOk || isVehicleLocked} onChange={onCompany} showSearch optionFilterProp="children">
                  {companies.map((c) => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="model" label={label("Model")} rules={isVehicleLocked ? [] : [{ required: true, message: "Model is required" }]}> 
                <Select placeholder="Select model" disabled={!sheetOk || !company || isVehicleLocked} onChange={onModel} showSearch optionFilterProp="children">
                  {models.map((m) => <Select.Option key={m} value={m}>{m}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item name="variant" label={label("Variant")} rules={isVehicleLocked ? [] : [{ required: true, message: "Variant is required" }]}> 
                <Select placeholder="Select variant" disabled={!sheetOk || !model || isVehicleLocked} onChange={onVariant} showSearch optionFilterProp="children">
                  {variants.map((v) => <Select.Option key={v} value={v}>{v}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="color" label={label("Color")} rules={isVehicleLocked ? [] : [{ required: true, message: "Color is required" }]}> 
                {colors.filter(Boolean).length ? (
                  <Select placeholder="Select color" disabled={!sheetOk || !variant || isVehicleLocked} showSearch optionFilterProp="children">
                    {colors.filter(Boolean).map((c) => {
                      const s = swatch(c);
                      return (
                        <Select.Option key={c} value={c}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 12, height: 12, borderRadius: 3, background: s.bg, border: `1px solid ${s.border}` }} />
                            {c}
                          </span>
                        </Select.Option>
                      );
                    })}
                  </Select>
                ) : (
                  <Input placeholder="Type color" disabled={isVehicleLocked} />
                )}
              </Form.Item>
              {!isVehicleLocked && (
                <Space wrap size="small" style={{ marginTop: -8, marginBottom: 8 }}>
                  {PRESET_COLORS.map((c) => (
                    <Tooltip title={c.name} key={c.name}>
                      <Button
                        size="small"
                        onClick={() => form.setFieldsValue({ color: c.name })}
                        style={{
                          height: 28,
                          borderRadius: 14,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '0 10px',
                          border: `1px solid ${c.border || '#d1d5db'}`,
                          background: '#fff'
                        }}
                      >
                        <span style={{ width: 14, height: 14, borderRadius: 7, background: c.hex, border: `1px solid ${c.border || '#d1d5db'}` }} />
                        <span>{c.name}</span>
                      </Button>
                    </Tooltip>
                  ))}
                </Space>
              )}
            </Col>

            <Col span={24}>
              {Array.isArray(allowedActions) && allowedActions.length === 1 ? (
                <div style={{ marginBottom: 8 }}>
                  {label("Action")} <Tag color={action === 'add' ? 'purple' : action === 'transfer' ? 'geekblue' : action === 'return' ? 'volcano' : 'green'} style={{ marginLeft: 8 }}>{action}</Tag>
                </div>
              ) : (
                <Form.Item label={label("Action")}>
                  <Radio.Group
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                  >
                    {(allowedActions || ["add","transfer","return","invoice"]).includes("add") && (
                      <Radio value="add">Add New Stock</Radio>
                    )}
                    {(allowedActions || ["add","transfer","return","invoice"]).includes("transfer") && (
                      <Radio value="transfer">Transfer To</Radio>
                    )}
                    {(allowedActions || ["add","transfer","return","invoice"]).includes("return") && (
                      <Radio value="return">Return To</Radio>
                    )}
                    {(allowedActions || ["add","transfer","return","invoice"]).includes("invoice") && (
                      <Radio value="invoice">Invoice (Sold)</Radio>
                    )}
                  </Radio.Group>
                </Form.Item>
              )}
            </Col>

            {action === 'transfer' && (
              <Col xs={24} md={12}>
                <Form.Item name="targetBranch" label={label("Target Branch")} rules={[{ required: true, message: "Select target branch" }]}> 
                  <Select placeholder="Select branch">
                    {branchNames.map((b) => <Select.Option key={b} value={b}>{b}</Select.Option>)}
                  </Select>
                </Form.Item>
              </Col>
            )}
            {action === 'return' && (
              <Col xs={24} md={12}>
                <Form.Item name="returnTo" label={label("Return To (Dealer/Area)")} rules={[{ required: true, message: "Enter return destination" }]}> 
                  <Input placeholder="e.g., Kengaria / Dealer name" />
                </Form.Item>
              </Col>
            )}
            {action === 'invoice' && (
              <Col xs={24} md={12}>
                <Form.Item name="customerName" label={label("Customer Name")} rules={[{ required: true, message: "Customer name required" }]}> 
                  <Input placeholder="Enter customer name" />
                </Form.Item>
              </Col>
            )}

            <Col xs={24}>
              <Form.Item name="notes" label={label("Notes")}> 
                <Input.TextArea rows={3} placeholder="Optional notes" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Invoice Modal with Booking Form */}
      <Modal
        title="Create Invoice"
        open={invoiceModalOpen}
        onCancel={() => { setInvoiceModalOpen(false); setInvoicePrefill(null); }}
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
                Chassis_No: String(veh.chassisNo || invoiceBaseRow?.chassis || invoiceBaseRow?.chassisNo || '').toUpperCase(),
                Company: veh.company || invoiceBaseRow?.company || '',
                Model: veh.model || invoiceBaseRow?.model || '',
                Variant: veh.variant || invoiceBaseRow?.variant || '',
                Color: veh.color || invoiceBaseRow?.color || '',
                Action: 'invoice',
                Customer_Name: payload?.customerName || '',
                Source_Branch: invoiceBaseRow?.sourceBranch || myBranch || '',
                Notes: response?.bookingId ? `Invoice via Booking ID ${response.bookingId}` : 'Invoice via Booking form',
              };
              await createStock({ data: row, createdBy: currentUser?.name || currentUser?.email || 'user' });
              message.success('Stock updated: vehicle marked invoiced / out of stock');
              setInvoiceModalOpen(false);
              setInvoicePrefill(null);
              setInvoiceBaseRow(null);
              fetchList();
            } catch {
              message.error('Saved booking but failed to update stock. Please refresh and try again.');
            }
          }}
        />
      </Modal>
    </div>
  );
}
