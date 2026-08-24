// src/components/SplashScreen.jsx
import logo from '/logo-smartstore.png';

export default function SplashScreen() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-6">
      <div className="w-24 h-24 rounded-3xl bg-zinc-900 flex items-center justify-center overflow-hidden shadow-2xl animate-pulse">
        <img
          src={logo}
          alt="SmartStore NG"
          className="w-full h-full object-contain"
        />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white text-center">
          SmartStore NG
        </h1>
        <p className="text-emerald-400 text-sm text-center mt-1">
          Smarter Management, Stronger Business
        </p>
      </div>
    </div>
  );
}
