# transcribe.py

Transcribes a YouTube video to a structured JSON transcript using NVIDIA Parakeet TDT (via NeMo) for speech recognition and pyannote.audio for optional speaker diarization.

All heavy work runs locally — no cloud STT costs.

---

## Output format

```json
{
  "url": "https://youtu.be/...",
  "video_id": "dQw4w9WgXcQ",
  "title": "My Podcast Episode",
  "channel": "Some Channel",
  "duration_seconds": 5432,
  "model": "nvidia/parakeet-tdt-0.6b-v2",
  "diarized": true,
  "speakers": ["SPEAKER_00", "SPEAKER_01"],
  "segments": [
    { "start": 0.0,   "end": 4.2,  "text": "Hello and welcome to the show.", "speaker": "SPEAKER_00" },
    { "start": 4.5,   "end": 11.8, "text": "Thanks for having me.",           "speaker": "SPEAKER_01" }
  ],
  "full_text": "Hello and welcome to the show. Thanks for having me. ..."
}
```

`speaker` is omitted from each segment when `--no-diarize` is used.

---

## System dependencies

These must be installed on the host — they are not Python packages.

### ffmpeg

Used to convert downloaded audio to 16 kHz mono WAV before transcription.

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt install ffmpeg
```

### yt-dlp (system binary — optional)

yt-dlp is also installed as a Python package via `requirements.txt`. If you prefer the system binary:

```bash
# macOS
brew install yt-dlp

# Ubuntu / Debian
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod +x /usr/local/bin/yt-dlp
```

---

## Python environment setup

NeMo has a large dependency tree. A dedicated virtual environment is strongly recommended.

### Option A — venv (standard library)

```bash
cd scripts/

python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install PyTorch first — pick the right variant for your hardware:

# Apple Silicon (MPS backend)
pip install torch torchaudio

# Linux + NVIDIA GPU (CUDA 12.1 — check https://pytorch.org for other versions)
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121

# CPU only
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu

# Then install the rest
pip install -r requirements.txt
```

### Option B — conda

```bash
conda create -n transcriber python=3.11 -y
conda activate transcriber

# PyTorch (conda handles CUDA drivers better on Linux)
conda install pytorch torchaudio -c pytorch

pip install -r requirements.txt
```

> **Note:** `nemo_toolkit[asr]` installs approximately 2 GB of dependencies. The Parakeet model weights (~1.2 GB) are downloaded on first use and cached in `~/.cache/huggingface/hub/`.

---

## HuggingFace token (required for diarization)

Speaker diarization uses `pyannote/speaker-diarization-3.1`, which is a gated model.

1. Create a free account at [huggingface.co](https://huggingface.co)
2. Accept the model conditions at [huggingface.co/pyannote/speaker-diarization-3.1](https://huggingface.co/pyannote/speaker-diarization-3.1)
3. Also accept conditions at [huggingface.co/pyannote/segmentation-3.0](https://huggingface.co/pyannote/segmentation-3.0) (a dependency)
4. Generate an access token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)

Pass the token via `--hf-token` or the `HF_TOKEN` environment variable:

```bash
export HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxx
```

If you do not need speaker labels, skip this entirely with `--no-diarize`.

---

## YouTube authentication (cookies)

On a headless server, YouTube often blocks yt-dlp with a "Sign in to confirm you're not a bot" error. The fix is to export your YouTube cookies from a browser you are already logged in with and pass them to the script.

### Step 1 — Export cookies from your browser

Install one of these extensions on the machine where you are logged into YouTube:

- **Chrome / Edge:** [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
- **Firefox:** [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

Navigate to [youtube.com](https://youtube.com), then use the extension to export cookies for the current site. Save the file as `yt-cookies.txt`. It will be in Netscape format, which is what yt-dlp expects.

### Step 2 — Transfer to the server

```bash
scp yt-cookies.txt deploy@hetzner2:~/Projects/Transcribe/yt-cookies.txt
```

### Step 3 — Pass to the script

```bash
# Via argument
python transcribe.py <url> --cookies ~/Projects/Transcribe/yt-cookies.txt --no-diarize --output transcript.json

# Via environment variable (useful to set once in ~/.bashrc or ~/.zshrc)
export YT_COOKIES_FILE=~/Projects/Transcribe/yt-cookies.txt
python transcribe.py <url> --no-diarize --output transcript.json
```

> **Cookie expiry:** YouTube session cookies expire. If the error returns after a few weeks, re-export and re-upload the cookies file.

> **Security:** The cookies file grants full access to your YouTube account. Do not commit it to version control. Add `yt-cookies.txt` to `.gitignore`.

---

## JavaScript runtime for yt-dlp (n-challenge)

YouTube obfuscates its audio download URLs using a JavaScript puzzle called the "n challenge". yt-dlp must solve it at download time or it only sees image formats instead of audio. A JS runtime must be installed on the server.

**Symptom:**
```
WARNING: n challenge solving failed: Some formats may be missing.
WARNING: Only images are available for download.
ERROR: Requested format is not available.
```

### Install Node.js (recommended — likely already available)

```bash
# Check if already installed
node --version

# If not, install via nvm (works without root)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install --lts

# Or via apt (requires root)
sudo apt install nodejs
```

### Install Deno (yt-dlp's default preference)

```bash
curl -fsSL https://deno.land/install.sh | sh

# Add to PATH (add these lines to ~/.bashrc for persistence)
export DENO_INSTALL="$HOME/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"
source ~/.bashrc
```

### Use with the script

Once installed, pass the runtime name explicitly. The script also automatically adds
`--remote-components ejs:github`, which tells yt-dlp to fetch the challenge solver
script from GitHub — this is required because yt-dlp no longer bundles it.

```bash
python transcribe.py <url> --cookies ~/yt-cookies.txt --js-runtime node --no-diarize --output transcript.json

# Or via environment variable
export YT_JS_RUNTIME=node
```

---

## Model name

The default model is `nvidia/parakeet-tdt-0.6b-v2`. If you are using **Parakeet V3**, check the current model ID on [huggingface.co/nvidia](https://huggingface.co/nvidia) and pass it explicitly:

```bash
python transcribe.py <url> --model nvidia/parakeet-tdt-0.6b-v3
```

The correct model ID to use is the one shown on the HuggingFace model card, not the version number shown in Spokenly's UI (those may differ).

---

## Artifact layout

All output is written under a per-run directory keyed by YouTube video ID:

```
output/
  We7BZVKbCVw/
    transcript.json    ← structured transcript (segments, speakers, metadata)
    transcript.txt     ← plain text (full_text only)
    meta.json          ← video metadata cache (title, channel, duration)
    audio.mp3          ← downloaded audio  (only if --keep-audio)
    audio_16k.wav      ← 16 kHz mono WAV   (only if --keep-audio)
```

If `audio.mp3` or `audio_16k.wav` already exist in the directory, the download
and convert stages are **skipped automatically** on subsequent runs.

## Usage

```
python transcribe.py [url] [options]

Arguments:
  url                    YouTube video URL (omit when using --audio-file + --key)

Options:
  --output-dir DIR       Base directory for artifacts (default: ./output)
  --key ID               Override the run key (default: YouTube video ID)
  --model MODEL          NeMo ASR model ID (default: nvidia/parakeet-tdt-0.6b-v2)
  --cookies PATH         Netscape cookies.txt for YouTube auth (or set YT_COOKIES_FILE)
  --js-runtime RUNTIME   JS runtime for yt-dlp n-challenge, e.g. 'node' (or set YT_JS_RUNTIME)
  --hf-token TOKEN       HuggingFace token for diarization (or set HF_TOKEN)
  --no-diarize           Skip speaker diarization
  --audio-file PATH      Use an existing audio file, skip download
  --keep-audio           Persist audio.mp3 and audio_16k.wav in the artifact directory
  --chunk-minutes N      Split audio into N-min chunks (default: 10)
  --pause-threshold N    Silence gap that starts a new segment (default: 0.8 s)
```

### Examples

```bash
# Basic run — artifacts written to ./output/We7BZVKbCVw/
python transcribe.py https://www.youtube.com/watch?v=We7BZVKbCVw \
  --cookies ~/yt-cookies.txt --js-runtime node --no-diarize

# Re-run the same URL — audio already cached, YouTube not contacted
python transcribe.py https://www.youtube.com/watch?v=We7BZVKbCVw --no-diarize

# Use an already-downloaded audio file
python transcribe.py --audio-file ./We7BZVKbCVw.mp3 --key We7BZVKbCVw --no-diarize

# Use the already-converted WAV (fastest — skips download and convert)
python transcribe.py https://www.youtube.com/watch?v=We7BZVKbCVw \
  --audio-file ./audio_16k.wav --no-diarize

# Custom output directory
python transcribe.py https://youtu.be/XYZ123 --output-dir ~/transcripts --no-diarize

# Keep audio files for later re-processing
python transcribe.py https://youtu.be/XYZ123 --no-diarize --keep-audio

# Adjust segment splitting
python transcribe.py https://youtu.be/XYZ123 --no-diarize --pause-threshold 0.4
```

---

## Expected runtimes

For a 90-minute podcast:

| Hardware | Download | Convert | Transcribe | Diarize | Total |
|----------|----------|---------|------------|---------|-------|
| Mac M-series (MPS) | ~30 s | ~10 s | ~8–12 min | ~4–6 min | ~15–20 min |
| Linux + NVIDIA T4 GPU | ~30 s | ~10 s | ~4–6 min | ~2–3 min | ~7–10 min |
| Hetzner CX33 (CPU-only, 8 GB) | ~30 s | ~10 s | **~16 min** ✓ | ~15–20 min | ~35 min |

> The CPU transcription figure is confirmed on a Hetzner CX33 using Parakeet TDT 0.6B V3 with 5-minute chunking. Real-time factor is ~0.18× (5–6× faster than real-time), which is much better than general RNNT benchmarks suggest.

Model weights are cached after the first run — subsequent runs skip the download.

---

## Troubleshooting

**`yt-dlp: command not found`**
The Python package version is used by default. If you see this error, make sure your venv is activated or install the system binary (see above).

**`ffmpeg: command not found`**
Install ffmpeg via your system package manager (see System dependencies above).

**`NeMo is not installed` or import errors**
Make sure your virtual environment is activated and `nemo_toolkit[asr]` installed successfully. NeMo installation sometimes fails on the first attempt due to dependency conflicts — try `pip install nemo_toolkit[asr] --no-cache-dir`.

**`401 Unauthorized` from pyannote**
Your HuggingFace token is missing or has not been granted access to the model. Follow the HuggingFace token steps above and make sure you accepted both model gates.

**Word timestamps are missing / single-segment output**
Some NeMo versions expose timestamps under different attribute names. The script attempts all known variants and falls back to a single segment. Check your NeMo version with `pip show nemo_toolkit` and ensure it is ≥ 1.23.0.

**Process killed (OOM) during transcription**
The Linux OOM killer terminated the process because the server ran out of RAM. The model weights alone require ~2.5 GB. Audio inference buffers add to this. Two options:

1. **Reduce chunk size** — the script already chunks audio into 10-minute pieces by default. Try smaller chunks:
   ```bash
   python transcribe.py <url> --chunk-minutes 5 ...
   ```

2. **Add swap space** — a temporary fix that trades disk I/O for RAM. Will be slow but prevents kills:
   ```bash
   sudo fallocate -l 8G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   # Make permanent across reboots:
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```
   Check it worked: `free -h`

3. **Upgrade the server** — the model needs at minimum ~4 GB of free RAM to load and run inference. A Hetzner CX21 (4 GB) should work; CX11 (2 GB) will not without swap.
