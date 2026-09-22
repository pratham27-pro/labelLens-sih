import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../services/api';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import locations from '../constants/locations';

const STATES = locations.map(({ state }) => state);

export default function Inspections() {
  const location = useLocation();
  // Search/filters are supervisory tools (Director/Controller/Reviewer view).
  // Inspectors only ever see their own scans, so they get the plain list.
  const role = api.getUser()?.role?.toUpperCase();
  const showFilters = role !== 'INSPECTOR';
  // Seed from cache synchronously (fresh or stale) so revisiting the page
  // never flashes a skeleton, then revalidate in the background.
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [pendingCount, setPendingCount] = useState(() => api.getPendingScans().length);
  const districts = locations.find(({ state }) => state === stateFilter)?.districts || [];

  useEffect(() => {
    const handleResultsReady = () => {
      // The dashboard emits this as soon as a background scan changes from
      // PROCESSING to its final status. Reload now rather than waiting for a
      // browser refresh or the next polling interval.
      loadInspections();
      setPendingCount(api.getPendingScans().length);
    };
    window.addEventListener('almac:scan-results-ready', handleResultsReady);
    loadInspections();
    const timer = window.setInterval(() => {
      const count = api.getPendingScans().length;
      setPendingCount(count);
      if (count) loadInspections();
    }, 4000);
    return () => {
      window.removeEventListener('almac:scan-results-ready', handleResultsReady);
      window.clearInterval(timer);
    };
  }, []);

  const loadInspections = async () => {
    try {
      const data = await api.getComplianceInspections(1, 100);
      setInspections(data.items || []);
      setError('');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load inspections');
    } finally {
      setLoading(false);
    }
  };

  const filtered = inspections.filter((inspection) => {
    const query = searchQuery.trim().toLowerCase();
    const searchable = [
      inspection.id,
      inspection.productName,
      inspection.category,
      inspection.inspector?.fullName,
      inspection.inspector?.district,
      inspection.inspector?.state,
    ].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !query || searchable.includes(query);
    const matchesStatus = filter === 'all' || inspection.status === filter;
    const matchesState = !stateFilter || inspection.inspector?.state === stateFilter;
    const matchesDistrict = !districtFilter || inspection.inspector?.district === districtFilter;
    return matchesSearch && matchesStatus && matchesState && matchesDistrict;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-on-surface mb-2">Inspections</h1>
            <p className="text-on-surface-variant">All your compliance scans and results</p>
          </div>
          <Link to="/dashboard/scan" className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary to-primary-container text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all">
            <span className="material-symbols-outlined text-[20px]">add</span>
            New Scan
          </Link>
        </div>

        {location.state?.queued > 0 && pendingCount > 0 && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-secondary-container/60 border border-secondary/20 text-on-secondary-container">
            <span className="material-symbols-outlined">hourglass_top</span>
            <div><p className="font-semibold">{pendingCount} inspection{pendingCount > 1 ? 's are' : ' is'} being processed</p><p className="text-sm">You can continue working here. We’ll notify you when each result is ready.</p></div>
          </div>
        )}

        {/* Filters (supervisory roles only) */}
        {showFilters && (
        <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-sm space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search product, inspector, or scan ID"
              className="h-10 px-3 rounded-xl bg-surface-container-low border border-outline-variant/50 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <select
              value={stateFilter}
              onChange={(event) => {
                setStateFilter(event.target.value);
                setDistrictFilter('');
              }}
              className="h-10 px-3 rounded-xl bg-surface-container-low border border-outline-variant/50 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All states</option>
              {STATES.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
            <select
              value={districtFilter}
              onChange={(event) => setDistrictFilter(event.target.value)}
              disabled={!stateFilter}
              className="h-10 px-3 rounded-xl bg-surface-container-low border border-outline-variant/50 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            >
              <option value="">{stateFilter ? 'All districts' : 'Select a state first'}</option>
              {districts.map((district) => <option key={district} value={district}>{district}</option>)}
            </select>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="h-10 px-3 rounded-xl bg-surface-container-low border border-outline-variant/50 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">All statuses</option>
              <option value="compliant">Compliant</option>
              <option value="non_compliant">Non-Compliant</option>
              <option value="pending">Pending</option>
              <option value="escalated">Escalated</option>
            </select>
          </div>
          {(searchQuery || stateFilter || districtFilter || filter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStateFilter('');
                setDistrictFilter('');
                setFilter('all');
              }}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-surface-container-low rounded-xl animate-pulse"></div>)}
          </div>
        ) : error && filtered.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl p-16 text-center border border-error/30">
            <span className="material-symbols-outlined text-6xl text-error/50 mb-4 block">wifi_off</span>
            <h3 className="text-xl font-semibold text-on-surface mb-2">Could not load inspections</h3>
            <p className="text-on-surface-variant mb-6">{error}</p>
            <button onClick={loadInspections} className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary-container transition-all">
              <span className="material-symbols-outlined text-[20px]">refresh</span>
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl p-16 text-center border border-outline-variant/30">
            <span className="material-symbols-outlined text-6xl text-on-surface-variant/30 mb-4 block">fact_check</span>
            <h3 className="text-xl font-semibold text-on-surface mb-2">No inspections found</h3>
            <p className="text-on-surface-variant mb-6">
              {filter === 'all' ? 'Start your first compliance scan' : `No ${filter} inspections yet`}
            </p>
            <Link to="/dashboard/scan" className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary-container transition-all">
              <span className="material-symbols-outlined text-[20px]">add</span>
              New Scan
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 flex items-center justify-between gap-3 p-3 rounded-xl bg-error-container/60 border border-error/30">
                <p className="text-sm text-on-error-container flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">wifi_off</span>
                  Showing saved results — refresh failed: {error}
                </p>
                <button onClick={loadInspections} className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-error text-white text-xs font-semibold hover:opacity-90 transition-all">
                  Retry
                </button>
              </div>
            )}
            <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-container-low">
                  <tr>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Product</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Date</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Status</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Violations</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {filtered.map((inspection) => (
                    <tr key={inspection.id} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-primary text-[20px]">package</span>
                          </div>
                          <div>
                            <span className="font-medium text-on-surface block">{inspection.productName || 'Packaged Commodity'}</span>
                            <span className="text-xs text-on-surface-variant font-medium">{inspection.category || 'General Pre-Packaged Commodity'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-on-surface-variant">
                        {inspection.createdAt
                          ? new Date(inspection.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                          inspection.status === 'compliant' ? 'bg-success-container text-on-success-container' :
                          inspection.status === 'pending' ? 'bg-secondary-container text-on-secondary-container' :
                          inspection.status === 'escalated' ? 'bg-red-100 text-red-700' :
                          inspection.status === 'failed' ? 'bg-error-container text-on-error-container' : 'bg-error-container text-on-error-container'
                        }`}>
                          <span className="material-symbols-outlined text-[14px]">
                            {inspection.status === 'compliant' ? 'check_circle' : inspection.status === 'pending' ? 'hourglass_top' : inspection.status === 'escalated' ? 'crisis_alert' : inspection.status === 'failed' ? 'error' : 'gpp_bad'}
                          </span>
                          {inspection.status === 'compliant' ? 'Compliant' : inspection.status === 'pending' ? 'Waiting for result' : inspection.status === 'escalated' ? 'Escalated to Controller' : inspection.status === 'failed' ? 'Processing failed' : 'Non-Compliant'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-on-surface">{inspection.violationsCount ?? 0}</td>
                      <td className="px-6 py-4">
                        <Link to={`/dashboard/inspections/${inspection.id}`} className="text-primary font-medium text-sm hover:underline">View Details</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}

      </div>
    </DashboardLayout>
  );
}
