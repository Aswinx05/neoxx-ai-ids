import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function predictThreats(data: any[]) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
        You are a Network Intrusion Detection System (NIDS) powered by a Random Forest model.
        Analyze the following network packet data and classify each packet as "Normal" or "Attack".
        
        Data:
        ${JSON.stringify(data.slice(0, 20))}
        
        Return a JSON array of boolean values where true means "Attack" and false means "Normal".
        The length of the array must match the length of the input data.
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.BOOLEAN,
          },
        },
      },
    });

    const results = JSON.parse(response.text || "[]");
    return results;
  } catch (error) {
    console.error("Gemini Prediction Error:", error);
    // Fallback to a deterministic heuristic if Gemini fails
    return data.map(p => (p.size > 1500 || p.proto === 1) ? true : false);
  }
}

export async function analyzeCSV(csvContent: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
        You are a Network Intrusion Detection System (NIDS) expert.
        Analyze the following CSV data (NSL-KDD format) and provide a summary of the threats detected.
        
        CSV Sample:
        ${csvContent.substring(0, 5000)}
        
        Return a JSON object with the following structure:
        {
          "totalRecords": number,
          "normalCount": number,
          "attackCount": number,
          "attackPercentage": string,
          "featureImportance": [
            { "name": string, "importance": number }
          ]
        }
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            totalRecords: { type: Type.NUMBER },
            normalCount: { type: Type.NUMBER },
            attackCount: { type: Type.NUMBER },
            attackPercentage: { type: Type.STRING },
            featureImportance: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  importance: { type: Type.NUMBER }
                }
              }
            }
          },
          required: ["totalRecords", "normalCount", "attackCount", "attackPercentage", "featureImportance"]
        },
      },
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini CSV Analysis Error:", error);
    return null;
  }
}
