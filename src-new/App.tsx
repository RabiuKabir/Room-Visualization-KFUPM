/**
 * App-API.tsx - New Frontend Using Backend APIs
 * Simplified component that delegates all business logic to the backend
 */

import React, { useState, useMemo, useCallback, useRef, useEffect, type ChangeEvent } from 'react';
import { 
  Upload, 
  AlertTriangle, 
  CheckCircle2, 
  Calendar, 
  Clock, 
  Download, 
  Search, 
  ChevronRight, 
  ChevronDown,
  Info,
  Layers,
  FlaskConical,
  BookOpen,
  RefreshCw,
  LayoutGrid,
  GanttChartSquare,
  FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as apiClient from './services/apiClient';

// --- CSS Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DAY_ORDER = ["U", "M", "T", "W", "R", "F", "S"] as const;
type DayChar = typeof DAY_ORDER[number];

const DAY_LABELS: Record<DayChar, string> = {
  U: "Sun",
  M: "Mon",
  T: "Tue",
  W: "Wed",
  R: "Thu",
  F: "Fri",
  S: "Sat"
};

interface CourseRecord {
  id: number;
  subject: string;
  number: string;
  title: string;
  section: string;
  section_act: string;
  days: string;
  start: string | number;
  end: string | number;
  bldg: string;
  room: string;
  assigned_bldg: string;
  assigned_room: string;
  course_id: string;
  days_list: DayChar[];
  start_min: number | null;
  end_min: number | null;
  is_lab: boolean;
  conflict_flag: boolean;
  conflict_note: string;
}

interface Conflict {
  row_index: number;
  course_id: string;
  day: DayChar;
  time: string;
  assigned_bldg: string;
  assigned_room: string;
  type: 'hard' | 'auto-resolved' | 'needs-manual';
  reason: string;
  other_course: string;
  suggestions: string;
}

interface Suggestion {
  roomKey: string;
  newStartMin: number;
  newEndMin: number;
  newDays: string;
  newDaysList: DayChar[];
  label: string;
  timeLabel: string;
  dayLabel: string;
}

// Helper functions (same as original)
function formatTime(minutes: number | null): string {
  if (minutes === null) return "";
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

export default function AppAPI() {
  const [data, setData] = useState<CourseRecord[]>([]);
  const [originalData, setOriginalData] = useState<CourseRecord[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [summary, setSummary] = useState<{ uniqueConflictPairs: number; totalConflicts?: number } | null>(null);
  const conflictEntriesCount = conflicts.length;
  const uniqueConflictPairs = summary?.uniqueConflictPairs ?? conflicts.length;
  const [fileName, setFileName] = useState<string>("");
  const [activeTab, setActiveTab] = useState<'dashboard' | 'preview' | 'conflicts' | 'planner' | 'timeline'>('dashboard');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string>("(All rooms)");
  const [allowTimeShift, setAllowTimeShift] = useState(false);
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [selectedConflictIdx, setSelectedConflictIdx] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [suggestedRooms, setSuggestedRooms] = useState<Suggestion[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // File upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsProcessing(true);
    setError("");

    try {
      const result = await apiClient.uploadFile(file);
      setData(result.data as CourseRecord[]);
      setOriginalData(JSON.parse(JSON.stringify(result.data)));
      setConflicts(result.conflicts as Conflict[]);
      setSummary(result.summary ?? null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to upload file';
      setError(errorMsg);
      console.error("Upload error:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto-resolve handler
  const runAutoResolve = useCallback(async () => {
    setIsProcessing(true);
    setError("");

    try {
      const result = await apiClient.runAutoResolve(data, {
        allowTimeShift,
      });
      setData(result.data as CourseRecord[]);
      setConflicts(result.conflicts as Conflict[]);
      setSummary(result.summary ?? null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Auto-resolution failed';
      setError(errorMsg);
      console.error("Auto-resolve error:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [data, allowTimeShift]);

  // Fetch suggestions when conflict selection changes
  useEffect(() => {
    if (conflicts.length === 0 || selectedConflictIdx >= conflicts.length) {
      setSuggestedRooms([]);
      return;
    }

    const fetchSuggestions = async () => {
      try {
        const suggestions = await apiClient.getSuggestions(data, selectedConflictIdx, {
          allowTimeShift,
        });
        setSuggestedRooms(suggestions as Suggestion[]);
      } catch (err) {
        console.error("Error fetching suggestions:", err);
        setSuggestedRooms([]);
      }
    };

    fetchSuggestions();
  }, [conflicts, selectedConflictIdx, data, allowTimeShift]);

  // Apply suggestion handler
  const applySuggestion = useCallback(async (suggestion: Suggestion) => {
    setIsProcessing(true);
    setError("");

    try {
      const result = await apiClient.applySuggestion(data, selectedConflictIdx, suggestedRooms.indexOf(suggestion));
      setData(result.data as CourseRecord[]);
      setConflicts(result.conflicts as Conflict[]);
      setSummary(result.summary ?? null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to apply suggestion';
      setError(errorMsg);
      console.error("Apply suggestion error:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [data, selectedConflictIdx, suggestedRooms]);

  // Export handler
  const exportExcel = async () => {
    setError("");
    try {
      const blob = await apiClient.exportData(data, fileName);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Resolved_${fileName || 'Schedule.xlsx'}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Export failed';
      setError(errorMsg);
      console.error("Export error:", err);
    }
  };

  // Dashboard data (request from backend)
  const dashboardData = useMemo(() => {
    if (data.length === 0) return null;

    // For now, calculate locally. Could move to backend if needed.
    const dayConflicts = DAY_ORDER.map((day) => ({
      name: DAY_LABELS[day],
      count: conflicts.filter((c: Conflict) => c.day === day).length,
    }));

    const typeData = [
      { name: 'Lecture', value: data.filter((d) => !d.is_lab).length, color: '#3b82f6' },
      { name: 'Lab', value: data.filter((d) => d.is_lab).length, color: '#f59e0b' },
    ];

    const roomCounts: Record<string, number> = {};
    data.forEach((d: CourseRecord) => {
      const key = `${d.assigned_bldg}-${d.assigned_room}`;
      if (key !== '-') roomCounts[key] = (roomCounts[key] || 0) + 1;
    });
    const topRooms = Object.entries(roomCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const roomConflicts: Record<string, number> = {};
    conflicts.forEach((c: Conflict) => {
      const key = `${c.assigned_bldg}-${c.assigned_room}`;
      roomConflicts[key] = (roomConflicts[key] || 0) + 1;
    });
    const topConflictRooms = Object.entries(roomConflicts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const timeDist: Record<number, number> = {};
    data.forEach((d: CourseRecord) => {
      if (d.start_min !== null) {
        const hour = Math.floor(d.start_min / 60);
        timeDist[hour] = (timeDist[hour] || 0) + 1;
      }
    });
    const timeData = Array.from({ length: 13 }, (_, i) => {
      const hour = i + 8;
      return { name: `${hour}:00`, count: timeDist[hour] || 0 };
    });

    return { dayConflicts, typeData, topRooms, topConflictRooms, timeData };
  }, [data, conflicts]);

  const roomsList = useMemo(() => {
    const rooms = Array.from(new Set(data.map((r: CourseRecord) => `${r.assigned_bldg}|${r.assigned_room}`)))
      .filter(r => r !== "|")
      .sort();
    return ["(All rooms)", ...rooms];
  }, [data]);

  const filteredData = useMemo(() => {
    if (selectedRoom === "(All rooms)") return data;
    const [b, r] = selectedRoom.split("|");
    return data.filter((item: CourseRecord) => item.assigned_bldg === b && item.assigned_room === r);
  }, [data, selectedRoom]);

  const gridData = useMemo(() => {
    const starts = filteredData.map((d) => d.start_min).filter((t): t is number => t !== null);
    const ends = filteredData.map((d) => d.end_min).filter((t): t is number => t !== null);
    
    if (starts.length === 0) return { timeSlots: [], grid: {} };

    let dayStart = Math.min(...starts, 8 * 60);
    let dayEnd = Math.max(...ends, 18 * 60);
    
    dayStart = Math.floor(dayStart / slotMinutes) * slotMinutes;
    dayEnd = Math.ceil(dayEnd / slotMinutes) * slotMinutes;

    const timeSlots: number[] = [];
    for (let t = dayStart; t < dayEnd; t += slotMinutes) {
      timeSlots.push(t);
    }

    const grid: Record<string, Record<DayChar, CourseRecord[]>> = {};
    timeSlots.forEach(t => {
      const timeStr = formatTime(t);
      grid[timeStr] = { U: [], M: [], T: [], W: [], R: [], F: [], S: [] };
      
      filteredData.forEach((row) => {
        if (row.start_min === null || row.end_min === null) return;
        const s = Math.floor(row.start_min / slotMinutes) * slotMinutes;
        const e = Math.ceil(row.end_min / slotMinutes) * slotMinutes;
        
        if (s <= t && t < e) {
          row.days_list.forEach((day: DayChar) => {
            grid[timeStr][day].push(row);
          });
        }
      });
    });

    return { timeSlots, grid };
  }, [filteredData, slotMinutes]);

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink font-sans selection:bg-brand-ink selection:text-brand-bg">
      {/* Header */}
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <motion.div 
            initial={{ rotate: -10, scale: 0.9 }}
            animate={{ rotate: 0, scale: 1 }}
            className="w-10 h-10 bg-brand-ink rounded-xl flex items-center justify-center text-brand-bg shadow-lg shadow-brand-ink/20"
          >
            <Layers size={22} />
          </motion.div>
          <div>
            <h1 className="font-serif italic text-xl leading-tight tracking-tight">Room Assignment</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-muted font-mono font-bold">API-Based v2.0</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {!data.length ? (
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="btn-primary"
            >
              <Upload size={18} />
              <span>Upload Schedule</span>
            </button>
          ) : (
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer group bg-white border border-brand-border px-4 py-2 rounded-xl hover:bg-brand-bg transition-colors">
                <input 
                  type="checkbox" 
                  checked={allowTimeShift}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setAllowTimeShift(e.target.checked)}
                  className="w-4 h-4 accent-brand-ink"
                />
                <span className="text-[10px] uppercase tracking-widest font-mono font-bold text-brand-muted group-hover:text-brand-ink transition-colors">Flexible Timing</span>
              </label>
              <button 
                onClick={runAutoResolve}
                disabled={isProcessing}
                className="btn-secondary"
              >
                <RefreshCw size={18} className={cn(isProcessing && "animate-spin")} />
                <span>Auto-Resolve</span>
              </button>
              <button 
                onClick={exportExcel}
                className="btn-primary"
              >
                <Download size={18} />
                <span>Export Excel</span>
              </button>
            </div>
          )}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept=".xlsx, .xls" 
          />
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto">
        {/* Error Display */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3"
          >
            <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </motion.div>
        )}

        {!data.length ? (
          <div className="h-[70vh] flex flex-col items-center justify-center border-2 border-dashed border-[#141414]/20 rounded-xl">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center max-w-md"
            >
              <div className="w-20 h-20 bg-[#141414]/5 rounded-full flex items-center justify-center mx-auto mb-6">
                <FileSpreadsheet size={40} className="opacity-20" />
              </div>
              <h2 className="text-2xl font-serif italic mb-2">No data loaded</h2>
              <p className="text-sm text-[#141414]/60 mb-8">
                Upload an Excel file to get started.
              </p>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-[#141414] text-[#E4E3E0] px-8 py-3 rounded-sm font-medium hover:scale-[1.02] active:scale-[0.98] transition-transform"
              >
                Choose File
              </button>
            </motion.div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard label="Total Courses" value={data.length} icon={<BookOpen size={16} />} />
              <StatCard label="Lab Sections" value={data.filter((d) => d.is_lab).length} icon={<FlaskConical size={16} />} />
              <StatCard 
                label="Conflict Entries" 
                value={conflictEntriesCount} 
                icon={<AlertTriangle size={16} />} 
                variant={conflictEntriesCount > 0 ? "danger" : "success"} 
              />
              <StatCard label="Assigned Rooms" value={new Set(data.map((d: CourseRecord) => `${d.assigned_bldg}-${d.assigned_room}`)).size - 1} icon={<Layers size={16} />} />
            </div>

            {/* Tabs */}
            <div className="flex border-b border-brand-border overflow-x-auto no-scrollbar">
              <TabButton 
                active={activeTab === 'dashboard'} 
                onClick={() => setActiveTab('dashboard')} 
                label="Dashboard" 
                icon={<LayoutGrid size={14} />} 
              />
              <TabButton 
                active={activeTab === 'preview'} 
                onClick={() => setActiveTab('preview')} 
                label="Data Preview" 
                icon={<Search size={14} />} 
              />
              <TabButton 
                active={activeTab === 'conflicts'} 
                onClick={() => setActiveTab('conflicts')} 
                label="Conflicts" 
                icon={<AlertTriangle size={14} />} 
                count={conflictEntriesCount}
              />
              <TabButton 
                active={activeTab === 'planner'} 
                onClick={() => setActiveTab('planner')} 
                label="Weekly Planner" 
                icon={<Calendar size={14} />} 
              />
              <TabButton 
                active={activeTab === 'timeline'} 
                onClick={() => setActiveTab('timeline')} 
                label="Timeline View" 
                icon={<GanttChartSquare size={14} />} 
              />
            </div>

            {/* Content Area */}
            <div className="min-h-[600px]">
              <AnimatePresence mode="wait">
                {activeTab === 'dashboard' && (
                  <motion.div 
                    key="dashboard"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    {dashboardData && (
                      <>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div className="glass-card p-6">
                            <div className="flex items-center justify-between mb-6">
                              <h3 className="font-serif italic text-lg">Conflicts by Day</h3>
                              <span className="text-[10px] uppercase tracking-widest font-mono text-brand-muted">Weekly Distribution</span>
                            </div>
                            <div className="h-[300px] w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dashboardData.dayConflicts}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                                  <Tooltip 
                                    contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    cursor={{ fill: '#f3f4f6' }}
                                  />
                                  <Bar dataKey="count" fill="#1a1a1a" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          <div className="glass-card p-6">
                            <div className="flex items-center justify-between mb-6">
                              <h3 className="font-serif italic text-lg">Course Distribution</h3>
                              <span className="text-[10px] uppercase tracking-widest font-mono text-brand-muted">Lec vs Lab</span>
                            </div>
                            <div className="h-[300px] w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={dashboardData.typeData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                  >
                                    {dashboardData.typeData.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                  </Pie>
                                  <Tooltip 
                                    contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}
                                  />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div className="glass-card p-6">
                            <div className="flex items-center justify-between mb-6">
                              <h3 className="font-serif italic text-lg">Top 5 Utilized Rooms</h3>
                              <span className="text-[10px] uppercase tracking-widest font-mono text-brand-muted">Section Count</span>
                            </div>
                            <div className="h-[300px] w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={dashboardData.topRooms}>
                                  <defs>
                                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                                  <Tooltip 
                                    contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}
                                  />
                                  <Area type="monotone" dataKey="count" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCount)" />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          <div className="glass-card p-6">
                            <div className="flex items-center justify-between mb-6">
                              <h3 className="font-serif italic text-lg">Conflicts by Room</h3>
                              <span className="text-[10px] uppercase tracking-widest font-mono text-brand-muted">Top 5 Problematic</span>
                            </div>
                            <div className="h-[300px] w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dashboardData.topConflictRooms} layout="vertical">
                                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                                  <XAxis type="number" hide />
                                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} width={100} />
                                  <Tooltip 
                                    contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}
                                  />
                                  <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>

                        <div className="glass-card p-6">
                          <div className="flex items-center justify-between mb-6">
                            <h3 className="font-serif italic text-lg">Schedule Density</h3>
                            <span className="text-[10px] uppercase tracking-widest font-mono text-brand-muted">Sections by Hour</span>
                          </div>
                          <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={dashboardData.timeData}>
                                <defs>
                                  <linearGradient id="colorTime" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                                <Tooltip 
                                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}
                                />
                                <Area type="monotone" dataKey="count" stroke="#10b981" fillOpacity={1} fill="url(#colorTime)" />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}

                {activeTab === 'preview' && (
                  <motion.div 
                    key="preview"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="glass-card overflow-hidden"
                  >
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#141414] text-[#E4E3E0]">
                          <th className="p-3">Course ID</th>
                          <th className="p-3">Title</th>
                          <th className="p-3">Days</th>
                          <th className="p-3">Time</th>
                          <th className="p-3">Assigned Room</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.slice(0, 50).map((row: CourseRecord) => {
                          const hasConflict = conflicts.some((c) => c.row_index === row.id);
                          return (
                            <tr key={row.id} className={cn(
                              "border-b border-[#141414]/10 hover:bg-[#141414]/5",
                              hasConflict && "bg-red-50"
                            )}>
                              <td className="p-3 font-mono text-xs">{row.course_id}</td>
                              <td className="p-3">{row.title}</td>
                              <td className="p-3">{row.days}</td>
                              <td className="p-3 font-mono text-xs">{formatTime(row.start_min)} – {formatTime(row.end_min)}</td>
                              <td className="p-3 font-mono text-xs">{row.assigned_bldg}-{row.assigned_room}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </motion.div>
                )}

                {activeTab === 'conflicts' && (
                  <motion.div 
                    key="conflicts"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="glass-card p-6"
                  >
                    {conflicts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 opacity-30">
                        <CheckCircle2 size={48} className="mb-4" />
                        <p className="font-serif italic text-xl">No conflicts detected</p>
                      </div>
                    ) : (
                      <div>
                        <h2 className="font-serif italic text-xl mb-4">Active Conflicts ({conflictEntriesCount})</h2>
                    {uniqueConflictPairs !== conflictEntriesCount && (
                      <p className="text-sm text-[#141414]/70 mb-4">
                        Showing {conflictEntriesCount} conflict entries across {uniqueConflictPairs} unique overlap pair(s).
                      </p>
                    )}
                    <div className="space-y-4">
                          {conflicts.map((c, i) => (
                            <div key={i} className="p-4 border border-[#141414] rounded-sm bg-white">
                              <div className="flex items-start gap-3">
                                <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                  <h3 className="font-bold text-lg">{c.course_id}</h3>
                                  <p className="text-sm text-[#141414]/70">
                                    <span className="font-bold">Conflicts with:</span> {c.other_course}
                                  </p>
                                  <p className="text-xs text-[#141414]/60 mt-1">
                                    {DAY_LABELS[c.day]} at {c.time} in {c.assigned_bldg}-{c.assigned_room}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'planner' && (
                  <motion.div 
                    key="planner"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="glass-card p-6"
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] uppercase tracking-widest font-mono opacity-50">Filter Room</label>
                          <select 
                            value={selectedRoom}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedRoom(e.target.value)}
                            className="bg-white border border-[#141414] rounded-sm px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#141414]"
                          >
                            {roomsList.map(r => {
                              const label = r === "(All rooms)" ? r : r.replace('|', ' - ');
                              return <option key={r} value={r}>{label}</option>;
                            })}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] uppercase tracking-widest font-mono opacity-50">Slot Size</label>
                          <select 
                            value={slotMinutes}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => setSlotMinutes(parseInt(e.target.value, 10))}
                            className="bg-white border border-[#141414] rounded-sm px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#141414]"
                          >
                            <option value={15}>15 min</option>
                            <option value={30}>30 min</option>
                            <option value={60}>60 min</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest font-mono">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 bg-orange-100 border border-orange-300 rounded-sm"></div>
                          <span>Lab</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded-sm"></div>
                          <span>Lecture</span>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-[#141414] rounded-sm">
                      <table className="w-full border-collapse table-fixed min-w-[800px]">
                        <thead>
                          <tr className="bg-[#141414] text-[#E4E3E0] text-[10px] uppercase tracking-widest font-mono">
                            <th className="w-20 p-2 border-r border-[#E4E3E0]/10">Time</th>
                            {DAY_ORDER.map(d => (
                              <th key={d} className="p-2 border-r border-[#E4E3E0]/10 last:border-r-0">{DAY_LABELS[d]}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {gridData.timeSlots.map(t => {
                            const timeStr = formatTime(t);
                            return (
                              <tr key={t} className="border-b border-[#141414]/10 h-12">
                                <td className="p-2 bg-[#141414]/5 text-[10px] font-mono text-center border-r border-[#141414]/10">
                                  {timeStr}
                                </td>
                                {DAY_ORDER.map(d => {
                                  const items = gridData.grid[timeStr]?.[d] || [];
                                  return (
                                    <td key={d} className="p-1 border-r border-[#141414]/10 last:border-r-0 align-top">
                                      {items.map((item, idx) => (
                                        <div 
                                          key={`${item.id}-${idx}`}
                                          className={cn(
                                            "text-[9px] p-1 mb-1 rounded-sm border truncate leading-tight",
                                            item.is_lab 
                                              ? "bg-orange-50 border-orange-200 text-orange-900" 
                                              : "bg-blue-50 border-blue-200 text-blue-900"
                                          )}
                                          title={`${item.course_id}: ${item.title}`}
                                        >
                                          {item.is_lab ? "🧪" : "📘"} {item.course_id}
                                        </div>
                                      ))}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'timeline' && (
                  <motion.div 
                    key="timeline"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="glass-card p-6"
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase tracking-widest font-mono opacity-50">Filter Room</label>
                        <select 
                          value={selectedRoom}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedRoom(e.target.value)}
                          className="bg-white border border-[#141414] rounded-sm px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[#141414]"
                        >
                          {roomsList.map(r => {
                            const label = r === "(All rooms)" ? r : r.replace('|', ' - ');
                            return <option key={r} value={r}>{label}</option>;
                          })}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-8">
                      {DAY_ORDER.map(day => {
                        const dayData = filteredData.filter((d: CourseRecord) => d.days_list.includes(day));
                        if (dayData.length === 0) return null;

                        return (
                          <div key={day} className="space-y-2">
                            <h3 className="text-[10px] uppercase tracking-[0.3em] font-mono font-bold border-b border-[#141414] pb-1">
                              {DAY_LABELS[day]}
                            </h3>
                            <div className="relative h-24 bg-[#141414]/5 rounded-sm overflow-hidden border border-[#141414]/10">
                              {/* Hour markers */}
                              {Array.from({ length: 13 }).map((_, i) => {
                                const hour = i + 8; // 8 AM to 8 PM
                                const left = ((hour * 60 - 8 * 60) / (12 * 60)) * 100;
                                return (
                                  <div 
                                    key={i} 
                                    className="absolute top-0 bottom-0 border-l border-[#141414]/10" 
                                    style={{ left: `${left}%` }}
                                  >
                                    <span className="absolute top-1 left-1 text-[8px] font-mono opacity-30">{hour}:00</span>
                                  </div>
                                );
                              })}

                              {/* Course blocks */}
                              {dayData.map((course: CourseRecord, idx: number) => {
                                if (course.start_min === null || course.end_min === null) return null;
                                const left = ((course.start_min - 8 * 60) / (12 * 60)) * 100;
                                const width = ((course.end_min - course.start_min) / (12 * 60)) * 100;
                                
                                return (
                                  <motion.div
                                    key={`${course.id}-${idx}`}
                                    initial={{ scaleX: 0 }}
                                    animate={{ scaleX: 1 }}
                                    className={cn(
                                      "absolute top-6 bottom-6 rounded-sm border flex flex-col justify-center px-2 overflow-hidden group cursor-help",
                                      course.is_lab 
                                        ? "bg-orange-100 border-orange-300 text-orange-900" 
                                        : "bg-blue-100 border-blue-300 text-blue-900"
                                    )}
                                    style={{ left: `${left}%`, width: `${width}%`, transformOrigin: 'left' }}
                                    title={`${course.course_id}: ${course.title} (${formatTime(course.start_min)} - ${formatTime(course.end_min)})`}
                                  >
                                    <span className="text-[9px] font-bold truncate">{course.course_id}</span>
                                    <span className="text-[7px] uppercase tracking-tighter truncate opacity-70">{course.assigned_bldg}-{course.assigned_room}</span>
                                  </motion.div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-brand-border p-8 bg-white">
        <div className="max-w-[1600px] mx-auto text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] font-mono font-bold text-brand-muted">
            © 2026 Room Assignment & Conflict Resolver - API Version
          </p>
        </div>
      </footer>
    </div>
  );
}

// Sub-components
function StatCard({ label, value, icon, variant = "default" }: { 
  label: string, 
  value: string | number, 
  icon: React.ReactNode, 
  variant?: "default" | "danger" | "success" | "warning" 
}) {
  const colors = {
    default: "text-blue-600 bg-blue-50 border-blue-100",
    success: "text-emerald-600 bg-emerald-50 border-emerald-100",
    danger: "text-rose-600 bg-rose-50 border-rose-100",
    warning: "text-amber-600 bg-amber-50 border-amber-100"
  };

  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="glass-card p-6 flex items-center gap-4"
    >
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center border", colors[variant])}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-brand-muted uppercase tracking-wider">{label}</p>
        <h3 className="text-2xl font-bold mt-0.5">{value}</h3>
      </div>
    </motion.div>
  );
}

function TabButton({ active, onClick, label, icon, count }: { 
  active: boolean, 
  onClick: () => void, 
  label: string, 
  icon: React.ReactNode, 
  count?: number 
}) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all relative",
        active ? "text-brand-ink" : "text-brand-muted hover:text-brand-ink"
      )}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
          {count}
        </span>
      )}
      {active && (
        <motion.div 
          layoutId="activeTab"
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-ink"
        />
      )}
    </button>
  );
}
