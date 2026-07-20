# 0076 — Resize-handle hit testing and dynamic focus targets blocked live cutover

## Status

Resolved after the first transactional development cutover correctly rolled back. The application and operator data were not changed by the failed candidate.

## Incident

The first live Playwright run reported two failures, and the transactional installer restored the previous development stack:

1. At the 900 px desktop acceptance width, the center of the four-pixel bottom resize handle resolved through `document.elementFromPoint` to a `.bp-tab` button rather than `.rz-y`. Synthetic and human pointer events therefore never reached the resize handler; panel height stayed 152 px. At a wider geometry where the handle won hit testing, a focused probe produced the expected 152 → 177 → 202 px sequence.
2. The mobile focus-wrap assertion ran on the Sessions drawer. Focusing its last session row reveals hover/focus action buttons, changing the focusable set after the trap computed its boundary. The trap correctly focused the last control that existed at keydown, but the test's live `.last()` locator then resolved to the newly revealed Archive button.

## Impact

The candidate failed the browser gate and the installer restored the previous unit files, enabled/active state, and Envoy symlink. No unsafe cutover occurred and no operator data changed, but development activation was delayed.

## Root cause

The resize handles had no explicit stacking position, allowing adjacent panel content to win pointer hit testing in constrained geometry. Separately, the focus test treated a focus-responsive control set as static.

## Correction

- Horizontal and vertical resize handles now establish a small positioned stacking layer so adjacent panels cannot cover their four-pixel hit targets.
- The shared drag helper allows a short render-settle window after mouse release, and the session-switch step waits for the chat viewport's `data-session-id` before resizing.
- Modal focus wrapping is exercised on the Vault drawer, whose focus targets remain stable while the cycle is asserted. The test then returns to Sessions for route/action closure coverage.

## Prevention

- Browser geometry tests must verify the handle itself wins `elementFromPoint` at acceptance widths, not only that it has a bounding box.
- Geometry tests must allow the framework's rendered state to settle after synthetic input.
- Exact first/last focus assertions require a stable control set; dynamic hover/focus actions need separate keyboard coverage.
- Transactional browser gates remain inside rollback so test defects cannot leave a partial service cutover.
