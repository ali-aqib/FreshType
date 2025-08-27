
'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating typing texts of a specified length and difficulty using AI.
 *
 * - generateTypingText - A function that generates typing texts using AI.
 */

import {ai} from '@/ai/genkit';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { GenerateTypingTextInputSchema, GenerateTypingTextOutputSchema, type GenerateTypingTextInput, type GenerateTypingTextOutput } from './types';


export async function generateTypingText(input: GenerateTypingTextInput): Promise<GenerateTypingTextOutput> {
  return generateTypingTextFlow(input);
}

// Shared prompt template used by both default and scoped Genkit instances
const PROMPT_TEXT = `You are a content generator for a typing test application. Your task is to create unique and varied practice texts.

Generate a text of approximately {{wordLength}} words on a random topic with {{difficulty}} difficulty.

To ensure variety and a good challenge for the user, please follow these rules:
1.  **Unique Content**: Do not repeat topics or content. Make it fresh and interesting each time.
2.  **Varied Difficulty**: The text should include a mix of simple and more complex sentence structures.
3.  **Difficulty-based Characters**:
    - **Easy**: The text must include a mix of simple words and punctuation. Approximately 10% of the characters should be numbers (0-9) and basic punctuation (e.g., ",", ".", "?", "'").
    - **Moderate**: The text must include more complex words and sentence structures. Approximately 20% of the characters should be numbers (0-9) and a wider range of punctuation (e.g., ",", ".", "?", "'", "<", ">", ":", '"').
    - **Hard**: The text must feature challenging vocabulary and complex sentences. Approximately 20% of the characters should be a mix of alphanumeric characters (e.g., 0-9) and symbols (e.g., "~", "\`", "!", "@", "#", "$", "%", "^", "*", "{", "(", "[", ")", "]", "}"). It should also include varied punctuation.
4.  **Formatting**: The output must be a single, continuous block of text without any titles or headings.

Output only the text content.`;

const prompt = ai.definePrompt({
  name: 'generateTypingTextPrompt',
  input: {schema: GenerateTypingTextInputSchema},
  output: {schema: GenerateTypingTextOutputSchema},
  prompt: PROMPT_TEXT,
});


const generateTypingTextFlow = ai.defineFlow(
  {
    name: 'generateTypingTextFlow',
    inputSchema: GenerateTypingTextInputSchema,
    outputSchema: GenerateTypingTextOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

/**
 * Allows generating typing text with a per-request Gemini API key. When an apiKey is provided,
 * a scoped Genkit instance is created using that key; otherwise the default shared instance is used.
 */
export async function generateTypingTextWithKey(
  input: GenerateTypingTextInput,
  apiKey?: string
): Promise<GenerateTypingTextOutput> {
  if (!apiKey) {
    return generateTypingText(input);
  }

  const scopedAi = genkit({
    plugins: [googleAI({ apiKey })],
    model: 'googleai/gemini-2.5-flash',
  });

  const scopedPrompt = scopedAi.definePrompt({
    name: 'generateTypingTextPromptScoped',
    input: {schema: GenerateTypingTextInputSchema},
    output: {schema: GenerateTypingTextOutputSchema},
    prompt: PROMPT_TEXT,
  });

  const scopedFlow = scopedAi.defineFlow(
    {
      name: 'generateTypingTextFlowScoped',
      inputSchema: GenerateTypingTextInputSchema,
      outputSchema: GenerateTypingTextOutputSchema,
    },
    async (scopedInput) => {
      const { output } = await scopedPrompt(scopedInput);
      return output!;
    }
  );

  return scopedFlow(input);
}
