import { Router, Request, Response } from 'express';
import { generateQuestionsFromRAG, QuestionConfig } from '../services/rag';
import { generate } from '../services/ollama';
import { z } from 'zod';

export const ragRouter = Router();

const GenerateSchema = z.object({
  subject_id: z.string().uuid(),
  topic_hint: z.string().max(500).default(''),
  configs: z.array(
    z.object({
      type: z.enum(['multiple_choice', 'true_or_false', 'fill_in_the_blank', 'essay', 'matching']),
      difficulty: z.enum(['easy', 'medium', 'hard']),
      count: z.number().int().min(1).max(20),
    }),
  ).min(1),
});

/**
 * POST /api/rag/generate
 * Triggers the full RAG pipeline and returns generated questions.
 * The Go backend calls this, then saves results to Postgres.
 */
ragRouter.post('/generate', async (req: Request, res: Response) => {
  const parsed = GenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { subject_id, topic_hint, configs } = parsed.data;

  try {
    const questions = await generateQuestionsFromRAG(
      subject_id,
      topic_hint,
      configs as QuestionConfig[],
    );

    if (questions.length === 0) {
      return res.status(422).json({
        error: 'The LLM returned no valid questions. Try a different topic, question type, or upload more learning materials.',
      });
    }

    return res.json({ questions });
  } catch (err: any) {
    console.error('RAG generation error:', err);
    const message = err?.message ?? String(err) ?? 'Generation failed';
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /api/rag/fill-choices
 * Given a question and its correct answer, asks the LLM to produce
 * 4 MCQ choices (A–D) with the correct answer embedded as one of them.
 */
ragRouter.post('/fill-choices', async (req: Request, res: Response) => {
  const { question_text, correct_answer } = req.body as {
    question_text?: string;
    correct_answer?: string;
  };

  if (!question_text || !correct_answer) {
    return res.status(400).json({ error: 'question_text and correct_answer are required' });
  }

  const prompt =
    `You are an exam question writer. Generate exactly 4 multiple-choice answer options labeled A, B, C, D for the question below.\n` +
    `One of the options MUST be the correct answer: "${correct_answer}".\n` +
    `The other 3 options should be plausible but incorrect distractors.\n` +
    `Keep each option concise (under 10 words).\n` +
    `Output ONLY a JSON array — no markdown, no explanation.\n\n` +
    `Question: "${question_text}"\n` +
    `Correct answer: "${correct_answer}"\n\n` +
    `Example format:\n` +
    `[{"key":"A","text":"First option"},{"key":"B","text":"Second option"},{"key":"C","text":"Third option"},{"key":"D","text":"Fourth option"}]`;

  try {
    const raw = await generate({ prompt, temperature: 0.5, maxTokens: 300 });

    // Extract JSON from response
    let parsed: any = null;
    const text = raw.replace(/```json|```/g, '').trim();
    try { parsed = JSON.parse(text); } catch { /* fall through */ }
    if (!parsed) {
      const m = text.match(/\[[\s\S]*\]/);
      if (m) try { parsed = JSON.parse(m[0]); } catch { /* fall through */ }
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return res.status(422).json({ error: 'LLM did not return valid choices' });
    }

    const choices = parsed
      .map((c: any, i: number) => ({
        key: String(c.key ?? String.fromCharCode(65 + i)).toUpperCase(),
        text: String(c.text ?? c.value ?? c.answer ?? '').trim(),
      }))
      .filter((c: any) => c.text.length > 0)
      .slice(0, 4);

    if (choices.length < 2) {
      return res.status(422).json({ error: 'Not enough choices generated' });
    }

    // Ensure exactly 4 slots
    while (choices.length < 4) {
      choices.push({ key: String.fromCharCode(65 + choices.length), text: '' });
    }

    return res.json({ choices });
  } catch (err: any) {
    console.error('fill-choices error:', err);
    return res.status(500).json({ error: err?.message ?? 'Generation failed' });
  }
});
