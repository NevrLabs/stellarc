import { Button } from "@/components/ui/button";
/**
 * ProjectSidebar — left sidebar for the Projects View.
 *
 * Shows:
 *   - Board summary (single board for now)
 *   - Assignee filter (unique agents from card list)
 */

import type React from "react";
import { Icon } from "../../../components/Icon";
import type { Card } from "../../../types";

export function ProjectSidebar({
  width,
  assignees,
  activeFilter,
  onFilterChange,
  cards,
  onResizeStart,
}: {
  width: number;
  assignees: string[];
  activeFilter: string | null;
  onFilterChange: (v: string | null) => void;
  cards: Card[];
  onResizeStart: (event: React.MouseEvent) => void;
}) {
  return (
    <>
      <aside className="sidebar projects-sidebar" style={{ width }}>
        <div className="sb-scroll">
      {/* Board section */}
      <div className="sec-head">
        <span className="lbl">PROJECTS</span>
        <span className="sp" />
        <span className="ct">{cards.length}</span>
      </div>
      <div className="sec-content">
        <Button
          type="button"
          className={`srow${!activeFilter ? " on" : ""}`}
          style={{ width: "100%", justifyContent: "flex-start" }}
          onClick={() => onFilterChange(null)}
        >
          <Icon name="kanban" size={12} />
          <span className="title" style={{ marginLeft: 6 }}>
            Default board
          </span>
        </Button>
      </div>

      <div className="sec-content projects-sidebar-note">Boards contain cards. Projects group boards and context.</div>

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
              <Button
                key={a}
                type="button"
                className={`srow${activeFilter === a ? " on" : ""}`}
                style={{ width: "100%", justifyContent: "flex-start" }}
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
                <span className="title" style={{ marginLeft: 6 }}>
                  {a}
                </span>
                <span className="meta">
                  {
                    cards.filter((c) => c.assignedId === a).length
                  }
                </span>
              </Button>
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
            <Button
              type="button"
              className={`srow${activeFilter === "__unassigned__" ? " on" : ""}`}
              style={{ width: "100%", justifyContent: "flex-start" }}
              onClick={() =>
                onFilterChange(
                  activeFilter === "__unassigned__" ? null : "__unassigned__"
                )
              }
            >
              <span className="title" style={{ marginLeft: 18 }}>
                No assignee
              </span>
              <span className="meta">
                {cards.filter((c) => !c.assignedId).length}
              </span>
            </Button>
          </div>
        </>
      )}
        </div>
      </aside>
      <div className="rz-x" role="separator" aria-label="Resize projects sidebar" aria-orientation="vertical" aria-valuemin={220} aria-valuemax={360} aria-valuenow={width} tabIndex={0} onMouseDown={onResizeStart} />
    </>
  );
}
