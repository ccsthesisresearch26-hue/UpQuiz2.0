import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '../../services/api';
import Layout from '../../components/Layout';
import {
  Sparkles, Plus, X, Save, AlertCircle, Tag, Gauge,
  CheckCircle, CheckCircle2, Trash2, FileQuestion,
  Pencil, Loader2, BookOpen, Globe, Lock, FileEdit,
  Send, RotateCcw, AlertTriangle, Clock, Percent,
  Shuffle, ClipboardCheck, CheckSquare, Square,
  Eye, EyeOff,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type QType = 'multiple_choice' | 'true_or_false' | 'fill_in_the_blank' | 'essay' | 'matching';
type Difficulty = 'easy' | 'medium' | 'hard';
type Tab = 'generate' | 'saved' | 'exams';

interface QuestionConfig { type: QType; difficulty: Difficulty; count: number; }
interface MCQChoice { key: string; text: string; }
interface MatchPair  { left: string; right: string; }

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  difficulty: string;
  topic_tag: string;
  correct_answer: string;
  is_approved: boolean;
  choices?: MCQChoice[] | MatchPair[] | null;
}

interface EditDraft {
  question_text:  string;
  correct_answer: string;
  difficulty:     string;
  topic_tag:      string;
  choices:        MCQChoice[] | MatchPair[] | null;
}

interface Exam {
  id: string; title: string; status: string;
  time_limit_minutes: number | null; created_at: string;
}

interface ExamFormData {
  title: string; instructions: string;
  time_limit_minutes: number | ''; passing_score: number | '';
  randomize_questions: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const QTYPES: { value: QType; label: string; color: string }[] = [
  { value: 'multiple_choice',   label: 'Multiple Choice',   color: 'bg-blue-100 text-blue-700' },
  { value: 'true_or_false',     label: 'True or False',     color: 'bg-purple-100 text-purple-700' },
  { value: 'fill_in_the_blank', label: 'Fill in the Blank', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'essay',             label: 'Essay',             color: 'bg-orange-100 text-orange-700' },
  { value: 'matching',          label: 'Matching',          color: 'bg-pink-100 text-pink-700' },
];

const diffColors: Record<string, string> = {
  easy:   'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  hard:   'bg-red-100 text-red-700',
};
const typeColors: Record<string, string> = Object.fromEntries(QTYPES.map(q => [q.value, q.color]));
const typeLabel: Record<string, string> = {
  multiple_choice: 'MCQ', true_or_false: 'T/F',
  fill_in_the_blank: 'Fill', essay: 'Essay', matching: 'Match',
};

const examStatusConfig = {
  draft:     { label: 'Draft',     color: 'bg-slate-100 text-slate-600',     icon: FileEdit },
  published: { label: 'Published', color: 'bg-emerald-100 text-emerald-700', icon: Globe },
  closed:    { label: 'Closed',    color: 'bg-red-100 text-red-600',         icon: Lock },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ChoicesView({ q }: { q: Question }) {
  const { question_type, choices, correct_answer } = q;

  if (question_type === 'multiple_choice') {
    let items: MCQChoice[] = [];
    // Unwrap string-encoded JSON (same as buildMCQChoices)
    let raw: any = choices;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }

    if (Array.isArray(raw) && raw.length > 0) {
      items = (raw as any[]).map((c, i) => {
        if (!c) return { key: String.fromCharCode(65 + i), text: '' };
        if (typeof c === 'string') return { key: String.fromCharCode(65 + i), text: c };
        const k = String(
          c.key ?? c.Key ?? c.label ?? c.letter ?? c.option ?? String.fromCharCode(65 + i)
        ).toUpperCase().trim();
        const t = String(
          c.text ?? c.Text ?? c.value ?? c.Value ?? c.content ?? c.description ?? ''
        ).trim();
        return { key: k, text: t };
      }).filter(c => /^[A-D]$/.test(c.key));
    } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      items = Object.entries(raw as Record<string, unknown>)
        .map(([k, v]) => ({ key: k.toUpperCase().trim(), text: String(v ?? '').trim() }))
        .filter(c => /^[A-D]$/.test(c.key))
        .sort((a, b) => a.key.localeCompare(b.key));
    }
    // Filter out items with empty text
    items = items.filter(c => c.text.length > 0);
    if (!items.length) return <p className="text-xs text-slate-400 mt-1.5">Answer: <span className="font-medium text-slate-600">{correct_answer}</span></p>;
    return (
      <div className="mt-2 space-y-1">
        {items.map(c => (
          <div key={c.key} className={`flex items-start gap-2 text-xs rounded px-2 py-1 ${
            correct_answer === c.key ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-slate-50 text-slate-600'
          }`}>
            <span className="font-bold w-4 flex-shrink-0">{c.key}.</span>
            <span className="flex-1">{c.text}</span>
            {correct_answer === c.key && <span className="text-emerald-600 font-semibold flex-shrink-0">✓</span>}
          </div>
        ))}
      </div>
    );
  }
  if (question_type === 'true_or_false') {
    return (
      <div className="mt-2 flex gap-2">
        {['True', 'False'].map(opt => (
          <span key={opt} className={`text-xs rounded px-3 py-1 font-medium ${
            correct_answer === opt ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-slate-50 text-slate-400'
          }`}>
            {correct_answer === opt && '✓ '}{opt}
          </span>
        ))}
      </div>
    );
  }
  if (question_type === 'matching') {
    const pairs = choices as MatchPair[] | undefined;
    if (!pairs?.length) return <p className="text-xs text-slate-400 mt-1.5">No pairs stored.</p>;
    return (
      <div className="mt-2 space-y-1">
        {pairs.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="bg-blue-50 border border-blue-100 text-blue-700 rounded px-2 py-0.5 min-w-[90px]">{p.left}</span>
            <span className="text-slate-400">→</span>
            <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 rounded px-2 py-0.5">{p.right}</span>
          </div>
        ))}
      </div>
    );
  }
  if (question_type === 'essay') {
    return (
      <div className="mt-1.5">
        <p className="text-xs text-slate-400 font-medium mb-0.5">Model Answer:</p>
        <p className="text-xs text-slate-600 leading-relaxed">{correct_answer}</p>
      </div>
    );
  }
  return <p className="text-xs text-slate-400 mt-1.5">Answer: <span className="font-medium text-slate-600">{correct_answer}</span></p>;
}

function AnswerEditor({ questionType, draft, setDraft }: {
  questionType: string;
  draft: EditDraft;
  setDraft: React.Dispatch<React.SetStateAction<EditDraft>>;
}) {
  if (questionType === 'multiple_choice') {
    const choices = (draft.choices ?? []) as MCQChoice[];
    return (
      <div className="space-y-1.5">
        <label className="text-xs text-slate-500 font-medium block">
          Choices — <span className="text-emerald-600 font-semibold">click a letter</span> to mark the correct answer
        </label>
        {choices.map((c, i) => {
          const isCorrect = draft.correct_answer === c.key;
          return (
            <div key={c.key} className={`flex items-center gap-2 rounded-xl p-1.5 transition-colors ${
              isCorrect ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'hover:bg-slate-50'
            }`}>
              <button type="button" onClick={() => setDraft(d => ({ ...d, correct_answer: c.key }))}
                className={`w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 border-2 transition-colors ${
                  isCorrect
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-slate-300 text-slate-500 hover:border-emerald-400'
                }`}>
                {c.key}
              </button>
              <input
                className={`flex-1 text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 border transition-colors ${
                  isCorrect
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 font-medium focus:ring-emerald-300 focus:border-emerald-400'
                    : 'border-slate-200 focus:ring-primary-300 focus:border-primary-400'
                }`}
                value={c.text}
                onChange={e => {
                  const updated = choices.map((ch, idx) => idx === i ? { ...ch, text: e.target.value } : ch);
                  setDraft(d => ({ ...d, choices: updated }));
                }}
              />
              {isCorrect && (
                <span className="flex-shrink-0 text-xs font-semibold text-emerald-600 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Correct
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  if (questionType === 'true_or_false') {
    return (
      <div>
        <label className="text-xs text-slate-500 font-medium mb-1 block">Correct Answer</label>
        <div className="flex gap-2">
          {['True', 'False'].map(opt => (
            <button key={opt} type="button" onClick={() => setDraft(d => ({ ...d, correct_answer: opt }))}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                draft.correct_answer === opt
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'border-slate-200 text-slate-500 hover:border-emerald-300 bg-white'
              }`}>
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (questionType === 'matching') {
    const pairs = (draft.choices ?? []) as MatchPair[];
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-slate-500 font-medium">Matching Pairs</label>
          <button type="button" onClick={() => setDraft(d => ({ ...d, choices: [...pairs, { left: '', right: '' }] }))}
            className="text-xs text-primary-600 hover:text-primary-700 font-semibold">+ Add pair</button>
        </div>
        {pairs.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <input className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary-300"
              placeholder="Term" value={p.left}
              onChange={e => { const u = pairs.map((pr, j) => j === i ? { ...pr, left: e.target.value } : pr); setDraft(d => ({ ...d, choices: u })); }} />
            <span className="text-slate-400 text-sm">→</span>
            <input className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary-300"
              placeholder="Definition" value={p.right}
              onChange={e => { const u = pairs.map((pr, j) => j === i ? { ...pr, right: e.target.value } : pr); setDraft(d => ({ ...d, choices: u })); }} />
            <button type="button" onClick={() => setDraft(d => ({ ...d, choices: pairs.filter((_, j) => j !== i) }))}
              className="text-slate-300 hover:text-red-400 text-lg leading-none">×</button>
          </div>
        ))}
        <div>
          <label className="text-xs text-slate-500 font-medium mb-1 block">Instruction text</label>
          <input className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary-300"
            placeholder='e.g. "Match each term to its definition"'
            value={draft.correct_answer} onChange={e => setDraft(d => ({ ...d, correct_answer: e.target.value }))} />
        </div>
      </div>
    );
  }
  if (questionType === 'essay') {
    return (
      <div>
        <label className="text-xs text-slate-500 font-medium mb-1 block">Model Answer</label>
        <textarea rows={4} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-300 resize-none"
          value={draft.correct_answer} onChange={e => setDraft(d => ({ ...d, correct_answer: e.target.value }))} />
      </div>
    );
  }
  return (
    <div>
      <label className="text-xs text-slate-500 font-medium mb-1 block">
        {questionType === 'fill_in_the_blank' ? 'Answer (word/phrase for the blank)' : 'Correct Answer'}
      </label>
      <input className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-300"
        value={draft.correct_answer} onChange={e => setDraft(d => ({ ...d, correct_answer: e.target.value }))} />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function QuestionsPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();

  const initialTab = (['generate', 'saved', 'exams'].includes(searchParams.get('tab') ?? ''))
    ? (searchParams.get('tab') as Tab) : 'generate';
  const [tab, setTab] = useState<Tab>(initialTab);

  const switchTab = (t: Tab) => {
    setTab(t);
    t === 'generate' ? setSearchParams({}) : setSearchParams({ tab: t });
  };

  // ── Generate state ──
  const [topicHint, setTopicHint] = useState('');
  const [configs, setConfigs] = useState<QuestionConfig[]>([
    { type: 'multiple_choice', difficulty: 'medium', count: 5 },
  ]);
  const [generated, setGenerated] = useState<any[]>([]);
  const [genError, setGenError] = useState('');

  // ── Review state ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFillingChoices, setIsFillingChoices] = useState(false);
  const [draft, setDraft] = useState<EditDraft>({
    question_text: '', correct_answer: '', difficulty: '', topic_tag: '', choices: null,
  });

  // ── Save / auto-fill progress state ──
  const [autoFillStatus, setAutoFillStatus] = useState<string | null>(null);
  // Tracks which question IDs we've already sent to fill-choices this session
  const autoFillAttempted = useRef<Set<string>>(new Set());

  // ── Exam state ──
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [confirmDeleteExamId, setConfirmDeleteExamId] = useState<string | null>(null);
  const [selectedExamQIDs, setSelectedExamQIDs] = useState<Set<string>>(new Set());
  const [examCreateError, setExamCreateError] = useState('');
  const [openExamId, setOpenExamId] = useState<string | null>(null);
  const [editExamDraft, setEditExamDraft] = useState({
    title: '', instructions: '', time_limit_minutes: '' as number | '', passing_score: '' as number | '', randomize_questions: true,
  });

  // ── Choice helpers (defined early so useEffect below can reference them) ──
  const buildMCQChoices = (raw: any): MCQChoice[] => {
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
    const byKey: Record<string, string> = {};
    if (Array.isArray(raw)) {
      (raw as any[]).forEach((c, i) => {
        if (!c) return;
        if (typeof c === 'string') { byKey[String.fromCharCode(65 + i)] = c; return; }
        if (typeof c !== 'object') return;
        const k = String(c.key ?? c.Key ?? c.label ?? c.letter ?? c.option ?? String.fromCharCode(65 + i)).toUpperCase().trim();
        const t = String(c.text ?? c.Text ?? c.value ?? c.Value ?? c.content ?? c.description ?? '').trim();
        if (/^[A-D]$/.test(k)) byKey[k] = t;
      });
    } else if (raw && typeof raw === 'object') {
      Object.entries(raw as Record<string, unknown>).forEach(([k, v]) => {
        const uk = k.toUpperCase().trim();
        if (/^[A-D]$/.test(uk)) byKey[uk] = String(v ?? '').trim();
      });
    }
    return ['A', 'B', 'C', 'D'].map(k => ({ key: k, text: byKey[k] ?? '' }));
  };

  const hasValidChoices = (q: Question): boolean => {
    const c = q.choices;
    if (!c) return false;
    if (Array.isArray(c)) return (c as any[]).some(item => item && (item.text ?? item.Text ?? item.value ?? '').length > 0);
    if (typeof c === 'object') return Object.values(c as object).some(v => String(v ?? '').length > 0);
    return false;
  };

  // ── Queries ──
  const { data: savedQuestions = [], isLoading } = useQuery<Question[]>({
    queryKey: ['questions', subjectId],
    queryFn: () => api.get(`/questions?subject_id=${subjectId}`).then(r => r.data),
  });

  const { data: exams = [], isLoading: examsLoading } = useQuery<Exam[]>({
    queryKey: ['exams', subjectId],
    queryFn: () => api.get(`/exams?subject_id=${subjectId}`).then(r => r.data),
  });

  // Auto-fill MCQ choices for any existing question that is still missing them
  useEffect(() => {
    if (!savedQuestions.length || autoFillStatus !== null) return;
    const missing = savedQuestions.filter(
      q => q.question_type === 'multiple_choice' &&
           !hasValidChoices(q) &&
           !autoFillAttempted.current.has(q.id),
    );
    if (!missing.length) return;

    missing.forEach(q => autoFillAttempted.current.add(q.id));

    (async () => {
      for (let i = 0; i < missing.length; i++) {
        setAutoFillStatus(`Filling MCQ choices ${i + 1} / ${missing.length}…`);
        try { await api.post(`/questions/${missing[i].id}/fill-choices`); } catch { /* best-effort */ }
        qc.invalidateQueries({ queryKey: ['questions', subjectId] });
      }
      setAutoFillStatus(null);
    })();
  }, [savedQuestions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Question mutations ──
  const generateMutation = useMutation({
    mutationFn: () => api.post('/rag/generate', { subject_id: subjectId, topic_hint: topicHint, configs }, { timeout: 0 }),
    onSuccess: (res) => { setGenerated(res.data.questions); setGenError(''); },
    onError: (err: any) => setGenError(err.response?.data?.error ?? 'Generation failed'),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Step 1: persist questions to the bank
      setAutoFillStatus(null);
      await api.post('/questions/bulk', {
        subject_id: subjectId,
        questions: generated.map((q: any) => ({
          document_id: q.document_id, chunk_id: q.source_chunk_uuid,
          question_text: q.question_text, question_type: q.question_type,
          difficulty: q.difficulty, topic_tag: q.topic_tag,
          correct_answer: q.correct_answer, choices: q.choices,
        })),
      });

      // Step 2: fetch newly saved questions and fill A/B/C/D for every MCQ
      const res = await api.get(`/questions?subject_id=${subjectId}`);
      const all: Question[] = res.data;
      const needFill = all.filter(q => q.question_type === 'multiple_choice' && !hasValidChoices(q));

      for (let i = 0; i < needFill.length; i++) {
        setAutoFillStatus(`Generating MCQ choices ${i + 1} / ${needFill.length}…`);
        try { await api.post(`/questions/${needFill[i].id}/fill-choices`); } catch { /* skip individual failures */ }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['questions', subjectId] });
      setGenerated([]);
      setAutoFillStatus(null);
      switchTab('saved');
    },
    onError: () => setAutoFillStatus(null),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/questions/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions', subjectId] }),
  });

  const approveAllMutation = useMutation({
    mutationFn: async () => {
      const unapproved = savedQuestions.filter(q => !q.is_approved);
      await Promise.all(unapproved.map(q => api.patch(`/questions/${q.id}/approve`)));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions', subjectId] }),
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/questions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questions', subjectId] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditDraft }) =>
      api.put(`/questions/${id}`, {
        question_text: data.question_text, correct_answer: data.correct_answer,
        difficulty: data.difficulty, topic_tag: data.topic_tag, choices: data.choices,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['questions', subjectId] }); setEditingId(null); },
  });

  // ── Exam mutations ──
  const { register: regExam, handleSubmit: submitExam, reset: resetExam } = useForm<ExamFormData>({
    defaultValues: { randomize_questions: true },
  });

  const createExamMutation = useMutation({
    mutationFn: async ({ body, publish }: { body: any; publish: boolean }) => {
      const res = await api.post('/exams', body);
      if (publish) await api.patch(`/exams/${res.data.id}/status`, { status: 'published' });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exams', subjectId] });
      setShowCreateForm(false);
      resetExam();
      setSelectedExamQIDs(new Set());
      setExamCreateError('');
    },
    onError: (err: any) => setExamCreateError(err.response?.data?.error ?? 'Failed to create exam'),
  });

  const examStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/exams/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exams', subjectId] }),
  });

  const deleteExamMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/exams/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['exams', subjectId] }); setConfirmDeleteExamId(null); },
  });

  const updateExamMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof editExamDraft }) =>
      api.put(`/exams/${id}`, {
        title: data.title,
        instructions: data.instructions,
        time_limit_minutes: data.time_limit_minutes !== '' ? Number(data.time_limit_minutes) : null,
        passing_score: data.passing_score !== '' ? Number(data.passing_score) : null,
        randomize_questions: data.randomize_questions,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exams', subjectId] }),
  });

  const { data: previewQuestions = [], isLoading: previewLoading } = useQuery<Question[]>({
    queryKey: ['exam-questions-preview', openExamId],
    queryFn: () => api.get(`/exams/${openExamId}/questions`).then(r => r.data),
    enabled: !!openExamId,
  });

  const openExamPanel = async (examId: string, currentTitle: string, currentTimeLimit: number | null) => {
    setOpenExamId(examId);
    setEditingId(null);
    setEditExamDraft({
      title: currentTitle, instructions: '', time_limit_minutes: currentTimeLimit ?? '',
      passing_score: '', randomize_questions: true,
    });
    try {
      const res = await api.get(`/exams/${examId}`);
      const ex = res.data;
      setEditExamDraft({
        title: ex.title ?? currentTitle,
        instructions: ex.instructions ?? '',
        time_limit_minutes: ex.time_limit_minutes ?? '',
        passing_score: ex.passing_score ?? '',
        randomize_questions: ex.randomize_questions ?? true,
      });
    } catch { /* keep defaults */ }
  };

  // ── Config helpers ──
  const addConfig = () => setConfigs(c => [...c, { type: 'multiple_choice', difficulty: 'medium', count: 3 }]);
  const removeConfig = (i: number) => setConfigs(c => c.filter((_, idx) => idx !== i));
  const updateConfig = (i: number, key: keyof QuestionConfig, value: any) =>
    setConfigs(c => c.map((cfg, idx) => idx === i ? { ...cfg, [key]: value } : cfg));
  const totalCount = configs.reduce((sum, c) => sum + c.count, 0);

  // Opens edit mode immediately, then fills MCQ choices in the background
  const startEdit = (q: Question) => {
    const choices = q.question_type === 'multiple_choice'
      ? buildMCQChoices(q.choices)
      : (q.choices ?? null) as any;

    setEditingId(q.id);
    setDraft({ question_text: q.question_text, correct_answer: q.correct_answer, difficulty: q.difficulty, topic_tag: q.topic_tag, choices });

    // Auto-fill AI choices if MCQ has none yet
    if (q.question_type === 'multiple_choice' && !hasValidChoices(q)) {
      fillChoicesForEdit(q.id);
    }
  };

  const fillChoicesForEdit = async (qId: string) => {
    setIsFillingChoices(true);
    try {
      const res = await api.post(`/questions/${qId}/fill-choices`);
      const filled = buildMCQChoices(res.data.choices);
      // Backend detects the correct letter and returns it as correct_key
      const correctKey: string | undefined = res.data.correct_key;
      if (filled.some(c => c.text.trim())) {
        setDraft(d => ({
          ...d,
          choices: filled,
          ...(correctKey ? { correct_answer: correctKey } : {}),
        }));
        qc.setQueryData<Question[]>(['questions', subjectId], old =>
          old?.map(item => item.id === qId
            ? { ...item, choices: res.data.choices, correct_answer: correctKey ?? item.correct_answer }
            : item) ?? old
        );
      }
    } catch { /* keep whatever is in draft */ }
    finally { setIsFillingChoices(false); }
  };

  // Exam question selection helpers
  const approvedQuestions = savedQuestions.filter(q => q.is_approved);
  const toggleExamQ = (id: string) =>
    setSelectedExamQIDs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllExamQ = () =>
    setSelectedExamQIDs(selectedExamQIDs.size === approvedQuestions.length ? new Set() : new Set(approvedQuestions.map(q => q.id)));

  const onCreateExam = (data: ExamFormData, publish: boolean) => {
    setExamCreateError('');
    createExamMutation.mutate({
      body: {
        subject_id: subjectId,
        title: data.title,
        instructions: data.instructions,
        time_limit_minutes: data.time_limit_minutes !== '' ? Number(data.time_limit_minutes) : null,
        passing_score: data.passing_score !== '' ? Number(data.passing_score) : null,
        randomize_questions: data.randomize_questions,
        question_ids: Array.from(selectedExamQIDs),
      },
      publish,
    });
  };

  const approved = savedQuestions.filter(q => q.is_approved).length;
  const editingQuestion = savedQuestions.find(q => q.id === editingId);

  return (
    <Layout role="educator">
      {/* ── Floating fill-choices progress toast (visible across all tabs) ── */}
      {saveMutation.isPending && autoFillStatus && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-slate-800 text-white rounded-xl px-4 py-3 shadow-xl text-sm animate-slide-up">
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 text-primary-300" />
          <span>{autoFillStatus}</span>
          <span className="text-slate-400 text-xs ml-1">— don't create an exam yet</span>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Questions & Exams</h1>
          <p className="page-subtitle">Generate questions, manage your bank, and publish exams — all in one place</p>
        </div>
        {savedQuestions.length > 0 && (
          <div className="card py-2.5 px-4 flex items-center gap-3 text-sm">
            <div className="text-center">
              <p className="font-bold text-slate-900">{savedQuestions.length}</p>
              <p className="text-slate-400 text-xs">Questions</p>
            </div>
            <div className="w-px h-8 bg-slate-100" />
            <div className="text-center">
              <p className="font-bold text-emerald-600">{approved}</p>
              <p className="text-slate-400 text-xs">Approved</p>
            </div>
            <div className="w-px h-8 bg-slate-100" />
            <div className="text-center">
              <p className="font-bold text-slate-700">{exams.length}</p>
              <p className="text-slate-400 text-xs">Exams</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 mb-6 border-b border-slate-200">
        {([
          { key: 'generate', label: 'Generate',                                              icon: Sparkles },
          { key: 'saved',    label: `Questions${savedQuestions.length ? ` (${savedQuestions.length})` : ''}`, icon: FileQuestion },
          { key: 'exams',    label: `Exams${exams.length ? ` (${exams.length})` : ''}`,     icon: BookOpen },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors duration-150 ${
              tab === key
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}

        {/* Approve All — visible in the tab bar whenever the Questions tab is active and has unapproved items */}
        {tab === 'saved' && savedQuestions.some(q => !q.is_approved) && (
          <div className="ml-auto flex items-center gap-2 pb-1">
            <span className="text-xs text-slate-400">
              {savedQuestions.filter(q => !q.is_approved).length} unapproved
            </span>
            <button
              onClick={() => approveAllMutation.mutate()}
              disabled={approveAllMutation.isPending}
              className="btn-success text-xs py-1.5 px-3"
            >
              {approveAllMutation.isPending
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Approving…</>
                : <><CheckCircle2 className="w-3.5 h-3.5" /> Approve All</>}
            </button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          TAB: GENERATE
      ══════════════════════════════════════════════════════ */}
      {tab === 'generate' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="card space-y-4">
              <div>
                <label className="label">Topic / Focus Area <span className="text-slate-400 font-normal">(optional)</span></label>
                <input className="input" placeholder="Leave blank to draw from the whole document"
                  value={topicHint} onChange={e => setTopicHint(e.target.value)} />
                <p className="text-xs text-slate-400 mt-1.5">
                  {topicHint.trim() ? 'Questions will focus on this topic.' : 'No topic set — drawn from the entire document.'}
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="label mb-0">Question Distribution</label>
                  <button onClick={addConfig} className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add type
                  </button>
                </div>
                <div className="space-y-2">
                  {configs.map((cfg, i) => (
                    <div key={i} className="flex gap-2 items-center bg-slate-50 rounded-xl p-2.5">
                      <select className="flex-1 text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary-300"
                        value={cfg.type} onChange={e => updateConfig(i, 'type', e.target.value)}>
                        {QTYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <select className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary-300"
                        value={cfg.difficulty} onChange={e => updateConfig(i, 'difficulty', e.target.value)}>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                      <input type="number" min={1} max={20}
                        className="w-14 text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-center outline-none focus:ring-2 focus:ring-primary-300"
                        value={cfg.count} onChange={e => updateConfig(i, 'count', Number(e.target.value))} />
                      <button onClick={() => removeConfig(i)} className="text-slate-400 hover:text-red-500 transition-colors p-0.5">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-2">Total: <span className="font-semibold text-slate-600">{totalCount} questions</span></p>
              </div>
              {genError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {genError}
                </div>
              )}
              <button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} className="btn-primary w-full justify-center">
                {generateMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                  : <><Sparkles className="w-4 h-4" /> Generate Questions</>}
              </button>
            </div>
            {generateMutation.isPending && (
              <div className="card border-primary-100 bg-primary-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-white animate-pulse" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">AI is generating…</p>
                    <p className="text-xs text-slate-500">This may take up to a minute</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            {generated.length > 0 ? (
              <div className="space-y-3">
                <div className="card flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">{generated.length} Questions Generated</p>
                    <p className="text-xs text-slate-400 mt-0.5">Review below, then save to your question bank</p>
                  </div>
                  <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="btn-success text-sm">
                    {saveMutation.isPending
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> {autoFillStatus ?? 'Saving…'}</>
                      : <><Save className="w-4 h-4" /> Save Questions</>}
                  </button>
                </div>
                {generated.map((q, i) => (
                  <div key={i} className="card animate-slide-up">
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      <span className="text-xs text-slate-400 font-medium">#{i + 1}</span>
                      <span className={`badge ${typeColors[q.question_type] ?? 'bg-slate-100 text-slate-600'}`}>{typeLabel[q.question_type] ?? q.question_type}</span>
                      <span className={`badge ${diffColors[q.difficulty] ?? 'bg-slate-100 text-slate-600'} capitalize`}><Gauge className="w-3 h-3" /> {q.difficulty}</span>
                      {q.topic_tag && <span className="badge bg-violet-50 text-violet-600"><Tag className="w-3 h-3" /> {q.topic_tag}</span>}
                    </div>
                    <p className="text-sm font-medium text-slate-800 leading-relaxed mb-1.5">{q.question_text}</p>
                    <p className="text-xs text-slate-400">Answer: <span className="text-slate-600 font-semibold">{q.correct_answer}</span></p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card text-center py-16 h-full flex flex-col items-center justify-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-slate-600 font-semibold">No questions generated yet</p>
                <p className="text-slate-400 text-sm mt-1">Configure your settings on the left and click Generate</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: SAVED QUESTIONS
      ══════════════════════════════════════════════════════ */}
      {tab === 'saved' && (
        <>
          {autoFillStatus && (
            <div className="flex items-center gap-3 bg-primary-50 border border-primary-100 rounded-xl px-4 py-3 text-sm text-primary-700 mb-2">
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              {autoFillStatus}
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="card h-28 animate-pulse bg-slate-100" />)}</div>
          ) : savedQuestions.length === 0 ? (
            <div className="card text-center py-16">
              <FileQuestion className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-semibold">No saved questions yet</p>
              <p className="text-slate-400 text-sm mt-1">
                Go to the{' '}
                <button onClick={() => switchTab('generate')} className="text-primary-600 font-semibold hover:underline">
                  Generate tab
                </button>
                {' '}to create questions from your documents
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {savedQuestions.map((q, i) => {
                const isEditing = editingId === q.id;
                return (
                  <div key={q.id} className={`card transition-all duration-200 ${q.is_approved ? 'border-l-4 border-l-emerald-400' : 'border-l-4 border-l-slate-200'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          <span className="text-xs text-slate-400 font-medium">#{i + 1}</span>
                          <span className={`badge ${typeColors[q.question_type] ?? 'bg-slate-100 text-slate-600'}`}>{typeLabel[q.question_type] ?? q.question_type}</span>
                          {!isEditing && <span className={`badge ${diffColors[q.difficulty] ?? 'bg-slate-100 text-slate-600'} capitalize`}><Gauge className="w-3 h-3" /> {q.difficulty}</span>}
                          {!isEditing && q.topic_tag && <span className="badge bg-violet-50 text-violet-600"><Tag className="w-3 h-3" /> {q.topic_tag}</span>}
                          {q.is_approved && <span className="badge bg-emerald-100 text-emerald-700"><CheckCircle className="w-3 h-3" /> Approved</span>}
                        </div>
                        {isEditing ? (
                          <div className="space-y-3 mt-1">
                            <div>
                              <label className="text-xs text-slate-500 font-medium mb-1 block">Question</label>
                              <textarea rows={3}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-300 resize-none"
                                value={draft.question_text}
                                onChange={e => setDraft(d => ({ ...d, question_text: e.target.value }))} />
                            </div>
                            {editingQuestion?.question_type === 'multiple_choice' && isFillingChoices ? (
                              <div className="flex items-center gap-2 py-3 px-3 bg-primary-50 border border-primary-100 rounded-xl text-sm text-primary-700">
                                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                                Generating A/B/C/D choices with AI…
                              </div>
                            ) : (
                              <>
                                <AnswerEditor questionType={editingQuestion?.question_type ?? ''} draft={draft} setDraft={setDraft} />
                                {editingQuestion?.question_type === 'multiple_choice' && (
                                  <button type="button"
                                    onClick={() => editingId && fillChoicesForEdit(editingId)}
                                    disabled={isFillingChoices}
                                    className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1 self-start">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    {isFillingChoices ? 'Generating…' : 'Re-generate choices with AI'}
                                  </button>
                                )}
                              </>
                            )}
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <label className="text-xs text-slate-500 font-medium mb-1 block">Difficulty</label>
                                <select className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-300"
                                  value={draft.difficulty} onChange={e => setDraft(d => ({ ...d, difficulty: e.target.value }))}>
                                  <option value="easy">Easy</option>
                                  <option value="medium">Medium</option>
                                  <option value="hard">Hard</option>
                                </select>
                              </div>
                              <div className="flex-1">
                                <label className="text-xs text-slate-500 font-medium mb-1 block">Topic Tag</label>
                                <input className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-300"
                                  value={draft.topic_tag} onChange={e => setDraft(d => ({ ...d, topic_tag: e.target.value }))} />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-slate-800 text-sm font-medium leading-relaxed mb-1">{q.question_text}</p>
                            <ChoicesView q={q} />
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isEditing ? (
                          <>
                            <button onClick={() => updateMutation.mutate({ id: q.id, data: draft })} disabled={updateMutation.isPending} className="btn-success text-xs py-1.5 px-3">
                              <Save className="w-3.5 h-3.5" /> Save
                            </button>
                            <button onClick={() => setEditingId(null)} className="btn-secondary text-xs py-1.5 px-3">
                              <X className="w-3.5 h-3.5" /> Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            {!q.is_approved && (
                              <button onClick={() => approveMutation.mutate(q.id)} className="btn-success text-xs py-1.5 px-3">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                              </button>
                            )}
                            <button onClick={() => startEdit(q)} className="btn-secondary text-xs py-1.5 px-3">
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button onClick={() => deleteQuestionMutation.mutate(q.id)} className="btn-danger text-xs py-1.5 px-3">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: EXAMS
      ══════════════════════════════════════════════════════ */}
      {tab === 'exams' && (
        <div className="space-y-4">
          {/* Create exam header */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {exams.length > 0 ? `${exams.length} exam${exams.length !== 1 ? 's' : ''}` : 'No exams yet'}
            </p>
            <button
              onClick={() => { setShowCreateForm(f => !f); setSelectedExamQIDs(new Set()); setExamCreateError(''); }}
              className={showCreateForm ? 'btn-secondary' : 'btn-primary'}
            >
              {showCreateForm ? <><X className="w-4 h-4" /> Cancel</> : <><Plus className="w-4 h-4" /> Create Exam</>}
            </button>
          </div>

          {/* ── Inline create exam form ── */}
          {showCreateForm && (
            <div className="card border-primary-200 bg-primary-50/30 animate-slide-up">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                  <ClipboardCheck className="w-4 h-4 text-white" />
                </div>
                <h2 className="font-semibold text-slate-800">New Exam</h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Settings */}
                <div className="lg:col-span-2 space-y-3">
                  <div>
                    <label className="label">Title <span className="text-red-400">*</span></label>
                    <input className="input" placeholder="e.g. Midterm Exam" {...regExam('title', { required: true })} />
                  </div>
                  <div>
                    <label className="label">Instructions</label>
                    <textarea rows={2} className="input resize-none" placeholder="Instructions shown to students…" {...regExam('instructions')} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-400" /> Time Limit</label>
                      <input type="number" min={1} className="input" placeholder="minutes" {...regExam('time_limit_minutes')} />
                    </div>
                    <div>
                      <label className="label flex items-center gap-1.5"><Percent className="w-3.5 h-3.5 text-slate-400" /> Passing Score</label>
                      <input type="number" min={0} max={100} className="input" placeholder="e.g. 75" {...regExam('passing_score')} />
                    </div>
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-white border border-slate-100 hover:bg-slate-50 transition-colors">
                    <input type="checkbox" className="w-4 h-4 accent-primary-600" {...regExam('randomize_questions')} />
                    <div className="flex items-center gap-2">
                      <Shuffle className="w-4 h-4 text-primary-500" />
                      <div>
                        <p className="text-sm font-medium text-slate-700">Randomize order</p>
                        <p className="text-xs text-slate-400">Shuffle for each student</p>
                      </div>
                    </div>
                  </label>

                  {examCreateError && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2.5">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" /> {examCreateError}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={selectedExamQIDs.size === 0 || createExamMutation.isPending}
                      onClick={submitExam(data => onCreateExam(data, false))}
                      className="btn-secondary flex-1 justify-center text-sm"
                    >
                      {createExamMutation.isPending
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                        : <><Save className="w-4 h-4" /> Save Draft</>}
                    </button>
                    <button
                      type="button"
                      disabled={selectedExamQIDs.size === 0 || createExamMutation.isPending}
                      onClick={submitExam(data => onCreateExam(data, true))}
                      className="btn-success flex-1 justify-center text-sm"
                    >
                      {createExamMutation.isPending
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Publishing…</>
                        : <><Send className="w-4 h-4" /> Create & Publish</>}
                    </button>
                  </div>
                </div>

                {/* Question selector */}
                <div className="lg:col-span-3">
                  <div className="bg-white rounded-xl border border-slate-200 p-4 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-800 text-sm">Select Questions</h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {selectedExamQIDs.size} of {approvedQuestions.length} approved selected
                        </p>
                      </div>
                      {approvedQuestions.length > 0 && (
                        <button type="button" onClick={toggleAllExamQ}
                          className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1">
                          {selectedExamQIDs.size === approvedQuestions.length
                            ? <><CheckSquare className="w-3.5 h-3.5" /> Deselect all</>
                            : <><Square className="w-3.5 h-3.5" /> Select all</>}
                        </button>
                      )}
                    </div>
                    {approvedQuestions.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                        <FileQuestion className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-500 font-medium text-sm">No approved questions yet</p>
                        <p className="text-slate-400 text-xs mt-1">
                          Go to the{' '}
                          <button type="button" onClick={() => switchTab('saved')} className="text-primary-600 font-semibold hover:underline">
                            Questions tab
                          </button>
                          {' '}and approve some first
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5 overflow-y-auto max-h-64 pr-1">
                        {approvedQuestions.map((q, i) => {
                          const sel = selectedExamQIDs.has(q.id);
                          return (
                            <label key={q.id}
                              className={`flex gap-3 items-start cursor-pointer p-2.5 rounded-xl border transition-all duration-150 ${
                                sel ? 'bg-primary-50 border-primary-200' : 'bg-slate-50 border-transparent hover:bg-slate-100'
                              }`}>
                              <input type="checkbox" checked={sel} onChange={() => toggleExamQ(q.id)}
                                className="mt-0.5 accent-primary-600 w-4 h-4 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap gap-1 mb-0.5">
                                  <span className="text-xs text-slate-400">#{i + 1}</span>
                                  <span className={`badge text-xs ${typeColors[q.question_type] ?? 'bg-slate-100 text-slate-600'}`}>
                                    {typeLabel[q.question_type] ?? q.question_type}
                                  </span>
                                  <span className={`badge text-xs ${diffColors[q.difficulty] ?? 'bg-slate-100 text-slate-600'} capitalize`}>
                                    {q.difficulty}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-700 leading-snug line-clamp-2">{q.question_text}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Exam list ── */}
          {examsLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-slate-100" />)}</div>
          ) : exams.length === 0 && !showCreateForm ? (
            <div className="card text-center py-16">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No exams yet</p>
              <p className="text-slate-400 text-sm mt-1">Click "Create Exam" above to build your first exam</p>
            </div>
          ) : (
            <div className="space-y-3">
              {exams.map(e => {
                const cfg = examStatusConfig[e.status as keyof typeof examStatusConfig] ?? examStatusConfig.draft;
                const StatusIcon = cfg.icon;
                const isOpen = openExamId === e.id;
                return (
                  <div key={e.id} className="card flex flex-col gap-2">
                    {/* ── Exam card header ── */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                          <StatusIcon className="w-5 h-5 text-primary-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{e.title}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {e.time_limit_minutes ? `${e.time_limit_minutes} min` : 'No limit'}
                            </span>
                            <span className="text-xs text-slate-300">·</span>
                            <span className="text-xs text-slate-400">{new Date(e.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`badge ${cfg.color}`}><StatusIcon className="w-3 h-3" /> {cfg.label}</span>

                        {/* Single open/close button */}
                        <button
                          onClick={() => isOpen ? setOpenExamId(null) : openExamPanel(e.id, e.title, e.time_limit_minutes)}
                          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                            isOpen
                              ? 'bg-primary-50 border-primary-200 text-primary-700'
                              : 'bg-white border-slate-200 text-slate-500 hover:border-primary-300 hover:text-primary-600'
                          }`}>
                          {isOpen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          {isOpen ? 'Close' : 'Open'}
                        </button>

                        {e.status === 'draft' && (
                          <button onClick={() => examStatusMutation.mutate({ id: e.id, status: 'published' })}
                            className="btn-success text-xs py-1.5 px-3">
                            <Send className="w-3.5 h-3.5" /> Publish
                          </button>
                        )}
                        {e.status === 'published' && (
                          <button onClick={() => examStatusMutation.mutate({ id: e.id, status: 'closed' })}
                            className="btn-secondary text-xs py-1.5 px-3">
                            <X className="w-3.5 h-3.5" /> Disable
                          </button>
                        )}
                        {e.status === 'closed' && (
                          <button onClick={() => examStatusMutation.mutate({ id: e.id, status: 'published' })}
                            disabled={examStatusMutation.isPending}
                            className="btn-success text-xs py-1.5 px-3">
                            <RotateCcw className="w-3.5 h-3.5" /> Re-enable
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDeleteExamId(confirmDeleteExamId === e.id ? null : e.id)}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Delete exam">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* ── Combined open panel: settings + questions ── */}
                    {isOpen && (
                      <div className="border-t border-slate-100 pt-4 mt-1 animate-slide-up space-y-5">

                        {/* Settings section */}
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Exam Settings</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="md:col-span-2">
                              <label className="text-xs text-slate-500 font-medium mb-1 block">Title</label>
                              <input className="input text-sm" value={editExamDraft.title}
                                onChange={e2 => setEditExamDraft(d => ({ ...d, title: e2.target.value }))} />
                            </div>
                            <div className="md:col-span-2">
                              <label className="text-xs text-slate-500 font-medium mb-1 block">Instructions</label>
                              <textarea rows={2} className="input text-sm resize-none" value={editExamDraft.instructions}
                                onChange={e2 => setEditExamDraft(d => ({ ...d, instructions: e2.target.value }))} />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 font-medium mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Time Limit (min)</label>
                              <input type="number" min={1} className="input text-sm" placeholder="No limit"
                                value={editExamDraft.time_limit_minutes}
                                onChange={e2 => setEditExamDraft(d => ({ ...d, time_limit_minutes: e2.target.value === '' ? '' : Number(e2.target.value) }))} />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500 font-medium mb-1 flex items-center gap-1"><Percent className="w-3 h-3" /> Passing Score (%)</label>
                              <input type="number" min={0} max={100} className="input text-sm" placeholder="e.g. 75"
                                value={editExamDraft.passing_score}
                                onChange={e2 => setEditExamDraft(d => ({ ...d, passing_score: e2.target.value === '' ? '' : Number(e2.target.value) }))} />
                            </div>
                            <div className="md:col-span-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" className="accent-primary-600 w-4 h-4"
                                  checked={editExamDraft.randomize_questions}
                                  onChange={e2 => setEditExamDraft(d => ({ ...d, randomize_questions: e2.target.checked }))} />
                                <span className="text-xs text-slate-600 font-medium"><Shuffle className="w-3 h-3 inline mr-1" />Randomize question order</span>
                              </label>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => updateExamMutation.mutate({ id: e.id, data: editExamDraft })}
                              disabled={updateExamMutation.isPending || !editExamDraft.title.trim()}
                              className="btn-success text-xs py-1.5 px-3">
                              {updateExamMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : <><Save className="w-3.5 h-3.5" /> Save Settings</>}
                            </button>
                          </div>
                        </div>

                        {/* Questions section */}
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Questions</p>
                          {previewLoading ? (
                            <div className="space-y-2">{[...Array(3)].map((_, pi) => <div key={pi} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}</div>
                          ) : previewQuestions.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">No questions found.</p>
                          ) : (
                            <div className="space-y-2">
                              {previewQuestions.map((pq, pi) => {
                                const isEditingThis = editingId === pq.id;
                                return (
                                  <div key={pq.id} className={`rounded-xl px-3 py-2.5 border transition-colors ${isEditingThis ? 'bg-white border-primary-200' : 'bg-slate-50 border-transparent'}`}>
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap gap-1 mb-1">
                                          <span className="text-xs text-slate-400">#{pi + 1}</span>
                                          <span className={`badge text-xs ${typeColors[pq.question_type] ?? 'bg-slate-100 text-slate-600'}`}>{typeLabel[pq.question_type] ?? pq.question_type}</span>
                                          <span className={`badge text-xs ${diffColors[pq.difficulty] ?? 'bg-slate-100 text-slate-600'} capitalize`}>{pq.difficulty}</span>
                                          {pq.is_approved && <span className="badge text-xs bg-emerald-100 text-emerald-700"><CheckCircle className="w-3 h-3" /> Approved</span>}
                                        </div>
                                        {isEditingThis ? (
                                          <div className="space-y-3 mt-1">
                                            <div>
                                              <label className="text-xs text-slate-500 font-medium mb-1 block">Question</label>
                                              <textarea rows={3}
                                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-300 resize-none"
                                                value={draft.question_text}
                                                onChange={ev => setDraft(d => ({ ...d, question_text: ev.target.value }))} />
                                            </div>
                                            {pq.question_type === 'multiple_choice' && isFillingChoices ? (
                                              <div className="flex items-center gap-2 py-3 px-3 bg-primary-50 border border-primary-100 rounded-xl text-sm text-primary-700">
                                                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                                                Generating A/B/C/D choices with AI…
                                              </div>
                                            ) : (
                                              <>
                                                <AnswerEditor questionType={pq.question_type} draft={draft} setDraft={setDraft} />
                                                {pq.question_type === 'multiple_choice' && (
                                                  <button type="button"
                                                    onClick={() => fillChoicesForEdit(pq.id)}
                                                    disabled={isFillingChoices}
                                                    className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1">
                                                    <Sparkles className="w-3.5 h-3.5" />
                                                    {isFillingChoices ? 'Generating…' : 'Re-generate choices with AI'}
                                                  </button>
                                                )}
                                              </>
                                            )}
                                            <div className="flex gap-2">
                                              <div className="flex-1">
                                                <label className="text-xs text-slate-500 font-medium mb-1 block">Difficulty</label>
                                                <select className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-300"
                                                  value={draft.difficulty} onChange={ev => setDraft(d => ({ ...d, difficulty: ev.target.value }))}>
                                                  <option value="easy">Easy</option>
                                                  <option value="medium">Medium</option>
                                                  <option value="hard">Hard</option>
                                                </select>
                                              </div>
                                              <div className="flex-1">
                                                <label className="text-xs text-slate-500 font-medium mb-1 block">Topic Tag</label>
                                                <input className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-300"
                                                  value={draft.topic_tag} onChange={ev => setDraft(d => ({ ...d, topic_tag: ev.target.value }))} />
                                              </div>
                                            </div>
                                            <div className="flex gap-2">
                                              <button
                                                onClick={() => updateMutation.mutate({ id: pq.id, data: draft }, {
                                                  onSuccess: () => qc.invalidateQueries({ queryKey: ['exam-questions-preview', openExamId] }),
                                                })}
                                                disabled={updateMutation.isPending}
                                                className="btn-success text-xs py-1.5 px-3">
                                                <Save className="w-3.5 h-3.5" /> Save
                                              </button>
                                              <button onClick={() => setEditingId(null)} className="btn-secondary text-xs py-1.5 px-3">
                                                <X className="w-3.5 h-3.5" /> Cancel
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <>
                                            <p className="text-xs text-slate-700 leading-snug">{pq.question_text}</p>
                                            <ChoicesView q={pq} />
                                          </>
                                        )}
                                      </div>
                                      {!isEditingThis && (
                                        <button
                                          onClick={() => startEdit(pq)}
                                          className="flex-shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                                          title="Edit question">
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Delete confirm ── */}
                    {confirmDeleteExamId === e.id && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 animate-slide-up">
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <p className="text-xs text-red-700 flex-1">Delete <strong>{e.title}</strong>? This cannot be undone.</p>
                        <button onClick={() => deleteExamMutation.mutate(e.id)} disabled={deleteExamMutation.isPending}
                          className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-lg transition-colors">
                          {deleteExamMutation.isPending ? 'Deleting…' : 'Delete'}
                        </button>
                        <button onClick={() => setConfirmDeleteExamId(null)}
                          className="text-xs font-medium text-slate-500 hover:text-slate-700 px-2 py-1">
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
