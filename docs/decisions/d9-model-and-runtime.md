---
title: D9 Model and runtime
description: Llama 3.1 8B Instruct (3B fallback) on llama.cpp llama-server, CPU only, gated by a benchmark
components: []
---

# D9 — Llama 3.1 8B Instruct on llama.cpp `llama-server`, CPU only

**Status:** the model is owner-approved (Q2). The runtime is the owner's choice: "use Llama even for rehearsal", read as
llama.cpp `llama-server` instead of Ollama.

**Decision:** Llama 3.1 8B Instruct at 4-bit (about 5 GB), with Llama 3.2 3B (about 2 GB) as the fallback, served by
`llama-server` from its official CPU image with one slot (`--parallel 1`). One model per server process, so the fallback
is a second configuration. `llama-bench` on the testbed with the real prompt size decides 8B or 3B and sets the latency
target before the design is relied on; the server's own response timings are a check.

**Why:** The testbed has 8 vCPU, 15 GiB RAM and no GPU. `llama-server` has no registry, so the model is a file loaded
from a named volume at setup ([D12](d12-operational-data-stays-in-network.md)), and `llama-bench` measures the engine
that serves. No throughput figure was found from a credible source, so none is assumed.

**Notes:**
- Production calls use only the OpenAI-compatible `/v1` chat endpoint, so the runtime is swappable by config. The
  runtime runs on an internal-only Docker network.
- The GGUF source is settled by `gguf-sourcing`; its checksum and the licence acceptance are recorded, and the file is
  downloaded at setup only.
- Unverified: whether `--jinja` is needed, tool-call reliability, `tool_choice` and `json_schema` on `/v1`. Extra
  model-driven lookups stay off until verified; output is validated by code.
- Not chosen: Ollama (convenient pulls, but `tool_choice` unsupported and pulls need the internet); vLLM (8B in BF16
  needs about 16 GB, impractical here, plausible on a GPU target).
- The Llama community licence and acceptable-use policy apply; internal use is the expected case.
