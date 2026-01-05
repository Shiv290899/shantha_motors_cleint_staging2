import React, { useMemo, useState } from "react";
import { Button, Grid, Modal } from "antd";
import { HistoryOutlined } from "@ant-design/icons";
import FollowUps from "./FollowUps";

const toDigits10 = (x) => String(x || "").replace(/\D/g, "").slice(-10);
const normalizeBookingId = (x) =>
  String(x || "").toUpperCase().replace(/\s+/g, "");

export default function BookingHistoryButton({
  form,
  webhookUrl,
  bookingId,
  mobile,
}) {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [open, setOpen] = useState(false);

  const prefillQuery = useMemo(() => {
    if (!open) return "";
    const bid = normalizeBookingId(bookingId);
    if (bid) return bid;
    const fromForm = toDigits10(
      mobile || form?.getFieldValue?.("mobileNumber") || ""
    );
    return fromForm || "";
  }, [open, bookingId, mobile, form]);

  return (
    <>
      <Button icon={<HistoryOutlined />} onClick={() => setOpen(true)}>
        Booking History
      </Button>
      <Modal
        open={open}
        title=""
        footer={null}
        onCancel={() => setOpen(false)}
        destroyOnClose
        width={isMobile ? "100%" : "92vw"}
        bodyStyle={{ padding: 0 }}
      >
        {open ? (
          <FollowUps
            mode="booking"
            webhookUrl={webhookUrl}
            prefillQuery={prefillQuery}
          />
        ) : null}
      </Modal>
    </>
  );
}
