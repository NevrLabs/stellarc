# Postmortem 0019: Add Node returned `enroll 401` for logged-in owners

## Summary

The Fleet **Add node** dialog called `POST /api/enroll` with the logged-in Axis session cookie, but the running Axis binary accepted only the installation bearer token. The UI therefore surfaced `enroll 401` even for the bootstrapped organization owner.

## Impact

- Logged-in owners could not mint enrollment capabilities from the Fleet UI.
- Installation-token API clients continued to work.
- No authorization boundary was bypassed; the failure was fail-closed.

## Root cause

Production was still running `stellarc-axis-85944e0759df`. In that build, `mint_enroll` performed an inline bearer-token check because the public enrollment-capability routes shared its router. Owner-cookie authorization and the protected-route integration existed in source and had regression coverage, but the Axis binary containing them had never been deployed.

This was a delivery verification failure: source and unit-test state were treated as though they described the running Axis.

## Detection

The failure was reported from the real Add Node flow. A same-origin local login followed by `POST /api/enroll` reproduced the exact boundary:

- login: `200`;
- owner-cookie enrollment mint: `401`.

Inspection of `/proc/<axis-pid>/exe` identified the stale deployed binary unambiguously.

## Resolution and prevention

- Deployed `stellarc-axis-e4c56cea9041`, whose unified principal seam classifies `/api/enroll` as an admin route and permits either an installation-token operator or a logged-in organization owner.
- Repeated the same local login and owner-cookie request against the restarted process: login returned `200`, enrollment mint returned `200`, and the response contained the expected token, command, expiry, and Axis iroh identity fields.
- Verify the owner-cookie request against the restarted Axis, not only an in-process router test.
- Keep the owner-cookie enrollment regression test and deployment SHA check as release gates for Fleet enrollment changes.