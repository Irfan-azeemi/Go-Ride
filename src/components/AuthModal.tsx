import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Camera, Eye, EyeOff, Loader2, Lock, Mail, Phone, ShieldCheck, User, X } from 'lucide-react';
import { auth, db, googleProvider } from '../lib/firebase';
import {
  compressImageFileToDataUrl,
  isValidPakistanPhone,
  normalizePakistanPhone,
} from '../utils/pakistan';
import { GoRideLogo } from './GoRideLogo';

export type AuthModalMode = 'customer-login' | 'customer-register' | 'admin-login';

interface AuthModalProps {
  open: boolean;
  mode: AuthModalMode;
  onModeChange: (mode: AuthModalMode) => void;
  onClose: () => void;
  onAuthenticated: (target: 'customer' | 'admin') => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  mode,
  onModeChange,
  onClose,
  onAuthenticated,
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [profileImage, setProfileImage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const compressed = await compressImageFileToDataUrl(file, 160, 14000);
      setProfileImage(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process profile image.');
    }
  };

  const verifyOrProvisionAdmin = async (uid: string, name: string, userEmail: string): Promise<boolean> => {
    const adminRef = doc(db, 'admins', uid);
    try {
      const existing = await getDoc(adminRef);
      if (existing.exists()) {
        return true;
      }
      // Bootstrapped owner can provision their own admin doc; unauthorized users are denied by Firestore rules
      await setDoc(adminRef, {
        uid,
        name: name || 'GoRide Administrator',
        email: userEmail,
        role: 'super_admin',
        createdAt: serverTimestamp(),
      });
      return true;
    } catch {
      return false;
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const user = cred.user;

      if (mode === 'admin-login') {
        const ok = await verifyOrProvisionAdmin(
          user.uid,
          user.displayName || 'Administrator',
          user.email || ''
        );
        if (!ok) {
          await signOut(auth);
          setError(
            'Access denied. This account is not registered as an authorized GoRide administrator.'
          );
          setLoading(false);
          return;
        }
        onAuthenticated('admin');
        onClose();
        return;
      }

      // Customer sign-in: create profile if missing and phone provided, otherwise let dashboard complete onboarding if needed
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          fullName: user.displayName || 'GoRide Customer',
          email: user.email || '',
          phone: '+92 300 0000000',
          role: 'customer',
          profileImage: user.photoURL || '',
          createdAt: serverTimestamp(),
        });
      }
      onAuthenticated('customer');
      onClose();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setError('Sign-in popup was closed before completing.');
      } else {
        setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (mode === 'customer-register') {
      if (fullName.trim().length < 2) {
        setError('Please enter your full name.');
        return;
      }
      if (!isValidPakistanPhone(phone)) {
        setError('Please enter a valid Pakistan mobile number (e.g., +92 300 1234567 or 0300-1234567).');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'customer-register') {
        const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        await updateProfile(cred.user, { displayName: fullName.trim() });
        const normalizedPhone = normalizePakistanPhone(phone);
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid,
          fullName: fullName.trim(),
          email: trimmedEmail,
          phone: normalizedPhone,
          role: 'customer',
          profileImage: profileImage || '',
          createdAt: serverTimestamp(),
        });
        onAuthenticated('customer');
        onClose();
        return;
      }

      const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      if (mode === 'admin-login') {
        const ok = await verifyOrProvisionAdmin(
          cred.user.uid,
          cred.user.displayName || 'Administrator',
          cred.user.email || trimmedEmail
        );
        if (!ok) {
          await signOut(auth);
          setError(
            'Access denied. This account does not have administrator permissions.'
          );
          setLoading(false);
          return;
        }
        onAuthenticated('admin');
        onClose();
        return;
      }

      onAuthenticated('customer');
      onClose();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setError(
          'Email/Password sign-in is not yet enabled in Firebase Console (Authentication -> Sign-in method). Please use "Continue with Google" below or enable Email/Password in Firebase Console.'
        );
      } else if (code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Please sign in instead.');
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setError('Invalid email or password. Please check your credentials.');
      } else {
        setError(err instanceof Error ? err.message : 'Authentication failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[2px] p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 sm:p-7 shadow-xl my-auto animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <GoRideLogo size="sm" />
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close sign in dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {mode === 'admin-login' ? (
          <div className="mb-5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#155EEF] mb-1.5">
              <ShieldCheck className="w-4 h-4" />
              Restricted Access
            </div>
            <h2 className="font-display text-2xl font-bold text-[#102E65]">
              Admin Portal Sign In
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Sign in with an authorized GoRide administrator account. Public registration is disabled.
            </p>
          </div>
        ) : (
          <div className="mb-5">
            <h2 className="font-display text-2xl font-bold text-[#102E65]">
              {mode === 'customer-register' ? 'Create Customer Account' : 'Welcome Back'}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              {mode === 'customer-register'
                ? 'Join GoRide Pakistan to book verified cars & bikes in seconds.'
                : 'Sign in to book rides, track driver arrival, and view trip history.'}
            </p>
          </div>
        )}

        {mode !== 'admin-login' && (
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mb-5">
            <button
              type="button"
              onClick={() => {
                setError(null);
                onModeChange('customer-login');
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === 'customer-login'
                  ? 'bg-white text-[#102E65] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Customer Login
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                onModeChange('customer-register');
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                mode === 'customer-register'
                  ? 'bg-white text-[#102E65] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Register
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 leading-relaxed">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleGoogleSignIn()}
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-800 flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-60"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
            />
          </svg>
          {mode === 'admin-login' ? 'Sign in as Admin with Google' : 'Continue with Google'}
        </button>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-slate-400">or use email credentials</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'customer-register' && (
            <>
              <div className="flex items-center gap-3 pb-1">
                <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                  {profileImage ? (
                    <img
                      src={profileImage}
                      alt="Profile preview"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <User className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <label className="text-xs font-semibold text-[#155EEF] hover:text-[#102E65] cursor-pointer inline-flex items-center gap-1.5">
                  <Camera className="w-4 h-4" />
                  <span>{profileImage ? 'Change Profile Photo' : 'Upload Profile Photo (Optional)'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => void handleAvatarUpload(e)}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Zainab Tariq"
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phone Number (Pakistan)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+92 300 1234567 or 0300-1234567"
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF] tabular-nums"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full pl-9 pr-10 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#155EEF]/20 focus:border-[#155EEF]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="p-1 text-slate-400 hover:text-slate-700 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-[#155EEF] hover:bg-[#102E65] text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'customer-register'
              ? 'Create Account'
              : mode === 'admin-login'
              ? 'Sign In to Admin Console'
              : 'Sign In'}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          {mode === 'admin-login' ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                onModeChange('customer-login');
              }}
              className="text-[#155EEF] font-semibold hover:underline cursor-pointer"
            >
              ← Back to Customer Login
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setError(null);
                onModeChange('admin-login');
              }}
              className="text-slate-600 hover:text-[#102E65] font-medium cursor-pointer"
            >
              Staff / Admin Portal →
            </button>
          )}
          <span>Asia/Karachi · PKR</span>
        </div>
      </div>
    </div>
  );
};
