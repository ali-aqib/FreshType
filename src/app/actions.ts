
"use server";

import { generateTypingText, generateTypingTextWithKey } from "@/ai/flows/generate-typing-text";
import { type GenerateTypingTextInput, type Difficulty } from "@/ai/flows/types";
import { addText, getTextCountByWordLength, getTextsByWordLength, getText, TextRecord, getRandomTextByWordLength } from "@/lib/db";

export type { Difficulty };

const fallbackText = "The quick brown fox jumps over the lazy dog. The five boxing wizards jump quickly. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump. When a user generates a new text using the AI, the app calculates the text's word length category. In the background, the app performs a silent check on the database. If the count is less than one hundred, the new text is saved to the database. If the count is one hundred or more, the app does not save the text to the database and displays no warning or message. Regardless of the storage status, the newly generated text is immediately loaded into the display window.";

function isInvalidApiKeyError(err: unknown): boolean {
  const message = (err as any)?.message || (err as any)?.originalMessage || "";
  const status = (err as any)?.status;
  // Genkit raises FAILED_PRECONDITION when key missing/invalid and mentions API key env in message
  return (
    status === 'FAILED_PRECONDITION' ||
  /API key/i.test(message) || /GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GENAI_API_KEY/i.test(message)
  );
}

export async function getNewText(options: GenerateTypingTextInput & { apiKey?: string }): Promise<Pick<TextRecord, 'id' | 'content' | 'title'>> {
  try {
    const { apiKey, ...genOptions } = options as GenerateTypingTextInput & { apiKey?: string };
    const allowed = [100, 200, 400, 800];
    if (!allowed.includes(genOptions.wordLength)) {
      // Coerce to nearest allowed length
      const nearest = allowed.reduce((a, b) => Math.abs(b - genOptions.wordLength) < Math.abs(a - genOptions.wordLength) ? b : a, allowed[0]);
      genOptions.wordLength = nearest as any;
    }
    // Basic validation to avoid malformed keys (whitespace, non-ASCII, en-dash, etc.)
    const cleanedKey = (apiKey ?? "").trim();
    if (cleanedKey && (/\s/.test(cleanedKey) || /[^\x00-\x7F]/.test(cleanedKey))) {
      throw new Error('INVALID_API_KEY');
    }
    const result = await generateTypingTextWithKey(genOptions, cleanedKey || undefined);
    if (!result.textContent || result.textContent.trim().length < 20) {
      console.warn("AI generated invalid text, using fallback.");
      const title = 'Fallback Text';
      return { id: -1, content: fallbackText, title };
    }
    
  const textCount = await getTextCountByWordLength(options.wordLength);
    const title = result.textContent.split(' ').slice(0, 3).join(' ') + '...';
    let newId = -1;
  if(textCount < 100) {
    newId = await addText(result.textContent, options.wordLength, title);
  }
    
    return { id: newId, content: result.textContent, title };
  } catch (error) {
    const message = (error as any)?.message || '';
    // Genkit or upstream may throw ByteString errors for non-ASCII characters in key
    if (message === 'INVALID_API_KEY' || isInvalidApiKeyError(error) || /ByteString/i.test(message)) {
      // Signal to client so UI can prompt re-entry without closing the dialog
      throw new Error('INVALID_API_KEY');
    }
    console.error("Error generating text with AI:", error);
    const title = 'Fallback Text';
    return { id: -1, content: fallbackText, title };
  }
}

export async function fetchTextsByWordLength(wordLength: number): Promise<Pick<TextRecord, 'id' | 'title'>[]> {
  return await getTextsByWordLength(wordLength);
}

export async function fetchTextById(id: number): Promise<Pick<TextRecord, 'id' | 'content' | 'title'>> {
  const textRecord = await getText(id);
    if (textRecord) {
      return { id: textRecord.id, content: textRecord.content, title: textRecord.title };
    }
    const title = 'Fallback Text';
    return { id: -1, content: fallbackText, title };
}

export async function fetchInitialText(wordLength: number): Promise<Pick<TextRecord, 'id' | 'content' | 'title'>> {
  const allowed = [100, 200, 400, 800];
  const wl = allowed.includes(wordLength) ? wordLength : allowed[0];
  const textRecord = await getRandomTextByWordLength(wl);
    if (textRecord) {
        return { id: textRecord.id, content: textRecord.content, title: textRecord.title };
    }
  const newText = await getNewText({ wordLength: wl as any, difficulty: 'Easy' });
    return { id: newText.id, content: newText.content, title: newText.title };
}
