---
title: D6 Detection split
description: Zabbix detects problems; the model only explains and ranks them
components: []
---

# D6 — Zabbix detects, the model triages

**Status:** decided (design plan approved by the owner).

**Decision:** Early detection uses Zabbix's own trigger functions (forecast and time-to-threshold for
exhaustion, baseline and anomaly functions for seasonal metrics, thresholds for sudden failures). The model
runs only after a problem exists, to correlate, rank and explain. A fixed code pipeline drives it, not an
open agent loop.

**Why:** On a CPU-only host a model watching metrics is too slow and weak at numbers; detection inside Zabbix
is deterministic and needs no extra system. `tool_choice` is unconfirmed on `llama-server` (unsupported on Ollama), and the Llama 3.1 model card does
not list tool calling as a formal feature, so the code, not the model, decides the steps.

**Alternatives set aside:** model watches everything; a separate analytics engine (the growth path).
