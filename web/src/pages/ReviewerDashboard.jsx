import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import { StatusPill, SeverityBadge, ScoreBar, InspectionThumb, timeAgo, COMPLAINT_STATUSES } from '../components/dashboard/widgets';


function StatCard({ icon, title, value, subtitle, color = 'primary' }) {
  const palette = {
    primary:   { grad: 'from-indigo-600 to-indigo-700', light: 'bg-indigo-50', text: 'text-indigo-700' },
    error:     { grad: 'from-red-500 to-red-600',     light: 'bg-red-50',    text: 'text-red-700' },
    warning:   { grad: 'from-amber-500 to-orange-500', light: 'bg-amber-50', text: 'text-amber-700' },
    secondary: { grad: 'from-purple-500 to-purple-600', light: 'bg-purple-50', text: 'text-purple-700' },
  };
  const c = palette[color] || palette.primary;
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/50 hover:shadow-lg transition-all">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${c.grad} flex items-center justify-center shadow-md`}>
          <span className="material-symbols-outlined text-white text-[22px]">{icon}</span>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${c.light} ${c.text}`}>{subtitle}</span>
      </div>
      <div className="text-3xl font-bold text-slate-900 tracking-tight">{value ?? 0}</div>
      <div className="text-sm font-bold text-slate-800 mt-1">{title}</div>
    </div>
  );
}

function QaRow({ insp, expanded, onToggle, onApprove, onEscalate, onOverride, actionState }) {
  const violations = insp.violations || [];
  const imageUrl = insp.annotatedImagePath || insp.imagePath;
  return (
    <>
      <tr
        className={`cursor-pointer transition-colors ${expanded ? 'bg-indigo-50/50' : 'hover:bg-indigo-50/30'}`}
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <span className={`material-symbols-outlined text-indigo-500 text-[20px] transition-transform ${expanded ? 'rotate-90' : ''}`}>
            chevron_right
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <InspectionThumb src={imageUrl} className="w-10 h-10" iconSize={20} />
            <div>
              <p className="text-sm font-semibold text-slate-900">{insp.inspector?.fullName || '—'}</p>
              {insp.inspector?.badgeNumber && <p className="text-[11px] text-slate-400">#{insp.inspector.badgeNumber}</p>}
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <p className="text-sm font-semibold text-slate-900 truncate max-w-[140px]">
            {insp.product?.brandName || insp.product?.commodityName || 'Unknown'}
          </p>
          <p className="text-[11px] text-slate-400">{timeAgo(insp.createdAt)}</p>
        </td>
        <td className="px-4 py-3 min-w-[110px]"><ScoreBar score={insp.complianceScore} /></td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {violations.slice(0, 2).map((v) => <SeverityBadge key={v.id} severity={v.severity} />)}
            {violations.length > 2 && <span className="text-xs text-slate-500 font-semibold">+{violations.length - 2}</span>}
            {violations.length === 0 && <span className="text-xs text-slate-400">None</span>}
          </div>
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onApprove(insp)}
              disabled={actionState === 'busy'}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              title="Confirm the AI result and take ownership"
            >
              <span className="material-symbols-outlined text-[13px]">task_alt</span> Approve
            </button>
            <button
              onClick={() => onToggle()}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                expanded
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              title="Expand the row to override violation severities"
            >
              <span className="material-symbols-outlined text-[13px]">edit</span> Override
            </button>
            <button
              onClick={() => onEscalate(insp)}
              disabled={actionState === 'busy' || insp.status === 'ESCALATED'}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700 disabled:opacity-50 transition-colors"
              title="Flag for immediate Controller attention"
            >
              <span className="material-symbols-outlined text-[13px]">crisis_alert</span> Escalate
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-indigo-50/30">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Evidence image */}
              <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-center min-h-[220px]">
                {imageUrl ? (
                  <img src={imageUrl} alt="Annotated evidence" className="max-h-[320px] rounded-lg object-contain" />
                ) : (
                  <div className="text-center py-10">
                    <span className="material-symbols-outlined text-slate-300 text-5xl">image_not_supported</span>
                    <p className="text-xs text-slate-400 mt-2">No annotated evidence image</p>
                  </div>
                )}
              </div>
              {/* AI violations */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
                  <span>AI-Generated Violations ({violations.length})</span>
                  <Link
                    to={`/dashboard/inspections/${insp.id}`}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 normal-case hover:underline"
                  >
                    Full record <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                  </Link>
                </p>
                {violations.length === 0 ? (
                  <div className="py-8 text-center">
                    <span className="material-symbols-outlined text-emerald-400 text-4xl">verified</span>
                    <p className="text-sm text-slate-500 mt-2">No violations recorded on this inspection.</p>
                  </div>
                ) : (
                  <ul className="space-y-2.5 max-h-[320px] overflow-y-auto">
                    {violations.map((v) => (
                      <li key={v.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                        <div className="flex flex-col items-start gap-1.5 flex-shrink-0">
                          <SeverityBadge severity={v.severity} />
                          {/* Override: correct the AI's severity assessment */}
                          <label className="sr-only" htmlFor={`sev-${v.id}`}>
                            Override severity for {v.ruleCode}
                          </label>
                          <select
                            id={`sev-${v.id}`}
                            value={String(v.severity || '').toUpperCase() || 'MAJOR'}
                            disabled={actionState === 'busy'}
                            onChange={(e) => onOverride(insp, v, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] font-bold rounded-md border border-slate-200 bg-white px-1.5 py-1 text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
                            title="Override the AI severity assessment"
                          >
                            {['MAJOR', 'MINOR', 'INFO', 'CRITICAL'].map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900">
                            <span className="font-mono text-indigo-600">{v.ruleCode}</span> — {v.title}
                          </p>
                          {v.description && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{v.description}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ReviewerDashboard({ mode = 'analytics' }) {
  const user = api.getUser();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('qa');
  const [expandedId, setExpandedId] = useState(null);
  const [busyInspection, setBusyInspection] = useState(null); // id | null
  const [flash, setFlash] = useState(null); // { type: 'ok'|'err', msg }
  const [triagingId, setTriagingId] = useState(null);

  useEffect(() => {
    api.getReviewerDashboard()
      .then((data) => setStats(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const notify = (type, msg) => {
    setFlash({ type, msg });
    window.clearTimeout(notify._t);
    notify._t = window.setTimeout(() => setFlash(null), 3500);
  };

  const refresh = () => api.getReviewerDashboard().then(setStats).catch(() => {});

  const handleApprove = async (insp) => {
    setBusyInspection(insp.id);
    try {
      // Confirming without edits stamps the reviewer and upholds the AI result.
      await Promise.all((insp.violations || []).map((v) => api.confirmViolation(insp.id, v.id, {})));
      await api.approveInspection(insp.id);
      notify('ok', `AI result approved for ${insp.product?.brandName || 'inspection'}.`);
      await refresh();
    } catch (err) {
      notify('err', err.message);
    } finally {
      setBusyInspection(null);
    }
  };

  const handleEscalate = async (insp) => {
    setBusyInspection(insp.id);
    try {
      await api.escalateInspection(insp.id);
      notify('ok', 'Inspection escalated to the Controller.');
      await refresh();
    } catch (err) {
      notify('err', err.message);
    } finally {
      setBusyInspection(null);
    }
  };

  // Override: correct the AI's severity assessment on a single violation.
  const handleOverride = async (insp, violation, severity) => {
    if (String(violation.severity || '').toUpperCase() === severity) return;
    setBusyInspection(insp.id);
    try {
      await api.confirmViolation(insp.id, violation.id, { severity });
      notify('ok', `${violation.ruleCode} severity overridden to ${severity}.`);
      await refresh();
    } catch (err) {
      notify('err', err.message);
      await refresh();
    } finally {
      setBusyInspection(null);
    }
  };

  const handleTriage = async (complaint, status) => {
    setTriagingId(complaint.id);
    try {
      await api.triageComplaint(complaint.id, { status });
      notify('ok', `Complaint moved to ${status}.`);
      await refresh();
    } catch (err) {
      notify('err', err.message);
    } finally {
      setTriagingId(null);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 animate-pulse">
          <div className="h-40 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-3xl" />
          <div className="grid grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-2xl" />)}</div>
          <div className="h-96 bg-slate-100 rounded-3xl" />
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
          {error.toLowerCase().includes('district') && (
            <p className="text-slate-500 text-sm text-center max-w-sm">Contact your Controller to assign you a district jurisdiction.</p>
          )}
          <button onClick={() => window.location.reload()} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors">Retry</button>
        </div>
      </DashboardLayout>
    );
  }

  const m = stats?.metrics ?? {};
  const queue = stats?.validation_queue ?? [];
  const inbox = stats?.complaint_inbox ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-8">

        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-700 via-indigo-600 to-purple-600 rounded-3xl p-6 sm:p-7 text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[380px] h-[380px] bg-white/5 rounded-full -mr-48 -mt-48 blur-3xl" />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold mb-4">
              <span className="material-symbols-outlined text-[15px]">rate_review</span>
              REVIEWER — District: {user?.district || 'Unassigned'} · {user?.state || 'No State'}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {mode === 'queue' ? 'Inspection Validation Centre' : 'District Compliance Analytics'}
            </h1>
            <p className="text-white/85 text-sm mt-2 max-w-xl">
              {mode === 'queue'
                ? 'Validate, correct, or escalate AI findings before they enter the official record.'
                : 'Monitor district performance and reviewer workload at a glance.'}
            </p>
          </div>
        </div>

        {/* Header metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon="manage_search" title="Pending QA Scans" value={m.non_compliant_inspections} subtitle={`${m.pending_review_unassigned ?? 0} unassigned`} color="primary" />
          <StatCard icon="inbox" title="Open Complaints" value={m.open_complaints ?? 0} subtitle={`${m.pending_complaints_to_triage ?? 0} pending triage`} color="warning" />
          <StatCard icon="today" title="Scans Today" value={m.scans_today ?? 0} subtitle={`${m.total_district_inspections ?? 0} all time`} color="secondary" />
        </div>

        {flash && (
          <div className={`px-4 py-3 rounded-xl text-sm font-semibold ${flash.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {flash.msg}
          </div>
        )}

        {mode === 'analytics' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/50">
              <h2 className="text-base font-bold text-slate-900">District Performance</h2>
              <p className="text-xs text-slate-400 mt-1">Current reviewer coverage and compliance outcomes.</p>
              <div className="grid grid-cols-2 gap-3 mt-5">
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Compliance rate</p><p className="text-2xl font-bold text-slate-900 mt-1">{m.compliance_rate_percent ?? 0}%</p></div>
                <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Recorded violations</p><p className="text-2xl font-bold text-slate-900 mt-1">{m.total_district_violations ?? 0}</p></div>
              </div>
            </div>
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/50">
              <h2 className="text-base font-bold text-slate-900">Top Violated Rules</h2>
              <div className="space-y-3 mt-5">
                {(stats?.top_violated_rules ?? []).slice(0, 5).map((rule) => (
                  <div key={`${rule.rule_code}-${rule.severity}`} className="flex items-center justify-between text-sm">
                    <span className="font-mono font-semibold text-indigo-700">{rule.rule_code}</span>
                    <span className="text-slate-500">{rule.occurrences} occurrences</span>
                  </div>
                ))}
                {!stats?.top_violated_rules?.length && <p className="text-sm text-slate-500">No violations recorded yet.</p>}
              </div>
            </div>
          </div>
        )}

        {mode === 'queue' && (
          <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 w-fit">
            {[
              { id: 'qa', label: 'Validation Queue', icon: 'manage_search', count: queue.length },
              { id: 'complaints', label: 'Complaint Triage', icon: 'inbox', count: inbox.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  activeTab === tab.id ? 'bg-white text-indigo-700 shadow-md' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                {tab.label}
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Validation Queue */}
        {mode === 'queue' && activeTab === 'qa' && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200/50 overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Validation Queue</h2>
              <p className="text-xs text-slate-500 mt-0.5">Non-compliant inspections in {user?.district} — click a row to inspect evidence</p>
            </div>
            {queue.length === 0 ? (
              <div className="p-14 text-center">
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                  <span className="material-symbols-outlined text-emerald-500 text-4xl">check_circle</span>
                </div>
                <p className="font-bold text-slate-700">All clear!</p>
                <p className="text-slate-500 text-sm mt-1">No pending validation tasks in your district.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50/70">
                    <tr>
                      {['', 'Inspector', 'Product', 'Score', 'Violations', 'Actions'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {queue.map((insp) => (
                      <QaRow
                        key={insp.id}
                        insp={insp}
                        expanded={expandedId === insp.id}
                        onToggle={() => setExpandedId(expandedId === insp.id ? null : insp.id)}
                        onApprove={handleApprove}
                        onEscalate={handleEscalate}
                        onOverride={handleOverride}
                        actionState={busyInspection === insp.id ? 'busy' : null}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Complaint Triage */}
        {mode === 'queue' && activeTab === 'complaints' && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200/50 overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Complaint Triage</h2>
              <p className="text-xs text-slate-500 mt-0.5">PENDING & TRIAGED complaints in {user?.district} — move each to its next stage</p>
            </div>
            {inbox.length === 0 ? (
              <div className="p-14 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <span className="material-symbols-outlined text-slate-400 text-4xl">mark_email_read</span>
                </div>
                <p className="font-bold text-slate-700">Inbox zero!</p>
                <p className="text-slate-500 text-sm mt-1">No complaints awaiting triage.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {inbox.map((c) => (
                  <li key={c.id} className="px-5 py-4 hover:bg-slate-50/60 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm text-slate-900">{c.title}</p>
                          <StatusPill status={c.status} />
                        </div>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-1">{c.description}</p>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1.5">
                          <span className="material-symbols-outlined text-[13px]">person</span>
                          {c.consumer?.fullName || 'Consumer'}
                          <span className="text-slate-300">·</span>
                          {timeAgo(c.createdAt)}
                          {c.inspection && (
                            <>
                              <span className="text-slate-300">·</span>
                              <Link to={`/dashboard/inspections/${c.inspection.id}`} state={{ from: '/dashboard/validation-queue' }} className="text-indigo-600 font-semibold hover:underline">
                                linked inspection ({Number(c.inspection.complianceScore ?? 0).toFixed(0)}%)
                              </Link>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <label className="sr-only" htmlFor={`status-${c.id}`}>Complaint status</label>
                        <select
                          id={`status-${c.id}`}
                          value={c.status}
                          disabled={triagingId === c.id}
                          onChange={(e) => handleTriage(c, e.target.value)}
                          className="text-xs font-bold rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
                        >
                          {COMPLAINT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
