import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { StatusPill, SeverityBadge, ScoreRing, InspectionThumb, timeAgo } from '../components/dashboard/widgets';

function StatCard({ icon, title, value, subtitle, trend, color = 'primary' }) {
  const palette = {
    primary:   { grad: 'from-[#005d42] to-[#007a56]', light: 'bg-emerald-50',  text: 'text-[#005d42]' },
    success:   { grad: 'from-emerald-500 to-emerald-600', light: 'bg-emerald-50',  text: 'text-emerald-700' },
    error:     { grad: 'from-red-500 to-red-600',     light: 'bg-red-50',      text: 'text-red-700' },
    warning:   { grad: 'from-amber-500 to-orange-500', light: 'bg-amber-50',   text: 'text-amber-700' },
    secondary: { grad: 'from-indigo-500 to-indigo-600', light: 'bg-indigo-50', text: 'text-indigo-700' },
  };
  const c = palette[color] || palette.primary;
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/50 hover:shadow-lg transition-all duration-300">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${c.grad} flex items-center justify-center shadow-md`}>
          <span className="material-symbols-outlined text-white text-[22px]">{icon}</span>
        </div>
        {trend && <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${c.light} ${c.text}`}>{trend}</span>}
      </div>
      <div className="text-3xl font-bold text-slate-900 tracking-tight">{value ?? 0}</div>
      <div className="text-sm font-bold text-slate-800 mt-1">{title}</div>
      <div className="text-xs text-slate-500">{subtitle}</div>
    </div>
  );
}

export default function InspectorDashboard() {
  const user = api.getUser();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    const loadDashboard = () => api.getInspectorDashboard()
      .then((data) => {
        if (mounted) {
          setStats(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (mounted) setError(err.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    loadDashboard();
    const handleResultsReady = () => loadDashboard();
    window.addEventListener('almac:scan-results-ready', handleResultsReady);
    const timer = window.setInterval(() => {
      if (api.getPendingScans().length) loadDashboard();
    }, 4000);

    return () => {
      mounted = false;
      window.removeEventListener('almac:scan-results-ready', handleResultsReady);
      window.clearInterval(timer);
    };
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-pulse">
          <div className="h-56 bg-gradient-to-br from-[#005d42]/20 to-[#009688]/20 rounded-3xl" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-36 bg-slate-100 rounded-2xl" />)}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-56 bg-slate-100 rounded-2xl" />)}</div>
        </div>
      </DashboardLayout>
    );
  }

  // A transient poll failure must not blank a fully loaded dashboard —
  // only surface the error screen when there is no data to show.
  if (error && !stats) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-red-500 text-3xl">error</span>
          </div>
          <p className="text-slate-700 font-semibold">{error}</p>
          <button onClick={() => window.location.reload()} className="px-5 py-2.5 bg-[#005d42] text-white rounded-xl font-semibold text-sm hover:bg-[#007a56] transition-colors">Retry</button>
        </div>
      </DashboardLayout>
    );
  }

  const m = stats?.metrics ?? {};
  const recentInspections = stats?.recent_inspections ?? [];
  const assignedTasks = stats?.assigned_tasks ?? [];
  const topRules = stats?.top_violated_rules ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-7 pb-8">

        {/* Hero: action-first scan CTA */}
        <div className="bg-gradient-to-br from-[#005d42] via-[#007a56] to-[#009688] rounded-3xl p-6 sm:p-8 text-white shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-[420px] h-[420px] bg-white/5 rounded-full -mr-56 -mt-56 blur-3xl group-hover:scale-110 transition-transform duration-700" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-white/5 rounded-full -ml-32 -mb-32 blur-2xl" />
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center gap-6">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold mb-4">
                <span className="material-symbols-outlined text-[15px]">badge</span>
                FIELD INSPECTOR — {user?.district || 'No District'} · {user?.state || 'No State'}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2 tracking-tight">
                Welcome back, {user?.fullName?.split(' ')[0] || 'Inspector'}! 👋
              </h1>
              <p className="text-white/85 mb-5 max-w-lg leading-relaxed text-sm sm:text-base">
                {m.triaged_complaints_in_district > 0
                  ? `${m.triaged_complaints_in_district} triaged complaint${m.triaged_complaints_in_district !== 1 ? 's' : ''} and your scan log awaits. Start with a fresh inspection.`
                  : 'Scan products, review violations, and track your compliance performance on the go.'}
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/dashboard/scan"
                  className="inline-flex items-center gap-2.5 px-7 py-4 bg-white text-[#005d42] rounded-2xl font-bold shadow-xl hover:shadow-2xl hover:scale-[1.03] active:scale-95 transition-all duration-300 text-base"
                >
                  <span className="material-symbols-outlined text-[24px]">photo_camera</span>
                  New Scan
                </Link>
                <Link
                  to="/dashboard/inspections"
                  className="inline-flex items-center gap-2 px-6 py-4 bg-white/10 backdrop-blur-md border border-white/30 text-white rounded-2xl font-semibold hover:bg-white/20 active:scale-95 transition-all duration-300"
                >
                  <span className="material-symbols-outlined text-[20px]">fact_check</span>
                  My Inspections
                </Link>
              </div>
            </div>
            {/* Today's pulse */}
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 lg:w-48 flex lg:flex-col gap-4 lg:gap-3 justify-around">
              <div className="text-center">
                <p className="text-3xl font-extrabold">{m.scans_today ?? 0}</p>
                <p className="text-[11px] uppercase tracking-wider text-white/70 font-bold">Scans Today</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-extrabold">{m.compliance_rate_percent ?? 0}<span className="text-base">%</span></p>
                <p className="text-[11px] uppercase tracking-wider text-white/70 font-bold">Compliance</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon="document_scanner" title="Total Inspections" value={m.total_inspections} subtitle="All time" trend={m.compliance_rate_percent != null ? `${m.compliance_rate_percent}% rate` : 'No data'} color="primary" />
          <StatCard icon="verified" title="Compliant" value={m.compliant_inspections} subtitle="Passed all checks" color="success" />
          <StatCard icon="warning" title="Non-Compliant" value={m.non_compliant_inspections} subtitle="Need attention" trend={m.non_compliant_inspections === 0 ? 'All clear' : 'Action needed'} color="error" />
          <StatCard icon="gavel" title="Major Violations" value={m.major_violations} subtitle="High-priority findings" color="warning" />
        </div>

        {/* Assigned Tasks — complaint follow-ups (priority) */}
        {assignedTasks.length > 0 && (
          <section className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-3xl p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-amber-600 text-[22px]">assignment_late</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Assigned Tasks</h2>
                  <p className="text-xs text-slate-500">{assignedTasks.length} triaged complaint{assignedTasks.length !== 1 ? 's' : ''} awaiting your field inspection</p>
                </div>
              </div>
              <Link to="/dashboard/complaints" className="text-amber-700 font-bold text-xs hover:underline hidden sm:inline-flex items-center gap-1">
                All Complaints <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {assignedTasks.map((task) => (
                <div key={task.id} className="bg-white rounded-2xl p-4 border border-amber-100 shadow-sm hover:shadow-md transition-all flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-bold text-sm text-slate-900 leading-snug line-clamp-2">{task.title}</p>
                    <StatusPill status={task.status} />
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 mb-2">{task.description}</p>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
                    <span className="material-symbols-outlined text-[14px]">person</span>
                    <span className="font-semibold">{task.consumer?.fullName || 'Consumer'}</span>
                    <span className="text-slate-300">·</span>
                    <span>{timeAgo(task.createdAt)}</span>
                  </div>
                  <Link
                    to={`/dashboard/scan?complaint=${task.id}`}
                    className="mt-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#005d42] text-white rounded-xl font-bold text-xs hover:bg-[#007a56] active:scale-95 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                    Start Inspection
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent Scans — card grid */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Recent Scans</h2>
              <p className="text-xs text-slate-500 mt-0.5">Your last {recentInspections.length} inspections</p>
            </div>
            <Link to="/dashboard/inspections" className="inline-flex items-center gap-1 text-[#005d42] font-bold text-sm hover:gap-2 transition-all">
              View All <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          </div>
          {recentInspections.length === 0 ? (
            <div className="bg-white rounded-3xl p-14 text-center border border-slate-200/50">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-slate-400 text-4xl">inventory_2</span>
              </div>
              <p className="font-bold text-slate-700">No inspections yet</p>
              <p className="text-slate-500 text-sm mt-1 mb-5">Start your first compliance scan to see results here</p>
              <Link to="/dashboard/scan" className="inline-flex items-center gap-2 px-6 py-3 bg-[#005d42] text-white rounded-xl font-bold text-sm hover:bg-[#007a56] transition-colors">
                <span className="material-symbols-outlined text-[18px]">photo_camera</span> New Scan
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {recentInspections.map((insp) => (
                <Link
                  key={insp.id}
                  to={`/dashboard/inspections/${insp.id}`}
                  className="bg-white rounded-2xl p-4 border border-slate-200/50 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <InspectionThumb src={insp.annotatedImagePath || insp.imagePath} />
                    <ScoreRing score={insp.complianceScore} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-900 truncate">
                      {insp.product?.brandName || insp.product?.commodityName || 'Unnamed Scan'}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {insp.manufacturer?.name || insp.product?.category || 'Packaged Commodity'}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-auto">
                    <StatusPill status={insp.status} />
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600">
                      <span className={`material-symbols-outlined text-[15px] ${(insp.violations?.length ?? 0) > 0 ? 'text-red-500' : 'text-emerald-500'}`}>gavel</span>
                      {insp.violations?.length ?? 0}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">{timeAgo(insp.createdAt)}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Top violated rules — compact strip */}
        {topRules.length > 0 && (
          <section className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/50">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-500 text-[20px]">gavel</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Top Violated Rules</h2>
                <p className="text-xs text-slate-400">Your most frequent findings</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {topRules.map((rule, idx) => (
                <div key={`${rule.rule_code}-${idx}`} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{rule.rule_code}</p>
                    <SeverityBadge severity={rule.severity} />
                  </div>
                  <div className="ml-2 text-right flex-shrink-0">
                    <p className="text-lg font-bold text-red-600">{rule.occurrences}</p>
                    <p className="text-[10px] text-slate-400 uppercase">cases</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
