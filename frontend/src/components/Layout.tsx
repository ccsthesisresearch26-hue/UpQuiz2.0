import { ReactNode, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import {
  LayoutDashboard, Users, BookOpen, ClipboardCheck,
  LogOut, GraduationCap, Shield, Menu, X,
} from 'lucide-react';
import Logo from './Logo';
import Breadcrumb from './Breadcrumb';

interface Props {
  children: ReactNode;
  role: 'admin' | 'educator' | 'student';
}

const navConfig = {
  admin: [
    { to: '/admin',       label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/users', label: 'Users',     icon: Users },
  ],
  educator: [
    { to: '/educator',          label: 'Dashboard', icon: LayoutDashboard },
    { to: '/educator/subjects', label: 'Subjects',  icon: BookOpen },
  ],
  student: [
    { to: '/student',       label: 'Dashboard', icon: LayoutDashboard },
    { to: '/student/exams', label: 'My Exams',  icon: ClipboardCheck },
  ],
};

const roleIcons = {
  admin:    Shield,
  educator: GraduationCap,
  student:  BookOpen,
};

const roleBadgeColors = {
  admin:    'bg-rose-500/20 text-rose-300',
  educator: 'bg-primary-500/20 text-primary-300',
  student:  'bg-emerald-500/20 text-emerald-300',
};

const roleAvatarColors = {
  admin:    'bg-rose-500',
  educator: 'bg-primary-600',
  student:  'bg-emerald-600',
};

export default function Layout({ children, role }: Props) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const RoleIcon = roleIcons[role];

  const handleLogout = async () => {
    await api.post('/auth/logout').catch(() => {});
    logout();
    navigate('/login');
  };

  const navItems = navConfig[role];

  const SidebarContent = () => (
    <div className="flex flex-col h-full">

      {/* ── Logo ── */}
      <div className="px-4 py-5 border-b border-white/10">
        <Link to={`/${role}`} onClick={() => setSidebarOpen(false)}>
          <Logo height={34} />
        </Link>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">Menu</p>
        {navItems.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to || (to !== `/${role}` && location.pathname.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                active
                  ? 'bg-primary-600 text-white'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* ── User ── */}
      <div className="px-3 py-4 border-t border-white/10 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className={`w-8 h-8 rounded-full ${roleAvatarColors[role]} flex items-center justify-center flex-shrink-0`}>
            <span className="text-xs font-bold text-white">
              {user?.first_name?.[0]}{user?.last_name?.[0]}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{user?.first_name} {user?.last_name}</p>
            <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium capitalize ${roleBadgeColors[role]}`}>
              <RoleIcon className="w-3 h-3" /> {role}
            </span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-white/10 hover:text-white transition-colors duration-150"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F8F7F4]">

      {/* ── Sidebar — desktop (fixed) ── */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 h-full w-60 bg-[#1E293B] z-40">
        <SidebarContent />
      </aside>

      {/* ── Sidebar — mobile (overlay) ── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-60 bg-[#1E293B] flex flex-col h-full shadow-xl animate-slide-up">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* ── Main content area ── */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">

        {/* ── Top bar ── */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 h-12 flex items-center gap-4">
          <button
            className="lg:hidden text-slate-500 hover:text-slate-800 transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <Breadcrumb />
        </header>

        {/* ── Page content ── */}
        <main className="flex-1 px-4 sm:px-6 py-7 animate-fade-in max-w-7xl w-full mx-auto">
          {children}
        </main>

        {/* ── Footer ── */}
        <footer className="px-6 py-3 border-t border-slate-200 bg-white">
          <p className="text-xs text-slate-400">UpQuiz · AI-Powered Exam Platform</p>
        </footer>
      </div>
    </div>
  );
}
