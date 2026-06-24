import { Link, useLocation, useParams } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

// Maps URL segments to human-readable labels
const SEGMENT_LABELS: Record<string, string> = {
  educator:  'Home',
  admin:     'Home',
  student:   'Home',
  subjects:  'Subjects',
  documents: 'Documents',
  questions: 'Questions',
  generate:  'Questions',
  review:    'Questions',
  analytics: 'Analytics',
  users:     'Users',
};

export default function Breadcrumb() {
  const location = useLocation();
  const params = useParams<Record<string, string>>();

  const segments = location.pathname.split('/').filter(Boolean);

  // Build crumbs, skipping dynamic ID segments (UUIDs / numeric IDs)
  const isId = (s: string) => /^[0-9a-f-]{8,}$/i.test(s) || /^\d+$/.test(s);

  const crumbs: { label: string; path: string }[] = [];
  let cumulativePath = '';

  for (const seg of segments) {
    cumulativePath += `/${seg}`;
    if (isId(seg)) continue; // skip raw IDs from breadcrumb
    const label = SEGMENT_LABELS[seg];
    if (label) {
      // Avoid duplicate labels in a row
      if (crumbs.length === 0 || crumbs[crumbs.length - 1].label !== label) {
        crumbs.push({ label, path: cumulativePath });
      }
    }
  }

  if (crumbs.length <= 1) return null; // nothing meaningful to show

  return (
    <nav className="flex items-center gap-1 text-sm">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.path} className="flex items-center gap-1">
            {i === 0 && <Home className="w-3.5 h-3.5 text-slate-400 mr-0.5" />}
            {isLast ? (
              <span className="text-slate-700 font-semibold">{crumb.label}</span>
            ) : (
              <Link to={crumb.path} className="text-slate-400 hover:text-primary-600 transition-colors">
                {crumb.label}
              </Link>
            )}
            {!isLast && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
          </span>
        );
      })}
    </nav>
  );
}
