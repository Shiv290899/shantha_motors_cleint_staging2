import React, { useMemo, useState, useEffect } from "react";
import { Card, Form, Input, InputNumber, Button, Row, Col, Divider, message, Space, Typography, Table, Popconfirm, AutoComplete } from "antd";
import { handleSmartPrint } from "../utils/printUtils";
import MinorSalesPrintSheet from "./MinorSalesPrintSheet";
import { saveBookingViaWebhook } from "../apiCalls/forms";
import { GetCurrentUser } from "../apiCalls/users";

// Optional: Configure your Minor Sales Google Apps Script Web App URL via Vite env
// Add to client/.env (vite-project/.env):
//   VITE_MINOR_SALES_GAS_URL=https://script.google.com/macros/s/YOUR_ID/exec
const MINOR_SALES_GAS_URL = import.meta.env.VITE_MINOR_SALES_GAS_URL || "https://script.google.com/macros/s/AKfycbzUYgfSeU54u65-wYXCFUAnlCCX9jUnbRYC3DhKrexWBi5wLJzbKlghU1TrfuChGtbc/exec"; // empty -> offline mode

const phoneRule = [
  { required: true, message: "Mobile number is required" },
  { pattern: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit Indian mobile number" },
];

const ITEM_CATALOG = [
  { label: "Helmet", prices: [500, 400] },
  { label: "Floor Mat", prices: [200, 150, 100] },
  { label: "Vehicle Cover", prices: [300, 250, 200] },
  { label: "Number Plate Frame", prices: [200, 150, 100] },
];

const toNum = (v) => Number(String(v ?? 0).replace(/[₹,\s]/g, "")) || 0;

function inr(n) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.max(0, Math.round(n || 0)));
}

function normalize10(s) { return String(s || "").replace(/\D/g, "").slice(-10); }
function normalizeItemKey(s) { return String(s || "").trim().toUpperCase(); }

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

  const selectedItemName = Form.useWatch('item', form);
  const selectedPrice = Form.useWatch('price', form);
  const qty = Form.useWatch('qty', form) || 1;
  const payCash = Form.useWatch('paymentCash', form);
  const payOnline = Form.useWatch('paymentOnline', form);

  const itemOptions = useMemo(() => {
    const q = normalizeItemKey(selectedItemName);
    const list = ITEM_CATALOG.filter((it) => !q || normalizeItemKey(it.label).includes(q));
    return list.map((it) => ({ value: it.label }));
  }, [selectedItemName]);

  const exactCatalogItem = useMemo(() => {
    const key = normalizeItemKey(selectedItemName);
    if (!key) return null;
    return ITEM_CATALOG.find((it) => normalizeItemKey(it.label) === key) || null;
  }, [selectedItemName]);

  const priceOptions = useMemo(
    () => (exactCatalogItem?.prices || []).map((p) => ({ value: String(p), label: `₹${p}` })),
    [exactCatalogItem]
  );

  const cartTotal = useMemo(() => {
    if (!Array.isArray(cart) || cart.length === 0) return 0;
    return cart.reduce((sum, it) => sum + Number(it.amount || 0), 0);
  }, [cart]);

  const splitTotal = useMemo(() => toNum(payCash) + toNum(payOnline), [payCash, payOnline]);
  const splitMatchesTotal = cartTotal > 0 && splitTotal === toNum(cartTotal);

  const selectedItemRow = useMemo(() => {
    const name = String(selectedItemName || '').trim();
    if (!name) return null;
    const unit = toNum(selectedPrice);
    if (!unit) return null;
    const q = Number(qty || 1);
    return { item: name, qty: q, unitPrice: unit, amount: unit * q };
  }, [selectedItemName, selectedPrice, qty]);

  // Autofill cash with total when amounts are empty to reduce clicks
  useEffect(() => {
    const cashVal = toNum(payCash);
    const onlineVal = toNum(payOnline);
    if (cartTotal > 0 && cashVal === 0 && onlineVal === 0) {
      form.setFieldsValue({ paymentCash: cartTotal, paymentOnline: 0 });
    }
  }, [cartTotal, payCash, payOnline, form]);

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
    form.setFieldsValue({ item: undefined, price: undefined, qty: 1 });
  }

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
      const vals = await form.validateFields(["custName", "custMobile", "paymentCash", "paymentOnline", "utr"]);

      const cashCollected = toNum(vals.paymentCash);
      const onlineCollected = toNum(vals.paymentOnline);
      const totalCollected = cashCollected + onlineCollected;

      if (totalCollected !== toNum(cartTotal)) {
        message.error("Cash + Online should equal the cart total.");
        return;
      }

      const modeLabel =
        cashCollected > 0 && onlineCollected > 0
          ? "CASH+ONLINE"
          : onlineCollected > 0
          ? "ONLINE"
          : "CASH";

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
            paymentMode: modeLabel,
            utr: onlineCollected > 0 ? String(form.getFieldValue('utr') || '').trim() || undefined : undefined,
            cashCollected,
            onlineCollected,
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
          paymentMode: modeLabel,
          cashCollected,
          onlineCollected,
          utr: onlineCollected > 0 ? String(form.getFieldValue('utr') || '').trim() || undefined : undefined,
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

  const initValues = useMemo(() => ({ item: undefined, price: undefined, qty: 1, paymentCash: 0, paymentOnline: 0 }), []);

  async function _handleSave() {
    try {
      const vals = await form.validateFields();
      if (!cart.length) {
        message.error("Cart is empty. Add at least one item.");
        return;
      }
      await form.validateFields(["custName", "custMobile", "paymentCash", "paymentOnline", "utr"]);

      const items = cart;

      const cashCollected = toNum(vals.paymentCash);
      const onlineCollected = toNum(vals.paymentOnline);
      const totalCollected = cashCollected + onlineCollected;
      if (totalCollected !== toNum(cartTotal)) {
        message.error("Cash + Online should equal the cart total.");
        return;
      }

      const modeLabel =
        cashCollected > 0 && onlineCollected > 0
          ? "CASH+ONLINE"
          : onlineCollected > 0
          ? "ONLINE"
          : "CASH";

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
            paymentMode: modeLabel,
            cashCollected,
            onlineCollected,
            utr: onlineCollected > 0 ? String(form.getFieldValue('utr') || '').trim() || undefined : undefined,
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

  function handleClear() {
    try { form.resetFields(); } catch { /* ignore */ }
    setCart([]);
    setOrderId(genOrderId());
  }

  return (
    <Card
      title={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Typography.Text strong style={{ fontSize: 16 }}>Minor Sales (Quick)</Typography.Text>
            <div style={{ fontSize: 11, color: "#888" }}>
              {userMeta.branchName || ""} · {userMeta.staffName || ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Order ID</div>
            <div style={{ fontWeight: 700 }}>{orderId}</div>
          </div>
        </div>
      }
      bodyStyle={{ padding: 16 }}
      style={{ borderRadius: 10, boxShadow: "0 3px 10px rgba(0,0,0,0.06)" }}
      extra={
        <div style={{ textAlign: "right" }}>
          <Typography.Text style={{ fontSize: 12, color: "#888" }}>Cart Total</Typography.Text>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{inr(cartTotal)}</div>
        </div>
      }
    >
      <Form form={form} layout="vertical" initialValues={initValues}>
        {/* Item & Qty */}
        <Row gutter={[12, 12]}>
          <Col xs={24} md={10}>
            <Form.Item
              name="item"
              label="Item"
              rules={[{ required: true, message: "Enter item" }]}
            >
              <AutoComplete
                options={itemOptions}
                placeholder="Type or choose item"
                filterOption={(inputValue, option) =>
                  normalizeItemKey(option?.value).includes(normalizeItemKey(inputValue))
                }
                defaultActiveFirstOption={false}
                allowClear
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="price"
              label="Price (₹)"
              rules={[
                { required: true, message: "Enter price" },
                {
                  validator: (_, v) => toNum(v) > 0 ? Promise.resolve() : Promise.reject(new Error("Enter valid price")),
                },
              ]}
            >
              <AutoComplete
                options={priceOptions}
                placeholder={exactCatalogItem ? "Type price or choose suggestion" : "Type price"}
                filterOption={(inputValue, option) =>
                  String(option?.value || "").includes(String(inputValue || "").replace(/\D/g, ""))
                }
                defaultActiveFirstOption={false}
                allowClear
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item
              name="qty"
              label="Quantity"
              rules={[{ required: true, message: "Enter quantity" }]}
            >
              <InputNumber
                style={{ width: "100%" }}
                min={1}
                step={1}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row>
          <Col span={24}>
            <Button
              onClick={addToCart}
              type="primary"
              ghost
              disabled={!selectedItemRow}
            >
              Add to cart
            </Button>
          </Col>
        </Row>

        <Divider style={{ margin: "12px 0" }} />

        {/* Cart */}
        <Card
          size="small"
          title="Cart"
          style={{ marginBottom: 12 }}
          bodyStyle={{ padding: 8 }}
          extra={
            <Typography.Text strong>Items: {cart.length}</Typography.Text>
          }
        >
          <Table
            dataSource={cart.map((it, idx) => ({ key: idx, ...it }))}
            pagination={false}
            size="small"
            locale={{ emptyText: "No items added yet" }}
            columns={[
              { title: "Item", dataIndex: "item" },
              {
                title: "Qty",
                dataIndex: "qty",
                render: (val, _record, index) => (
                  <InputNumber
                    min={1}
                    value={val}
                    onChange={(v) => updateCartQty(index, v)}
                  />
                ),
              },
              { title: "Unit (₹)", dataIndex: "unitPrice" },
              { title: "Amount (₹)", dataIndex: "amount" },
              {
                title: "Action",
                render: (_val, _record, index) => (
                  <Popconfirm
                    title="Remove this item?"
                    onConfirm={() => removeCartItem(index)}
                  >
                    <Button danger size="small">
                      Remove
                    </Button>
                  </Popconfirm>
                ),
              },
            ]}
          />
        </Card>

        {/* Customer Details + Payment Split */}
        <Card
          size="small"
          title="Customer & Payment"
          bodyStyle={{ padding: 8 }}
        >
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item
                name="custName"
                label="Name"
                rules={[{ required: true, message: "Name is required" }]}
                getValueFromEvent={(e) =>
                  e && e.target ? e.target.value.toUpperCase() : e
                }
              >
                <Input placeholder="CUSTOMER NAME" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="custMobile" label="Mobile" rules={phoneRule}>
                <Input maxLength={10} placeholder="10-digit mobile" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item
                name="paymentCash"
                label="Cash (₹)"
                rules={[
                  {
                    validator: (_, v) => toNum(v) >= 0 ? Promise.resolve() : Promise.reject(new Error("Enter cash amount (₹)")),
                  },
                ]}
              >
                <InputNumber
                  min={0}
                  step={50}
                  style={{ width: "100%" }}
                  prefix="₹"
                  placeholder="0"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="paymentOnline"
                label="Online (₹)"
                rules={[
                  {
                    validator: (_, v) => toNum(v) >= 0 ? Promise.resolve() : Promise.reject(new Error("Enter online amount (₹)")),
                  },
                ]}
              >
                <InputNumber
                  min={0}
                  step={50}
                  style={{ width: "100%" }}
                  prefix="₹"
                  placeholder="0"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item shouldUpdate noStyle>
                {() => {
                  const onlineVal = toNum(form.getFieldValue("paymentOnline"));
                  return (
                    <Form.Item
                      name="utr"
                      label="UTR / Reference No."
                      rules={
                        onlineVal > 0
                          ? [{ required: true, message: "Enter UTR/Reference for online payments" }]
                          : []
                      }
                      getValueFromEvent={(e) => {
                        const v = e && e.target ? e.target.value : e;
                        return typeof v === "string" ? v.toUpperCase() : v;
                      }}
                    >
                      <Input
                        placeholder="e.g., 23XXXXUTR123"
                        style={{ textTransform: "uppercase" }}
                        disabled={onlineVal <= 0}
                      />
                    </Form.Item>
                  );
                }}
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* Footer actions */}
        <Row justify="space-between" align="middle" style={{ marginTop: 12 }}>
          <Col>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Net Payable
            </Typography.Text>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{inr(cartTotal)}</div>
          </Col>
          <Col>
            <Space>
              <Button onClick={handleClear} disabled={printing}>
                Clear
              </Button>
              <Button
                type="primary"
                onClick={printAndSaveSlip}
                disabled={!cart.length || printing || !splitMatchesTotal}
                loading={printing}
              >
                Print
              </Button>
            </Space>
          </Col>
        </Row>
      </Form>

      {/* Hidden print host */}
      <div style={{ display: "none" }}>
        <MinorSalesPrintSheet ref={printRef} active={printing} vals={printVals || {}} />
      </div>
    </Card>
  );
}
