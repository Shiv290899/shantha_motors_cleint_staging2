import React, { useMemo, useState, useEffect } from "react";
import { Card, Form, Input, InputNumber, Select, Button, Row, Col, Divider, message, Space, Typography, Table, Popconfirm } from "antd";
import { handleSmartPrint } from "../utils/printUtils";
import MinorSalesPrintSheet from "./MinorSalesPrintSheet";
import { saveBookingViaWebhook } from "../apiCalls/forms";
import { GetCurrentUser } from "../apiCalls/users";
import { SALES_DISPLAY } from "../data/contactInfo";

// Optional: Configure your Minor Sales Google Apps Script Web App URL via Vite env
// Add to client/.env (vite-project/.env):
//   VITE_MINOR_SALES_GAS_URL=https://script.google.com/macros/s/YOUR_ID/exec
const MINOR_SALES_GAS_URL = import.meta.env.VITE_MINOR_SALES_GAS_URL || "https://script.google.com/macros/s/AKfycbzSZXgDyahzkeDYWLdLIdRdrNz-Jj4it1VGVwY06FlMZnjMrsFRtZQFO-Eu592_O-hy/exec"; // empty -> offline mode

const phoneRule = [
  { required: true, message: "Mobile number is required" },
  { pattern: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit Indian mobile number" },
];

const ITEM_DEFS = {
  helmet: { label: "Helmet", prices: [500, 400] },
  mat: { label: "Floor Mat", prices: [200, 150, 100] },
  vehicleCover: { label: "Vehicle Cover", prices: [300, 250, 200] },
  numberPlateFrame: { label: "Number Plate Frame", prices: [200, 150, 100] },
  others: { label: "Others", prices: [] },
};
const ITEM_OPTIONS = [...Object.entries(ITEM_DEFS)]
  .sort((a, b) => (a[0] === 'others') - (b[0] === 'others'))
  .map(([value, def]) => ({ value, label: def.label }));

const PAYMENT_MODES = [
  { label: "Cash", value: "cash" },
  { label: "ONLINE", value: "online" },
];

function inr(n) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.max(0, Math.round(n || 0)));
}

function normalize10(s) { return String(s || "").replace(/\D/g, "").slice(-10); }

function genOrderId() {
  const d = new Date();
  return [
    d.getFullYear().toString().slice(-2),
    ("0" + (d.getMonth() + 1)).slice(-2),
    ("0" + d.getDate()).slice(-2),
    "-",
    Math.random().toString(36).slice(2, 6).toUpperCase(),
  ].join("");
}

export default function MinorSales() {
  const [form] = Form.useForm();
  const [, setLoading] = useState(false);
  const [userMeta, setUserMeta] = useState({ staffName: "", branchName: "" });
  const [cart, setCart] = useState([]); // array of { item, qty, unitPrice, amount }
  const [orderId, setOrderId] = useState(genOrderId());
  const [printing, setPrinting] = useState(false);
  const [printVals, setPrintVals] = useState(null);
  const printRef = React.useRef(null);

  // Lightweight outbox (like JobCard) so saving can happen in background
  const OUTBOX_KEY = 'MinorSales:outbox';
  const readJson = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
  const writeJson = (k, obj) => { try { localStorage.setItem(k, JSON.stringify(obj)); } catch { /* ignore */ } };
  const enqueueOutbox = (job) => { const box = readJson(OUTBOX_KEY, []); const item = { id: Date.now()+':' + Math.random().toString(36).slice(2), job }; box.push(item); writeJson(OUTBOX_KEY, box); return item.id; };
  const removeOutboxById = (id) => { const box = readJson(OUTBOX_KEY, []); writeJson(OUTBOX_KEY, box.filter(x=>x.id!==id)); };
  const retryOutbox = async () => {
    try {
      const box = readJson(OUTBOX_KEY, []);
      for (const item of box) {
        const j = item.job || {};
        if (j?.type === 'minor' && MINOR_SALES_GAS_URL) {
          try {
            const resp = await saveBookingViaWebhook({ webhookUrl: MINOR_SALES_GAS_URL, method: 'POST', payload: j.data });
            const ok = (resp?.data || resp)?.success !== false;
            if (ok) removeOutboxById(item.id);
          } catch { /* keep */ }
        }
      }
    } catch { /* ignore */ }
  };
  useEffect(() => { setTimeout(() => { retryOutbox(); }, 0); }, []);
  useEffect(() => { const onOnline = () => retryOutbox(); window.addEventListener('online', onOnline); return () => window.removeEventListener('online', onOnline); }, []);

  useEffect(() => {
    (async () => {
      try {
        let user = null;
        try { const raw = localStorage.getItem('user'); user = raw ? JSON.parse(raw) : null; } catch {//gg
          }
        if (!user) {
          const resp = await GetCurrentUser().catch(() => null);
          if (resp?.success && resp.data) { user = resp.data; try { localStorage.setItem('user', JSON.stringify(user)); } catch {//gg
            } }
        }
        const staffName = user?.formDefaults?.staffName || user?.name || "";
        const branchName = user?.formDefaults?.branchName || user?.primaryBranch?.name || (Array.isArray(user?.branches) ? (typeof user.branches[0] === 'string' ? user.branches[0] : (user.branches[0]?.name || '')) : "");
        setUserMeta({ staffName, branchName });
      } catch {//gg
        }
    })();
  }, []);

  const selectedKey = Form.useWatch('item', form);
  const selectedDef = selectedKey ? ITEM_DEFS[selectedKey] : null;
  const selectedPrice = Form.useWatch('price', form);
  const qty = Form.useWatch('qty', form) || 1;

  const customItemName = Form.useWatch('customItemName', form);
  const customQty = Form.useWatch('customQty', form) || 1;

  const selectedItemRow = useMemo(() => {
    if (!selectedKey) return null;
    if (selectedKey === 'others') {
      const unit = Number(selectedPrice);
      const q = Number(customQty || 1);
      const name = (customItemName || '').trim();
      if (!name || !unit) return null;
      return { item: name.toUpperCase(), qty: q, unitPrice: unit, amount: unit * q };
    }
    if (!selectedDef || !selectedPrice) return null;
    const q = Number(qty || 1);
    const unit = Number(selectedPrice);
    const label = String(selectedDef.label || '').toUpperCase();
    return { item: label, qty: q, unitPrice: unit, amount: unit * q };
  }, [selectedKey, selectedDef, selectedPrice, qty, customQty, customItemName]);

  const cartTotal = useMemo(() => {
    if (!Array.isArray(cart) || cart.length === 0) return 0;
    return cart.reduce((sum, it) => sum + Number(it.amount || 0), 0);
  }, [cart]);

  function addToCart() {
    if (!selectedItemRow) { message.warning("Select item, price, and qty first"); return; }
    setCart(prev => {
      const idx = prev.findIndex(p => p.item === selectedItemRow.item && Number(p.unitPrice) === Number(selectedItemRow.unitPrice));
      if (idx >= 0) {
        const next = [...prev];
        const mergedQty = Number(next[idx].qty || 0) + Number(selectedItemRow.qty || 0);
        next[idx] = {
          ...next[idx],
          qty: mergedQty,
          amount: mergedQty * Number(next[idx].unitPrice)
        };
        return next;
      }
      return [...prev, selectedItemRow];
    });
    if (selectedKey === 'others') {
      form.setFieldsValue({ item: undefined, price: undefined, customQty: 1, customItemName: undefined });
    } else {
      form.setFieldsValue({ item: undefined, price: undefined, qty: 1 });
    }
  }

  // Auto-add to cart when a predefined item's price is selected (qty defaults to 1)
  useEffect(() => {
    if (!selectedKey || selectedKey === 'others') return;
    if (!selectedDef) return;
    if (!selectedPrice) return;
    // Ensure qty defaults to 1 if empty
    const q = form.getFieldValue('qty');
    if (!q) form.setFieldsValue({ qty: 1 });
    // Add immediately then reset selectors
    const row = selectedItemRow;
    if (row && row.item && Number(row.unitPrice) > 0) {
      setCart(prev => {
        const idx = prev.findIndex(p => p.item === row.item && Number(p.unitPrice) === Number(row.unitPrice));
        if (idx >= 0) {
          const next = [...prev];
          const mergedQty = Number(next[idx].qty || 0) + Number(row.qty || 1);
          next[idx] = { ...next[idx], qty: mergedQty, amount: mergedQty * Number(next[idx].unitPrice) };
          return next;
        }
        return [...prev, row];
      });
      // Reset selection after auto-add
      form.setFieldsValue({ item: undefined, price: undefined, qty: 1 });
      message.success('Added to cart');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, selectedPrice]);

  function updateCartQty(index, newQty) {
    setCart(prev => {
      const next = [...prev];
      const q = Math.max(1, Number(newQty || 1));
      const unit = Number(next[index].unitPrice || 0);
      next[index] = { ...next[index], qty: q, amount: q * unit };
      return next;
    });
  }

  function removeCartItem(index) {
    setCart(prev => prev.filter((_, i) => i !== index));
  }

  
  async function printAndSaveSlip() {
    setPrinting(true); // show spinner instantly on tap
    try {
      // Ensure spinner paints before heavy work
      await new Promise((r) => setTimeout(r, 0));
      if (!cart.length) { message.warning("Add at least one item to cart"); return; }
      const vals = await form.validateFields(["custName", "custMobile", "paymentMode"]);

      // Pre-aggregate split for GAS (frontend-only approach)
      const mode = String(vals.paymentMode || '').toLowerCase();
      const cashCollected = mode === 'cash' ? Number(cartTotal || 0) : 0;
      const onlineCollected = mode === 'online' ? Number(cartTotal || 0) : 0;
      const totalCollected = Number(cartTotal || 0);

      const payload = {
        action: "minor_sales_save",
        data: {
          staffName: userMeta.staffName || undefined,
          branchName: userMeta.branchName || undefined,
          dateTimeIso: new Date().toISOString(),
          orderId,
          summaryTotal: cartTotal,
          source: 'minorsales',
          cashCollected,
          onlineCollected,
          totalCollected,
          items: cart,
          purchased: true,
          customer: {
            name: String(vals.custName || "").trim().toUpperCase(),
            mobile: normalize10(vals.custMobile),
            paymentMode: vals.paymentMode || "",
            utr: String(form.getFieldValue('utr') || '').trim() || undefined,
          },
        },
      };

      // Optimistic: enqueue background save so we don't block printing
      const outboxId = enqueueOutbox({ type: 'minor', data: payload });
      setTimeout(async () => {
        try {
          if (MINOR_SALES_GAS_URL) {
            const resp = await saveBookingViaWebhook({ webhookUrl: MINOR_SALES_GAS_URL, method: 'POST', payload });
            const ok = (resp?.data || resp)?.success !== false;
            if (ok) removeOutboxById(outboxId);
          }
        } catch { /* keep queued */ }
      }, 0);
      message.loading({ key: 'msave', content: 'Saving in background…', duration: 1 });
      // Prepare print values from validated form values
      setPrintVals({
        staffName: userMeta.staffName,
        branchName: userMeta.branchName,
        dateTimeIso: new Date().toISOString(),
        orderId,
        summaryTotal: cartTotal,
        source: 'minorsales',
        cashCollected,
        onlineCollected,
        totalCollected,
        items: cart,
        customer: {
          name: String(vals.custName || '').trim().toUpperCase(),
          mobile: normalize10(vals.custMobile),
          paymentMode: vals.paymentMode || '',
          utr: String(form.getFieldValue('utr') || '').trim() || undefined,
        },
      });
      await new Promise((r)=>setTimeout(r,0));
      await handleSmartPrint(printRef.current);
      // After successful save and print, reset the form for the next entry
      try { form.resetFields(); } catch { /* ignore */ }
      setCart([]);
      setOrderId(genOrderId());
      setPrintVals(null);
    } catch (e) {
      if (e?.errorFields) return;
      console.error('Print slip failed', e);
      message.error('Unable to print slip');
    } finally { setPrinting(false); }
  }
  

  

  // removed legacy printSlip (use printAndSaveSlip)

  const initValues = useMemo(() => ({ item: undefined, price: undefined, qty: 1, customQty: 1 }), []);

  async function _handleSave() {
    try {
      const vals = await form.validateFields();
      if (!cart.length) {
        message.error("Cart is empty. Add at least one item.");
        return;
      }
      await form.validateFields(["custName", "custMobile", "paymentMode"]);

      const items = cart;

      // Pre-aggregate split for GAS (frontend-only approach)
      const mode = String(vals.paymentMode || '').toLowerCase();
      const cashCollected = mode === 'cash' ? Number(cartTotal || 0) : 0;
      const onlineCollected = mode === 'online' ? Number(cartTotal || 0) : 0;
      const totalCollected = Number(cartTotal || 0);

      const payload = {
        action: "minor_sales_save",
        data: {
          staffName: userMeta.staffName || undefined,
          branchName: userMeta.branchName || undefined,
          dateTimeIso: new Date().toISOString(),
          orderId,
          summaryTotal: cartTotal,
          source: 'minorsales',
          cashCollected,
          onlineCollected,
          totalCollected,
          items,
          purchased: true,
          customer: {
            name: String(vals.custName || "").trim().toUpperCase(),
            mobile: normalize10(vals.custMobile),
            paymentMode: vals.paymentMode || "",
          },
        },
      };

      setLoading(true);

      if (!MINOR_SALES_GAS_URL) {
        // Offline mode: no webhook configured; just pretend success
        console.info("MinorSales: no GAS URL configured (VITE_MINOR_SALES_GAS_URL). Payload:", payload);
        message.success("Saved locally (no Google Sheet configured)");
        form.resetFields();
        setCart([]);
        setOrderId(genOrderId());
        return;
      }

      const resp = await saveBookingViaWebhook({
        webhookUrl: MINOR_SALES_GAS_URL,
        method: "POST",
        payload,
      });
      if (resp?.success) {
        message.success("Purchase saved to Google Sheet");
        form.resetFields();
        setCart([]);
        setOrderId(genOrderId());
      } else {
        message.warning("Save attempted but response not successful");
      }
    } catch (err) {
      if (err?.errorFields) return; // antd validation already highlighted
      console.error("MinorSales save failed", err);
      message.error("Failed to save. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="Minor Sales (Quick)" bodyStyle={{ padding: 16 }}>
      <Form
        form={form}
        layout="vertical"
        initialValues={initValues}
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} md={10}>
            <Form.Item name="item" label="Item" rules={[{ required: true, message: "Select item" }]}>
              <Select options={ITEM_OPTIONS} placeholder="Choose item" showSearch optionFilterProp="label" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            {selectedKey === 'others' ? (
              <Form.Item name="price" label="Price (₹)" rules={[{ required: true, message: "Enter price" }]}>
                <InputNumber style={{ width: '100%' }} min={1} step={1} placeholder="Enter price" />
              </Form.Item>
            ) : (
              <Form.Item name="price" label="Price (₹)" rules={[{ required: true, message: "Select price" }]}>
                <Select
                  placeholder="Select price"
                  disabled={!selectedDef}
                  options={(selectedDef?.prices || []).map(p => ({ label: `₹${p}`, value: p }))}
                />
              </Form.Item>
            )}
          </Col>
          <Col xs={24} md={6}>
            {selectedKey === 'others' ? (
              <Form.Item name="customQty" label="Quantity" rules={[{ required: true, message: "Enter quantity" }]}>
                <InputNumber style={{ width: '100%' }} min={1} step={1} />
              </Form.Item>
            ) : (
              <Form.Item name="qty" label="Quantity" rules={[{ required: true, message: "Enter quantity" }]}>
                <InputNumber style={{ width: '100%' }} min={1} step={1} />
              </Form.Item>
            )}
          </Col>
        </Row>
        {selectedKey === 'others' && (
          <Row gutter={[12,12]}>
            <Col xs={24} md={16}>
              <Form.Item name="customItemName" label="Item Name (Others)" rules={[{ required: true, message: 'Enter item name' }]} getValueFromEvent={(e) => (e && e.target ? e.target.value.toUpperCase() : e)}>
                <Input placeholder="TYPE ITEM NAME" />
              </Form.Item>
            </Col>
          </Row>
        )}
        <Row>
          <Col span={24}>
            <Button onClick={addToCart} disabled={selectedKey === 'others'
              ? !(customItemName && selectedPrice)
              : !(selectedDef && selectedPrice)
            }>
              Add to cart
            </Button>
          </Col>
        </Row>

        <Divider style={{ margin: "12px 0" }} />

        <Row justify="space-between" align="middle">
          <Col>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Order: {orderId}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Cart Total: {inr(cartTotal)}</div>
          </Col>
        </Row>

        <Card size="small" style={{ marginTop: 12 }} title="Cart">
          <Table
            dataSource={cart.map((it, idx) => ({ key: idx, ...it }))}
            pagination={false}
            size="small"
            columns={[
              { title: 'Item', dataIndex: 'item' },
              { title: 'Qty', dataIndex: 'qty', render: (val, _record, index) => (
                  <InputNumber min={1} value={val} onChange={(v) => updateCartQty(index, v)} />
                )
              },
              { title: 'Unit (₹)', dataIndex: 'unitPrice' },
              { title: 'Amount (₹)', dataIndex: 'amount' },
              { title: 'Action', render: (_val, _record, index) => (
                  <Popconfirm title="Remove this item?" onConfirm={() => removeCartItem(index)}>
                    <Button danger size="small">Remove</Button>
                  </Popconfirm>
                )
              },
            ]}
          />
        </Card>

        <Card size="small" style={{ marginTop: 12 }} title="Customer Details">
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item name="custName" label="Name" rules={[{ required: true, message: "Name is required" }]} getValueFromEvent={(e) => (e && e.target ? e.target.value.toUpperCase() : e)}>
                <Input placeholder="CUSTOMER NAME" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="custMobile" label="Mobile" rules={phoneRule}>
                <Input maxLength={10} placeholder="10-digit mobile" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="paymentMode" label="Payment Mode" rules={[{ required: true, message: "Select payment mode" }]}>
                <Select options={PAYMENT_MODES} placeholder="Select" allowClear />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item shouldUpdate noStyle>
                {() => (String(form.getFieldValue('paymentMode')||'').toLowerCase()==='online' ? (
                  <Form.Item
                    name="utr"
                    label="UTR / Reference"
                    rules={[{ required: true, message: 'Enter UTR/Reference for online payments' }]}
                    getValueFromEvent={(e) => {
                      const v = e && e.target ? e.target.value : e;
                      return typeof v === 'string' ? v.toUpperCase() : v;
                    }}
                  > 
                    <Input placeholder="e.g., 23XXXXUTR123" style={{ textTransform: 'uppercase' }} />
                  </Form.Item>
                ) : null)}
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Row justify="space-between" align="middle" style={{ marginTop: 8 }}>
          <Col>
            <Button type="primary" onClick={printAndSaveSlip} disabled={!cart.length || printing} loading={printing}>Print</Button>
          </Col>
          <Col />
        </Row>
      </Form>
      {/* Hidden print host */}
      <div style={{ display: 'none' }}>
        <MinorSalesPrintSheet ref={printRef} active={printing} vals={printVals || {}} />
      </div>
    </Card>
  );
}
