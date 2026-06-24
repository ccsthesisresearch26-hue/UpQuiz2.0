import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import Layout from '../../components/Layout';
import { useState, useEffect } from 'react';
import { CheckCircle2, Clock, Save, Send, Loader2, BookOpen } from 'lucide-react';

interface MCQChoice { key: string; text: string; }
interface MatchPair { left: string; right: string; }

/** Normalize whatever format the AI stored choices in → [{key,text},...] */
function normalizeMCQChoices(raw: any): MCQChoice[] {
  if (!raw) return [];
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return []; } }
  const byKey: Record<string, string> = {};
  if (Array.isArray(raw)) {
    (raw as any[]).forEach((c: any, i: number) => {
      if (!c) return;
      if (typeof c === 'string') { byKey[String.fromCharCode(65 + i)] = c; return; }
      const k = String(c.key ?? c.Key ?? c.label ?? c.letter ?? c.option ?? String.fromCharCode(65 + i)).toUpperCase().trim();
      const t = String(c.text ?? c.Text ?? c.value ?? c.Value ?? c.content ?? c.description ?? '').trim();
      if (/^[A-D]$/.test(k) && t) byKey[k] = t;
    });
  } else if (typeof raw === 'object') {
    Object.entries(raw as Record<string, unknown>).forEach(([k, v]) => {
      const uk = k.toUpperCase().trim();
      if (/^[A-D]$/.test(uk)) byKey[uk] = String(v ?? '').trim();
    });
  }
  return ['A', 'B', 'C', 'D'].map(k => ({ key: k, text: byKey[k] ?? '' })).filter(c => c.text.length > 0);
}

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  choices?: MCQChoice[] | MatchPair[] | null;
  image_url?: string | null;
}
interface Attempt { id: string; status: string; }

export default function TakeExamPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const { data: attempt } = useQuery<Attempt>({
    queryKey: ['attempt', examId],
    queryFn: () => api.post(`/exams/${examId}/attempt`).then(r => r.data),
  });

  const { data: questions = [], isLoading } = useQuery<Question[]>({
    queryKey: ['exam-questions', examId],
    queryFn: () => api.get(`/exams/${examId}/questions`).then(r => r.data),
    enabled: !!attempt,
  });

  useEffect(() => {
    if (!attempt || Object.keys(answers).length === 0) return;
    const id = setInterval(() => saveAnswers(), 30_000);
    return () => clearInterval(id);
  }, [attempt, answers]);

  const saveAnswers = async () => {
    if (!attempt) return;
    await api.post(`/attempts/${attempt.id}/answers`, {
      answers: Object.entries(answers).map(([question_id, answer_text]) => ({ question_id, answer_text })),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      await saveAnswers();
      return api.post(`/attempts/${attempt!.id}/submit`);
    },
    onSuccess: (res) => navigate(`/student/results/${res.data.attempt_id}`),
  });

  const setAnswer = (qId: string, value: string) =>
    setAnswers(prev => ({ ...prev, [qId]: value }));

  const answeredCount = Object.values(answers).filter(a => a.trim()).length;
  const progress = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;

  if (isLoading) {
    return (
      <Layout role="student">
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="card h-32 animate-pulse bg-slate-100" />)}
        </div>
      </Layout>
    );
  }

  return (
    <Layout role="student">
      {/* Sticky progress header */}
      <div className="sticky top-0 z-10 -mx-4 px-4 pt-2 pb-3 bg-white/80 backdrop-blur-sm border-b border-slate-100 mb-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary-500" />
              <span className="text-sm font-semibold text-slate-700">
                {answeredCount} / {questions.length} answered
              </span>
            </div>
            <div className="flex items-center gap-2">
              {saved && (
                <span className="text-xs text-emerald-600 flex items-center gap-1 animate-fade-in">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Clock className="w-3.5 h-3.5" /> Auto-saves every 30s
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-4 mb-8">
        {questions.map((q, i) => {
          const answered = !!(answers[q.id]?.trim());

          // ── Multiple Choice ─────────────────────────────────────────────
          const mcqChoices = q.question_type === 'multiple_choice'
            ? normalizeMCQChoices(q.choices)
            : [];

          // ── Matching ────────────────────────────────────────────────────
          const matchPairs = q.question_type === 'matching'
            ? (q.choices ?? []) as MatchPair[]
            : [];
          const rightPool = matchPairs.map(p => p.right);

          const currentMatchMap: Record<string, string> = {};
          (answers[q.id] ?? '').split('|').forEach(part => {
            const idx = part.indexOf('→');
            if (idx !== -1) currentMatchMap[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
          });

          const updateMatch = (left: string, right: string) => {
            const updated = { ...currentMatchMap, [left]: right };
            const str = Object.entries(updated)
              .filter(([, v]) => v)
              .map(([k, v]) => `${k}→${v}`)
              .join('|');
            setAnswer(q.id, str);
          };

          return (
            <div
              key={q.id}
              className={`card transition-all duration-200 ${answered ? 'border-l-4 border-l-emerald-400' : 'border-l-4 border-l-slate-200'}`}
            >
              <div className="flex items-start gap-3 mb-4">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5
                  ${answered ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {answered ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-slate-800 leading-relaxed">{q.question_text}</p>
                  {q.image_url && (
                    <img src={q.image_url} alt="Question context"
                      className="rounded-lg max-h-64 w-auto object-contain border border-slate-100 bg-slate-50 mt-2" />
                  )}
                </div>
              </div>

              {/* ── Multiple Choice ── */}
              {q.question_type === 'multiple_choice' && (
                <div className="space-y-2 ml-10">
                  {mcqChoices.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Choices are not available yet. Please ask your educator to update this exam.</p>
                  ) : (
                    mcqChoices.map(c => {
                      const selected = answers[q.id] === c.key;
                      return (
                        <label
                          key={c.key}
                          className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border-2 transition-all duration-150
                            ${selected ? 'bg-primary-50 border-primary-400' : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100'}`}
                        >
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors
                            ${selected ? 'border-primary-500 bg-primary-500' : 'border-slate-300 bg-white'}`}>
                            {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <input
                            type="radio" name={q.id} value={c.key}
                            checked={selected} onChange={() => setAnswer(q.id, c.key)}
                            className="sr-only"
                          />
                          <span className="text-sm text-slate-700">
                            <span className="font-bold text-slate-500 mr-1.5">{c.key}.</span>{c.text}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              )}


              {/* ── True or False ── */}
              {q.question_type === 'true_or_false' && (
                <div className="flex gap-3 ml-10">
                  {['True', 'False'].map(v => {
                    const selected = answers[q.id] === v;
                    return (
                      <label
                        key={v}
                        className={`flex items-center gap-2.5 flex-1 px-5 py-3 rounded-xl cursor-pointer border-2 transition-all duration-150 font-semibold text-sm
                          ${selected
                            ? v === 'True'
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                              : 'bg-red-50 border-red-400 text-red-700'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100'
                          }`}
                      >
                        <input
                          type="radio" name={q.id} value={v}
                          checked={selected} onChange={() => setAnswer(q.id, v)}
                          className="sr-only"
                        />
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors
                          ${selected
                            ? v === 'True' ? 'border-emerald-500 bg-emerald-500' : 'border-red-500 bg-red-500'
                            : 'border-slate-300 bg-white'
                          }`}>
                          {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        {v}
                      </label>
                    );
                  })}
                </div>
              )}

              {/* ── Fill in the Blank ── */}
              {q.question_type === 'fill_in_the_blank' && (
                <div className="ml-10">
                  <input
                    type="text"
                    className="input"
                    placeholder="Type your answer…"
                    value={answers[q.id] ?? ''}
                    onChange={e => setAnswer(q.id, e.target.value)}
                  />
                  <p className="text-xs text-slate-400 mt-1">Not case-sensitive.</p>
                </div>
              )}

              {/* ── Essay ── */}
              {q.question_type === 'essay' && (
                <div className="ml-10">
                  <textarea
                    rows={6}
                    className="input resize-none"
                    placeholder="Write your response in 2–3 sentences…"
                    value={answers[q.id] ?? ''}
                    onChange={e => setAnswer(q.id, e.target.value)}
                  />
                  <p className="text-xs text-slate-400 mt-1">Aim for 2–3 complete sentences.</p>
                </div>
              )}

              {/* ── Matching ── */}
              {q.question_type === 'matching' && (
                <div className="ml-10 space-y-2">
                  {matchPairs.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Matching pairs not yet configured — ask your educator.</p>
                  ) : (
                    <>
                      <p className="text-xs text-slate-500 font-medium mb-2">Match each item on the left with the correct answer on the right.</p>
                      {matchPairs.map((p, pi) => (
                        <div key={pi} className="flex items-center gap-3">
                          <span className="flex-1 bg-blue-50 border-2 border-blue-100 text-blue-800 rounded-xl px-4 py-2.5 text-sm font-semibold">
                            {p.left}
                          </span>
                          <span className="text-slate-400 flex-shrink-0 text-lg">→</span>
                          <select
                            className={`flex-1 border-2 rounded-xl px-3 py-2.5 text-sm bg-white outline-none transition-colors
                              ${currentMatchMap[p.left]
                                ? 'border-primary-400 text-slate-800'
                                : 'border-slate-200 text-slate-400'
                              } focus:ring-2 focus:ring-primary-300 focus:border-primary-400`}
                            value={currentMatchMap[p.left] ?? ''}
                            onChange={e => updateMatch(p.left, e.target.value)}
                          >
                            <option value="">Select a match…</option>
                            {rightPool.map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit bar */}
      <div className="max-w-3xl mx-auto">
        <div className="card flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-700">{answeredCount} of {questions.length} questions answered</p>
            {answeredCount < questions.length && (
              <p className="text-xs text-amber-600 mt-0.5">{questions.length - answeredCount} unanswered — you can still submit</p>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={() => saveAnswers()} className="btn-secondary text-sm">
              <Save className="w-4 h-4" /> Save Progress
            </button>
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="btn-primary text-sm"
            >
              {submitMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                : <><Send className="w-4 h-4" /> Submit Exam</>
              }
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
