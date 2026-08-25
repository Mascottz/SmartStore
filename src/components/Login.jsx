// src/components/Login.jsx
import { useState } from 'react';
import { ArrowRight, UserPlus, PlayCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, isDemoBackend } from '../lib/backend';
import { loginOrCreateDemo } from '../lib/demo';
import { useAuth } from '../context/AuthContext';
import { sanitize, isValidEmail, isValidPassword, isValidJoinCode } from '../lib/validate';
import { isSuperAdminEmail } from '../lib/superAdmin';
import logo from '/logo-smartstore.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [signupType, setSignupType] = useState('owner'); // 'owner' | 'staff'
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { refreshMembership } = useAuth();
  const isSuperAdmin = isSuperAdminEmail(email);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanEmail = sanitize(email).toLowerCase();
    const cleanPw = password;

    // Client-side validation
    if (!isValidEmail(cleanEmail)) {
      return toast.error('Please enter a valid email address.');
    }
    if (!isValidPassword(cleanPw)) {
      return toast.error('Password must be at least 6 characters.');
    }
    if (mode === 'signup' && signupType === 'staff') {
      if (!isValidJoinCode(joinCode.trim().toUpperCase())) {
        return toast.error('Join code must be 6 characters (letters and numbers).');
      }
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        await api.auth.signIn({ email: cleanEmail, password: cleanPw });
        await refreshMembership();
        if (isSuperAdminEmail(cleanEmail)) {
          sessionStorage.setItem('smartstore-super-admin-unlocked', 'true');
          toast.success('Welcome back, Administrator');
          navigate('/super-admin', { replace: true });
        } else {
          toast.success('Welcome back to SmartStore NG');
          navigate('/', { replace: true });
        }
      } else {
        const user = await api.auth.signUp({ email: cleanEmail, password: cleanPw });

        if (isSuperAdminEmail(user.email)) {
          sessionStorage.setItem('smartstore-super-admin-unlocked', 'true');
          toast.success('Administrator account created');
          navigate('/super-admin', { replace: true });
        } else if (signupType === 'staff') {
          await api.stores.joinWithCode(user.id, user.email, joinCode.trim().toUpperCase());
          await refreshMembership();
          toast.success('Request sent to the store owner for approval');
          navigate('/', { replace: true });
        } else {
          toast.success('Account created, let\'s set up your business');
          navigate('/onboarding', { replace: true });
        }
      }
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setLoading(true);
    try {
      await loginOrCreateDemo();
      await refreshMembership();
      toast.success('Welcome to the demo store');
      navigate('/', { replace: true });
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Could not start demo.');
    } finally {
      setLoading(false);
    }
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
          <div className="flex mb-6 bg-zinc-800 rounded-2xl p-1" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => setMode('login')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                mode === 'login'
                  ? 'bg-emerald-500 text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              onClick={() => setMode('signup')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                mode === 'signup'
                  ? 'bg-emerald-500 text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {mode === 'signup' && (
              <div className="flex gap-2" role="radiogroup" aria-label="Account type">
                <button
                  type="button"
                  role="radio"
                  aria-checked={signupType === 'owner'}
                  onClick={() => setSignupType('owner')}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                    signupType === 'owner'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                      : 'border-zinc-700 text-zinc-400 hover:text-white'
                  }`}
                >
                  I own a business
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={signupType === 'staff'}
                  onClick={() => setSignupType('staff')}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                    signupType === 'staff'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                      : 'border-zinc-700 text-zinc-400 hover:text-white'
                  }`}
                >
                  I&apos;m joining a store
                </button>
              </div>
            )}

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label htmlFor="login-email" className="block text-xs font-medium text-zinc-400">
                  Email address
                </label>
                {isSuperAdmin && (
                  <span className="rounded-full border border-red-500/50 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-red-300">
                    ADMIN
                  </span>
                )}
              </div>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@business.com"
                maxLength={200}
                className="w-full px-4 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-zinc-400 mb-1.5">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                maxLength={128}
                className="w-full px-4 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {mode === 'signup' && signupType === 'staff' && (
              <div>
                <label htmlFor="login-joincode" className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Store join code
                </label>
                <input
                  id="login-joincode"
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. 8G2KQP"
                  maxLength={6}
                  autoComplete="off"
                  className="w-full px-4 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 tracking-widest uppercase"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Ask the store owner for the join code (Team page).
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl font-semibold disabled:opacity-50 transition-all ${
                isSuperAdmin && mode === 'login'
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'bg-emerald-500 text-black hover:bg-emerald-400'
              }`}
            >
              {loading ? (
                'Please wait...'
              ) : mode === 'login' ? (
                <>
                  {isSuperAdmin ? 'Admin Sign In' : 'Log In'} <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Create Account <UserPlus className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {isDemoBackend && (
            <button
              onClick={handleDemo}
              disabled={loading}
              className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-zinc-700 text-zinc-300 text-sm font-medium hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-50 transition-all"
            >
              <PlayCircle className="w-4 h-4" />
              Try the demo store
            </button>
          )}
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          Point of Sale &middot; Inventory &middot; Reports, for every kind of business
        </p>
      </div>
    </div>
  );
}
