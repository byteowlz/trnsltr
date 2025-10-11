import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Settings, Languages, Wifi, WifiOff } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { translateText } from '@/services/translation';
import { TTSService } from '@/services/tts';
import { getConfig } from '@/config/app-config';

interface TranslationSegment {
  id: string;
  original: string;
  translated: string;
  timestamp: Date;
}

interface EarsMessage {
  type: 'word' | 'final' | 'error' | 'whisper_processing' | 'whisper_complete';
  word?: string;
  start_time?: number;
  end_time?: number | null;
  text?: string;
  words?: Array<{ word: string; start_time: number; end_time: number | null }>;
  message?: string;
  sentence_id?: string;
  original_text?: string;
  corrected_text?: string;
  confidence?: number;
  changed?: boolean;
}

const TranslationApp = () => {
  const [isListening, setIsListening] = useState(false);
  const [originalLanguage, setOriginalLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('es');
  const [segments, setSegments] = useState<TranslationSegment[]>([]);
  const [currentOriginal, setCurrentOriginal] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [isTtsConnected, setIsTtsConnected] = useState(false);

  const websocket = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef<number>(0);
  const maxReconnectAttempts = 5;
  const audioContext = useRef<AudioContext | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const audioProcessor = useRef<ScriptProcessorNode | null>(null);
  const pendingTranslations = useRef<Set<string>>(new Set());
  const originalScrollRef = useRef<HTMLDivElement>(null);
  const translationScrollRef = useRef<HTMLDivElement>(null);
  const translationTimer = useRef<NodeJS.Timeout | null>(null);
  const originalLanguageRef = useRef<string>(originalLanguage);
  const targetLanguageRef = useRef<string>(targetLanguage);
  const ttsService = useRef<TTSService | null>(null);
  const ttsEnabledRef = useRef<boolean>(false);
  const config = getConfig();

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ar', name: 'Arabic' },
    { code: 'hi', name: 'Hindi' },
  ];

  const connectWebSocket = () => {
    if (websocket.current?.readyState === WebSocket.OPEN || websocket.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    if (websocket.current) {
      websocket.current.close();
      websocket.current = null;
    }

    try {
      setConnectionStatus('Connecting...');
      websocket.current = new WebSocket(config.earsWebSocketUrl);
      
      websocket.current.onopen = () => {
        setIsConnected(true);
        setConnectionStatus('Connected');
        reconnectAttempts.current = 0;
        console.log('Connected to ears WebSocket server');
      };
      
      websocket.current.onmessage = (event) => {
        try {
          const message: EarsMessage = JSON.parse(event.data);
          handleEarsMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      websocket.current.onclose = () => {
        setIsConnected(false);
        setIsListening(false);
        setConnectionStatus('Disconnected');
        console.log('Disconnected from ears WebSocket server');
        
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const backoffDelay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current += 1;
          setConnectionStatus(`Reconnecting in ${backoffDelay/1000}s (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})...`);
          
          reconnectTimeout.current = setTimeout(() => {
            connectWebSocket();
          }, backoffDelay);
        } else {
          setConnectionStatus('Max reconnection attempts reached. Click to retry.');
        }
      };
      
      websocket.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('Error');
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      setConnectionStatus('Failed to connect');
    }
  };

  const detectSentenceEnd = (text: string): boolean => {
    return /[.!?。！？]\s*$/.test(text.trim());
  };

  const countWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  const shouldTriggerTranslation = (text: string): boolean => {
    return detectSentenceEnd(text) || countWords(text) >= config.translationMaxWords;
  };

  const resetTranslationTimer = () => {
    if (translationTimer.current) {
      clearTimeout(translationTimer.current);
      translationTimer.current = null;
    }
  };

  const startTranslationTimer = (text: string) => {
    resetTranslationTimer();
    translationTimer.current = setTimeout(() => {
      if (text.trim()) {
        const segmentId = Date.now().toString();
        setSegments(prevSegments => [...prevSegments, {
          id: segmentId,
          original: text.trim(),
          translated: '',
          timestamp: new Date()
        }]);
        translateAsync(text.trim(), segmentId);
        setCurrentOriginal('');
      }
    }, config.translationTimeoutMs);
  };

  const translateAsync = async (text: string, segmentId: string) => {
    if (pendingTranslations.current.has(segmentId)) {
      return;
    }

    pendingTranslations.current.add(segmentId);
    
    try {
      const currentOriginalLang = originalLanguageRef.current;
      const currentTargetLang = targetLanguageRef.current;
      
      const sourceLanguageName = languages.find(l => l.code === currentOriginalLang)?.name || currentOriginalLang;
      const targetLanguageName = languages.find(l => l.code === currentTargetLang)?.name || currentTargetLang;
      
      console.log('=== Translation Request ===');
      console.log('Source Language Code:', currentOriginalLang);
      console.log('Target Language Code:', currentTargetLang);
      console.log('Source Language Name:', sourceLanguageName);
      console.log('Target Language Name:', targetLanguageName);
      console.log('Text to translate:', text);
      
      const result = await translateText({
        text,
        sourceLanguage: sourceLanguageName,
        targetLanguage: targetLanguageName,
      });

      console.log('Translation Result:', result.translatedText);

      if (result.error) {
        console.error('Translation error:', result.error);
        return;
      }

      setSegments(prev => 
        prev.map(seg => 
          seg.id === segmentId 
            ? { ...seg, translated: result.translatedText }
            : seg
        )
      );

      console.log('[TranslationApp] TTS enabled:', ttsEnabledRef.current, 'TTS connected:', ttsService.current?.isConnected(), 'Text:', result.translatedText);
      
      if (ttsEnabledRef.current && ttsService.current?.isConnected() && result.translatedText) {
        try {
          console.log('[TranslationApp] Calling TTS speak for language:', currentTargetLang);
          await ttsService.current.speak(result.translatedText, currentTargetLang);
          console.log('[TranslationApp] TTS speak completed');
        } catch (error) {
          console.error('[TranslationApp] TTS playback error:', error);
        }
      }
    } catch (error) {
      console.error('Translation failed:', error);
    } finally {
      pendingTranslations.current.delete(segmentId);
    }
  };

  const handleEarsMessage = async (message: EarsMessage) => {
    if (message.type === 'error') {
      console.error('Ears error:', message.message);
      return;
    }

    if (message.type === 'word' && message.word) {
      setCurrentOriginal(prev => {
        const newText = prev + ' ' + message.word;
        
        if (shouldTriggerTranslation(newText)) {
          resetTranslationTimer();
          const segmentId = Date.now().toString();
          const sentenceText = newText.trim();
          
          setSegments(prevSegments => [...prevSegments, {
            id: segmentId,
            original: sentenceText,
            translated: '',
            timestamp: new Date()
          }]);
          
          translateAsync(sentenceText, segmentId);
          
          return '';
        }
        
        startTranslationTimer(newText);
        return newText;
      });
      return;
    }

    if (message.type === 'final' && message.text) {
      resetTranslationTimer();
      const transcribedText = message.text.trim();
      
      if (transcribedText) {
        const segmentId = Date.now().toString();
        
        setSegments(prevSegments => [...prevSegments, {
          id: segmentId,
          original: transcribedText,
          translated: '',
          timestamp: new Date()
        }]);
        
        translateAsync(transcribedText, segmentId);
      }
      
      setCurrentOriginal('');
    }
  };

  const sendWebSocketMessage = (message: any) => {
    if (websocket.current?.readyState === WebSocket.OPEN) {
      websocket.current.send(JSON.stringify(message));
    }
  };

  useEffect(() => {
    originalLanguageRef.current = originalLanguage;
  }, [originalLanguage]);

  useEffect(() => {
    targetLanguageRef.current = targetLanguage;
  }, [targetLanguage]);

  const initTTS = async () => {
    console.log('[TranslationApp] Initializing TTS with URL:', config.ttsWebSocketUrl);
    
    if (!ttsService.current) {
      ttsService.current = new TTSService(config.ttsWebSocketUrl);
    }
    
    try {
      await ttsService.current.connect();
      setIsTtsConnected(true);
      console.log('[TranslationApp] Connected to TTS server');
    } catch (error) {
      console.error('[TranslationApp] Failed to connect to TTS server:', error);
      setIsTtsConnected(false);
    }
  };

  const toggleTTS = async () => {
    console.log('[TranslationApp] toggleTTS - current state:', ttsEnabled);
    
    if (!ttsEnabled) {
      await initTTS();
      setTtsEnabled(true);
      ttsEnabledRef.current = true;
      console.log('[TranslationApp] TTS enabled');
    } else {
      setTtsEnabled(false);
      ttsEnabledRef.current = false;
      if (ttsService.current) {
        ttsService.current.disconnect();
        setIsTtsConnected(false);
      }
      console.log('[TranslationApp] TTS disabled');
    }
  };

  useEffect(() => {
    connectWebSocket();
    
    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      resetTranslationTimer();
      stopAudioCapture();
      if (websocket.current) {
        websocket.current.close();
      }
      if (ttsService.current) {
        ttsService.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    if (originalScrollRef.current) {
      originalScrollRef.current.scrollTop = originalScrollRef.current.scrollHeight;
    }
  }, [segments, currentOriginal]);

  useEffect(() => {
    if (translationScrollRef.current) {
      translationScrollRef.current.scrollTop = translationScrollRef.current.scrollHeight;
    }
  }, [segments]);

const resample = (samples: Float32Array, fromRate: number, toRate: number): Float32Array => {
  if (fromRate === toRate) {
    return samples;
  }
  
  const ratio = fromRate / toRate;
  const newLength = Math.round(samples.length / ratio);
  const result = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, samples.length - 1);
    const t = srcIndex - srcIndexFloor;
    
    result[i] = samples[srcIndexFloor] * (1 - t) + samples[srcIndexCeil] * t;
  }
  
  return result;
};

const startAudioCapture = async () => {
  try {
    if (audioContext.current) {
      audioContext.current.close();
    }
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });
    
    mediaStream.current = stream;
    
    audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    const source = audioContext.current.createMediaStreamSource(mediaStream.current);
    audioProcessor.current = audioContext.current.createScriptProcessor(4096, 1, 1);
    
    audioProcessor.current.onaudioprocess = (e) => {
      if (websocket.current?.readyState === WebSocket.OPEN) {
        const inputSamples = e.inputBuffer.getChannelData(0);
        const inputSampleRate = audioContext.current!.sampleRate;
        const targetSampleRate = 24000;
        
        const resampled = resample(inputSamples, inputSampleRate, targetSampleRate);
        websocket.current.send(resampled.buffer);
      }
    };
    
    source.connect(audioProcessor.current);
    audioProcessor.current.connect(audioContext.current.destination);
  } catch (error) {
    console.error('Failed to start audio capture:', error);
    setIsListening(false);
  }
};

  const stopAudioCapture = () => {
    if (audioProcessor.current) {
      audioProcessor.current.disconnect();
      audioProcessor.current = null;
    }
    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach(track => track.stop());
      mediaStream.current = null;
    }
    if (audioContext.current) {
      audioContext.current.close();
      audioContext.current = null;
    }
  };

  const toggleListening = async () => {
    if (!isConnected) {
      reconnectAttempts.current = 0;
      connectWebSocket();
      return;
    }
    
    if (isListening) {
      resetTranslationTimer();
      stopAudioCapture();
      sendWebSocketMessage({ type: 'stop' });
      setIsListening(false);
    } else {
      setSegments([]);
      setCurrentOriginal('');
      await startAudioCapture();
      setIsListening(true);
    }
  };

  const clearHistory = () => {
    resetTranslationTimer();
    setSegments([]);
    setCurrentOriginal('');
  };

  return (
    <div className="min-h-screen bg-gray-900 font-jetbrains">
      <div className="bg-gray-800/80 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gray-700 rounded-lg">
                <Languages className="h-6 w-6 text-gray-100" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-100">RealTime Translator</h1>
                <p className="text-sm text-gray-400">Live speech translation</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <Badge variant={isConnected ? "default" : "destructive"} className="flex items-center space-x-1">
                {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                <span className="text-xs">{connectionStatus}</span>
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={clearHistory}
                className="hidden sm:inline-flex bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600 hover:text-gray-100"
              >
                Clear History
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowSettings(!showSettings)}
                className="bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600 hover:text-gray-100"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700 mb-6">
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Ears WebSocket Server:</label>
                <input 
                  type="text" 
                  value={config.earsWebSocketUrl} 
                  disabled 
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-gray-400 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">TTS WebSocket Server:</label>
                <input 
                  type="text" 
                  value={config.ttsWebSocketUrl} 
                  disabled 
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-gray-400 text-sm"
                />
                <div className="flex items-center space-x-2">
                  <Badge variant={isTtsConnected ? "default" : "secondary"} className="text-xs">
                    {isTtsConnected ? 'Connected' : 'Disconnected'}
                  </Badge>
                  <span className="text-xs text-gray-400">
                    (Kokorox TTS - Optional)
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Local LLM Model:</label>
                <input 
                  type="text" 
                  value={config.localLlmModel} 
                  disabled 
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-gray-400 text-sm"
                />
              </div>
              <p className="text-xs text-gray-400">
                Configure these settings in your .env file
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-8 mb-8">
          <div className="flex items-center space-x-3">
            <label className="text-sm font-medium text-gray-300">From:</label>
            <Select value={originalLanguage} onValueChange={setOriginalLanguage}>
              <SelectTrigger className="w-32 bg-gray-800 border-gray-600 text-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                {languages.map(lang => (
                  <SelectItem key={lang.code} value={lang.code} className="text-gray-200 focus:bg-gray-700">
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center space-x-3">
            <label className="text-sm font-medium text-gray-300">To:</label>
            <Select value={targetLanguage} onValueChange={setTargetLanguage}>
              <SelectTrigger className="w-32 bg-gray-800 border-gray-600 text-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                {languages.map(lang => (
                  <SelectItem key={lang.code} value={lang.code} className="text-gray-200 focus:bg-gray-700">
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-center mb-8">
          <Button
            onClick={toggleListening}
            size="lg"
            disabled={!isConnected && connectionStatus !== 'Connecting...'}
            className={`rounded-full w-20 h-20 ${
              isListening 
                ? 'bg-red-600 hover:bg-red-700 animate-pulse' 
                : !isConnected
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {isListening ? (
              <MicOff className="h-8 w-8 text-white" />
            ) : (
              <Mic className="h-8 w-8 text-white" />
            )}
          </Button>
        </div>

        <div className="text-center mb-8">
          <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
            isListening 
              ? 'bg-red-900/30 text-red-400 border border-red-800' 
              : !isConnected
              ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-800'
              : 'bg-gray-800 text-gray-400 border border-gray-700'
          }`}>
            <div className={`w-2 h-2 rounded-full mr-2 ${
              isListening ? 'bg-red-500 animate-pulse' 
              : !isConnected ? 'bg-yellow-500 animate-pulse'
              : 'bg-gray-500'
            }`} />
            {isListening ? 'Listening...' 
             : !isConnected ? 'Connecting to server...' 
             : 'Click to start listening'}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto">
          <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700 h-96">
            <CardContent className="p-6 h-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-100">Original</h3>
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-200 hover:bg-gray-700">
                  <Volume2 className="h-4 w-4" />
                </Button>
              </div>
              <div ref={originalScrollRef} className="overflow-y-auto space-y-4 pr-2" style={{ height: 'calc(100% - 3rem)' }}>
                {segments.map(segment => (
                  <div key={segment.id} className="p-3 bg-gray-700/50 rounded-lg border border-gray-600">
                    <p className="text-gray-100 leading-relaxed">{segment.original}</p>
                    <p className="text-xs text-gray-400 mt-1 font-mono">
                      {segment.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                ))}
                {currentOriginal && (
                  <div className="p-3 bg-gray-600 rounded-lg border-2 border-gray-500">
                    <p className="text-gray-100 leading-relaxed">{currentOriginal}</p>
                    <div className="flex items-center mt-2">
                      <div className="w-1 h-4 bg-gray-300 animate-pulse rounded" />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 backdrop-blur-sm border-gray-700 h-96">
            <CardContent className="p-6 h-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-100">Translation</h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={toggleTTS}
                  className={`${
                    ttsEnabled 
                      ? 'text-green-400 hover:text-green-300' 
                      : 'text-gray-400 hover:text-gray-200'
                  } hover:bg-gray-700`}
                  title={ttsEnabled ? 'Disable TTS' : 'Enable TTS'}
                >
                  {ttsEnabled && isTtsConnected ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
              </div>
              <div ref={translationScrollRef} className="overflow-y-auto space-y-4 pr-2" style={{ height: 'calc(100% - 3rem)' }}>
                {segments.map(segment => (
                  <div key={segment.id} className="p-3 bg-gray-700/50 rounded-lg border border-gray-600">
                    {segment.translated ? (
                      <p className="text-gray-100 leading-relaxed">{segment.translated}</p>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <p className="text-gray-400 leading-relaxed">Translating...</p>
                        <div className="w-1 h-4 bg-gray-300 animate-pulse rounded" />
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-1 font-mono">
                      {segment.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="max-w-2xl mx-auto mt-8 p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
          <p className="text-sm text-gray-300 text-center leading-relaxed">
            <strong className="text-gray-200">Real-time Translation:</strong> Connected to ears WebSocket server 
            for speech recognition and using local LLM ({config.localLlmModel}) for translation.
            {!isConnected && (
              <span className="block mt-2 text-yellow-400">
                <strong>Note:</strong> Make sure to start the ears WebSocket server at {config.earsWebSocketUrl}
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

export default TranslationApp;
