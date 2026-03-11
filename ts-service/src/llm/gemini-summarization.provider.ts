import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CandidateSummaryInput,
  CandidateSummaryResult,
  RecommendedDecision,
  SummarizationProvider,
} from './summarization-provider.interface';

@Injectable()
export class GeminiSummarizationProvider implements SummarizationProvider {
  private readonly logger = new Logger(GeminiSummarizationProvider.name);
  private readonly apiKey: string;
    private readonly model = 'gemini-2.0-flash';
    private readonly promptVersion = '1.0.0';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.getOrThrow<string>('GEMINI_API_KEY');
  }

  async generateCandidateSummary(input: CandidateSummaryInput): Promise<CandidateSummaryResult> {
    const prompt = this.buildPrompt(input);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    return this.parseResponse(text);
  }

  private buildPrompt(input: CandidateSummaryInput): string {
    const docs = input.documents.join('\n\n---\n\n');
    return `You are a professional recruiter assistant. Analyze the following candidate documents and return a structured JSON summary.

Candidate ID: ${input.candidateId}

Documents:
${docs}

Return ONLY a valid JSON object with no markdown, no backticks, no extra text. The JSON must have exactly these fields:
{
  "score": <integer 0-100>,
  "strengths": [<string>, ...],
  "concerns": [<string>, ...],
  "summary": "<string>",
  "recommendedDecision": "<advance|hold|reject>"
}`;
  }

  private parseResponse(text: string): CandidateSummaryResult {
    const clean = text.replace(/```json|```/g, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(clean);
    } catch {
      this.logger.error('Failed to parse Gemini response', text);
      throw new Error('Invalid JSON response from LLM provider');
    }

    const score = typeof parsed.score === 'number' ? Math.min(100, Math.max(0, parsed.score)) : null;
    const strengths = Array.isArray(parsed.strengths) ? parsed.strengths.filter((s: any) => typeof s === 'string') : [];
    const concerns = Array.isArray(parsed.concerns) ? parsed.concerns.filter((c: any) => typeof c === 'string') : [];
    const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
    const validDecisions: RecommendedDecision[] = ['advance', 'hold', 'reject'];
    const recommendedDecision: RecommendedDecision = validDecisions.includes(parsed.recommendedDecision)
      ? parsed.recommendedDecision
      : 'hold';

    if (score === null || !summary) {
      throw new Error('LLM response missing required fields');
    }

    return { score, strengths, concerns, summary, recommendedDecision };
  }

  getProviderName(): string {
    return `gemini/${this.model}`;
  }

  getPromptVersion(): string {
    return this.promptVersion;
  }
}