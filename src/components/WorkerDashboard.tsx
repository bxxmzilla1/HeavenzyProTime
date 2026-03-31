import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { collection, addDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { UserProfile, TimeLog } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, MapPin, Smartphone, LogOut, User as UserIcon, Camera, Briefcase, CheckCircle2, AlertCircle, Loader2, Sun, Moon } from 'lucide-react';
import { format } from 'date-fns';

export default function WorkerDashboard({ profile, isDarkMode, toggleDarkMode }: { profile: UserProfile; isDarkMode: boolean; toggleDarkMode: () => void }) {
  const [status, setStatus] = useState<'in' | 'out' | 'break' | 'loading'>('loading');
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // Profile Edit State
  const [editName, setEditName] = useState(profile.displayName);
  const [editJob, setEditJob] = useState(profile.jobTitle || '');
  const [editPhoto, setEditPhoto] = useState(profile.photoURL || '');

  useEffect(() => {
    const q = query(
      collection(db, 'timeLogs'),
      where('uid', '==', profile.uid),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const allLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeLog));
        setLogs(allLogs);
        const log = allLogs[0];
        if (log.type === 'in') setStatus('in');
        else if (log.type === 'break_start') setStatus('break');
        else if (log.type === 'break_end') setStatus('in');
        else setStatus('out');
      } else {
        setStatus('out');
      }
    }, (err) => {
      console.error("Snapshot Error:", err);
      setError("Failed to fetch logs. Check permissions.");
    });

    return () => unsubscribe();
  }, [profile.uid]);

  const getDeviceCode = () => {
    const ua = navigator.userAgent;
    const platform = navigator.platform;
    const screen = `${window.screen.width}x${window.screen.height}`;
    return btoa(`${ua}-${platform}-${screen}`).substring(0, 12);
  };

  const handleClockAction = async (typeOverride?: 'break_start' | 'break_end') => {
    setIsProcessing(true);
    setError(null);

    try {
      // 1. Check Location Permission
      if (!navigator.geolocation) {
        throw new Error("Geolocation is not supported by your browser.");
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });

      const loc = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      setLocation(loc);

      // 2. Prepare Log
      const deviceCode = getDeviceCode();
      let nextType: TimeLog['type'];
      
      if (typeOverride) {
        nextType = typeOverride;
      } else {
        nextType = status === 'in' || status === 'break' ? 'out' : 'in';
      }

      const logData: Omit<TimeLog, 'id'> = {
        uid: profile.uid,
        type: nextType,
        timestamp: serverTimestamp(),
        location: loc,
        deviceCode
      };

      // 3. Save Log
      await addDoc(collection(db, 'timeLogs'), logData);

      // 4. Update User Device Code if not set
      if (!profile.deviceCode) {
        await updateDoc(doc(db, 'users', profile.uid), { deviceCode });
      }

    } catch (err: any) {
      console.error("Clock Action Error:", err);
      if (err.code === 1) {
        setError("Location permission is MANDATORY to clock in/out.");
      } else {
        setError(err.message || "An error occurred during clock action.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateProfile = async () => {
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        displayName: editName,
        jobTitle: editJob,
        photoURL: editPhoto
      });
      setShowProfile(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8 transition-colors duration-300">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-800 border-2 border-white dark:border-gray-900 shadow-sm">
            {profile.photoURL ? (
              <img src={profile.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold">
                {profile.displayName.charAt(0)}
              </div>
            )}
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{profile.displayName}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium italic">{profile.jobTitle || 'No Title'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleDarkMode}
            className="p-2 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            {isDarkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
          </button>
          <button
            onClick={() => setShowProfile(true)}
            className="p-2 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <UserIcon className="w-6 h-6" />
          </button>
          <button
            onClick={() => auth.signOut()}
            className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Main Status Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-gray-900 rounded-[2rem] shadow-xl shadow-gray-100 dark:shadow-none border border-gray-100 dark:border-gray-800 overflow-hidden mb-8"
      >
        <div className="p-8 text-center">
          <div className={`inline-flex items-center gap-2 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-6 ${
            status === 'in' ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 
            status === 'break' ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' :
            'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
          }`}>
            <div className={`w-2 h-2 rounded-full animate-pulse ${
              status === 'in' ? 'bg-emerald-500' : 
              status === 'break' ? 'bg-amber-500' :
              'bg-gray-500'
            }`} />
            {status === 'in' ? 'Currently Working' : status === 'break' ? 'On Break' : 'Off Duty'}
          </div>

          <div className="text-5xl font-black text-gray-900 dark:text-white mb-2 tracking-tighter">
            {format(new Date(), 'HH:mm')}
          </div>
          <p className="text-gray-400 dark:text-gray-500 font-medium mb-10">
            {format(new Date(), 'EEEE, MMMM do')}
          </p>

          <div className="flex flex-col gap-4">
            <button
              onClick={() => handleClockAction()}
              disabled={isProcessing || status === 'loading'}
              className={`w-full py-6 rounded-3xl font-bold text-xl shadow-2xl transition-all active:scale-[0.98] disabled:opacity-50 ${
                status === 'in' || status === 'break'
                  ? 'bg-red-600 text-white shadow-red-200 dark:shadow-none hover:bg-red-700'
                  : 'bg-blue-600 text-white shadow-blue-200 dark:shadow-none hover:bg-blue-700'
              }`}
            >
              {isProcessing ? (
                <Loader2 className="w-8 h-8 animate-spin mx-auto" />
              ) : status === 'in' || status === 'break' ? (
                'Clock Out'
              ) : (
                'Clock In'
              )}
            </button>

            {(status === 'in' || status === 'break') && (
              <button
                onClick={() => handleClockAction(status === 'in' ? 'break_start' : 'break_end')}
                disabled={isProcessing}
                className={`w-full py-4 rounded-2xl font-bold text-lg shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 ${
                  status === 'in'
                    ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/30'
                    : 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/30'
                }`}
              >
                {status === 'in' ? 'Start Break' : 'End Break'}
              </button>
            )}
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 text-sm rounded-2xl border border-red-100 dark:border-red-900/20 flex items-center gap-3"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-left font-medium">{error}</p>
            </motion.div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 border-t border-gray-50 dark:border-gray-800">
          <div className="p-6 border-r border-gray-50 dark:border-gray-800 flex flex-col items-center">
            <MapPin className="w-5 h-5 text-gray-400 dark:text-gray-600 mb-2" />
            <span className="text-xs text-gray-400 dark:text-gray-500 uppercase font-bold tracking-widest mb-1">Last Location</span>
            <span className="text-sm text-gray-700 dark:text-gray-300 font-semibold">
              {logs[0]?.location ? `${logs[0].location.lat.toFixed(4)}, ${logs[0].location.lng.toFixed(4)}` : 'N/A'}
            </span>
          </div>
          <div className="p-6 flex flex-col items-center">
            <Smartphone className="w-5 h-5 text-gray-400 dark:text-gray-600 mb-2" />
            <span className="text-xs text-gray-400 dark:text-gray-500 uppercase font-bold tracking-widest mb-1">Device Code</span>
            <span className="text-sm text-gray-700 dark:text-gray-300 font-semibold">{profile.deviceCode || 'Pending...'}</span>
          </div>
        </div>
      </motion.div>

      {/* Recent Activity */}
      <section>
        <h3 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4 px-2">Recent Activity</h3>
        <div className="space-y-3">
          {logs.length > 0 ? (
            [...logs].reverse().map((log) => (
              <div key={log.id} className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    log.type === 'in' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 
                    log.type === 'out' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' :
                    'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                  }`}>
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                      {log.type === 'in' ? 'Clocked In' : 
                       log.type === 'out' ? 'Clocked Out' :
                       log.type === 'break_start' ? 'Started Break' : 'Ended Break'}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                      {log.timestamp?.toDate ? format(log.timestamp.toDate(), 'MMM d, HH:mm') : 'Just now'}
                    </p>
                  </div>
                </div>
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
            ))
          ) : (
            <p className="text-center text-gray-400 dark:text-gray-600 py-8 italic">No activity recorded yet.</p>
          )}
        </div>
      </section>

      {/* Profile Modal */}
      <AnimatePresence>
        {showProfile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-800"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Edit Profile</h2>
                  <button onClick={() => setShowProfile(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400">
                    <AlertCircle className="w-6 h-6 rotate-45" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 px-1">Display Name</label>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-600" />
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-gray-800 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600"
                        placeholder="Your full name"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 px-1">Job Title</label>
                    <div className="relative">
                      <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-600" />
                      <input
                        type="text"
                        value={editJob}
                        onChange={(e) => setEditJob(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-gray-800 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600"
                        placeholder="e.g. Senior Developer"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 px-1">Photo URL</label>
                    <div className="relative">
                      <Camera className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-600" />
                      <input
                        type="text"
                        value={editPhoto}
                        onChange={(e) => setEditPhoto(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-gray-800 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600"
                        placeholder="https://..."
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleUpdateProfile}
                    disabled={isProcessing}
                    className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-xl shadow-blue-100 dark:shadow-none hover:bg-blue-700 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'Save Changes'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
