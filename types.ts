export enum AppStatus {
  IDLE = 'IDLE',
  SETUP = 'SETUP',
  INITIALIZING = 'INITIALIZING',
  INTERVIEW_ACTIVE = 'INTERVIEW_ACTIVE',
  PROCESSING_ANSWER = 'PROCESSING_ANSWER',
  FINISHED = 'FINISHED',
}

export type Language = 'ja' | 'en';

export interface InterviewQnA {
  id: number;
  question: string;
  answer: string;
  evaluation?: string; // Feedback on the specific answer
}

export interface FinalResult {
  score: number;
  summary: string;
  goodPoints: string[];
  badPoints: string[];
  advice: string;
}

export interface InterviewState {
  status: AppStatus;
  timeLimitMinutes: number;
  timeLeftSeconds: number;
  currentTranscript: string;
  qnaHistory: InterviewQnA[];
  finalResult: FinalResult | null;
  isMicActive: boolean;
  error: string | null;
  // New fields
  language: Language;
  isCameraOn: boolean;
}

// Gemini Response Schemas
export interface TurnResponse {
  evaluation: string;
  nextQuestion: string;
}