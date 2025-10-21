// components/BookingPrintQuickModal.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Button, Spin, message } from 'antd';
import { saveBookingViaWebhook } from '../apiCalls/forms';
import BookingPrintSheet from './BookingPrintSheet';
import { handleSmartPrint } from '../utils/printUtils';

export default function BookingPrintQuickModal({ open, onClose, row, webhookUrl }) {
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState(null);
  const printRef = useRef(null);

  const buildFromRow = (r) => {
    if (!r) return null;
    return {
      customerName: r.name || '',
      mobileNumber: r.mobile || '',
      address: '',
      branch: r.branch || '',
      executive: '',
      rtoOffice: '',
      purchaseMode: '',
      vehicle: { company: r.company || '', model: r.model || '', variant: r.variant || '', color: '', chassisNo: r.chassis || '' },
      createdAt: new Date(),
    };
  };

  useEffect(() => {
    let active = true;
    const fetchPayload = async () => {
      if (!open || !row) return;
      setLoading(true);
      try {
        if (webhookUrl && row.bookingId) {
          const resp = await saveBookingViaWebhook({ webhookUrl, method: 'GET', payload: { action: 'search', mode: 'booking', query: row.bookingId } });
          const j = resp?.data || resp;
          const p = Array.isArray(j?.rows) && j.rows.length ? j.rows[0]?.payload : null;
          if (active) setPayload(p || buildFromRow(row));
        } else {
          if (active) setPayload(buildFromRow(row));
        }
      } catch (e) {
        if (active) {
          message.warning('Could not fetch full booking; printing with available fields.');
          setPayload(buildFromRow(row));
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchPayload();
    return () => { active = false; };
  }, [open, row, webhookUrl]);

  const handlePrint = () => {
    try { handleSmartPrint(printRef.current); } catch {}
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
          <Button onClick={onClose}>Close</Button>
          <Button type="primary" onClick={handlePrint} disabled={!payload}>Print</Button>
        </div>
      )}
      {body}
    </Modal>
  );
}

