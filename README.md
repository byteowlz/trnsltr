# Real-Time Translator

A real-time speech-to-text translation application that uses the eaRS websocket server for speech recognition, AI SDK with local LLM for translation, and optional Kokorox TTS for audio playback.

## Architecture

- **Frontend**: React + TypeScript + Vite
- **Speech Recognition**: eaRS websocket server
- **Translation**: AI SDK with local LLM (Ollama)
- **Text-to-Speech**: Kokorox websocket server (optional)

## Prerequisites

- Bun package manager
- eaRS websocket server running (https://github.com/byteowlz/eaRS)
- Ollama with a model installed (e.g., llama3.2)
- Kokorox websocket server (optional, for TTS - https://github.com/WismutHansen/kokorox)

## Setup

### 1. Install eaRS (Speech-to-Text)

eaRS provides real-time speech recognition using Kyutai's models.

```bash
# Clone and build eaRS
git clone https://github.com/byteowlz/eaRS
cd eaRS

# Build with your platform
cargo build --release                    # CPU
cargo build --release --features metal   # Apple Silicon
cargo build --release --features cuda    # NVIDIA GPU

# Or install directly
cargo install --path .

# Start the server
ears server start --bind 0.0.0.0:8765 --timestamps --vad
```

The eaRS server will run on WebSocket port 8765 by default and provide real-time transcription.

### 2. Install Kokorox (Text-to-Speech, Optional)

Kokorox provides fast, high-quality TTS in multiple languages.

```bash
# Clone kokorox
git clone https://github.com/WismutHansen/kokorox
cd kokorox

# Install dependencies
brew install espeak-ng  # macOS
# or
sudo apt-get install espeak-ng libespeak-ng-dev  # Ubuntu/Debian

# Install Python dependencies and download models
pip install -r scripts/requirements.txt
python scripts/download_voices.py --all

# Build
cargo build --release

# Start the WebSocket server
./target/release/koko websocket --ip 0.0.0.0 --port 8766
```

### 3. Install Ollama (Translation)

Download and install Ollama from https://ollama.ai

```bash
# Install a model
ollama pull llama3.2

# Verify it's running (default port 11434)
curl http://localhost:11434/api/tags
```

### 4. Setup Translation App

```bash
# Install dependencies
bun install

# Create environment file
cp .env.example .env
```

Configure your environment variables in `.env`:

```env
VITE_EARS_WS_URL=ws://localhost:8765
VITE_TTS_WS_URL=ws://localhost:8766
VITE_LLM_BASE_URL=http://localhost:11434/v1
VITE_LLM_MODEL=llama3.2
```

## Running

Start the development server:

```bash
bun dev
```

Build for production:

```bash
bun run build
```

Preview production build:

```bash
bun run preview
```

## Using the System Together

Once all three components are running:

1. **eaRS** listens to your microphone and provides real-time transcription
2. **Translation App** receives transcriptions, translates them using Ollama
3. **Kokorox** (optional) speaks the translated text in the target language

### Starting All Services

```bash
# Terminal 1: Start eaRS
ears server start --bind 0.0.0.0:8765 --timestamps --vad

# Terminal 2: Start Kokorox (optional)
cd kokorox
./target/release/koko websocket --ip 0.0.0.0 --port 8766

# Terminal 3: Start Ollama (usually runs as a service)
# If not already running:
ollama serve

# Terminal 4: Start Translation App
cd trnsltr
bun dev
```

Open your browser to http://localhost:5173 and click the microphone button to start translating.

## eaRS WebSocket Protocol

The application connects to eaRS and expects messages in the following format:

```json
{
  "type": "word" | "final" | "error",
  "word": "transcribed word",
  "text": "complete transcript",
  "start_time": 1.234,
  "end_time": 1.567
}
```

Message types:

- `word`: Live word updates as speech is recognized
- `final`: Complete transcript when speech segment ends
- `error`: Error message from the server

## Translation Flow

1. User clicks the microphone button to start listening
2. App sends `{"type": "start"}` to ears websocket server
3. ears server streams transcriptions back
4. When a final transcription is received, the app uses AI SDK to translate via local LLM
5. Both original and translated text are displayed in the UI

## Configuration

All configuration is handled through environment variables:

- `VITE_EARS_WS_URL`: WebSocket URL for ears server
- `VITE_TTS_WS_URL`: WebSocket URL for Kokorox TTS server (optional)
- `VITE_LLM_BASE_URL`: Base URL for local LLM API (Ollama compatible)
- `VITE_LLM_MODEL`: Model name to use for translation
- `VITE_TRANSLATION_TIMEOUT_MS`: Timeout in milliseconds before triggering translation
- `VITE_TRANSLATION_MAX_WORDS`: Maximum words before auto-triggering translation

## Kokorox Text-to-Speech

The application supports optional text-to-speech playback using Kokorox TTS. Click the speaker icon in the Translation panel to enable/disable TTS.

### WebSocket Protocol

Kokorox accepts JSON commands and streams back audio chunks:

**Commands:**
```json
{"command": "synthesize", "text": "Hello world", "language": "en-us"}
{"command": "set_voice", "voice": "af_sky"}
{"command": "list_voices"}
```

**Responses:**
```json
{"type": "audio_chunk", "chunk": "base64_encoded_wav", "index": 0, "total": 1}
{"type": "synthesis_completed"}
```

### Supported Languages

Languages are auto-detected based on target language:
- English (en): af_sky
- Spanish (es): ef_dora
- French (fr): ff_siwis
- Italian (it): if_sara
- Portuguese (pt): pf_dora
- Japanese (ja): jf_alpha
- Chinese (zh): zf_xiaoni
- Hindi (hi): hf_alpha

View all available voices: `koko voices`

### Usage

1. Start the Kokorox websocket server: `koko websocket --ip 0.0.0.0 --port 8766`
2. Click the speaker icon in the Translation panel to enable TTS
3. Translations will be automatically spoken in the target language

## Additional Resources

- eaRS Documentation: https://github.com/byteowlz/eaRS/blob/main/WEBSOCKET.md
- Kokorox Documentation: https://github.com/WismutHansen/kokorox
- See `WEBSOCKET_STT.md` for detailed eaRS integration
- See `WEBSOCKET_TTS.md` for detailed Kokorox integration
