# 0066 — Failed layout saves were not recoverable across remounts

## Summary

The browser cached every layout but did not distinguish a Hall-acknowledged cache from an unsynced write. A successful project GET therefore replaced the cache after a failed PUT.

## Impact

After a transient layout-save failure, ordinary refresh or route remount could permanently discard the operator's newest pane arrangement and remove the visible error.

## Root cause

The browser copy was modeled only as an availability fallback, not as a write-ahead journal with an acknowledgement boundary.

## Fix

Record every pending layout under a separate per-project journal key before enqueueing the Hall write. Clear it only when the matching snapshot succeeds; an older completion cannot clear a newer snapshot. Deep-clone ordinary `toJSON()` snapshots before journaling and enqueueing so later Dockview mutations cannot change the object used for acknowledgement. On remount, restore and visibly retry the pending layout before accepting an older Hall layout. Restore Dockview from another deep copy because Dockview normalizes its input object in place; mutating the journal snapshot before retry can collapse it back to the old acknowledged fingerprint. Suspend layout callbacks until the retry settles because Dockview also emits normalization changes asynchronously; otherwise those callbacks overwrite the exact pending snapshot before it is acknowledged. A failed retry's save error takes display priority over the generic recovery notice. Authoritative 4xx project rejection still clears both cache and journal. Retry is bounded to once per pending fingerprint per mount to avoid failure loops.

## Prevention

Client-side durable writes need explicit pending and acknowledged states. A read response may supersede a cache, but it may not silently supersede a locally journaled write that the server has not acknowledged.
