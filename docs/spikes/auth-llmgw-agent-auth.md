# Agent-native auth — requirements and gaps (OPEN, not normative)

Raisal's approval at owner position234 separates three modes. The narrow OIDC
spike does not yet implement agent token exchange or delegated authority.
Source basis: local noovoleum-auth `contract/CONTRACT.md` DRAFT R1.8 §0, §1,
§3: account is not access, unknown authority fails closed, effective permissions
are intersections, and `act`/`cnf` are critical when present. This is conceptual
reuse, not a claim of conformance to a draft contract or a second auth stack.

| Mode | Required authority | Current source/evidence | Acceptance still needed |
|---|---|---|---|
| Human | verified issuer/sub -> explicit local membership -> route scope | `oidc.ts`; signed local vectors; real browser reached IdP login only | actual sign-in/callback -> grant -> fixture -> Maple readback |
| Independent agent | stable agent principal, separate credential and run; its own grants, never creator inheritance | NOT IMPLEMENTED; `gateway.ts` actor string alone cannot establish agent identity | credential verification/rotation/replay; tenant/audience/resource/action/time/budget checks; independent audit identity |
| Agent on behalf of human | authenticated agent plus explicit current delegation, consent as required | NOT IMPLEMENTED; no caller OBO header accepted | intersect current user rights, agent grants, delegation and org policy; expiry/revoke/race checks; verifiable chain |
| Subdelegation | only narrow every authority dimension; bounded depth and provenance | NOT IMPLEMENTED | reject org/audience/resource/action/time/budget widening, laundering and confused deputy; ancestor revocation |
| Audit | distinguish subject, actor, delegator, grant and run, metadata only | fixture org/actor/request/trace audit only | stable delegation identity/chain + rotation/revoke/privileged actions; privacy vectors; real stored readback |

Next implementation must use server-resolved authenticated principal records,
not extend the existing trusted `issue(org, actor)` helper into a public mint API.
No wildcard or caller-asserted actor can substitute for a verified delegation.
Sensitive authorization must read current grants/policy; offline verification
cannot promise immediate revocation. Step-up/four-eyes, token custody and
independent security review remain prerequisites for privileged production use.

WorkOS/Clerk capability comparison is NOT researched in this slice. No commercial
superiority claim, feature/edition claim, or provider-permission inference is made.
A sourced competitor matrix and independent review remain OPEN; they must not
hold up honest reporting of the narrower OIDC runtime blocker.
