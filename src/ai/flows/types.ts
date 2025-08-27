'use strict';

/**
 * @fileOverview This file defines shared types for the AI text generation flow.
 */

import {z} from 'genkit';

export const DifficultyEnum = z.enum(['Easy', 'Moderate', 'Hard']);
export type Difficulty = z.infer<typeof DifficultyEnum>;

export const GenerateTypingTextInputSchema = z.object({
  wordLength: z
    .number()
    .describe('The desired word length of the typing text. Options: 100, 200, 400, 800, 1500.'),
  difficulty: DifficultyEnum.describe('The difficulty level of the text to generate.'),
});
export type GenerateTypingTextInput = z.infer<typeof GenerateTypingTextInputSchema>;

export const GenerateTypingTextOutputSchema = z.object({
  textContent: z.string().describe('The generated text content for the typing test.'),
});
export type GenerateTypingTextOutput = z.infer<typeof GenerateTypingTextOutputSchema>;
