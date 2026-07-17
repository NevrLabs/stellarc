# 0046 — Project layout API existed only on the operator route

Date: 2026-07-17 · Severity: high (workspace persistence silently disabled) · Author: Terminus

## Symptom

The live project workspace split into two valid panes, but the project remained
with `layout: null`. Refresh therefore could not restore from Hall. The client
ignored the failed background save, so unit tests, TypeScript, and production
builds all stayed green.

## Root cause

Olympus registers resource routes twice: unscoped operator routes under
`/api/*` and organization-scoped browser routes under
`/api/organizations/:organizationId/*`. The new `PUT /api/projects/:id/layout` route was added only to the operator
router. Authenticated browser requests are automatically rewritten to the
organization route and received no matching layout endpoint. After that route
was added, its otherwise-unused `Extension<Principal>` extractor exposed a
second mismatch: the organization proxy injects `OrgScope` into its inner
router, not `Principal`, so the handler failed with HTTP 500.

## Fix

Register `PUT /projects/:id/layout` in the organization resource router and
remove the unused principal extractor; authentication and authorization are
already enforced by the outer middleware and `OrgScope`. The durable CDP
project-workspace probe now requires the Hall project DTO to contain two
persisted panels before testing refresh.

## Prevention

- Every browser-facing resource endpoint must have an organization-scoped route
  contract test, not only an unscoped operator-route test.
- Background persistence needs observable errors; silently swallowing save
  failures hid the missing route.
- The duplicated route tables are structural debt. They should be generated
  from one resource router or one route manifest rather than maintained by
  hand in two modules.
