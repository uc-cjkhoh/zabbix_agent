---
title: Backlog index
description: The only to-do list, with the recommended order
components: []
---

# Backlog

Entry format: `- **name** (priority; effort) - open|partial: what exists and what is missing. Needs: ...`
When built, move the description into its feature doc and delete the entry.

## Recommended order
1. Owner reviews the [implementation plan](../implementation-plan/index.md) and meets its gates: testbed grant, ssh key, commit policy
   (Q7), Llama licence, code location (Q1). Q13 is optional.
2. Owner confirms the topology's subnet block is unused across the network (D3).
3. Execute the plan. The design verification items are steps inside it ([design-verification.md](design-verification.md)).
4. Wire hooks if wanted (Q6).

## Files
| File | Holds |
|---|---|
| [planning-docs.md](planning-docs.md) | The three documents the owner requires |
| [design-verification.md](design-verification.md) | Checks that gate the design plan |
| [environment-and-tooling.md](environment-and-tooling.md) | Remaining testbed checks, hooks, git |
