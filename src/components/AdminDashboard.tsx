import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../firebase';
import { collection, query, orderBy, onSnapshot, getDocs, where, Timestamp, setDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { initializeApp, getApp, getApps } from 'firebase/app';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile, TimeLog } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Clock, MapPin, Smartphone, LogOut, ChevronRight, Calendar, Filter, Search, Download, TrendingUp, User as UserIcon, Loader2, AlertCircle, Plus, X, Key, Mail, Briefcase as BriefcaseIcon, Trash2, FileText } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, differenceInMinutes, isSameDay } from 'date-fns';
import TimesheetModal from './TimesheetModal';

// Secondary Auth instance to create users without logging out the admin
const getSecondaryAuth = () => {
  const secondaryAppName = 'SecondaryAuth';
  let secondaryApp = getApps().find(app => app.name === secondaryAppName);
  if (!secondaryApp) {
    secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  }
  return getAuth(secondaryApp);
};

export default function AdminDashboard({ profile }: { profile: UserProfile }) {
  const [workers, setWorkers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWorker, setSelectedWorker] = useState<UserProfile | null>(null);
  const [startDate, setStartDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // Create Worker Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkerUsername, setNewWorkerUsername] = useState('');
  const [newWorkerPassword, setNewWorkerPassword] = useState('');
  const [newWorkerJob, setNewWorkerJob] = useState('');
  const [newWorkerHourlyRate, setNewWorkerHourlyRate] = useState<string>('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Delete Worker Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Delete All Workers State
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [isWiping, setIsWiping] = useState(false);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [isUpdatingRate, setIsUpdatingRate] = useState(false);
  const [showTimesheetModal, setShowTimesheetModal] = useState(false);

  useEffect(() => {
    // Fetch all workers
    const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users = snapshot.docs.map(doc => doc.data() as UserProfile);
      setWorkers(users.filter(u => u.role === 'worker'));
    });

    // Fetch all logs
    const logsUnsubscribe = onSnapshot(query(collection(db, 'timeLogs'), orderBy('timestamp', 'desc')), (snapshot) => {
      const allLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeLog));
      setLogs(allLogs);
      setLoading(false);
    });

    return () => {
      usersUnsubscribe();
      logsUnsubscribe();
    };
  }, []);

  const handleCreateWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setCreateError(null);

    try {
      if (newWorkerPassword.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }

      // 1. Check if username is already taken in the active workers list
      if (workers.some(w => w.displayName.toLowerCase() === newWorkerUsername.toLowerCase())) {
        throw new Error("Username is already taken by an active worker.");
      }

      // 2. Create the user in Firebase Auth using the secondary instance
      // We use a unique internal email format: username_random@worker.com
      // This allows re-creating a worker with the same display name if the old one was deleted
      const sanitizedUsername = newWorkerUsername.toLowerCase().replace(/[^a-z0-9._]/g, '');
      const uniqueSuffix = Math.random().toString(36).substring(2, 7);
      const email = `${sanitizedUsername}_${uniqueSuffix}@worker.com`;
      const secondaryAuth = getSecondaryAuth();
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, newWorkerPassword);
      const newUser = userCredential.user;

      // 3. Create the user profile in Firestore
      const newProfile: UserProfile = {
        uid: newUser.uid,
        email: email,
        displayName: newWorkerUsername,
        jobTitle: newWorkerJob,
        role: 'worker',
        createdAt: new Date().toISOString(),
        hourlyRate: newWorkerHourlyRate ? parseFloat(newWorkerHourlyRate) : undefined,
        currency: 'PHP',
      };

      await setDoc(doc(db, 'users', newUser.uid), newProfile);

      // 3. Sign out the secondary instance immediately so it doesn't persist
      await signOut(secondaryAuth);

      // Success!
      setShowCreateModal(false);
      setNewWorkerUsername('');
      setNewWorkerPassword('');
      setNewWorkerJob('');
      setNewWorkerHourlyRate('');
      
    } catch (err: any) {
      console.error("Create Worker Error:", err);
      if (err.code === 'auth/email-already-in-use') {
        setCreateError("Username already exists.");
      } else {
        setCreateError(err.message || "Failed to create worker.");
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteWorker = async () => {
    if (!selectedWorker) return;
    setIsDeleting(true);
    setCreateError(null);

    try {
      const batch = writeBatch(db);
      
      // 1. Delete the user profile from Firestore
      batch.delete(doc(db, 'users', selectedWorker.uid));

      // 2. Delete all their time logs
      const logsQuery = query(collection(db, 'timeLogs'), where('uid', '==', selectedWorker.uid));
      const logsSnapshot = await getDocs(logsQuery);
      logsSnapshot.forEach((logDoc) => {
        batch.delete(logDoc.ref);
      });
      
      await batch.commit();

      // Success!
      setShowDeleteModal(false);
      setSelectedWorker(null);
      
    } catch (err: any) {
      console.error("Delete Worker Error:", err);
      setCreateError(err.message || "Failed to delete worker.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleWipeAllWorkers = async () => {
    setIsWiping(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Delete all worker profiles
      workers.forEach(worker => {
        batch.delete(doc(db, 'users', worker.uid));
      });

      // 2. Delete all time logs
      const logsSnapshot = await getDocs(collection(db, 'timeLogs'));
      logsSnapshot.forEach(logDoc => {
        batch.delete(logDoc.ref);
      });

      await batch.commit();
      setShowWipeModal(false);
      setSelectedWorker(null);
    } catch (err: any) {
      console.error("Wipe Error:", err);
      setCreateError("Failed to wipe data.");
    } finally {
      setIsWiping(false);
    }
  };

  const handleUpdateHourlyRate = async (workerUid: string, rate: number) => {
    setIsUpdatingRate(true);
    try {
      await setDoc(doc(db, 'users', workerUid), {
        hourlyRate: rate,
        currency: 'PHP'
      }, { merge: true });
      
      // Update selectedWorker state if it's the one being edited
      if (selectedWorker?.uid === workerUid) {
        setSelectedWorker({
          ...selectedWorker,
          hourlyRate: rate,
          currency: 'PHP'
        });
      }
    } catch (err) {
      console.error("Update Rate Error:", err);
    } finally {
      setIsUpdatingRate(false);
    }
  };

  const handleExportCSV = () => {
    setIsExporting(true);
    try {
      const now = new Date();
      const start = startOfDay(new Date(startDate));
      const end = endOfDay(new Date(endDate));
      const days = eachDayOfInterval({ start, end });

      // Create Header
      let csvContent = "Worker Name,Email,Hourly Rate (PHP)," + days.map(d => format(d, 'MMM dd')).join(",") + ",Total Hours,Total Money (PHP)\n";

      // Create Rows
      workers.forEach(worker => {
        let row = `"${worker.displayName}","${worker.email}",${worker.hourlyRate || 0}`;
        let workerTotalMinutes = 0;

        const workerLogs = logs
          .filter(l => l.uid === worker.uid && l.timestamp?.toDate)
          .sort((a, b) => a.timestamp.toDate().getTime() - b.timestamp.toDate().getTime());

        days.forEach(day => {
          let dayMinutes = 0;
          let lastIn: Date | null = null;
          let lastBreakStart: Date | null = null;

          // Filter logs for this specific day
          const dayLogs = workerLogs.filter(l => isSameDay(l.timestamp.toDate(), day));
          
          workerLogs.forEach(log => {
            const logDate = log.timestamp.toDate();
            if (isSameDay(logDate, day)) {
              if (log.type === 'in') {
                lastIn = logDate;
              } else if (log.type === 'out' && lastIn) {
                dayMinutes += differenceInMinutes(logDate, lastIn);
                lastIn = null;
                lastBreakStart = null;
              } else if (log.type === 'break_start' && lastIn) {
                lastBreakStart = logDate;
              } else if (log.type === 'break_end' && lastBreakStart) {
                dayMinutes -= differenceInMinutes(logDate, lastBreakStart);
                lastBreakStart = null;
              }
            }
          });

          // If still clocked in at the end of the day (or now if it's today)
          if (lastIn) {
            const endOfDayTime = isSameDay(day, now) ? now : new Date(day.setHours(23, 59, 59, 999));
            dayMinutes += differenceInMinutes(endOfDayTime, lastIn);
            if (lastBreakStart) {
              dayMinutes -= differenceInMinutes(endOfDayTime, lastBreakStart);
            }
          }

          row += `,${(dayMinutes / 60).toFixed(1)}`;
          workerTotalMinutes += dayMinutes;
        });

        const totalHours = workerTotalMinutes / 60;
        const totalMoney = totalHours * (worker.hourlyRate || 0);
        row += `,${totalHours.toFixed(1)},${totalMoney.toFixed(2)}\n`;
        csvContent += row;
      });

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `worker_hours_${startDate}_to_${endDate}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Export Error:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const calculateHours = (workerUid: string, start: Date, end: Date) => {
    const workerLogs = logs
      .filter(l => l.uid === workerUid && l.timestamp?.toDate)
      .sort((a, b) => a.timestamp.toDate().getTime() - b.timestamp.toDate().getTime());

    let totalMinutes = 0;
    let lastIn: Date | null = null;
    let lastBreakStart: Date | null = null;

    workerLogs.forEach(log => {
      const logDate = log.timestamp.toDate();
      if (isWithinInterval(logDate, { start, end })) {
        if (log.type === 'in') {
          lastIn = logDate;
        } else if (log.type === 'out' && lastIn) {
          totalMinutes += differenceInMinutes(logDate, lastIn);
          lastIn = null;
          lastBreakStart = null;
        } else if (log.type === 'break_start' && lastIn) {
          lastBreakStart = logDate;
        } else if (log.type === 'break_end' && lastBreakStart) {
          totalMinutes -= differenceInMinutes(logDate, lastBreakStart);
          lastBreakStart = null;
        }
      }
    });

    // If still clocked in and the end range is today or in the future
    if (lastIn && end >= new Date()) {
      const now = new Date();
      totalMinutes += differenceInMinutes(now, lastIn);
      if (lastBreakStart) {
        totalMinutes -= differenceInMinutes(now, lastBreakStart);
      }
    }

    return (totalMinutes / 60).toFixed(1);
  };

  const filteredWorkers = workers.filter(w =>
    w.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = useMemo(() => {
    const activeWorkers = workers.filter(w => {
      const lastLog = logs.find(l => l.uid === w.uid);
      return lastLog?.type === 'in';
    }).length;

    const start = startOfDay(new Date(startDate));
    const end = endOfDay(new Date(endDate));

    return {
      total: workers.length,
      active: activeWorkers,
      totalHoursInRange: workers.reduce((acc, w) => acc + parseFloat(calculateHours(w.uid, start, end)), 0).toFixed(1),
      totalMoneyInRange: workers.reduce((acc, w) => {
        const hours = parseFloat(calculateHours(w.uid, start, end));
        return acc + (hours * (w.hourlyRate || 0));
      }, 0).toFixed(2)
    };
  }, [workers, logs, startDate, endDate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Admin Header */}
      <header className="flex flex-col gap-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">Heavenzy Pro</h1>
            <p className="text-sm text-gray-500 font-medium">Admin Console • Monitoring {workers.length} workers</p>
          </div>
          <button
            onClick={() => auth.signOut()}
            className="p-3 bg-white text-gray-400 hover:text-red-600 rounded-2xl border border-gray-100 shadow-sm transition-colors sm:hidden"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
                <Calendar className="w-4 h-4 text-gray-400 ml-2" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent border-none text-xs font-bold focus:ring-0 p-1"
                />
                <span className="text-gray-300 font-bold">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent border-none text-xs font-bold focus:ring-0 p-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCSV}
                  disabled={isExporting}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-50 text-emerald-600 rounded-2xl font-bold hover:bg-emerald-100 transition-all border border-emerald-100 disabled:opacity-50 text-xs"
                >
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>Export Range</span>
                </button>
                <button
                  onClick={() => setShowWipeModal(true)}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-red-50 text-red-600 rounded-2xl font-bold hover:bg-red-100 transition-all border border-red-100 text-xs"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Wipe</span>
                </button>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 text-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              </div>
            </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 sm:flex-none bg-white p-2 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 pr-4">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shrink-0">
                {profile.displayName.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 line-clamp-1">{profile.displayName}</p>
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">Admin</p>
              </div>
            </div>
            <button
              onClick={() => auth.signOut()}
              className="hidden sm:flex p-3 bg-white text-gray-400 hover:text-red-600 rounded-2xl border border-gray-100 shadow-sm transition-colors"
            >
              <LogOut className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6 mb-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2rem] shadow-xl shadow-gray-100 border border-gray-100">
          <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 bg-blue-50 text-blue-600 rounded-xl sm:rounded-2xl flex items-center justify-center">
              <Users className="w-4 h-4 sm:w-6 sm:h-6" />
            </div>
            <span className="text-[10px] sm:text-sm font-bold text-gray-400 uppercase tracking-widest">Total</span>
          </div>
          <div className="text-2xl sm:text-4xl font-black text-gray-900">{stats.total}</div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2rem] shadow-xl shadow-gray-100 border border-gray-100">
          <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 bg-emerald-50 text-emerald-600 rounded-xl sm:rounded-2xl flex items-center justify-center">
              <TrendingUp className="w-4 h-4 sm:w-6 sm:h-6" />
            </div>
            <span className="text-[10px] sm:text-sm font-bold text-gray-400 uppercase tracking-widest">Active</span>
          </div>
          <div className="text-2xl sm:text-4xl font-black text-gray-900">{stats.active}</div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2rem] shadow-xl shadow-gray-100 border border-gray-100">
          <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 bg-amber-50 text-amber-600 rounded-xl sm:rounded-2xl flex items-center justify-center">
              <Clock className="w-4 h-4 sm:w-6 sm:h-6" />
            </div>
            <span className="text-[10px] sm:text-sm font-bold text-gray-400 uppercase tracking-widest">Hours in Range</span>
          </div>
          <div className="text-2xl sm:text-4xl font-black text-gray-900">{stats.totalHoursInRange}h</div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="col-span-2 md:col-span-1 bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2rem] shadow-xl shadow-gray-100 border border-gray-100">
          <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 bg-emerald-50 text-emerald-600 rounded-xl sm:rounded-2xl flex items-center justify-center">
              <TrendingUp className="w-4 h-4 sm:w-6 sm:h-6" />
            </div>
            <span className="text-[10px] sm:text-sm font-bold text-gray-400 uppercase tracking-widest">Est. Cost in Range</span>
          </div>
          <div className="text-2xl sm:text-4xl font-black text-emerald-600">₱{stats.totalMoneyInRange}</div>
        </motion.div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Workers List */}
        <div className={`lg:col-span-1 ${selectedWorker ? 'hidden lg:block' : 'block'}`}>
          <div className="bg-white rounded-3xl sm:rounded-[2.5rem] shadow-xl shadow-gray-100 border border-gray-100 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-gray-50">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search workers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 sm:py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium text-sm"
                />
              </div>
            </div>
            <div className="max-h-[500px] lg:max-h-[600px] overflow-y-auto">
              {filteredWorkers.map((worker) => (
                <button
                  key={worker.uid}
                  onClick={() => setSelectedWorker(worker)}
                  className={`w-full p-4 sm:p-6 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${
                    selectedWorker?.uid === worker.uid ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl overflow-hidden bg-gray-100 shrink-0">
                      {worker.photoURL ? (
                        <img src={worker.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-blue-100 text-blue-600 font-bold text-sm sm:text-base">
                          {worker.displayName.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-gray-900 text-sm sm:text-base line-clamp-1">{worker.displayName}</p>
                      <p className="text-[10px] sm:text-xs text-gray-400 font-medium italic line-clamp-1">{worker.jobTitle || 'No Title'}</p>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${selectedWorker?.uid === worker.uid ? 'text-blue-600 translate-x-1' : 'text-gray-300'}`} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Worker Details / Logs */}
        <div className={`lg:col-span-2 ${selectedWorker ? 'block' : 'hidden lg:block'}`}>
          <AnimatePresence mode="wait">
            {selectedWorker ? (
              <motion.div
                key={selectedWorker.uid}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white rounded-3xl sm:rounded-[2.5rem] shadow-xl shadow-gray-100 border border-gray-100 overflow-hidden"
              >
                {/* Worker Profile Header */}
                <div className="p-6 sm:p-8 bg-gray-900 text-white">
                  <button
                    onClick={() => setSelectedWorker(null)}
                    className="lg:hidden mb-6 flex items-center gap-2 text-white/60 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest"
                  >
                    <ChevronRight className="w-4 h-4 rotate-180" />
                    Back to List
                  </button>
                  <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl sm:rounded-[2rem] overflow-hidden border-4 border-white/10 shadow-2xl shrink-0">
                      {selectedWorker.photoURL ? (
                        <img src={selectedWorker.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-white/10 text-white text-2xl sm:text-3xl font-bold">
                          {selectedWorker.displayName.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                      <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-1">{selectedWorker.displayName}</h2>
                      <p className="text-blue-400 font-bold uppercase tracking-widest text-[10px] sm:text-xs mb-4">{selectedWorker.jobTitle || 'Worker'}</p>
                      <div className="flex flex-wrap justify-center sm:justify-start gap-3 sm:gap-4">
                        <div className="flex items-center gap-2 text-white/60 text-[10px] sm:text-sm font-medium">
                          <Smartphone className="w-3 h-3 sm:w-4 sm:h-4" />
                          {selectedWorker.deviceCode || 'No Device'}
                        </div>
                        <div className="flex items-center gap-2 text-white/60 text-[10px] sm:text-sm font-medium">
                          <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                          Joined {format(new Date(selectedWorker.createdAt), 'MMM yyyy')}
                        </div>
                      </div>
                    </div>
                    <div className="w-full sm:w-auto flex flex-col gap-2">
                      <button
                        onClick={() => setShowTimesheetModal(true)}
                        className="w-full sm:w-auto p-3 sm:p-4 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-2xl transition-all flex items-center justify-center gap-2 font-bold text-xs sm:text-sm"
                      >
                        <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                        Generate Timesheet
                      </button>
                      <button
                        onClick={() => setShowDeleteModal(true)}
                        className="w-full sm:w-auto p-3 sm:p-4 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-2xl transition-all flex items-center justify-center gap-2 font-bold text-xs sm:text-sm"
                      >
                        <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                        Delete Account
                      </button>
                    </div>
                  </div>
                </div>

                {/* Time Summary */}
                <div className="p-6 sm:p-8 border-b border-gray-50">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Range Summary</h3>
                    <div className="text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                      {format(new Date(startDate), 'MMM d')} - {format(new Date(endDate), 'MMM d')}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl sm:text-5xl font-black text-gray-900">
                          {calculateHours(selectedWorker.uid, startOfDay(new Date(startDate)), endOfDay(new Date(endDate)))}
                        </span>
                        <span className="text-base sm:text-xl font-bold text-gray-400">hours</span>
                      </div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-4 mb-2">Total Earnings</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl sm:text-4xl font-black text-emerald-600">
                          ₱{(parseFloat(calculateHours(selectedWorker.uid, startOfDay(new Date(startDate)), endOfDay(new Date(endDate)))) * (selectedWorker.hourlyRate || 0)).toFixed(2)}
                        </span>
                        <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">PHP</span>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Hourly Rate (PHP)</p>
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            defaultValue={selectedWorker.hourlyRate || 0}
                            onBlur={(e) => handleUpdateHourlyRate(selectedWorker.uid, parseFloat(e.target.value))}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        {isUpdatingRate && (
                          <div className="flex items-center gap-2 text-[10px] text-blue-600 font-bold animate-pulse">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            UPDATING...
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Log History */}
                <div className="p-6 sm:p-8">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Activity Logs</h3>
                  <div className="space-y-3 sm:space-y-4">
                    {logs
                      .filter(l => l.uid === selectedWorker.uid)
                      .slice(0, 20)
                      .reverse()
                      .map((log) => (
                        <div key={log.id} className="flex flex-col p-3 sm:p-4 bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 sm:gap-4">
                            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${
                              log.type === 'in' ? 'bg-emerald-100 text-emerald-600' : 
                              log.type === 'out' ? 'bg-red-100 text-red-600' :
                              'bg-amber-100 text-amber-600'
                            }`}>
                              <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                            <div>
                              <p className="font-bold text-gray-900 text-sm sm:text-base capitalize">
                                {log.type === 'in' ? 'Clocked In' : 
                                 log.type === 'out' ? 'Clocked Out' :
                                 log.type === 'break_start' ? 'Started Break' : 'Ended Break'}
                              </p>
                              <p className="text-[10px] sm:text-xs text-gray-400 font-medium">
                                {log.timestamp?.toDate ? format(log.timestamp.toDate(), 'MMM d · HH:mm') : 'Processing...'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-4">
                            <div className="hidden sm:flex flex-col items-end">
                              <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-tight">
                                <MapPin className="w-3 h-3" /> GPS
                              </div>
                              <p className="text-[10px] font-mono text-gray-600">
                                {log.location.lat.toFixed(4)}, {log.location.lng.toFixed(4)}
                              </p>
                            </div>
                            <button
                              onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                              className={`p-2 rounded-xl transition-all ${
                                expandedLog === log.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white text-gray-400 hover:text-blue-600 border border-gray-100'
                              }`}
                              title="View on Map"
                            >
                              <MapPin className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                          </div>
                        </div>

                        <AnimatePresence>
                          {expandedLog === log.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0, marginTop: 0 }}
                              animate={{ height: 'auto', opacity: 1, marginTop: 16 }}
                              exit={{ height: 0, opacity: 0, marginTop: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="relative w-full h-64 rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                                <iframe
                                  width="100%"
                                  height="100%"
                                  frameBorder="0"
                                  style={{ border: 0 }}
                                  src={`https://www.google.com/maps?q=${log.location.lat},${log.location.lng}&z=15&output=embed`}
                                  allowFullScreen
                                />
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${log.location.lat},${log.location.lng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl text-xs font-bold text-gray-900 shadow-xl border border-gray-100 hover:bg-white transition-all flex items-center gap-2"
                                >
                                  Open in Google Maps
                                  <ChevronRight className="w-3 h-3" />
                                </a>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                    {logs.filter(l => l.uid === selectedWorker.uid).length === 0 && (
                      <div className="text-center py-12">
                        <AlertCircle className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                        <p className="text-gray-400 font-medium">No logs found for this worker.</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-gray-50/50 rounded-[2.5rem] border-2 border-dashed border-gray-200 p-8 text-center">
                <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center mb-6">
                  <UserIcon className="w-10 h-10 text-gray-300" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Select a Worker</h3>
                <p className="text-gray-400 max-w-xs mx-auto">Choose a worker from the list to view their detailed logs, location data, and hours.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Create Worker Modal */}
      <AnimatePresence>
        {showCreateModal && (
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
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <form onSubmit={handleCreateWorker} className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Create Sub-Account</h2>
                  <button type="button" onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Username</label>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        required
                        value={newWorkerUsername}
                        onChange={(e) => setNewWorkerUsername(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium"
                        placeholder="worker_john"
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
                        value={newWorkerPassword}
                        onChange={(e) => setNewWorkerPassword(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Job Title</label>
                    <div className="relative">
                      <BriefcaseIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={newWorkerJob}
                        onChange={(e) => setNewWorkerJob(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium"
                        placeholder="e.g. Field Technician"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Hourly Rate (PHP)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={newWorkerHourlyRate}
                        onChange={(e) => setNewWorkerHourlyRate(e.target.value)}
                        className="w-full px-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-medium"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {createError && (
                    <div className="p-4 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 font-medium flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {createError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isCreating}
                    className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {isCreating ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'Create Account'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Worker Modal */}
      <AnimatePresence>
        {showDeleteModal && (
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
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-8">
                <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Trash2 className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight text-center mb-2">Delete Account?</h2>
                <p className="text-gray-500 text-center mb-8">
                  Are you sure you want to delete <span className="font-bold text-gray-900">{selectedWorker?.displayName}</span>? 
                  This action cannot be undone and they will no longer be able to clock in.
                </p>

                <div className="flex gap-4">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteWorker}
                    disabled={isDeleting}
                    className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-xl shadow-red-100 disabled:opacity-50"
                  >
                    {isDeleting ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'Yes, Delete'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wipe All Workers Modal */}
      <AnimatePresence>
        {showWipeModal && (
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
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-8">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight text-center mb-2">Wipe All Data?</h2>
                <p className="text-gray-500 text-center mb-8">
                  This will delete <span className="font-bold text-gray-900">ALL {workers.length} workers</span> and their entire time log history. 
                  This action is irreversible.
                </p>

                <div className="flex gap-4">
                  <button
                    onClick={() => setShowWipeModal(false)}
                    className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleWipeAllWorkers}
                    disabled={isWiping}
                    className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-xl shadow-red-100 disabled:opacity-50"
                  >
                    {isWiping ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'Yes, Wipe Everything'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {selectedWorker && (
        <TimesheetModal
          isOpen={showTimesheetModal}
          onClose={() => setShowTimesheetModal(false)}
          worker={selectedWorker}
          logs={logs}
          adminProfile={profile}
        />
      )}
    </div>
  );
}
