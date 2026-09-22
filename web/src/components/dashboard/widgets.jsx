// Shared presentational widgets for the role dashboards.
// Pure display components — no data fetching, no routing logic.
import { useState, useEffect } from 'react';

const STATUS_STYLES = {
  COMPLIANT: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'check_circle', label: 'Compliant' },
  NON_COMPLIANT: { bg: 'bg-red-100', text: 'text-red-700', icon: 'error', label: 'Non-Compliant' },
  PENDING: { bg: 'bg-amber-100', text: 'text-amber-700', icon: 'schedule', label: 'Pending' },
  PROCESSING: { bg: 'bg-amber-100', text: 'text-amber-700', icon: 'schedule', label: 'Processing' },
  ESCALATED: { bg: 'bg-rose-100', text: 'text-rose-700', icon: 'crisis_alert', label: 'Escalated' },
  TRIAGED: { bg: 'bg-sky-100', text: 'text-sky-700', icon: 'alt_route', label: 'Triaged' },
  RESOLVED: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'task_alt', label: 'Resolved' },
  DISMISSED: { bg: 'bg-slate-100', text: 'text-slate-600', icon: 'block', label: 'Dismissed' },
};

export function StatusPill({ status, className = '' }) {
  const cfg = STATUS_STYLES[String(status || '').toUpperCase()] || {
    bg: 'bg-slate-100', text: 'text-slate-600', icon: 'help', label: status || '—',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${cfg.bg} ${cfg.text} ${className}`}>
      <span className="material-symbols-outlined text-[13px]">{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

const SEVERITY_ICONS = {
  CRITICAL: { icon: 'dangerous', cls: 'bg-red-200 text-red-900' },
  MAJOR: { icon: 'gavel', cls: 'bg-red-100 text-red-700' },
  MINOR: { icon: 'error_outline', cls: 'bg-amber-100 text-amber-700' },
  INFO: { icon: 'info', cls: 'bg-blue-100 text-blue-700' },
};

// Single source of truth for complaint lifecycle statuses (Complaints page
// and the Reviewer triage tab both render from this list).
export const COMPLAINT_STATUSES = ['PENDING', 'TRIAGED', 'ESCALATED', 'RESOLVED', 'DISMISSED'];

export function SeverityBadge({ severity }) {
  const s = String(severity || '').toUpperCase();
  const cfg = SEVERITY_ICONS[s] || { icon: 'help_outline', cls: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${cfg.cls}`}>
      <span className="material-symbols-outlined text-[12px]">{cfg.icon}</span>
      {s || '—'}
    </span>
  );
}

// Circular compliance-score indicator (SVG ring).
export function ScoreRing({ score, size = 44, stroke = 5 }) {
  const pct = Math.max(0, Math.min(100, Number(score) || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fontSize={size * 0.28} fontWeight="bold" fill="#0f172a"
      >
        {Math.round(pct)}
      </text>
    </svg>
  );
}

// Inspection thumbnail with graceful fallback to an icon avatar.
export function InspectionThumb({ src, className = 'w-16 h-16', iconSize = 28 }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  return (
    <div className={`${className} rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center flex-shrink-0`}>
      {src && !failed ? (
        <img
          src={src}
          alt="Inspection evidence"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
          loading="lazy"
        />
      ) : (
        <span className="material-symbols-outlined text-slate-400" style={{ fontSize: iconSize }}>
          package_2
        </span>
      )}
    </div>
  );
}

// Human-readable relative timestamp ("2 hours ago").
export function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return '—';
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

// Horizontal bar used in leaderboard / district breakdown visualizations.
export function ScoreBar({ score, label }) {
  const pct = Math.max(0, Math.min(100, Number(score) || 0));
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex-1">
      {label && (
        <div className="flex justify-between text-xs mb-1">
          <span className="font-semibold text-slate-700">{label}</span>
          <span className="font-bold text-slate-900">{pct.toFixed(1)}%</span>
        </div>
      )}
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
