# 0049 — Playwright failure artifact captured a filled password field

Date: 2026-07-17 · Severity: high (credential exposure in local test artifact) · Author: Terminus

## Symptom

A live E2E login exceeded the five-second assertion timeout while the form was
still in its `Signing in…` state. Playwright's generated error-context Markdown
serialized the password input value instead of redacting it.

## Root cause

The broad interaction suite duplicated the UI login flow in every test and put
live credentials into page DOM. On the constrained dev host, password hashing
can exceed the default assertion timeout. Any failure during that interval could
persist the filled form in diagnostics.

## Fix

The sensitive `test-results/dev-e2e` artifact was deleted immediately. The live
interaction suite now authenticates through `fetch('/api/auth/login')` inside the
page, then reloads into the application. Credentials are never assigned to DOM
inputs. Dedicated auth component tests continue to cover the form behavior with
non-production test values.

## Prevention

- Live suites must not type reusable credentials into fields when the login UI is
  not the behavior under test.
- Test diagnostics must be treated as potentially sensitive and removed after a
  failure involving authentication forms.
- Authentication assertions on constrained hosts need explicit, measured
  timeouts rather than Playwright's generic five-second default.
