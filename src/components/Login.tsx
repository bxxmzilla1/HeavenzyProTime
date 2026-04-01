import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, ShieldCheck, Clock, MapPin, Smartphone, User as UserIcon, Key, ChevronRight, Mail } from 'lucide-react';

export default function Login() {
  const [mode, setMode] = useState<'admin' | 'worker'>('worker');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Worker Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Admin Login State
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
    } catch (err: any) {
      console.error("Admin Login Error:", err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError("Invalid email or password.");
      } else {
        setError(err.message || "Failed to login.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleWorkerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // 1. Find the user profile by displayName (username)
      // This is necessary because we use unique internal emails to avoid 'email-already-in-use' errors
      const q = query(
        collection(db, 'users_public'), 
        where('displayName', '==', username),
        where('role', '==', 'worker'),
        limit(1)
      );
      
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        throw new Error("Invalid username or password.");
      }

      const userData = snapshot.docs[0].data();
      const email = userData.email;

      // 2. Sign in with the retrieved unique email
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error("Worker Login Error:", err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError("Invalid username or password.");
      } else {
        setError(err.message || "Failed to login.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#f8fafc]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100">
          <div className="p-8 sm:p-10">
            <div className="flex justify-center mb-8">
              <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
                <Clock className="w-8 h-8 text-white" />
              </div>
            </div>

            <div className="text-center mb-8">
              <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">
                Heavenzy Pro
              </h1>
              <div className="flex justify-center gap-1 bg-gray-100 p-1 rounded-xl w-fit mx-auto">
                <button
                  onClick={() => setMode('worker')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                    mode === 'worker' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'
                  }`}
                >
                  Worker
                </button>
                <button
                  onClick={() => setMode('admin')}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                    mode === 'admin' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'
                  }`}
                >
                  Admin
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {mode === 'worker' ? (
                <motion.form
                  key="worker-form"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  onSubmit={handleWorkerLogin}
                  className="space-y-5"
                >
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Username</label>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium"
                        placeholder="Enter username"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Password</label>
                    <div className="relative">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-3 py-4 px-6 bg-blue-600 text-white rounded-2xl font-bold text-lg hover:bg-blue-700 transition-all active:scale-[0.98] disabled:opacity-50 shadow-xl shadow-blue-100"
                  >
                    {loading ? (
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        Login
                        <ChevronRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </motion.form>
              ) : (
                <motion.form
                  key="admin-form"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  onSubmit={handleAdminLogin}
                  className="space-y-5"
                >
                  <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50 text-center mb-2">
                    <ShieldCheck className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                    <p className="text-xs text-gray-600 font-medium">
                      Admin access requires email authentication.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Admin Email</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="email"
                        required
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium"
                        placeholder="admin@example.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Password</label>
                    <div className="relative">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="password"
                        required
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-3 py-4 px-6 bg-gray-900 text-white rounded-2xl font-bold text-lg hover:bg-gray-800 transition-all active:scale-[0.98] disabled:opacity-50 shadow-xl shadow-gray-200"
                  >
                    {loading ? (
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <LogIn className="w-5 h-5" />
                        Admin Login
                      </>
                    )}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 p-4 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 font-medium"
              >
                {error}
              </motion.div>
            )}

            <div className="mt-8 pt-8 border-t border-gray-50 flex justify-center gap-6">
              <div className="flex flex-col items-center gap-1">
                <MapPin className="w-4 h-4 text-gray-300" />
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">GPS</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Smartphone className="w-4 h-4 text-gray-300" />
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Device</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-gray-300" />
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Secure</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
