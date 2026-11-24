---
title: LLM probe plan and results
description: Read-only probe of the running llama endpoint, the restart tests that need sign-off, and where the results go
components: [tools/bench/llm_probe.py, deploy/compose.yaml]
---

# LLM probe plan and results

Backs the settings in [llm-agent-proposal.md](llm-agent-proposal.md). **Status: the probe has not run against the real model.** A dry run against a local mock server passed (16 requests, report written, mock stopped).

## The probe
Script: `/unified/user/cj/ai_agent/zabbix_agent/tools/bench/llm_probe.py` (workstation copy; the testbed copy comes from the `scp` step below). Standard library only.

- Read-only: `GET /props` and `POST /v1/chat/completions`. Changes nothing on the server.
- Synthetic prompts only, no operational data. At most 20 requests (`--max-requests`), `max_tokens` capped at 400, no prompt near 32k, a hard timeout per request.
- The key is read from a file and sent only as an `Authorization` header; it is never printed or written.

| Block | Requests | Answers |
|---|---|---|
| A | 1 | Actual `n_ctx`, slot count, chat template present |
| B | 3 | Latency near the 1,500-token design size at temperature 0 against the 120 s gate; schema validity; repeatability |
| C | 3 | The same at temperature 0.2 |
| D | 5 | Schema validity on short prompts |
| E | 5 | Valid tool calls (the plan needs 9 of 10; expect failure without `--jinja`) |

## How to run it
The workstation and the testbed share no filesystem, and the owner already has SSH to the testbed, so the owner runs these; no credential is handed to an agent. Run the probe on the testbed against the local proxy, so the key never crosses the LAN in plain HTTP.

```
# 1. from the workstation: copy the script
ssh unified@10.168.50.40 'mkdir -p /unified/user/cj/ai_agent/zabbix_agent/tools/bench'
scp /unified/user/cj/ai_agent/zabbix_agent/tools/bench/llm_probe.py \
    unified@10.168.50.40:/unified/user/cj/ai_agent/zabbix_agent/tools/bench/

# 2. on the testbed: run it (about 10 to 20 minutes; blocks B and C take about a minute per request)
cd /unified/user/cj/ai_agent/zabbix_agent
python3 -I tools/bench/llm_probe.py --base http://127.0.0.1:18081 \
    --key-file deploy/secrets/llama-api-key --out /unified/user/cj/ai_agent/zabbix_agent/probe-results.md
```

`python3` on the testbed is *unverified*. Send `probe-results.md` back (it holds no key) and it goes into the Results section.

## Tests that need a restart (each its own sign-off)
Change one flag at a time, restore the current settings afterwards, and rerun the probe for each.

| Test | Change | Measure | Pass |
|---|---|---|---|
| T1 | `--ctx-size 8192` | Idle and loaded RAM; block B median | RAM near 2.2 GiB (Derived); latency not worse |
| T2 | `--threads 8` | Block B median | Faster than 6 without starving Zabbix or PostgreSQL |
| T3 | `--threads-batch 8` | Prefill tok/s | Higher than the T2 baseline |
| T4 | `--flash-attn` on | RAM and prefill | Lower RAM, equal or better speed |
| T5 | `--cache-type-k q8_0 --cache-type-v q8_0` | Validity count in blocks B to D | Still all valid |
| T6 | `--temp 0.1 --top-k 40 --top-p 0.9 --min-p 0.05 --seed 7` | Distinct outputs across runs | Stable output |

## Results
Not yet run. Paste or summarise `probe-results.md` here, mark each row **Measured**, and then update sections 1 and 3 of the proposal.
