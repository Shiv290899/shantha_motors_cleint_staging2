export const SALES_NUMBERS = ["9731366921", "8073283502"];

export const SALES_PRIMARY = SALES_NUMBERS[0];
export const SALES_SECONDARY = SALES_NUMBERS[1];

export const SALES_DISPLAY = `${SALES_NUMBERS[0]} / ${SALES_NUMBERS[1]}`;

const normalizeTel = (num) => {
  const digits = String(num || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("91")) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

export const SALES_TEL_LINK = (() => {
  const normalized = normalizeTel(SALES_PRIMARY);
  return normalized ? `tel:+${normalized}` : "";
})();

export const SALES_WHATSAPP_LINK = (() => {
  const normalized = normalizeTel(SALES_PRIMARY);
  return normalized ? `https://wa.me/${normalized}` : "";
})();

export const BUSINESS_HOURS = "Mon-Sat: 9:00 AM - 8:30 PM - Sun: 9:00 AM - 2:30 PM";
export const CONTACT_EMAIL = "hello@shanthamotors.com";
