import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Moon,
  Sun,
  Volume2,
  VolumeX,
  PlusCircle,
  Copy,
  Skull,
  Send,
  Sparkles,
  User,
  Users,
  Mail,
  Lock,
  ChevronRight,
  ChevronRight as CaretRight,
  Shield,
  Eye,
  LogOut,
  HelpCircle,
  Clock,
  Play,
  RotateCcw,
  Zap,
  Flame,
  Dog as WolfIcon
} from "lucide-react";
import { Avatar, Player } from "./types";
import { db } from "./lib/firebase";
import { doc, onSnapshot, collection, query, orderBy, getDoc } from "firebase/firestore";
import { api, UserProfile } from "./services/api";

const AVATARS: Avatar[] = [
  { id: "wolf", emoji: "🐺", color: "bg-rose-950/60 border-rose-500" },
  { id: "cat", emoji: "🐱", color: "bg-pink-950/60 border-pink-500" },
  { id: "fox", emoji: "🦊", color: "bg-amber-950/60 border-amber-500" },
  { id: "panda", emoji: "🐼", color: "bg-slate-900 border-slate-400" },
  { id: "owl", emoji: "🦉", color: "bg-indigo-950/60 border-indigo-500" },
  { id: "bear", emoji: "🐻", color: "bg-orange-950/60 border-orange-700" },
  { id: "rabbit", emoji: "🐰", color: "bg-cyan-950/60 border-cyan-400" },
  { id: "lion", emoji: "🦁", color: "bg-yellow-950/60 border-yellow-500" }
];

const STORY_LINES = [
  "Kabut tebal yang dingin menyelimuti Desa Wolfy...",
  "Saat kegelapan malam melahap sisa cahaya senja, petaka pun mulai terbangun.",
  "Di kedalaman hutan, lolongan mengerikan memecah keheningan. Monster itu... kini berjalan di antara kita.",
  "Setiap malam, ada yang hilang. Siapa kawanmu? Siapa yang bisa kau percayai?",
  "Uji kejelianmu, bongkar topeng penyamaran para serigala sebelum fajar terakhir sirna!"
];

const PHASE_DURATIONS: Record<string, number> = {
  role_reveal: 15,
  night: 25,
  resolve: 10,
  morning: 30,
  voting: 25
};

export default function App() {
  // Authentication & Profile States
  const [sessionLoading, setSessionLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem("wolfy_user");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [showWelcome, setShowWelcome] = useState(true);

  // Game UI States
  const [phase, setPhase] = useState<"STORY" | "MENU" | "MULTI_LOBBY" | "ROOM">(() => {
    const savedRoomId = localStorage.getItem("wolfy_room_id");
    const savedUser = localStorage.getItem("wolfy_user");
    if (savedUser) {
      return savedRoomId ? "ROOM" : "MENU";
    }
    return "STORY";
  });
  const [muted, setMuted] = useState(false);
  const [playerAvatar, setPlayerAvatar] = useState<Avatar>(AVATARS[0]);
  const [roomCode, setRoomCode] = useState<string>(() => {
    return localStorage.getItem("wolfy_room_id") || "";
  });
  const [loading, setLoading] = useState(false);
  const [inputCode, setInputCode] = useState("");
  const [storyIndex, setStoryIndex] = useState(0);
  const [showRolesModal, setShowRolesModal] = useState(false);

  // Timer Countdown state
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Firestore Synced States
  const [roomState, setRoomState] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");

  // Seer Results cache (stored in state so it stays until night expires, but resolved client-side safely)
  const [seerInsight, setSeerInsight] = useState<string | null>(null);
  const [seerTargetName, setSeerTargetName] = useState<string | null>(null);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const gameMusicRef = useRef<HTMLAudioElement>(null);
  const gameMusicActive = phase === "ROOM" && Boolean(roomState) && roomState?.game_status !== "waiting";

  // 1. Session Persistence check on Mount
  useEffect(() => {
    const checkSession = async () => {
      const token = localStorage.getItem("wolfy_token");
      if (token) {
        try {
          const profile = await api.getProfile();
          setCurrentUser(profile.user);
          localStorage.setItem("wolfy_user", JSON.stringify(profile.user));
          
          const savedRoomId = localStorage.getItem("wolfy_room_id");
          if (savedRoomId) {
            setRoomCode(savedRoomId);
            setPhase("ROOM");
          } else {
            setPhase("MENU");
          }
        } catch (e) {
          // Token is corrupted or expired
          localStorage.removeItem("wolfy_token");
          localStorage.removeItem("wolfy_user");
          localStorage.removeItem("wolfy_room_id");
          setCurrentUser(null);
          setRoomCode("");
          setPhase("STORY");
        }
      } else {
        // If there's no token, ensure states are cleared
        setCurrentUser(null);
        setRoomCode("");
        setPhase("STORY");
      }
      setSessionLoading(false);
    };
    checkSession();
  }, []);

  // 2. Real-time Room Sync (The Core Source of Truth)
  useEffect(() => {
    if (!roomCode || !currentUser) return;

    console.log("Subscribing to Room:", roomCode);
    
    // Subscribe to Room Document
    const roomRef = doc(db, "rooms", roomCode);
    const unsubRoom = onSnapshot(roomRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setRoomState(data);
        // Sync our local navigation phase
        setPhase("ROOM");
      } else {
        // Room was deleted or is invalid
        console.warn("Room not found");
        localStorage.removeItem("wolfy_room_id");
        setRoomCode("");
        setPhase("MENU");
      }
    });

    // Subscribe to Players subcollection
    const playersRef = collection(db, "rooms", roomCode, "players");
    const unsubPlayers = onSnapshot(playersRef, (snap) => {
      const pList = snap.docs.map(d => {
        const dData = d.data();
        return {
          ...dData,
          avatarData: AVATARS.find(a => a.id === dData.avatar) || AVATARS[0]
        };
      });
      setPlayers(pList);
    });

    // Subscribe to Chat Logs subcollection ordered by creation
    const logsRef = query(collection(db, "rooms", roomCode, "logs"), orderBy("createdAt", "asc"));
    const unsubLogs = onSnapshot(logsRef, (snap) => {
      const lList = snap.docs.map(d => d.data());
      setLogs(lList);
    });

    return () => {
      unsubRoom();
      unsubPlayers();
      unsubLogs();
    };
  }, [roomCode, currentUser]);

  // Scroll Chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Clean Seer inspection results on Day phase change
  useEffect(() => {
    if (roomState?.game_status !== "night" && roomState?.game_status !== "resolve") {
      setSeerInsight(null);
      setSeerTargetName(null);
    }
  }, [roomState?.game_status]);

  // Keep the theme music tied to the active match, while allowing the browser
  // to block autoplay until the user taps the volume control.
  useEffect(() => {
    const audio = gameMusicRef.current;
    if (!audio) return;

    audio.volume = 0.32;
    audio.muted = muted;

    if (gameMusicActive && !muted) {
      void audio.play().catch(() => setMuted(true));
    } else {
      audio.pause();
      if (!gameMusicActive) {
        audio.currentTime = 0;
      }
    }
  }, [gameMusicActive, muted]);

  const handleToggleMusic = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);

    const audio = gameMusicRef.current;
    if (!audio || nextMuted || !gameMusicActive) return;

    audio.muted = false;
    audio.volume = 0.32;
    void audio.play().catch(() => undefined);
  };

  // Authenticators
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setLoading(true);
    try {
      const res = await api.register(regUsername, regEmail, regPassword);
      localStorage.setItem("wolfy_token", res.token);
      localStorage.setItem("wolfy_user", JSON.stringify(res.user));
      setCurrentUser(res.user);
      setPhase("STORY");
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setLoading(true);
    try {
      const res = await api.login(loginEmail, loginPassword);
      localStorage.setItem("wolfy_token", res.token);
      localStorage.setItem("wolfy_user", JSON.stringify(res.user));
      setCurrentUser(res.user);
      
      const savedRoomId = localStorage.getItem("wolfy_room_id");
      if (savedRoomId) {
        setRoomCode(savedRoomId);
        setPhase("ROOM");
      } else {
        setPhase("MENU");
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("wolfy_token");
    localStorage.removeItem("wolfy_user");
    localStorage.removeItem("wolfy_room_id");
    setCurrentUser(null);
    setRoomCode("");
    setRoomState(null);
    setPlayers([]);
    setLogs([]);
    setPhase("STORY");
  };

  // Lobby Action Handlers
  const handleCreateRoom = async () => {
    setLoading(true);
    try {
      const { roomId } = await api.createRoom(playerAvatar.id);
      localStorage.setItem("wolfy_room_id", roomId);
      setRoomCode(roomId);
    } catch (err: any) {
      alert("Gagal membuat room: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinByCode = async () => {
    if (!inputCode || inputCode.length !== 4) return;
    setLoading(true);
    try {
      await api.joinRoom(inputCode.toUpperCase(), playerAvatar.id);
      localStorage.setItem("wolfy_room_id", inputCode.toUpperCase());
      setRoomCode(inputCode.toUpperCase());
    } catch (err: any) {
      alert("Gagal bergabung: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartGame = async (isSolo: boolean) => {
    setLoading(true);
    try {
      await api.startGame(roomCode, isSolo);
    } catch (err: any) {
      alert("Gagal memulai permainan: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReveal = async () => {
    setLoading(true);
    try {
      await api.revealConfirm(roomCode);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmMorning = async () => {
    setLoading(true);
    try {
      await api.confirmMorning(roomCode);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async () => {
    if (!selectedTargetId) return;
    const target = players.find(p => p.id === selectedTargetId);
    if (!target) return;

    setLoading(true);
    try {
      if (roomState.game_status === "night") {
        const res = await api.submitNightAction(roomCode, selectedTargetId);
        if (res.insight) {
          setSeerTargetName(target.name);
          setSeerInsight(res.insight);
        }
      } else if (roomState.game_status === "voting") {
        await api.submitVote(roomCode, selectedTargetId);
      }
      setSelectedTargetId(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveNight = async () => {
    setLoading(true);
    try {
      await api.resolveNight(roomCode);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveVoting = async () => {
    setLoading(true);
    try {
      await api.resolveVoting(roomCode);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    setLoading(true);
    try {
      await api.restartGame(roomCode);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveRoom = () => {
    localStorage.removeItem("wolfy_room_id");
    setRoomCode("");
    setRoomState(null);
    setPlayers([]);
    setLogs([]);
    setPhase("MENU");
  };

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    try {
      await api.sendChatMessage(roomCode, chatInput.trim());
      setChatInput("");
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Helper variables derived from states
  const getMyPlayer = () => {
    if (!players || players.length === 0) return undefined;
    const uid = currentUser?.user_id || currentUser?.userId;
    // 1. Match by id
    let found = players.find(p => p.id === uid);
    if (found) return found;
    // 2. Match by user_id
    found = players.find(p => p.user_id === uid);
    if (found) return found;
    // 3. Fallback for Solo: there's only 1 real player that is not a bot
    found = players.find(p => !p.is_bot);
    if (found) return found;
    // 4. Ultimate fallback
    return players[0];
  };
  const myPlayer = getMyPlayer();
  const isHost = roomState?.host_id === (currentUser?.user_id || currentUser?.userId) || myPlayer?.is_host;

  const triggerAutoTransition = async (status: string) => {
    setLoading(true);
    try {
      if (status === "role_reveal") {
        await api.revealConfirm(roomCode);
      } else if (status === "night" || status === "resolve") {
        await api.resolveNight(roomCode);
      } else if (status === "morning") {
        await api.confirmMorning(roomCode);
      } else if (status === "voting") {
        await api.resolveVoting(roomCode);
      }
    } catch (e) {
      console.error("Auto transition error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Automated transition timer logic
  useEffect(() => {
    if (!roomState || !roomState.game_status) {
      setTimeLeft(null);
      return;
    }

    const status = roomState.game_status;
    const duration = PHASE_DURATIONS[status];
    if (typeof duration !== "number") {
      setTimeLeft(null);
      return;
    }

    const interval = setInterval(() => {
      const updatedAtStr = roomState.updatedAt || new Date().toISOString();
      const elapsed = Math.floor((Date.now() - new Date(updatedAtStr).getTime()) / 1000);
      const remaining = Math.max(0, duration - elapsed);
      setTimeLeft(remaining);

      // If remaining reaches 0, and current user is host, trigger next transition automatically
      if (remaining <= 0) {
        clearInterval(interval);
        if (isHost && !loading) {
          triggerAutoTransition(status);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [roomState?.game_status, roomState?.updatedAt, isHost, loading]);

  const advanceStory = () => {
    if (storyIndex < STORY_LINES.length - 1) {
      setStoryIndex(prev => prev + 1);
    } else {
      setPhase("MENU");
    }
  };

  const getGuidanceMessage = (me: any) => {
    if (!me) return "Menyiapkan peta desa...";
    if (!me.is_alive) return "💀 Anda telah dieksekusi/terbunuh. Perhatikan jalannya pertarungan dalam keheningan mistis fana.";

    switch (roomState?.game_status) {
      case "waiting":
        return "👋 Selamat Datang di Lobby! Tunggu warga lain berkumpul, lalu mulailah permainan.";
      case "role_reveal":
        return "🃏 Peta Rahasia Diungkapkan: Hafalkan peran suci Anda dan tekan tombol Saya Siap!";
      case "night":
        if (me.role === "Werewolf") {
          return "🐺 Werewolf: Pilih satu target warga untuk diterkam cakar malam ini!";
        } else if (me.role === "Doctor") {
          return "🧪 Doctor: Pilih satu pemain (bisa Anda sendiri) untuk dilindungi dari Werewolf.";
        } else if (me.role === "Seer") {
          return "🔮 Seer: Teropong satu pemain di grid untuk mengetahui peran aslinya.";
        } else if (me.role === "Hunter") {
          return "🏹 Hunter: Anda sedang tertidur malam ini, namun bersiaplah mengangkat senapan balas dendam jika diserang.";
        }
        return "💤 Villager: Anda tertidur lelap melupakan dunia luar...";
      case "resolve":
        return "🌌 Malam sedang berakhir... Mencatat kesaksian fajar di sekeliling hutan.";
      case "morning":
        return "☀️ Kabar Kehidupan: Seluruh desa dibangunkan berunding mengenai duka semalam.";
      case "voting":
        return "⚖️ Pengadilan Gantung Desa: Klik nama orang yang Anda duga siluman, lalu ketuk 'Konfirmasi Aksi'!";
      default:
        return "Berkolaborasilah menjaga kedamaian desa...";
    }
  };

  const getRoleDesc = (roleName: string) => {
    switch (roleName) {
      case "Werewolf":
        return {
          emoji: "🐺",
          color: "text-rose-500 border-rose-500",
          desc: "Bersekutulah di malam hari dan terkam warga desa satu demi satu untuk menguasai desa.",
          header: "Werewolf"
        };
      case "Doctor":
        return {
          emoji: "🧪",
          color: "text-teal-400 border-teal-400",
          desc: "Setiap malam pilihlah satu target pemain yang kebal terhadap serangan cakar Werewolf.",
          header: "Doctor"
        };
      case "Seer":
        return {
          emoji: "🔮",
          color: "text-amber-400 border-amber-400",
          desc: "Satu kali setiap malam Anda dapat meramalkan peran sejati seorang kontestan.",
          header: "Seer"
        };
      case "Hunter":
        return {
          emoji: "🏹",
          color: "text-emerald-400 border-emerald-400",
          desc: "Jika tereliminasi (dibunuh atau digantung), gunakan nafas terakhir untuk menembak mati target mana saja!",
          header: "Hunter"
        };
      default:
        return {
          emoji: "🌾",
          color: "text-indigo-400 border-indigo-400",
          desc: "Dukung Doctor desa dan temukan para Werewolf selama musyawarah gantung siang hari.",
          header: "Villager"
        };
    }
  };

  // If session is processing, load beautiful spinner
  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center">
        <Moon className="text-violet-500 animate-bounce w-16 h-16 mb-4" />
        <h2 className="text-xs uppercase tracking-widest text-violet-300 font-bold animate-pulse">Menghubungkan Akun ke Desa...</h2>
      </div>
    );
  }

  // Auth Portal if currentUser is null
  if (!currentUser) {
    if (showWelcome) {
      return (
        <div id="welcome-screen" className="fixed inset-0 z-50 min-h-screen bg-[#07050e] text-slate-100 flex flex-col md:flex-row overflow-hidden font-sans select-none animate-fade-in">
          {/* BACKGROUND SPARKLES / DECOR */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-950/20 via-slate-950 to-[#07050e] z-0" />
          
          {/* LEFT COLUMN: SILHOUETTE RUMAH WARGA INSIDE AN ATMOSPHERIC FOREST SKYLINE */}
          <div className="w-full md:w-1/2 flex flex-col justify-end items-center relative overflow-hidden h-[42vh] md:h-full border-b md:border-b-0 md:border-r border-purple-950/20 bg-slate-950/40 z-10">
            {/* Subtle atmospheric mist */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#07050e] via-transparent to-transparent z-10 pointer-events-none" />
            <div className="absolute top-8 left-8 md:top-16 md:left-16 max-w-sm z-30">
              <span className="text-[10px] sm:text-xs font-mono font-bold tracking-[0.25em] text-violet-400/80 uppercase">Babad Tanah Desa</span>
              <h2 className="text-xl sm:text-2xl font-serif font-semibold text-slate-200 mt-2 tracking-wide leading-relaxed">
                Permukiman damai yang menyimpan rahasia kelam...
              </h2>
            </div>

            {/* SVG of multi-layer village silhouettes with glowing windows */}
            <svg className="absolute bottom-0 left-0 w-full h-[85%] md:h-[75%] pointer-events-none fill-[#020104] z-20" viewBox="0 0 1000 680" preserveAspectRatio="none">
              {/* Distant skyline (faint) */}
              <path opacity="0.2" d="M0 680 V420 L80 340 L160 420 L280 350 L380 450 L500 370 L620 490 L750 390 L880 490 L1000 380 V680 Z" />
              {/* Midground forest/pines (dark purple shadow) */}
              <path opacity="0.4" className="fill-purple-950" d="M0 680 V460 L40 400 L80 460 L130 380 L180 460 L260 360 L340 470 L420 380 L500 480 L580 390 L680 500 L760 410 L840 490 L920 400 L1000 480 V680 Z" />
              {/* Foreground sharp house silhouettes (deep black) */}
              <path d="M0 680 V540 L60 470 L120 540 V560 L160 500 L220 500 L280 570 L360 490 L440 570 V510 L520 440 L600 510 V590 L650 520 L710 580 L780 500 L850 570 V520 L910 450 L970 520 L1000 500 V680 Z" />
              
              {/* Cozy warm window lights of terrified villagers shivering inside */}
              <rect x="42" y="580" width="12" height="18" rx="2" className="fill-amber-400 animate-pulse" />
              <rect x="88" y="575" width="10" height="14" rx="2" className="fill-yellow-500 animate-pulse [animation-delay:0.3s]" />
              <rect x="175" y="535" width="14" height="20" rx="2" className="fill-amber-300 animate-pulse [animation-delay:0.7s]" />
              <rect x="490" y="545" width="12" height="18" rx="2" className="fill-yellow-500 animate-pulse [animation-delay:0.2s]" />
              <rect x="548" y="540" width="10" height="14" rx="2" className="fill-amber-400 animate-pulse [animation-delay:0.6s]" />
              <rect x="750" y="570" width="12" height="18" rx="2" className="fill-yellow-600 animate-pulse [animation-delay:1.1s]" />
              <rect x="865" y="555" width="14" height="20" rx="2" className="fill-amber-300 animate-pulse [animation-delay:0.5s]" />
            </svg>
          </div>

          {/* RIGHT COLUMN: RUNNING/LEAPING WEREWOLF SILHOUETTE & GRAND SLOGAN TEXT & START BUTTON */}
          <div className="w-full md:w-1/2 flex flex-col justify-between items-center relative p-6 md:p-16 h-[58vh] md:h-full text-center bg-gradient-to-b md:bg-gradient-to-l from-rose-950/20 via-slate-950/95 to-[#07050e] z-10">
            {/* Top header margin */}
            <div className="pt-2 md:pt-4">
              <span className="px-3.5 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-full text-[10px] font-mono tracking-widest text-rose-400 font-bold uppercase animate-pulse">
                Social Deduction Roleplay Game
              </span>
            </div>

            {/* Full Moon & Running Werewolf Illustration */}
            <div className="my-auto flex flex-col items-center justify-center relative scale-90 sm:scale-100">
              {/* Glowing full moon */}
              <div className="relative w-40 h-40 md:w-52 md:h-52 rounded-full bg-slate-100 opacity-95 blur-[1px] shadow-[0_0_60px_rgba(251,248,220,0.4)] flex items-center justify-center overflow-hidden animate-[pulse_6s_infinite_ease-in-out]">
                {/* Subtle moon geography/craters */}
                <div className="absolute top-8 left-14 w-10 h-10 rounded-full bg-slate-200" />
                <div className="absolute top-24 left-28 w-12 h-12 rounded-full bg-slate-200" />
                <div className="absolute top-36 left-10 w-8 h-8 rounded-full bg-slate-200" />
                <div className="absolute top-14 left-32 w-6 h-6 rounded-full bg-slate-300/30" />
              </div>
              
              {/* Leaping/Running Wolf Silhouette Overlay with animation bounds */}
              <div className="absolute z-10 pointer-events-none transform -translate-y-2 animate-[bounce_2.5s_infinite_ease-in-out]">
                {/* Vector of Leaping Wolf */}
                <svg className="w-48 h-32 md:w-56 md:h-40 text-[#000000] fill-current drop-shadow-[0_8px_16px_rgba(0,0,0,0.95)]" viewBox="0 0 100 60">
                  <path d="M5,42 C12,41 18,36 21,30 C24,24 20,18 25,12 C28,8 32,5 37,8 C40,10 39,15 42,18 C44,20 48,22 52,20 C56,18 57,12 61,15 C65,18 64,25 68,28 C72,31 78,30 82,35 C86,40 85,46 80,50 C75,54 68,52 64,47 C60,42 52,43 46,47 C40,51 32,54 25,52 C18,50 12,54 8,50 Z" />
                  {/* Glowing red werewolf eyes inside silhouette */}
                  <circle cx="34" cy="18" r="2" className="fill-rose-600 animate-ping [animation-duration:1.5s]" />
                  <circle cx="34" cy="18" r="1.2" className="fill-red-500" />
                </svg>
              </div>

              {/* Slogan requested: "WEREWOLF: LINDUNGI NYAWA KALIAN" */}
              <div className="mt-8 space-y-2 z-20">
                <h1 className="text-4xl md:text-5xl font-serif font-black tracking-widest bg-gradient-to-r from-rose-500 via-amber-200 to-rose-600 bg-clip-text text-transparent uppercase">
                  WEREWOLF
                </h1>
                <p className="text-sm md:text-base text-rose-300 font-medium tracking-[0.16em] uppercase">
                  Lindungi Nyawa Kalian
                </p>
                <div className="w-16 h-[2px] bg-gradient-to-r from-transparent via-rose-500 to-transparent mx-auto mt-3" />
              </div>
            </div>

            {/* Tombol Start yang nanti mengarah ke login */}
            <div className="pb-4 w-full max-w-sm z-20">
              <button
                onClick={() => setShowWelcome(false)}
                className="w-full bg-gradient-to-r from-rose-700 to-violet-700 hover:from-rose-600 hover:to-violet-600 text-white font-bold py-4 rounded-2xl tracking-[0.25em] uppercase text-xs transition-all shadow-xl shadow-rose-950/45 cursor-pointer active:scale-95 border border-rose-500/20 pr-[0.15em] flex items-center justify-center gap-2 group"
              >
                <span>Mulai Bermain (Start)</span>
                <ChevronRight size={14} className="text-rose-200 transform group-hover:translate-x-1 transition-transform" />
              </button>
              <p className="text-[10px] text-slate-500 mt-4 uppercase tracking-wider">
                Akun belum tersambung ? Daftar / Masuk Setelah Ini
              </p>
            </div>
          </div>
        </div>
      );
    }

    // AUTH PORTAL (Login & Register form)
    return (
      <div 
        className="fixed inset-0 z-10 min-h-screen flex flex-col justify-center items-center px-4 bg-[#0a0712]"
        style={{ 
          backgroundImage: `linear-gradient(to bottom, rgba(10, 7, 18, 0.45), rgba(10, 7, 18, 0.9)), url('https://images.unsplash.com/photo-1509114397022-ed747cca3f65?q=80&w=1920&auto=format&fit=crop')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        {/* Navigation back arrow if they want to return back to start screen */}
        <button 
          onClick={() => setShowWelcome(true)}
          className="absolute top-6 left-6 text-xs font-bold text-slate-400 hover:text-white uppercase tracking-widest flex items-center gap-2 bg-slate-900/50 border border-purple-900/30 px-4 py-2 rounded-xl backdrop-blur-md transition-all active:scale-95 cursor-pointer"
        >
          &larr; Kembali ke Awal
        </button>

        <div id="auth-card" className="max-w-md w-full bg-slate-900/85 border border-purple-500/20 rounded-3xl p-8 backdrop-blur-2xl shadow-2xl relative overflow-hidden">
          {/* Accent light on top */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-500" />
          
          <div className="text-center space-y-3 mb-8">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-rose-600 to-violet-600 p-[1px] flex items-center justify-center animate-pulse">
              <div className="w-full h-full bg-slate-950 rounded-2xl flex items-center justify-center">
                <WolfIcon className="text-3xl text-rose-500" />
              </div>
            </div>
            <h2 className="text-3xl font-serif tracking-widest text-white uppercase">WOLFY GAIB</h2>
            <p className="text-violet-400 text-xs tracking-wider uppercase font-semibold">Desa Misteri Sosial Deduksi</p>
          </div>

          <div className="flex border-b border-purple-900/40 mb-6 font-semibold text-xs uppercase tracking-wider">
            <button
              type="button"
              onClick={() => { setAuthTab("login"); setAuthError(""); }}
              className={`flex-1 pb-3 text-center transition-colors ${authTab === "login" ? "text-violet-400 border-b-2 border-violet-500" : "text-slate-400 hover:text-slate-200"}`}
            >
              Masuk Desa (Login)
            </button>
            <button
              type="button"
              onClick={() => { setAuthTab("register"); setAuthError(""); }}
              className={`flex-1 pb-3 text-center transition-colors ${authTab === "register" ? "text-violet-400 border-b-2 border-violet-500" : "text-slate-400 hover:text-slate-200"}`}
            >
              Daftar Akun (Register)
            </button>
          </div>

          {authError && (
            <div className="bg-red-950/40 border border-red-500/30 text-rose-400 text-xs p-3 rounded-xl mb-4 leading-relaxed italic text-center animate-shake">
              ⚠ {authError}
            </div>
          )}

          {/* Dynamic note explaining redirection rule */}
          <div className="bg-purple-950/20 border border-purple-500/10 text-[10px] text-purple-300 p-2.5 rounded-lg mb-4 text-center">
            {authTab === "login" 
              ? "Belum login? Silakan beralih ke tab 'Daftar Akun' untuk register." 
              : "Sudah punya akun? Pilih tab 'Masuk Desa' untuk login kembali."}
          </div>

          <form onSubmit={authTab === "register" ? handleRegister : handleLogin} className="space-y-4">
            {authTab === "register" && (
              <div className="relative">
                <span className="absolute left-4 top-3.5 text-slate-500"><User size={16} /></span>
                <input
                  required
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  type="text"
                  placeholder="Username Unik"
                  className="w-full bg-slate-950/50 border border-purple-900/30 rounded-xl pl-12 pr-4 py-3 placeholder-slate-500 text-sm focus:border-violet-500 outline-none transition-colors"
                />
              </div>
            )}

            <div className="relative">
              <span className="absolute left-4 top-3.5 text-slate-500"><Mail size={16} /></span>
              <input
                required
                value={authTab === "register" ? regEmail : loginEmail}
                onChange={(e) => authTab === "register" ? setRegEmail(e.target.value) : setLoginEmail(e.target.value)}
                type="email"
                placeholder="Alamat Email"
                className="w-full bg-slate-950/50 border border-purple-900/30 rounded-xl pl-12 pr-4 py-3 placeholder-slate-500 text-sm focus:border-violet-500 outline-none transition-colors"
              />
            </div>

            <div className="relative">
              <span className="absolute left-4 top-3.5 text-slate-500"><Lock size={16} /></span>
              <input
                required
                value={authTab === "register" ? regPassword : loginPassword}
                onChange={(e) => authTab === "register" ? setRegPassword(e.target.value) : setLoginPassword(e.target.value)}
                type="password"
                placeholder="Kata Sandi Rahasia"
                className="w-full bg-slate-950/50 border border-purple-900/30 rounded-xl pl-12 pr-4 py-3 placeholder-slate-500 text-sm focus:border-violet-500 outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-violet-700 hover:bg-violet-600 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-colors shadow-lg shadow-violet-950/40 mt-6 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span>Menghubungkan...</span>
              ) : (
                <>
                  <span>{authTab === "register" ? "Konfirmasi Pendaftaran" : "Buka Gerbang Desa"}</span>
                  <ChevronRight size={14} />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-[10px] text-slate-500 mt-6 uppercase tracking-wider">
            Autentikasi Aman &bull; Data Terenkripsi &bull; Anti-Refresh
          </p>
        </div>
      </div>
    );
  }

  const isNightPhase = roomState?.game_status === "night" || roomState?.game_status === "resolve";
  const isDayPhase = roomState?.game_status === "morning" || roomState?.game_status === "voting";

  const backgroundImage = isNightPhase
    ? "https://images.unsplash.com/photo-1475274047050-1d0c0975c63e?q=80&w=1920&auto=format&fit=crop" // Spooky majestic forest overlayed with bright glowing full moon
    : isDayPhase
    ? "https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd?q=80&w=1920&auto=format&fit=crop" // Ultra-bright spring morning valley with golden sun rays
    : "https://images.unsplash.com/photo-1509114397022-ed747cca3f65?q=80&w=1920&auto=format&fit=crop"; // Atmospheric default starry night

  const backgroundGradient = isNightPhase
    ? "linear-gradient(to bottom, rgba(5, 4, 15, 0.4), rgba(10, 7, 24, 0.85))"
    : isDayPhase
    ? "linear-gradient(to bottom, rgba(255, 255, 255, 0.4), rgba(15, 12, 28, 0.5))"
    : "linear-gradient(to bottom, rgba(10, 7, 18, 0.45), rgba(10, 7, 18, 0.85))";

  return (
    <div className="relative min-h-screen text-slate-100 overflow-x-hidden font-sans">
      <audio ref={gameMusicRef} src="/audio/game-theme.mpeg" loop preload="auto" />

      {/* Custom Keyframes for Cloudy Night Sky & Sun */}
      <style>{`
        @keyframes drift {
          0% { transform: translate(0, 0); }
          50% { transform: translate(120px, 15px) scale(1.05); }
          100% { transform: translate(0, 0); }
        }
        @keyframes drift-reverse {
          0% { transform: translate(0, 0); }
          50% { transform: translate(-100px, -15px) scale(0.95); }
          100% { transform: translate(0, 0); }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.85; }
        }
      `}</style>

      {/* Background Main image with seamless transition */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center transition-all duration-1000 ease-in-out"
        style={{ 
          backgroundImage: `${backgroundGradient}, url('${backgroundImage}')` 
        }}
      />

      {/* 🌌 Atmospheric Cloudy Night Scenery Overlay (Bintang, Cloud, & Bulan Purnama) */}
      {isNightPhase && (
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none transition-all duration-1000">
          {/* Twinkling Stars */}
          <div 
            className="absolute inset-0 bg-repeat opacity-60 mix-blend-screen" 
            style={{
              backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNDAiIGhlaWdodD0iMTQwIiB2aWV3Qm94PSIwIDAgMTQwIDE0MiI+PGNpcmNsZSBjeD0iMTUiIGN5PSIxNSIgcj0iMSIgZmlsbD0id2hpdGUiIG9wYWNpdHk9IjAuODUiLz48Y2lyY2xlIGN4PSI4NSIgY3k9IjMwIiByPSIxLjUiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjkiLz48Y2lyY2xlIGN4PSI0NSIgY3k9IjcwIiByPSIwLjgiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjU1Ii8+PGNpcmNsZSBjeD0iMTA1IiBjeT0iOTUiIHI9IjEuMiIgZmlsbD0id2hpdGUiIG9wYWNpdHk9IjAuOTUiLz48Y2lyY2xlIGN4PSIxMjAiIGN5PSIyMCIgcj0iMC44IiBmaWxsPSJ3aGl0ZSIgb3BhY2l0eT0iMC42Ii8+PGNpcmNsZSBjeD0iMzAiIGN5PSIxMTAiIHI9IjEuNyIgZmlsbD0id2hpdGUiIG9wYWNpdHk9IjAuODUiLz48L3N2Zz4=")`,
              animation: 'twinkle 5s infinite ease-in-out'
            }}
          />

          {/* Majestic Glowing Full Moon */}
          <div className="absolute top-16 right-16 sm:top-24 sm:right-36 w-24 h-24 sm:w-36 sm:h-36 rounded-full bg-[#fbfbe8] shadow-[0_0_80px_rgba(251,251,232,0.7),0_0_140px_rgba(251,251,232,0.4)] opacity-95 transition-all duration-1000 z-1 flex items-center justify-center animate-pulse">
            {/* Crater shadows map inside moon for depth */}
            <div className="absolute top-[22%] left-[32%] w-5 h-5 rounded-full bg-stone-900/10 blur-[1px]" />
            <div className="absolute top-[50%] left-[58%] w-6 h-6 rounded-full bg-stone-900/10 blur-[1px]" />
            <div className="absolute top-[68%] left-[28%] w-4 h-4 rounded-full bg-stone-900/10 blur-[0.5px]" />
          </div>

          {/* Drifting Heavy Clouds */}
          <div 
            className="absolute top-[8%] left-[-15%] w-[130%] h-48 bg-gradient-to-r from-transparent via-slate-900/40 to-transparent blur-3xl opacity-85"
            style={{ animation: 'drift 38s infinite linear' }}
          />
          <div 
            className="absolute top-[18%] right-[-15%] w-[110%] h-36 bg-gradient-to-r from-transparent via-[#18112c]/65 to-transparent blur-3xl opacity-80"
            style={{ animation: 'drift-reverse 48s infinite linear' }}
          />
          <div className="absolute bottom-0 left-0 w-full h-[50vh] bg-gradient-to-t from-[#04030a]/75 via-transparent to-transparent opacity-90 blur-md pointer-events-none" />
        </div>
      )}

      {/* ☀️ Bright Day Scenery Overlay */}
      {isDayPhase && (
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none transition-all duration-1000">
          {/* Glowing Morning Sun */}
          <div className="absolute top-12 left-12 sm:top-24 sm:left-32 w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-amber-50 shadow-[0_0_100px_rgba(251,191,36,0.65),0_0_180px_rgba(251,191,36,0.35)] opacity-95 z-1" />
          
          {/* Gentle moving morning clouds */}
          <div 
            className="absolute top-[6%] left-[-15%] w-[130%] h-44 bg-gradient-to-r from-transparent via-white/20 to-transparent blur-3xl opacity-80"
            style={{ animation: 'drift 35s infinite linear' }}
          />
          <div 
            className="absolute top-[16%] right-[-15%] w-[110%] h-32 bg-gradient-to-r from-transparent via-white/15 to-transparent blur-3xl opacity-65"
            style={{ animation: 'drift-reverse 45s infinite linear' }}
          />
        </div>
      )}

      <div id="wrapper" className="relative z-10 min-h-screen flex flex-col max-w-7xl mx-auto px-4 py-3">
        {/* Header HUD */}
        <header className="flex justify-between items-center border-b border-purple-900/40 pb-3 mb-6 bg-slate-950/20 px-4 py-2 rounded-2xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="text-3xl text-rose-500 animate-pulse">
              <WolfIcon />
            </span>
            <div>
              <h1 className="font-serif text-2xl tracking-widest bg-gradient-to-r from-violet-400 to-rose-400 bg-clip-text text-transparent font-extrabold uppercase">WOLFY</h1>
              <p className="text-[9px] text-violet-400 tracking-wider font-semibold uppercase">Real-Time Full-Stack Dedicated Server</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-purple-950/30 py-1.5 px-3 rounded-xl border border-purple-900/20 text-xs">
              <User size={12} className="text-violet-400" />
              <span className="font-semibold text-slate-300">{currentUser.username}</span>
            </div>

            <button
              type="button"
              onClick={handleToggleMusic}
              title={muted ? "Nyalakan Musik" : "Matikan Musik"}
              className={`p-2 border rounded-xl transition-all flex items-center justify-center shadow-sm ${
                muted
                  ? "bg-slate-900/40 hover:bg-slate-800/60 border-slate-700/40 text-slate-400 hover:text-slate-200"
                  : "bg-violet-950/35 hover:bg-violet-900/45 border-violet-700/35 text-violet-300 hover:text-violet-200"
              }`}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            
            <button 
              onClick={handleLogout} 
              title="Keluar Akun"
              className="p-2 bg-rose-950/30 hover:bg-rose-900/40 border border-rose-900/30 rounded-xl transition-all flex items-center justify-center text-rose-400 hover:text-rose-300 shadow-sm"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Content area based on routes */}
        <div className="flex-1 flex flex-col items-center justify-center w-full">
          <AnimatePresence mode="wait">
            
            {/* Story Introduction Panel */}
            {phase === "STORY" && (
              <motion.div key="story" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={advanceStory} className="max-w-2xl w-full cursor-pointer">
                <div className="bg-black/60 border border-purple-940 rounded-3xl p-8 backdrop-blur-xl min-h-[300px] flex flex-col justify-between shadow-2xl relative">
                  <span className="absolute top-4 right-4 text-xs italic text-purple-400 tracking-wider font-mono">Babad Tanah Desa &bull; Halaman {storyIndex + 1}/5</span>
                  <p className="text-xl font-serif text-center italic leading-relaxed text-slate-200 pt-10 px-4">{STORY_LINES[storyIndex]}</p>
                  <p className="text-center text-[10px] text-slate-400 uppercase tracking-widest mt-8 flex items-center justify-center gap-2">Ketuk layar untuk melanjutkan <CaretRight size={14} className="text-purple-400 animate-ping" /></p>
                </div>
              </motion.div>
            )}

            {/* Menu hub */}
            {phase === "MENU" && (
              <motion.div key="menu" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="max-w-md w-full space-y-6">
                <div className="text-center space-y-2 mb-6">
                  <h3 className="text-3xl font-serif text-white uppercase flex items-center justify-center gap-3"><Sparkles className="text-amber-400" /> ARENA UTAMA</h3>
                  <p className="text-xs text-slate-400">Pilih skenario pertempuran Anda untuk memulai mawas diri.</p>
                </div>

                <div className="bg-slate-900/80 border border-purple-500/10 p-6 rounded-2xl space-y-4 shadow-xl mb-6">
                  <div className="text-xs text-slate-400 font-semibold mb-2">Pilih Avatar Perang Anda:</div>
                  <div className="grid grid-cols-4 gap-3">
                    {AVATARS.map(av => (
                      <button 
                        key={av.id} 
                        onClick={() => setPlayerAvatar(av)} 
                        className={`h-11 w-full rounded-xl flex items-center justify-center text-xl border-2 transition-all ${av.color} ${playerAvatar.id === av.id ? "scale-105 ring-2 ring-violet-500 opacity-100" : "opacity-35 hover:opacity-75"}`}
                      >
                        {av.emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={async () => {
                    setLoading(true);
                    try {
                      // Create a temporary solo room
                      const { roomId } = await api.createRoom(playerAvatar.id);
                      localStorage.setItem("wolfy_room_id", roomId);
                      // Instantly launch with Bots simulated
                      await api.startGame(roomId, true);
                      setRoomCode(roomId);
                    } catch (e: any) {
                      alert(e.message);
                    } finally {
                      setLoading(false);
                    }
                  }} 
                  className="w-full p-6 bg-indigo-950/40 border border-indigo-500/20 rounded-2xl text-left hover:border-indigo-500/50 transition-all flex justify-between items-center shadow-lg group hover:scale-[1.01]"
                >
                  <div className="space-y-1">
                    <h3 className="font-bold text-lg text-indigo-300 flex items-center gap-3"><Shield size={18} /> Mode Solo</h3>
                    <p className="text-xs text-slate-400">Main cepat dengan 7 Bot AI terlatih dalam hitungan detik.</p>
                  </div>
                  <CaretRight size={20} className="text-slate-500 group-hover:text-indigo-400 transition-colors" />
                </button>

                <button 
                  onClick={() => setPhase("MULTI_LOBBY")} 
                  className="w-full p-6 bg-rose-950/30 border border-rose-500/20 rounded-2xl text-left hover:border-rose-500/50 transition-all flex justify-between items-center shadow-lg group hover:scale-[1.01]"
                >
                  <div className="space-y-1">
                    <h3 className="font-bold text-lg text-rose-300 flex items-center gap-3"><Users size={18} /> Mabar Multiplayer</h3>
                    <p className="text-xs text-slate-400">Buat ruang kumpul rahasia dan tantang teman-teman sejati.</p>
                  </div>
                  <CaretRight size={20} className="text-slate-500 group-hover:text-rose-400 transition-colors" />
                </button>

                <button 
                  onClick={() => setShowRolesModal(true)} 
                  className="w-full p-6 bg-purple-950/20 border border-purple-500/25 rounded-2xl text-left hover:border-purple-500/50 transition-all flex justify-between items-center shadow-lg group hover:scale-[1.01]"
                >
                  <div className="space-y-1">
                    <h3 className="font-bold text-lg text-purple-300 flex items-center gap-3"><HelpCircle size={18} /> Panduan Peran (Roles)</h3>
                    <p className="text-xs text-slate-400">Pahami kekuatan rahasia Werewolf, Seer, Doctor, Hunter, & Villager.</p>
                  </div>
                  <CaretRight size={20} className="text-slate-500 group-hover:text-purple-400 transition-colors" />
                </button>

                {/* Roles Information Modal Overlay */}
                <AnimatePresence>
                  {showRolesModal && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md"
                    >
                      <motion.div 
                        initial={{ scale: 0.95, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 20 }}
                        className="bg-slate-900/95 border border-purple-500/30 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto"
                      >
                        <div className="flex items-center justify-between border-b border-purple-500/10 pb-3">
                          <div className="text-sm text-purple-300 font-bold uppercase tracking-widest flex items-center gap-2">
                            <Sparkles size={16} className="text-amber-400 shrink-0" />
                            Daftar Peran Rahasia (Game Roles)
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowRolesModal(false);
                            }}
                            className="text-slate-400 hover:text-white font-mono text-lg p-1 hover:bg-slate-800 rounded-full transition-all w-8 h-8 flex items-center justify-center cursor-pointer"
                          >
                            &times;
                          </button>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed text-left">
                          Setiap pemain di dalam Desa akan diberikan salah satu peran rahasia berikut secara merata dan acak pada awal permainan:
                        </p>
                        <div className="space-y-3 text-left">
                          {[
                            { name: "Werewolf", emoji: "🐺", color: "text-rose-400 bg-rose-950/20 border-rose-800/20", desc: "Bersekutulah di malam hari dengan kawan bulumu dan terkam seluruh warga desa hingga jumlahnya menyusut." },
                            { name: "Seer", emoji: "🔮", color: "text-amber-400 bg-amber-950/20 border-amber-800/20", desc: "Menerawang peran rahasia sejati dari satu kontestan lain setiap malam hari untuk membantu desa." },
                            { name: "Doctor", emoji: "🧪", color: "text-teal-400 bg-teal-950/20 border-teal-800/20", desc: "Memilih satu pemain setiap malam (bisa diri sendiri) agar kebal total dari terkaman malam Werewolf." },
                            { name: "Hunter", emoji: "🏹", color: "text-emerald-400 bg-emerald-950/20 border-emerald-800/20", desc: "Ketika tereliminasi (dibunuh malam atau digantung siang), Hunter langsung membalas menembak mati target mana saja seketika!" },
                            { name: "Villager", emoji: "🌾", color: "text-indigo-400 bg-indigo-950/20 border-indigo-800/20", desc: "Warga sipil biasa tanpa aksi khusus di malam hari, bersatu melacak dan menggantung Werewolf di siang hari." }
                          ].map(role => (
                            <div key={role.name} className={`flex gap-3 p-3 rounded-2xl border ${role.color}`}>
                              <div className="text-2xl flex items-center justify-center shrink-0 w-10 h-10 rounded-full bg-slate-950/45 border border-slate-800/30">
                                {role.emoji}
                              </div>
                              <div className="space-y-0.5 min-w-0">
                                <div className="text-sm font-bold font-sans tracking-wide">{role.name}</div>
                                <div className="text-xs text-slate-200 leading-normal">{role.desc}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowRolesModal(false);
                          }}
                          className="w-full py-3 mt-2 bg-gradient-to-r from-violet-800 to-indigo-800 hover:from-violet-700 hover:to-indigo-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl shadow-lg border border-purple-500/20 transition-all active:scale-[0.98] cursor-pointer"
                        >
                          Mengerti, Tutup Panduan
                        </button>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Multiplayer Lobby options */}
            {phase === "MULTI_LOBBY" && (
              <motion.div key="multi-lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="max-w-md w-full space-y-6 text-center">
                <h3 className="text-2xl font-serif text-white uppercase mb-6 tracking-wider">MABAR MULTIPLAYER</h3>
                
                <button 
                  disabled={loading} 
                  onClick={handleCreateRoom} 
                  className="w-full p-5 bg-gradient-to-r from-violet-700 to-indigo-700 hover:from-violet-600 hover:to-indigo-600 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg hover:scale-[1.01] transition-transform text-xs uppercase tracking-widest disabled:opacity-50"
                >
                  {loading ? "Menyiapkan..." : <><PlusCircle size={18} /> Buat Ruangan Desa Baru</>}
                </button>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-700/50"></span></div>
                  <div className="relative flex justify-center text-[10px] uppercase tracking-widest text-slate-500"><span className="bg-slate-950 px-3 text-slate-400 font-bold">atau</span></div>
                </div>

                <div className="bg-slate-900/50 border border-purple-500/10 p-6 rounded-2xl space-y-4">
                  <div className="text-xs text-slate-400 text-left font-semibold">Tuliskan Kode Ruangan Teman:</div>
                  <div className="flex flex-col gap-3">
                    <input 
                      value={inputCode} 
                      onChange={(e) => setInputCode(e.target.value.toUpperCase())} 
                      maxLength={4} 
                      type="text" 
                      placeholder="KODE" 
                      className="w-full bg-slate-950/80 border border-purple-500/20 p-4 rounded-xl text-center text-3xl tracking-[0.5em] font-serif uppercase focus:border-violet-500 outline-none transition-colors" 
                    />
                    <button 
                      disabled={loading || inputCode.length !== 4} 
                      onClick={handleJoinByCode} 
                      className="w-full p-4 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-xs tracking-widest uppercase disabled:opacity-30 transition-colors"
                    >
                      MASUK SEKARANG
                    </button>
                  </div>
                </div>

                <button onClick={() => setPhase("MENU")} className="text-xs text-slate-500 hover:text-slate-300 uppercase tracking-widest font-bold">Kembali ke Skenario</button>
              </motion.div>
            )}

            {/* Realtime Room UI driven purely by currentRoom.state */}
            {phase === "ROOM" && roomState && (
              <motion.div key="room-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full flex-1 flex flex-col gap-4">
                
                {/* 1. HUD Panel on Top */}
                <div className="bg-slate-900/80 border border-purple-900/40 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-lg backdrop-blur-md">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl bg-slate-950 border border-indigo-500/50">
                      {roomState.game_status === "night" ? <Moon className="text-indigo-400" /> : <Sun className="text-amber-400" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-serif text-lg tracking-wider text-white uppercase flex items-center gap-2">
                          <span>Fase {roomState.game_status?.replace(/_/g, " ")}</span>
                          {roomState.game_mode === "solo" && <span className="text-[9px] bg-indigo-900 text-indigo-300 px-1.5 py-0.5 rounded uppercase font-sans tracking-wide">Bots</span>}
                        </h2>
                        {timeLeft !== null && (
                          <div className="flex items-center gap-1.5 bg-rose-950/60 px-2 py-0.5 rounded-full text-[10px] font-mono border border-rose-500/35 text-rose-400 animate-pulse font-extrabold" title="Waktu Tersisa">
                            <Clock size={11} />
                            <span>{timeLeft}s</span>
                          </div>
                        )}
                      </div>
                      <div className="text-[10px] text-rose-500 font-bold uppercase tracking-widest">Sinar Siklus &bull; Hari Ke-{roomState.day_number}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center sm:justify-end gap-3 w-full sm:w-auto">
                    <div className="bg-black/50 px-4 py-2 rounded-xl border border-slate-800 text-xs text-slate-400">
                      Kode Ruang: <span className="font-serif text-amber-400 font-bold tracking-wider text-sm">{roomCode}</span>
                    </div>

                    {/* ALWAYS ACTIVE BACK BUTTON INSIDE HUD */}
                    <button 
                      onClick={() => {
                        handleLeaveRoom();
                      }} 
                      className="bg-rose-950/55 hover:bg-rose-900/70 text-rose-300 hover:text-rose-200 border border-rose-900/40 px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95"
                      title="Keluar Ruangan"
                    >
                      <LogOut size={13} />
                      <span>Keluar</span>
                    </button>
                    
                    {/* Host Actions Hub */}
                    {isHost && (
                      <div className="flex items-center gap-2">
                        {roomState.game_status === "waiting" && (
                          <button 
                            disabled={loading || (roomState.game_mode !== "solo" && players.length < 4)}
                            onClick={() => handleStartGame(roomState.game_mode === "solo")} 
                            className="bg-violet-700 hover:bg-violet-600 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-violet-500/30 disabled:opacity-30"
                          >
                            Mulai Game ({players.length}/8)
                          </button>
                        )}
                        {roomState.game_status === "role_reveal" && (
                          <button 
                            disabled={loading}
                            onClick={handleConfirmReveal} 
                            className="bg-amber-600 hover:bg-amber-500 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-amber-500/30"
                          >
                            Matikan Lilin (Mulai Malam)
                          </button>
                        )}
                        {roomState.game_status === "night" && (
                          <button 
                            disabled={loading}
                            onClick={handleResolveNight} 
                            className="bg-emerald-700 hover:bg-emerald-600 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-emerald-500/30 animate-pulse"
                          >
                            Selesaikan Malam (Resolve)
                          </button>
                        )}
                        {roomState.game_status === "resolve" && (
                          <button 
                            disabled={loading}
                            onClick={handleResolveNight} 
                            className="bg-violet-700 hover:bg-violet-600 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-violet-500/30"
                          >
                            Buka Kabar Fajar (Lanjut)
                          </button>
                        )}
                        {roomState.game_status === "morning" && (
                          <button 
                            disabled={loading}
                            onClick={handleConfirmMorning} 
                            className="bg-violet-700 hover:bg-violet-600 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-violet-500/30"
                          >
                            Buka Pengadilan Gantung
                          </button>
                        )}
                        {roomState.game_status === "voting" && (
                          <button 
                            disabled={loading}
                            onClick={handleResolveVoting} 
                            className="bg-amber-600 hover:bg-amber-500 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-amber-500/30 animate-pulse"
                          >
                            Hitung Voting Gantung
                          </button>
                        )}
                        {roomState.game_status === "end_game" && (
                          <button 
                            disabled={loading}
                            onClick={handleRestart} 
                            className="bg-violet-700 hover:bg-violet-600 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-violet-500/30"
                          >
                            Buka Ulang Gerbang (Main Lagi)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Main Arena Screen Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 items-stretch">
                  
                  {/* Left Column: Player Cards Grid */}
                  <div className="md:col-span-2 bg-slate-900/45 border border-purple-900/20 rounded-3xl p-6 flex flex-col justify-between h-full">
                    
                    <div>
                      {/* Interactive guidance HUD based on state */}
                      <div className="bg-slate-950/60 p-4 rounded-2xl border border-purple-950/40 text-xs italic text-violet-300 font-semibold mb-6 leading-relaxed relative overflow-hidden flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <HelpCircle size={14} className="text-violet-400 shrink-0" />
                          <span>{getGuidanceMessage(myPlayer)}</span>
                        </div>
                        {myPlayer && roomState.game_status === "role_reveal" && (
                          <div className="text-[10px] uppercase font-sans tracking-wide bg-violet-950 text-violet-300 font-bold px-2 py-0.5 rounded border border-violet-500/10">
                            Status: {myPlayer.role}
                          </div>
                        )}
                      </div>

                      {/* Seer crystal HUD */}
                      {seerInsight && (
                        <div id="seer-inspect-box" className="bg-indigo-950/50 border border-amber-500/40 px-4 py-3 rounded-2xl mb-6 text-xs text-amber-300 flex justify-between items-center gap-4 animate-pulse">
                          <span className="flex items-center gap-2">
                            <span>🔮 Ramalan Teropong:</span>
                            <strong className="text-white text-sm font-serif">{seerTargetName}</strong> adalah seorang <strong className="text-amber-200 capitalize text-sm">{seerInsight}</strong>!
                          </span>
                          <button onClick={() => setSeerInsight(null)} className="text-[10px] uppercase font-bold text-slate-400">Tutup</button>
                        </div>
                      )}

                      {/* Villager or Hunter Sleep Option */}
                      {myPlayer?.is_alive && !myPlayer?.has_acted && roomState.game_status === "night" && (myPlayer?.role === "Villager" || myPlayer?.role === "Hunter") && (
                        <div className="bg-indigo-950/40 border border-indigo-500/20 p-4 rounded-xl mb-6 text-xs text-indigo-300 flex flex-col sm:flex-row justify-between items-center gap-3">
                          <div className="flex items-center gap-2">
                            <Moon className="text-indigo-400 shrink-0" size={16} />
                            <span>Sebagai peran {myPlayer?.role}, Anda tidak beraksi aktif malam ini. Masuk ke kamar dan tidur?</span>
                          </div>
                          <button 
                            disabled={loading}
                            onClick={async () => {
                              setLoading(true);
                              try {
                                await api.submitNightAction(roomCode, "sleep");
                              } catch (e: any) {
                                alert(e.message);
                              } finally {
                                setLoading(false);
                              }
                            }}
                            className="bg-indigo-800 hover:bg-indigo-700 text-white border border-indigo-500/40 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-lg active:scale-95 shrink-0"
                          >
                            Tidur Nyenyak
                          </button>
                        </div>
                      )}

                      {/* General acting check */}
                      {myPlayer?.has_acted && (roomState.game_status === "night" || roomState.game_status === "voting") && (
                        <div className="bg-emerald-950/40 border border-emerald-500/20 p-4 rounded-xl mb-6 text-xs text-emerald-300 flex items-center gap-3 italic">
                          <Zap size={14} className="text-emerald-400 shrink-0 animate-bounce" />
                          <span>Pilihan Anda disimpan! Silakan tunggu keputusan desa selesai dirundingkan.</span>
                        </div>
                      )}

                      {/* Grid representation */}
                      {roomState.game_status === "waiting" && roomState.game_mode !== "solo" && players.length < 4 ? (
                        <div className="space-y-6">
                          <div className="flex flex-col items-center justify-center py-10 text-center text-slate-500 space-y-4 border border-dashed border-slate-800 rounded-3xl">
                            <Users size={40} className="text-slate-700 animate-pulse" />
                            <div className="space-y-1">
                              <h4 className="font-semibold text-slate-400">Menanti Peserta Lain Tiba...</h4>
                              <p className="text-[10px] uppercase tracking-wider text-slate-600 font-mono">Bermain multiplayer memerlukan minimum 4 peserta asli ({players.length}/4).</p>
                            </div>
                          </div>
                          
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Warga yang Telah Hadir ({players.length}):</div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {players.map(p => {
                              const isMe = p.id === (currentUser?.user_id || currentUser?.userId);
                              return (
                                <div
                                  key={p.id}
                                  className="relative bg-slate-950/40 border border-slate-800/60 p-4 rounded-3xl flex flex-col items-center gap-2 transform transition-all"
                                >
                                  <div className={`w-14 h-14 rounded-full ${p.avatarData?.color || "bg-slate-800"} flex items-center justify-center text-2xl border-2`}>
                                    {p.avatarData?.emoji || "👤"}
                                  </div>
                                  <div className="text-xs font-bold text-slate-100 truncate w-full text-center">{p.name}</div>
                                  {isMe && (
                                    <div className="text-[9px] text-violet-400 font-bold uppercase tracking-widest mt-1 bg-violet-950/50 px-1.5 py-0.5 rounded border border-purple-500/10">
                                      Saya
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          {players.map(p => {
                            const isMe = p.id === (currentUser?.user_id || currentUser?.userId);
                            const isTargeted = selectedTargetId === p.id;
                            const isPlayerVoteMatch = p.vote !== "";

                            return (
                              <button
                                key={p.id}
                                disabled={roomState.game_status === "waiting" || !p.is_alive || myPlayer?.has_acted || !myPlayer?.is_alive}
                                onClick={() => p.is_alive && setSelectedTargetId(p.id)}
                                className={`relative bg-slate-950/40 border p-4 rounded-3xl flex flex-col items-center gap-2 transition-all group ${!p.is_alive && "opacity-35 grayscale"} ${isTargeted && roomState.game_status !== "waiting" ? "border-amber-400 ring-2 ring-amber-400/30 scale-105" : "border-slate-800/60 hover:border-purple-900/50"} ${p.vote && roomState.game_status === "voting" && "border-dashed border-violet-500/20"}`}
                              >
                                <div className={`w-14 h-14 rounded-full ${p.avatarData.color} flex items-center justify-center text-2xl border-2`}>
                                  {p.avatarData.emoji}
                                </div>
                                <div className="text-xs font-bold text-slate-100 truncate w-full text-center">{p.name}</div>
                                
                                {isMe && (
                                  <div className="text-[9px] text-violet-400 font-bold uppercase tracking-widest mt-1 bg-violet-950/50 px-1.5 py-0.5 rounded border border-purple-500/10">
                                    {p.role} (Saya)
                                  </div>
                                )}

                                {!isMe && p.is_bot && (
                                  <div className="text-[8px] text-indigo-400 font-bold uppercase tracking-wider font-mono">
                                    AI Bot
                                  </div>
                                )}

                                {!p.is_alive && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/55 rounded-3xl">
                                    <Skull className="text-rose-600 w-8 h-8" />
                                  </div>
                                )}

                                {p.is_alive && p.vote && roomState.game_status === "voting" && (
                                  <div className="absolute top-2 right-2 bg-violet-700 text-[8px] font-bold px-1 py-0.2 rounded-md border border-violet-500 text-white shadow animate-pulse">
                                    Voted
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Action Confirmation Banner inside Left Column */}
                    {selectedTargetId && myPlayer?.is_alive && !myPlayer?.has_acted && (roomState.game_status === "night" || roomState.game_status === "voting") && (() => {
                      const getActionBtnConfig = () => {
                        if (roomState.game_status === "voting") {
                          return {
                            bg: "bg-indigo-700 hover:bg-indigo-600 border-indigo-500/30",
                            text: "Berikan Suara (Vote)",
                            icon: <Volume2 size={12} />
                          };
                        }
                        
                        const role = myPlayer?.role;
                        if (role === "Werewolf") {
                          return {
                            bg: "bg-rose-700 hover:bg-rose-600 border-rose-500/30",
                            text: "Terkam Warga Desa (Bite)",
                            icon: <Skull size={12} />
                          };
                        } else if (role === "Doctor") {
                          return {
                            bg: "bg-teal-700 hover:bg-teal-600 border-teal-500/30",
                            text: "Lindungi Pemain (Protect)",
                            icon: <Shield size={12} />
                          };
                        } else if (role === "Seer") {
                          return {
                            bg: "bg-amber-700 hover:bg-amber-600 border-amber-500/30",
                            text: "Teropong Rahasia (Inspect)",
                            icon: <Eye size={12} />
                          };
                        }
                        return {
                          bg: "bg-purple-700 hover:bg-purple-600 border-purple-500/30",
                          text: "Konfirmasi Pilihan",
                          icon: <Flame size={12} />
                        };
                      };
                      
                      const btnConfig = getActionBtnConfig();
                      
                      return (
                        <div className="mt-6 p-4 bg-purple-950/30 border border-purple-500/20 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4 animate-fade-in backdrop-blur-md">
                          <div className="text-xs text-slate-300">
                            Target Terpilih: <strong className="text-amber-400 font-serif text-sm">{(players.find(p => p.id === selectedTargetId))?.name}</strong>
                          </div>
                          <div className="flex gap-2 w-full sm:w-auto">
                            <button
                              onClick={() => setSelectedTargetId(null)}
                              className="flex-1 sm:flex-initial bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-xl font-bold uppercase tracking-widest text-[10px]"
                            >
                              Batal
                            </button>
                            <button 
                              disabled={loading}
                              onClick={handleAction} 
                              className={`flex-1 sm:flex-initial ${btnConfig.bg} px-6 py-2.5 rounded-xl font-bold uppercase tracking-widest text-[10px] animate-pulse flex items-center justify-center gap-2 border text-white transition-all`}
                            >
                              {btnConfig.icon}
                              <span>{btnConfig.text}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Return back button / exit helper inside Room */}
                    {roomState.game_status === "waiting" && (
                      <button 
                        onClick={handleLeaveRoom} 
                        className="mt-12 text-xs text-rose-500/70 hover:text-rose-400 uppercase tracking-widest font-bold self-center border border-rose-950/40 hover:border-rose-900/50 bg-rose-950/20 px-6 py-2.5 rounded-xl transition-all"
                      >
                        Keluar Ruangan (Leave)
                      </button>
                    )}
                  </div>

                  {/* Right Column: Chat system and Actions */}
                  <div className="bg-slate-900/40 border border-purple-900/20 rounded-3xl p-4 flex flex-col justify-between h-[520px] md:h-full min-h-[450px]">
                    
                    {/* Chat log visualizer */}
                    <div className="flex-1 overflow-y-auto space-y-2.5 mb-4 pr-1 scroll-smooth text-[12px]" ref={chatScrollRef}>
                      {logs.length === 0 ? (
                        <div className="h-full flex flex-col justify-center items-center text-center text-slate-600">
                          <HelpCircle size={24} className="opacity-30 mb-2" />
                          <p className="text-[10px] uppercase font-mono tracking-wider">Kesaksian desa masih sunyi...</p>
                        </div>
                      ) : (
                        logs.map((l, i) => {
                          const isSys = l.sender === "Sistem" || l.sender === "Pengadilan Desa" || l.sender === "Asisten" || l.sender === "Sistem-Penyihir";
                          return (
                            <div 
                              key={i} 
                              className={`p-3 rounded-2xl backdrop-blur bg-black/35 ${isSys ? "border-l-4 border-amber-500/60 bg-amber-950/5" : "border-l-4 border-violet-500/30"}`}
                            >
                              <span className={`font-bold block text-[9px] uppercase tracking-wider mb-1 ${isSys ? "text-amber-400" : "text-violet-300"}`}>
                                {l.sender}
                              </span>
                              <span className="text-slate-300 leading-relaxed font-sans">{l.text}</span>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Persistent Chat Text Input field so players can always coordinate and talk */}
                    <div className="flex gap-2 p-2 bg-black/45 rounded-2xl border border-purple-950/40">
                      <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { 
                          if (e.key === "Enter") { 
                            handleSendChat(); 
                          } 
                        }}
                        type="text"
                        placeholder="Diskusikan kecurigaan atau obrolan..."
                        className="flex-1 bg-transparent px-3 py-2 text-xs outline-none text-white font-sans"
                      />
                      <button 
                        onClick={handleSendChat}
                        className="bg-violet-600 hover:bg-violet-500 p-2.5 rounded-xl transition-colors shrink-0 text-white"
                      >
                        <Send size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* 3. Realtime Overlays: Mandat Identitas (Role Reveal Overlay) */}
      {roomState && roomState.game_status === "role_reveal" && myPlayer && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-6 backdrop-blur-3xl">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            className="flex flex-col items-center max-w-sm w-full text-center"
          >
            <h2 className="text-xs uppercase tracking-[0.5em] text-violet-400 mb-8 font-bold">MANDAT PERAN ANDA</h2>
            
            <div className="w-full bg-slate-900 border-2 border-purple-500/20 rounded-3xl flex flex-col items-center p-8 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[0_0_50px_rgba(124,58,237,0.15)] relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500 to-transparent" />
              
              <div className="w-20 h-20 bg-slate-950 rounded-full flex items-center justify-center text-4xl mb-6 border border-slate-800 shadow-md">
                {getRoleDesc(myPlayer.role).emoji}
              </div>

              <h4 className="text-[10px] uppercase font-bold tracking-widest text-slate-500 font-mono mb-1">peran rahasia asli</h4>
              <h3 className={`text-2xl font-serif tracking-widest font-extrabold uppercase mb-4 ${getRoleDesc(myPlayer.role).color}`}>
                {getRoleDesc(myPlayer.role).header}
              </h3>

              <p className="text-[11px] text-slate-400 leading-relaxed font-sans px-4">
                {getRoleDesc(myPlayer.role).desc}
              </p>
            </div>

            {isHost ? (
              <button 
                disabled={loading}
                onClick={handleConfirmReveal} 
                className="mt-10 w-full py-4 bg-gradient-to-r from-violet-700 to-indigo-700 hover:from-violet-600 hover:to-indigo-600 rounded-2xl font-bold tracking-[0.2em] transition-all uppercase text-xs text-white shadow-lg shadow-violet-950/40"
              >
                Mulai Malam Pertama (Host)
              </button>
            ) : (
              <div className="mt-10 p-4 bg-purple-950/20 rounded-xl border border-purple-900/20 text-xs italic text-violet-300 font-semibold animate-pulse uppercase tracking-wider">
                Menunggu Host memadamkan lilin...
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* 4. Realtime Overlays: Game Victory (Winner Screen Overlay) */}
      {roomState && roomState.game_status === "end_game" && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-6 backdrop-blur-3xl text-center">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            className="flex flex-col items-center max-w-sm w-full"
          >
            <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-4xl mb-6 animate-bounce">
              🏆
            </div>
            
            <h2 className="text-xs uppercase tracking-[0.4em] text-violet-400 mb-2 font-bold font-mono">Pertandingan Berakhir</h2>
            <h1 className="text-3xl font-serif text-white font-extrabold uppercase leading-tight tracking-wider mb-4">
              {roomState.winner === "VILLAGERS" ? "WARGA MENANG" : "SERIGALA MENANG"}
            </h1>

            <div className="w-full bg-slate-900/60 p-5 rounded-2xl border border-slate-800 mb-8 max-h-[150px] overflow-y-auto text-xs text-slate-400 leading-relaxed italic">
              {roomState.winner === "VILLAGERS" 
                ? "Bencana di Desa Wolfy berhasil diselesaikan! Para penyamar siluman Werewolf berhasil dibasmi ke tiang gantung deso."
                : "Seisi pemukiman Desa Wolfy luluh lantah oleh lolongan Werewolf! Seluruh warga desa sirna ditelan terkam kegelapan."
              }
            </div>

            {isHost ? (
              <button 
                disabled={loading}
                onClick={handleRestart} 
                className="w-full py-4 bg-violet-700 hover:bg-violet-600 rounded-2xl font-bold tracking-widest transition-all uppercase text-xs text-white shadow-xl shadow-slate-950"
              >
                Kembali ke Lobby (Main Lagi)
              </button>
            ) : (
              <div className="space-y-4 w-full">
                <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 text-xs italic text-slate-500">
                  Menanti Host mengulang kembali desa...
                </div>
                <button 
                  onClick={handleLeaveRoom}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-2xl font-bold tracking-widest text-[10px] uppercase transition-all"
                >
                  Kembali ke Arena Utama (Keluar)
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}

    </div>
  );
}
