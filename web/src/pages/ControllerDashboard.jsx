import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { StatusPill, SeverityBadge, InspectionThumb, timeAgo } from '../components/dashboard/widgets';
import InspectionReportModal from '../components/InspectionReportModal';

function StatCard({ icon, title, value, subtitle, color = 'primary' }) {
  const palette = {
    primary:   { grad: 'from-rose-600 to-rose-700', light: 'bg-rose-50', text: 'text-rose-700' },
    success:   { grad: 'from-emerald-500 to-emerald-600', light: 'bg-emerald-50', text: 'text-emerald-700' },
    error:     { grad: 'from-red-500 to-red-600', light: 'bg-red-50', text: 'text-red-700' },
    warning:   { grad: 'from-amber-500 to-orange-500', light: 'bg-amber-50', text: 'text-amber-700' },
  };
  const c = palette[color] || palette.primary;
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/50 hover:shadow-lg transition-all">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${c.grad} flex items-center justify-center shadow-md`}>
          <span className="material-symbols-outlined text-white text-[22px]">{icon}</span>
        </div>
        {subtitle && <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${c.light} ${c.text}`}>{subtitle}</span>}
      </div>
      <div className="text-3xl font-bold text-slate-900 tracking-tight">{value ?? 0}</div>
      <div className="text-sm font-bold text-slate-800 mt-1">{title}</div>
    </div>
  );
}

function SortHeader({ label, keyName, sortKey, sortDir, onSort }) {
  return (
    <th
      className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-800 select-none"
      onClick={() => onSort(keyName)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`material-symbols-outlined text-[14px] ${sortKey === keyName ? 'text-rose-600' : 'text-slate-300'}`}>
          {sortKey === keyName && sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
        </span>
      </span>
    </th>
  );
}

export default function ControllerDashboard({ mode = 'analytics' }) {
  const user = api.getUser();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);
  const [sortKey, setSortKey] = useState('total_inspections');
  const [sortDir, setSortDir] = useState('desc');
  const [escalationSort, setEscalationSort] = useState('newest');
  const [escalationSeverity, setEscalationSeverity] = useState('ALL');
  const [escalationDate, setEscalationDate] = useState('');
  const escalationHub = stats?.escalation_hub ?? [];

  useEffect(() => {
    api.getControllerDashboard()
      .then((data) => setStats(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleGenerateReport = async (inspectionId) => {
    setGeneratingId(inspectionId);
    try {
      const data = await api.createComplianceReport(inspectionId);
      const inspection = await api.getComplianceInspection(inspectionId);
      setSelectedInspection(inspection || data?.report || null);
    } catch (err) {
      alert(err.message);
    } finally {
      setGeneratingId(null);
    }
  };

  const sortedDistricts = useMemo(() => {
    const rows = [...(stats?.district_breakdown ?? [])];
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * dir;
      return (av - bv) * dir;
    });
    return rows;
  }, [stats, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filteredEscalationHub = useMemo(() => {
    const rows = escalationHub.filter((inspection) => {
      const matchesSeverity = escalationSeverity === 'ALL' ||
        (inspection.violations || []).some((violation) => violation.severity === escalationSeverity);
      const timestamp = inspection.createdAt;
      const matchesDate = !escalationDate || (timestamp && new Date(timestamp).toISOString().slice(0, 10) === escalationDate);
      return matchesSeverity && matchesDate;
    });
    return rows.sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return escalationSort === 'oldest' ? aTime - bTime : bTime - aTime;
    });
  }, [escalationHub, escalationSort, escalationSeverity, escalationDate]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-pulse">
          <div className="h-40 bg-gradient-to-br from-rose-500/20 to-rose-700/20 rounded-3xl" />
          <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-32 bg-slate-100 rounded-2xl" />)}</div>
          <div className="grid grid-cols-2 gap-4">{[1,2].map(i => <div key={i} className="h-72 bg-slate-100 rounded-3xl" />)}</div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-red-500 text-3xl">error</span>
          </div>
          <p className="text-slate-700 font-semibold text-center max-w-sm">{error}</p>
          <button onClick={() => window.location.reload()} className="px-5 py-2.5 bg-rose-600 text-white rounded-xl font-semibold text-sm hover:bg-rose-700 transition-colors">Retry</button>
        </div>
      </DashboardLayout>
    );
  }

  const m = stats?.metrics ?? {};
  const districtBreakdown = sortedDistricts;
  const topOffenders = stats?.top_offenders ?? [];
  const escalatedComplaints = stats?.escalated_complaints ?? [];
  const maxScans = Math.max(1, ...districtBreakdown.map((d) => d.total_inspections));
  const scopeLabel = stats?.scope === 'STATE' ? 'State' : 'District';

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-8">

        {/* Header */}
        <div className="bg-gradient-to-br from-rose-700 via-rose-600 to-red-500 rounded-3xl p-6 sm:p-7 text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[380px] h-[380px] bg-white/5 rounded-full -mr-48 -mt-48 blur-3xl" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold mb-4">
              <span className="material-symbols-outlined text-[15px]">admin_panel_settings</span>
              CONTROLLER — {scopeLabel}: {stats?.scope === 'STATE' ? (user?.state || 'Unassigned') : (user?.district || 'Unassigned')}
            </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {mode === 'hub' ? 'Escalation Hub' : 'Jurisdiction Command Centre'}
              </h1>
            <p className="text-white/85 text-sm mt-2 max-w-xl">
              {mode === 'hub'
                ? 'Review escalated inspections and generate official enforcement reports.'
                : 'State-level aggregation and enforcement oversight for your jurisdiction.'}
            </p>
          </div>
        </div>

        {/* Analytics metrics */}
        {mode === 'analytics' && <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon="location_on" title="Total Inspections" value={m.total_inspections} subtitle={m.compliance_rate_percent != null ? `${m.compliance_rate_percent}% rate` : null} color="primary" />
          <StatCard icon="crisis_alert" title="Non-Compliant" value={m.non_compliant_inspections} subtitle={`${m.major_violations ?? 0} major`} color="error" />
          <StatCard icon="escalator_warning" title="Escalations" value={m.escalation_hub_count ?? 0} subtitle={`${m.escalated_complaints_count ?? 0} complaints`} color="warning" />
          <StatCard icon="groups" title="Active Inspectors" value={m.active_inspectors_count} subtitle={`${m.pending_consumer_complaints ?? 0} pending complaints`} color="success" />
        </div>}

        {/* Charts row: district performance + top offenders */}
        {mode === 'analytics' && <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Performance bar chart (avg compliance score per district) */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/50">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center">
                <span className="material-symbols-outlined text-rose-600 text-[20px]">bar_chart</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">District Performance</h2>
                <p className="text-xs text-slate-400">Average compliance score per district</p>
              </div>
            </div>
            {districtBreakdown.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">No inspection data in your jurisdiction yet.</p>
            ) : (
              <div className="space-y-3.5">
                {districtBreakdown.slice(0, 8).map((d) => (
                  <div key={d.district}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-sm font-semibold text-slate-700">{d.district}</span>
                      <span className="text-xs text-slate-400">{d.total_inspections} scans</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            d.avg_compliance_score >= 80 ? 'bg-emerald-500' : d.avg_compliance_score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(100, d.avg_compliance_score)}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-900 w-12 text-right">{Number(d.avg_compliance_score).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top offenders */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/50">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-500 text-[20px]">factory</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Top Offenders</h2>
                <p className="text-xs text-slate-400">Organizations with the most MAJOR violations</p>
              </div>
            </div>
            {topOffenders.length === 0 ? (
              <div className="py-10 text-center">
                <span className="material-symbols-outlined text-emerald-400 text-4xl">verified_user</span>
                <p className="text-sm text-slate-500 mt-2">No MAJOR violations on record. Clean jurisdiction!</p>
              </div>
            ) : (
              <ol className="space-y-2.5">
                {topOffenders.map((org, idx) => (
                  <li key={org.organization_id || idx} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-red-50/50 transition-colors">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0 ${
                      idx === 0 ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{org.organization_name}</p>
                      <p className="text-[11px] text-slate-400">{org.organization_type}</p>
                    </div>
                    <span className="text-sm font-extrabold text-red-600 flex-shrink-0">{org.major_violations}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>}

        {/* Escalation Hub */}
        {mode === 'hub' && <div className="bg-white rounded-3xl shadow-sm border border-slate-200/50 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-500 text-[20px]">crisis_alert</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Escalation Hub</h2>
                <p className="text-xs text-slate-500">Records requiring immediate legal or administrative action</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <select
                value={escalationSort}
                onChange={(event) => setEscalationSort(event.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                aria-label="Sort escalations by date"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
              <input
                type="date"
                value={escalationDate}
                onChange={(event) => setEscalationDate(event.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                aria-label="Filter escalations by date"
              />
              <select
                value={escalationSeverity}
                onChange={(event) => setEscalationSeverity(event.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                aria-label="Filter escalations by severity"
              >
                <option value="ALL">All severities</option>
                <option value="MAJOR">Major</option>
                <option value="CRITICAL">Critical</option>
                <option value="MINOR">Minor</option>
              </select>
              <Link to="/dashboard/complaints" className="inline-flex items-center gap-1 text-rose-600 font-bold text-sm hover:gap-2 transition-all">
                All Complaints <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </Link>
            </div>
          </div>
          {filteredEscalationHub.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <span className="material-symbols-outlined text-emerald-500 text-3xl">check_circle</span>
              </div>
              <p className="font-bold text-slate-700">No escalations</p>
              <p className="text-slate-500 text-sm mt-1">Nothing requires immediate action right now.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50/70">
                  <tr>
                    {['Product', 'Inspector', 'Score', 'Violations', 'Date', 'Action'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEscalationHub.map((insp) => {
                    const hasMajor = (insp.violations || []).some((v) => v.severity === 'MAJOR');
                    return (
                      <tr key={insp.id} className={`transition-colors ${hasMajor ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-slate-50/60'}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <InspectionThumb src={insp.annotatedImagePath || insp.imagePath} className="w-10 h-10" iconSize={20} />
                            <div>
                              <p className="text-sm font-semibold text-slate-900 truncate max-w-[150px]">
                                {insp.product?.brandName || insp.product?.commodityName || 'Unknown'}
                              </p>
                              {insp.status === 'ESCALATED' && (
                                <span className="text-[10px] font-bold text-rose-600 uppercase">reviewer-escalated</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-800">{insp.inspector?.fullName || '—'}</p>
                          <p className="text-[11px] text-slate-400">{insp.inspector?.district || ''}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-extrabold ${(insp.complianceScore ?? 0) >= 80 ? 'text-emerald-600' : (insp.complianceScore ?? 0) >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                            {insp.complianceScore != null ? `${Number(insp.complianceScore).toFixed(0)}%` : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {(insp.violations || []).slice(0, 3).map((v) => (
                              <SeverityBadge key={v.id} severity={v.severity} />
                            ))}
                            {(insp.violations?.length ?? 0) > 3 && (
                              <span className="text-[11px] text-slate-500 font-semibold">+{insp.violations.length - 3}</span>
                            )}
                            {(insp.violations?.length ?? 0) === 0 && <span className="text-xs text-slate-400">None</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          <span>{timeAgo(insp.createdAt)}</span>
                          <span className="block text-[10px] text-slate-400">
                            {insp.createdAt ? new Date(insp.createdAt).toLocaleString('en-IN') : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleGenerateReport(insp.id)}
                            disabled={generatingId === insp.id}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700 disabled:opacity-50 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[14px]">{generatingId === insp.id ? 'hourglass_top' : 'description'}</span>
                            {generatingId === insp.id ? 'Generating…' : 'Generate Report'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>}

        {/* Escalated complaints strip */}
        {mode === 'hub' && escalatedComplaints.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-rose-600 text-[20px]">forward_to_inbox</span>
              <p className="font-bold text-rose-800">Escalated Consumer Complaints ({escalatedComplaints.length})</p>
            </div>
            <ul className="space-y-2">
              {escalatedComplaints.slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 bg-white/70 rounded-xl px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{c.title}</p>
                    <p className="text-[11px] text-slate-500">{c.consumer?.fullName || 'Consumer'} · {c.district || '—'} · {timeAgo(c.createdAt)}</p>
                  </div>
                  <StatusPill status={c.status} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* District breakdown table */}
        {mode === 'analytics' && <div className="bg-white rounded-3xl shadow-sm border border-slate-200/50 overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">District Breakdown</h2>
            <p className="text-xs text-slate-500 mt-0.5">Sortable — click a column header</p>
          </div>
          {districtBreakdown.length === 0 ? (
            <p className="text-sm text-slate-400 p-10 text-center">No district data available.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50/70">
                  <tr>
                    <SortHeader label="District" keyName="district" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Total Scans" keyName="total_inspections" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Average Score" keyName="avg_compliance_score" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Pending Complaints" keyName="pending_complaints" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {districtBreakdown.map((d) => (
                    <tr key={d.district} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3.5 font-bold text-sm text-slate-900">{d.district}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-rose-400 rounded-full" style={{ width: `${(d.total_inspections / maxScans) * 100}%` }} />
                          </div>
                          <span className="text-sm font-semibold text-slate-700">{d.total_inspections}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-sm font-extrabold ${
                          d.avg_compliance_score >= 80 ? 'text-emerald-600' : d.avg_compliance_score >= 50 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {Number(d.avg_compliance_score).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-sm font-bold ${d.pending_complaints > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                          {d.pending_complaints}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>}
      </div>

      {selectedInspection && (
        <InspectionReportModal
          inspection={selectedInspection}
          onClose={() => setSelectedInspection(null)}
        />
      )}
    </DashboardLayout>
  );
}
