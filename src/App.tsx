import React, { useState, useEffect, useRef } from "react";
import { 
  BookOpen, 
  Camera, 
  CheckCircle, 
  RefreshCw, 
  Trash2, 
  Download,
  Users, 
  Upload, 
  Shield, 
  Sparkles, 
  AlertCircle, 
  Play, 
  FileSpreadsheet, 
  MapPin, 
  Award, 
  Trophy, 
  Info, 
  HelpCircle, 
  Tv, 
  User, 
  Layers, 
  Check, 
  EyeOff, 
  Clock,
  ChevronRight 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  collection, 
  doc, 
  setDoc, 
  query, 
  getDocs, 
  onSnapshot, 
  deleteDoc, 
  updateDoc 
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { Quest, Session, Submission } from "./types";
import { compressImage } from "./utils/image";

// Predefined default quests for orientation crowd division
const DEFAULT_QUESTS: Quest[] = [
  {
    id: "quest_1",
    title: "尋找自助還書機 (Self-Service Book Return Booth)",
    location: "1/F 圖書館正門外側 (1/F Library Exterior Lobby)",
    description: "請前往一樓主入口旁的24小時自助還書機，為它的條碼掃描雷射孔拍張照。開學高峰期，學會自主還書能節省很多排隊時間！"
  },
  {
    id: "quest_2",
    title: "探索安靜自主研習室 (Quiet Study Zone)",
    location: "3/F 靜音研習室 (3/F Quiet Area Annex)",
    description: "前往三摟靜音研習室，尋找配有「古典暗綠色燈罩」的愛德華式閱讀檯燈。請拍下檯燈照片（注意不要發出聲音干擾正在自修的同學哦！）。"
  },
  {
    id: "quest_3",
    title: "實用圖書館電子檢索 (OPAC Search Terminal)",
    location: "2/F 電子檢索終端排 (2/F Search Terminal Desk)",
    description: "在二樓公共檢索螢幕上，搜尋一本你感興趣的專業書目，將它呈現在電子系統裡的詳情條目拍下來。它是你大學文獻查找的起點！"
  },
  {
    id: "quest_4",
    title: "參觀24小時研習中心 (24-Hour Study Centre)",
    location: "G/F 24小時研習中心 (G/F 24/7 Learning Centre Entrance)",
    description: "向下走到地下的24小時學習中心入口。拍下入口閘機機座或學生證感應裝置的照片。這裏是期末考週與小組討論衝刺的不夜之城！"
  },
  {
    id: "quest_5",
    title: "發現休閒沙發區 (Leisure Reading Rotunda)",
    location: "2/F 多媒體沙發休閒角 (2/F Multi-Media Reading Alcove)",
    description: "尋找2/F有著舒適半圓形沙發的休閒雜誌區，挑選一本課外休閒漫畫或科普圖書，拍下其封底條碼。學習不僅有厚重課本，也有輕鬆樂趣！"
  }
];

const GROUPS_INFO = [
  {
    name: "Alpha 鳥瞰隊 (Team Falcon)",
    color: "bg-rose-50 border-rose-200 text-rose-700",
    badgeColor: "bg-rose-500",
    order: ["quest_1", "quest_2", "quest_3", "quest_4", "quest_5"],
    startPoint: "1/F 還書機"
  },
  {
    name: "Beta 探幽隊 (Team Owl)",
    color: "bg-sky-50 border-sky-200 text-sky-700",
    badgeColor: "bg-sky-500",
    order: ["quest_3", "quest_4", "quest_5", "quest_1", "quest_2"],
    startPoint: "2/F 檢索台"
  },
  {
    name: "Gamma 覓奇隊 (Team Fox)",
    color: "bg-amber-50 border-amber-200 text-amber-700",
    badgeColor: "bg-amber-500",
    order: ["quest_5", "quest_1", "quest_2", "quest_3", "quest_4"],
    startPoint: "2/F 沙發角"
  }
];

export default function App() {
  // Navigation Role: "student" | "admin" | "projection" (derived from URL link)
  const [currentRole, setCurrentRole] = useState<"student" | "admin" | "projection">(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("role") || params.get("mode") || "student";
    if (r === "admin" || r === "staff") return "admin";
    if (r === "projection") return "projection";
    return "student";
  });

  // Navigation: "student" | "admin" | "projection"
  const [activeTab, setActiveTab ] = useState<"student" | "admin" | "projection" >(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("role") || params.get("mode") || "student";
    if (r === "projection") return "projection";
    return "student";
  });

  // Admin password unlock states
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>("");
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    return sessionStorage.getItem("or_adminUnlocked") === "true";
  });
  const [adminPasswordError, setAdminPasswordError] = useState<string>("");

  // Global Session State
  const [sessions, setSessions] = useState<Session[]>([]);
  // selectedSession: the session this specific browser/tab is currently controlling (per-client, not global)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [latestSubmissions, setLatestSubmissions] = useState<Submission[]>([]);

  // Student specific persistence state
  const [playerName, setPlayerName] = useState<string>(() => localStorage.getItem("or_playerName") || "");
  const [assignedGroupIndex, setAssignedGroupIndex] = useState<number>(() => {
    const saved = localStorage.getItem("or_groupIndex");
    return saved !== null ? parseInt(saved, 10) : -1;
  });
  const [studentQuestsCompleted, setStudentQuestsCompleted] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("or_completedQuests") || "[]");
    } catch {
      return [];
    }
  });
  const [showWelcome, setShowWelcome] = useState<boolean>(() => !localStorage.getItem("or_playerName"));

  // Student gameplay states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [compressedImage, setCompressedImage] = useState<{ base64: string; dataUrl: string } | null>(null);
  const [isCompilersActive, setIsCompilersActive] = useState<boolean>(false);
  const [aiAnalyzing, setAiAnalyzing] = useState<boolean>(false);
  const [aiComment, setAiComment] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [submissionFeedbackVisible, setSubmissionFeedbackVisible] = useState<boolean>(false);
  const [gameSuccessBadge, setGameSuccessBadge] = useState<boolean>(false);

  // Admin and form states
  const [newSessionName, setNewSessionName] = useState<string>("");
  const [csvText, setCsvText] = useState<string>("");
  const [csvPreview, setCsvPreview] = useState<Quest[]>([]);
  const [csvError, setCsvError] = useState<string>("");
  const [submittingSession, setSubmittingSession] = useState<boolean>(false);
  const [isSuccessModal, setIsSuccessModal] = useState<string>("");

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Listen for sessions and submissions updates from Firebase Firestore in real-time
  useEffect(() => {
    const qSessions = query(collection(db, "sessions"));
    const unsubSessions = onSnapshot(qSessions, (snapshot) => {
      const list: Session[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Session;
        list.push(data);
      });
      // Sort sessions by date (newest first)
      list.sort((a, b) => b.createdAt - a.createdAt);
      setSessions(list);
      // NOTE: We no longer auto-pick a global "active" session.
      // Each client independently selects a session via setSelectedSession.
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "sessions");
    });

    const qSubmissions = query(collection(db, "submissions"));
    const unsubSubmissions = onSnapshot(qSubmissions, (snapshot) => {
      const list: Submission[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as Submission);
      });
      // Sort newest submissions first
      list.sort((a, b) => b.createdAt - a.createdAt);
      setLatestSubmissions(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "submissions");
    });

    return () => {
      unsubSessions();
      unsubSubmissions();
    };
  }, []);

  // Save student data locally when changed
  useEffect(() => {
    localStorage.setItem("or_playerName", playerName);
    localStorage.setItem("or_groupIndex", assignedGroupIndex.toString());
    localStorage.setItem("or_completedQuests", JSON.stringify(studentQuestsCompleted));
  }, [playerName, assignedGroupIndex, studentQuestsCompleted]);

  // Determine current questions for student view (based on selected session)
  const currentQuests: Quest[] = selectedSession?.questions && selectedSession.questions.length > 0 
    ? selectedSession.questions 
    : DEFAULT_QUESTS;

  // Filtered submissions for the currently selected session (staff wall)
  const filteredSubmissions = selectedSession 
    ? latestSubmissions.filter(s => s.sessionId === selectedSession.sessionId)
    : latestSubmissions;

  const currentGroup = assignedGroupIndex !== -1 ? GROUPS_INFO[assignedGroupIndex] : null;

  // Order of quests for this student
  const studentQuestsOrder: Quest[] = React.useMemo(() => {
    if (!currentGroup) return currentQuests;
    const sorted: Quest[] = [];
    currentGroup.order.forEach((qId) => {
      const q = currentQuests.find((item) => item.id === qId || item.id === qId.replace("quest_", "q"));
      if (q) sorted.push(q);
    });
    // Add missing quests if any
    currentQuests.forEach((q) => {
      if (!sorted.find((s) => s.id === q.id)) {
        sorted.push(q);
      }
    });
    return sorted;
  }, [currentGroup, currentQuests]);

  const nextQuestIndex = studentQuestsOrder.findIndex(
    (q) => !studentQuestsCompleted.includes(q.id)
  );

  const currentQuest = nextQuestIndex !== -1 ? studentQuestsOrder[nextQuestIndex] : null;

  // Student Form Registration
  const handleStudentJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;

    // Random split assignment mechanism (0, 1, or 2)
    const randIndex = Math.floor(Math.random() * 3);
    setAssignedGroupIndex(randIndex);
    setStudentQuestsCompleted([]);
    setShowWelcome(false);
  };

  // Image upload handling (Trigger and compression)
  const processUploadFile = async (file: File) => {
    setSelectedFile(file);
    setIsCompilersActive(true);
    try {
      const result = await compressImage(file);
      setCompressedImage(result);
    } catch (err: any) {
      alert("圖片壓縮失敗：" + err.message);
    } finally {
      setIsCompilersActive(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processUploadFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUploadFile(e.dataTransfer.files[0]);
    }
  };

  // Submit Answer to AI proxy (Express server endpoint) and Firestore
  const handleAnswerSubmit = async () => {
    if (!currentQuest || !compressedImage || !selectedSession) return;
    setAiAnalyzing(true);
    setAiComment("");

    try {
      // Direct post image data payload to server proxy wrapper
      const response = await fetch("/api/analyze-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          base64Data: compressedImage.base64,
          mimeType: compressedImage.mimeType,
          questTitle: currentQuest.title,
          questDescription: currentQuest.description
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "伺服器或 AI 回應錯誤");
      }

      const data = await response.json();
      const commentText = data.comment;
      setAiComment(commentText);
      setSubmissionFeedbackVisible(true);

      // Save submission seamlessly into NoSQL Firestore DB
      const submissionId = "sub_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
      const submissionData: Submission = {
        submissionId,
        sessionId: selectedSession.sessionId,
        playerName,
        groupName: currentGroup?.name || "未知組別",
        questionId: currentQuest.id,
        questionTitle: currentQuest.title,
        imageUrl: compressedImage.dataUrl, // Stores compressed dataUrl locally
        aiComment: commentText,
        isApproved: true,
        createdAt: Date.now()
      };

      await setDoc(doc(db, "submissions", submissionId), submissionData);

    } catch (error: any) {
      console.error(error);
      const message = error?.message || "未知錯誤";
      alert(`AI 感想生成出錯：${message}\n請再試一次或檢查 API Key / Model。`);
    } finally {
      setAiAnalyzing(false);
    }
  };

  // Confirm and go to next quest
  const handleNextQuest = () => {
    if (currentQuest) {
      setStudentQuestsCompleted((prev) => [...prev, currentQuest.id]);
    }
    // Clean up temporary files
    setSelectedFile(null);
    setCompressedImage(null);
    setAiComment("");
    setSubmissionFeedbackVisible(false);
  };

  const handleRestartFullGame = () => {
    setStudentQuestsCompleted([]);
    setSelectedFile(null);
    setCompressedImage(null);
    setAiComment("");
    setSubmissionFeedbackVisible(false);
    setGameSuccessBadge(false);
  };

  // Admin: Create orientation session (Automatic rotation configuration)
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionName.trim()) return;
    setSubmittingSession(true);

    try {
      // NOTE: We no longer force other sessions to inactive.
      // Multiple sessions can run concurrently on different computers.

      // Determine questions (default list or imported CSV list)
      const sessionQuests = csvPreview.length > 0 ? csvPreview : DEFAULT_QUESTS;

      // Create uniquely identified session (default to active status)
      const newSessId = "sess_" + Date.now();
      const newSession: Session = {
        sessionId: newSessId,
        name: newSessionName,
        status: "active",
        createdAt: Date.now(),
        questions: sessionQuests
      };

      await setDoc(doc(db, "sessions", newSessId), newSession);

      // Automatically select the newly created session on this client
      setSelectedSession(newSession);

      setNewSessionName("");
      setCsvText("");
      setCsvPreview([]);
      setIsSuccessModal("場次已成功建立並在本機選取！其他電腦可獨立選擇其他場次。");
    } catch (err: any) {
      console.error("Create session action failed:", err);
      handleFirestoreError(err, OperationType.CREATE, "sessions");
    } finally {
      setSubmittingSession(false);
    }
  };

  // Admin: CSV Text Parser Setup
  const handleCSVParse = () => {
    if (!csvText.trim()) {
      setCsvError("請輸入 CSV 正確格式內容。");
      return;
    }
    try {
      const lines = csvText.trim().split("\n");
      const tempQuests: Quest[] = [];
      
      lines.forEach((line, index) => {
        // Skip header if matches custom titles
        const trimmed = line.trim();
        if (index === 0 && (trimmed.toLowerCase().includes("id") || trimmed.includes("標題") || trimmed.includes("quest"))) {
          return;
        }
        
        // Simple comma split
        const parts = trimmed.split(",");
        if (parts.length >= 3) {
          tempQuests.push({
            id: parts[0]?.trim() || `q_${index}`,
            title: parts[1]?.trim() || "探索地點",
            location: parts[2]?.trim() || "圖書館角落",
            description: parts[3]?.trim() || "請學長姐引導與背景拍照上傳。"
          });
        }
      });

      if (tempQuests.length === 0) {
        throw new Error("無符合的格式行，請確認以逗號分隔包含：ID, 標題, 位置, 描述");
      }

      setCsvPreview(tempQuests);
      setCsvError("");
    } catch (err: any) {
      setCsvError("CSV 格式解析錯誤：" + err.message);
    }
  };

  // Load a demo CSV file
  const loadDemoCSV = () => {
    const demo = `id,title,location,description
q_1,造訪學術研討室,5/F 專題研討室 502,請走到 5/F，對準大窗戶外的校園地標拍照！
q_2,新書展覽台打卡,1/F 新書展示圓環,挑選一本本月推薦書籍，合照完成解鎖
q_3,服務台諮詢蓋章,1/F 服務台 (Service Counter),在借還書服務台的背景拍照，認識一站式諮詢好幫手
q_4,創客空間體驗,4/F 3D列印創科室 (MakerSpace),尋找 3D 列印樣品並合影，體驗新興加工設施
q_5,多媒體視聽坊,2/F 獨立視擬影音座,坐下來為液晶面板遙控器拍張照，帶耳機放鬆一下吧！`;
    setCsvText(demo);
  };

  // Admin: Delete/Hide Submissions from Live Gallery
  const handleDeleteSubmission = async (subId: string) => {
    try {
      await deleteDoc(doc(db, "submissions", subId));
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `submissions/${subId}`);
    }
  };

  // Admin: Download image from submission (base64 data URL)
  const handleDownloadImage = (imageUrl: string, playerName: string, questionTitle: string) => {
    const link = document.createElement("a");
    link.href = imageUrl;
    const safeName = playerName.replace(/\s+/g, "_");
    const safeQuest = questionTitle.replace(/\s+/g, "_").substring(0, 30);
    link.download = `submission_${safeName}_${safeQuest}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Admin: Password authorization gate handler
  const handleVerifyPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasswordInput.trim() === "8510") {
      setIsAdminUnlocked(true);
      sessionStorage.setItem("or_adminUnlocked", "true");
      setAdminPasswordError("");
    } else {
      setAdminPasswordError("🔒 密碼不正確，請重新輸入！");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-emerald-500 selection:text-white flex flex-col">
      {/* 1. Header Bar Area (Geometric Balance Theme) - Only shown on staff admin or projection modes */}
      {currentRole !== "student" && (
        <header className="bg-slate-900 text-white p-4 rounded-xl shadow-lg border-b-4 border-emerald-500 m-6 flex flex-wrap gap-4 items-center justify-between sticky top-4 z-50">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center font-display font-black text-slate-900 shadow-md">
              LB
            </div>
            <div>
              <h1 className="text-lg font-display font-extrabold tracking-tight">
                ORIENTATION 2026 <span className="text-emerald-400">PROTOTYPE</span>
              </h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono font-medium">
                Library Engagement & Quest System
              </p>
            </div>
          </div>

          {/* Global Control Layout Switchers (Only visible to admin) */}
          {currentRole === "admin" && (
            <div className="flex items-center bg-slate-800 border border-slate-700/60 p-1 rounded-xl">
              <button 
                id="nav-student-btn"
                onClick={() => setActiveTab("student")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-300 flex items-center gap-1.5 ${
                  activeTab === "student" 
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/20" 
                    : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                <User className="h-3.5 w-3.5" />
                📱 新生遊戲端
              </button>
              <button 
                id="nav-admin-btn"
                onClick={() => setActiveTab("admin")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-300 flex items-center gap-1.5 ${
                  activeTab === "admin" 
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/20" 
                    : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                <Shield className="h-3.5 w-3.5" />
                ⚙️ 職員控制台
              </button>
              <button 
                id="nav-projection-btn"
                onClick={() => setActiveTab("projection")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-300 flex items-center gap-1.5 ${
                  activeTab === "projection" 
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/20" 
                    : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                <Tv className="h-3.5 w-3.5" />
                📽️ 即時投影展牆
              </button>
            </div>
          )}

          {/* Dynamic header mode label for non-admin viewers */}
          {currentRole !== "admin" && (
            <div className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-950/40 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 font-semibold uppercase tracking-wider">
              {currentRole === "projection" ? (
                <span className="flex items-center gap-1.5">
                  <Tv className="h-3.5 w-3.5 animate-pulse" />
                  大堂主大螢幕投影模式
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                  智慧圖書館尋寶闖關
                </span>
              )}
            </div>
          )}

          {/* Live indicator details */}
          <div className="hidden lg:flex items-center gap-3 font-mono text-xs text-slate-400">
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-full border border-slate-700">
              <Clock className="h-3.5 w-3.5 text-emerald-400" />
              <span className="uppercase text-[10px]">UTC: 2026-05-28 06:56:37</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-full border border-slate-700">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="uppercase text-[10px]">LIB-Q2-081 ACTIVE</span>
            </div>
          </div>
        </header>
      )}

      {/* 2. Success dialog popups */}
      {isSuccessModal && (
        <div className={`bg-emerald-50 border-y border-emerald-250 py-3.5 px-6 mb-2 rounded-xl text-emerald-800 text-xs flex items-center justify-between shadow-sm ${currentRole === "student" ? "mx-4 mt-4" : "mx-6"}`}>
          <div className="flex items-center gap-2 font-medium">
            <Check className="h-4 w-4 text-emerald-600" />
            <span>{isSuccessModal}</span>
          </div>
          <button onClick={() => setIsSuccessModal("")} className="text-emerald-900 hover:text-emerald-950 font-bold px-1.5">✕ Close</button>
        </div>
      )}

      {/* 3. Main Workspace Grid */}
      <main className={`flex-grow w-full mx-auto grid grid-cols-1 select-none ${currentRole === "student" ? "p-0" : "px-6 pb-6"}`}>
        
        {/* =============== VIEW 1: STUDENT MOBILE CONTAINER =============== */}
        {activeTab === "student" && (
          <div className={currentRole === "student" ? "w-full min-h-screen bg-white" : "flex flex-col lg:flex-row items-center gap-10 justify-center py-6"}>
            
            {/* System layout description panel (Restyled with Geometric Balance, only visible when role is admin for developers/staff to see details) */}
            {currentRole === "admin" && (
              <div className="w-full lg:w-96 flex flex-col gap-6 text-slate-700">
                <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
                  <span className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-full font-display font-semibold uppercase tracking-wider">
                    分流原理
                  </span>
                  <h3 className="text-base font-display font-extrabold mt-3 text-slate-900">智慧隨機分流機制 🚦</h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    每秒若湧入約 <strong>80 位新生</strong> 同時進行實體尋寶，會造成特定櫃檯 and 還書機前人群擁擠。
                  </p>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                    系統會在填名登入時，將玩家隨機分配至 <strong>Alpha 鳥瞰隊</strong>、<strong>Beta 探幽隊</strong>、或 <strong>Gamma 覓奇隊</strong>。每隊有著 <em>顛倒旋轉的解密路線</em>，巧妙在物理空間開展大分流！
                  </p>

                  {/* Simulated split counts */}
                  <div className="grid grid-cols-3 gap-2 mt-4 text-center text-xs font-mono font-bold">
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 text-slate-700">
                      <div>Alpha 隊</div>
                      <div className="text-sm mt-1 text-slate-900">27 👤</div>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 text-slate-700">
                      <div>Beta 隊</div>
                      <div className="text-sm mt-1 text-slate-900">28 👤</div>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 text-slate-700">
                      <div>Gamma 隊</div>
                      <div className="text-sm mt-1 text-slate-900">25 👤</div>
                    </div>
                  </div>
                </div>

                <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-emerald-600 flex-shrink-0 animate-pulse" />
                  <div className="text-xs">
                    <h4 className="font-display font-bold text-slate-900 mb-1">AI 陪伴助理理念</h4>
                    <p className="text-slate-500 leading-relaxed">
                      AI 夥伴不會板起面孔，扮演硬生生的評判機制來刁難大家，而是會以溫慢、略帶科技宅色彩的幽默語氣與大家對話，支持你的大學新生活！
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Mobile Mockup device wrapper frame (Geometric Balance Theme) - Removed frame boundaries if playing live on a mobile browser */}
            <div className={currentRole === "student" 
              ? "w-full max-w-md mx-auto min-h-screen flex flex-col bg-white justify-between overflow-hidden" 
              : "relative bg-slate-900 p-3.5 rounded-[3.2rem] border-4 border-slate-800 shadow-2xl max-w-[370px] w-full min-h-[660px] flex flex-col justify-between overflow-hidden"
            }>
              
              {/* Inner screen glass container */}
              <div className={currentRole === "student" 
                ? "bg-white flex-grow flex flex-col relative" 
                : "bg-white flex-1 rounded-[2.8rem] overflow-hidden flex flex-col relative"
              }>
                
                {/* Physical Top Notch element - Only render when showing simulated mockup view in Admin panel */}
                {currentRole !== "student" && (
                  <div className="absolute top-0 inset-x-0 h-5 bg-slate-900 flex items-center justify-center z-40">
                    <div className="h-3.5 w-24 bg-slate-900 rounded-full border border-slate-800/40 flex items-center justify-around px-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80"></span>
                      <span className="h-1 w-8 bg-slate-800 rounded"></span>
                    </div>
                  </div>
                )}

                {/* Sub Bar showing Active state inside Simulator */}
                <div className={`px-4 pb-2 bg-emerald-600/10 border-b border-emerald-500/20 text-[10px] text-emerald-800 flex justify-between items-center font-mono select-none ${
                  currentRole === "student" ? "pt-3.5" : "pt-7"
                }`}>
                  <span className="text-emerald-600 font-extrabold animate-pulse">● LIVE SYS</span>
                  <span>
                    場次：
                    {selectedSession ? (
                      <strong className="text-emerald-950 font-bold">{selectedSession.name}</strong>
                    ) : (
                      <em className="text-slate-400">無活動場次</em>
                    )}
                  </span>
                </div>

                {/* Scrollable Smartphone OS Canvas */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 flex flex-col relative text-slate-800">
                  
                  {/* Outer Check: is welcome page active? */}
                  {showWelcome ? (
                    <div className="flex-1 flex flex-col justify-center py-6">
                      <div className="text-center flex flex-col items-center mb-6">
                        <div className="h-16 w-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center text-white mb-4 shadow-md">
                          <Sparkles className="h-8 w-8 text-white animate-spin-slow" />
                        </div>
                        <h2 className="text-lg font-display font-black tracking-tight text-slate-900">新生探索起跑點</h2>
                        <p className="text-xs text-slate-500 mt-1 max-w-[240px]">
                          輸入你的名稱，AI 圖書助手將立即登錄你的闖關檔案！
                        </p>
                      </div>

                      <form onSubmit={handleStudentJoin} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col gap-4 shadow-sm">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-black">
                            玩家名稱 / Nickname
                          </label>
                          <input 
                            type="text" 
                            required
                            placeholder="例如：小明 Alex"
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value)}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                          />
                        </div>

                        {/* Session selector for students - must choose before joining */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-black">
                            選擇參加的場次 / Select Session
                          </label>
                          {sessions.length === 0 ? (
                            <div className="text-xs text-slate-400 p-2 bg-white rounded-lg border border-slate-200">
                              目前尚無可用場次，請等待職員建立。
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {sessions.map((sess) => (
                                <button
                                  key={sess.sessionId}
                                  type="button"
                                  onClick={() => setSelectedSession(sess)}
                                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all flex-1 min-w-[120px] ${
                                    selectedSession?.sessionId === sess.sessionId
                                      ? "bg-emerald-600 text-white border-emerald-600"
                                      : "bg-white hover:bg-slate-100 border-slate-200 text-slate-700"
                                  }`}
                                >
                                  {sess.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <button 
                          type="submit"
                          disabled={!playerName.trim() || !selectedSession}
                          className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-2.5 text-xs font-bold font-display uppercase tracking-widest shadow-md hover:shadow-lg transition-all disabled:opacity-45 disabled:pointer-events-none flex items-center justify-center gap-1.5"
                        >
                          <Play className="h-3.5 w-3.5 fill-current text-white" />
                          登入並開始隨機分流
                        </button>
                      </form>

                      {/* Default instructions description inside cellphone */}
                      <div className="mt-8 p-3 rounded-xl border border-slate-200 bg-slate-50 text-[10px] text-slate-500 flex items-start gap-2">
                        <Info className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                        <p className="leading-relaxed">
                          分流演算法會將你在 Alpha、Beta、Gamma 三個組別中隨機安排。這使大家的解題順序打亂，不會造成實體還書櫃檯與綠色檯燈前大排長龍！
                        </p>
                      </div>
                    </div>
                  ) : (
                    // Game Dashboard Interface
                    <div className="flex-grow flex flex-col">
                      
                      {/* Section: Welcome card & user profile info inside mobile */}
                      <header className="flex items-center justify-between mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 shadow-sm">
                        <div className="flex items-center gap-2">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${currentGroup?.badgeColor || "bg-emerald-600"} text-white uppercase`}>
                            {playerName.substring(0, 1)}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-800 max-w-[120px] truncate">{playerName}</div>
                            <div className="text-[9px] text-slate-500">目前於活動中</div>
                          </div>
                        </div>

                        {/* Reset button inside mobile mockup */}
                        <button 
                          onClick={() => {
                            if (confirm("要重設帳號重新分流嗎？")) {
                              setShowWelcome(true);
                              localStorage.removeItem("or_playerName");
                              localStorage.removeItem("or_groupIndex");
                              setStudentQuestsCompleted([]);
                            }
                          }}
                          className="bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded text-[9px] text-slate-700 font-medium tracking-tight transition-colors"
                        >
                          重新登入
                        </button>
                      </header>

                      {/* Section: Split Flow Group Indicator Card */}
                      {currentGroup && (
                        <div className={`p-3 rounded-xl border ${currentGroup.color} mb-4 flex items-center justify-between transition-colors duration-300 shadow-sm`}>
                          <div>
                            <div className="text-[10px] uppercase font-bold tracking-wider font-mono opacity-80">
                              你的隨機分流組別：
                            </div>
                            <h4 className="text-xs font-black mt-0.5">{currentGroup.name}</h4>
                            <div className="text-[9px] opacity-90 mt-1 flex items-center gap-1">
                              <MapPin className="h-2.5 w-2.5 text-emerald-600" />
                              首關指定地點: <strong>{currentGroup.startPoint}</strong>
                            </div>
                          </div>
                          <span className={`text-[10px] text-white px-2 py-0.5 rounded-full ${currentGroup.badgeColor} font-bold font-mono`}>
                            已分流
                          </span>
                        </div>
                      )}

                      {/* If there's no active session, prevent answering */}
                      {!selectedSession ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                          <AlertCircle className="h-10 w-10 text-emerald-600 mb-2 animate-bounce" />
                          <h4 className="text-sm font-display font-bold text-slate-900">等待活動場次啟用</h4>
                          <p className="text-[10px] text-slate-500 mt-1 leading-relaxed max-w-[200px]">
                            圖書館職員目前尚未啟動任何進行中的 Orientation 場次，請先在休息區等待現場司儀引導。
                          </p>
                          <div className="animate-spin h-4 w-4 border-2 border-emerald-600 border-t-transparent rounded-full mt-4"></div>
                        </div>
                      ) : // Check if game completed all quests
                      nextQuestIndex === -1 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-4 py-8">
                          <div className="relative">
                            <div className="absolute inset-0 bg-emerald-150 rounded-full blur-md opacity-35 animate-pulse"></div>
                            <Trophy className="h-14 w-14 text-amber-500 relative z-10 animate-bounce" />
                          </div>
                          <h3 className="text-base font-display font-black text-slate-900 mt-4">🎊 祝賀你順利通關！</h3>
                          <p className="text-[10px] text-slate-600 mt-2 leading-relaxed">
                            你已成功探索全部 <strong>{currentQuests.length} 個實體圖書館設施</strong>！
                          </p>
                          <p className="text-[10px] text-slate-500 mt-2 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono text-left">
                            <strong className="text-slate-800">AI 同學陪伴評價語錄：</strong><br />
                            "做得非常好呀！你對圖書館各個櫃檯的環境已經全盤明瞭。開學了之後借還參考書、享受靜謐、或是自強不息都不會迷路啦！"
                          </p>

                          {/* Completing metadata lists */}
                          <div className="w-full mt-4 bg-slate-50 border border-slate-200 rounded-xl p-3 text-[10px] text-left">
                            <h5 className="font-bold text-slate-800 mb-1.5 flex items-center gap-1.5">
                              <Award className="h-3.5 w-3.5 text-emerald-600" />
                              通關認證勳章：
                            </h5>
                            <div className="flex flex-wrap gap-1.5 font-mono">
                              <span className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded">
                                🏅 空間漫遊大師
                              </span>
                              <span className="bg-sky-50 border border-sky-200 text-sky-800 px-2 py-0.5 rounded">
                                🧭 自助還書機開拓者
                              </span>
                            </div>
                          </div>

                          <button 
                            onClick={handleRestartFullGame}
                            className="w-full mt-6 bg-slate-900 hover:bg-slate-800 text-xs text-white py-2.5 rounded-xl transition-all font-semibold flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            重新挑戰 (Reset Game)
                          </button>
                        </div>
                      ) : (
                        // Active Quiz Quest Card
                        <div className="flex-1 flex flex-col">
                          
                          {/* Progress indicators inside device */}
                          <div className="mb-3 flex justify-between items-center text-[9px] font-mono text-slate-500">
                            <span>我的探索進度: {studentQuestsCompleted.length} / {currentQuests.length}</span>
                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-bold border border-slate-200">
                              關卡 {studentQuestsCompleted.length + 1}
                            </span>
                          </div>

                          {/* Big Quest Main Display Card inside device */}
                          {currentQuest && (
                            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 flex-1 flex flex-col justify-between shadow-sm">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                                  <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                                    {currentQuest.location}
                                  </span>
                                </div>
                                <h3 className="text-sm font-display font-bold mt-1 text-slate-900 leading-tight">
                                  {currentQuest.title}
                                </h3>
                                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                                  {currentQuest.description}
                                </p>
                              </div>

                              {/* Upload & Compression Sandbox Canvas inside card */}
                              <div className="my-3">
                                {!compressedImage ? (
                                  <div 
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center transition-all bg-slate-50/50 cursor-pointer text-center ${
                                      isDragOver 
                                        ? "border-emerald-500 bg-emerald-500/5" 
                                        : "border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/10"
                                    }`}
                                  >
                                    <input 
                                      type="file" 
                                      ref={fileInputRef}
                                      onChange={handleFileChange}
                                      accept="image/*"
                                      capture="environment" // Automatically opens camera on mobile device
                                      className="hidden"
                                    />
                                    {isCompilersActive ? (
                                      <div className="flex flex-col items-center gap-2">
                                        <RefreshCw className="h-5 w-5 text-emerald-605 text-emerald-600 animate-spin" />
                                        <span className="text-[9px] text-emerald-700 font-bold tracking-tight">
                                          圖片本地智能壓縮中... (&lt;1MB)
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-center gap-2">
                                        <div className="p-2.5 bg-emerald-50/80 text-emerald-600 rounded-full border border-emerald-100">
                                          <Camera className="h-5 w-5 animate-pulse" />
                                        </div>
                                        <div>
                                          <span className="text-[10px] font-bold block text-slate-800">
                                            📷 點擊開啟相機拍照
                                          </span>
                                          <span className="text-[9px] text-emerald-600 block mt-0.5 font-medium">
                                            僅支援：使用後置鏡頭（主鏡頭）拍照拍攝
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  // Preview compressed image block
                                  <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                                    <img 
                                      src={compressedImage.dataUrl} 
                                      alt="Student Upload Preview" 
                                      className="w-full h-34 object-cover"
                                    />
                                    <div className="absolute top-2 right-2 bg-emerald-600 text-white font-mono text-[8px] font-bold px-1.5 py-0.5 rounded shadow">
                                      相片已就緒
                                    </div>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCompressedImage(null);
                                        setSelectedFile(null);
                                        setAiComment("");
                                        setSubmissionFeedbackVisible(false);
                                      }}
                                      className="absolute bottom-2 right-2 bg-slate-900/80 hover:bg-slate-900 text-white p-1 px-2 text-[9px] rounded transition-colors shadow"
                                    >
                                      重新拍照
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* AI Response output area inside device */}
                              <div className="mt-1 min-h-[30px]">
                                <AnimatePresence mode="wait">
                                  {aiAnalyzing && (
                                    <motion.div 
                                      initial={{ opacity: 0, y: 5 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0 }}
                                      className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[9px] flex items-center gap-2 shadow-sm"
                                    >
                                      <span className="flex-shrink-0 bg-emerald-500 text-white p-1 rounded-full text-[8px] animate-pulse">🤖</span>
                                      <div className="flex flex-col">
                                        <span className="font-bold text-slate-800">AI 機器人助手正在打字...</span>
                                        <span className="text-slate-450 text-slate-500">多模態對話模型思考解析中 ✍️</span>
                                      </div>
                                    </motion.div>
                                  )}

                                  {aiComment && submissionFeedbackVisible && (
                                    <motion.div 
                                      initial={{ opacity: 0, scale: 0.98 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      className="bg-emerald-50/80 border border-emerald-250 border-emerald-200/60 rounded-xl p-3 text-[10px]"
                                    >
                                      <div className="flex justify-between items-center mb-1 font-mono text-emerald-800 text-[8px] font-semibold">
                                        <span>ROBOT EVALUATION</span>
                                        <span className="text-emerald-700 flex items-center gap-0.5 uppercase tracking-wider font-bold">
                                          <Sparkles className="h-2.5 w-2.5" />
                                          GROK 4
                                        </span>
                                      </div>
                                      <p className="text-slate-700 leading-relaxed font-sans">{aiComment}</p>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>

                              {/* Button panels */}
                              <div className="mt-3">
                                {!compressedImage ? (
                                  <button 
                                    disabled
                                    className="w-full bg-slate-100 text-slate-400 border border-slate-200 rounded-xl py-2 cursor-not-allowed text-xs font-bold"
                                  >
                                    請先拍攝照片
                                  </button>
                                ) : !aiComment ? (
                                  <button 
                                    onClick={handleAnswerSubmit}
                                    disabled={aiAnalyzing}
                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl py-2 shadow-sm hover:shadow active:scale-[0.99] transition-all flex items-center justify-center gap-1.5"
                                  >
                                    <Sparkles className="h-3.5 w-3.5" />
                                    {aiAnalyzing ? "多模態解析中..." : "送出相片，向 AI 夥伴諮詢感想"}
                                  </button>
                                ) : (
                                  <button 
                                    onClick={handleNextQuest}
                                    className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl py-2 shadow-sm transition-colors flex items-center justify-center gap-1"
                                  >
                                    <span>完成，前往下一關</span>
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>

                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  )}

                </div>

                {/* Simulated Home Indicator Bottom Bar */}
                <div className="h-4 bg-slate-100 flex items-center justify-center py-1 border-t border-slate-200/50">
                  <div className="w-24 h-1 bg-slate-350 bg-slate-300 rounded-full"></div>
                </div>

              </div>
            </div>

          </div>
        )}

        {/* =============== VIEW 2: STAFFF ADMIN DASHBOARD =============== */}
        {activeTab === "admin" && (
          <div className="flex flex-col gap-8 py-4">
            {!isAdminUnlocked ? (
              <div className="max-w-md w-full mx-auto my-12 bg-white border border-slate-200 rounded-3xl p-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
                
                <div className="flex flex-col items-center text-center gap-4 mb-8">
                  <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-700 border border-slate-200 shadow-sm">
                    <Shield className="h-8 w-8 text-emerald-600 animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-black tracking-tight text-slate-900">職員控制台身分驗證</h2>
                    <p className="text-xs text-slate-500 mt-1.5 max-w-xs leading-relaxed">
                      本區域包含場次設定與解密相片大會審查等敏感操作，請輸入管理密碼進入系統。
                    </p>
                  </div>
                </div>

                <form onSubmit={handleVerifyPassword} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-black">
                      管理端安全密碼 / Password
                    </label>
                    <input 
                      type="password" 
                      required
                      placeholder="請輸入密碼"
                      value={adminPasswordInput}
                      onChange={(e) => setAdminPasswordInput(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-center text-lg tracking-[0.5em] font-mono text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-bold"
                    />
                  </div>

                  {adminPasswordError && (
                    <div className="text-xs text-rose-500 font-semibold bg-rose-50 border border-rose-100 p-2.5 rounded-lg text-center font-mono animate-bounce">
                      {adminPasswordError}
                    </div>
                  )}

                  <button 
                    type="submit"
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-3 text-xs font-bold font-display uppercase tracking-widest shadow hover:shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                    解鎖職員控制台
                  </button>
                </form>

                <div className="mt-8 border-t border-slate-100 pt-6 text-[10px] text-slate-400 font-mono text-center">
                  本系統已安全對接 Firebase Firestore 同步資料庫。
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Left Side: Session controls inside Admin (Geometric Balance Theme) */}
              <div className="lg:col-span-4 bg-white border border-slate-200 p-6 rounded-2xl flex flex-col gap-6 shadow-sm">
                
                <div>
                  <h3 className="text-base font-display font-bold text-slate-900 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-emerald-600" />
                    場次多場活動控制
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    建立新場次後，系統會自動將其他場次設置為 <code className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded text-[10px]">inactive</code>，新生手機游戲中會自動同步活動。
                  </p>
                </div>

                {/* Sub: Active Session state card */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col gap-2 shadow-inner">
                  <span className="text-[10px] uppercase font-bold tracking-wider font-mono text-slate-500">
                    目前運行的 Active 場次資訊
                  </span>
                  {selectedSession ? (
                    <div>
                      <h4 className="text-sm font-black text-slate-800">{selectedSession.name}</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                        建立時間：{new Date(selectedSession.createdAt).toLocaleString()}
                      </p>
                      <div className="mt-2.5 flex items-center gap-2">
                        <span className="bg-emerald-50 border border-emerald-250 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">
                          進行中 (Active)
                        </span>
                        <span className="bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold font-mono">
                          關卡數量: {currentQuests.length}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-slate-550">目前尚無活動場次正在進行，請在下方建立一個場次！</p>
                    </div>
                  )}
                </div>

                {/* Session Selector - allows choosing sessions created on other computers */}
                {sessions.length > 0 && (
                  <div className="border border-slate-200 rounded-xl bg-white p-4 shadow-inner">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-700">選擇既有場次（多電腦支援）</span>
                      <button
                        type="button"
                        onClick={() => setSelectedSession(null)}
                        className="text-[10px] text-slate-500 hover:text-red-600 underline"
                      >
                        清除選擇
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                      {sessions.map((sess) => (
                        <button
                          key={sess.sessionId}
                          type="button"
                          onClick={() => setSelectedSession(sess)}
                          className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                            selectedSession?.sessionId === sess.sessionId
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700"
                          }`}
                        >
                          {sess.name}
                          <span className="ml-1 text-[9px] opacity-60 font-mono">
                            {sess.status}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-slate-400 mt-2">
                      點擊場次即可在本機切換，不影響其他電腦。
                    </p>
                  </div>
                )}

                {/* Form: Create Session */}
                <form onSubmit={handleCreateSession} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-slate-700 font-bold">場次名稱 / Session Title</label>
                    <input 
                      type="text" 
                      required
                      placeholder="例如：2026-05-28 上午場"
                      value={newSessionName}
                      onChange={(e) => setNewSessionName(e.target.value)}
                      className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                    />
                  </div>

                  {/* CSV Importer accordion toggle */}
                  <div className="border border-slate-200 rounded-xl bg-slate-50/50 p-3 shadow-inner">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-slate-800 font-bold flex items-center gap-1">
                        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                        CSV 題目動態修改 (選填)
                      </span>
                      <button 
                        type="button" 
                        onClick={loadDemoCSV} 
                        className="text-[9px] text-emerald-650 hover:text-emerald-700 transition-colors font-semibold underline cursor-pointer"
                      >
                        載入預設範本
                      </button>
                    </div>
                    
                    <textarea 
                      placeholder="格式：id,標題,位置,描述 (每行一個關卡)"
                      rows={5}
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-[10px] font-mono text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    ></textarea>

                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <button 
                        type="button"
                        onClick={handleCSVParse}
                        className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 text-[10px] px-2.5 py-1 rounded font-bold transition-all cursor-pointer"
                      >
                        解析 CSV 內容
                      </button>
                      <span className="text-[9px] font-mono text-slate-500">
                        {csvPreview.length > 0 ? `已解析 ${csvPreview.length} 個題目` : "空/使用預設"}
                      </span>
                    </div>

                    {csvError && <div className="text-[9px] text-red-500 mt-1 font-mono">{csvError}</div>}
                  </div>

                  {/* Submit create button */}
                  <button 
                    type="submit"
                    disabled={submittingSession}
                    className="w-full bg-slate-900 hover:bg-slate-850 text-white font-display font-semibold text-xs py-2.5 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 uppercase tracking-wider shadow cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5 fill-current text-white animate-pulse" />
                    {submittingSession ? "正在啟動新場次..." : "啟動新場次並綁定前端"}
                  </button>
                </form>

                {/* Staff Link Distribution Guide (Saves time, helps production deployment) */}
                <div className="border border-slate-200 rounded-xl bg-slate-50 p-4 shadow-inner flex flex-col gap-3">
                  <h4 className="text-xs font-display font-extrabold text-slate-900 flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                    🚀 多平台分流連結分發指南
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    本系統支援「單一網址 實時分流」。為同學、職員及投影螢幕發送不同的連結參數：
                  </p>

                  <div className="flex flex-col gap-2.5 mt-1">
                    <div className="text-[10px] leading-relaxed bg-white p-2 rounded-lg border border-slate-100">
                      <strong className="text-slate-800 font-bold block">📱 新生網頁端 (無控制台、無投影)</strong>
                      <span className="text-slate-500 block">不帶參數，直接開啟首頁即可。同學無法切換進入後台。</span>
                      <code className="text-emerald-700 font-mono text-[9px] block mt-1 bg-slate-50 px-1 py-0.5 rounded break-all whitespace-normal">
                        {window.location.origin + window.location.pathname}
                      </code>
                    </div>

                    <div className="text-[10px] leading-relaxed bg-white p-2 rounded-lg border border-slate-100">
                      <strong className="text-slate-800 font-bold block">⚙️ 職員控制台連結 (需密碼 8510)</strong>
                      <span className="text-slate-500 block">職員點擊即可開啟切換浮鈕，輸入密碼進入。</span>
                      <code className="text-emerald-700 font-mono text-[9px] block mt-1 bg-slate-50 px-1 py-0.5 rounded break-all whitespace-normal">
                        {window.location.origin + window.location.pathname + "?role=admin"}
                      </code>
                    </div>

                    <div className="text-[10px] leading-relaxed bg-white p-2 rounded-lg border border-slate-100">
                      <strong className="text-slate-800 font-bold block">📽️ 86吋大堂投影牆專用連結 (滿版)</strong>
                      <span className="text-slate-500 block">不帶任何與新生或手遊相關的干擾內容，極致展示。</span>
                      <code className="text-emerald-700 font-mono text-[9px] block mt-1 bg-slate-50 px-1 py-0.5 rounded break-all whitespace-normal">
                        {window.location.origin + window.location.pathname + "?role=projection"}
                      </code>
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Side: Photos Live Moderation Wall */}
              <div className="lg:col-span-8 bg-white border border-slate-200 p-6 rounded-2xl flex flex-col gap-4 shadow-sm">
                
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-display font-bold text-slate-900 flex items-center gap-2">
                      <Users className="h-4 w-4 text-emerald-600" />
                      即時相片研習審查牆 (Staff Moderation Wall)
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      此表格即時更新全場新生的作品上傳與 AI 感想。若發現不雅或無關圖片，可點擊「刪除/隱藏」以便在大螢幕瞬間下架。
                    </p>
                  </div>
                  
                  <div className="font-mono text-[10px] bg-slate-50 border border-slate-200 p-2 rounded-lg text-slate-600">
                    目前上傳記錄總數: <strong>{latestSubmissions.length}</strong>
                  </div>
                </div>

                {/* Submissions Datatable log */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl bg-slate-50/50 shadow-inner">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-100 text-slate-600 uppercase font-mono text-[9px] border-b border-slate-200 font-bold">
                      <tr>
                        <th className="px-4 py-3">玩家 & 組別</th>
                        <th className="px-4 py-3">解鎖關卡名稱</th>
                        <th className="px-4 py-3">現場相篇 (JPG)</th>
                        <th className="px-4 py-3">AI 夥伴感想評論 (傳統中文 / 英文)</th>
                        <th className="px-4 py-3 text-right">管理操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {filteredSubmissions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-400 font-mono text-[11px]">
                            {selectedSession ? "此場次尚無上傳記錄。" : "暫時還未有照片上載。快使用手機模擬器登入並回答問題吧！"}
                          </td>
                        </tr>
                      ) : (
                        filteredSubmissions.map((sub) => (
                          <tr key={sub.submissionId} className="hover:bg-slate-50/35 transition-colors">
                            <td className="px-4 py-3 leading-tight">
                              <span className="font-bold text-slate-900 block">{sub.playerName}</span>
                              <span className="text-[9px] text-emerald-800 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded inline-block mt-1 font-semibold font-mono">{sub.groupName}</span>
                            </td>
                            <td className="px-4 py-3 leading-tight max-w-[150px]">
                              <span className="font-semibold block truncate text-slate-800">{sub.questionTitle}</span>
                              <span className="text-[10px] text-slate-450 text-slate-500 font-mono">ID: {sub.questionId}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="relative h-14 w-14 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shadow-sm">
                                <img 
                                  src={sub.imageUrl} 
                                  alt="Thumbnail" 
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            </td>
                            <td className="px-4 py-3 leading-relaxed max-w-[250px]">
                              <p className="text-[11px] text-slate-600 italic">"{sub.aiComment}"</p>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => handleDownloadImage(sub.imageUrl, sub.playerName, sub.questionTitle)}
                                  className="bg-white hover:bg-emerald-50 hover:text-emerald-700 text-emerald-600 border border-emerald-200 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 inline-flex items-center gap-1 cursor-pointer shadow-sm"
                                  title="下載原始照片"
                                >
                                  <Download className="h-4 w-4" />
                                  <span>下載</span>
                                </button>
                                <button 
                                  onClick={() => handleDeleteSubmission(sub.submissionId)}
                                  className="bg-white hover:bg-red-50 hover:text-red-700 text-red-600 border border-red-200 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 inline-flex items-center gap-1 cursor-pointer shadow-sm"
                                  title="從前端Live牆上刪除下架"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span>刪除</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

              </div>
            </div>
          )}

        </div>
      )}

        {/* =============== VIEW 3: LIVE projection GALLERY SCREEN =============== */}
        {activeTab === "projection" && (
          <div className="flex flex-col gap-8 py-4">
            
            {/* Legend guide bar */}
            <div className="bg-white border border-slate-200 p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4 select-none shadow-sm">
              <div>
                <h3 className="text-base font-display font-bold text-slate-900 flex items-center gap-2">
                  <Tv className="h-4 w-4 text-emerald-600" />
                  AI 圖書陪伴助理 Live 實體互動展牆
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  本展牆適合投放在圖書館大堂 86 吋顯示大螢幕上。所有新生的探索上傳與 AI 動態評語將即時串流展出，以便全場互動學習！
                </p>
              </div>

              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-250 px-3 py-1.5 rounded-full">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
                <span className="text-xs font-mono font-bold text-emerald-850">
                  即時串流同步中 (Firestore Real-time Active)
                </span>
              </div>
            </div>

            {/* Empty state or Categorized Grid map */}
            {latestSubmissions.length === 0 ? (
              <div className="min-h-[400px] border border-dashed border-slate-200 bg-white rounded-2xl flex flex-col items-center justify-center p-8 text-center text-slate-400 shadow-sm">
                <Users className="h-10 w-10 text-slate-400 mb-2 animate-pulse" />
                <h4 className="text-sm font-display font-bold text-slate-800">等待投影牆的熱絡一刻</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">
                  大螢幕就緒！目前尚未有新生作品。只要新生在手機端上傳相片，投射牆就會搭配漂亮的 AI 動態感想，即時彈出至螢幕！
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-10">
                {(Object.entries(
                  latestSubmissions.reduce<Record<string, Submission[]>>((acc, sub) => {
                    const key = sub.questionTitle || "其他圖書館設施探索";
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(sub);
                    return acc;
                  }, {})
                ) as [string, Submission[]][]).map(([questTitle, subs]) => (
                  <div key={questTitle} className="bg-slate-50/70 p-6 rounded-2xl border border-slate-200/60 flex flex-col gap-5 shadow-sm">
                    {/* Subsection topic header (Categorized by Question/Task) */}
                    <div className="flex items-center justify-between border-b border-slate-250/60 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                        <h4 className="text-sm md:text-base font-display font-black text-slate-800 tracking-tight">
                          📍 {questTitle}
                        </h4>
                      </div>
                      <span className="bg-emerald-100/70 border border-emerald-200 text-emerald-800 text-[10px] uppercase font-mono px-3 py-1 rounded-full font-extrabold tracking-wider">
                        {subs.length} 張作品
                      </span>
                    </div>

                    {/* Horizontal/Grid list of student photo submissions for this specific task */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      <AnimatePresence>
                        {subs.map((sub) => (
                          <motion.div 
                            key={sub.submissionId}
                            layout
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: -20 }}
                            transition={{ type: "spring", stiffness: 350, damping: 25 }}
                            className="bg-white text-slate-900 p-4 pb-6 rounded-lg shadow-md hover:shadow-xl hover:scale-[1.02] transition-all duration-300 flex flex-col gap-3 border-4 border-slate-50/60 relative group"
                          >
                            {/* Polaroid top marker label */}
                            <div className="bg-emerald-600 text-white rounded px-2 py-0.5 text-[9px] font-mono tracking-wider font-extrabold uppercase absolute top-2 left-2 z-10 shadow">
                              QUEST COMPLETED
                            </div>

                            {/* Polaroid main image photo display */}
                            <div className="relative h-44 w-full bg-slate-900 rounded overflow-hidden shadow-inner border border-slate-100">
                              <img 
                                src={sub.imageUrl} 
                                alt="Student upload snap" 
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent p-2 pt-6">
                                <span className="text-[10px] text-white font-mono bg-slate-950/45 border border-white/20 px-1.5 py-0.5 rounded font-black uppercase">
                                  {sub.groupName}
                                </span>
                              </div>
                            </div>

                            {/* Polaroid text area mimics hand-written text details */}
                            <div className="flex flex-col gap-2">
                              <div className="flex justify-between items-baseline">
                                <span className="font-extrabold text-sm text-slate-800 font-mono tracking-tight leading-none block">
                                  👤 {sub.playerName}
                                </span>
                                <span className="text-[8px] text-slate-450 font-mono">
                                  {new Date(sub.createdAt).toLocaleTimeString()}
                                </span>
                              </div>

                              {/* AI Dialogue speech bubble */}
                              <div className="mt-1.5 text-[10px] bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-100 leading-relaxed text-slate-700 font-medium relative italic">
                                <span className="absolute -top-1.5 left-4 text-xs text-emerald-600">🤖</span>
                                "{sub.aiComment}"
                              </div>
                            </div>

                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

      </main>

      {/* 4. Footer credits Section */}
      {currentRole !== "student" && (
        <footer className="bg-white border-t border-slate-200 px-6 py-4 text-center text-xs text-slate-400 font-mono">
          <span>© 2026 Orientation Day Library Prototype Workstation. Built with xAI Grok (grok-4-fast-reasoning).</span>
        </footer>
      )}
    </div>
  );
}
