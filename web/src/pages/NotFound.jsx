import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-8 text-center">
      <span className="material-symbols-outlined text-primary text-6xl mb-4">wrong_location</span>
      <h1 className="text-4xl font-bold text-on-surface mb-2">404</h1>
      <p className="text-on-surface-variant mb-8 max-w-md">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div className="flex gap-3">
        <Link
          to="/"
          className="px-6 py-3 rounded-xl bg-primary text-white font-semibold shadow-md hover:bg-primary-container transition-colors"
        >
          Back to Home
        </Link>
        <Link
          to="/dashboard"
          className="px-6 py-3 rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface font-semibold hover:bg-surface-container-low transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
