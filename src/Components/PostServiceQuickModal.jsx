// components/PostServiceQuickModal.jsx
import React, { useMemo, useRef, useState } from "react";
import { Modal, Button, Segmented, message } from "antd";
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
  const [payment, setPayment] = useState("cash");
  const [utr, setUtr] = useState("");
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
      if (payment === 'online') {
        const u = String(utr || '').trim();
        if (u.length < 4) {
          message.error('Enter a valid UTR No. for online payments.');
          return;
        }
      }
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
          payload: { action: 'postService', data: { mobile: mobile10, jcNo: jc || undefined, collectedAmount: amount || 0, paymentMode: payment, utr: payment === 'online' ? String(utr || '').trim() : undefined, utrNo: payment === 'online' ? String(utr || '').trim() : undefined, payload } },
        });
      }
      message.success('Post-service saved');

      if (shouldPrint) {
        setTimeout(() => { try { handleSmartPrint(printRef.current); } catch {
          //asbf
        } }, 50);
      }
      onClose?.();
      setUtr('');
    } catch (e) {
      message.error(e?.message || 'Could not save post-service');
    }
  };

  return (
    <>
      <Modal open={open} title="Post-service" onCancel={onClose} footer={null}>
        <div style={{ marginBottom: 12 }}>Select payment mode:</div>
        <Segmented value={payment} onChange={setPayment} options={[{ label: 'Cash', value: 'cash' }, { label: 'Online', value: 'online' }]} />
        {payment === 'online' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 6, fontSize: 12, color: '#374151' }}>UTR No.</div>
            <input
              type="text"
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder="Enter UTR number"
              maxLength={32}
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px' }}
            />
          </div>
        )}
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
