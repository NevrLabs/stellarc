# Postmortem 0021: Orbit replay starved heartbeats after Axis restart

## Summary

After the Axis deployment, `terminus` registered successfully but became offline after 30 seconds. Restarting Orbit repeated the same pattern: hello was accepted, then no heartbeat or replay traffic completed.

## Impact

Fleet correctly exposed the node but marked it offline and eventually evicted it. Agent runtimes remained in the Orbit process, but Axis could not dispatch work to the node.

## Root cause

The Orbit handled `ResumeFrom` inline in its socket read loop. The live spool contained 940 unacknowledged frames across 14 observed sessions. During replay, Orbit wrote frames while Axis wrote per-frame ACKs on the same UDS stream. Because Orbit's read loop was occupied replaying, it could not consume ACKs. The two socket buffers eventually applied backpressure in opposite directions: Orbit waited for replay writes, Axis waited for ACK writes, and the heartbeat task waited behind the blocked Orbit writer.

An empty-spool probe Orbit stayed online and heartbeated, isolating the defect to reconnect replay rather than node registration or timers.

## Resolution

`Ack` remains ordered and inline. `ResumeFrom` dispatch now runs in a separate task, allowing the socket read loop to consume ACKs while replay writes proceed. The existing shared writer mutex still serializes bytes on the wire.

## Prevention

1. Full-duplex protocol handlers must never perform unbounded writes in their read loop.
2. Reconnect tests need a spool large enough to exceed socket-buffer capacity, while asserting heartbeats continue and the spool drains.
3. Deployment health requires the node to remain online for more than one heartbeat timeout, not merely appear after hello.
