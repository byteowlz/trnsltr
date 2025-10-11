interface TTSMessage {
  type: 'voices' | 'voice_changed' | 'language_changed' | 'synthesis_started' | 'audio_chunk' | 'synthesis_completed' | 'error';
  voice?: string;
  voices?: string[];
  chunk?: string;
  index?: number;
  total?: number;
  sample_rate?: number;
}

interface TTSQueueItem {
  text: string;
  language?: string;
  resolve: () => void;
  reject: (error: Error) => void;
}

export class TTSService {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private audioQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private currentVoice: string = 'af_sky';
  private availableVoices: string[] = [];
  private textQueue: TTSQueueItem[] = [];
  private isProcessing = false;

  constructor(private wsUrl: string) {}

  private getVoiceForLanguage(languageCode: string): string {
    const voiceMap: Record<string, string> = {
      'en': 'af_sky',
      'es': 'ef_dora',
      'fr': 'ff_siwis',
      'de': 'af_sky',
      'it': 'if_sara',
      'pt': 'pf_dora',
      'ru': 'af_sky',
      'ja': 'jf_alpha',
      'ko': 'af_sky',
      'zh': 'zf_xiaoni',
      'ar': 'af_sky',
      'hi': 'hf_alpha',
    };

    return voiceMap[languageCode] || 'af_sky';
  }

  private getKokoroxLanguage(languageCode: string): string {
    const languageMap: Record<string, string> = {
      'en': 'en-us',
      'es': 'es',
      'fr': 'fr',
      'de': 'de',
      'it': 'it',
      'pt': 'pt-br',
      'ru': 'en-us',
      'ja': 'ja',
      'ko': 'en-us',
      'zh': 'zh-cn',
      'ar': 'en-us',
      'hi': 'hi',
    };

    return languageMap[languageCode] || 'en-us';
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          this.ws?.send(JSON.stringify({ command: 'list_voices' }));
          resolve();
        };

        this.ws.onmessage = (event) => {
          const message: TTSMessage = JSON.parse(event.data);
          this.handleMessage(message);
        };

        this.ws.onerror = (error) => {
          console.error('TTS WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('TTS WebSocket closed');
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(message: TTSMessage) {
    console.log('[TTS] Received message:', message.type);
    
    switch (message.type) {
      case 'voices':
        if (message.voices) {
          this.availableVoices = message.voices;
          console.log('[TTS] Available voices:', this.availableVoices.length);
        }
        if (message.voice) {
          this.currentVoice = message.voice;
          console.log('[TTS] Current voice:', this.currentVoice);
        }
        break;

      case 'voice_changed':
        if (message.voice) {
          this.currentVoice = message.voice;
          console.log('[TTS] Voice changed to:', this.currentVoice);
        }
        break;

      case 'language_changed':
        console.log('[TTS] Language changed');
        break;

      case 'synthesis_started':
        console.log('[TTS] Synthesis started');
        break;

      case 'audio_chunk':
        if (message.chunk) {
          console.log('[TTS] Received audio chunk', message.index, 'of', message.total);
          this.handleAudioChunk(message.chunk);
        }
        break;

      case 'synthesis_completed':
        console.log('[TTS] Synthesis completed');
        if (this.textQueue.length > 0) {
          const item = this.textQueue.shift();
          console.log('[TTS] Removed item from queue, remaining:', this.textQueue.length);
          item?.resolve();
        }
        this.isProcessing = false;
        this.processNextInQueue();
        break;

      case 'error':
        console.error('[TTS] Synthesis error');
        this.isProcessing = false;
        if (this.textQueue.length > 0) {
          const item = this.textQueue.shift();
          item?.reject(new Error('TTS synthesis failed'));
        }
        this.processNextInQueue();
        break;
    }
  }

  private async handleAudioChunk(base64Chunk: string) {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log('[TTS] AudioContext created, sample rate:', this.audioContext.sampleRate, 'state:', this.audioContext.state);
      }

      if (this.audioContext.state === 'suspended') {
        console.log('[TTS] Resuming suspended AudioContext');
        await this.audioContext.resume();
        console.log('[TTS] AudioContext resumed, state:', this.audioContext.state);
      }

      console.log('[TTS] Decoding audio chunk, length:', base64Chunk.length);
      const binaryString = atob(base64Chunk);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      console.log('[TTS] Audio data size:', bytes.length, 'bytes');
      const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer);
      console.log('[TTS] Audio decoded, duration:', audioBuffer.duration, 'seconds');
      
      this.audioQueue.push(audioBuffer);

      if (!this.isPlaying) {
        console.log('[TTS] Starting playback');
        this.playNextChunk();
      }
    } catch (error) {
      console.error('[TTS] Failed to decode audio chunk:', error);
    }
  }

  private playNextChunk() {
    if (this.audioQueue.length === 0) {
      console.log('[TTS] Audio queue empty, playback finished');
      this.isPlaying = false;
      return;
    }

    console.log('[TTS] Playing chunk, queue length:', this.audioQueue.length);
    this.isPlaying = true;
    const audioBuffer = this.audioQueue.shift()!;
    const source = this.audioContext!.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext!.destination);

    source.onended = () => {
      console.log('[TTS] Chunk playback ended');
      this.playNextChunk();
    };

    console.log('[TTS] Starting audio source');
    source.start(0);
  }

  async setVoice(voice: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('TTS WebSocket not connected');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Voice change timeout')), 5000);

      const originalHandler = this.ws!.onmessage;
      this.ws!.onmessage = (event) => {
        const message: TTSMessage = JSON.parse(event.data);
        if (message.type === 'voice_changed') {
          clearTimeout(timeout);
          this.ws!.onmessage = originalHandler;
          resolve();
        } else if (message.type === 'error') {
          clearTimeout(timeout);
          this.ws!.onmessage = originalHandler;
          reject(new Error('Failed to set voice'));
        }
        originalHandler?.call(this.ws, event);
      };

      this.ws.send(JSON.stringify({ command: 'set_voice', voice }));
    });
  }

  private async processNextInQueue() {
    if (this.isProcessing || this.textQueue.length === 0) {
      console.log('[TTS] processNextInQueue - isProcessing:', this.isProcessing, 'queueLength:', this.textQueue.length);
      return;
    }

    this.isProcessing = true;
    const item = this.textQueue[0];

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[TTS] WebSocket not connected');
      this.textQueue.shift();
      item.reject(new Error('TTS WebSocket not connected'));
      this.isProcessing = false;
      return;
    }

    const command: any = { 
      command: 'synthesize', 
      text: item.text 
    };
    
    if (item.language) {
      command.language = item.language;
      console.log('[TTS] Sending synthesize command with voice:', this.currentVoice, 'language:', item.language, 'text:', item.text.substring(0, 50));
    } else {
      console.log('[TTS] Sending synthesize command with voice:', this.currentVoice, 'text:', item.text.substring(0, 50));
    }
    
    this.ws.send(JSON.stringify(command));
  }

  async speak(text: string, languageCode?: string): Promise<void> {
    console.log('[TTS] speak() called with text:', text.substring(0, 50), 'language:', languageCode);
    
    const kokoroxLang = languageCode ? this.getKokoroxLanguage(languageCode) : undefined;
    
    if (languageCode && kokoroxLang) {
      const voice = this.getVoiceForLanguage(languageCode);
      console.log('[TTS] Selected voice for language', languageCode, ':', voice);
      console.log('[TTS] Kokorox language code:', kokoroxLang);
      console.log('[TTS] Current voice:', this.currentVoice);
      console.log('[TTS] Voice available?', this.availableVoices.includes(voice));
      
      if (voice !== this.currentVoice) {
        if (this.availableVoices.includes(voice)) {
          console.log('[TTS] Changing voice from', this.currentVoice, 'to', voice);
          try {
            await this.setVoice(voice);
          } catch (error) {
            console.error('[TTS] Failed to set voice:', error);
          }
        } else {
          console.warn('[TTS] Voice', voice, 'not available. Available voices:', this.availableVoices.slice(0, 10));
        }
      } else {
        console.log('[TTS] Already using correct voice:', voice);
      }
    }

    return new Promise((resolve, reject) => {
      console.log('[TTS] Adding text to queue with language:', kokoroxLang);
      this.textQueue.push({ text, language: kokoroxLang, resolve, reject });
      if (!this.isProcessing) {
        console.log('[TTS] Processing queue immediately');
        this.processNextInQueue();
      } else {
        console.log('[TTS] Already processing, text queued');
      }
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.audioQueue = [];
    this.textQueue = [];
    this.isPlaying = false;
    this.isProcessing = false;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
