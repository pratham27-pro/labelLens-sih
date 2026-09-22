import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { SeverityBadge, ScoreBar } from '../components/dashboard/widgets';

const RANGES = [
  { id: '7', label: 'Last 7 Days' },
  { id: '30', label: 'Last 30 Days' },
  { id: 'ytd', label: 'YTD' },
];

const DONUT_COLORS = ['#6366f1', '#f43f5e', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

function MetricCard({ icon, title, value, subtitle }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/50 hover:shadow-md transition-all">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
          <span className="material-symbols-outlined text-slate-700 text-[20px]">{icon}</span>
        </div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
      </div>
      <div className="text-3xl font-bold text-slate-900 tracking-tight">{value ?? 0}</div>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  );
}

// SVG donut for the rule violation breakdown.
function ViolationDonut({ data }) {
  const total = data.reduce((s, d) => s + d.occurrences, 0);
  const size = 180;
  const stroke = 26;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Precompute dash offsets so rendering stays a pure function of props.
  const segments = useMemo(() => {
    let acc = 0;
    return data.map((d) => {
      const dash = total > 0 ? (d.occurrences / total) * circumference : 0;
      const segment = { ...d, dash, offset: acc };
      acc += dash;
      return segment;
    });
  }, [data, total, circumference]);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center py-12">
        <span className="material-symbols-outlined text-emerald-400 text-5xl">verified</span>
        <p className="text-sm text-slate-500 mt-3">No violations in this period.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
        {segments.map((d, i) => (
          <circle
            key={d.rule_code}
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
            strokeWidth={stroke}
            strokeDasharray={`${d.dash} ${circumference - d.dash}`}
            strokeDashoffset={-d.offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ))}
        <text x="50%" y="47%" textAnchor="middle" dominantBaseline="central" fontSize="26" fontWeight="bold" fill="#0f172a">
          {total}
        </text>
        <text x="50%" y="60%" textAnchor="middle" fontSize="10" fill="#94a3b8" fontWeight="bold" letterSpacing="1">
          VIOLATIONS
        </text>
      </svg>
      <ul className="space-y-2 flex-1 min-w-0">
        {data.map((d, i) => (
          <li key={d.rule_code} className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="text-xs font-bold text-slate-800 font-mono truncate flex-1">{d.rule_code}</span>
            <SeverityBadge severity={d.severity} />
            <span className="text-xs font-extrabold text-slate-900 w-8 text-right">{d.occurrences}</span>
            <span className="text-[10px] text-slate-400 w-10 text-right">{Math.round((d.occurrences / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// SVG line chart tracking inspections vs reports over time.
function VelocityChart({ series }) {
  if (!series || series.length < 2) {
    return (
      <div className="flex flex-col items-center py-12">
        <span className="material-symbols-outlined text-slate-300 text-5xl">show_chart</span>
        <p className="text-sm text-slate-500 mt-3">Not enough data points to plot a trend yet.</p>
      </div>
    );
  }

  const w = 640, h = 220, pad = 36;
  const maxY = Math.max(1, ...series.map((p) => Math.max(p.inspections, p.reports)));
  const x = (i) => pad + (i / (series.length - 1)) * (w - pad * 2);
  const y = (v) => h - pad - (v / maxY) * (h - pad * 2);
  const path = (key) => series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const areaPath = `${path('inspections')} L${x(series.length - 1).toFixed(1)},${h - pad} L${pad},${h - pad} Z`;

  const labelEvery = Math.ceil(series.length / 8);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad} x2={w - pad} y1={y(maxY * f)} y2={y(maxY * f)} stroke="#f1f5f9" strokeWidth="1" />
          <text x={pad - 6} y={y(maxY * f)} textAnchor="end" dominantBaseline="central" fontSize="9" fill="#94a3b8">
            {Math.round(maxY * f)}
          </text>
        </g>
      ))}
      <path d={areaPath} fill="rgba(99,102,241,0.08)" />
      <path d={path('inspections')} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={path('reports')} fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 4" />
      {series.map((p, i) =>
        i % labelEvery === 0 ? (
          <text key={p.date} x={x(i)} y={h - 12} textAnchor="middle" fontSize="9" fill="#94a3b8">
            {p.date.slice(5)}
          </text>
        ) : null
      )}
      <g transform={`translate(${w - pad - 150}, 8)`}>
        <line x1="0" x2="18" y1="4" y2="4" stroke="#6366f1" strokeWidth="2.5" />
        <text x="24" y="4" dominantBaseline="central" fontSize="10" fill="#475569" fontWeight="bold">Inspections</text>
        <line x1="90" x2="108" y1="4" y2="4" stroke="#f43f5e" strokeWidth="2.5" strokeDasharray="5 4" />
        <text x="114" y="4" dominantBaseline="central" fontSize="10" fill="#475569" fontWeight="bold">Reports</text>
      </g>
    </svg>
  );
}

export default function DirectorDashboard() {
  const [stats, setStats] = useState(null);
  const [range, setRange] = useState('30');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.getDirectorDashboard(range)
      .then((data) => setStats(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [range]);

  const leaderboard = stats?.state_leaderboard ?? [];
  const bestState = leaderboard[0];
  const focusState = useMemo(
    () => leaderboard.find((s) => Number(s.avg_compliance_score) < 80) || null,
    [leaderboard]
  );

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-red-500 text-3xl">error</span>
          </div>
          <p className="text-slate-700 font-semibold">{error}</p>
          <button onClick={() => window.location.reload()} className="px-5 py-2.5 bg-slate-800 text-white rounded-xl font-semibold text-sm hover:bg-slate-900 transition-colors">Retry</button>
        </div>
      </DashboardLayout>
    );
  }

  const m = stats?.metrics ?? {};

  return (
    <DashboardLayout>
      <div className="space-y-7 pb-8">

        {/* Header with global date-range filter */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 text-white text-xs font-semibold mb-3">
              <span className="material-symbols-outlined text-[15px]">public</span>
              DIRECTOR — NATIONAL OVERVIEW
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Compliance Analytics</h1>
            <p className="text-sm text-slate-500 mt-1">
              Macro trends and systemic health across every jurisdiction.
            </p>
            <Link
              to="/dashboard/inspections"
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">fact_check</span>
              Browse All Inspections
            </Link>
          </div>
          {/* Date range picker */}
          <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 w-fit">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  range === r.id ? 'bg-white text-slate-900 shadow-md' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-32 bg-slate-100 rounded-2xl" />)}</div>
            <div className="grid grid-cols-2 gap-6">{[1,2].map(i => <div key={i} className="h-72 bg-slate-100 rounded-3xl" />)}</div>
          </div>
        ) : (
          <>
            {/* Global metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard icon="document_scanner" title="Inspections" value={m.total_inspections} subtitle="in selected range" />
              <MetricCard icon="verified" title="Compliance Rate" value={`${m.overall_compliance_rate_percent ?? 0}%`} subtitle={`${m.compliant_inspections ?? 0} passed`} />
              <MetricCard icon="gavel" title="Violations" value={m.total_violations_recorded} subtitle="recorded in range" />
              <MetricCard icon="description" title="Reports" value={m.reports_in_range} subtitle={`${m.complaints_in_range ?? 0} complaints in range`} />
            </div>

            {/* Leaderboard + donut row */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {/* State Compliance Leaderboard */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/50">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-base font-bold text-slate-900">State Compliance Leaderboard</h2>
                  <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">{stats?.range?.days === 'ytd' ? 'YTD' : `Last ${stats?.range?.days} days`}</span>
                </div>
                <p className="text-xs text-slate-400 mb-5">Average compliance score by state, ranked highest first</p>
                {leaderboard.length === 0 ? (
                  <div className="py-12 text-center">
                    <span className="material-symbols-outlined text-slate-300 text-4xl">map</span>
                    <p className="text-sm text-slate-500 mt-2">No state-attributed inspection data in this period.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Best performer callout */}
                    {bestState && (
                      <div className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-emerald-50 to-transparent border border-emerald-100">
                        <span className="material-symbols-outlined text-emerald-500 text-[22px]">emoji_events</span>
                        <p className="text-sm text-slate-700">
                          <span className="font-extrabold">{bestState.state}</span> leads the nation at{' '}
                          <span className="font-extrabold text-emerald-600">{Number(bestState.avg_compliance_score).toFixed(1)}%</span>
                        </p>
                      </div>
                    )}
                    {/* Needs-attention callout */}
                    {focusState && (
                      <div className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-red-50 to-transparent border border-red-100">
                        <span className="material-symbols-outlined text-red-500 text-[22px]">flag</span>
                        <p className="text-sm text-slate-700">
                          <span className="font-extrabold">{focusState.state}</span> trails at{' '}
                          <span className="font-extrabold text-red-600">{Number(focusState.avg_compliance_score).toFixed(1)}%</span> — below the 80% benchmark
                        </p>
                      </div>
                    )}
                    <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                      {leaderboard.map((s, i) => (
                        <div key={s.state} className="flex items-center gap-3">
                          <span className="text-[11px] font-extrabold text-slate-400 w-5 text-right">{i + 1}</span>
                          <span className="text-sm font-bold text-slate-800 w-28 truncate flex-shrink-0">{s.state}</span>
                          <ScoreBar score={s.avg_compliance_score} />
                          <span className="text-[11px] text-slate-400 w-16 text-right flex-shrink-0">{s.total_inspections} scans</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Rule Violation Breakdown donut */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/50">
                <h2 className="text-base font-bold text-slate-900">Rule Violation Breakdown</h2>
                <p className="text-xs text-slate-400 mb-5">Most common statutory violations nationwide</p>
                <ViolationDonut data={stats?.top_statutory_violations ?? []} />
              </div>
            </div>

            {/* Enforcement velocity */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/50">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-bold text-slate-900">Enforcement Velocity</h2>
                <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">{stats?.range?.days === 'ytd' ? 'YTD' : `Last ${stats?.range?.days} days`}</span>
              </div>
              <p className="text-xs text-slate-400 mb-4">Daily inspections conducted vs. reports generated — agency activity levels</p>
              <VelocityChart series={stats?.enforcement_velocity ?? []} />
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
