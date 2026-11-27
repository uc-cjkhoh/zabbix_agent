# CLAUDE.md — Zabbix Agent KB

A map, not a manual. Detail lives in `docs/`.

## 1. Read first
1. [README.md](README.md)
2. [docs/architecture/overview.md](docs/architecture/overview.md), then [design-plan.md](docs/architecture/design-plan.md)
3. The doc for the area you touch (table in section 9). Update it in the same change.

Rulebook: `/unified/user/cj/general_kb/agent-behavior/` is the system prompt for this KB. Load its `core/`
files always; load the rest by task from its `README.md`. Conflicts are settled by its `core/precedence.md`.
Project type: **no matching type, core only** ([D4](docs/decisions/d4-project-type-core-only.md)).

## 2. Where the code is
Undecided ([open question](docs/decisions/README.md)). The project root is `/unified/user/cj/` on any machine;
keep other folders clean and isolated. This KB is docs only: never scaffold code into it. `.claude/` holds tooling hooks, not product code ([D14](docs/decisions/d14-changelog-generated-in-root.md)).

## 3. Golden rules
Full text, same numbers: [docs/development/coding-standards.md](docs/development/coding-standards.md).
1. **Docker only** for every runtime component (every change).
2. **No network clashes:** check the host's bridges first; use a different subnet and port than the host (every change).
5. **Read-only first** against Zabbix; rule 6: each new write is its own sign-off (every server change).
7. **Never interpolate unvalidated input**, including model output, into a command, query or path (every server change).
8. **Bound every query** with a limit and a time limit; say when a limit was hit (every server change).
12. **Secrets in one place:** never in docs, logs, commits or chat; placeholders only.
14. **Declared is not verified:** mark anything not seen on the real system as *unverified*.
15. **Same-change rule:** a change that alters a described fact updates its doc before done.
16. **Grafana is read-only and never a second alert engine:** its own Zabbix token, a SELECT-only database role, no alert rules.
17. **Operational data stays in the network:** no external service, no run-time outbound dependency.

## 4. What this is
A local Zabbix AI agent: Zabbix detects problems and Grafana shows them at once; a Llama model on llama.cpp, fed by the
agent's own bounded read-only Zabbix client, stores an analysis that Grafana shows beside the problem. Grafana is the only notification surface. No MCP server runs: it is gated on a tool-call benchmark ([D7](docs/decisions/d7-thin-readonly-mcp-server.md)). Status: design plan approved; implementation plan written; scope cut by [D19](docs/decisions/d19-scope-cut-after-full-review.md) on 2026-11-27, awaiting the owner's review.

## 5. Build, run, test, deploy
Only the llama slice and the Zabbix, PostgreSQL and Grafana slice exist (code root `/unified/user/cj/ai_agent/zabbix_agent/codebase/` on the workstation; the testbed copy sits at `/unified/user/cj/ai_agent/zabbix_agent/`, the same files without the `codebase/` level). On the testbed, from its code root:
`./scripts/fetch-model.sh` (one-time download), `docker compose --env-file .env --env-file deploy/versions.env -f deploy/compose.yaml up -d` (start; `down` stops it,
the volume `zbxai_models` is removed separately), `./scripts/check-llama.sh` (egress, health, one chat), `./scripts/secrets-init.sh` (database password and web login into the volume `zbxai_secrets`, run before the first `up`; needs the git-ignored `deploy/secrets/web-credential`, one line `user:password`).
Grafana is `http://<testbed>:13000` with the shared development login ([D16](docs/decisions/d16-zabbix-web-and-grafana-on-lan-with-shared-login.md)); Zabbix web is on host loopback only (`127.0.0.1:${ZBXAI_ZBXWEB_PORT}`, reach it with an ssh tunnel); llama has no LAN access (internal network only). **Scope cut 2026-11-27 ([D19](docs/decisions/d19-scope-cut-after-full-review.md)):** the llama proxy, the official MCP server and the log replay rig are gone from the repo, and the replay objects on the real Zabbix were removed. **State on the testbed, not yet cleaned (needs the owner's go, backlog `testbed-cleanup`; *unverified* since 2026-11-26):** `zbxai_mcp` and `zbxai_edge` still run, their volumes and `/unified/user/cj/data/replay_out` still exist, and Zabbix web is still published on `0.0.0.0:18080` until the new compose file is applied there. Grafana (13000) is stopped since 2026-11-24, kept not removed; start it by name, only when the owner asks: `docker compose ... up -d postgres zabbix-server zabbix-web grafana`. Safe-operation rules for the testbed: [docs/operations/testbed.md](docs/operations/testbed.md).
Start or stop the whole stack on the testbed with `/unified/user/cj/ai_agent/zabbix_agent/scripts/zbxai-stack.sh start|stop|status [--dry-run] [--except grafana]` (plain `docker start`/`stop` in dependency order, waits for health; the file exists only on the testbed host, in neither git repo and not on the workstation). Never start, stop or reconfigure anything on the testbed without the user asking. Credentials live only in
the git-ignored `docs/operations/credentials.local.md`.

## 6. Source layout
Code root `/unified/user/cj/ai_agent/zabbix_agent/codebase/` (a git repo since 2026-11-26, local, no remote): `deploy/` (compose.yaml, versions.env, models.sources, models.sha256), `scripts/` (fetch-model.sh, check-llama.sh, secrets-init.sh, ship-test.sh, lock.sh, test-entry.sh, test-store.sh), `Dockerfile` (targets `runtime`, `test`), `pyproject.toml`, `requirements.lock` (still lists the removed `mcp` until `scripts/lock.sh` is re-run, backlog `regenerate-lock`), `tools/zbx_provision/` (Task 1.3: Zabbix template, read-only role, users and tokens as code; run only on a throwaway Zabbix so far, never applied to the real one), `src/zbxai/` (`config`, `models`, `store`, `zabbix_client`, `llm`, `pipeline`, `health`, `receiver`, `worker`: built 2026-11-26 as code with unit tests only, never deployed; `store.py` passed its integration tests once on a throwaway PostgreSQL; no MCP server is written or planned until tool calls prove reliable (D7), and the sweep is cut (D19)), `deploy/postgres/migrations/001_init.sql` (nothing applies it yet), `tests/unit/`, `tests/integration/test_store.py` and `tests/e2e/` (database-backed tests run with `./scripts/test-store.sh`: it creates a throwaway internal network and PostgreSQL, snapshots every other container before, during and after, runs the tests, removes everything and fails on any difference; the owner's standing permission for such isolated test runs is in [testbed.md](docs/operations/testbed.md)). Tests run only in a container on the testbed: `./scripts/ship-test.sh [pytest-args]` from the workstation (needs `ZBXAI_SSH_TARGET` in `.env`); `./scripts/lock.sh` regenerates the hashed lock.

## 7. Design rules
No custom UI is built (Grafana is the monitoring UI, D11); UI/browser rules from agent-behavior are dropped.

## 8. KB directory map
The one copy of the tree.
```
./
├── README.md  CLAUDE.md  CHANGELOG.md (generated)  .gitignore
├── .claude/                      # settings.json, hooks/update-changelog.py
└── docs/
    ├── README.md
    ├── architecture/             # index.md, overview.md, design-plan.md, topology.md, topology-facts.md
    ├── decisions/                # README.md (index + open questions), d1..d19 (d15, d17, d18 withdrawn)
    ├── operations/               # testbed.md, credentials.local.md (git-ignored)
    ├── topology/                 # static viewer: index.html, topology.css, topology.js, topology-data.js (built vs target)
    └── development/              # coding-standards, review-guidelines, implementation-plan/, backlog/, run-logs/
```

## 9. Where things live
| Task | Code path | Doc |
|---|---|---|
| Understand the system shape | none yet | [architecture/overview.md](docs/architecture/overview.md) |
| Networks, ports, containers, flows | `deploy/compose.yaml` | [architecture/topology.md](docs/architecture/topology.md) |
| Understand why and how it behaves | none yet | [architecture/design-plan.md](docs/architecture/design-plan.md) |
| Change or add a decision | none | [decisions/README.md](docs/decisions/README.md) |
| Touch the testbed | none | [operations/testbed.md](docs/operations/testbed.md) |
| Write code or config | none yet | [development/coding-standards.md](docs/development/coding-standards.md) |
| Change the change log or its hook | `.claude/hooks/update-changelog.py` | [D14](docs/decisions/d14-changelog-generated-in-root.md) |
| Review or call work done | none | [development/review-guidelines.md](docs/development/review-guidelines.md) |
| Change Grafana dashboards or its datasource | `deploy/compose.yaml` (`grafana` service) | [D11](docs/decisions/d11-grafana-monitoring-ui.md), [design plan](docs/architecture/design-plan.md) section 6a |
| Build the system (task order, protocol, gates) | none yet | [implementation-plan](docs/development/implementation-plan/index.md) |
| Add or pick a to-do | none | [development/backlog/index.md](docs/development/backlog/index.md) |
| Record blocked work | none | [development/run-logs/blocked](docs/development/run-logs/blocked) |
