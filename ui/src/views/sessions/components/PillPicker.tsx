import { useEffect, useRef, useState } from "react";

export interface PillPickerItem {
  id: string;
  label: string;
  detail?: string;
}

export function clampMenuOffset(left: number, right: number, viewportWidth: number): number {
  if (right > viewportWidth - 8) return viewportWidth - 8 - right;
  if (left < 8) return 8 - left;
  return 0;
}

export function PillPicker({
  items,
  value,
  onSelect,
  placeholder,
}: {
  items: PillPickerItem[];
  value: string | null;
  onSelect: (id: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = items.find((item) => item.id === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((item) => `${item.label} ${item.detail ?? ""}`.toLowerCase().includes(q))
    : items;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    requestAnimationFrame(() => {
      const rect = menuRef.current?.getBoundingClientRect();
      if (rect) setOffset(clampMenuOffset(rect.left, rect.right, window.innerWidth));
    });
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="chip"
        aria-label={placeholder}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span style={{ color: "var(--faint)" }}>＋</span>
        {selected?.label ?? placeholder.replace(/^＋\s*/, "")}
      </button>
      <div
        ref={menuRef}
        className={`menu${open ? " on" : ""}`}
        style={{
          bottom: "auto",
          top: "calc(100% + 4px)",
          left: offset,
          width: 260,
          maxWidth: "calc(100vw - 16px)",
          maxHeight: 260,
          overflowY: "auto",
        }}
      >
        {open && <>
          <input
            className="ol-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search…"
            autoFocus
            style={{ width: "100%", marginBottom: 4 }}
          />
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`mi${item.id === value ? " on" : ""}`}
              aria-label={item.label}
              onClick={() => {
                onSelect(item.id);
                setOpen(false);
              }}
            >
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.detail && <span className="gk">{item.detail}</span>}
            </button>
          ))}
          {filtered.length === 0 && <div className="gk" style={{ padding: 8 }}>No matches</div>}
        </>}
      </div>
    </div>
  );
}
