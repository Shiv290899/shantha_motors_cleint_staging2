// components/BookingInlineModal.jsx
import React, { useEffect, useState } from 'react';
import { Modal, Spin, message } from 'antd';
import BookingForm from './BookingForm';
import { saveBookingViaWebhook } from '../apiCalls/forms';
import { buildBookingFormPatch } from '../utils/bookingFormPrefill';

export default function BookingInlineModal({ open, onClose, row, webhookUrl }) {
  const [loading, setLoading] = useState(false);
  const [initialValues, setInitialValues] = useState(null);

  const normalizeFromPayload = (p = {}) => {
    const { patch } = buildBookingFormPatch(p);
    return patch || {};
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
