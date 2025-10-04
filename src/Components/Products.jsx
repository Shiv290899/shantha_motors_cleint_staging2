import React from "react";

// Lightweight catalogue page rendered inside the React app.
// Reads brand data from public/honda.json and public/tvs.json (fallback to bike.txt for TVS).
// Provides brand tabs, type filter, search, sort and responsive cards.

const useCatalogue = () => {
  const [data, setData] = React.useState({
    honda: [],
    tvs: [],
    bajaj: [],
    suzuki: [],
    hero: [],
    yamaha: [],
    royalEnfield: [],
  });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const normalize = React.useCallback((raw) => {
    // 1) Generic mappers for various incoming JSON shapes
    const coercePrice = (price) => {
      if (!price) return undefined;
      const ex = price.ex_showroom ?? price.exShowroom ?? price.ex;
      const onr = price.on_road_example ?? price.on_road ?? price.onRoad;
      return { ex_showroom: ex, on_road_example: onr };
    };
    const inferType = (t) => {
      const s = String(t || "").toLowerCase();
      if (s.includes("scoot")) return "scooters";
      if (s.includes("ev") || s.includes("electric")) return "ev";
      return "motorcycles";
    };
    const fmt = (v, suffix = "") => (v == null || v === "") ? "" : (typeof v === "number" ? `${v}${suffix}` : String(v));

    // 2) Shape A: { products: { motorcycles: [], scooters: [], ev: [] } } (e.g., Honda)
    const mapHonda = () => {
      const fromGroup = (group, type) => (raw.products?.[group] || []).map((x) => ({
        model: x.model,
        engine: fmt(x.specs?.engine_cc, " cc"),
        power: fmt(x.specs?.power),
        mileage: fmt(x.specs?.mileage),
        image_url: x.image_url || "",
        variants: (x.variants || []).map((v) => typeof v === "string" ? { name: v } : { name: v.name, details: v.details || "" }),
        product_url: x.product_url || "",
        price: coercePrice(x.price),
        type,
      }));
      return [
        ...fromGroup("motorcycles", "motorcycles"),
        ...fromGroup("scooters", "scooters"),
        ...fromGroup("ev", "ev"),
      ];
    };

    // 3) Shape B: { motorcycles: [], scooters: [] } (e.g., TVS)
    const mapLegacy = () => {
      const m = (raw.motorcycles || []).map((x) => ({
        model: x.model,
        engine: fmt(x.engine || x.specs?.engine_capacity || x.specs?.engine_cc, x.engine ? "" : (x.specs?.engine_cc ? " cc" : "")),
        power: fmt(x.power || x.specs?.power),
        mileage: fmt(x.mileage || x.specs?.mileage),
        image_url: x.image_url || "",
        variants: (x.variants || []).map((v) => typeof v === "string" ? { name: v } : { name: v.name, details: v.details || "" }),
        product_url: x.product_url || x.product_page || "",
        price: coercePrice(x.price),
        type: "motorcycles",
      }));
      const s = (raw.scooters || []).map((x) => ({
        model: x.model,
        engine: fmt(x.engine || x.specs?.engine_capacity || x.specs?.engine_cc, x.engine ? "" : (x.specs?.engine_cc ? " cc" : "")),
        power: fmt(x.power || x.specs?.power),
        mileage: fmt(x.mileage || x.specs?.mileage),
        image_url: x.image_url || "",
        variants: (x.variants || []).map((v) => typeof v === "string" ? { name: v } : { name: v.name, details: v.details || "" }),
        product_url: x.product_url || x.product_page || "",
        price: coercePrice(x.price),
        type: "scooters",
      }));
      return [...m, ...s];
    };

    // 4) Shape C: Array of products (e.g., Bajaj, Suzuki, Hero, Yamaha, Royal Enfield)
    const mapArray = () => {
      return (Array.isArray(raw) ? raw : []).map((x) => ({
        model: x.model,
        engine: fmt(x.engine || x.specs?.engine_capacity || x.specs?.engine_cc, x.engine ? "" : (x.specs?.engine_cc ? " cc" : "")),
        power: fmt(x.power || x.specs?.power),
        mileage: fmt(x.mileage || x.specs?.mileage),
        image_url: x.image_url || "",
        variants: (x.variants || []).map((v) => typeof v === "string" ? { name: v } : { name: v.name, details: v.details || "" }),
        product_url: x.product_url || x.product_page || "",
        price: coercePrice(x.price),
        type: inferType(x.type),
      }));
    };

    if (raw?.products) return mapHonda();
    if (Array.isArray(raw)) return mapArray();
    return mapLegacy();
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [hondaRes, tvsPrimary, tvsFallback, bajajRes, suzukiRes, heroRes, yamahaRes, reRes] = await Promise.allSettled([
          fetch("/honda.json").then((r) => (r.ok ? r.json() : Promise.reject())),
          fetch("/tvs.json").then((r) => (r.ok ? r.json() : Promise.reject())),
          fetch("/bike.txt").then((r) => (r.ok ? r.json() : Promise.reject())),
          fetch("/bajaj.json").then((r) => (r.ok ? r.json() : Promise.reject())),
          fetch("/suzuki.json").then((r) => (r.ok ? r.json() : Promise.reject())),
          fetch("/hero.json").then((r) => (r.ok ? r.json() : Promise.reject())),
          fetch("/yamaha.json").then((r) => (r.ok ? r.json() : Promise.reject())),
          fetch("/royalEnfield.json").then((r) => (r.ok ? r.json() : Promise.reject())),
        ]);
        const honda = hondaRes.status === "fulfilled" ? normalize(hondaRes.value) : [];
        const tvs = tvsPrimary.status === "fulfilled"
          ? normalize(tvsPrimary.value)
          : tvsFallback.status === "fulfilled" ? normalize(tvsFallback.value) : [];
        const bajaj = bajajRes.status === "fulfilled" ? normalize(bajajRes.value) : [];
        const suzuki = suzukiRes.status === "fulfilled" ? normalize(suzukiRes.value) : [];
        const hero = heroRes.status === "fulfilled" ? normalize(heroRes.value) : [];
        const yamaha = yamahaRes.status === "fulfilled" ? normalize(yamahaRes.value) : [];
        const royalEnfield = reRes.status === "fulfilled" ? normalize(reRes.value) : [];
        if (!cancelled) setData({ honda, tvs, bajaj, suzuki, hero, yamaha, royalEnfield });
      } catch (e) {
        console.log(e)
        if (!cancelled) setError("Failed to load catalogue.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [normalize]);

  return { data, loading, error };
};

export default function Products() {
  const { data, loading, error } = useCatalogue();
  const [brand, setBrand] = React.useState("honda"); // 'honda' | 'tvs'
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState("all");
  const [sort, setSort] = React.useState("model-asc");

  const list = React.useMemo(() => {
    const all = data[brand] || [];
    const hay = (b) => [b.model, b.engine, b.power, b.mileage, ...(b.variants || []).map((v) => (v?.name || "") + " " + (v?.details || ""))]
      .map((s) => String(s || "").toLowerCase()).join(" ");
    const ql = q.trim().toLowerCase();
    const filtered = all
      .filter((b) => type === "all" ? true : b.type === type)
      .filter((b) => (ql ? hay(b).includes(ql) : true));
    filtered.sort((a, b) => a.model.localeCompare(b.model));
    if (sort === "model-desc") filtered.reverse();
    return filtered;
  }, [data, brand, q, type, sort]);

  const styles = {
    page: { maxWidth: 1100, margin: "0 auto", padding: 16 },
    header: { display: "grid", gap: 10 },
    seg: { display: "inline-flex", gap: 6, marginTop: 6, background: "#eef5ff", padding: 4, borderRadius: 12, border: "1px solid #e3ecfb" },
    tab: (active, disabled) => ({ appearance: "none", border: 0, background: active ? "#fff" : "transparent", padding: "8px 12px", borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, color: disabled ? "#9aa7b8" : active ? "#0b3da6" : "#0f172a", boxShadow: active ? "0 2px 0 0 #cfe0ff inset, 0 1px 8px rgba(22,119,255,.12)" : "none" }),
    controls: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))", gap: 16, padding: "18px 0 28px" },
    media: { aspectRatio: "16/9", width: "100%", objectFit: "cover", background: "#eef2f7" },
    card: { background: "#fff", border: "1px solid #e6edf6", borderRadius: 16, overflow: "hidden", boxShadow: "0 8px 28px rgba(22,119,255,.08)", display: "flex", flexDirection: "column" },
    body: { padding: "12px 14px 8px" },
    model: { margin: 0, marginBottom: 6, fontSize: 18, lineHeight: 1.25 },
    meta: { margin: 0, color: "#475569", fontSize: 13 },
    empty: { padding: 24, textAlign: "center", color: "#475569", border: "1px dashed #d9e1ec", borderRadius: 12, background: "#fff" },
  };

  const renderCard = (b) => (
    <div key={`${b.model}-${b.product_url || b.image_url || Math.random()}`} style={styles.card} role="listitem">
      {b.image_url ? (
        <img src={b.image_url} alt={b.model} style={styles.media} onError={(e) => { e.currentTarget.replaceWith(Object.assign(document.createElement('div'), { className: 'media-fallback' })); }} />
      ) : (
        <div style={{ ...styles.media, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>Image unavailable</div>
      )}
      <div style={styles.body}>
        <h3 style={styles.model}>{b.model}</h3>
        <p style={styles.meta}>
          {[b.engine && `Engine: ${b.engine}`, b.power && `Power: ${b.power}`, b.mileage && `Mileage: ${b.mileage}`].filter(Boolean).join("  •  ") || "Specs TBA"}
        </p>
        {!!(b.variants?.length) && (
          <details>
            <summary>Variants ({b.variants.length})</summary>
            <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
              {b.variants.map((v, i) => {
                const name = typeof v === "string" ? v : (v?.name || "Variant");
                const details = typeof v === "string" ? "" : (v?.details || "");
                return <li key={i} style={{ color: "#475569", fontSize: 13 }}>{details ? `${name} — ${details}` : name}</li>;
              })}
            </ul>
          </details>
        )}
        {b.price && (b.price.ex_showroom || b.price.on_road_example || b.price.on_road) && (
          <p style={styles.meta}>
            {[
              b.price.ex_showroom && `Ex-showroom: ${b.price.ex_showroom}`,
              (b.price.on_road_example || b.price.on_road) && `On-road: ${b.price.on_road_example || b.price.on_road}`,
            ].filter(Boolean).join("  •  ")}
          </p>
        )}
        {b.product_url && (
          <a href={b.product_url} target="_blank" rel="noopener" style={{ color: "#1677ff", display: "inline-block", marginTop: 8 }}>View details</a>
        )}
      </div>
    </div>
  );

  const hasHonda = (data.honda || []).length > 0;
  const hasTVS = (data.tvs || []).length > 0;
  const hasBajaj = (data.bajaj || []).length > 0;
  const hasSuzuki = (data.suzuki || []).length > 0;
  const hasHero = (data.hero || []).length > 0;
  const hasYamaha = (data.yamaha || []).length > 0;
  const hasRoyal = (data.royalEnfield || []).length > 0;

  return (
    <div style={styles.page}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Products</h1>
      <div style={styles.seg} role="tablist" aria-label="Brand">
        <button role="tab" aria-selected={brand === "honda"} onClick={() => setBrand("honda")} disabled={!hasHonda} style={styles.tab(brand === "honda", !hasHonda)}>Honda</button>
        <button role="tab" aria-selected={brand === "tvs"} onClick={() => setBrand("tvs")} disabled={!hasTVS} style={styles.tab(brand === "tvs", !hasTVS)}>TVS</button>
        <button role="tab" aria-selected={brand === "bajaj"} onClick={() => setBrand("bajaj")} disabled={!hasBajaj} style={styles.tab(brand === "bajaj", !hasBajaj)}>Bajaj</button>
        <button role="tab" aria-selected={brand === "suzuki"} onClick={() => setBrand("suzuki")} disabled={!hasSuzuki} style={styles.tab(brand === "suzuki", !hasSuzuki)}>Suzuki</button>
        <button role="tab" aria-selected={brand === "hero"} onClick={() => setBrand("hero")} disabled={!hasHero} style={styles.tab(brand === "hero", !hasHero)}>Hero</button>
        <button role="tab" aria-selected={brand === "yamaha"} onClick={() => setBrand("yamaha")} disabled={!hasYamaha} style={styles.tab(brand === "yamaha", !hasYamaha)}>Yamaha</button>
        <button role="tab" aria-selected={brand === "royalEnfield"} onClick={() => setBrand("royalEnfield")} disabled={!hasRoyal} style={styles.tab(brand === "royalEnfield", !hasRoyal)}>Royal Enfield</button>
      </div>

      <div style={styles.controls}>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All Types</option>
          <option value="motorcycles">Motorcycles</option>
          <option value="scooters">Scooters</option>
          <option value="ev">EV</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search model or variant..." />
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ gridColumn: "1 / -1" }}>
          <option value="model-asc">Sort: Model A → Z</option>
          <option value="model-desc">Sort: Model Z → A</option>
        </select>
      </div>

      {loading ? (
        <div style={styles.empty}>Loading catalogue…</div>
      ) : error ? (
        <div style={styles.empty}>{error}</div>
      ) : list.length ? (
        <div style={styles.grid} role="list">{list.map(renderCard)}</div>
      ) : (
        <div style={styles.empty}>No matching bikes. Try a different search.</div>
      )}
    </div>
  );
}
