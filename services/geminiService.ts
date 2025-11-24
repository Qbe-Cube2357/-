import { GoogleGenAI, Type, Schema, Chat } from "@google/genai";
import { FinalResult, TurnResponse, Language } from "../types";

const apiKey = process.env.API_KEY;

if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });
const MODEL_NAME = "gemini-2.5-flash";

// Schema for the turn-by-turn interview interaction
const turnSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    evaluation: {
      type: Type.STRING,
      description: "Short constructive feedback on the candidate's last answer (max 2 sentences). Empty if first question.",
    },
    nextQuestion: {
      type: Type.STRING,
      description: "The next interview question. Drill down if previous answer was vague, otherwise move to new topic.",
    },
  },
  required: ["evaluation", "nextQuestion"],
};

// Schema for the final report
const finalReportSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    score: {
      type: Type.INTEGER,
      description: "Score from 0 to 100 based on performance.",
    },
    summary: {
      type: Type.STRING,
      description: "Professional summary of the session.",
    },
    goodPoints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3 key strengths observed.",
    },
    badPoints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3 key areas for improvement.",
    },
    advice: {
      type: Type.STRING,
      description: "Specific actionable advice for next time.",
    },
  },
  required: ["score", "summary", "goodPoints", "badPoints", "advice"],
};

let chatSession: Chat | null = null;

const getSystemInstruction = (lang: Language): string => {
  if (lang === 'en') {
    return `You are a professional HR interviewer at a top-tier global company. 
    Conduct a mock interview.
    Your goal is to evaluate the candidate's soft skills, logical thinking, and enthusiasm.
    Speak in English.
    Start with a standard introductory question (e.g., self-intro).
    Output JSON only.`;
  } else {
    return `あなたは日本の一流企業のプロフェッショナルで、厳格かつ公正な人事面接官です。
    模擬面接を行ってください。
    あなたの目標は、候補者のソフトスキル、論理的思考力、そして熱意を評価することです。
    日本語で話してください。
    標準的な導入の質問（自己紹介や志望動機など）から始めてください。
    出力はJSON形式のみとしてください。`;
  }
};

export const geminiService = {
  /**
   * Starts a new interview session.
   */
  startSession: async (lang: Language): Promise<TurnResponse> => {
    chatSession = ai.chats.create({
      model: MODEL_NAME,
      config: {
        systemInstruction: getSystemInstruction(lang),
        responseMimeType: "application/json",
        responseSchema: turnSchema,
      },
    });

    try {
      const startMsg = lang === 'en' 
        ? "Please start the interview. Give me the first question."
        : "面接を開始してください。最初の質問をお願いします。";

      const response = await chatSession.sendMessage({
        message: startMsg,
      });
      
      const text = response.text;
      if (!text) throw new Error("No response from AI");
      return JSON.parse(text) as TurnResponse;
    } catch (error) {
      console.error("Error starting session:", error);
      throw error;
    }
  },

  /**
   * Sends the user's answer and gets the evaluation + next question.
   */
  sendAnswer: async (userAnswer: string): Promise<TurnResponse> => {
    if (!chatSession) throw new Error("Session not started");

    try {
      const response = await chatSession.sendMessage({
        message: `Candidate Answer: "${userAnswer}". \n\nProvide short evaluation and next question.`,
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI");
      return JSON.parse(text) as TurnResponse;
    } catch (error) {
      console.error("Error processing answer:", error);
      throw error;
    }
  },

  /**
   * Generates the final report based on the chat history.
   */
  generateFinalReport: async (history: { question: string; answer: string; evaluation?: string }[], lang: Language): Promise<FinalResult> => {
    const transcriptText = history.map((h, i) => 
      `Q${i+1}: ${h.question}\nA${i+1}: ${h.answer}\n(Eval: ${h.evaluation})`
    ).join("\n\n");

    const prompt = lang === 'en'
      ? `The interview is over. Here is the transcript:\n\n${transcriptText}\n\nAnalyze the candidate's performance and create a final report in English.`
      : `面接が終了しました。以下はトランスクリプトです:\n\n${transcriptText}\n\n候補者の全体的なパフォーマンスを分析し、日本語で最終レポートを作成してください。`;

    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: finalReportSchema,
        }
      });

      const text = response.text;
      if (!text) throw new Error("No final report generated");
      return JSON.parse(text) as FinalResult;

    } catch (error) {
      console.error("Error generating final report:", error);
      return {
        score: 0,
        summary: lang === 'en' ? "Error generating report." : "レポートの生成中にエラーが発生しました。",
        goodPoints: [],
        badPoints: [],
        advice: lang === 'en' ? "Please try again." : "もう一度お試しください。"
      };
    }
  },
};