export function Accessibility() { return <div className="grid gap-3 sm:grid-cols-2 text-sm">{[
["Keyboard", "Every action is reachable; focus-visible rings remain visible and overlays restore focus."],
["Contrast", "Text and controls meet WCAG AA in Obsidian and Daybreak."],
["Touch", "Primary touch targets are at least 44 × 44px; spacing prevents accidental activation."],
["Motion", "Respect prefers-reduced-motion and never rely on animation to communicate state."],
["Direction", "Use native dir and logical CSS properties (inline/block) for RTL readiness; mirror only directional icons."],
["Semantics", "Prefer native buttons, links, labels, headings, and form validation before ARIA."],
].map(([title, body]) => <div key={title} className="rounded border border-border p-3"><strong>{title}</strong><p className="mt-1 text-muted-foreground">{body}</p></div>)}</div>; }
