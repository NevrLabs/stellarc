// stellarc control plane — entry point.
// Boot order (ADR 0001/D6/D7): load kernel → verify auth plugin → compose
// plugin tree for this boot generation → open transit chokepoints.
console.log("stellarc control plane — scaffold");
