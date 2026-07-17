# 0065 — Unscoped session attachment allowed cross-organization references

## Summary

The installation-token session/project attachment route checked that both records existed but did not require them to belong to the same organization.

## Impact

An operator caller could append a durable cross-organization `SessionProjectAttached` event. Replay preserved the invalid association and organization-scoped projections could disagree about membership.

## Root cause

Route-scope authorization was mistaken for a domain invariant. The unscoped alias has no `OrgScope`, so the referential organization check disappeared.

## Fix

Require `project.org_id == session.org_id` for every attachment before appending the event, including unscoped routes. Add a bearer-token regression that proves rejection, absence from the durable log, and clean replay.

## Prevention

Cross-resource tenancy invariants belong in the mutation command itself and apply to privileged callers too. Route wrappers may narrow access but must not define data integrity.
