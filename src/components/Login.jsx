// src/components/Login.jsx
import { useState } from 'react';
import { ArrowRight, UserPlus } from 'lucide-react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import logo from '/logo-smartstore.png';

const DEMO_EMAIL = 'demo@smartstoreng.com';
const DEMO_PASSWORD = 'Demo1234!';

// Backend base URL
const API_BASE = 'https://smartstore-bill.onrender.com';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
        toast.success('Welcome back to SmartStore NG 👋');
        navigate('/', { replace: true });
      } else {
        if (!accessKey.trim()) {
          toast.error('Please enter your creator access key.');
          setLoading(false);
          return;
        }

        const res = await fetch(`${API_BASE}/create-owner`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            accessKey,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          console.error('create-owner failed', data);
          toast.error(
            data.error ||
              'Could not create owner account. Contact support.'
          );
          setLoading(false);
          return;
        }

        await signInWithEmailAndPassword(auth, email, password);
        toast.success('Owner account and store created 🎉');

        // New owners go into onboarding flow
        navigate('/onboarding', { replace: true });
      }
    } catch (error) {
      console.error(error);
      let message = 'Something went wrong. Please try again.';
      if (
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/invalid-credential'
      ) {
        message = 'Email or password is not correct.';
      } else if (error.code === 'auth/email-already-in-use') {
        message =
          'That email already has an account. Try logging in instead.';
      } else if (error.code === 'auth/weak-password') {
        message = 'Password is too weak. Try something stronger.';
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Brand */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 rounded-3xl bg-zinc-900 flex items-center justify-center overflow-hidden shadow-xl">
              <img
                src={logo}
                alt="SmartStore NG"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
            SmartStore NG
          </h1>
          <p className="text-emerald-400 mt-1 font-medium text-sm md:text-base">
            Smarter Management, Stronger Business
          </p>
        </div>

        {/* Card */}
        <div className="bg-zinc-900 rounded-3xl p-6 md:p-8 shadow-2xl border border-zinc-800">
          {/* Mode toggle */}
          <div className="flex mb-6 bg-zinc-800 rounded-2xl p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 py-2 rounded-2xl text-sm font-medium ${
                mode === 'login'
                  ? 'bg-zinc-950 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`flex-1 py-2 rounded-2xl text-sm font-medium ${
                mode === 'signup'
                  ? 'bg-zinc-950 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Create Owner Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm text-zinc-400 mb-2 font-medium">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 focus:border-emerald-500 rounded-2xl px-5 py-4 text-white placeholder-zinc-500 focus:outline-none transition text-sm"
                placeholder="owner@yourstore.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-2 font-medium">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 focus:border-emerald-500 rounded-2xl px-5 py-4 text-white placeholder-zinc-500 focus:outline-none transition text-sm"
                placeholder="••••••••"
                required
              />
              {mode === 'signup' && (
                <p className="text-xs text-zinc-500 mt-2">
                  Tip: Use a password you can remember easily at the shop.
                </p>
              )}
            </div>

            {mode === 'signup' && (
              <div>
                <label className="block text-sm text-zinc-400 mb-2 font-medium">
                  Creator access key
                </label>
                <input
                  type="password"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 focus:border-emerald-500 rounded-2xl px-5 py-4 text-white placeholder-zinc-500 focus:outline-none transition text-sm"
                  placeholder="Enter the key from SmartStore NG"
                  required
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Only approved store owners with a creator key can create
                  a SmartStore NG account.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-70 transition-all py-4 rounded-2xl font-semibold text-base md:text-lg flex items-center justify-center gap-3"
            >
              {loading ? (
                mode === 'login'
                  ? 'Signing you in...'
                  : 'Creating your owner account...'
              ) : mode === 'login' ? (
                <>
                  Enter SmartStore NG <ArrowRight className="w-5 h-5" />
                </>
              ) : (
                <>
                  Create Owner Account <UserPlus className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-emerald-400 hover:text-emerald-300 text-xs font-medium"
            >
              {mode === 'login'
                ? 'No owner account yet? Create one.'
                : 'Already have an owner account? Sign in.'}
            </button>
          </div>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={async () => {
                try {
                  await signInWithEmailAndPassword(
                    auth,
                    DEMO_EMAIL,
                    DEMO_PASSWORD
                  );
                  toast.success('You are now in SmartStore NG demo mode.');
                  navigate('/', { replace: true });
                } catch (e) {
                  console.error(e);
                  toast.error('Demo mode is not available right now.');
                }
              }}
              className="text-zinc-400 hover:text-zinc-200 text-xs font-medium"
            >
              Try Demo Mode →
            </button>
          </div>
        </div>

        <p className="text-center text-zinc-500 text-xs mt-8">
          Built for Nigerian Retailers • 2026
        </p>
      </div>
    </div>
  );
}