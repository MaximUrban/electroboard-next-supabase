"use client";

import React, { useEffect, useState } from "react";
import {
  libraryCountries,
  type DeviceLibraryItem,
  type LibraryCountry,
} from "@/lib/device-library";

export default function DeviceLibraryModal({
  open,
  initialCountry,
  onClose,
  onCountryChange,
  onAdd,
}: {
  open: boolean;
  initialCountry: LibraryCountry;
  onClose: () => void;
  onCountryChange: (country: LibraryCountry) => void;
  onAdd: (item: DeviceLibraryItem) => void;
}) {
  const [country, setCountry] = useState<LibraryCountry>(initialCountry);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [items, setItems] = useState<DeviceLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCountry(initialCountry);
  }, [open, initialCountry]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("country", country);
        if (search.trim()) params.set("search", search.trim());
        if (category.trim()) params.set("category", category.trim());

        const res = await fetch(`/api/library/devices?${params.toString()}`);
        const json = await res.json();

        if (!cancelled) {
          setItems(Array.isArray(json.items) ? json.items : []);
        }
      } catch {
        if (!cancelled) {
          setItems([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [open, country, search, category]);

  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>Библиотека</div>
            <div style={styles.subtitle}>Schneider Electric · Этап 1</div>
          </div>

          <button style={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        <div style={styles.filters}>
          <select
            value={country}
            onChange={(e) => {
              const next = e.target.value as LibraryCountry;
              setCountry(next);
              onCountryChange(next);
            }}
            style={styles.input}
          >
            {libraryCountries.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={styles.input}
          >
            <option value="">Все категории</option>
            <option value="mcb">MCB</option>
            <option value="rcd">RCD</option>
            <option value="rcbo">RCBO</option>
          </select>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или артикулу"
            style={styles.input}
          />
        </div>

        <div style={styles.list}>
          {loading ? (
            <div style={styles.empty}>Загрузка...</div>
          ) : items.length === 0 ? (
            <div style={styles.empty}>Ничего не найдено</div>
          ) : (
            items.map((item) => (
              <div key={item.id} style={styles.card}>
                <div style={styles.imageWrap}>
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    style={styles.image}
                  />
                </div>

                <div style={styles.info}>
                  <div style={styles.name}>{item.name}</div>
                  <div style={styles.meta}>
                    {item.series} · {item.categoryLabel}
                  </div>
                  <div style={styles.meta}>
                    Артикул: {item.article} · {item.modules} мод.
                  </div>

                  <div style={styles.variants}>
                    {item.cadVariants.map((variant) => (
                      <span key={variant.id} style={styles.variantChip}>
                        {variant.label}
                      </span>
                    ))}
                  </div>
                </div>

                <button style={styles.addBtn} onClick={() => onAdd(item)}>
                  Добавить
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(5,8,18,.68)",
    display: "grid",
    placeItems: "center",
    zIndex: 500,
    padding: 20,
  },
  modal: {
    width: "min(980px, 100%)",
    maxHeight: "90vh",
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto auto 1fr",
    background: "#121937",
    border: "1px solid #33407a",
    borderRadius: 16,
    boxShadow: "0 16px 40px rgba(0,0,0,.35)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderBottom: "1px solid #26305b",
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: 700,
  },
  subtitle: {
    color: "#aebee8",
    fontSize: 12,
    marginTop: 4,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: "1px solid #33407a",
    background: "#1a234a",
    color: "#fff",
    fontSize: 20,
    cursor: "pointer",
  },
  filters: {
    display: "grid",
    gridTemplateColumns: "180px 160px 1fr",
    gap: 10,
    padding: 16,
    borderBottom: "1px solid #26305b",
  },
  input: {
    background: "#0c1330",
    color: "#fff",
    border: "1px solid #2a376f",
    borderRadius: 10,
    padding: "10px 12px",
    width: "100%",
    boxSizing: "border-box",
  },
  list: {
    overflowY: "auto",
    padding: 16,
    display: "grid",
    gap: 10,
  },
  empty: {
    color: "#cbd8ff",
    padding: 24,
    textAlign: "center",
  },
  card: {
    display: "grid",
    gridTemplateColumns: "90px 1fr auto",
    gap: 12,
    alignItems: "center",
    background: "#0c1330",
    border: "1px solid #26305b",
    borderRadius: 12,
    padding: 12,
  },
  imageWrap: {
    width: 90,
    height: 90,
    borderRadius: 10,
    overflow: "hidden",
    background: "#fff",
    display: "grid",
    placeItems: "center",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  },
  info: {
    minWidth: 0,
  },
  name: {
    color: "#fff",
    fontWeight: 700,
    marginBottom: 6,
  },
  meta: {
    color: "#b9c7ef",
    fontSize: 13,
    marginBottom: 4,
  },
  variants: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 8,
  },
  variantChip: {
    fontSize: 12,
    color: "#e8efff",
    background: "#18244f",
    border: "1px solid #33407a",
    borderRadius: 999,
    padding: "4px 8px",
  },
  addBtn: {
    background: "#2948c7",
    color: "#fff",
    border: "1px solid #7aa0ff",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};
