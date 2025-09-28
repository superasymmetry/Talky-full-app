import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

export async function generateWords(category) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  console.log(genAI);

  const prompt = `Generate 12 simple English words for kids that match this category: ${category}.
  Return them as a JSON array of strings. Example: ["cat", "dog", "log"].`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    return JSON.parse(text);
  } catch {
    // fallback: split by line/space
    return text.split(/\s+/).slice(0, 12);
  }
}
