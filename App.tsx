import React, { useState, useEffect, useRef } from 'react';
import { Camera } from './components/Camera';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { geminiService } from './services/geminiService';
import { AppStatus, InterviewState, InterviewQnA, Language } from './types';
import { 
  MicrophoneIcon, 
  StopIcon, 
  PlayIcon, 
  ClockIcon, 
  CheckCircleIcon, 
  PaperAirplaneIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
  XMarkIcon,
  LanguageIcon
} from '@heroicons/react/24/solid';

// Circular Progress Component
const ScoreGauge: React.FC<{ score: number }> = ({ score }) => {
  const radius = 60;
  const stroke = 8;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-40 h-40 mx-auto">
      <svg
        height={radius * 2}
        width={radius * 2}
        className="rotate-[-90deg] transform"
      >
        <circle
          stroke="#1e293b" // slate-800
          strokeWidth={stroke}
          fill="transparent"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke={score > 70 ? "#3b82f6" : score > 40 ? "#eab308" : "#ef4444"}
          strokeWidth={stroke}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset, transition: 'stroke-dashoffset 1s ease-out' }}
          strokeLinecap="round"
          fill="transparent"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-bold text-white">{score}</span>
        <span className="text-xs text-slate-400">SCORE</span>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [state, setState] = useState<InterviewState>({
    status: AppStatus.IDLE,
    timeLimitMinutes: 5,
    timeLeftSeconds: 0,
    currentTranscript: '',
    qnaHistory: [],
    finalResult: null,
    isMicActive: false,
    error: null,
    language: 'ja',
    isCameraOn: true,
  });

  const { 
    text: speechText, 
    isListening, 
    startListening, 
    stopListening, 
    resetText,
    isSupported: isSpeechSupported 
  } = useSpeechRecognition(state.language);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // -- Effects --

  // Sync Speech Text to State
  useEffect(() => {
    if (state.status === AppStatus.INTERVIEW_ACTIVE) {
      setState(prev => ({ ...prev, currentTranscript: speechText }));
    }
  }, [speechText, state.status]);

  // Timer Logic
  useEffect(() => {
    if (state.status === AppStatus.INTERVIEW_ACTIVE && state.timeLeftSeconds > 0) {
      timerRef.current = setInterval(() => {
        setState(prev => {
          if (prev.timeLeftSeconds <= 1) {
            // Time is up!
            finishInterview();
            return { ...prev, timeLeftSeconds: 0 };
          }
          return { ...prev, timeLeftSeconds: prev.timeLeftSeconds - 1 };
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.status, state.timeLeftSeconds]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.qnaHistory, state.currentTranscript]);

  // -- Handlers --

  const startInterview = async () => {
    if (!process.env.API_KEY) {
      alert("APIキーが設定されていません。");
      return;
    }

    setState(prev => ({
      ...prev,
      status: AppStatus.INITIALIZING,
      timeLeftSeconds: prev.timeLimitMinutes * 60,
      qnaHistory: [],
      finalResult: null,
      error: null
    }));

    try {
      const initialData = await geminiService.startSession(state.language);
      
      const firstQnA: InterviewQnA = {
        id: 1,
        question: initialData.nextQuestion,
        answer: '',
      };

      setState(prev => ({
        ...prev,
        status: AppStatus.INTERVIEW_ACTIVE,
        qnaHistory: [firstQnA],
      }));

      // Auto-start mic if supported
      if (isSpeechSupported) {
        resetText();
        startListening();
      }

    } catch (err) {
      setState(prev => ({ ...prev, status: AppStatus.IDLE, error: "AIセッションの開始に失敗しました。" }));
    }
  };

  const quitInterview = () => {
    stopListening();
    if (timerRef.current) clearInterval(timerRef.current);
    setState(prev => ({ ...prev, status: AppStatus.IDLE, currentTranscript: '' }));
  };

  const submitAnswer = async () => {
    if (state.status !== AppStatus.INTERVIEW_ACTIVE) return;
    if (!state.currentTranscript.trim()) return;

    // Stop listening temporarily
    stopListening();
    
    setState(prev => ({ ...prev, status: AppStatus.PROCESSING_ANSWER }));

    try {
      const currentAnswer = state.currentTranscript;
      const response = await geminiService.sendAnswer(currentAnswer);

      setState(prev => {
        const newHistory = [...prev.qnaHistory];
        // Update current question with answer and eval
        const lastIdx = newHistory.length - 1;
        newHistory[lastIdx] = {
          ...newHistory[lastIdx],
          answer: currentAnswer,
          evaluation: response.evaluation
        };

        // Add next question
        newHistory.push({
          id: newHistory.length + 1,
          question: response.nextQuestion,
          answer: ''
        });

        return {
          ...prev,
          status: AppStatus.INTERVIEW_ACTIVE,
          qnaHistory: newHistory,
          currentTranscript: ''
        };
      });

      // Restart listening for next turn
      resetText();
      startListening();

    } catch (err) {
      setState(prev => ({ ...prev, status: AppStatus.INTERVIEW_ACTIVE, error: "回答の処理に失敗しました。" }));
      startListening();
    }
  };

  const finishInterview = async () => {
    stopListening();
    setState(prev => ({ ...prev, status: AppStatus.PROCESSING_ANSWER })); // Using processing state for loading

    try {
      // Filter out empty last question if unanswered
      const validHistory = state.qnaHistory.filter(q => q.answer.trim() !== '');
      
      const result = await geminiService.generateFinalReport(validHistory, state.language);
      
      setState(prev => ({
        ...prev,
        status: AppStatus.FINISHED,
        finalResult: result
      }));
    } catch (err) {
      setState(prev => ({ ...prev, status: AppStatus.FINISHED, error: "レポートの生成に失敗しました。" }));
    }
  };

  // -- Render Helpers --

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // -- Views --

  if (state.status === AppStatus.IDLE || state.status === AppStatus.SETUP) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 overflow-y-auto">
        <div className="max-w-md w-full bg-slate-900 rounded-2xl p-8 border border-slate-800 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-accent/20 text-accent rounded-full flex items-center justify-center mx-auto mb-4">
               <MicrophoneIcon className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">AI Mock Interview</h1>
            <p className="text-slate-400">リアルタイムAIフィードバック付きの模擬面接</p>
          </div>

          <div className="space-y-6">
            
            {/* Language Selection */}
            <div>
               <label className="block text-sm font-medium text-slate-300 mb-2">言語 / Language</label>
               <div className="grid grid-cols-2 gap-2 bg-slate-800 p-1 rounded-lg">
                  <button 
                    onClick={() => setState(p => ({...p, language: 'ja'}))}
                    className={`py-2 rounded-md text-sm font-bold transition-all ${state.language === 'ja' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    日本語
                  </button>
                  <button 
                    onClick={() => setState(p => ({...p, language: 'en'}))}
                    className={`py-2 rounded-md text-sm font-bold transition-all ${state.language === 'en' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    English
                  </button>
               </div>
            </div>

            {/* Camera Toggle */}
            <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded-xl border border-slate-700">
               <div className="flex items-center gap-3">
                 {state.isCameraOn ? <VideoCameraIcon className="w-5 h-5 text-emerald-400"/> : <VideoCameraSlashIcon className="w-5 h-5 text-slate-500"/>}
                 <span className="text-slate-300 text-sm">カメラ</span>
               </div>
               <button 
                 onClick={() => setState(p => ({...p, isCameraOn: !p.isCameraOn}))}
                 className={`w-12 h-6 rounded-full p-1 transition-colors ${state.isCameraOn ? 'bg-emerald-500' : 'bg-slate-600'}`}
               >
                 <div className={`w-4 h-4 rounded-full bg-white transform transition-transform ${state.isCameraOn ? 'translate-x-6' : 'translate-x-0'}`} />
               </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                制限時間（分）
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={state.timeLimitMinutes}
                onChange={(e) => setState(prev => ({ ...prev, timeLimitMinutes: parseInt(e.target.value) }))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="text-right text-accent font-bold mt-1">
                {state.timeLimitMinutes} 分
              </div>
            </div>

            {!isSpeechSupported && (
               <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                 このブラウザは音声認識をサポートしていません。ChromeまたはEdgeを使用してください。
               </div>
            )}

            <button
              onClick={startInterview}
              disabled={!isSpeechSupported}
              className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all
                ${isSpeechSupported 
                  ? 'bg-accent hover:bg-blue-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)]' 
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
            >
              <PlayIcon className="w-6 h-6" />
              面接開始
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === AppStatus.FINISHED && state.finalResult) {
    return (
      <div className="h-screen w-full bg-slate-950 overflow-y-auto">
        <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 pb-20">
          <div className="text-center pt-8">
            <h2 className="text-3xl font-bold text-white mb-2">面接結果</h2>
            <div className="inline-block px-4 py-1 rounded-full bg-slate-800 text-slate-400 text-sm">
              セッション終了
            </div>
          </div>

          {/* Score Gauge Card */}
          <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800 shadow-xl flex flex-col items-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />
            
            <ScoreGauge score={state.finalResult.score} />

            <p className="mt-6 text-slate-300 max-w-2xl mx-auto leading-relaxed text-center">
              {state.finalResult.summary}
            </p>
          </div>

          {/* Details Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-slate-900/50 rounded-xl p-6 border border-emerald-500/20">
              <h3 className="text-emerald-400 font-bold text-lg mb-4 flex items-center gap-2">
                <CheckCircleIcon className="w-5 h-5" /> 良かった点
              </h3>
              <ul className="space-y-3">
                {state.finalResult.goodPoints.map((p, i) => (
                  <li key={i} className="text-slate-300 text-sm flex gap-2">
                    <span className="text-emerald-500 flex-shrink-0">•</span> <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-slate-900/50 rounded-xl p-6 border border-rose-500/20">
              <h3 className="text-rose-400 font-bold text-lg mb-4 flex items-center gap-2">
                <StopIcon className="w-5 h-5" /> 改善点
              </h3>
              <ul className="space-y-3">
                {state.finalResult.badPoints.map((p, i) => (
                  <li key={i} className="text-slate-300 text-sm flex gap-2">
                    <span className="text-rose-500 flex-shrink-0">•</span> <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
             <h3 className="text-blue-400 font-bold text-lg mb-2">今後のアドバイス</h3>
             <p className="text-slate-300 leading-relaxed">{state.finalResult.advice}</p>
          </div>

          <button
            onClick={() => setState(prev => ({ ...prev, status: AppStatus.IDLE }))}
            className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  // -- Active Interview View --
  return (
    <div className="h-screen flex flex-col md:flex-row bg-slate-950 overflow-hidden relative">
      
      {/* Quit Button (Floating) */}
      <button 
        onClick={quitInterview}
        className="absolute top-4 right-4 z-50 bg-slate-900/80 backdrop-blur text-slate-400 hover:text-white p-2 rounded-lg border border-slate-700 shadow-lg flex items-center gap-2 text-sm font-bold transition-all"
      >
        <XMarkIcon className="w-5 h-5" />
        <span className="hidden md:inline">終了 / Exit</span>
      </button>

      {/* Left Panel: Camera & Status */}
      <div className="w-full md:w-1/2 h-1/2 md:h-full p-4 flex flex-col gap-4 relative">
        
        {/* Timer Overlay */}
        <div className="absolute top-8 left-8 z-10 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-2 shadow-lg">
           <ClockIcon className={`w-5 h-5 ${state.timeLeftSeconds < 60 ? 'text-red-500 animate-pulse' : 'text-accent'}`} />
           <span className="font-mono font-bold text-xl">{formatTime(state.timeLeftSeconds)}</span>
        </div>

        {/* Camera Overlay Button */}
        <div className="absolute top-8 left-36 z-10">
           <button 
              onClick={() => setState(p => ({...p, isCameraOn: !p.isCameraOn}))}
              className="bg-black/60 backdrop-blur-md p-2 rounded-full border border-white/10 text-white hover:bg-black/80 transition-colors"
           >
              {state.isCameraOn ? <VideoCameraIcon className="w-5 h-5" /> : <VideoCameraSlashIcon className="w-5 h-5 text-red-400" />}
           </button>
        </div>

        <div className="flex-1 relative rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-black">
          <Camera isActive={state.isCameraOn} />
          
          {/* Live Transcription Overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/80 to-transparent min-h-[120px] flex flex-col justify-end">
             <div className="text-slate-400 text-xs uppercase tracking-wider mb-1 flex items-center gap-2">
                {isListening ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    Listening...
                  </>
                ) : (
                  <span className="text-slate-500">Mic Paused</span>
                )}
             </div>
             <div className="text-lg md:text-2xl font-medium text-white leading-relaxed">
                {state.currentTranscript || <span className="text-slate-600 italic">回答してください...</span>}
             </div>
          </div>
        </div>

        {/* Controls */}
        <div className="h-20 flex items-center justify-center gap-4">
           <button 
             onClick={() => isListening ? stopListening() : startListening()}
             className={`p-4 rounded-full transition-all ${isListening ? 'bg-slate-800 text-red-400 hover:bg-slate-700' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
           >
             {isListening ? <div className="w-6 h-6 bg-red-500 rounded-sm animate-pulse" /> : <MicrophoneIcon className="w-6 h-6" />}
           </button>

           <button 
             onClick={submitAnswer}
             disabled={!state.currentTranscript.trim() || state.status === AppStatus.PROCESSING_ANSWER}
             className="flex-1 max-w-xs bg-accent hover:bg-blue-600 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white py-3 px-6 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20"
           >
             {state.status === AppStatus.PROCESSING_ANSWER ? (
               <span className="animate-pulse">AI thinking...</span>
             ) : (
               <>
                 Next Question <PaperAirplaneIcon className="w-5 h-5" />
               </>
             )}
           </button>
        </div>
      </div>

      {/* Right Panel: Q&A History */}
      <div className="w-full md:w-1/2 h-1/2 md:h-full bg-slate-900 border-l border-slate-800 flex flex-col">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="w-2 h-8 bg-accent rounded-full" />
            Interview Session
          </h2>
          <span className="text-xs font-bold text-slate-500 border border-slate-700 px-2 py-1 rounded uppercase">
            {state.language === 'en' ? 'English' : '日本語'}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
          {state.status === AppStatus.INITIALIZING && (
             <div className="flex items-center justify-center h-full text-slate-500 animate-pulse">
               面接環境を準備中... / Preparing...
             </div>
          )}

          {state.qnaHistory.map((item, index) => (
            <div key={item.id} className="animate-fade-in-up">
              {/* Question Bubble */}
              <div className="flex flex-col gap-2 mb-4">
                <div className="flex items-center gap-2 text-accent text-sm font-bold uppercase tracking-wide">
                  <span>AI Interviewer</span>
                  <span className="text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-400">Q{index + 1}</span>
                </div>
                <div className="bg-slate-800 text-slate-200 p-4 rounded-2xl rounded-tl-none border border-slate-700 shadow-sm">
                  {item.question}
                </div>
              </div>

              {/* Answer Bubble */}
              {item.answer && (
                <div className="flex flex-col gap-2 items-end mb-6 pl-8">
                  <div className="text-slate-500 text-xs uppercase tracking-wide">You</div>
                  <div className="bg-blue-600/20 text-blue-100 p-4 rounded-2xl rounded-tr-none border border-blue-500/30 shadow-sm">
                    {item.answer}
                  </div>
                  {/* Micro-feedback */}
                  {item.evaluation && (
                    <div className="w-full mt-2 p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-emerald-400 text-sm flex gap-2 items-start">
                      <CheckCircleIcon className="w-4 h-4 mt-0.5 shrink-0" />
                      <span className="italic">{item.evaluation}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          
          {state.status === AppStatus.PROCESSING_ANSWER && (
             <div className="flex flex-col gap-2 mb-4 opacity-50">
                <div className="flex items-center gap-2 text-accent text-sm font-bold">AI Interviewer</div>
                <div className="bg-slate-800 p-4 rounded-2xl rounded-tl-none w-24 h-10 flex items-center gap-1">
                  <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-100" />
                  <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-200" />
                </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
};

export default App;