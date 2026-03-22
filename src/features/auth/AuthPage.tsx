import { useState } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { login, signUp, loginWithGoogle } from './authService'
import fullLogo from '../../assets/full_logo.png'

type Mode = 'login' | 'signup'

const features = [
  'Track every set, rep, and PR',
  'Monitor your daily recovery',
  'Spot fatigue and soreness patterns',
  'Build a complete training archive',
]

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [signupSuccess, setSignupSuccess] = useState(false)

  const clearError = () => setError('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()

    if (!email.trim()) { setError('Email is required.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }

    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email.trim(), password)
        // Auth state change fires → App.tsx re-renders → main app shown
      } else {
        await signUp(email.trim(), password)
        setSignupSuccess(true)
      }
    } catch (err) {
      setError((err as Error).message ?? 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    clearError()
    setGoogleLoading(true)
    try {
      await loginWithGoogle()
      // Redirects to Google → returns to app → auth state fires
    } catch (err) {
      setError((err as Error).message ?? 'Google sign-in failed.')
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Left branding panel ──────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] shrink-0 px-12 py-16 bg-surface border-r border-border">
        <div>
          {/* Logo */}
          <div className="mb-16">
            <img src={fullLogo} alt="Kinetic — Track. Recover. Progress." className="w-48" />
          </div>

          {/* Headline */}
          <h1 className="text-5xl font-black text-text-primary leading-tight mb-4">
            Train with<br />
            <span className="text-primary">precision.</span>
          </h1>
          <p className="text-text-secondary text-lg leading-relaxed mb-12">
            The intelligent fitness platform that turns raw data into your competitive edge.
          </p>

          {/* Feature list */}
          <ul className="space-y-4">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-3 text-text-secondary">
                <CheckCircle2 size={16} className="text-primary shrink-0" />
                <span className="text-sm">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[10px] text-text-muted uppercase tracking-widest">
          © 2026 Kinetic · All rights reserved
        </p>
      </div>

      {/* ── Right auth panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-10 lg:hidden">
            <img src={fullLogo} alt="Kinetic — Track. Recover. Progress." className="w-36" />
          </div>

          {/* Mode switcher */}
          <div className="flex gap-1 p-1 bg-surface-2 border border-border rounded-xl mb-8">
            {(['login', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); clearError(); setSignupSuccess(false) }}
                className={cn(
                  'flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
                  mode === m
                    ? 'bg-primary text-black'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                {m === 'login' ? 'Log In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {/* Sign-up success state */}
          {signupSuccess ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 bg-primary/15 border border-primary/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={24} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold text-text-primary mb-2">Check your email</h2>
              <p className="text-text-secondary text-sm leading-relaxed">
                We sent a confirmation link to{' '}
                <span className="text-text-primary font-medium">{email}</span>.
                Click the link to activate your account.
              </p>
              <button
                onClick={() => { setSignupSuccess(false); setMode('login') }}
                className="mt-6 text-primary text-sm font-semibold hover:underline"
              >
                Back to Log In
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                <div>
                  <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearError() }}
                    placeholder="you@example.com"
                    className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearError() }}
                    placeholder="Min. 6 characters"
                    className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                {error && (
                  <p className="text-red-400 text-sm bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-black font-bold py-3 rounded-xl text-sm transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  {mode === 'login' ? 'Log In' : 'Create Account'}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-text-muted uppercase tracking-widest">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Google OAuth */}
              <button
                onClick={() => void handleGoogle()}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 bg-surface-2 border border-border text-text-primary font-medium py-3 rounded-xl text-sm hover:border-text-secondary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {googleLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                Continue with Google
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
