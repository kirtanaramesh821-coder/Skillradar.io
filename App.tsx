/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Rocket, 
  FileText, 
  ChevronRight, 
  Briefcase, 
  CheckCircle2, 
  Target, 
  Map, 
  Bell, 
  Play,
  ArrowLeft,
  Loader2,
  ExternalLink,
  GraduationCap,
  RotateCcw
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface RoleSuggestion {
  title: string;
  matchPercentage: number;
  matchReason: string;
  existingSkills: string[];
  missingSkills: string[];
  readinessPercentage: number;
}

interface RoadmapDay {
  day: number;
  goal: string;
  resource: string;
  resourceType: string;
  completed?: boolean;
}

interface RoadmapWeek {
  weekNumber: number;
  focus: string;
  days: RoadmapDay[];
  weeklySimulation: {
    title: string;
    description: string;
  };
}

interface Roadmap {
  weeks: RoadmapWeek[];
}

interface Scenario {
  title: string;
  situation: string;
  options: string[];
  correctIndex: number;
  feedbacks: string[];
}

// --- Components ---

const Doodle = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={cn("absolute opacity-20 pointer-events-none", className)}>
    <path 
      d="M20,50 Q30,20 50,50 T80,50" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      className="animate-pulse"
    />
    <circle cx="20" cy="20" r="5" fill="currentColor" />
    <circle cx="80" cy="80" r="8" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
);

export default function App() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [resumeText, setResumeText] = useState("");
  const [roleSuggestions, setRoleSuggestions] = useState<RoleSuggestion[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleSuggestion | null>(null);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [simulation, setSimulation] = useState<Scenario[]>([]);
  const [simStep, setSimStep] = useState(0);
  const [simFeedback, setSimFeedback] = useState<string | null>(null);
  const [userAnswers, setUserAnswers] = useState<number[]>([]);
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [activeWeeklyChallenge, setActiveWeeklyChallenge] = useState<{title: string, description: string} | null>(null);

  // --- Handlers ---

  // Prefetch simulation data in the background
  const prefetchSimulation = useCallback(async (roleTitle: string) => {
    if (simulation.length > 0 || isPrefetching) return;
    setIsPrefetching(true);
    try {
      const res = await fetch("/api/get-simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: roleTitle }),
      });
      if (!res.ok) throw new Error("Failed prefetch");
      const data = await res.json();
      if (data && data.scenarios) {
        setSimulation(data.scenarios);
      }
    } catch (err) {
      console.warn("Simulation prefetch failed:", err);
    } finally {
      setIsPrefetching(false);
    }
  }, [simulation.length, isPrefetching]);

  const analyzeResume = async (file?: File) => {
    setLoading(true);
    try {
      const formData = new FormData();
      if (file) {
        formData.append("resume", file);
      } else {
        formData.append("text", resumeText);
      }

      const res = await fetch("/api/analyze-resume", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        let errMsg = `Error ${res.status}`;
        try {
          const json = JSON.parse(text);
          errMsg = json.error || errMsg;
        } catch (e) {}
        throw new Error(errMsg);
      }

      const data = await res.json();
      setRoleSuggestions(data.roles);
      setStep(3);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Something went wrong analyzing your resume.");
    } finally {
      setLoading(false);
    }
  };

  const generateRoadmap = async (role: RoleSuggestion) => {
    setSelectedRole(role);
    setLoading(true);
    try {
      const res = await fetch("/api/generate-roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: role.title,
          currentSkills: role.existingSkills,
          missingSkills: role.missingSkills
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let errMsg = `Error ${res.status}`;
        try {
          const json = JSON.parse(text);
          errMsg = json.error || errMsg;
        } catch (e) {}
        throw new Error(errMsg);
      }

      const data = await res.json();
      
      // Deep validation to prevent crashes and ensure days exist
      if (data && data.weeks && Array.isArray(data.weeks) && data.weeks.length > 0) {
        // Double check that at least some days exist in the first week
        if (!data.weeks[0]?.days || !Array.isArray(data.weeks[0].days)) {
          throw new Error("The AI provided an empty schedule. Please try generating again.");
        }
        setRoadmap(data);
        setStep(5);
        // Start prefetching simulation immediately after roadmap success
        prefetchSimulation(role.title);
      } else {
        throw new Error("Invalid roadmap structure received");
      }
    } catch (err) {
      console.error(err);
      alert("AI was unable to generate a valid roadmap. Please try again!");
    } finally {
      setLoading(false);
    }
  };

  const startSimulation = async () => {
    if (!selectedRole) return;
    
    // If we already have prefetched data, go straight to it
    if (simulation.length > 0) {
      setSimStep(0);
      setSimFeedback(null);
      setUserAnswers([]);
      setStep(6);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/get-simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole.title }),
      });

      if (!res.ok) {
        const text = await res.text();
        let errMsg = `Error ${res.status}`;
        try {
          const json = JSON.parse(text);
          errMsg = json.error || errMsg;
        } catch (e) {}
        throw new Error(errMsg);
      }

      const data = await res.json();
      
      // Deep validation
      if (data && data.scenarios && Array.isArray(data.scenarios) && data.scenarios.length > 0) {
        setSimulation(data.scenarios);
        setSimStep(0);
        setSimFeedback(null);
        setUserAnswers([]);
        setStep(6);
      } else {
        throw new Error("Invalid simulation scenarios received");
      }
    } catch (err) {
      console.error(err);
      alert("Could not load simulation scenarios. Plase try again!");
    } finally {
      setLoading(false);
    }
  };

  const toggleDayCompletion = (weekIdx: number, dayIdx: number) => {
    if (!roadmap || !roadmap.weeks || !roadmap.weeks[weekIdx]?.days) return;
    const newRoadmap = JSON.parse(JSON.stringify(roadmap)); // Deep clone
    newRoadmap.weeks[weekIdx].days[dayIdx].completed = !newRoadmap.weeks[weekIdx].days[dayIdx].completed;
    setRoadmap(newRoadmap);
  };

  const calculateProgress = () => {
    if (!roadmap || !roadmap.weeks) return 0;
    let totalDays = 0;
    let completedDays = 0;
    
    roadmap.weeks.forEach(w => {
      if (w.days && Array.isArray(w.days)) {
        totalDays += w.days.length;
        completedDays += w.days.filter(d => d.completed).length;
      }
    });

    if (totalDays === 0) return 0;
    return Math.round((completedDays / totalDays) * 100);
  };

  const handleSimAnswer = (idx: number) => {
    const currentSim = simulation[simStep];
    setUserAnswers([...userAnswers, idx]);
    setSimFeedback(currentSim.feedbacks[idx]);
  };

  const nextSimOrFinish = () => {
    if (simStep < simulation.length - 1) {
      setSimStep(simStep + 1);
      setSimFeedback(null);
    } else {
      // Completed last scenario
      setSimFeedback("SUCCESS_COMPLETE");
    }
  };

  const resetAndSwitchRole = () => {
    setRoadmap(null);
    setSimulation([]);
    setSimStep(0);
    setSimFeedback(null);
    setSelectedRole(null);
    setStep(3);
  };

  // --- Screens ---

  const LoadingState = ({ message, submessage }: { message: string, submessage?: string }) => (
    <div className="flex flex-col items-center justify-center p-20 bg-white rounded-[40px] shadow-sm border-4 border-indigo-50 w-full max-w-lg">
      <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
      <p className="text-indigo-900 font-bold text-xl">{message}</p>
      {submessage && <p className="text-indigo-400">{submessage}</p>}
    </div>
  );

  const Screen1 = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white/80 backdrop-blur-md p-10 rounded-[40px] shadow-xl text-center relative overflow-hidden max-w-lg w-full border-4 border-indigo-100"
    >
      <Doodle className="top-4 left-4 w-12 text-indigo-300" />
      <Doodle className="bottom-4 right-4 w-16 text-indigo-300 rotate-180" />
      <div className="bg-indigo-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
        <Target className="w-10 h-10 text-indigo-600" />
      </div>
      <h1 className="text-4xl font-bold text-indigo-900 mb-4 font-sans tracking-tight">SkillRadar</h1>
      <p className="text-lg text-indigo-600/80 mb-8 font-medium">
        Discover your perfect career path and bridge the gap to your dream job with AI-powered insight.
      </p>
      <button 
        onClick={() => setStep(2)}
        className="bg-indigo-600 text-white px-10 py-4 rounded-full font-bold text-lg hover:bg-indigo-700 transition-all hover:scale-105 shadow-lg flex items-center gap-2 mx-auto"
      >
        Get Started <Rocket className="w-5 h-5" />
      </button>
    </motion.div>
  );

  const Screen2 = () => (
    <motion.div 
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -300, opacity: 0 }}
      className="w-full max-w-4xl"
    >
      <div className="mb-8 flex items-center gap-4">
        <button onClick={() => setStep(1)} className="p-2 hover:bg-white/50 rounded-full transition-colors">
          <ArrowLeft className="text-indigo-600" />
        </button>
        <h2 className="text-3xl font-bold text-indigo-900">Upload your Resume</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[32px] border-4 border-dashed border-sky-200 hover:border-sky-400 transition-colors flex flex-col items-center justify-center text-center">
          <div className="bg-sky-50 p-4 rounded-full mb-4">
            <FileText className="w-10 h-10 text-sky-500" />
          </div>
          <h3 className="text-xl font-bold text-sky-900 mb-2">Upload Document</h3>
          <p className="text-sky-600 mb-6 font-medium">Drop your PDF or DOCX file here</p>
          <input 
            type="file" 
            accept=".pdf,.docx" 
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) analyzeResume(file);
            }}
            className="hidden" 
            id="resume-upload" 
          />
          <label 
            htmlFor="resume-upload"
            className="bg-sky-500 text-white px-6 py-3 rounded-2xl font-bold hover:bg-sky-600 transition-all cursor-pointer shadow-md"
          >
            {loading ? <Loader2 className="animate-spin" /> : "Browse Files"}
          </label>
        </div>

        <div className="bg-white p-8 rounded-[32px] border-4 border-indigo-100 flex flex-col">
          <h3 className="text-xl font-bold text-indigo-900 mb-4">Or Paste Content</h3>
          <textarea 
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your resume content here..."
            className="flex-1 w-full bg-indigo-50/50 p-4 rounded-2xl border-2 border-indigo-100 focus:border-indigo-300 outline-none resize-none font-medium text-indigo-800 min-h-[200px]"
          />
          <button 
            onClick={() => analyzeResume()}
            disabled={!resumeText || loading}
            className="mt-6 bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold disabled:opacity-50 hover:bg-indigo-700 transition-all shadow-md flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : <Play className="w-4 h-4" />}
            Analyze Resume
          </button>
        </div>
      </div>
    </motion.div>
  );

  const Screen3 = () => (
    <motion.div 
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="w-full max-w-5xl"
    >
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-indigo-900 mb-2">Tailored Career Options</h2>
        <p className="text-indigo-600 font-medium text-lg">Based on your background, here are top roles for you.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {roleSuggestions?.map((role, idx) => (
          <motion.div 
            key={idx}
            whileHover={{ y: -5 }}
            className="bg-white p-6 rounded-[32px] border-4 border-indigo-50 shadow-sm hover:shadow-md transition-all flex flex-col"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="bg-indigo-50 p-3 rounded-2xl">
                <Briefcase className="text-indigo-600 w-6 h-6" />
              </div>
              <div className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-sm font-bold">
                {role.matchPercentage}% Match
              </div>
            </div>
            <h3 className="text-xl font-bold text-indigo-900 mb-2">{role?.title}</h3>
            <p className="text-indigo-600/70 text-sm mb-6 flex-1">{role?.matchReason}</p>
            <button 
              onClick={() => {
                setSelectedRole(role);
                setStep(4);
              }}
              className="w-full bg-indigo-50 text-indigo-600 py-3 rounded-2xl font-bold hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-2"
            >
              Select Career <ChevronRight className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
        {/* Custom Input */}
        <div className="bg-white/50 p-6 rounded-[32px] border-4 border-dashed border-indigo-200 flex flex-col items-center justify-center text-center">
          <h3 className="text-lg font-bold text-indigo-800 mb-4">Not what you expected?</h3>
          <input 
            type="text" 
            placeholder="Enter preferred role..." 
            className="w-full bg-white px-4 py-3 rounded-2xl border-2 border-indigo-100 mb-4 focus:border-indigo-300 outline-none"
          />
          <button className="bg-indigo-400 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-500 transition-all">
            Check Match
          </button>
        </div>
      </div>
    </motion.div>
  );

  const Screen4 = () => (
    <motion.div 
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="w-full max-w-3xl"
    >
      <div className="mb-8 flex items-center gap-4">
        <button onClick={() => setStep(3)} className="p-2 hover:bg-white/50 rounded-full transition-colors">
          <ArrowLeft className="text-indigo-600" />
        </button>
        <h2 className="text-3xl font-bold text-indigo-900">Skill Gap Analysis</h2>
      </div>

      <div className="bg-white p-10 rounded-[40px] shadow-sm border-4 border-indigo-50 mb-8">
        <div className="flex flex-col md:flex-row items-center gap-10 mb-10">
          <div className="relative w-40 h-40">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-indigo-50" />
              <circle 
                cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="transparent"
                strokeDasharray={440}
                strokeDashoffset={440 - (440 * (selectedRole?.readinessPercentage || 0)) / 100}
                className="text-indigo-500 transition-all duration-1000 ease-out"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-black text-indigo-900">{selectedRole?.readinessPercentage}%</span>
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Ready</span>
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-indigo-900 mb-2">{selectedRole?.title}</h3>
            <p className="text-indigo-600/70 font-medium">
              You have a solid foundation! To reach 100%, we've identified key skills to focus on during your 30-day plan.
            </p>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h4 className="flex items-center gap-2 font-bold text-emerald-600 mb-4">
              <CheckCircle2 className="w-5 h-5" /> Your Strengths
            </h4>
            <div className="flex flex-wrap gap-2">
              {selectedRole?.existingSkills?.map((s, i) => (
                <span key={i} className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-full text-sm font-bold border border-emerald-100">
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h4 className="flex items-center gap-2 font-bold text-rose-500 mb-4">
              <Target className="w-5 h-5" /> Skills to Acquire
            </h4>
            <div className="flex flex-wrap gap-2">
              {selectedRole?.missingSkills?.map((s, i) => (
                <span key={i} className="bg-rose-50 text-rose-500 px-4 py-2 rounded-full text-sm font-bold border border-rose-100">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <button 
        onClick={() => {
          if (selectedRole) generateRoadmap(selectedRole);
        }}
        disabled={loading}
        className="w-full bg-indigo-600 text-white py-5 rounded-[24px] font-bold text-xl shadow-lg hover:bg-indigo-700 transition-all scale-hover flex items-center justify-center gap-3"
      >
        {loading ? <Loader2 className="animate-spin" /> : <Map className="w-6 h-6" />}
        Build My 30-Day Roadmap
      </button>
    </motion.div>
  );

  const Screen5 = () => {
    if (!roadmap || !roadmap.weeks || roadmap.weeks.length === 0) {
      return <LoadingState 
        message="Crafting your custom roadmap..." 
        submessage="Our AI is mapping out your 30-day journey based on your skills." 
      />;
    }

    const progressValue = calculateProgress();

    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-6xl flex flex-col lg:flex-row gap-8 items-start"
      >
        {/* Sidebar */}
        <div className="w-full lg:w-80 space-y-6 lg:sticky lg:top-8">
          <div className="bg-white p-8 rounded-[32px] border-4 border-indigo-50 shadow-sm">
            <h2 className="text-2xl font-bold text-indigo-900 mb-6">Learning Goal</h2>
            <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-2xl mb-8">
              <Briefcase className="text-indigo-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest truncate">Role</p>
                <p className="font-bold text-indigo-900 truncate">{selectedRole?.title || 'Target Role'}</p>
              </div>
            </div>

            <div className="space-y-2 mb-8">
              <div className="flex justify-between items-end mb-2">
                <p className="font-bold text-indigo-900">Total Progress</p>
                <p className="text-indigo-600 font-bold">{progressValue}%</p>
              </div>
              <div className="h-4 bg-indigo-100 rounded-full overflow-hidden border border-indigo-200">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progressValue}%` }}
                  className="h-full bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                />
              </div>
            </div>

            <button 
              onClick={startSimulation}
              disabled={loading}
              className="w-full bg-rose-500 text-white py-4 rounded-2xl font-bold shadow-md hover:bg-rose-600 transition-all flex items-center justify-center gap-2 group active:scale-95 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Play className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />}
              Try a Job Scenario
            </button>
          </div>

          <div className="bg-indigo-600 text-white p-6 rounded-[32px] shadow-lg hidden lg:block">
            <div className="flex items-center gap-3 mb-4">
              <Target className="w-5 h-5 text-indigo-200" />
              <h4 className="font-bold">Next Milestone</h4>
            </div>
            <p className="text-sm text-indigo-100/80 leading-relaxed font-medium">
              Complete {roadmap.weeks.length} weeks of training to unlock your final career readiness certificate.
            </p>
          </div>
        </div>

        {/* Roadmap Content */}
        <div className="flex-1 space-y-12 pb-20 w-full">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            <div className="bg-indigo-600 text-white p-3 rounded-2xl shadow-lg ring-4 ring-indigo-50 shrink-0">
              <Map className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-4xl font-bold text-indigo-900">Your 30-Day Blueprint</h2>
              <p className="text-indigo-500 font-medium">Mastering {selectedRole?.title || 'the required skills'} step-by-step.</p>
            </div>
          </div>

          {roadmap.weeks.map((week, wIdx) => (
            <div key={wIdx} className="space-y-6">
              <div className="flex items-center gap-4">
                <span className="text-6xl font-black text-indigo-100 leading-none">0{week.weekNumber}</span>
                <div className="h-px bg-indigo-100 flex-1" />
                <div className="bg-white px-6 py-2 rounded-full border-2 border-indigo-100 text-indigo-800 font-bold uppercase tracking-tight text-sm">
                  WEEK {week.weekNumber}: {week.focus}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {week.days && week.days.length > 0 ? (
                  week.days.map((day, dIdx) => (
                    <motion.div 
                      key={dIdx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: dIdx * 0.05 }}
                      onClick={() => toggleDayCompletion(wIdx, dIdx)}
                      className={cn(
                        "flex bg-white rounded-[24px] border-2 cursor-pointer transition-all p-6 group relative overflow-hidden shadow-sm hover:shadow-xl",
                        day.completed 
                          ? "border-emerald-400 bg-emerald-50/30" 
                          : "border-indigo-200 hover:border-indigo-500"
                      )}
                    >
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-3">
                           <div className={cn(
                             "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em]",
                             day.completed ? "bg-emerald-100 text-emerald-600" : "bg-indigo-100 text-indigo-600"
                           )}>
                             Day {day.day}
                           </div>
                           {day.completed && <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-50" />}
                        </div>
                        <h4 className={cn(
                          "font-bold text-indigo-900 mb-4 leading-snug text-lg transition-all",
                          day.completed ? "line-through opacity-40 italic" : "opacity-100"
                        )}>
                          {day.goal}
                        </h4>
                        <div className="flex items-center justify-between mt-auto">
                          <a 
                            href={day.resource} 
                            target="_blank" 
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-wider bg-indigo-50 border border-indigo-100 px-3 py-2 rounded-xl"
                          >
                            Study Guide <ExternalLink className="w-3 h-3" />
                          </a>
                          <div className={cn(
                            "w-4 h-4 rounded-full border-2 transition-colors",
                            day.completed ? "bg-emerald-500 border-emerald-500" : "border-indigo-200 group-hover:border-indigo-400"
                          )} />
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="col-span-full p-12 bg-indigo-50/50 rounded-[40px] text-center border-4 border-dashed border-indigo-100">
                    <Loader2 className="w-8 h-8 text-indigo-300 animate-spin mx-auto mb-4" />
                    <p className="text-indigo-400 font-bold">Waiting for AI to populate this week's tasks...</p>
                  </div>
                )}
              </div>

              {week.weeklySimulation && (
                <div className="bg-indigo-950 text-white p-8 sm:p-10 rounded-[40px] relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-12 transition-transform hidden sm:block">
                    <Target className="w-32 h-32" />
                  </div>
                  <div className="relative z-10">
                    <span className="bg-indigo-500/20 text-indigo-300 px-4 py-1.5 rounded-full text-xs font-black mb-4 inline-block uppercase tracking-widest border border-indigo-500/30">
                      Weekly Challenge
                    </span>
                    <h3 className="text-2xl font-bold mb-3">{week.weeklySimulation.title}</h3>
                    <p className="text-indigo-200/80 mb-6 max-w-lg leading-relaxed font-medium">{week.weeklySimulation.description}</p>
                    <button 
                      onClick={() => setActiveWeeklyChallenge(week.weeklySimulation)}
                      className="bg-white text-indigo-950 px-8 py-3 rounded-2xl font-black hover:bg-indigo-100 transition-all flex items-center gap-2 group"
                    >
                      Simulation <Play className="w-4 h-4 fill-current group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    );
  };

  const Screen6 = () => {
    if (!simulation || simulation.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-20 bg-white rounded-[40px] shadow-sm border-4 border-indigo-100">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
          <p className="text-indigo-900 font-bold text-xl">Preparing your simulation...</p>
          <p className="text-indigo-400">We're loading {simulation.length > 0 ? '' : '6'} real-world scenarios for you.</p>
        </div>
      );
    }

    const currentSim = simulation[simStep];
    const isLast = simStep === simulation.length - 1;

    return (
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-4xl"
      >
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setStep(5)} className="p-2 hover:bg-white/50 rounded-full transition-colors">
              <ArrowLeft className="text-indigo-600" />
            </button>
            <h2 className="text-3xl font-bold text-indigo-900 italic">Day as a {selectedRole?.title}</h2>
          </div>
          <div className="bg-white px-4 py-2 rounded-full border-2 border-indigo-100 font-bold text-indigo-600">
            Scenario {simStep + 1} / {simulation.length}
          </div>
        </div>

        <div className="bg-white p-10 rounded-[44px] shadow-sm border-4 border-indigo-50 mb-8 relative overflow-hidden">
          <Doodle className="top-0 right-0 w-40 text-indigo-50 -rotate-12" />
          <div className="relative z-10">
            <h3 className="text-2xl font-bold text-indigo-900 mb-6 underline decoration-indigo-200 underline-offset-8">
              {currentSim?.title}
            </h3>
            <p className="text-lg text-indigo-700/80 mb-10 leading-relaxed font-medium bg-indigo-50/30 p-6 rounded-3xl">
              {currentSim?.situation}
            </p>

            <div className="grid gap-4">
              {currentSim?.options?.map((opt, i) => (
                <button 
                  key={i}
                  disabled={simFeedback !== null}
                  onClick={() => handleSimAnswer(i)}
                  className={cn(
                    "w-full text-left p-5 rounded-3xl border-2 font-bold transition-all flex justify-between items-center group",
                    simFeedback !== null 
                      ? (i === currentSim.correctIndex ? "bg-emerald-50 border-emerald-400 text-emerald-700" : "bg-red-50 border-red-200 opacity-50")
                      : "bg-white border-indigo-50 hover:border-indigo-300 hover:bg-indigo-50/50"
                  )}
                >
                  {opt}
                  {!simFeedback && <ChevronRight className="w-5 h-5 text-indigo-200 group-hover:text-indigo-500" />}
                  {simFeedback && i === currentSim.correctIndex && <CheckCircle2 className="w-6 h-6 text-emerald-500" />}
                </button>
              ))}
            </div>

            {simFeedback && (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="mt-8 bg-indigo-950 text-white p-8 rounded-[32px] border-b-8 border-indigo-800"
              >
                {simFeedback === "SUCCESS_COMPLETE" ? (
                  <div className="text-center">
                    <div className="bg-emerald-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/20">
                      <CheckCircle2 className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold mb-2">Simulation Complete!</h3>
                    <p className="text-indigo-200 mb-8 max-w-sm mx-auto font-medium">
                      Excellent work! You've successfully navigated all professional scenarios. Ready to explore a different career path?
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                      <button 
                        onClick={() => setStep(5)}
                        className="bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-2xl font-bold transition-all"
                      >
                        Back to Roadmap
                      </button>
                      <button 
                        onClick={resetAndSwitchRole}
                        className="bg-indigo-500 hover:bg-indigo-400 text-white px-8 py-4 rounded-2xl font-bold shadow-lg transition-all flex items-center justify-center gap-2"
                      >
                        Try a Different Role <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-3">
                      <Bell className="text-indigo-400 w-5 h-5" />
                      <span className="text-xs font-black uppercase tracking-widest text-indigo-400">AI Feedback</span>
                    </div>
                    <p className="text-lg font-medium italic mb-6 leading-relaxed">
                      "{simFeedback}"
                    </p>
                    <button 
                      onClick={nextSimOrFinish}
                      className="bg-indigo-500 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-400 transition-all flex items-center gap-2"
                    >
                      {isLast && simStep === simulation.length - 1 && userAnswers.length === simulation.length 
                        ? "Finish Simulation" 
                        : "Next Scenario"} 
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className={cn(
      "min-h-screen bg-[#FDFCFB] font-sans selection:bg-indigo-200 text-indigo-950 p-6 md:p-12 transition-colors duration-500",
      step === 5 && "bg-indigo-50/30"
    )}>
      {/* Dynamic Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-100 rounded-full blur-[120px] opacity-40 animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-sky-100 rounded-full blur-[120px] opacity-40" />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-rose-50 rounded-full blur-[120px] opacity-30" />
      </div>

      <nav className="max-w-6xl mx-auto mb-16 flex justify-between items-center relative z-10">
        <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setStep(1)}>
          <div className="bg-indigo-600 text-white p-2.5 rounded-2xl shadow-lg ring-4 ring-white group-hover:rotate-12 transition-transform">
            <Target className="w-6 h-6" />
          </div>
          <span className="text-2xl font-black tracking-tight text-indigo-900">SkillRadar</span>
        </div>
        
        <div className="hidden md:flex items-center gap-8 text-indigo-400 font-bold uppercase text-[10px] tracking-[0.2em]">
          <span className={cn("transition-colors", step >= 2 && "text-indigo-900 border-b-2 border-indigo-500")}>Upload</span>
          <ChevronRight className="w-4 h-4" />
          <span className={cn("transition-colors", step >= 3 && "text-indigo-900 border-b-2 border-indigo-500")}>Discover</span>
          <ChevronRight className="w-4 h-4" />
          <span className={cn("transition-colors", step >= 5 && "text-indigo-900 border-b-2 border-indigo-500")}>Master</span>
        </div>

        <button className="bg-white p-3 rounded-2xl shadow-sm border border-indigo-50 hover:bg-indigo-50 transition-colors">
          <GraduationCap className="text-indigo-600" />
        </button>
      </nav>

      <main className={cn(
        "max-w-6xl mx-auto flex justify-center min-h-[70vh] w-full",
        (step === 5 || step === 6) ? "items-start" : "items-center"
      )}>
        <AnimatePresence mode="wait">
          {step === 1 && <Screen1 key="1" />}
          {step === 2 && <Screen2 key="2" />}
          {step === 3 && <Screen3 key="3" />}
          {step === 4 && <Screen4 key="4" />}
          {step === 5 && <Screen5 key="5" />}
          {step === 6 && <Screen6 key="6" />}
        </AnimatePresence>
      </main>

      {/* Weekly Challenge Modal */}
      <AnimatePresence>
        {activeWeeklyChallenge && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-indigo-950/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden border-4 border-indigo-100 flex flex-col"
            >
              <div className="bg-indigo-600 p-8 text-white relative">
                <Doodle className="top-0 right-0 w-32 text-white/10" />
                <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 inline-block">Weekly Performance Task</span>
                <h3 className="text-3xl font-bold">{activeWeeklyChallenge.title}</h3>
              </div>
              <div className="p-8">
                <p className="text-indigo-900 leading-relaxed text-lg mb-8 font-medium">
                  {activeWeeklyChallenge.description}
                </p>
                
                <div className="bg-amber-50 border-2 border-amber-100 p-6 rounded-3xl mb-8">
                  <h4 className="font-bold text-amber-900 mb-2 flex items-center gap-2">
                    <Bell className="w-4 h-4" /> Ready to Submit?
                  </h4>
                  <p className="text-sm text-amber-800">
                    This is a self-assessment task. Work on the scenario described above, and when you feel confident in your solution, mark it as completed.
                  </p>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setActiveWeeklyChallenge(null)}
                    className="flex-1 bg-indigo-50 text-indigo-600 py-4 rounded-2xl font-bold hover:bg-indigo-100 transition-all"
                  >
                    Close
                  </button>
                  <button 
                    onClick={() => {
                      alert("Achievement Unlocked! You've successfully navigated this week's challenge.");
                      setActiveWeeklyChallenge(null);
                    }}
                    className="flex-1 bg-emerald-500 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                  >
                    Confirm Completion <CheckCircle2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Notification Drawer (Simulated) */}
      <div className="fixed bottom-12 right-12 flex flex-col items-end gap-4 pointer-events-none z-50">
        <motion.div 
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 2 }}
          className="bg-indigo-900 text-white p-6 rounded-[28px] shadow-2xl flex items-start gap-4 max-w-xs pointer-events-auto border-4 border-indigo-800"
        >
          <div className="bg-indigo-500 p-2 rounded-xl">
             <Bell className="w-5 h-5" />
          </div>
          <div>
            <h5 className="font-bold mb-1">Daily Prep Reminder</h5>
            <p className="text-xs text-indigo-300 font-medium">Have you completed your Day {calculateProgress() > 0 ?'2' : '1'} goal yet? Keep the streak alive! ðŸ”¥</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

