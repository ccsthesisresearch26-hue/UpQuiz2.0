import { embedText } from './embeddings';
import { searchSimilarChunks, fetchAllChunksForSubject, SearchResult } from './milvus';
import { generate } from './ollama';

export type QuestionType = 'multiple_choice' | 'true_or_false' | 'fill_in_the_blank' | 'essay' | 'matching';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface QuestionConfig {
  type: QuestionType;
  difficulty: Difficulty;
  count: number;
}

export interface GeneratedQuestion {
  question_text: string;
  question_type: QuestionType;
  difficulty: Difficulty;
  topic_tag: string;
  correct_answer: string;
  choices?: Record<string, string>[] | null;
  document_id: string;
  source_chunk_uuid: string;
  source_content: string;
}

const MIN_CHUNK_SCORE = 0.35;
const BATCH_SIZE = 3; // questions to request per LLM call

function cleanChunkContent(content: string): string {
  return content
    .replace(/electronics fundamentals\s+\d+\w*\s+edition\s+floyd\/buchla/gi, '')
    .replace(/©\s*\d{4}\s+[^.]{0,80}reserved\./gi, '')
    .replace(/all rights reserved\.?/gi, '')
    .replace(/upper saddle river[^.]*\./gi, '')
    .replace(/mcgraw[-\s]?hill[^.]*\./gi, '')
    .replace(/cengage learning[^.]*\./gi, '')
    .replace(/pearson education[^.]*\./gi, '')
    .replace(/chapter\s+\d+\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function generateQuestionsFromRAG(
  subjectId: string,
  topicHint: string,
  configs: QuestionConfig[],
): Promise<GeneratedQuestion[]> {
  const totalQuestions = configs.reduce((sum, c) => sum + c.count, 0);

  const isWholDoc = !topicHint.trim();
  let chunks;
  if (isWholDoc) {
    chunks = await fetchAllChunksForSubject(subjectId, Math.max(totalQuestions * 6, 50));
  } else {
    const queryEmbedding = await embedText(topicHint);
    chunks = await searchSimilarChunks(queryEmbedding, subjectId, Math.max(totalQuestions * 6, 50));
  }

  const relevantChunks = isWholDoc
    ? chunks.filter(c => c.content.trim().length > 0)
    : chunks.filter(c => c.score >= MIN_CHUNK_SCORE);

  if (relevantChunks.length === 0) {
    throw new Error(
      'Not enough relevant content found in the uploaded documents to generate questions. ' +
      'Please upload more learning materials or refine the topic.',
    );
  }

  for (let i = relevantChunks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [relevantChunks[i], relevantChunks[j]] = [relevantChunks[j], relevantChunks[i]];
  }

  const usableChunks = relevantChunks.filter(c => c.content.trim().length >= 120);
  const pool = usableChunks.length > 0 ? usableChunks : relevantChunks;

  // Run all question type configs in parallel — different types won't duplicate each other
  const configResults = await Promise.all(
    configs.map(cfg => generateForConfig(cfg, pool, topicHint)),
  );

  return configResults.flat();
}

// ─── Per-config generator ──────────────────────────────────────────────────────

async function generateForConfig(
  cfg: QuestionConfig,
  pool: SearchResult[],
  topicHint: string,
): Promise<GeneratedQuestion[]> {
  const questions: GeneratedQuestion[] = [];
  const seenTexts = new Set<string>();
  // Safety cap: allow enough attempts to fill the count even with frequent failures
  const MAX_ATTEMPTS = Math.ceil(cfg.count / BATCH_SIZE) * 6 + 5;
  let attempt = 0;
  let chunkOffset = 0;

  while (questions.length < cfg.count && attempt < MAX_ATTEMPTS) {
    const remaining = cfg.count - questions.length;
    const batchCount = Math.min(remaining, BATCH_SIZE);

    const chunkIdx = chunkOffset % pool.length;
    chunkOffset++;

    const combinedContent = Array.from({ length: 4 }, (_, k) =>
      pool[(chunkIdx + k) % pool.length].content
    ).join('\n\n');
    const chunk = { ...pool[chunkIdx], content: combinedContent };

    const alreadyGenerated = questions
      .map(q => `${q.question_text} [answer: ${q.correct_answer}]`);

    const batchCfg = { ...cfg, count: batchCount };
    const prompt = buildPrompt(batchCfg, chunk, topicHint, alreadyGenerated);
    // Scale token budget with batch size
    const maxTokens = batchCount * 350;

    let rawOutput: string;
    try {
      rawOutput = await generate({ prompt, temperature: 0.4 + (attempt % 3) * 0.1, maxTokens });
    } catch (err) {
      console.error(`Ollama error for ${cfg.type}/${cfg.difficulty}:`, (err as any)?.message ?? err);
      attempt++;
      continue;
    }

    const parsed = parseQuestions(rawOutput, batchCfg, chunk, topicHint);
    const newQ = parsed.filter(p => {
      const key = p.question_text.trim().toLowerCase();
      if (seenTexts.has(key)) return false;
      seenTexts.add(key);
      return true;
    });

    if (newQ.length > 0) {
      questions.push(...newQ.slice(0, remaining));
    } else {
      console.warn(`Attempt ${attempt + 1} for ${cfg.type}/${cfg.difficulty} yielded no valid unique questions — retrying.`);
    }

    attempt++;
  }

  if (questions.length < cfg.count) {
    console.warn(
      `Could only generate ${questions.length}/${cfg.count} for ${cfg.type}/${cfg.difficulty} after ${attempt} attempts.`,
    );
  }

  return questions;
}

// ─── Prompt builder ──────────────────────────────────────────────────────────

function buildPrompt(
  cfg: QuestionConfig,
  chunk: SearchResult,
  topic: string,
  alreadyGenerated: string[],
): string {
  const cleanedContent = cleanChunkContent(chunk.content).slice(0, 800);
  const n = cfg.count;
  const plural = n > 1;

  const typeInstructions: Record<QuestionType, string> = {
    multiple_choice:
      `${n} multiple choice question${plural ? 's' : ''}, each with 4 choices (A B C D). correct_answer is one letter: A, B, C, or D.`,
    true_or_false:
      `${n} true/false item${plural ? 's' : ''}. question_text must be a statement ending in a period (NOT a question mark). correct_answer is "True" or "False".`,
    fill_in_the_blank:
      `${n} fill-in-the-blank statement${plural ? 's' : ''} (NOT question${plural ? 's' : ''}). Replace one key term with ___. correct_answer is the missing word or phrase. question_text must end with a period, never a question mark.`,
    essay:
      `${n} open-ended essay question${plural ? 's' : ''}. correct_answer is a 2-sentence model answer using facts from the source.`,
    matching:
      `${n} matching question${plural ? 's' : ''}. Pick 4 terms from the source. question_text is "Match each term to its correct definition." choices is null. correct_answer format: term1|def1||term2|def2||term3|def3||term4|def4`,
  };

  const difficultyNote: Record<Difficulty, string> = {
    easy:   `Easy — direct recall of a single stated fact.`,
    medium: `Medium — requires understanding or connecting two ideas.`,
    hard:   `Hard — requires analysis or applying a concept to a new situation.`,
  };

  const avoidList = alreadyGenerated.slice(-3);
  const avoidSection = avoidList.length > 0
    ? `\nAvoid repeating these questions: ${avoidList.map((q, i) => `${i + 1}. ${q}`).join(' | ')}\n`
    : '';

  const examples: Record<QuestionType, string> = {
    multiple_choice:
      `[{"question_text":"What is the SI unit of force?","question_type":"multiple_choice","difficulty":"easy","topic_tag":"units","correct_answer":"B","choices":[{"key":"A","text":"Joule"},{"key":"B","text":"Newton"},{"key":"C","text":"Pascal"},{"key":"D","text":"Watt"}]}]`,
    true_or_false:
      `[{"question_text":"The newton is the SI unit of force.","question_type":"true_or_false","difficulty":"easy","topic_tag":"units","correct_answer":"True","choices":null}]`,
    fill_in_the_blank:
      `[{"question_text":"The SI unit of mass is the ___.","question_type":"fill_in_the_blank","difficulty":"easy","topic_tag":"units","correct_answer":"kilogram","choices":null}]`,
    essay:
      `[{"question_text":"Explain the difference between mass and weight.","question_type":"essay","difficulty":"medium","topic_tag":"mechanics","correct_answer":"Mass is the amount of matter in an object measured in kilograms. Weight is the gravitational force on that mass, measured in newtons.","choices":null}]`,
    matching:
      `[{"question_text":"Match each term to its correct definition.","question_type":"matching","difficulty":"medium","topic_tag":"units","correct_answer":"meter|unit of length||kilogram|unit of mass||second|unit of time||ampere|unit of current","choices":null}]`,
  };

  return `You are an exam question generator. Use ONLY facts from the source text below. Output only a JSON array.\n` +
    `\nSOURCE:\n"""\n${cleanedContent}\n"""\n` +
    `${topic ? `\nTOPIC: ${topic}` : ''}` +
    `\nDIFFICULTY: ${difficultyNote[cfg.difficulty]}` +
    `\nTASK: Generate ${typeInstructions[cfg.type]}` +
    `${avoidSection}` +
    `\nRespond with ONLY a JSON array containing exactly ${n} object${plural ? 's' : ''}. Example:\n${examples[cfg.type]}` +
    `\nDo NOT include any text outside the JSON array.`;
}

// ─── Response parser ──────────────────────────────────────────────────────────

function tryRepairJSON(text: string): any {
  const closings = [']', '}]', '"}]', '"]}', '"]', '"}]}'];
  for (const suffix of closings) {
    try { return JSON.parse(text + suffix); } catch { /* keep trying */ }
  }
  const lastClose = text.lastIndexOf('}');
  if (lastClose > 0) {
    const candidate = text.slice(0, lastClose + 1);
    if (candidate.trimStart().startsWith('{')) {
      try { return JSON.parse('[' + candidate + ']'); } catch { /* fall through */ }
    }
    try { return JSON.parse(candidate); } catch { /* fall through */ }
  }
  return null;
}

function extractJSON(raw: string): any {
  let text = raw.replace(/```json|```/g, '').trim();

  try { return JSON.parse(text); } catch { /* fall through */ }

  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[0]); } catch { /* fall through */ }
  }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* fall through */ }
  }

  const repaired = tryRepairJSON(text);
  if (repaired !== null) return repaired;

  console.warn('No parseable JSON in LLM response:', text.slice(0, 300));
  return null;
}

function normalizeAnswer(type: QuestionType, raw: string): string {
  if (type === 'true_or_false') {
    const lower = raw.toLowerCase().trim();
    if (lower === 'true')  return 'True';
    if (lower === 'false') return 'False';
  }
  return raw;
}

function parseMatchingPairs(raw: string): { left: string; right: string }[] | null {
  if (!raw || !raw.includes('|')) return null;
  const pairs = raw.split('||').map(part => {
    const idx = part.indexOf('|');
    if (idx === -1) return null;
    return { left: part.slice(0, idx).trim(), right: part.slice(idx + 1).trim() };
  }).filter((p): p is { left: string; right: string } => !!p && !!p.left && !!p.right);
  return pairs.length >= 2 ? pairs : null;
}

function normalizeTopicTag(tag: string, type: QuestionType, fallback: string): string {
  if (!tag || tag === type || tag.replace(/_/g, ' ') === type.replace(/_/g, ' ')) return fallback;
  return tag.replace(/_/g, ' ').trim();
}

function isValidQuestion(q: any, type: QuestionType): boolean {
  if (typeof q.question_text !== 'string' || q.question_text.trim().length < 5) return false;

  if (/copyright|all rights reserved|pearson|mcgraw|©|\d{4}\s+\w+\s+education/i.test(q.question_text)) return false;

  if (type === 'true_or_false') {
    const lower = String(q.correct_answer ?? '').toLowerCase().trim();
    if (lower !== 'true' && lower !== 'false') return false;
    if (q.question_text.trim().endsWith('?')) {
      q.question_text = q.question_text.trim().slice(0, -1) + '.';
    }
  }

  if (type === 'fill_in_the_blank' && q.question_text.trim().endsWith('?')) {
    q.question_text = q.question_text.trim().slice(0, -1) + '.';
  }

  if (type === 'matching') {
    const choices = q.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      if (!choices.every((c: any) => typeof c.left === 'string' && typeof c.right === 'string')) return false;
    }
  }

  if (type !== 'true_or_false' && type !== 'matching') {
    if (String(q.correct_answer ?? '').trim().length === 0) return false;
  }

  return true;
}

function parseQuestions(
  raw: string,
  cfg: QuestionConfig,
  chunk: SearchResult,
  topicFallback: string,
): GeneratedQuestion[] {
  const parsed = extractJSON(raw);
  if (parsed === null) return [];

  const items: any[] = Array.isArray(parsed)
    ? parsed
    : (parsed.question_text ? [parsed] : []);

  return items
    .filter(q => isValidQuestion(q, cfg.type))
    .map(q => {
      let choices = q.choices ?? null;
      let correctAnswer = normalizeAnswer(cfg.type, String(q.correct_answer ?? ''));

      // ── Normalize MCQ choices to [{key, text}] format ──────────────────────
      if (cfg.type === 'multiple_choice' && choices) {
        if (!Array.isArray(choices)) {
          // Object format: {"A":"Joule","B":"Newton",...} → array
          choices = Object.entries(choices as Record<string, string>)
            .map(([k, v]) => ({ key: k.toUpperCase(), text: String(v) }))
            .sort((a, b) => a.key.localeCompare(b.key));
        } else {
          // Array format: normalize each item in case it's a string or odd shape
          choices = (choices as any[]).map((c, i) => {
            if (typeof c === 'string') return { key: String.fromCharCode(65 + i), text: c };
            if (c && typeof c === 'object') {
              if (typeof c.key === 'string' && c.text !== undefined)
                return { key: c.key.toUpperCase(), text: String(c.text) };
              // e.g. {"A":"Joule"} — single-entry object
              const entries = Object.entries(c as Record<string, unknown>);
              if (entries.length >= 1 && /^[A-Da-d]$/.test(String(entries[0][0])))
                return { key: String(entries[0][0]).toUpperCase(), text: String(entries[0][1]) };
            }
            return { key: String.fromCharCode(65 + i), text: String(c ?? '') };
          });
        }
      }

      if (cfg.type === 'matching' && (!choices || (Array.isArray(choices) && choices.length === 0))) {
        const parsedPairs = parseMatchingPairs(correctAnswer);
        if (parsedPairs) {
          choices = parsedPairs;
          correctAnswer = 'Match each term to its correct definition.';
        }
      }
      return {
        question_text:     q.question_text.trim(),
        question_type:     cfg.type,
        difficulty:        cfg.difficulty,
        topic_tag:         normalizeTopicTag(q.topic_tag, cfg.type, topicFallback),
        correct_answer:    correctAnswer,
        choices,
        document_id:       chunk.document_id,
        source_chunk_uuid: chunk.chunk_uuid,
        source_content:    chunk.content,
      };
    });
}
