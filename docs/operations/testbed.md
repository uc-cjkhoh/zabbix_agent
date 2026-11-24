---
title: Testbed
description: Observed state of the testbed host (read-only survey) and the rules for touching it
components: []
---

# Testbed

Host 10.168.50.40, a rehearsal box ([D13](../decisions/d13-rehearsal-testbed-and-sizing-reference.md)): the real target and the host running the 50+ modules are separate and not reachable from here. Observed by a read-only survey as the unprivileged `unified` account. Items marked
*unverified* were not checked, or could not be checked without root.

## Observed
| Item | Value |
|---|---|
| Hostname, OS | `chcluster`, AlmaLinux 9.8, kernel 5.14 el9 |
| Machine | VMware VM; Intel Xeon Gold 6148, 8 vCPU, AVX2 and AVX512F present |
| Memory | 15 GiB RAM, 0.8 GiB swap; about 14 GiB available when idle |
| GPU | None (VMware SVGA only; no `nvidia-smi`): model inference is CPU-only |
| Disk | One 49 GB `/` (xfs), 40 GB free; `/boot` 1 GB. No separate Docker or data volume |
| Docker | Engine 29.9.2, Compose v5.6.0, service active; account is in the `docker` group |
| Access | SSH password login works; account is in `wheel`, but `sudo` needs a password (not available to us) |
| Security | SELinux Enforcing; firewalld active (rules not readable without root, *unverified*) |
| Time | Chrony active, clock synchronised, zone America/New_York |
| Zabbix | Not installed (no package, no unit, nothing listening); a fresh install is needed |
| Listening | Only SSH on port 22 (plus chrony on localhost) |
| DNS to registries | `registry-1.docker.io`, `ghcr.io`, `huggingface.co` resolve; actual download not tested |

## Networks in use (avoid these)
| Network | Subnet | Owner |
|---|---|---|
| LAN, `ens33` | 10.168.48.0/22 (host 10.168.50.40, gateway 10.168.50.254) | host |
| `docker0` (default bridge) | 172.17.0.0/16 | Docker |
| `clickhouse-testing-env` (bridge `br-470f01c69c37`) | 172.25.0.0/24 | another project |
| Project block, reserved | 172.30.60.0/21 | this project ([topology](../architecture/topology.md)) |
| `zbxai_model` (created 2026-11-23) | 172.30.62.0/24, internal | this project (llama) |
| `zbxai_front` (created 2026-11-23) | 172.30.60.0/24 | this project (llama edge proxy so far) |

No route to `172.30.x` existed on the host before this (`ip route`, 2026-11-23). The other three project networks are still not created.

## Created by this project (llama slice, 2026-11-23)
Built ahead of the plan's order at the owner's request: only the model runtime, none of Zabbix, PostgreSQL or Grafana.
| Item | State |
|---|---|
| Code root on the testbed | `/unified/user/cj/ai_agent/zabbix_agent/` (copied from the workstation; no shared filesystem between the two hosts) |
| Volume `zbxai_models` | Holds `Llama-3.2-3B-Instruct-Q4_K_M.gguf` (2,019,377,696 bytes), SHA-256 checked against the publisher's value (bartowski repository at commit `5ab33fa94d1d`) |
| Container `zbxai_llama` | `llama-server` (digest pinned in `deploy/versions.env`), `--parallel 1`, `--ctx-size 32768` (raised from 4096 on 2026-11-23; the model's trained limit is 131072), `--threads 6`; healthy; non-root, read-only root filesystem, no capabilities; internal network only, no published port |
| Container `zbxai_edge` | Unprivileged nginx ([D15](../decisions/d15-llama-lan-access-through-authenticated-proxy.md)): publishes `0.0.0.0:18081`, needs the API key on everything except `/health`; on `zbxai_front` and `zbxai_model`; non-root, read-only root, no capabilities |
| Volume `zbxai_edge_conf` | The rendered nginx config (it holds the key; mode 0400, owned by the nginx user). The key itself is in the git-ignored `deploy/secrets/llama-api-key` on the testbed; read it there, never copy it into chat or docs |
| Pulled images | `ghcr.io/ggml-org/llama.cpp:server` (no `llama-bench` binary inside); `nginxinc/nginx-unprivileged:stable-alpine` (nginx 1.30.6) |
| Pulls and downloads | Image pulls from `ghcr.io` and `docker.io` and a model download from `huggingface.co` all worked |

Observed: one 46-token prompt answered in about 2.9 s of server time (0.72 s for the prompt, about 64 tokens/s; 2.22 s to generate 33 tokens, about 14 tokens/s).
The container held about 1.8 GiB of RAM afterwards (at `--ctx-size 4096`).
At `--ctx-size 32768` (2026-11-23): 4.9 GiB when idle, and 6.3 GiB after one 12,523-token prompt; a completely full 32k context was not run, so its peak is *unverified*
(expect more than 6.3 GiB). That 12.5k prompt took 283 s (44 tokens/s in) and generation fell to 2.9 tokens/s at that depth (14 on a short prompt). `zbxai_edge`'s
`proxy_read_timeout` is 600 s, so a very long prompt through the proxy can time out before it finishes. Hardening was read back with `docker inspect` and `docker exec`: user `nobody`, read-only root, all
capabilities dropped, no published ports, SELinux `Enforcing`. This is one short request, not the benchmark; the 120 s gate in Task 2.5 step 6 is still open.
`llama-server` itself still has no API key and allows all origins; it is only on the internal network, and the proxy adds the key.
Remote access (verified 2026-11-23 from the workstation, same LAN): `http://10.168.50.40:18081`, `/health` open; other paths 401 without or with a wrong key; 200 with the key, as
`Authorization: Bearer <key>` or basic auth (user `llama`); the web UI opens at `/` and the browser asks for that password. Plain HTTP, so the key is readable on the LAN.
`./scripts/check-edge.sh <url> < <key file>` repeats the check. firewalld did not block the port (its rules are still unreadable). The licence acceptance for the 3.2 3B file is the owner's, given in chat on 2026-11-23.

## Not ours: leave alone
Four stopped containers `ch1` to `ch4` (image `clickhouse-testenv:almalinux9-systemd`) and the network
`clickhouse-testing-env` belong to another project. Never stop, remove or reuse them, and never run a
cleanup that could match them.

## Rules
- The host is shared: follow agent-behavior `core/shared-machine.md`.
- Connect only when the user asks. Survey and inspection are read-only unless the user approves a change.
- Credentials: used once through an environment variable, never in a URL, config, file or doc (placeholders
  `<user>` / `<password>`; real values only in the git-ignored [credentials.local.md](credentials.local.md)).
  Tell the user to scope or revoke them afterwards.
- Only containers, networks and volumes carrying this project's prefix are ours to remove.
- Pick the project's subnet and ports from outside the table above ([D3](../decisions/d3-network-isolation.md)).
- Once containers exist, check that Grafana and Zabbix web are reachable from the workstation (same 10.168.48.0/22 LAN)
  without touching the testbed's configuration.

## Not the same machine
The workstation `dataweb` (10.168.49.20), where this KB was initialised, is not the testbed. Confirm which
machine you are on, and do not treat one host's state as the other's.
