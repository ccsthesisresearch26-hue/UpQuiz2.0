import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useState } from 'react';
import { Mail, Lock, User, ArrowRight, CheckCircle } from 'lucide-react';
import Logo from '../../components/Logo';

interface FormData {
  email: string; password: string; confirmPassword: string;
  first_name: string; last_name: string;
  role: 'educator' | 'student';
}

export default function RegisterPage() {
  const { register, handleSubmit, formState: { errors }, watch } = useForm<FormData>({ defaultValues: { role: 'student' } });
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const selectedRole = watch('role');

  const onSubmit = async (data: FormData) => {
    setLoading(true); setError('');
    try {
      await api.post('/auth/register', data);
      navigate('/login');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Registration failed.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F7F4] p-4">
      <div className="w-full max-w-md animate-slide-up">

        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/login" className="inline-block mb-6">
            <Logo height={38} />
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
          <p className="text-slate-500 mt-1 text-sm">Join UpQuiz and start learning smarter</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-7">
          {error && (
            <div className="mb-5 flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Role selector */}
            <div>
              <label className="label">I am a</label>
              <div className="grid grid-cols-2 gap-3">
                {(['student', 'educator'] as const).map(r => (
                  <label key={r}
                    className={`relative flex items-center gap-2.5 p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-150
                      ${selectedRole === r
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                  >
                    <input type="radio" value={r} {...register('role')} className="sr-only" />
                    {selectedRole === r && <CheckCircle className="w-4 h-4 text-primary-600 absolute top-2.5 right-2.5" />}
                    <span className={`text-sm font-semibold capitalize ${selectedRole === r ? 'text-primary-700' : 'text-slate-600'}`}>
                      {r}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">First name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input className="input pl-9" placeholder="Juan" {...register('first_name', { required: true })} />
                </div>
              </div>
              <div>
                <label className="label">Last name</label>
                <input className="input" placeholder="Dela Cruz" {...register('last_name', { required: true })} />
              </div>
            </div>

            <div>
              <label className="label">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="email" className="input pl-10" placeholder="you@example.com"
                  {...register('email', { required: 'Email required' })} />
              </div>
              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="password" className="input pl-10" placeholder="Min. 8 characters"
                  {...register('password', { required: 'Password required', minLength: { value: 8, message: 'Minimum 8 characters' } })} />
              </div>
              {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
            </div>

            <div>
              <label className="label">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="password" className="input pl-10" placeholder="Re-enter your password"
                  {...register('confirmPassword', {
                    required: 'Please confirm your password',
                    validate: (val) => val === watch('password') || 'Passwords do not match',
                  })} />
              </div>
              {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword.message}</p>}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-1">
              {loading ? 'Creating account…' : (<>Create Account <ArrowRight className="w-4 h-4" /></>)}
            </button>
          </form>

          <p className="text-sm text-center mt-5 text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-primary-600 hover:text-primary-700">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
