# Transcription Cost Analysis

Comparing options for the STT (speech-to-text) stage of the pipeline — the slowest and most resource-intensive part. The LLM processing stage (Claude API, ~$0.10–0.15/podcast) is the same regardless of which transcription option you choose.

**Reference workload:** a 90-minute podcast, ~72 MB MP3, ~168 MB WAV after conversion.

---

## What you are actually paying for

The bottleneck is the **decoder** — the part of the ASR model that converts acoustic features into text tokens. On a GPU this runs faster; on CPU it depends heavily on the model's efficiency.

```
90-min podcast, Parakeet TDT 0.6B V3, Hetzner CX33 (CPU-only, 8 GB RAM)
→ 16 minutes total   (confirmed: 18 × 5-min chunks, ~53 sec/chunk)

Real-time factor: ~0.18×  (5–6× faster than real-time)
```

Parakeet TDT is substantially more efficient on CPU than general RNNT benchmarks suggest. This changes the calculus considerably — a cheap CPU VPS is a genuinely viable option.

---

## Option 1 — Local: Mac M-series (your MacBook)

The simplest and cheapest option for personal use.

| | |
|-|-|
| **Speed** | 8–12 min for 90-min podcast (MPS GPU acceleration) |
| **Cost per podcast** | ~$0 (electricity is negligible, ~10–15 W) |
| **Diarization** | Yes — pyannote runs on MPS too |
| **Setup** | Already working (Spokenly uses the same model) |
| **Drawback** | Ties up your laptop; can't run unattended overnight at scale |

**Best for:** occasional processing (a few podcasts a week) where you don't mind starting a job and letting it run.

---

## Option 2 — CPU-only VPS (current Hetzner setup)

What you are running now.

| Hetzner tier | RAM | Price | Speed (90 min podcast) | Cost per podcast (compute time) |
|---|---|---|---|---|
| CX22 | 4 GB | ~€4.35/mo | ~25–30 min (estimated) | ~€0.001 |
| **CX33** | **8 GB** | **~€8.21/mo** | **~16 min ✓ confirmed** | **~€0.002** |
| CX43 | 16 GB | ~€16.90/mo | ~10–12 min (estimated) | ~€0.004 |

> Confirmed on a Hetzner CX33: 87-minute podcast transcribed in **16 minutes** using Parakeet TDT 0.6B V3 with 5-minute chunking. Real-time factor ~0.18×.

The server time cost per podcast is essentially zero. At 16 minutes per podcast, even a €8/month VPS can comfortably handle dozens of podcasts per day with CPU to spare for other tasks.

**Best for:** regular processing where you already have a VPS. This is now the clear cost-efficiency winner for self-hosted setups.

---

## Option 3 — Spot GPU rental (pay per job)

Rent a GPU for the minutes you actually need it. Spin up, transcribe, shut down.

### Providers

| Provider | GPU | VRAM | Spot price | 90-min podcast | Cost per podcast |
|---|---|---|---|---|---|
| [Vast.ai](https://vast.ai) | RTX 3080 | 10 GB | ~$0.15–0.20/hr | ~8 min | **~$0.02–0.03** |
| [Vast.ai](https://vast.ai) | RTX 4090 | 24 GB | ~$0.25–0.45/hr | ~5 min | **~$0.02–0.04** |
| [RunPod](https://runpod.io) | RTX 3090 | 24 GB | ~$0.20–0.35/hr | ~7 min | **~$0.02–0.04** |
| [RunPod](https://runpod.io) | A100 40 GB | 40 GB | ~$0.80–1.20/hr | ~4 min | **~$0.05–0.08** |
| [Lambda Labs](https://lambdalabs.com) | A10 | 24 GB | $0.60/hr (on-demand) | ~6 min | **~$0.06** |

> Spot prices fluctuate with demand. Vast.ai and RunPod are marketplace models where prices vary by instance.

### How it works in practice

```bash
# 1. Spin up a GPU instance with the provider's CLI or API
# 2. rsync or scp the audio file to the instance
# 3. Run transcribe.py --audio-file audio_16k.wav
# 4. scp transcript.json back
# 5. Terminate the instance
```

This can be automated into a single script. Total round-trip including spin-up and file transfer: ~15–20 minutes for the job that takes 9 hours on CPU.

**Best for:** when you need results fast and process more than a few podcasts per week.

---

## Option 4 — Always-on GPU VPS

A dedicated machine with a GPU, running 24/7.

| Provider | Machine | GPU | Price | Speed |
|---|---|---|---|---|
| [Hetzner](https://www.hetzner.com/cloud/gpu) | GX2 | NVIDIA A30 | ~€3.49/hr (check current) | ~5 min |
| [Lambda Labs](https://lambdalabs.com/service/gpu-cloud) | 1× A10 | 24 GB VRAM | $0.60/hr = ~$432/mo | ~6 min |
| [CoreWeave](https://www.coreweave.com) | Various | Various | varies | varies |

Monthly costs for always-on GPU are high ($200–$500+). Only makes sense if you're processing dozens of hours of audio per day.

**Best for:** production services processing high volume continuously.

---

## Option 5 — Managed STT APIs (no local model)

Hand the audio to a cloud API and get back a transcript. Zero infrastructure to manage.

| Provider | Price | Diarization | Notes |
|---|---|---|---|
| [AssemblyAI](https://www.assemblyai.com) | $0.37/hr of audio | Yes (included) | Best quality + diarization in one call |
| [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text) | $0.006/min | No | 25 MB file limit — must chunk long audio |
| [Deepgram Nova-2](https://deepgram.com) | $0.0043/min | Yes (add-on) | Very fast, good accuracy |
| [Google Cloud STT](https://cloud.google.com/speech-to-text/pricing) | $0.016/min | Yes (add-on) | Higher cost, strong accuracy |
| [AWS Transcribe](https://aws.amazon.com/transcribe/pricing/) | $0.024/min | Yes | Most expensive, good AWS integration |

**Cost for a 90-minute podcast:**

| Provider | Cost |
|---|---|
| AssemblyAI | **$0.56** |
| OpenAI Whisper | **$0.54** |
| Deepgram | **$0.39** |
| Google Cloud STT | **$1.44** |
| AWS Transcribe | **$2.16** |

No GPU, no Python environment, no model weights, no chunking logic. You POST an audio file URL and GET back a JSON transcript. Diarization is usually included or a small add-on.

**Best for:** if you want to remove all infrastructure complexity and are comfortable with a ~$0.50 per-podcast cost.

---

## Side-by-side summary

| Option | Cost per podcast (STT only) | Speed | Setup complexity | Privacy |
|--------|----------------------------|-------|-----------------|---------|
| Local Mac M-series | ~$0 | 8–12 min | None (already works) | Full |
| Hetzner CX33 ✓ confirmed | ~$0 (server already paid) | **~16 min** | None | Full |
| Spot GPU (Vast.ai / RunPod) | $0.02–0.08 | 5–10 min | Medium | Full |
| Managed API (AssemblyAI) | $0.39–0.56 | 2–5 min | Low | Audio leaves your infra |
| Always-on GPU VPS | ~$0.05 amortised | 5–10 min | High | Full |

---

## Recommendation

| Your situation | Best option |
|---|---|
| Processing 1–5 podcasts/week | **Current Hetzner CPU VPS** — 16 min/podcast, essentially free |
| Need results in under 5 minutes | **Vast.ai / RunPod spot GPU** (~$0.03/podcast) |
| Want zero infrastructure to manage | **AssemblyAI** (~$0.56/podcast, diarization included) |
| Processing dozens of podcasts/day | **CPU VPS handles it** — 16 min × 30 podcasts = 8 hrs, fits in a day |
| Want to keep your Mac free | **CPU VPS — it's fast enough** |

### Revised conclusion

The Hetzner CPU VPS at 16 minutes per 90-minute podcast is a much stronger option than initially estimated. At €8/month it can process 60–80 podcasts/day before becoming a bottleneck. A GPU is no longer necessary for this workload unless you need sub-5-minute turnaround or are processing hundreds of episodes per day.

The only remaining reason to move to a managed API like AssemblyAI is if you want **diarization without setting up pyannote**, since that is still the more complex part of the local pipeline.
