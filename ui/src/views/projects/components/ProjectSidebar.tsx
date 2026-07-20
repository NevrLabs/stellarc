/**
 * ProjectSidebar — left sidebar for the Projects View.
 *
 * Shows:
 *   - Board summary (single board for now)
 *   - Assignee filter (unique agents from card list)
 */

import { Icon } from "../../../components/Icon";
import type { SidebarMode } from "../../../store";
import type { Card } from "../../../types";

export function ProjectSidebar({
  assignees,
  activeFilter,
  onFilterChange,
  cards,
  mode = "full",
}: {
  assignees: string[];
  activeFilter: string | null;
  onFilterChange: (v: string | null) => void;
  cards: Card[];
  mode?: SidebarMode;
}) {
  return (
    <aside
      id="primary-sidebar"
      className={`sidebar${mode === "compact" ? " compact" : ""}`}
      style={{ width: mode === "compact" ? "var(--sidebar-compact-w)" : undefined }}
      aria-label="Projects sidebar"
    >
      <div className="sb-scroll">
      {/* Board section */}
      <div className="sec-head">
        <span className="lbl">BOARD</span>
        <span className="sp" />
        <span className="ct">{cards.length}</span>
      </div>
      <div className="sec-content">
        <button
          type="button"
          className={`srow${!activeFilter ? " on" : ""}`}
          style={{ width: mode === "compact" ? "var(--sidebar-icon-target)" : "100%", justifyContent: mode === "compact" ? "center" : "flex-start" }}
          title="All Cards"
          aria-label="All Cards"
          onClick={() => onFilterChange(null)}
        >
          <Icon name="kanban" size={12} />
          <span className="title sidebar-label" style={{ marginLeft: 6 }}>
            All Cards
          </span>
        </button>
      </div>

      {/* Assignee filter */}
      {assignees.length > 0 && (
        <>
          <div className="sec-head" style={{ marginTop: 8 }}>
            <span className="lbl">ASSIGNEES</span>
            <span className="sp" />
            <span className="ct">{assignees.length}</span>
          </div>
          <div className="sec-content">
            {assignees.map((a) => (
              <button
                key={a}
                type="button"
                className={`srow${activeFilter === a ? " on" : ""}`}
                style={{ width: mode === "compact" ? "var(--sidebar-icon-target)" : "100%", justifyContent: mode === "compact" ? "center" : "flex-start" }}
                title={`${a} · ${cards.filter((c) => c.assignedId === a).length} cards`}
                aria-label={`Filter by ${a}`}
                onClick={() => onFilterChange(activeFilter === a ? null : a)}
              >
                <span
                  className="dot"
                  style={{
                    background: "var(--accent, var(--green))",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    flexShrink: 0,
                  }}
                />
                <span className="title sidebar-label" style={{ marginLeft: 6 }}>
                  {a}
                </span>
                <span className="meta">
                  {
                    cards.filter((c) => c.assignedId === a).length
                  }
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Unassigned count */}
      {cards.some((c) => !c.assignedId) && (
        <>
          <div className="sec-head" style={{ marginTop: 8 }}>
            <span className="lbl">UNASSIGNED</span>
          </div>
          <div className="sec-content">
            <button
              type="button"
              className={`srow${activeFilter === "__unassigned__" ? " on" : ""}`}
              style={{ width: mode === "compact" ? "var(--sidebar-icon-target)" : "100%", justifyContent: mode === "compact" ? "center" : "flex-start" }}
              title="No assignee"
              aria-label="Filter by no assignee"
              onClick={() =>
                onFilterChange(
                  activeFilter === "__unassigned__" ? null : "__unassigned__"
                )
              }
            >
              <Icon name="bot" size={12} />
              <span className="title sidebar-label" style={{ marginLeft: 6 }}>
                No assignee
              </span>
              <span className="meta">
                {cards.filter((c) => !c.assignedId).length}
              </span>
            </button>
          </div>
        </>
      )}
      </div>
    </aside>
  );
}
