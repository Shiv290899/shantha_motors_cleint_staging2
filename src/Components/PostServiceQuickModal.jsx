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
  const printRef = useRef(null);

  const amount = useMemo(() => {
    const a = Number(row?.amount || row?.totals?.grand || 0);
    return Number.isFinite(a) ? Math.max(0, Math.round(a)) : 0;
  }, [row]);

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
    return { grand, parts: t.parts || 0, labour: t.labour || 0, labourGST: t.labourGST || 0 };
  }, [row, amount]);

  const savePostService = async (shouldPrint) => {
    try {
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
      const modes = Array.from(new Set(payments.map(p => p.mode)));
      const paymentMode = modes.length > 1 ? 'mixed' : (modes[0] || '');
      const joinedUtr = payments.filter(p => p.mode === 'online' && p.utr).map(p => p.utr).join(' / ');
      const payload = {
        postServiceAt: new Date().toISOString(),
        formValues: {
          jcNo: jc,
          branch: valsForPrint.branch || "",
          mechanic: "",
          executive: valsForPrint.executive || "",
          expectedDelivery: null,
          regNo: valsForPrint.regNo || "",
          model: valsForPrint.model || "",
          colour: valsForPrint.colour || "",
          km: String(valsForPrint.km || "").replace(/\D/g, ""),
          fuelLevel: "",
          callStatus: "",
          custName: valsForPrint.custName || "",
          custMobile: String(valsForPrint.custMobile || ""),
          obs: "",
          vehicleType: "",
          serviceType: "",
          floorMat: undefined,
          amount: String(amount || 0),
        },
        labourRows: Array.isArray(valsForPrint.labourRows) ? valsForPrint.labourRows : [],
        totals: totalsForPrint,
      };

      // Save via webhook
      if (webhookUrl) {
        // Single post-service update (no background pre-save to avoid duplicates)
        await saveJobcardViaWebhook({
          webhookUrl,
          method: 'POST',
          payload: { action: 'postService', data: { mobile: mobile10, jcNo: jc || undefined, serviceAmount: amount || 0, collectedAmount, paymentMode, payments, utr: joinedUtr || undefined, utrNo: joinedUtr || undefined, payload: { ...payload, payments } } },
        });
      }
      message.success('Saved successfully');

      if (shouldPrint) {
        setTimeout(() => { try { handleSmartPrint(printRef.current); } catch {
          //asbf
        } }, 50);
      }
      onClose?.();
      setPay1Amt(''); setPay1Utr(''); setPay2Amt(''); setPay2Utr('');
    } catch (e) {
      message.error(e?.message || 'Could not save post-service');
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
                <Input placeholder="Enter UTR number" value={pay1Utr} onChange={(e)=>setPay1Utr(e.target.value)} maxLength={32} />
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
                <Input placeholder="Enter UTR number" value={pay2Utr} onChange={(e)=>setPay2Utr(e.target.value)} maxLength={32} />
              </div>
            )}
          </Card>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={() => savePostService(false)}>Save Only</Button>
          <Button type="primary" onClick={() => savePostService(true)}>Save & Print</Button>
        </div>
      </Modal>

      {/* Hidden print host */}
      <div style={{ display: 'none' }}>
        <PostServiceSheet ref={printRef} active vals={valsForPrint} totals={totalsForPrint} />
      </div>
    </>
  );
}
