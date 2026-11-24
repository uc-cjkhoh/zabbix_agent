# CLAUDE.md — Zabbix Agent KB

A map, not a manual. Detail lives in `docs/`.

## 1. Read first
1. [README.md](README.md)
2. [docs/architecture/overview.md](docs/architecture/overview.md), then [design-plan.md](docs/architecture/design-plan.md)
3. The doc for the area you touch (table in section 9). Update it in the same change.

Rulebook: `/unified/user/cj/knowledge/agent-behavior/` is the system prompt for this KB. Load its `core/`
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
A local Zabbix AI agent: Zabbix detects problems and Grafana shows them at once; a Llama model on llama.cpp, fed by a
read-only MCP server, stores an analysis that Grafana shows beside the problem. Grafana is the only notification surface. Status: design plan approved; implementation plan written, awaiting the owner's review.

## 5. Build, run, test, deploy
Only the llama slice exists (code root `/unified/user/cj/ai_agent/zabbix_agent/`, on the workstation and copied to the testbed). On the testbed, from that root:
`./scripts/fetch-model.sh` (one-time download), `docker compose --env-file .env --env-file deploy/versions.env -f deploy/compose.yaml up -d` (start; `down` stops it,
the volumes `zbxai_models` and `zbxai_edge_conf` are removed separately), `./scripts/check-llama.sh` (egress, health, one chat), `./scripts/edge-init.sh` (API key and proxy config, run before the first `up`; `--rotate` for a new key),
`./scripts/check-edge.sh <url> < <key file>` (proxy checks). Remote access: `http://<testbed>:18081` with the key in `deploy/secrets/llama-api-key` ([D15](docs/decisions/d15-llama-lan-access-through-authenticated-proxy.md)). Safe-operation rules for the testbed: [docs/operations/testbed.md](docs/operations/testbed.md).
Never start, stop or reconfigure anything on the testbed without the user asking. Credentials live only in
the git-ignored `docs/operations/credentials.local.md`.

## 6. Source layout
Code root `/unified/user/cj/ai_agent/zabbix_agent/` (not a git repo yet): `deploy/` (compose.yaml, versions.env, models.sources, models.sha256, edge/default.conf.tmpl), `scripts/` (fetch-model.sh, check-llama.sh, edge-init.sh, check-edge.sh). No Python source yet.

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
    ├── decisions/                # README.md (index + open questions), d1..d15
    ├── operations/               # testbed.md, credentials.local.md (git-ignored)
    └── development/              # coding-standards, review-guidelines, implementation-plan/, backlog/, run-logs/
```

## 9. Where things live
| Task | Code path | Doc |
|---|---|---|
| Understand the system shape | none yet | [architecture/overview.md](docs/architecture/overview.md) |
| Networks, ports, containers, flows | none yet | [architecture/topology.md](docs/architecture/topology.md) |
| Understand why and how it behaves | none yet | [architecture/design-plan.md](docs/architecture/design-plan.md) |
| Change or add a decision | none | [decisions/README.md](docs/decisions/README.md) |
| Touch the testbed | none | [operations/testbed.md](docs/operations/testbed.md) |
| Write code or config | none yet | [development/coding-standards.md](docs/development/coding-standards.md) |
| Change the change log or its hook | `.claude/hooks/update-changelog.py` | [D14](docs/decisions/d14-changelog-generated-in-root.md) |
| Review or call work done | none | [development/review-guidelines.md](docs/development/review-guidelines.md) |
| Change Grafana dashboards or its datasource | none yet | [D11](docs/decisions/d11-grafana-monitoring-ui.md), [design plan](docs/architecture/design-plan.md) section 6a |
| Build the system (task order, protocol, gates) | none yet | [implementation-plan](docs/development/implementation-plan/index.md) |
| Add or pick a to-do | none | [development/backlog/index.md](docs/development/backlog/index.md) |
| Record blocked work | none | [development/run-logs/blocked](docs/development/run-logs/blocked) |
