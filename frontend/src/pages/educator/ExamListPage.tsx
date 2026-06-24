import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { api } from '../../services/api';
import Layout from '../../components/Layout';
import { Plus, Clock, Globe, Lock, FileEdit, Send, X, RotateCcw, Trash2, AlertTriangle } from 'lucide-react';

interface Exam { id: string; title: string; status: string; time_limit_minutes: number | null; created_at: string; }

const statusConfig = {
  draft:     { label: 'Draft',     color: 'bg-slate-100 text-slate-600', icon: FileEdit },
  published: { label: 'Published', color: 'bg-emerald-100 text-emerald-700', icon: Globe },
  closed:    { label: 'Closed',    color: 'bg-red-100 text-red-600',     icon: Lock },
};

export default function ExamListPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const qc = useQueryClient();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: exams = [], isLoading } = useQuery<Exam[]>({
    queryKey: ['exams', subjectId],
    queryFn: () => api.get(`/exams?subject_id=${subjectId}`).then(r => r.data),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/exams/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exams', subjectId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/exams/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['exams', subjectId] }); setConfirmDeleteId(null); },
  });

  return (
    <Layout role="educator">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Exams</h1>
          <p className="page-subtitle">Build and publish exams from your approved questions</p>
        </div>
        <Link to={`/educator/subjects/${subjectId}/exams/create`} className="btn-primary">
          <Plus className="w-4 h-4" /> Create Exam
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-slate-100" />)}</div>
      ) : exams.length === 0 ? (
        <div className="card text-center py-16">
          <FileEdit className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No exams yet</p>
          <p className="text-slate-400 text-sm mt-1">Create your first exam from approved questions</p>
        </div>
      ) : (
        <div className="space-y-3">
          {exams.map(e => {
            const cfg = statusConfig[e.status as keyof typeof statusConfig] ?? statusConfig.draft;
            const StatusIcon = cfg.icon;
            return (
              <div key={e.id} className="card flex flex-col gap-2">
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

                    {e.status === 'draft' && (
                      <button onClick={() => statusMutation.mutate({ id: e.id, status: 'published' })}
                        className="btn-success text-xs py-1.5 px-3">
                        <Send className="w-3.5 h-3.5" /> Publish
                      </button>
                    )}
                    {e.status === 'published' && (
                      <button onClick={() => statusMutation.mutate({ id: e.id, status: 'closed' })}
                        className="btn-secondary text-xs py-1.5 px-3">
                        <X className="w-3.5 h-3.5" /> Disable
                      </button>
                    )}
                    {e.status === 'closed' && (
                      <button onClick={() => statusMutation.mutate({ id: e.id, status: 'published' })}
                        disabled={statusMutation.isPending}
                        className="btn-success text-xs py-1.5 px-3">
                        <RotateCcw className="w-3.5 h-3.5" /> Re-enable
                      </button>
                    )}

                    <button
                      onClick={() => setConfirmDeleteId(confirmDeleteId === e.id ? null : e.id)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete exam"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {confirmDeleteId === e.id && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 animate-slide-up">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-xs text-red-700 flex-1">Delete <strong>{e.title}</strong>? This cannot be undone.</p>
                    <button
                      onClick={() => deleteMutation.mutate(e.id)}
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
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
