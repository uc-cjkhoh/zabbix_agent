---
title: Review guidelines and definition of done
description: Change classes, the done checklist, and commit and merge policy for this project
components: []
---

# Review guidelines

## Change classes
Classify first and say which. When unsure, pick the lower class.
| Class | Examples | Required |
|---|---|---|
| Trivial | typo, comment, config value | Edit in place; cheapest relevant check; update a doc only if it states the changed fact |
| Small | fix inside one component | Test for the changed behaviour, the relevant suite, the covering doc |
| Substantial | new component, cross-component change, Zabbix write path, network or schema change, anything hard to reverse | Branch, test first for logic, cold review, docs and decision log, then integrate |

## Definition of done
Scale to the class; a trivial change needs only the first box, its check, and the affected doc line.
- [ ] The [golden rules](coding-standards.md) hold for what was touched.
- [ ] Every new input is validated, with limits and a time bound on any query.
- [ ] Build clean and tests green; new logic lives in a pure module with a test; changed scripts pass a
      syntax check; containers start from a clean state on a non-conflicting network.
- [ ] Anything claimed to work was run on the real system; the rest is marked *unverified*.
- [ ] Docs updated in the same change; decision log updated if a decision changed; a built backlog item moved
      into its feature doc and deleted from the backlog.
- [ ] Nothing left running that this session started; process listing checked.
- [ ] Integrated only as authorised (below).

No UI boxes: no UI code is built ([D4](../decisions/d4-project-type-core-only.md)); Grafana dashboards and settings are configuration and follow the golden rules.

## Commit and merge
Default: report the diff and results, then ask before committing, and ask again before merging. A standing
grant applies only to a named repository and is recorded with who granted it and when. Never push unless asked.
Decision pending: Q7 in [decisions](../decisions/README.md).
