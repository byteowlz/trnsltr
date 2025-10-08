import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Settings, Languages, Wifi, WifiOff } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { translateText } from '@/services/translation';
import { getConfig } from '@/config/app-config';

interface TranslationSegment {
  id: string;
  original: string;
  translated: string;
  timestamp: Date;
}

interface EarsMessage {
  type: 'transcription' | 'interim' | 'error';
  text?: string;
  is_final?: boolean;
  error?: string;
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
  const [isTranslating, setIsTranslating] = useState(false);
  const websocket = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
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
    if (websocket.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      setConnectionStatus('Connecting...');
      websocket.current = new WebSocket(config.earsWebSocketUrl);
      
      websocket.current.onopen = () => {
        setIsConnected(true);
        setConnectionStatus('Connected');
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
        
        reconnectTimeout.current = setTimeout(() => {
          connectWebSocket();
        }, 3000);
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

  const handleEarsMessage = async (message: EarsMessage) => {
    if (message.type === 'error') {
      console.error('Ears error:', message.error);
      return;
    }

    if (message.type === 'interim' && message.text) {
      setCurrentOriginal(message.text);
      return;
    }

    if (message.type === 'transcription' && message.is_final && message.text) {
      const transcribedText = message.text;
      setCurrentOriginal('');
      setIsTranslating(true);
      
      try {
        const languageName = languages.find(l => l.code === targetLanguage)?.name || targetLanguage;
        const result = await translateText({
          text: transcribedText,
          sourceLanguage: originalLanguage,
          targetLanguage: languageName,
        });

        if (result.error) {
          console.error('Translation error:', result.error);
          return;
        }

        setSegments(prev => [...prev, {
          id: Date.now().toString(),
          original: transcribedText,
          translated: result.translatedText,
          timestamp: new Date()
        }]);
      } catch (error) {
        console.error('Translation failed:', error);
      } finally {
        setIsTranslating(false);
      }
    }
  };

  const sendWebSocketMessage = (message: any) => {
    if (websocket.current?.readyState === WebSocket.OPEN) {
      websocket.current.send(JSON.stringify(message));
    }
  };

  useEffect(() => {
    connectWebSocket();
    
    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (websocket.current) {
        websocket.current.close();
      }
    };
  }, []);

  const toggleListening = () => {
    if (!isConnected) {
      connectWebSocket();
      return;
    }
    
    if (isListening) {
      sendWebSocketMessage({ type: 'stop' });
      setIsListening(false);
    } else {
      setSegments([]);
      setCurrentOriginal('');
      sendWebSocketMessage({ type: 'start' });
      setIsListening(true);
    }
  };

  const clearHistory = () => {
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
              <div className="h-full overflow-y-auto space-y-4">
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
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-200 hover:bg-gray-700">
                  <Volume2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="h-full overflow-y-auto space-y-4">
                {segments.map(segment => (
                  <div key={segment.id} className="p-3 bg-gray-700/50 rounded-lg border border-gray-600">
                    <p className="text-gray-100 leading-relaxed">{segment.translated}</p>
                    <p className="text-xs text-gray-400 mt-1 font-mono">
                      {segment.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                ))}
                {isTranslating && (
                  <div className="p-3 bg-gray-600 rounded-lg border-2 border-gray-500">
                    <p className="text-gray-100 leading-relaxed">Translating...</p>
                    <div className="flex items-center mt-2">
                      <div className="w-1 h-4 bg-gray-300 animate-pulse rounded" />
                    </div>
                  </div>
                )}
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
