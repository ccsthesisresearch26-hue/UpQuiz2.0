import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import Layout from '../../components/Layout';
import { useAuthStore } from '../../store/authStore';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Plus, BookOpen, FileText, Sparkles, ClipboardCheck, BarChart2, Trash2, X, AlertTriangle, UserPlus, Check } from 'lucide-react';

interface Subject { id: string; name: string; description: string; }

export default function SubjectsPage() {
  const user = useAuthStore(s => s.user);
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [enrollEmail, setEnrollEmail] = useState('');
  const [enrollError, setEnrollError] = useState('');
  const [enrollSuccess, setEnrollSuccess] = useState('');
  const { register, handleSubmit, reset } = useForm<{ name: string; description: string }>();

  const { data: subjects = [], isLoading } = useQuery<Subject[]>({
    queryKey: ['subjects', user?.id],
    queryFn: () => api.get(`/subjects?educator_id=${user?.id}`).then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; description: string }) => api.post('/subjects', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['subjects'] }); setCreating(false); reset(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/subjects/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['subjects'] }); setConfirmDeleteId(null); },
  });

  const enrollMutation = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) =>
      api.post(`/subjects/${id}/enroll`, { email }),
    onSuccess: () => {
      setEnrollSuccess('Student enrolled successfully!');
      setEnrollEmail('');
      setEnrollError('');
      setTimeout(() => { setEnrollingId(null); setEnrollSuccess(''); }, 2000);
    },
    onError: (err: any) => setEnrollError(err.response?.data?.error ?? 'Enrollment failed'),
  });

  const subjectLinks = (id: string) => [
    { to: `/educator/subjects/${id}/documents`,  label: 'Documents',  icon: FileText,       color: 'text-blue-600    hover:bg-blue-50' },
    { to: `/educator/subjects/${id}/questions`,  label: 'Questions',  icon: Sparkles,       color: 'text-violet-600  hover:bg-violet-50' },
    { to: `/educator/subjects/${id}/questions?tab=exams`, label: 'Exams', icon: BookOpen, color: 'text-emerald-600 hover:bg-emerald-50' },
    { to: `/educator/subjects/${id}/analytics`,  label: 'Analytics',  icon: BarChart2,      color: 'text-rose-600    hover:bg-rose-50' },
  ];

  return (
    <Layout role="educator">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Subjects</h1>
          <p className="page-subtitle">Manage your subjects and learning materials</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> New Subject
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="card mb-6 border-primary-200 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">New Subject</h2>
            <button onClick={() => setCreating(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-3">
            <div>
              <label className="label">Subject name</label>
              <input className="input" placeholder="e.g. Biology 101" {...register('name', { required: true })} />
            </div>
            <div>
              <label className="label">Description <span className="text-slate-400 font-normal">(optional)</span></label>
              <textarea rows={2} className="input resize-none" placeholder="Brief description…" {...register('description')} />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="btn-primary">Create Subject</button>
              <button type="button" onClick={() => setCreating(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Subjects grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card h-48 animate-pulse bg-slate-100" />
          ))}
        </div>
      ) : subjects.length === 0 ? (
        <div className="card text-center py-16">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No subjects yet</p>
          <p className="text-slate-400 text-sm mt-1">Create your first subject to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {subjects.map(s => (
            <div key={s.id} className="card hover:shadow-card-hover transition-shadow duration-200">
              <div className="flex items-start gap-3 mb-4">
                <div className="stat-icon bg-gradient-primary w-10 h-10 rounded-xl flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-slate-900">{s.name}</h2>
                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{s.description || 'No description'}</p>
                </div>
                <button
                  onClick={() => { setEnrollingId(enrollingId === s.id ? null : s.id); setEnrollEmail(''); setEnrollError(''); setEnrollSuccess(''); }}
                  className="flex-shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-primary-500 hover:bg-primary-50 transition-colors"
                  title="Enroll student"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setConfirmDeleteId(s.id)}
                  className="flex-shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Delete subject"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Inline enroll form */}
              {enrollingId === s.id && (
                <div className="mb-3 p-3 bg-primary-50 border border-primary-100 rounded-xl animate-slide-up">
                  <p className="text-xs font-semibold text-primary-700 mb-2">Enroll a student by email</p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      className="input text-sm flex-1 py-1.5"
                      placeholder="student@example.com"
                      value={enrollEmail}
                      onChange={e => { setEnrollEmail(e.target.value); setEnrollError(''); }}
                    />
                    <button
                      onClick={() => enrollMutation.mutate({ id: s.id, email: enrollEmail })}
                      disabled={!enrollEmail.trim() || enrollMutation.isPending}
                      className="btn-primary text-xs py-1.5 px-3"
                    >
                      {enrollSuccess ? <Check className="w-3.5 h-3.5" /> : 'Enroll'}
                    </button>
                  </div>
                  {enrollError && <p className="text-xs text-red-600 mt-1.5">{enrollError}</p>}
                  {enrollSuccess && <p className="text-xs text-emerald-600 mt-1.5">{enrollSuccess}</p>}
                </div>
              )}

              {/* Inline delete confirmation */}
              {confirmDeleteId === s.id && (
                <div className="mb-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 animate-slide-up">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-700 flex-1">Delete <strong>{s.name}</strong> and all its data?</p>
                  <button
                    onClick={() => deleteMutation.mutate(s.id)}
                    disabled={deleteMutation.isPending}
                    className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-700 px-2 py-1"
                  >
                    Cancel
                  </button>
                </div>
              )}

              <div className="border-t border-slate-100 pt-3 flex flex-wrap gap-1">
                {subjectLinks(s.id).map(({ to, label, icon: Icon, color }) => (
                  <Link key={to} to={to}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${color}`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
