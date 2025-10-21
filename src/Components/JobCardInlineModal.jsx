// components/JobCardInlineModal.jsx
import React, { useMemo } from "react";
import { Modal } from "antd";
import JobCard from "./JobCard";

/**
 * Inline modal wrapper to render the full JobCard form with optional initial values.
 * JobCard component accepts `initialValues` when used inside this modal.
 */
export default function JobCardInlineModal({ open, onClose, initialValues }) {
  // Keep minimal modal chrome; JobCard renders its own internal sections
  const bodyStyle = useMemo(() => ({ padding: 0 }), []);
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={1000} bodyStyle={bodyStyle} destroyOnClose>
      <div style={{ padding: 12 }}>
        <JobCard asModal initialValues={initialValues} />
      </div>
    </Modal>
  );
}

