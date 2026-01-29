export const normalizeText = (v) => String(v || "").trim();
export const normalizeKey = (v) => normalizeText(v).toLowerCase();

// Deduplicate while preserving first-seen casing; sorts case-insensitively
export const uniqCaseInsensitive = (arr = []) => {
  const seen = new Map();
  arr.forEach((v) => {
    const text = normalizeText(v);
    const key = normalizeKey(text);
    if (!key) return;
    if (!seen.has(key)) seen.set(key, text);
  });
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};

export const toKeySet = (arr = []) => new Set(arr.map(normalizeKey).filter(Boolean));
