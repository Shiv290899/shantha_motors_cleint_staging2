// components/PostServiceQuickModal.jsx
import React, { useMemo, useRef, useState } from "react";
import { Modal, Button, Segmented, message, Input, Card } from "antd";
import { saveJobcardViaWebhook } from "../apiCalls/forms";
import PostServiceSheet from "./PostServiceSheet";
import { handleSmartPrint } from "../utils/printUtils";

/**
 * Lightweight Post Service modal for Follow-Ups → Job Card rows.
 * - Reuses the Apps Script webhook action `postService` (same as JobCard.jsx)
 * - If row payload has totals/labourRows, prints a detailed sheet; otherwise prints
 *   a minimal sheet with just customer/vehicle and collected amount.
 */
export default function PostServiceQuickModal({ open, onClose, row, webhookUrl }) {
  // Split payments (two slots)
  const [pay1Mode, setPay1Mode] = useState('cash');
  const [pay1Amt, setPay1Amt] = useState('');
  const [pay1Utr, setPay1Utr] = useState('');
  const [pay2Mode, setPay2Mode] = useState('online');
  const [pay2Amt, setPay2Amt] = useState('');
  const [pay2Utr, setPay2Utr] = useState('');
  const [remarks, setRemarks] = useState('');
  const printRef = useRef(null);

  const amount = useMemo(() => {
    const a = Number(row?.amount || row?.totals?.grand || 0);
    return Number.isFinite(a) ? Math.max(0, Math.round(a)) : 0;
  }, [row]);
  const [saving, setSaving] = useState(false);

  const valsForPrint = useMemo(() => {
    const fv = row?.formValues || row?.payload?.formValues || {};
    return {
      jcNo: row?.jcNo || fv.jcNo || "",
      branch: row?.branch || fv.branch || "",
      executive: row?.executive || fv.executive || "",
      regNo: row?.regNo || fv.regNo || "",
      model: row?.model || fv.model || "",
      colour: row?.colour || fv.colour || "",
      km: fv.km || "",
      custName: row?.name || fv.custName || "",
      custMobile: row?.mobile || fv.custMobile || "",
      createdAt: new Date(),
      labourRows: Array.isArray(row?.labourRows) ? row.labourRows
        : Array.isArray(row?.payload?.labourRows) ? row.payload.labourRows : [],
    };
  }, [row]);

  const totalsForPrint = useMemo(() => {
    const t = row?.totals || row?.payload?.totals || {};
    const grand = amount || Number(t.grand || 0) || 0;
    return {
      grand,
      labourSub: t.labourSub || t.labour || 0,
      labourGST: t.labourGST || 0,
      labourDisc: t.labourDisc || t.discount || 0,
    };
  }, [row, amount]);

  // Live payable/collection summary for gating buttons
  const payablePreview = useMemo(() => Math.round(Number(amount || 0)), [amount]);
  const collectedPreview = useMemo(
    () => Math.round((Number(pay1Amt || 0) + Number(pay2Amt || 0)) || 0),
    [pay1Amt, pay2Amt]
  );
  const duePreview = useMemo(
    () => payablePreview - collectedPreview,
    [payablePreview, collectedPreview]
  );

  const savePostService = async (shouldPrint) => {
    try {
      setSaving(true);
      // Ensure spinner paints before heavy work
      await new Promise((r) => setTimeout(r, 0));
      const mobile10 = String(valsForPrint?.custMobile || "").replace(/\D/g, "").slice(-10);
      if (mobile10.length !== 10) {
        message.error("Missing/invalid 10-digit mobile.");
        return;
      }
      const jc = String(valsForPrint?.jcNo || "").trim();
      const a1 = Number(pay1Amt || 0) || 0;
      const a2 = Number(pay2Amt || 0) || 0;
      if (!(a1 > 0 || a2 > 0)) {
        message.error('Enter amount for Cash or Online (at least one).');
        return;
      }
      if (pay1Mode === 'online' && a1 > 0) {
        const u = String(pay1Utr || '').trim();
        if (u.length < 4) { message.error('Enter UTR for Online (Slot 1).'); return; }
      }
      if (pay2Mode === 'online' && a2 > 0) {
        const u = String(pay2Utr || '').trim();
        if (u.length < 4) { message.error('Enter UTR for Online (Slot 2).'); return; }
      }
      const payments = [];
      if (a1 > 0) payments.push({ amount: Math.round(a1), mode: pay1Mode, ...(pay1Mode === 'online' ? { utr: String(pay1Utr || '').trim() } : {}) });
      if (a2 > 0) payments.push({ amount: Math.round(a2), mode: pay2Mode, ...(pay2Mode === 'online' ? { utr: String(pay2Utr || '').trim() } : {}) });
      const collectedAmount = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      // Require full collection before billing/saving
      const payable = Math.round(Number(amount || 0));
      if (collectedAmount !== payable) {
        const diff = payable - collectedAmount;
        message.error(`Please collect full amount. Payable: ₹${payable}, Collected: ₹${collectedAmount}, ${diff > 0 ? 'Pending' : 'Excess'}: ₹${Math.abs(diff)}`);
        return;
      }
      const modes = Array.from(new Set(payments.map(p => p.mode)));
      const paymentMode = modes.length > 1 ? 'mixed' : (modes[0] || '');
      const joinedUtr = payments.filter(p => p.mode === 'online' && p.utr).map(p => p.utr).join(' / ');
      const cashCollected = payments.filter(p=>String(p.mode).toLowerCase()==='cash').reduce((s,p)=>s+(Number(p.amount)||0),0);
      const onlineCollected = payments.filter(p=>String(p.mode).toLowerCase()==='online').reduce((s,p)=>s+(Number(p.amount)||0),0);
      const fvRow = (row?.formValues || row?.payload?.formValues || {});
      const vehicleType = row?.vehicleType || fvRow?.vehicleType || '';
      const serviceType = row?.serviceType || fvRow?.serviceType || '';
      const expectedDeliveryStr = fvRow?.expectedDelivery || '';
      const kmDigits = String(valsForPrint.km || fvRow?.km || "").replace(/\D/g, "");
      const obsOneLine = String(fvRow?.obs || '').replace(/\s*\r?\n\s*/g, ' # ').trim();
      const remarkText = String(remarks || '').trim();
      const payload = {
        postServiceAt: new Date().toISOString(),
        formValues: {
          jcNo: jc,
          branch: valsForPrint.branch || "",
          mechanic: fvRow?.mechanic || "",
          executive: valsForPrint.executive || "",
          expectedDelivery: expectedDeliveryStr || null,
          regNo: valsForPrint.regNo || "",
          model: valsForPrint.model || "",
          colour: valsForPrint.colour || "",
          km: kmDigits,
          fuelLevel: fvRow?.fuelLevel || "",
          callStatus: "",
          custName: valsForPrint.custName || "",
          custMobile: String(valsForPrint.custMobile || ""),
          obs: obsOneLine,
          remarks: remarkText,
          vehicleType: String(vehicleType || ""),
          serviceType: String(serviceType || ""),
          floorMat: undefined,
          amount: String(amount || 0),
        },
        labourRows: Array.isArray(valsForPrint.labourRows) ? valsForPrint.labourRows : [],
        totals: totalsForPrint,
      };

      // Save via webhook
      if (webhookUrl) {
        // Single post-service update (no background pre-save to avoid duplicates)
        const formValuesTop = {
          custName: valsForPrint.custName || '',
          custMobile: mobile10,
          branch: valsForPrint.branch || '',
          executive: valsForPrint.executive || '',
          regNo: valsForPrint.regNo || '',
          serviceType: String(serviceType || ''),
          vehicleType: String(vehicleType || ''),
          mechanic: String(fvRow?.mechanic || ''),
          model: valsForPrint.model || '',
          colour: valsForPrint.colour || '',
          km: kmDigits || '',
          fuelLevel: String(fvRow?.fuelLevel || ''),
          expectedDelivery: expectedDeliveryStr || '',
          obs: obsOneLine,
          remarks: remarkText,
        };

        await saveJobcardViaWebhook({
          webhookUrl,
          method: 'POST',
          payload: { action: 'postService', data: { mobile: mobile10, jcNo: jc || undefined, serviceAmount: amount || 0, collectedAmount, paymentMode, payments, utr: joinedUtr || undefined, utrNo: joinedUtr || undefined, remarks: remarkText, payload: { ...payload, payments, remarks: remarkText }, source: 'jobcard', cashCollected, onlineCollected, totalCollected: collectedAmount, formValues: formValuesTop } },
        });
      }
      message.success('Saved successfully');

      if (shouldPrint) {
        setTimeout(() => { try { handleSmartPrint(printRef.current); } catch {
          //asbf
        } }, 50);
      }
      onClose?.();
      setPay1Amt(''); setPay1Utr(''); setPay2Amt(''); setPay2Utr(''); setRemarks('');
    } catch (e) {
      message.error(e?.message || 'Could not save post-service');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal open={open} title="Post-service" onCancel={onClose} footer={null}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Card size="small" bordered>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ marginBottom: 6 }}>Amount (₹)</div>
                <Input inputMode="numeric" placeholder="0" value={pay1Amt} onChange={(e)=>setPay1Amt(e.target.value.replace(/[^0-9.]/g,''))} />
              </div>
              <div>
                <div style={{ marginBottom: 6 }}>Mode</div>
                <Segmented value={pay1Mode} onChange={setPay1Mode} options={[{ label: 'Cash', value: 'cash' }, { label: 'Online', value: 'online' }]} />
              </div>
            </div>
            {pay1Mode === 'online' && (
              <div style={{ marginTop: 10 }}>
                <div style={{ marginBottom: 6, fontSize: 12, color: '#374151' }}>UTR No. (Slot 1)</div>
                <Input placeholder="Enter UTR number" value={pay1Utr} onChange={(e)=>setPay1Utr(String(e.target.value || '').toUpperCase())} maxLength={32} style={{ textTransform: 'uppercase' }} />
              </div>
            )}
          </Card>

          <Card size="small" bordered>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ marginBottom: 6 }}>Amount (₹)</div>
                <Input inputMode="numeric" placeholder="0" value={pay2Amt} onChange={(e)=>setPay2Amt(e.target.value.replace(/[^0-9.]/g,''))} />
              </div>
              <div>
                <div style={{ marginBottom: 6 }}>Mode</div>
                <Segmented value={pay2Mode} onChange={setPay2Mode} options={[{ label: 'Cash', value: 'cash' }, { label: 'Online', value: 'online' }]} />
              </div>
            </div>
            {pay2Mode === 'online' && (
              <div style={{ marginTop: 10 }}>
                <div style={{ marginBottom: 6, fontSize: 12, color: '#374151' }}>UTR No. (Slot 2)</div>
                <Input placeholder="Enter UTR number" value={pay2Utr} onChange={(e)=>setPay2Utr(String(e.target.value || '').toUpperCase())} maxLength={32} style={{ textTransform: 'uppercase' }} />
              </div>
            )}
          </Card>
        </div>
        {/* Live payable/collection summary */}
        <div style={{ marginTop: 8, fontSize: 13, color: duePreview === 0 ? '#166534' : '#b91c1c' }}>
          <strong>Payable:</strong> ₹{payablePreview} &nbsp;|
          &nbsp;<strong>Collected:</strong> ₹{collectedPreview} &nbsp;|
          &nbsp;<strong>{duePreview >= 0 ? 'Due' : 'Excess'}:</strong> ₹{Math.abs(duePreview)}
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 6 }}>Remarks (optional)</div>
          <Input.TextArea
            placeholder="Enter any delivery remarks for this service"
            value={remarks}
            onChange={(e)=>setRemarks(e.target.value)}
            autoSize={{ minRows: 2, maxRows: 3 }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => savePostService(false)} disabled={saving || duePreview !== 0} loading={saving}>Save</Button>
          <Button type="primary" onClick={() => savePostService(true)} disabled={saving || duePreview !== 0} loading={saving}>Print</Button>
        </div>
      </Modal>

      {/* Hidden print host */}
      <div style={{ display: 'none' }}>
        <PostServiceSheet ref={printRef} active vals={valsForPrint} totals={totalsForPrint} />
      </div>
    </>
  );
}
