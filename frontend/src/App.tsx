import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuthStore } from './store/authStore';
import { api } from './services/api';

// ── Auth pages ───────────────────────────────────────────────
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// ── Admin pages ──────────────────────────────────────────────
import AdminDashboard from './pages/admin/AdminDashboard';
import ManageUsers from './pages/admin/ManageUsers';

// ── Educator pages ───────────────────────────────────────────
import EducatorDashboard from './pages/educator/EducatorDashboard';
import SubjectsPage from './pages/educator/SubjectsPage';
import DocumentsPage from './pages/educator/DocumentsPage';
import QuestionsPage from './pages/educator/QuestionsPage';
import AnalyticsPage from './pages/educator/AnalyticsPage';

// ── Student pages ────────────────────────────────────────────
import StudentDashboard from './pages/student/StudentDashboard';
import MyExamsPage from './pages/student/MyExamsPage';
import TakeExamPage from './pages/student/TakeExamPage';
import ResultsPage from './pages/student/ResultsPage';

// ── Layout ───────────────────────────────────────────────────
import ProtectedRoute from './components/ProtectedRoute';

function AuthInit({ children }: { children: ReactNode }) {
  const setUser = useAuthStore(s => s.setUser);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.get('/auth/me')
      .then(r => setUser(r.data))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthInit>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Admin */}
          <Route path="/admin" element={<ProtectedRoute role="admin" />}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<ManageUsers />} />
          </Route>

          {/* Educator */}
          <Route path="/educator" element={<ProtectedRoute role="educator" />}>
            <Route index element={<EducatorDashboard />} />
            <Route path="subjects" element={<SubjectsPage />} />
            <Route path="subjects/:subjectId/documents" element={<DocumentsPage />} />
            <Route path="subjects/:subjectId/questions" element={<QuestionsPage />} />
            <Route path="subjects/:subjectId/exams" element={<QuestionsPage />} />
            <Route path="subjects/:subjectId/exams/create" element={<QuestionsPage />} />
            <Route path="subjects/:subjectId/analytics" element={<AnalyticsPage />} />
            {/* legacy */}
            <Route path="subjects/:subjectId/generate" element={<QuestionsPage />} />
            <Route path="subjects/:subjectId/review" element={<QuestionsPage />} />
          </Route>

          {/* Student */}
          <Route path="/student" element={<ProtectedRoute role="student" />}>
            <Route index element={<StudentDashboard />} />
            <Route path="exams" element={<MyExamsPage />} />
            <Route path="exams/:examId/take" element={<TakeExamPage />} />
            <Route path="results/:attemptId" element={<ResultsPage />} />
          </Route>

          {/* Root redirect */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthInit>
    </BrowserRouter>
  );
}

function RootRedirect() {
  const role = useAuthStore(s => s.user?.role);
  if (!role) return <Navigate to="/login" replace />;
  if (role === 'admin') return <Navigate to="/admin" replace />;
  if (role === 'educator') return <Navigate to="/educator" replace />;
  return <Navigate to="/student" replace />;
}
