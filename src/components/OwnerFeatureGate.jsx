// components/OwnerFeatureGate.jsx
import { useAuth } from '../context/AuthContext';

export default function OwnerFeatureGate({ children }) {
  const { isOwnerActive, upgradeToOwner, formattedPlanExpiry } = useAuth();

  if (isOwnerActive) return children;

  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <p className="text-lg font-semibold text-white mb-2">
        Unlock this with Owner Mode
      </p>
      <p className="text-sm text-zinc-400 mb-1 max-w-xs">
        Get live dashboards, profit reports, and staff controls for just ₦10,000/month per store.
      </p>
      {formattedPlanExpiry && (
        <p className="text-xs text-zinc-500 mb-3">
          Your previous Owner plan expired on {formattedPlanExpiry}.
        </p>
      )}
      <button
        className="px-4 py-2 rounded-full bg-emerald-500 text-black font-medium hover:bg-emerald-400"
        onClick={upgradeToOwner}
      >
        Upgrade to Owner Mode
      </button>
    </div>
  );
}