# TTS Debugging Guide

## Testing TTS

### 1. Test with standalone HTML test page

Open `http://localhost:8082/tts-test.html` in your browser while running `bun dev`.

This page allows you to:
- Connect to the Kokorox TTS server directly
- Test voice selection
- Test text synthesis
- See detailed logs of WebSocket communication

### 2. Check browser console

When using the main app, open browser DevTools console (F12) and look for logs prefixed with `[TTS]` or `[TranslationApp]`.

Expected log sequence when TTS is working:
```
[TranslationApp] toggleTTS - current state: false
[TranslationApp] Initializing TTS with URL: ws://localhost:8766
[TTS] Received message: voices
[TTS] Available voices: 54
[TTS] Current voice: af_heart
[TranslationApp] Connected to TTS server
[TranslationApp] TTS enabled
```

When translation occurs with TTS enabled:
```
[TranslationApp] TTS enabled: true TTS connected: true Text: <translated text>
[TranslationApp] Calling TTS speak for language: es
[TTS] speak() called with text: <translated text> language: es
[TTS] Selected voice for language es : ef_dora
[TTS] Adding text to queue
[TTS] Processing queue immediately
[TTS] Sending synthesize command: {command: 'synthesize', text: '<text>'}
[TTS] Received message: synthesis_started
[TTS] Synthesis started
[TTS] Received message: audio_chunk
[TTS] Received audio chunk 0 of 1
[TTS] Decoding audio chunk, length: <bytes>
[TTS] AudioContext created, sample rate: 48000 state: running
[TTS] Audio data size: <bytes> bytes
[TTS] Audio decoded, duration: <seconds> seconds
[TTS] Starting playback
[TTS] Playing chunk, queue length: 1
[TTS] Starting audio source
[TTS] Chunk playback ended
[TTS] Audio queue empty, playback finished
[TTS] Received message: synthesis_completed
[TTS] Synthesis completed
```

## Common Issues

### 1. No sound but no errors

**Cause**: AudioContext is suspended (browser security policy)

**Solution**: The code now auto-resumes the AudioContext. If still not working, check console for "suspended" state messages.

### 2. WebSocket connection fails

**Cause**: Kokorox TTS server not running or wrong port

**Check**:
- Is `koko --ws` running?
- Is it listening on port 8766?
- Check `.env` file for `VITE_TTS_WS_URL`

### 3. "TTS WebSocket not connected" error

**Cause**: TTS was enabled but connection failed

**Solution**: 
- Check Kokorox server is running
- Check browser console for connection errors
- Try disabling and re-enabling TTS

### 4. Voice not changing

**Cause**: Selected voice not available

**Check**: Console logs will show available voices and attempted voice selection. Unsupported languages default to `af_sky`.

### 5. Audio plays but sounds garbled

**Cause**: Sample rate mismatch or audio decoding issue

**Check**: 
- Console logs show audio duration
- Kokorox should send 24kHz audio
- Browser AudioContext sample rate (usually 44.1kHz or 48kHz)

## Supported Languages

The app auto-selects voices based on target language:

| Language Code | Language | Voice |
|--------------|----------|-------|
| en | English | af_sky |
| es | Spanish | ef_dora |
| fr | French | ff_siwis |
| it | Italian | if_sara |
| pt | Portuguese | pf_dora |
| ja | Japanese | jf_alpha |
| zh | Chinese | zf_xiaoni |
| hi | Hindi | hf_alpha |

Other languages (de, ru, ko, ar) fall back to `af_sky` (English voice).

## Manual Testing

Use the test page to verify Kokorox is working:

1. Start Kokorox: `koko --ws`
2. Start dev server: `bun dev`
3. Open: `http://localhost:8082/tts-test.html`
4. Click "Connect" - should see "Connected to TTS server"
5. Enter text like "Hello world"
6. Select a voice
7. Click "Synthesize" - should hear audio

If the test page works but the main app doesn't, the issue is in the integration, not Kokorox.
