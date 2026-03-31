import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Printer, Calendar as CalendarIcon, FileText, Loader2 } from 'lucide-react';
import { format, startOfDay, endOfDay, eachDayOfInterval, isSameDay, differenceInMinutes, addDays, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { UserProfile, TimeLog } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface TimesheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  worker: UserProfile;
  logs: TimeLog[];
  adminProfile: UserProfile;
  isDarkMode: boolean;
}

type PeriodType = 'weekly' | 'biweekly' | 'monthly' | 'custom';

export default function TimesheetModal({ isOpen, onClose, worker, logs, adminProfile, isDarkMode }: TimesheetModalProps) {
  const [periodType, setPeriodType] = React.useState<PeriodType>('weekly');
  const [referenceDate, setReferenceDate] = React.useState(new Date());
  const [isGenerating, setIsGenerating] = React.useState(false);

  const dateRange = useMemo(() => {
    let start: Date;
    let end: Date;

    switch (periodType) {
      case 'weekly':
        start = startOfWeek(referenceDate, { weekStartsOn: 0 });
        end = endOfWeek(referenceDate, { weekStartsOn: 0 });
        break;
      case 'biweekly':
        start = startOfWeek(referenceDate, { weekStartsOn: 0 });
        end = endOfWeek(addWeeks(start, 1), { weekStartsOn: 0 });
        break;
      case 'monthly':
        start = startOfMonth(referenceDate);
        end = endOfMonth(referenceDate);
        break;
      default:
        start = startOfWeek(referenceDate);
        end = endOfWeek(referenceDate);
    }

    return { start, end };
  }, [periodType, referenceDate]);

  const dailyData = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
    const sortedLogs = [...logs]
      .filter(l => l.uid === worker.uid)
      .sort((a, b) => {
        const tA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
        const tB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
        return tA - tB;
      });

    // Pair up logs
    const pairs: { in: Date; out: Date | null }[] = [];
    let currentIn: Date | null = null;

    sortedLogs.forEach(log => {
      const logDate = log.timestamp?.toDate ? log.timestamp.toDate() : null;
      if (!logDate) return;

      if (log.type === 'in') {
        if (currentIn) {
          // If already in, close previous one at this time (shouldn't happen with good data)
          pairs.push({ in: currentIn, out: logDate });
        }
        currentIn = logDate;
      } else if (log.type === 'out' && currentIn) {
        pairs.push({ in: currentIn, out: logDate });
        currentIn = null;
      }
    });

    // If still clocked in
    if (currentIn) {
      pairs.push({ in: currentIn, out: null });
    }

    return days.map(day => {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);
      
      // Find pairs that STARTED on this day
      const dayPairs = pairs.filter(p => isSameDay(p.in, day));

      const totalMinutes = dayPairs.reduce((acc, pair) => {
        const outDate = pair.out || (isSameDay(pair.in, new Date()) ? new Date() : endOfDay(pair.in));
        return acc + differenceInMinutes(outDate, pair.in);
      }, 0);

      const totalHours = totalMinutes / 60;
      const regularHours = Math.min(totalHours, 8);
      const overtimeHours = Math.max(0, totalHours - 8);

      return {
        dayName: format(day, 'EEEE'),
        date: format(day, 'MMM dd, yyyy'),
        shifts: dayPairs,
        totalHours,
        regularHours,
        overtimeHours
      };
    });
  }, [dateRange, logs, worker.uid]);

  const totals = useMemo(() => {
    return dailyData.reduce((acc, day) => ({
      regular: acc.regular + day.regularHours,
      overtime: acc.overtime + day.overtimeHours,
      total: acc.total + day.totalHours
    }), { regular: 0, overtime: 0, total: 0 });
  }, [dailyData]);

  const handleExportPDF = async () => {
    setIsGenerating(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header
      doc.setFontSize(20);
      doc.setTextColor(40);
      doc.text(`${periodType.toUpperCase()} TIMESHEET`, pageWidth / 2, 20, { align: 'center' });

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Employee: ${worker.displayName} (${worker.jobTitle || 'Worker'})`, 14, 35);
      doc.text(`Assigned Manager: ${adminProfile.displayName}`, 14, 42);
      doc.text(`Prepared by: ${adminProfile.displayName}`, 14, 49);
      
      doc.text(`Date: ${format(new Date(), 'MMMM dd, yyyy')}`, pageWidth - 14, 35, { align: 'right' });
      doc.text(`Pay Period Start: ${format(dateRange.start, 'MMMM dd, yyyy')}`, pageWidth - 14, 42, { align: 'right' });
      doc.text(`Standard Pay Rate: ₱${worker.hourlyRate || 0} per hour`, pageWidth - 14, 49, { align: 'right' });

      // Table
      const tableData = dailyData.map(day => [
        day.dayName,
        day.date,
        day.shifts[0] ? format(day.shifts[0].in, 'hh:mm a') : '-',
        day.shifts[0]?.out ? format(day.shifts[0].out, 'hh:mm a') : '-',
        day.shifts[1] ? format(day.shifts[1].in, 'hh:mm a') : '-',
        day.shifts[1]?.out ? format(day.shifts[1].out, 'hh:mm a') : '-',
        day.totalHours.toFixed(2),
        day.overtimeHours.toFixed(2)
      ]);

      autoTable(doc, {
        startY: 60,
        head: [['DAY', 'DATE', 'TIME IN', 'TIME OUT', 'TIME IN', 'TIME OUT', 'TOTAL (HOURS)', 'OVERTIME (HOURS)']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2 },
      });

      // Summary
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      const summaryX = pageWidth - 60;

      doc.setFontSize(10);
      doc.text('HOURS THIS WEEK:', summaryX, finalY);
      doc.text(totals.regular.toFixed(2), pageWidth - 14, finalY, { align: 'right' });
      doc.text(totals.overtime.toFixed(2), pageWidth - 14, finalY + 7, { align: 'right' });

      doc.text('RATE:', summaryX, finalY + 14);
      doc.text(`₱${worker.hourlyRate || 0}`, pageWidth - 14, finalY + 14, { align: 'right' });
      doc.text(`₱${worker.hourlyRate || 0}`, pageWidth - 14, finalY + 21, { align: 'right' });

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL:', summaryX, finalY + 30);
      doc.text(`₱${(totals.total * (worker.hourlyRate || 0)).toFixed(2)}`, pageWidth - 14, finalY + 30, { align: 'right' });

      doc.save(`Timesheet_${worker.displayName}_${format(dateRange.start, 'yyyyMMdd')}.pdf`);
    } catch (error) {
      console.error('PDF Generation Error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
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
          className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border border-gray-100 dark:border-gray-800"
        >
          {/* Header */}
          <div className="p-6 sm:p-8 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
                <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                Timesheet Preview
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{worker.displayName} • {worker.jobTitle || 'Worker'}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExportPDF}
                disabled={isGenerating}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 dark:shadow-none text-sm disabled:opacity-50"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Export PDF
              </button>
              <button onClick={onClose} className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Controls */}
          <div className="p-4 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-4">
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
              {(['weekly', 'biweekly', 'monthly'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setPeriodType(type)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                    periodType === type ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-800">
              <button 
                onClick={() => setReferenceDate(prev => {
                  if (periodType === 'weekly') return subWeeks(prev, 1);
                  if (periodType === 'biweekly') return subWeeks(prev, 2);
                  return subMonths(prev, 1);
                })}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500 dark:text-gray-400"
              >
                <X className="w-4 h-4 rotate-180" />
              </button>
              <div className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300 min-w-[180px] justify-center">
                <CalendarIcon className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                {format(dateRange.start, 'MMM dd')} - {format(dateRange.end, 'MMM dd, yyyy')}
              </div>
              <button 
                onClick={() => setReferenceDate(prev => {
                  if (periodType === 'weekly') return addWeeks(prev, 1);
                  if (periodType === 'biweekly') return addWeeks(prev, 2);
                  return addMonths(prev, 1);
                })}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500 dark:text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Preview Area */}
          <div className="flex-1 overflow-auto p-8 bg-gray-50/50 dark:bg-gray-950/50">
            <div className="bg-white dark:bg-gray-900 p-8 shadow-sm border border-gray-100 dark:border-gray-800 rounded-2xl max-w-4xl mx-auto font-mono text-[10px] sm:text-xs text-gray-900 dark:text-gray-100">
              <div className="text-center mb-8">
                <h1 className="text-xl font-black uppercase tracking-widest border-b-2 border-gray-900 dark:border-gray-100 inline-block pb-1">
                  {periodType} Timesheet
                </h1>
              </div>

              <div className="grid grid-cols-2 gap-8 mb-8">
                <div className="space-y-2">
                  <div className="flex border-b border-gray-200 dark:border-gray-800 pb-1">
                    <span className="font-bold w-32">Employee:</span>
                    <span className="flex-1">{worker.displayName} ({worker.jobTitle || 'Worker'})</span>
                  </div>
                  <div className="flex border-b border-gray-200 dark:border-gray-800 pb-1">
                    <span className="font-bold w-32">Assigned Manager:</span>
                    <span className="flex-1">{adminProfile.displayName}</span>
                  </div>
                  <div className="flex border-b border-gray-200 dark:border-gray-800 pb-1">
                    <span className="font-bold w-32">Prepared by:</span>
                    <span className="flex-1">{adminProfile.displayName}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex border-b border-gray-200 dark:border-gray-800 pb-1">
                    <span className="font-bold w-32">Date:</span>
                    <span className="flex-1">{format(new Date(), 'MMMM dd, yyyy')}</span>
                  </div>
                  <div className="flex border-b border-gray-200 dark:border-gray-800 pb-1">
                    <span className="font-bold w-32">Pay Period Start:</span>
                    <span className="flex-1">{format(dateRange.start, 'MMMM dd, yyyy')}</span>
                  </div>
                  <div className="flex border-b border-gray-200 dark:border-gray-800 pb-1">
                    <span className="font-bold w-32">Standard Pay Rate:</span>
                    <span className="flex-1">₱{worker.hourlyRate || 0} per hour</span>
                  </div>
                </div>
              </div>

              <table className="w-full border-collapse border border-gray-900 dark:border-gray-100 mb-8">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800">
                    <th className="border border-gray-900 dark:border-gray-100 p-2 text-left">DAY</th>
                    <th className="border border-gray-900 dark:border-gray-100 p-2 text-left">DATE</th>
                    <th className="border border-gray-900 dark:border-gray-100 p-2 text-center">TIME IN</th>
                    <th className="border border-gray-900 dark:border-gray-100 p-2 text-center">TIME OUT</th>
                    <th className="border border-gray-900 dark:border-gray-100 p-2 text-center">TIME IN</th>
                    <th className="border border-gray-900 dark:border-gray-100 p-2 text-center">TIME OUT</th>
                    <th className="border border-gray-900 dark:border-gray-100 p-2 text-center">TOTAL (HOURS)</th>
                    <th className="border border-gray-900 dark:border-gray-100 p-2 text-center">OVERTIME (HOURS)</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyData.map((day, idx) => (
                    <tr key={idx}>
                      <td className="border border-gray-900 dark:border-gray-100 p-2 font-bold">{day.dayName}</td>
                      <td className="border border-gray-900 dark:border-gray-100 p-2">{day.date}</td>
                      <td className="border border-gray-900 dark:border-gray-100 p-2 text-center">{day.shifts[0] ? format(day.shifts[0].in, 'hh:mm a') : '-'}</td>
                      <td className="border border-gray-900 dark:border-gray-100 p-2 text-center">{day.shifts[0]?.out ? format(day.shifts[0].out, 'hh:mm a') : '-'}</td>
                      <td className="border border-gray-900 dark:border-gray-100 p-2 text-center">{day.shifts[1] ? format(day.shifts[1].in, 'hh:mm a') : '-'}</td>
                      <td className="border border-gray-900 dark:border-gray-100 p-2 text-center">{day.shifts[1]?.out ? format(day.shifts[1].out, 'hh:mm a') : '-'}</td>
                      <td className="border border-gray-900 dark:border-gray-100 p-2 text-center">{day.totalHours > 0 ? day.totalHours.toFixed(2) : '-'}</td>
                      <td className="border border-gray-900 dark:border-gray-100 p-2 text-center">{day.overtimeHours > 0 ? day.overtimeHours.toFixed(2) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-64 border border-gray-900 dark:border-gray-100">
                  <div className="flex border-b border-gray-900 dark:border-gray-100">
                    <div className="w-1/2 p-2 font-bold border-r border-gray-900 dark:border-gray-100">HOURS THIS WEEK</div>
                    <div className="w-1/4 p-2 text-center border-r border-gray-900 dark:border-gray-100">{totals.regular.toFixed(2)}</div>
                    <div className="w-1/4 p-2 text-center">{totals.overtime.toFixed(2)}</div>
                  </div>
                  <div className="flex border-b border-gray-900 dark:border-gray-100">
                    <div className="w-1/2 p-2 font-bold border-r border-gray-900 dark:border-gray-100">RATE</div>
                    <div className="w-1/4 p-2 text-center border-r border-gray-900 dark:border-gray-100">₱{worker.hourlyRate || 0}</div>
                    <div className="w-1/4 p-2 text-center">₱{worker.hourlyRate || 0}</div>
                  </div>
                  <div className="flex border-b border-gray-900 dark:border-gray-100">
                    <div className="w-1/2 p-2 font-bold border-r border-gray-900 dark:border-gray-100">SUB-TOTAL</div>
                    <div className="w-1/4 p-2 text-center border-r border-gray-900 dark:border-gray-100">₱{(totals.regular * (worker.hourlyRate || 0)).toFixed(2)}</div>
                    <div className="w-1/4 p-2 text-center">₱{(totals.overtime * (worker.hourlyRate || 0)).toFixed(2)}</div>
                  </div>
                  <div className="flex bg-gray-100 dark:bg-gray-800">
                    <div className="w-1/2 p-2 font-black border-r border-gray-900 dark:border-gray-100">TOTAL</div>
                    <div className="w-1/2 p-2 text-right font-black">₱{(totals.total * (worker.hourlyRate || 0)).toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
