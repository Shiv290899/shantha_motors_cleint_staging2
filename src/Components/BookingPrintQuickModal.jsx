// components/BookingPrintQuickModal.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Button, Spin, message } from 'antd';
import { saveBookingViaWebhook } from '../apiCalls/forms';
import BookingPrintSheet from './BookingPrintSheet';
import { handleSmartPrint } from '../utils/printUtils';

export default function BookingPrintQuickModal({ open, onClose, row, webhookUrl, secret }) {
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [payload, setPayload] = useState(null);
  const printRef = useRef(null);

  // Helpers to read values from varied Sheet headers and normalize to print payload
  const pick = (obj, keys) => String((keys || []).map((k) => obj?.[k] ?? '').find((v) => v !== '') || '').trim();
  const toDigits10 = (x) => String(x || '').replace(/\D/g, '').slice(-10);
  const normalizeFromSheet = (row) => {
    if (!row) return null;
    const src = (row && typeof row === 'object') ? (row.payload || row.formValues || row.values || row) : {};
    const customerName = pick(src, ['customerName','Customer Name','Customer_Name','Name','Customer']);
    const mobileNumber = toDigits10(pick(src, ['mobileNumber','Mobile Number','Mobile','Phone']));
    const address = pick(src, ['address','Address','Address Line','AddressLine']);
    const branch = pick(src, ['branch','Branch']);
    const executive = pick(src, ['executive','Executive','Sales Executive']);
    const rtoOffice = pick(src, ['rtoOffice','RTO Office','RTO']);
    const veh = (src && typeof src === 'object' && src.vehicle && typeof src.vehicle === 'object') ? src.vehicle : {};
    const company = veh.company || src.company || pick(src, ['company','Company']);
    const model = veh.model || src.model || pick(src, ['model','Model']);
    const variant = veh.variant || src.variant || pick(src, ['variant','Variant']);
    const color = veh.color || src.color || pick(src, ['color','Color']);
    const chassisNo = veh.chassisNo || src.chassisNo || pick(src, ['chassisNo','Chassis No','Chassis Number','Chassis']);
    const purchaseMode = pick(src, ['purchaseMode','purchaseType','Payment Type','Purchase Mode']);
    const financier = pick(src, ['financier','Financier','Financier Name','HP Financier','NOHP Financier']);
    const addressProofMode = pick(src, ['addressProofMode','Address Proof','Address Proof Mode']);
    let addressProofTypes = src?.addressProofTypes || src?.['Proof Types'] || src?.['Address Proof Types'] || '';
    if (typeof addressProofTypes === 'string') addressProofTypes = addressProofTypes.split(',').map((s)=>s.trim()).filter(Boolean);
    const fileName = pick(src, ['fileName','Document Name','File Name']);
    const createdAt = src?.createdAt || src?.Timestamp || src?.Date || new Date();
    return {
      customerName,
      mobileNumber,
      address,
      branch,
      executive,
      rtoOffice,
      purchaseMode,
      financier,
      addressProofMode,
      addressProofTypes: Array.isArray(addressProofTypes) ? addressProofTypes : [],
      fileName,
      createdAt,
      vehicle: {
        company,
        model,
        variant,
        color,
        chassisNo,
        availability: chassisNo ? 'found' : 'allot',
      },
    };
  };

  useEffect(() => {
    let active = true;
    // Show print-sheet on screen while modal is open (preview)
    if (open) {
      try { document.body.classList.add('print-host'); } catch {
        //iuuh
      }
    }
    const cleanupHost = () => { try { document.body.classList.remove('print-host'); } catch {
      //ohu
    } };
    const fetchPayload = async () => {
      if (!open || !row) return;
      setLoading(true);
      try {
        if (webhookUrl && row.bookingId) {
          const payload = { action: 'search', mode: 'booking', query: row.bookingId };
          if (secret) payload.secret = secret;
          const resp = await saveBookingViaWebhook({ webhookUrl, method: 'GET', payload });
          const j = resp?.data || resp;
          const r0 = Array.isArray(j?.rows) && j.rows.length ? j.rows[0] : null;
          const normalized = r0 ? normalizeFromSheet(r0) : null;
          if (active && normalized) {
            setPayload(normalized);
          } else {
            // Fallback: try list + filter client-side (if search endpoint differs)
            const respList = await saveBookingViaWebhook({ webhookUrl, method: 'GET', payload: secret ? { action: 'list', secret } : { action: 'list' } });
            const jl = respList?.data || respList;
            const arr = Array.isArray(jl?.data) ? jl.data : [];
            const hit = arr.find((r) => String(r['Booking ID'] || '').trim() === String(row.bookingId).trim());
            const norm2 = hit ? normalizeFromSheet(hit) : null;
            if (active && norm2) setPayload(norm2);
            if (active && !norm2) message.error('Booking not found in Sheet by Booking ID');
          }
        } else {
          if (active) {
            message.error('Missing Booking ID or webhook URL for print');
            setPayload(null);
          }
        }
      } catch  {
        if (active) { message.error('Failed to fetch booking from Sheet'); setPayload(null); }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchPayload();
    return () => { active = false; cleanupHost(); };
  }, [open, row, webhookUrl]);

  const handlePrint = async () => {
    setPrinting(true);
    try {
      // Ensure spinner paints before heavy work
      await new Promise((r) => setTimeout(r, 0));
      await handleSmartPrint(printRef.current);
    } catch {
      //ugyf
    } finally {
      setPrinting(false);
    }
  };

  const body = (
    <div style={{ display: open ? 'block' : 'none' }}>
      <BookingPrintSheet ref={printRef} active vals={payload || {}} />
    </div>
  );

  return (
    <Modal open={open} title="Print Booking" onCancel={onClose} footer={null} width={980} destroyOnClose>
      {loading ? (
        <div style={{ display: 'grid', placeItems: 'center', height: 120 }}><Spin /></div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose} disabled={printing}>Close</Button>
          <Button type="primary" onClick={handlePrint} disabled={!payload || printing} loading={printing}>Print</Button>
        </div>
      )}
      {body}
    </Modal>
  );
}
