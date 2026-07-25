// src/pages/OnboardingDashboard.jsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function OnboardingDashboard() {
  const {
    onboardingCompleted,
    storeProfileDone,
    categoriesDone,
    firstProductAdded,
    firstSaleCompleted,
  } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (onboardingCompleted) {
      navigate('/', { replace: true });
    }
  }, [onboardingCompleted, navigate]);

  const goToBusinessSetup = () => navigate('/onboarding/business');
  const goToAddProduct = () => navigate('/onboarding/inventory');
  const goToTestSale = () => navigate('/onboarding/pos');

  const profileDone = storeProfileDone && categoriesDone;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-5">
        <h1 className="text-2xl md:text-3xl font-semibold text-white mb-1">
          Get your SmartStore ready
        </h1>
        <p className="text-sm text-zinc-400 mb-4">
          Complete these quick steps so your shop is ready for real sales.
        </p>

        <div className="space-y-4">
          {/* Step 1: Business profile & categories */}
          <button
            onClick={goToBusinessSetup}
            className="w-full flex items-start gap-3 p-3 rounded-2xl bg-zinc-800/60 hover:bg-zinc-800 text-left"
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                profileDone
                  ? 'bg-emerald-500 text-black'
                  : 'bg-zinc-700 text-zinc-200'
              }`}
            >
              {profileDone ? '✓' : '1'}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                Set up your business
              </div>
              <div className="text-xs text-zinc-400">
                Business name and main product categories.
              </div>
            </div>
          </button>

          {/* Step 2: First product (required) */}
          <button
            onClick={goToAddProduct}
            className="w-full flex items-start gap-3 p-3 rounded-2xl bg-zinc-800/60 hover:bg-zinc-800 text-left"
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                firstProductAdded
                  ? 'bg-emerald-500 text-black'
                  : 'bg-zinc-700 text-zinc-200'
              }`}
            >
              {firstProductAdded ? '✓' : '2'}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                Add your first product
              </div>
              <div className="text-xs text-zinc-400">
                Create at least one product in your inventory.
              </div>
            </div>
          </button>

          {/* Step 3: Test sale (optional) */}
          <button
            onClick={goToTestSale}
            className="w-full flex items-start gap-3 p-3 rounded-2xl bg-zinc-800/60 hover:bg-zinc-800 text-left"
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                firstSaleCompleted
                  ? 'bg-emerald-500 text-black'
                  : 'bg-zinc-700 text-zinc-200'
              }`}
            >
              {firstSaleCompleted ? '✓' : '3'}
            </div>
            <div>
              <div className="text-sm font-semibold text-white">
                (Optional) Do a test sale
              </div>
              <div className="text-xs text-zinc-400">
                Use POS to run a small test sale when you’re ready.
              </div>
            </div>
          </button>
        </div>

        <p className="text-[11px] text-zinc-500 mt-3">
          Once steps 1 and 2 are done, your full SmartStore dashboard will unlock.
        </p>
      </div>
    </div>
  );
}