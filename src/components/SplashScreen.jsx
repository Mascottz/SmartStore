// src/components/SplashScreen.jsx
import logo from '/logo-smartstore.png';

export default function SplashScreen() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-6">
      <div className="w-24 h-24 rounded-3xl bg-zinc-900 flex items-center justify-center overflow-hidden shadow-2xl">
        <img
          src={logo}
          alt="SmartStore NG"
          className="w-full h-full object-contain"
        />
      </div>
      <div className="text-center space-y-2">
        <h1 className="text-xl font-semibold text-white">SmartStore NG</h1>
        <p className="text-xs text-zinc-400">
          Loading your store dashboard…
        </p>
      </div>
      <div className="mt-4 h-8 flex items-center justify-center">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    </div>
  );
}