# 0047 — Project mutations used unlocked check-then-append sequences

Date: 2026-07-17 · Severity: high (event/view divergence and invalid membership) · Author: Terminus

## Symptom

Adversarial review found two race windows before the project workspace branch was
merged:

1. A layout update checked that a project existed, released the view lock,
   appended an event, then used `expect()` to read the project back. Concurrent
   deletion could panic the request path.
2. Session association followed the same read-check / unlocked append pattern,
   allowing a deletion to land between validation and association.

## Root cause

The shared mutation helpers append and apply events, but they do not combine
resource validation with the mutation under one command boundary. The new
project handlers treated an async read lock as if it were a transaction.

## Fix

Existing-project layout, patch, and delete commands now validate, append, apply,
and read back while holding the project view write lock. Session-to-project
association uses the same write-lock boundary, then mirrors the durable result
to the convenience filesystem symlink after persistence succeeds. No
post-append `expect()` remains.

The client also epoch-checks its active project after asynchronous association;
a slow response from Project A cannot open that session after the operator has
already switched to Project B.

## Prevention

Resource commands that validate current state before appending an event must use
one serialized command seam. A read-check followed by an unlocked append is not
a valid transaction. Longer term, Axis should expose a first-class command
executor rather than letting route handlers coordinate the log and views
manually.
