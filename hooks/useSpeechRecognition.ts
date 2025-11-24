import { useState, useEffect, useCallback, useRef } from 'react';

// Extend Window interface for webkitSpeechRecognition
interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

export const useSpeechRecognition = (language: 'ja' | 'en' = 'ja') => {
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const win = window as unknown as IWindow;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    // Dynamically set language based on prop
    recognition.lang = language === 'en' ? 'en-US' : 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      // For a Q&A session, we want the accumulated result
      const currentContent = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      setText(currentContent);
    };

    recognition.onend = () => {
      if (isListening) {
        // If it stops unexpectedly, update state. 
        // We avoid auto-restart here to prevent infinite loops in some browsers.
        setIsListening(false);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    
    // Cleanup on unmount or language change
    return () => {
      if (recognitionRef.current) {
        try {
            recognitionRef.current.stop();
        } catch(e) {}
      }
    };
  }, [language]); // Re-create recognition if language changes

  // We need to update the isListening dependency ref if we want to restart correctly, 
  // but since we re-create the instance on language change, standard flow applies.

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      try {
        setText('');
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error(e);
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  const resetText = useCallback(() => {
    setText('');
  }, []);

  return {
    text,
    isListening,
    startListening,
    stopListening,
    resetText,
    isSupported
  };
};