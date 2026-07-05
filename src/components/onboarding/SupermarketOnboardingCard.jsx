// src/components/onboarding/SupermarketOnboardingCard.jsx
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';

function Step({ done, title, description, to }) {
  const Wrapper = to ? Link : 'div';

  return (
    <Wrapper
      to={to}
      className={`flex items-start gap-3 p-3 rounded-lg ${
        to ? 'hover:bg-zinc-900 cursor-pointer' : ''
      }`}
    >
      <div className="mt-1">
        {done ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        ) : (
          <Circle className="w-5 h-5 text-zinc-600" />
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-100">{title}</p>
        <p className="text-xs text-zinc-400">{description}</p>
      </div>
    </Wrapper>
  );
}

export default function SupermarketOnboardingCard({ onboarding }) {
  const {
    storeProfileDone,
    categoriesDone,
    productsDone,
    staffDone,
    testSaleDone,
  } = onboarding || {};

  const allDone =
    storeProfileDone &&
    categoriesDone &&
    productsDone &&
    staffDone &&
    testSaleDone;

  if (allDone) return null;

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 md:p-5 shadow-lg shadow-black/40 max-w-xl">
      <h2 className="text-base md:text-lg font-semibold text-white mb-1">
        Get your supermarket ready
      </h2>
      <p className="text-xs text-zinc-400 mb-4">
        Complete these steps to start selling smoothly at the checkout.
      </p>

      <div className="space-y-1.5">
        <Step
          done={storeProfileDone}
          title="Confirm store details & tax"
          description="Set store name, currency, VAT, and receipt footer."
          to="/settings/store"
        />
        <Step
          done={categoriesDone}
          title="Add your main categories"
          description="Create categories like Beverages, Snacks, Household, Toiletries, etc."
          to="/inventory/categories"
        />
        <Step
          done={productsDone}
          title="Add or import products"
          description="Add key products or import from CSV with barcodes, prices, and stock."
          to="/inventory"
        />
        <Step
          done={staffDone}
          title="Create staff accounts"
          description="Add cashiers and supervisors and define their permissions."
          to="/team"
        />
        <Step
          done={testSaleDone}
          title="Do a test sale"
          description="Open POS and run a small test sale to confirm everything works."
          to="/pos"
        />
      </div>
    </div>
  );
}