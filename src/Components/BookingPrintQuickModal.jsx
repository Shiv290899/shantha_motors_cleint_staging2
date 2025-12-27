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
  const didAutoPrint = useRef(false);

  // Helpers to read values from varied Sheet headers and normalize to print payload
  const pick = (obj, keys) => String((keys || []).map((k) => obj?.[k] ?? '').find((v) => v !== '') || '').trim();
  const toDigits10 = (x) => String(x || '').replace(/\D/g, '').slice(-10);
  const parseMaybeJson = (val) => {
    if (!val) return null;
    if (typeof val === 'object') return val;
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        return (parsed && typeof parsed === 'object') ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  };
  const normalizeFromSheet = (row) => {
    if (!row || typeof row !== 'object') return null;
    const values = row.values || row;
    const payloadObj =
      parseMaybeJson(row.payload) ||
      parseMaybeJson(row.Payload) ||
      parseMaybeJson(row.PAYLOAD) ||
      parseMaybeJson(values.payload) ||
      parseMaybeJson(values.Payload) ||
      parseMaybeJson(values.PAYLOAD) ||
      {};
    const rawPayloadObj =
      parseMaybeJson(row.rawPayload) ||
      parseMaybeJson(row['Raw Payload']) ||
      parseMaybeJson(values['Raw Payload']) ||
      parseMaybeJson(values.rawPayload) ||
      parseMaybeJson(payloadObj.rawPayload) ||
      {};

    const merged = { ...rawPayloadObj, ...payloadObj };
    const vehicle = { ...(rawPayloadObj?.vehicle || {}), ...(payloadObj?.vehicle || {}) };

    const customerName =
      merged.customerName ||
      merged.name ||
      pick(values, ['Customer Name','Customer_Name','Customer','Name']) ||
      row.name ||
      '';
    const mobileNumber =
      toDigits10(merged.mobileNumber || merged.mobile || pick(values, ['Mobile Number','Mobile','Phone']) || row.mobile || '');
    const address = merged.address || pick(values, ['Address','Address Line','AddressLine']) || '';
    const branch = merged.branch || pick(values, ['Branch','Branch Name']) || row.branch || '';
    const executive = merged.executive || pick(values, ['Executive','Sales Executive']) || row.executive || '';
    const rtoOffice = merged.rtoOffice || pick(values, ['RTO Office','RTO','RTO Code']) || '';
    const purchaseMode = merged.purchaseMode || merged.purchaseType || pick(values, ['Purchase Mode','Purchase Type','Payment Type','Mode']) || '';
    const financier = merged.financier || pick(values, ['Financier','Financier Name','HP Financier','NOHP Financier']) || '';
    const addressProofMode = merged.addressProofMode || pick(values, ['Address Proof','Address Proof Mode']) || '';

    const company = vehicle.company || merged.company || pick(values, ['Company','company']) || '';
    const model = vehicle.model || merged.model || pick(values, ['Model','model']) || '';
    const variant = vehicle.variant || merged.variant || pick(values, ['Variant','variant']) || '';
    const color = vehicle.color || merged.color || pick(values, ['Color','Colour','Vehicle Color','Vehicle Colour']) || '';
    const chassisNo = vehicle.chassisNo || merged.chassisNo || pick(values, ['Chassis No','Chassis Number','Chassis']) || '';

    let addressProofTypes = merged.addressProofTypes || values?.['Address Proof Types'] || values?.['Proof Types'] || '';
    if (typeof addressProofTypes === 'string') addressProofTypes = addressProofTypes.split(',').map((s)=>s.trim()).filter(Boolean);

    const createdAt =
      merged.createdAt ||
      merged.savedAt ||
      merged.ts ||
      pick(values, ['Submitted At','Timestamp','Created At','Date']) ||
      new Date();

    const fallbackAmounts = {
      bookingAmount1Cash: pick(values, ['Booking Amount 1 Cash','bookingAmount1Cash']),
      bookingAmount1Online: pick(values, ['Booking Amount 1 Online','bookingAmount1Online']),
      bookingAmount2Cash: pick(values, ['Booking Amount 2 Cash','bookingAmount2Cash']),
      bookingAmount2Online: pick(values, ['Booking Amount 2 Online','bookingAmount2Online']),
      bookingAmount3Cash: pick(values, ['Booking Amount 3 Cash','bookingAmount3Cash']),
      bookingAmount3Online: pick(values, ['Booking Amount 3 Online','bookingAmount3Online']),
      paymentReference1: pick(values, ['Payment Reference 1','paymentReference1','UTR 1','Ref 1']),
      paymentReference2: pick(values, ['Payment Reference 2','paymentReference2','UTR 2','Ref 2']),
      paymentReference3: pick(values, ['Payment Reference 3','paymentReference3','UTR 3','Ref 3']),
      bookingAmount: pick(values, ['Booking Amount','bookingAmount']),
    };

    return {
      ...merged,
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
      createdAt,
      vehicle: {
        company,
        model,
        variant,
        color,
        chassisNo,
        availability: chassisNo ? 'found' : (vehicle.availability || merged.availability || 'allot'),
      },
      bookingAmount1Cash: merged.bookingAmount1Cash ?? fallbackAmounts.bookingAmount1Cash,
      bookingAmount1Online: merged.bookingAmount1Online ?? fallbackAmounts.bookingAmount1Online,
      bookingAmount2Cash: merged.bookingAmount2Cash ?? fallbackAmounts.bookingAmount2Cash,
      bookingAmount2Online: merged.bookingAmount2Online ?? fallbackAmounts.bookingAmount2Online,
      bookingAmount3Cash: merged.bookingAmount3Cash ?? fallbackAmounts.bookingAmount3Cash,
      bookingAmount3Online: merged.bookingAmount3Online ?? fallbackAmounts.bookingAmount3Online,
      paymentReference1: merged.paymentReference1 ?? fallbackAmounts.paymentReference1,
      paymentReference2: merged.paymentReference2 ?? fallbackAmounts.paymentReference2,
      paymentReference3: merged.paymentReference3 ?? fallbackAmounts.paymentReference3,
      bookingAmount: merged.bookingAmount ?? fallbackAmounts.bookingAmount,
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
          const r0 =
            (Array.isArray(j?.rows) && j.rows.length ? j.rows[0] : null) ||
            (Array.isArray(j?.data) && j.data.length ? j.data[0] : null);
          const normalized = r0 ? normalizeFromSheet(r0) : null;
          if (active && normalized) {
            setPayload(normalized);
          } else {
            // Fallback: try list + filter client-side (if search endpoint differs)
            const respList = await saveBookingViaWebhook({ webhookUrl, method: 'GET', payload: secret ? { action: 'list', secret } : { action: 'list' } });
            const jl = respList?.data || respList;
            const arr = Array.isArray(jl?.data) ? jl.data : (Array.isArray(jl?.rows) ? jl.rows : []);
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

  useEffect(() => {
    if (!open) {
      didAutoPrint.current = false;
      return;
    }
    if (!loading && payload && !printing && !didAutoPrint.current) {
      didAutoPrint.current = true;
      handlePrint();
    }
  }, [open, loading, payload, printing]);

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
