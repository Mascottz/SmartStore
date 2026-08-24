// src/components/OwnerFeatureGate.jsx
// Blurs/locks premium widgets unless the store is on the Owner plan.
import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function OwnerFeatureGate({ children, label = 'Owner Mode feature' }) {
  const { plan, storeIsDemo } = useAuth();
  const navigate = useNavigate();

  if (plan === 'owner' || storeIsDemo) return children;

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none blur-sm select-none opacity-60">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/60 dark:bg-zinc-950/60">
        <Lock className="w-6 h-6 text-emerald-500" />
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {label}
        </p>
        <button
          onClick={() => navigate('/pricing')}
          className="px-4 py-2 rounded-full bg-emerald-500 text-black text-xs font-semibold hover:bg-emerald-400"
        >
          Upgrade to Owner Mode
        </button>
      </div>
    </div>
  );
}
