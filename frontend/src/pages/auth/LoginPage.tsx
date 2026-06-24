import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useState } from 'react';
import { Mail, Lock, ArrowRight, Brain, BookOpen, BarChart2 } from 'lucide-react';
import Logo from '../../components/Logo';

interface FormData { email: string; password: string; }

const features = [
  { icon: Brain,     label: 'AI-Generated Questions', desc: 'Contextually accurate questions from your learning materials' },
  { icon: BookOpen,  label: 'Smart File Processing',   desc: 'Upload documents and let the system handle the rest' },
  { icon: BarChart2, label: 'Rich Analytics',          desc: 'Track performance and identify weak topics instantly' },
];

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>();
  const { setUser } = useAuthStore();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (data: FormData) => {
    setLoading(true); setError('');
    try {
      const res = await api.post('/auth/login', data);
      setUser(res.data.user);
      const role = res.data.user.role as string;
      navigate(role === 'admin' ? '/admin' : role === 'educator' ? '/educator' : '/student');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Login failed. Please check your credentials.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel — branding ── */}
      <div className="hidden lg:flex lg:w-5/12 bg-[#1E3A8A] flex-col justify-between p-12">

        <div>
          <div className="mb-16">
            <Logo height={40} />
          </div>

          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Smarter Exams.<br />Built for People.
          </h1>
          <p className="text-blue-200 text-base leading-relaxed max-w-xs">
            Generate accurate questions from your learning materials and track performance — all in one place.
          </p>
        </div>

        <div className="space-y-6">
          {features.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-4">
              <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-blue-200" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">{label}</p>
                <p className="text-blue-300 text-xs mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-blue-400 text-xs">© {new Date().getFullYear()} UpQuiz. All rights reserved.</p>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-[#F8F7F4]">
        <div className="w-full max-w-sm animate-slide-up">

          {/* Mobile logo */}
          <div className="flex lg:hidden mb-8">
            <Logo height={36} />
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
            <p className="text-slate-500 mt-1 text-sm">Sign in to your account to continue</p>
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="input pl-10"
                  {...register('email', { required: 'Email is required' })}
                />
              </div>
              {errors.email && <p className="mt-1.5 text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  placeholder="••••••••"
                  className="input pl-10"
                  {...register('password', { required: 'Password is required' })}
                />
              </div>
              {errors.password && <p className="mt-1.5 text-xs text-red-500">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? 'Signing in…' : (<>Sign In <ArrowRight className="w-4 h-4" /></>)}
            </button>
          </form>

          <p className="text-sm text-center mt-6 text-slate-500">
            Don't have an account?{' '}
            <Link to="/register" className="font-semibold text-primary-600 hover:text-primary-700">
              Create one free
            </Link>
          </p>

        </div>
      </div>
    </div>
  );
}
