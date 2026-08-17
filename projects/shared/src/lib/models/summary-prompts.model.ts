/**
 * Summary prompt definitions shared across UI and providers
 */

export type SummaryStyle = 'concise' | 'detailed' | 'bullet_points' | 'custom';

/**
 * Summary prompts for different styles
 * Used by all AI providers to maintain consistent prompt behavior
 */
export const SUMMARY_PROMPTS: Record<SummaryStyle, string> = {
  concise: 'You are a helpful assistant that summarizes articles in a concise manner. Provide a short, clear summary of the article content. Focus on the main points and key information.',
  detailed: 'You are a helpful assistant that provides detailed summaries of articles. Include important details, context, and supporting information while maintaining clarity.',
  bullet_points: 'You are a helpful assistant that summarizes articles using bullet points. Provide a bulleted list of the main points from the article. Each bullet should be a complete sentence.',
  custom: '', // Will be replaced by custom prompt
};
