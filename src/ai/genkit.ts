import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Prefer server-provided key in production; supports multiple common env names
const GENKI_KEY = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const googlePlugin = GENKI_KEY ? googleAI({ apiKey: GENKI_KEY }) : googleAI();

export const ai = genkit({
  plugins: [googlePlugin],
  model: 'googleai/gemini-2.5-flash',
});
