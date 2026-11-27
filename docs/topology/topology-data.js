/*
 * Topology data: the one source for both panels of index.html.
 *
 * Left panel  = what is built, from codebase/deploy/compose.yaml and the status line of
 *               docs/architecture/topology.md. Run state checked on the testbed 2026-11-26: llama, postgres,
 *               zabbix_server and zabbix_web run; grafana is stopped (kept, paused), see `observed`. D19 (2026-11-27)
 *               removed edge, mcp and the replay rig from compose and the design; the containers zbxai_edge and
 *               zbxai_mcp were last recorded running on 2026-11-26 and stay on the testbed until the owner approves cleanup.
 * Right panel = the target, from topology.md sections 3 to 5 (container table is the authority).
 *
 * Status words follow the KB (coding-standards rule 14):
 *   built    = present in compose.yaml or a script (recorded, not itself proof it works)
 *   observed = seen on the real host, always with a date (field `observed`)
 *   planned  = designed, nothing created
 * When topology.md changes a container, network, port or flow, change this file in the same change.
 * No secrets, keys or passwords belong here.
 */
window.TOPOLOGY = {
  asOf: "2026-11-27",

  host: "Testbed chcluster 10.168.50.40 · AlmaLinux 9.8 · 8 vCPU · 15 GiB · no GPU · 40 GB free",

  zones: [
    { id: "ext", title: "Outside the testbed", meta: "LAN 10.168.48.0/22", kind: "outside" },
    { id: "front", title: "zbxai_front", meta: "172.30.60.0/24 · not internal (egress possible)", kind: "network", net: "front", exists: true },
    { id: "app", title: "zbxai_app", meta: "172.30.61.0/24 · internal, no egress", kind: "network", net: "app", exists: true },
    { id: "model", title: "zbxai_model", meta: "172.30.62.0/24 · internal, no egress", kind: "network", net: "model", exists: true },
    {
      id: "transient", title: "Transient networks",
      meta: "zbxai_setup 172.30.64.0/24 (not internal) · zbxai_test 172.30.63.0/24 (internal)",
      kind: "network", net: "transient", exists: false,
      leftMeta: "none present now: zbxai_setup is created by fetch-model.sh and removed after; zbxai_test is not created"
    },
    { id: "vol", title: "Named volumes", meta: "no bind mounts (SELinux Enforcing)", kind: "volumes" }
  ],

  /*
   * status: "built" | "partial" | "planned"   (state of the left panel)
   * nets.target / nets.built: network names the container is attached to
   * kind: "svc" (counted as a service), "ext" (outside), "vol" (volume)
   */
  items: [
    // Outside
    { id: "people", name: "People", zone: "ext", kind: "ext", status: "built",
      sub: "Browsers on the LAN",
      detail: { Role: "Open Grafana (Zabbix web only through an ssh tunnel); the only notification surface is Grafana (D8)" } },
    { id: "workstation", name: "Workstation dataweb", zone: "ext", kind: "ext", status: "built",
      sub: "10.168.49.20 · ssh :22, no Docker",
      detail: { Role: "Edits code and KB; docker CLI and test streams over ssh" } },

    // Front
    { id: "grafana", name: "zbxai_grafana", zone: "front", kind: "svc", status: "built",
      sub: "Dashboards, read-only · LAN :13000",
      nets: { target: ["front", "app"], built: ["front", "app"] },
      observed: "reached from the workstation 2026-11-24; stopped since 2026-11-24, not removed (checked 2026-11-26)",
      detail: { Listens: "3000", Published: "0.0.0.0:13000 (D16)", Volumes: "zbxai_grafana, zbxai_secrets/grafana (read-only)", "RAM": "0.17 GB observed" },
      note: "Own read-only Zabbix token and a SELECT-only PostgreSQL role; no alert rules (rule 16).",
      leftNote: "Compose mounts no provisioning, so the Zabbix and PostgreSQL datasources are not built; whether any were added by hand is unverified." },
    { id: "zabbix_web", name: "zbxai_zabbix_web", zone: "front", kind: "svc", status: "built",
      sub: "Zabbix frontend and API · host loopback :18080",
      nets: { target: ["front", "app"], built: ["front", "app"] },
      observed: "reached from the workstation 2026-11-24; stopped 2026-11-24, started again 2026-11-26 and healthy; port not re-reached from the workstation",
      detail: { Listens: "8080", Published: "127.0.0.1:18080 (D16 amended by D19)", Volumes: "reads zbxai_secrets/zabbix", "RAM": "0.05 GB observed" },
      note: "Admin-capable, shared development login over plain HTTP, so loopback only: reach it through an ssh tunnel.",
      leftNote: "The testbed still publishes 0.0.0.0:18080 until the new compose is applied there (unverified 2026-11-27)." },

    // App
    { id: "postgres", name: "zbxai_postgres", zone: "app", kind: "svc", status: "built",
      sub: "PostgreSQL :5432 · Zabbix data and analyses",
      nets: { target: ["app"], built: ["app"] },
      observed: "stopped 2026-11-24, started again 2026-11-26 and healthy",
      detail: { Listens: "5432", Published: "none", Volumes: "zbxai_pgdata, zbxai_secrets/pg (read-only)", "RAM": "0.16 GB observed idle" } },
    { id: "zabbix_server", name: "zbxai_zabbix_server", zone: "app", kind: "svc", status: "built",
      sub: "Zabbix server · trapper :10051",
      nets: { target: ["app", "model"], built: ["app"] },
      observed: "stopped 2026-11-24, started again 2026-11-26 and healthy; API answered 8.0.0 from the app network",
      detail: { Listens: "10051 (trapper)", Published: "none (D13)", Volumes: "none", "RAM": "1.0 GB estimate" },
      note: "On model too, to health-check llama.",
      leftNote: "Compose attaches it to app only. The target adds model, so the health check of llama cannot run yet." },
    { id: "agent", name: "zbxai_agent", zone: "app", kind: "svc", status: "planned",
      sub: "Receiver and worker modules · :8000",
      nets: { target: ["app", "model"], built: [] },
      detail: { Listens: "8000 (receiver)", Published: "none", Volumes: "none", "RAM": "0.5 GB estimate (0.2 receiver, 0.3 worker)" },
      note: "One service (D19). The receiver takes problem events from the Zabbix webhook media type (POST /v1/events); the worker calls the bounded Zabbix client in-process and llama once per analysis. Code written and unit-tested (src/zbxai/receiver.py, worker.py, pipeline.py), no container, no webhook." },
    { id: "disk_reporter", name: "zbxai_disk_reporter", zone: "app", kind: "svc", status: "planned",
      sub: "Reports host disk to Zabbix",
      nets: { target: ["app"], built: [] },
      detail: { Listens: "none", Published: "none", Volumes: "none", "RAM": "0.05 GB estimate" } },
    { id: "loadgen", name: "zbxai_loadgen, zbxai_fault_*", zone: "app", kind: "svc", status: "planned",
      sub: "Simulated load and seeded faults (transient)",
      nets: { target: ["app"], built: [] },
      detail: { Listens: "none", Published: "none", Volumes: "none", "RAM": "0.4 GB estimate" },
      note: "Removed after each run." },
    { id: "oneshots", name: "One-shots", zone: "app", kind: "svc", status: "partial",
      sub: "secrets_init · migrate · provision",
      nets: { target: ["app"], built: [] },
      detail: { Listens: "none", Published: "none", Volumes: "writes or reads zbxai_secrets", "RAM": "transient" },
      note: "Removed after they finish.",
      leftNote: "Only scripts/secrets-init.sh exists (runs on no network, writes the secrets volume). migrate and provision are not built." },

    // Model
    { id: "llama", name: "zbxai_llama", zone: "model", kind: "svc", status: "built",
      sub: "llama-server · Llama 3.2 3B Q4_K_M · :8080",
      subTarget: "llama-server · Llama 3.1 8B (3.2 3B for rehearsal) · :8080",
      nets: { target: ["model"], built: ["model"] },
      observed: "3B answered one short prompt 2026-11-23",
      detail: { Listens: "8080", Published: "none (internal network only)", Volumes: "zbxai_models (read-only)", "RAM": "target 6.0 GB (8B); the 3B was observed at 1.8 GB (4k context) and 6.3 GB after a 12.5k prompt (32k context)" },
      note: "--parallel 1: one model call at a time.",
      leftNote: "Runs the 3B model. The 8B and the real prompt size are not benchmarked (backlog model-benchmark)." },

    // Transient
    { id: "setup", name: "zbxai_fetch_model", zone: "transient", kind: "svc", status: "built",
      sub: "Model download (transient, egress)",
      nets: { target: ["transient"], built: [] },
      detail: { Listens: "none", Published: "none", Volumes: "writes zbxai_models", "RAM": "transient" },
      note: "Runs on zbxai_setup, the only network with egress besides front; removed after the download.",
      leftNote: "scripts/fetch-model.sh creates zbxai_setup, downloads, verifies on no network, then removes it. scripts/lock.sh uses the same network for PyPI downloads (zbxai_lock_<pid>). Not present between runs." },
    { id: "test", name: "zbxai_pgtest, zbxai_test_run", zone: "transient", kind: "svc", status: "planned",
      sub: "Throwaway test runs (transient)",
      nets: { target: ["transient"], built: [] },
      detail: { Listens: "5432 (pgtest)", Published: "none", Volumes: "none", "RAM": "0.5 GB estimate, transient" },
      leftNote: "Created and removed by scripts/test-store.sh for each integration run (first run 2026-11-26); none exists between runs. Unit-test runs are zbxai_test_run_<pid> on --network none, from scripts/ship-test.sh." },

    // Volumes
    { id: "v_models", name: "zbxai_models", zone: "vol", kind: "vol", status: "built",
      sub: "Model files, read-only in llama", detail: { Used_by: "llama (ro), fetch_model (rw)" } },
    { id: "v_pg", name: "zbxai_pgdata", zone: "vol", kind: "vol", status: "built",
      sub: "PostgreSQL data", detail: { Used_by: "postgres" } },
    { id: "v_grafana", name: "zbxai_grafana", zone: "vol", kind: "vol", status: "built",
      sub: "Grafana state", detail: { Used_by: "grafana" } },
    { id: "v_secrets", name: "zbxai_secrets", zone: "vol", kind: "vol", status: "built",
      sub: "One sub-directory per service, read-only", detail: { Used_by: "postgres, zabbix_server, zabbix_web, grafana (each its own sub-directory)" } }
  ],

  /* status: "built" or "planned" (left panel). `to: []` = host level, no line drawn. */
  flows: [
    { id: "f1", from: ["people"], to: ["grafana"], proto: "HTTP 13000", net: "LAN, front", purpose: "The only notification surface", status: "built", observed: "reached from the workstation 2026-11-24; stopped since, not answering 2026-11-26" },
    { id: "f2", from: ["people"], to: ["zabbix_web"], proto: "HTTP 18080 through an ssh tunnel", net: "ssh, front", purpose: "Zabbix frontend, fallback view and administration (D16 amended by D19)", status: "built", observed: "reached from the workstation across the LAN 2026-11-24 when it was published on 0.0.0.0; loopback only once the new compose is applied" },
    { id: "f5", from: ["zabbix_server"], to: ["postgres"], proto: "PostgreSQL 5432", net: "app", purpose: "Zabbix history and configuration", status: "built" },
    { id: "f6", from: ["zabbix_web"], to: ["postgres", "zabbix_server"], proto: "5432, 10051", net: "app", purpose: "Frontend", status: "built" },
    { id: "f7", from: ["grafana"], to: ["zabbix_web"], proto: "JSON-RPC, read-only token", net: "app", purpose: "Problems view, trends", status: "planned" },
    { id: "f8", from: ["grafana"], to: ["postgres"], proto: "PostgreSQL as zbxai_grafana_ro", net: "app", purpose: "AI-analyses table (SELECT-only)", status: "planned" },
    { id: "f9", from: ["zabbix_server"], to: ["agent"], proto: "HTTP POST /v1/events, 8000", net: "app", purpose: "Problem events to the agent (webhook)", status: "planned" },
    { id: "f10", from: ["agent"], to: ["postgres"], proto: "PostgreSQL as zbxai_agent_rw", net: "app", purpose: "Queue and analyses", status: "planned" },
    { id: "f11", from: ["agent"], to: ["zabbix_web"], proto: "JSON-RPC, read-only token", net: "app", purpose: "Bounded context reads", status: "planned" },
    { id: "f12", from: ["agent"], to: ["llama"], proto: "HTTP /v1/chat/completions, 8080", net: "model", purpose: "One analysis call at a time", status: "planned" },
    { id: "f14", from: ["zabbix_server"], to: ["agent", "grafana", "llama"], proto: "HTTP GET health endpoints", net: "app, model", purpose: "Self-monitoring (needs zabbix_server on model)", status: "planned" },
    { id: "f15", from: ["loadgen", "disk_reporter"], to: ["zabbix_server"], proto: "Zabbix trapper 10051", net: "app", purpose: "Simulated and measured values", status: "planned" },
    { id: "f16", from: ["workstation"], to: [], proto: "ssh 22", net: "LAN", purpose: "Docker CLI and test streams to the testbed host", status: "built" }
  ]
};
