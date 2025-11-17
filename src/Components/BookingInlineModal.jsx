// components/BookingInlineModal.jsx
import React, { useEffect, useState } from 'react';
import { Modal, Spin, message } from 'antd';
import BookingForm from './BookingForm';
import { saveBookingViaWebhook } from '../apiCalls/forms';

export default function BookingInlineModal({ open, onClose, row, webhookUrl }) {
  const [loading, setLoading] = useState(false);
  const [initialValues, setInitialValues] = useState(null);

  const toNumber = (x) => Number(String(x ?? 0).replace(/[₹,\s]/g, '')) || 0;

  const normalizeFromPayload = (p = {}) => {
    const v = p.vehicle || {};
    const purchaseType = String(p.purchaseMode || p.purchaseType || '').toLowerCase() || 'cash';
    // Normalize address proof types
    const apTypes = Array.isArray(p.addressProofTypes)
      ? p.addressProofTypes
      : String(p.addressProofTypes || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    return {
      customerName: p.customerName || p.name || '',
      mobileNumber: String(p.mobileNumber || p.mobile || ''),
      address: p.address || '',
      branch: p.branch || '',
      executive: p.executive || '',
      company: v.company || '',
      bikeModel: v.model || '',
      variant: v.variant || '',
      color: v.color || undefined,
      chassisNo: v.chassisNo || (v.availability === 'allot' ? '__ALLOT__' : undefined),
      rtoOffice: p.rtoOffice || 'KA',
      purchaseType,
      financier: purchaseType === 'loan' ? (p.financier || undefined) : undefined,
      nohpFinancier: purchaseType === 'nohp' ? (p.financier || p.nohpFinancier || undefined) : undefined,
      disbursementAmount: (purchaseType === 'loan' || purchaseType === 'nohp') ? (toNumber(p.disbursementAmount) || undefined) : undefined,
      addressProofMode: p.addressProofMode || p.addressProof || 'aadhaar',
      addressProofTypes: apTypes,
      paymentMode: p.paymentMode || undefined,
      paymentReference: p.paymentReference || undefined,
      bookingAmount: toNumber(p.bookingAmount ?? undefined) || undefined,
      downPayment: toNumber((p.dp && p.dp.downPayment) ?? p.downPayment),
      extraFittingAmount: toNumber((p.dp && p.dp.extraFittingAmount) ?? p.extraFittingAmount),
      affidavitCharges: toNumber((p.dp && p.dp.affidavitCharges) ?? p.affidavitCharges),
    };
  };

  useEffect(() => {
    let active = true;
    const fetchPayload = async () => {
      if (!open || !row) return;
      setLoading(true);
      try {
        // Prefer webhook search by Booking ID
        if (webhookUrl && row.bookingId) {
          const resp = await saveBookingViaWebhook({ webhookUrl, method: 'GET', payload: { action: 'search', mode: 'booking', query: row.bookingId } });
          const j = resp?.data || resp;
          const p = Array.isArray(j?.rows) && j.rows.length ? j.rows[0]?.payload : null;
          if (active) setInitialValues(p ? normalizeFromPayload(p) : normalizeFromPayload({
            customerName: row.name,
            mobileNumber: row.mobile,
            branch: row.branch,
            vehicle: { company: row.company, model: row.model, variant: row.variant, chassisNo: row.chassis }
          }));
        } else {
          if (active) setInitialValues(normalizeFromPayload({
            customerName: row?.name,
            mobileNumber: row?.mobile,
            branch: row?.branch,
            vehicle: { company: row?.company, model: row?.model, variant: row?.variant, chassisNo: row?.chassis }
          }));
        }
      } catch  {
        if (active) {
          message.warning('Could not fetch full booking. Opening with available fields.');
          setInitialValues(normalizeFromPayload({
            customerName: row?.name,
            mobileNumber: row?.mobile,
            branch: row?.branch,
            vehicle: { company: row?.company, model: row?.model, variant: row?.variant, chassisNo: row?.chassis }
          }));
        }
      } finally { if (active) setLoading(false); }
    };
    fetchPayload();
    return () => { active = false; };
  }, [open, row, webhookUrl]);

  return (
    <Modal open={open} title="Prefilled Booking Form" onCancel={onClose} footer={null} width={980} destroyOnClose>
      {loading ? (
        <div style={{ display: 'grid', placeItems: 'center', height: 160 }}><Spin /></div>
      ) : (
        <div style={{ paddingTop: 8 }}>
          <BookingForm
            asModal
            initialValues={initialValues || {}}
            startPaymentsOnly={Boolean(row?.bookingId)}
            editRefDefault={row?.bookingId ? { bookingId: row.bookingId, mobile: row.mobile } : null}
          />
        </div>
      )}
    </Modal>
  );
}
