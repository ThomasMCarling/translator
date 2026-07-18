# ElevenLabs API Research (updated 2026-07-18, end of session 2)

Research for the EN↔SK translator app. Session 1 findings verified against elevenlabs.io docs;
session 2 findings verified **empirically** against the live API — several doc-level assumptions
turned out wrong in practice. Empirical notes are marked ⚡.

Architecture context: browser connects **directly** to ElevenLabs for STT (and later TTS);
our backend only mints single-use tokens. No audio ever transits our server.

## Single-use tokens (the key to browser-direct)

- `POST https://api.elevenlabs.io/v1/single-use-token/{token_type}` with `xi-api-key` header.
- `token_type` enum: **`realtime_scribe`** and **`tts_websocket`**.
- Response: `{ "token": "sutkn_..." }`. TTL 15 min, consumed on first use.
- ⚡ Confirmed working end-to-end via our `/api/token` endpoint + `?token=` query param.
- ⚡ One token per WebSocket connection — every reconnect needs a fresh mint. Mints are free/instant.
- EU residency base URLs exist (`api.eu.residency.elevenlabs.io`) — not needed so far.

## STT: Scribe v2 Realtime (WebSocket)

- URL: `wss://api.elevenlabs.io/v1/speech-to-text/realtime`
- Auth: `?token=` query param (browser). Model: `scribe_v2_realtime`.
- ⚡ **All session config is query params on the wss URL** (resolved open question — there is
  no config message). We send: `model_id`, `token`, `commit_strategy=vad`,
  `include_language_detection=true`, `include_timestamps=true`.

### Sending audio
- Base64 inside JSON messages (NOT binary frames):
  `{ "message_type": "input_audio_chunk", "audio_base_64": "...", "sample_rate": 16000 }`
- ⚡ Confirmed working with 16 kHz PCM16, ~104 ms batches (1664 samples).
- `previous_text` optional context on first chunk only.
  ⚡ **Does NOT steer language detection** — tested with a bilingual EN/SK seed, detector still
  wandered (pl/uk/ru). Abandoned.

### Language handling — the big findings ⚡
- **`language_code` is a bias, not a constraint.** A session "forced" to `en` will happily emit
  Polish orthography if the audio sounds Polish. There is no hard language clamp. This kills any
  scheme that relies on forced-language decoding (incl. dual-session logprob arbitration — built,
  tested, failed: both sessions converge on similar decodes and the "wrong" language can win).
- **Detection vs dialect**: standard/central Slovak detects as `sk`. Eastern-Slovak accent
  (speaker from NE Slovakia near the Polish border) detects as `pl`, sometimes `uk`/`ru`, and gets
  transcribed in that orthography. English detection is rock solid. Detection is per-utterance,
  not sticky.
- **Meaning survives mis-detection**: the "Polish" decodes of eastern Slovak are mangled spelling
  but semantically faithful — good enough input for an LLM to reconstruct + translate.
- **Chosen architecture**: single session, NO language hint, let Scribe write what it hears;
  language ID + reconstruction + translation all happen in the downstream LLM call.
  (An `sk` hint produced orthographically-correct Slovak but misheard more actual words.)
- No candidate-language restriction parameter exists on the realtime API.
- `keyterms` (bias terms) — still untested.

### Commit / VAD behavior ⚡
- VAD commits when it hears ~1.5 s of silence **in the audio stream**. No audio ≠ silence:
  stop sending right after speech and the commit never comes; the idle session closes ~15 s
  later with code 1000. Keep streaming through the pause.
- Both commit events fire back-to-back per utterance:
  1. `committed_transcript` — text only.
  2. `committed_transcript_with_timestamps` — text + `language_code` (null if detection off)
     + `words` array. **This is the one to consume**: language and per-word `logprob` live here.
- Empty-text commits happen (e.g. after long silence) — filter them.

### Confidence / hallucination ⚡
- Each word in `words` has `logprob`. Average word logprob calibration from real use:
  - clean speech: **-0.1 to -0.9**
  - cross-talk / mangled: **≈ -1.9**
  - pure hallucination (noise → fluent Brazilian Portuguese; near-silence → phantom "Yes."):
    **-2.5 and below**
- We gate commits at **avg logprob ≥ -1.5**. Also useful: translating nothing when both
  quality and content are garbage is a feature (stops the app speaking hallucinated Slovak).
- Partials revise heavily mid-utterance (normal); only committed text is final.

### Server events observed ⚡
`session_started`, `partial_transcript`, `committed_transcript`,
`committed_transcript_with_timestamps`. No utterance start/end events beyond these
(resolved open question — partials serve that role).

## TTS: two transport options (unchanged, not yet built)

Model: `eleven_flash_v2_5` (~75 ms model latency, 32 languages incl. Slovak).

### Option A — HTTP streaming (start here)
- `POST /v1/text-to-speech/{voice_id}/stream`, `xi-api-key` header — no single-use-token auth
  documented, so this proxies through a SvelteKit endpoint (request/response, streams fine).
- Body: `text`, `model_id`, `language_code`, `voice_settings`; query: `output_format`,
  `optimize_streaming_latency` 0–4.

### Option B — WebSocket stream-input (browser-direct, lower latency)
- `wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input`
- Auth includes `single_use_token` query param (token type `tts_websocket`).
- InitializeConnection (blank-space text first), SendText (`flush: true` for short sentences),
  CloseConnection. `inactivity_timeout` default 20 s — reconnect per utterance.

**Leaning:** Option A first; Option B only if latency demands it.

## Voices
Pick voices for EN and SK output during TTS integration; store voice IDs in env/config.
Slovak voice quality — audition (still open).

## Cost notes
- Scribe realtime: ~$0.28/hr audio processed. Silence between sentences bills too (must keep
  streaming for VAD) — acceptable, a few seconds per turn.
- Free tier: 10k credits/mo, monthly reset; per-key spend caps configurable at key creation.
- TTS: per character; Flash is the cheap tier.

## Open questions
1. `keyterms` — does biasing toward family names / common Slovak words help decode quality?
2. `filter_background_audio` — worth testing at a real dinner table.
3. Slovak voice quality for TTS — audition voices.
4. Single-use token REST call body (TTL config?) — still unchecked, defaults fine so far.
5. LLM translation step: provider undecided (Claude Haiku vs GPT-4o-mini class). Prompt must
   handle "eastern-Slovak possibly transcribed in Polish/other orthography → reconstruct proper
   Slovak + translate to English" and the reverse direction.
