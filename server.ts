import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
  runTransaction,
  serverTimestamp
} from "firebase/firestore";
import dotenv from "dotenv";
import crypto from "node:crypto";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

dotenv.config();

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

const JWT_SECRET = process.env.JWT_SECRET || "wolfy_twilight_secrets_987654321";

// Auth helper functions
function hashPassword(password: string): string {
  return crypto.pbkdf2Sync(password, JWT_SECRET, 1000, 64, "sha512").toString("hex");
}

function generateToken(userId: string): string {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days expiration
  const payload = `${userId}:${expiresAt}`;
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64")}.${signature}`;
}

function verifyToken(token: string): string | null {
  try {
    const [payloadBase64, signature] = token.split(".");
    if (!payloadBase64 || !signature) return null;
    const payload = Buffer.from(payloadBase64, "base64").toString("utf-8");
    const [userId, expiresAtStr] = payload.split(":");
    const expiresAt = parseInt(expiresAtStr, 10);
    if (Date.now() > expiresAt) return null;

    const expectedSignature = crypto.createHmac("sha256", JWT_SECRET).update(payload).digest("hex");
    if (signature === expectedSignature) {
      return userId;
    }
  } catch (e) {
    return null;
  }
  return null;
}

// Bot Name Constants
const BOT_NAMES = ["Budi", "Dewi", "Putra", "Kadek", "Wulan", "Yanto", "Lia", "Andi", "Siti", "Rangga", "Sisca"];
const BOT_AVATARS = ["wolf", "cat", "fox", "panda", "owl", "bear", "rabbit", "lion"];

// Interfaces
interface AuthRequest extends Request {
  user?: {
    userId: string;
    user_id: string;
    username: string;
    email: string;
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Log Middleware
  app.use((req, res, next) => {
    console.log(`[${req.method}] ${req.url}`);
    next();
  });

  // Auth Middleware
  const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Sesi tidak valid, silakan login" });
    }
    const token = authHeader.split(" ")[1];
    const userId = verifyToken(token);
    if (!userId) {
      return res.status(401).json({ error: "Sesi kedaluwarsa, silakan login kembali" });
    }

    try {
      const userSnap = await getDoc(doc(db, "users", userId));
      if (!userSnap.exists()) {
        return res.status(401).json({ error: "Akun user tidak ditemukan" });
      }
      const userData = userSnap.data();
      req.user = {
        userId,
        user_id: userId,
        username: userData.username,
        email: userData.email,
      };
      next();
    } catch (err: any) {
      return res.status(500).json({ error: "Gagal memverifikasi akun" });
    }
  };

  // ==================== AUTH API ====================

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, email, password } = req.body;
      if (!username || !email || !password) {
        return res.status(400).json({ error: "Seluruh kolom harus diisi!" });
      }

      const emailKey = email.trim().toLowerCase();
      // Check if email already registered
      const usersRef = collection(db, "users");
      const userDocs = await getDocs(usersRef);
      const isExist = userDocs.docs.some((doc) => doc.data().email === emailKey);
      if (isExist) {
        return res.status(400).json({ error: "Email sudah terdaftar!" });
      }

      const userId = "u_" + Math.random().toString(36).substring(2, 11);
      const hashedPassword = hashPassword(password);

      const userDocRef = doc(db, "users", userId);
      await setDoc(userDocRef, {
        user_id: userId,
        username: username.trim(),
        email: emailKey,
        password: hashedPassword
      });

      const token = generateToken(userId);
      res.status(201).json({
        token,
        user: {
          user_id: userId,
          username: username.trim(),
          email: emailKey
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email dan password harus diisi!" });
      }

      const emailKey = email.trim().toLowerCase();
      const usersRef = collection(db, "users");
      const userDocs = await getDocs(usersRef);
      const userDoc = userDocs.docs.find((doc) => doc.data().email === emailKey);

      if (!userDoc) {
        return res.status(401).json({ error: "Email atau password salah!" });
      }

      const userData = userDoc.data();
      const hashedPass = hashPassword(password);
      if (userData.password !== hashedPass) {
        return res.status(401).json({ error: "Email atau password salah!" });
      }

      const token = generateToken(userData.user_id);
      res.json({
        token,
        user: {
          user_id: userData.user_id,
          username: userData.username,
          email: userData.email
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/auth/profile", authMiddleware, (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Sesi tidak valid" });
    }
    res.json({
      user: {
        user_id: req.user.userId,
        userId: req.user.userId,
        username: req.user.username,
        email: req.user.email
      }
    });
  });

  // ==================== GAME CORE API ====================

  // Create room
  app.post("/api/game/create", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { avatarId } = req.body;
      const user = req.user!;

      // Generate a short room Code
      const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
      const roomRef = doc(db, "rooms", roomId);
      const playerRef = doc(db, "rooms", roomId, "players", user.userId);

      await setDoc(roomRef, {
        room_id: roomId,
        game_status: "waiting",
        selected_kill: null,
        protected_player: null,
        day_number: 1,
        winner: null,
        host_id: user.userId,
        game_mode: "solo", // default, will update on start
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await setDoc(playerRef, {
        id: user.userId,
        user_id: user.userId,
        name: user.username,
        avatar: avatarId || "wolf",
        role: "Villager",
        is_alive: true,
        has_acted: false,
        is_host: true,
        vote: "",
        is_bot: false
      });

      // Add welcoming log
      const logRef = doc(collection(db, "rooms", roomId, "logs"));
      await setDoc(logRef, {
        sender: "Sistem",
        text: `Room ${roomId} telah dibuat oleh ${user.username}. Selamat datang!`,
        type: "log",
        createdAt: new Date().toISOString()
      });

      res.status(201).json({ roomId });
    } catch (error: any) {
      console.error("Create room error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Join room
  app.post("/api/game/join", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { roomId, avatarId } = req.body;
      const user = req.user!;

      if (!roomId || roomId.length !== 4) {
        return res.status(400).json({ error: "Room ID tidak valid" });
      }

      const roomRef = doc(db, "rooms", roomId.toUpperCase());
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        return res.status(404).json({ error: "Room tidak ditemukan" });
      }

      const roomData = roomSnap.data();
      if (roomData.game_status !== "waiting") {
        return res.status(400).json({ error: "Game sudah dimulai atau selesai di room ini." });
      }

      const playerRef = doc(db, "rooms", roomId.toUpperCase(), "players", user.userId);
      await setDoc(playerRef, {
        id: user.userId,
        user_id: user.userId,
        name: user.username,
        avatar: avatarId || "fox",
        role: "Villager",
        is_alive: true,
        has_acted: false,
        is_host: false,
        vote: "",
        is_bot: false
      });

      // Logging inside the room logs
      const logRef = doc(collection(db, "rooms", roomId.toUpperCase(), "logs"));
      await setDoc(logRef, {
        sender: "Sistem",
        text: `${user.username} bergabung ke desa!`,
        type: "log",
        createdAt: new Date().toISOString()
      });

      res.json({ success: true, roomId: roomId.toUpperCase() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Start Game
  app.post("/api/game/start", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { roomId, isSolo } = req.body;
      const user = req.user!;

      const roomRef = doc(db, "rooms", roomId);
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists()) return res.status(404).json({ error: "Room tidak ditemukan" });

      const roomData = roomSnap.data();
      if (roomData.host_id !== user.userId) {
        return res.status(403).json({ error: "Hanya host yang bisa memulai permainan!" });
      }

      const playersRef = collection(db, "rooms", roomId, "players");
      const playersSnap = await getDocs(playersRef);
      let realPlayers = playersSnap.docs.map((d) => d.data());

      // Let's seed bots if Solo game, or if lobby has fewer than 4 players in Multi-player we can't start
      if (isSolo) {
        // Solo Mode: Fill the room with bots until exactly 8 players
        const targetCount = 8;
        const currentCount = realPlayers.length;
        const botsNeeded = targetCount - currentCount;

        // Shuffle bot name and avatars
        const shuffledNames = [...BOT_NAMES].sort(() => Math.random() - 0.5);
        
        for (let i = 0; i < botsNeeded; i++) {
          const botId = "bot_" + Math.random().toString(36).substring(2, 11);
          const botName = shuffledNames[i % shuffledNames.length];
          const botAvatar = BOT_AVATARS[Math.floor(Math.random() * BOT_AVATARS.length)];
          const botRef = doc(db, "rooms", roomId, "players", botId);
          const botData = {
            id: botId,
            user_id: botId,
            name: `${botName} (Bot)`,
            avatar: botAvatar,
            role: "Villager",
            is_alive: true,
            has_acted: false,
            is_host: false,
            vote: "",
            is_bot: true
          };
          await setDoc(botRef, botData);
          realPlayers.push(botData);
        }
      } else {
        if (realPlayers.length < 4) {
          return res.status(400).json({ error: "Minimal membutuhkan 4 pemain untuk mulai!" });
        }
      }

      // Assign Roles
      let finalAssignments: { [playerId: string]: string } = {};

      if (isSolo) {
        // Boost user experience in Solo: User has an EQUAL 1/5 (20%) chance of being any of the 5 roles!
        // Roles: Werewolf, Doctor, Seer, Hunter, Villager
        const humanPlayer = realPlayers.find(p => !p.is_bot);
        if (humanPlayer) {
          const possibleRoles = ["Werewolf", "Doctor", "Seer", "Hunter", "Villager"];
          const humanRole = possibleRoles[Math.floor(Math.random() * possibleRoles.length)];
          finalAssignments[humanPlayer.id] = humanRole;

          // Now determine the counts of remaining roles for the 7 bots to maintain exactly:
          // 2 Werewolf, 1 Doctor, 1 Seer, 1 Hunter, 3 Villager
          let remainingRoles = ["Werewolf", "Doctor", "Seer", "Hunter", "Villager", "Villager", "Villager", "Werewolf"];
          const roleIndex = remainingRoles.indexOf(humanRole);
          if (roleIndex !== -1) {
            remainingRoles.splice(roleIndex, 1);
          }

          // Unbiased Fisher-Yates shuffle of the bots' roles
          for (let i = remainingRoles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = remainingRoles[i];
            remainingRoles[i] = remainingRoles[j];
            remainingRoles[j] = temp;
          }

          const bots = realPlayers.filter(p => p.is_bot);
          bots.forEach((bot, idx) => {
            finalAssignments[bot.id] = remainingRoles[idx] || "Villager";
          });
        }
      } else {
        // Multiplayer: Standard unbiased Fisher-Yates shuffle & distribute
        const shuffledIndices = [...realPlayers];
        for (let i = shuffledIndices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = shuffledIndices[i];
          shuffledIndices[i] = shuffledIndices[j];
          shuffledIndices[j] = temp;
        }

        const total = shuffledIndices.length;
        let wolfCount = total >= 7 ? 2 : 1;
        let docCount = total >= 3 ? 1 : 0;
        let seerCount = total >= 4 ? 1 : 0;
        let hunterCount = total >= 5 ? 1 : 0;

        shuffledIndices.forEach((p, idx) => {
          let assignedRole = "Villager";
          if (idx < wolfCount) {
            assignedRole = "Werewolf";
          } else if (idx < wolfCount + docCount) {
            assignedRole = "Doctor";
          } else if (idx < wolfCount + docCount + seerCount) {
            assignedRole = "Seer";
          } else if (idx < wolfCount + docCount + seerCount + hunterCount) {
            assignedRole = "Hunter";
          }
          finalAssignments[p.id] = assignedRole;
        });
      }

      await runTransaction(db, async (transaction) => {
        realPlayers.forEach((p) => {
          const assignedRole = finalAssignments[p.id] || "Villager";
          const playerDocRef = doc(db, "rooms", roomId, "players", p.id);
          transaction.update(playerDocRef, { role: assignedRole });
        });

        transaction.update(roomRef, {
          game_status: "role_reveal",
          game_mode: isSolo ? "solo" : "multi",
          day_number: 1,
          selected_kill: null,
          protected_player: null,
          winner: null,
          updatedAt: new Date().toISOString()
        });
      });

      // Log system start
      const logRef = doc(collection(db, "rooms", roomId, "logs"));
      await setDoc(logRef, {
        sender: "Sistem",
        text: "Peta perang telah dibagikan. Peran Anda telah ditentukan secara rahasia!",
        type: "log",
        createdAt: new Date().toISOString()
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Start game error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Reveal Confirm (transitions to night phase)
  app.post("/api/game/reveal-confirm", authMiddleware, async (req, res) => {
    try {
      const { roomId } = req.body;
      const roomRef = doc(db, "rooms", roomId);
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists()) return res.status(404).json({ error: "Room tidak ditemukan" });

      // Host triggers transition
      await updateDoc(roomRef, {
        game_status: "night",
        selected_kill: null,
        protected_player: null,
        updatedAt: new Date().toISOString()
      });

      const playersRef = collection(db, "rooms", roomId, "players");
      const playersSnap = await getDocs(playersRef);
      for (const pDoc of playersSnap.docs) {
        await updateDoc(doc(db, "rooms", roomId, "players", pDoc.id), {
          has_acted: false,
          vote: ""
        });
      }

      const logRef = doc(collection(db, "rooms", roomId, "logs"));
      await setDoc(logRef, {
        sender: "Sistem",
        text: "Malam pertama dimulai. Seluruh desa tidur lelap dalam kesunyian...",
        type: "log",
        createdAt: new Date().toISOString()
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Player action during NIGHT Phase (does NOT resolve instantly!)
  app.post("/api/game/action", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { roomId, targetPlayerId } = req.body;
      const user = req.user!;

      const roomRef = doc(db, "rooms", roomId);
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists()) return res.status(404).json({ error: "Room tidak ditemukan" });
      const roomData = roomSnap.data();

      if (roomData.game_status !== "night") {
        return res.status(400).json({ error: "Aksi malam hanya bisa dilakukan pada malam hari!" });
      }

      const playerRef = doc(db, "rooms", roomId, "players", user.userId);
      const playerSnap = await getDoc(playerRef);
      if (!playerSnap.exists()) return res.status(404).json({ error: "Anda bukan pemain di desa ini" });
      const playerData = playerSnap.data();

      if (!playerData.is_alive) {
        return res.status(400).json({ error: "Anda telah mati dan tidak dapat beraksi!" });
      }

      if (playerData.has_acted) {
        return res.status(400).json({ error: "Anda sudah melakukan aksi malam ini!" });
      }

      // Read role from DB (Never trust client send of role!)
      const role = playerData.role;
      let insight = null;

      if (role === "Werewolf") {
        if (targetPlayerId !== "sleep") {
          await updateDoc(roomRef, { selected_kill: targetPlayerId });
        }
      } else if (role === "Doctor") {
        if (targetPlayerId !== "sleep") {
          await updateDoc(roomRef, { protected_player: targetPlayerId });
        }
      } else if (role === "Seer") {
        if (targetPlayerId !== "sleep") {
          // Seer inspects target. Read target's role from database
          const targetRef = doc(db, "rooms", roomId, "players", targetPlayerId);
          const targetSnap = await getDoc(targetRef);
          if (targetSnap.exists()) {
            insight = targetSnap.data().role;
          } else {
            return res.status(404).json({ error: "Kandidat ramalan tidak ditemukan" });
          }
        }
      } else if (role === "Villager" || role === "Hunter") {
        // Villager and Hunter just sleep, they have no target action at night
      } else {
        return res.status(400).json({ error: "Peran tidak valid" });
      }

      // Mark player as acted
      await updateDoc(playerRef, { has_acted: true });

      // If game is in Solo mode, let's auto-simulate Bot Actions right after player behaves!
      if (roomData.game_mode === "solo") {
        const playersRef = collection(db, "rooms", roomId, "players");
        const playersSnap = await getDocs(playersRef);
        const allPlayers = playersSnap.docs.map((d) => d.data());
        const alivePlayers = allPlayers.filter((p) => p.is_alive);

        // Doctor bot action (only if human is not Doctor, or human already protected or skipped)
        const doctorBot = alivePlayers.find((p) => p.is_bot && p.role === "Doctor" && !p.has_acted);
        if (doctorBot && role !== "Doctor") {
          const protectTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
          await updateDoc(roomRef, { protected_player: protectTarget.id });
          await updateDoc(doc(db, "rooms", roomId, "players", doctorBot.id), { has_acted: true });
        }

        // Werewolf bot action (only if human is not Werewolf, as human handles Werewolf team action)
        const werewolfBot = alivePlayers.find((p) => p.is_bot && p.role === "Werewolf" && !p.has_acted);
        if (werewolfBot && role !== "Werewolf") {
          const nonWolves = alivePlayers.filter((p) => p.role !== "Werewolf");
          if (nonWolves.length > 0) {
            const killTarget = nonWolves[Math.floor(Math.random() * nonWolves.length)];
            await updateDoc(roomRef, { selected_kill: killTarget.id });
          }
          await updateDoc(doc(db, "rooms", roomId, "players", werewolfBot.id), { has_acted: true });
        }

        // Seer bot action (only if human is not Seer)
        const seerBot = alivePlayers.find((p) => p.is_bot && p.role === "Seer" && !p.has_acted);
        if (seerBot && role !== "Seer") {
          await updateDoc(doc(db, "rooms", roomId, "players", seerBot.id), { has_acted: true });
        }

        // Auto transition room state to "resolve" phase directly in Solo mode because human has completed their role check!
        await updateDoc(roomRef, { 
          game_status: "resolve",
          updatedAt: new Date().toISOString()
        });
      }

      res.json({ success: true, insight, has_acted: true });
    } catch (error: any) {
      console.error("Action submit error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Resolve night phase
  app.post("/api/game/resolve", authMiddleware, async (req, res) => {
    try {
      const { roomId } = req.body;
      const roomRef = doc(db, "rooms", roomId);
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists()) return res.status(404).json({ error: "Room tidak ditemukan" });
      const roomData = roomSnap.data();

      // Retrieve players to perform bot simulation fallback if any bot hasn't acted yet
      const playersRef = collection(db, "rooms", roomId, "players");
      const playersSnap = await getDocs(playersRef);
      const currentPlayers = playersSnap.docs.map((d) => d.data());
      const alivePlayers = currentPlayers.filter((p) => p.is_alive);

      let currentSelectedKill = roomData.selected_kill;
      let currentProtectedPlayer = roomData.protected_player;

      // Simulate Bot Actions if they haven't acted yet
      const doctorBot = alivePlayers.find((p) => p.is_bot && p.role === "Doctor" && !p.has_acted);
      if (doctorBot) {
        const protectTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        currentProtectedPlayer = protectTarget.id;
        await updateDoc(roomRef, { protected_player: currentProtectedPlayer });
        await updateDoc(doc(db, "rooms", roomId, "players", doctorBot.id), { has_acted: true });
      }

      const werewolfBot = alivePlayers.find((p) => p.is_bot && p.role === "Werewolf" && !p.has_acted);
      if (werewolfBot && !currentSelectedKill) {
        const nonWolves = alivePlayers.filter((p) => p.role !== "Werewolf");
        if (nonWolves.length > 0) {
          const killTarget = nonWolves[Math.floor(Math.random() * nonWolves.length)];
          currentSelectedKill = killTarget.id;
          await updateDoc(roomRef, { selected_kill: currentSelectedKill });
        }
        await updateDoc(doc(db, "rooms", roomId, "players", werewolfBot.id), { has_acted: true });
      }

      const seerBot = alivePlayers.find((p) => p.is_bot && p.role === "Seer" && !p.has_acted);
      if (seerBot) {
        await updateDoc(doc(db, "rooms", roomId, "players", seerBot.id), { has_acted: true });
      }

      // Resolve core logic
      const selectedKill = currentSelectedKill;
      const protectedPlayer = currentProtectedPlayer;

      console.log(`Resolving Room ${roomId}: selectedKill=${selectedKill}, protectedPlayer=${protectedPlayer}`);

      let killedPlayerName = null;
      let hunterShotMsg = "";

      if (selectedKill && selectedKill !== protectedPlayer) {
        const victimRef = doc(db, "rooms", roomId, "players", selectedKill);
        const victimSnap = await getDoc(victimRef);
        if (victimSnap.exists()) {
          const victimData = victimSnap.data();
          killedPlayerName = victimData.name;
          await updateDoc(victimRef, { is_alive: false });

          // HUNTER DEATH SHOT
          if (victimData.role === "Hunter" && victimData.is_alive) {
            // Find targets: choose a random alive Werewolf if exists, else random other alive player
            const aliveWolves = alivePlayers.filter((p) => p.is_alive && p.id !== selectedKill && p.role === "Werewolf");
            const otherAlive = alivePlayers.filter((p) => p.is_alive && p.id !== selectedKill && p.role !== "Hunter");
            
            let shotTarget = null;
            if (aliveWolves.length > 0) {
              shotTarget = aliveWolves[Math.floor(Math.random() * aliveWolves.length)];
            } else if (otherAlive.length > 0) {
              shotTarget = otherAlive[Math.floor(Math.random() * otherAlive.length)];
            }

            if (shotTarget) {
              await updateDoc(doc(db, "rooms", roomId, "players", shotTarget.id), { is_alive: false });
              hunterShotMsg = `🎯 TEMBAKAN REAKSI HUNTER: Hunter ${killedPlayerName} sebelum mengembuskan nafas terakhir melepas tembakan maut ke ${shotTarget.name} (${shotTarget.role}) hingga tewas seketika!`;
            }
          }
        }
      }

      // Format log announcer message
      let logMsg = "";
      if (killedPlayerName) {
        logMsg = `💀 Kabar Duka: ${killedPlayerName} ditemukan tidak bernyawa pagi ini. Suara kokok ayam menemani air mata warga desa!`;
      } else {
        logMsg = `☀️ Kabar Baik: Fajar tiba dan seluruh desa terbangun lengkap terhindar dari cakar Werewolf!`;
      }

      const logRef = doc(collection(db, "rooms", roomId, "logs"));
      await setDoc(logRef, {
        sender: "Sistem",
        text: logMsg,
        type: "log",
        createdAt: new Date().toISOString()
      });

      if (hunterShotMsg) {
        const hunterLogRef = doc(collection(db, "rooms", roomId, "logs"));
        await setDoc(hunterLogRef, {
          sender: "Sistem",
          text: hunterShotMsg,
          type: "log",
          createdAt: new Date(Date.now() + 500).toISOString()
        });
      }

      // Clear targets & Reset has_acted for next stages
      await updateDoc(roomRef, {
        selected_kill: null,
        protected_player: null
      });

      const latestPlayersSnap = await getDocs(playersRef);
      const latestCurrentPlayers = latestPlayersSnap.docs.map((d) => d.data());

      // Reset all acting states
      for (const p of latestCurrentPlayers) {
        await updateDoc(doc(db, "rooms", roomId, "players", p.id), {
          has_acted: false,
          vote: ""
        });
      }

      // Check win condition
      const targetAlivePlayers = latestCurrentPlayers.filter((p) => p.is_alive);
      const wolfCount = targetAlivePlayers.filter((p) => p.role === "Werewolf").length;
      const villagerCount = targetAlivePlayers.filter((p) => p.role !== "Werewolf").length;

      if (wolfCount === 0) {
        await updateDoc(roomRef, {
          game_status: "end_game",
          winner: "VILLAGERS",
          updatedAt: new Date().toISOString()
        });
        const endLogRef = doc(collection(db, "rooms", roomId, "logs"));
        await setDoc(endLogRef, {
          sender: "Sistem",
          text: "🏆 Seluruh Werewolf telah terbunuh! Keadilan desa tegak, Warga Desa MENANG!",
          type: "log",
          createdAt: new Date().toISOString()
        });
      } else if (wolfCount >= villagerCount) {
        await updateDoc(roomRef, {
          game_status: "end_game",
          winner: "WEREWOLVES",
          updatedAt: new Date().toISOString()
        });
        const endLogRef = doc(collection(db, "rooms", roomId, "logs"));
        await setDoc(endLogRef, {
          sender: "Sistem",
          text: "🏆 Jumlah Werewolf telah menyamakan jumlah warga! Desa Wolfy jatuh, Werewolf MENANG!",
          type: "log",
          createdAt: new Date().toISOString()
        });
      } else {
        await updateDoc(roomRef, {
          game_status: "morning",
          updatedAt: new Date().toISOString()
        });

        // Trigger bot chatter/reactions when morning starts
        const aliveBots = currentPlayers.filter((p) => p.is_bot && p.is_alive && p.id !== selectedKill);
        if (aliveBots.length > 0) {
          const numMorningComments = Math.min(aliveBots.length, Math.random() > 0.5 ? 2 : 1);
          const morningSelectedBots = aliveBots.sort(() => Math.random() - 0.5).slice(0, numMorningComments);
          const morningBotQuotes = [
            "Astagafirullah! Baru sadar ada korban pagi ini! 😱",
            "Ya ampun... kejam banget silumannya. Siapa pelakunya??",
            "Malam tadi sangat bising, aku ketakutan setengah mati.",
            "Dokter tidur ya semalam? Kenapa bisa kecolongan gini...",
            "Kita harus segera cari petunjuk sebelum malam berikutnya tiba!",
            "Semoga Penerawang punya info berguna pagi ini.",
            "Semoga arwah warga desa yang tiada tenang di sana..."
          ];
          for (let i = 0; i < morningSelectedBots.length; i++) {
            const bot = morningSelectedBots[i];
            const quote = morningBotQuotes[Math.floor(Math.random() * morningBotQuotes.length)];
            const botMorningRef = doc(collection(db, "rooms", roomId, "logs"));
            await setDoc(botMorningRef, {
              sender: bot.name,
              text: quote,
              type: "chat",
              createdAt: new Date(Date.now() + (i + 1) * 600).toISOString()
            });
          }
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Resolve error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Morning confirm (transitions to voting)
  app.post("/api/game/morning-confirm", authMiddleware, async (req, res) => {
    try {
      const { roomId } = req.body;
      const roomRef = doc(db, "rooms", roomId);
      await updateDoc(roomRef, {
        game_status: "voting",
        updatedAt: new Date().toISOString()
      });

      const logRef = doc(collection(db, "rooms", roomId, "logs"));
      await setDoc(logRef, {
        sender: "Sistem",
        text: "🗣️ Waktu Musyawarah & Voting: Diskusikan dan pilih siapa tersangka siluman di balik bencana gantung!",
        type: "log",
        createdAt: new Date().toISOString()
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Submit Vote inside voting phase
  app.post("/api/game/vote", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { roomId, targetPlayerId } = req.body;
      const user = req.user!;

      const roomRef = doc(db, "rooms", roomId);
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists()) return res.status(404).json({ error: "Room tidak ditemukan" });
      const roomData = roomSnap.data();

      if (roomData.game_status !== "voting") {
        return res.status(400).json({ error: "Voting hanya dapat dilakukan pada fase voting desa!" });
      }

      const playerRef = doc(db, "rooms", roomId, "players", user.userId);
      const playerSnap = await getDoc(playerRef);
      if (!playerSnap.exists()) return res.status(404).json({ error: "Pemain tidak ditemukan" });
      const playerData = playerSnap.data();

      if (!playerData.is_alive) {
        return res.status(400).json({ error: "Anda sudah mati dan tidak dapat memilih." });
      }

      await updateDoc(playerRef, {
        vote: targetPlayerId,
        has_acted: true
      });

      // Show vote trace
      const targetRef = doc(db, "rooms", roomId, "players", targetPlayerId);
      const targetSnap = await getDoc(targetRef);
      const targetName = targetSnap.exists() ? targetSnap.data().name : "Seseorang";

      const logRef = doc(collection(db, "rooms", roomId, "logs"));
      await setDoc(logRef, {
        sender: "Pengadilan Desa",
        text: `⚖️ ${user.username} memilih untuk menggantung ${targetName}`,
        type: "log",
        createdAt: new Date().toISOString()
      });

      // If game is in Solo mode, let's resolve BOT votes immediately to have real-time results without blocking
      if (roomData.game_mode === "solo") {
        const playersRef = collection(db, "rooms", roomId, "players");
        const playersSnap = await getDocs(playersRef);
        const alivePlayers = playersSnap.docs.map((d) => d.data()).filter((p) => p.is_alive);

        const botComments: { botName: string; targetName: string }[] = [];

        for (const bot of alivePlayers) {
          if (bot.is_bot) {
            // bot selects a random other target
            const potentialTargets = alivePlayers.filter((p) => p.id !== bot.id);
            if (potentialTargets.length > 0) {
              const randomTarget = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
              await updateDoc(doc(db, "rooms", roomId, "players", bot.id), {
                vote: randomTarget.id,
                has_acted: true
              });
              botComments.push({
                botName: bot.name,
                targetName: randomTarget.name
              });
            }
          }
        }

        // Post chat messages representing bot thoughts for up to 3 random voting bots
        const activeBots = botComments.sort(() => Math.random() - 0.5).slice(0, 3);
        const botQuotes = [
          "Saya rasa silumannya adalah {target}! Tatapan matanya sangat dingin semalam.",
          "Menurut instingku, kita harus menggantung {target}.",
          "Ayo hukum {target}! Dia terlalu mencurigakan dan banyak berkelit.",
          "Kita butuh keadilan desa! Saya menunjuk {target}.",
          "{target} bertingkah ganjil belakangan ini. Mari kita selidiki!",
          "Suaraku kupersembahkan untuk mencurigai {target}."
        ];

        for (let i = 0; i < activeBots.length; i++) {
          const { botName, targetName } = activeBots[i];
          const rawQuote = botQuotes[Math.floor(Math.random() * botQuotes.length)];
          const quoteText = rawQuote.replace("{target}", targetName);

          const botLogRef = doc(collection(db, "rooms", roomId, "logs"));
          await setDoc(botLogRef, {
            sender: botName,
            text: quoteText,
            type: "chat",
            createdAt: new Date(Date.now() + (i + 1) * 200).toISOString()
          });
        }

        // Instantly invoke vote-resolve in background or directly
        await updateDoc(roomRef, { game_status: "morning" }); // transition state placeholder or let it resolve
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Resolve voting phase (host or automatically triggered)
  app.post("/api/game/resolve-voting", authMiddleware, async (req, res) => {
    try {
      const { roomId } = req.body;
      const roomRef = doc(db, "rooms", roomId);
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists()) return res.status(404).json({ error: "Room tidak ditemukan" });
      const roomData = roomSnap.data();

      const playersRef = collection(db, "rooms", roomId, "players");
      const playersSnap = await getDocs(playersRef);
      const currentPlayers = playersSnap.docs.map((d) => d.data());
      const alivePlayers = currentPlayers.filter((p) => p.is_alive);

      // Tally votes
      const voteMap: { [key: string]: number } = {};
      alivePlayers.forEach((p) => {
        if (p.vote) {
          voteMap[p.vote] = (voteMap[p.vote] || 0) + 1;
        }
      });

      let maxVotes = 0;
      let executedId = null;
      let isTie = false;

      Object.entries(voteMap).forEach(([id, count]) => {
        if (count > maxVotes) {
          maxVotes = count;
          executedId = id;
          isTie = false;
        } else if (count === maxVotes) {
          isTie = true;
        }
      });

      console.log(`Voting tallies for ${roomId}:`, voteMap, "Executed:", executedId, "Tie:", isTie);

      let executedName = null;
      let executedRole = null;
      let hunterShotMsg = "";

      if (executedId && !isTie) {
        const targetRef = doc(db, "rooms", roomId, "players", executedId);
        const targetSnap = await getDoc(targetRef);
        if (targetSnap.exists()) {
          const executedData = targetSnap.data();
          executedName = executedData.name;
          executedRole = executedData.role;
          await updateDoc(targetRef, { is_alive: false });

          // HUNTER DEATH SHOT
          if (executedRole === "Hunter" && executedData.is_alive) {
            const aliveWolves = alivePlayers.filter((p) => p.id !== executedId && p.role === "Werewolf");
            const otherAlive = alivePlayers.filter((p) => p.id !== executedId && p.role !== "Hunter");
            
            let shotTarget = null;
            if (aliveWolves.length > 0) {
              shotTarget = aliveWolves[Math.floor(Math.random() * aliveWolves.length)];
            } else if (otherAlive.length > 0) {
              shotTarget = otherAlive[Math.floor(Math.random() * otherAlive.length)];
            }

            if (shotTarget) {
              await updateDoc(doc(db, "rooms", roomId, "players", shotTarget.id), { is_alive: false });
              hunterShotMsg = `🎯 TEMBAKAN REAKSI HUNTER: Hunter ${executedName} sebelum digantung melepaskan tembakan balas dendam terakhir ke dada ${shotTarget.name} (${shotTarget.role}) dengan senapan pemburunya!`;
            }
          }
        }
      }

      // Add log
      let resultMsg = "";
      if (executedName) {
        resultMsg = `⚖️ KEPUTUSAN HAKIM DESA: Mayoritas menunjuk ${executedName}. Ia digantung di tengah alun-alun desa! Peran aslinya adalah: *${executedRole}*.`;
      } else {
        resultMsg = `⚖️ KEPUTUSAN HAKIM DESA: Voting berakhir seri atau tidak ada suara mayoritas! Algojo pulang tanpa nyawa melayang hari ini.`;
      }

      const logRef = doc(collection(db, "rooms", roomId, "logs"));
      await setDoc(logRef, {
        sender: "Sistem",
        text: resultMsg,
        type: "log",
        createdAt: new Date().toISOString()
      });

      if (hunterShotMsg) {
        const hunterLogRef = doc(collection(db, "rooms", roomId, "logs"));
        await setDoc(hunterLogRef, {
          sender: "Sistem",
          text: hunterShotMsg,
          type: "log",
          createdAt: new Date(Date.now() + 500).toISOString()
        });
      }

      // Clear player votes for next rounds
      for (const p of currentPlayers) {
        await updateDoc(doc(db, "rooms", roomId, "players", p.id), {
          vote: "",
          has_acted: false
        });
      }

      // Refresh check win conditions
      const freshPlayersSnap = await getDocs(collection(db, "rooms", roomId, "players"));
      const freshPlayers = freshPlayersSnap.docs.map((d) => d.data());
      const freshAlive = freshPlayers.filter((p) => p.is_alive);

      const wolfCount = freshAlive.filter((p) => p.role === "Werewolf").length;
      const villagerCount = freshAlive.filter((p) => p.role !== "Werewolf").length;

      if (wolfCount === 0) {
        await updateDoc(roomRef, {
          game_status: "end_game",
          winner: "VILLAGERS",
          updatedAt: new Date().toISOString()
        });
        const endLogRef = doc(collection(db, "rooms", roomId, "logs"));
        await setDoc(endLogRef, {
          sender: "Sistem",
          text: "🏆 Seluruh Werewolf telah terasimilasi! Keadilan desa ditegakkan, Warga Desa MENANG!",
          type: "log",
          createdAt: new Date().toISOString()
        });
      } else if (wolfCount >= villagerCount) {
        await updateDoc(roomRef, {
          game_status: "end_game",
          winner: "WEREWOLVES",
          updatedAt: new Date().toISOString()
        });
        const endLogRef = doc(collection(db, "rooms", roomId, "logs"));
        await setDoc(endLogRef, {
          sender: "Sistem",
          text: "🏆 Jumlah Werewolf berhasil menyamai warga yang tersisa! Desa runtuh sepenuhnya, Werewolf MENANG!",
          type: "log",
          createdAt: new Date().toISOString()
        });
      } else {
        // Next day begins (loops back to night)
        await updateDoc(roomRef, {
          game_status: "night",
          day_number: roomData.day_number + 1,
          updatedAt: new Date().toISOString()
        });

        const nextLogRef = doc(collection(db, "rooms", roomId, "logs"));
        await setDoc(nextLogRef, {
          sender: "Sistem",
          text: `🌃 Hari ke-${roomData.day_number + 1} dimulai... Semburat fajar tenggelam, seisi desa tertidur mawas diri.`,
          type: "log",
          createdAt: new Date().toISOString()
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Resolve voting error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Restart game back to lobby
  app.post("/api/game/restart", authMiddleware, async (req, res) => {
    try {
      const { roomId } = req.body;
      const roomRef = doc(db, "rooms", roomId);
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists()) return res.status(404).json({ error: "Room tidak ditemukan" });

      await updateDoc(roomRef, {
        game_status: "waiting",
        selected_kill: null,
        protected_player: null,
        day_number: 1,
        winner: null,
        updatedAt: new Date().toISOString()
      });

      // Clear non-bots or bots entirely? Usually we just keep the players and clean roles
      const isSolo = roomSnap.data()?.game_mode === "solo";
      const playersRef = collection(db, "rooms", roomId, "players");
      const playersSnap = await getDocs(playersRef);
      for (const pDoc of playersSnap.docs) {
        const pData = pDoc.data();
        if (pData.is_bot && !isSolo) {
          // delete bots to allow fresh start in multiplayer
          await deleteDoc(doc(db, "rooms", roomId, "players", pDoc.id));
        } else {
          // Reset real player & bot roles/status
          await updateDoc(doc(db, "rooms", roomId, "players", pDoc.id), {
            role: "Villager",
            is_alive: true,
            has_acted: false,
            vote: ""
          });
        }
      }

      const logRef = doc(collection(db, "rooms", roomId, "logs"));
      await setDoc(logRef, {
        sender: "Sistem",
        text: `Room disetel ulang kembali ke lobby oleh Host!`,
        type: "log",
        createdAt: new Date().toISOString()
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Chat message send (fully custom & robust with dynamic AI bot responses)
  app.post("/api/game/chat", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { roomId, text } = req.body;
      const user = req.user!;

      // Save user message first
      const logRef = doc(collection(db, "rooms", roomId, "logs"));
      await setDoc(logRef, {
        sender: user.username,
        text,
        type: "chat",
        createdAt: new Date().toISOString()
      });

      // Get room state and player list to see if we can trigger bot conversations
      const roomSnap = await getDoc(doc(db, "rooms", roomId));
      if (roomSnap.exists()) {
        const roomData = roomSnap.data();
        const gameStatus = roomData.game_status || "waiting";

        const playersSnap = await getDocs(collection(db, "rooms", roomId, "players"));
        const aliveBots = playersSnap.docs
          .map((d) => d.data())
          .filter((p) => p.is_bot && p.is_alive);

        if (aliveBots.length > 0) {
          // Determine if 1 or 2 bots will chime in
          const numReplies = Math.random() > 0.6 ? 2 : 1;
          const selectedBots = aliveBots.sort(() => Math.random() - 0.5).slice(0, numReplies);

          const lowerText = text.toLowerCase();
          
          for (let i = 0; i < selectedBots.length; i++) {
            const bot = selectedBots[i];
            let replyText = "";

            // Custom conversational logic for bots
            if (lowerText.includes("siapa") || lowerText.includes("serigala") || lowerText.includes("werewolf") || lowerText.includes("wolf")) {
              const responses = [
                `Loh, jangan-jangan kamu sendiri serigalanya? 🤔`,
                `Aku curiga sama salah satu dari kita, tapi butuh bukti lebih banyak.`,
                `Sumpah, aku warga desa murni! Jangan tuduh aku ya.`,
                `Serigala pasti berkeliaran semalam dan sekarang pura-pura polos! 🐺`,
                `Pasti serigalanya pinter memutarbalikkan fakta.`
              ];
              replyText = responses[Math.floor(Math.random() * responses.length)];
            } else if (lowerText.includes("halo") || lowerText.includes("hi") || lowerText.includes("p") || lowerText.includes("woy") || lowerText.includes("pagi")) {
              const responses = [
                `Halo ${user.username}! Semoga hari ini membawa kedamaian untuk desa kita.`,
                `Hai! Mari berdiskusi dengan kepala dingin.`,
                `Woy, fokus cari siluman serigala yuk!`,
                `Ada apa nih? Jangan panik, kita cari petunjuk bersama.`
              ];
              replyText = responses[Math.floor(Math.random() * responses.length)];
            } else if (lowerText.includes("dokter") || lowerText.includes("doctor") || lowerText.includes("obat") || lowerText.includes("seer") || lowerText.includes("terawang") || lowerText.includes("penerawang")) {
              const responses = [
                `Betul! Penerawang harus memberikan info jika sudah menerawang seseorang.`,
                `Semoga Dokter bisa memilih orang yang tepat untuk dilindungi nanti malam.`,
                `Jangan sampai peran penting kita tereliminasi di awal-awal game.`,
                `Penerawang, tolong berikan petunjuk sembunyi-sembunyi agar tidak diincar serigala!`
              ];
              replyText = responses[Math.floor(Math.random() * responses.length)];
            } else if (lowerText.includes("bunuh") || lowerText.includes("gantung") || lowerText.includes("eliminasi") || lowerText.includes("voting")) {
              const responses = [
                `Kita harus hati-hati dalam voting, salah pilih bisa merugikan kita sendiri!`,
                `Mari kita sepakati satu nama yang paling mencurigakan malam tadi.`,
                `Gantung saja yang banyak diam dan tidak aktif berkontribusi! 😤`,
                `Betul, keadilan harus ditegakkan demi kedamaian desa!`
              ];
              replyText = responses[Math.floor(Math.random() * responses.length)];
            } else {
              // Contextual reply based on Game Status
              if (gameStatus === "waiting") {
                const responses = [
                  `Ayo kumpul-kumpul! Siap-siap dapet peran apa ya.`,
                  `Semoga dapet peran Werewolf biar seru, eh bercanda deng! 😜`,
                  `Host, tolong mulai gamenya dong biar makin seru!`,
                  `Halo semua, selamat bermain! Semangat bela desa.`
                ];
                replyText = responses[Math.floor(Math.random() * responses.length)];
              } else if (gameStatus === "role_reveal") {
                const responses = [
                  `Wah, melihat pembagian kartu tadi bikin merinding.`,
                  `Kubasuh wajahku, kuharap peranku berpihak pada kebenaran.`,
                  `Sssttt... jangan ada yang membocorkan peran masing-masing ya.`
                ];
                replyText = responses[Math.floor(Math.random() * responses.length)];
              } else if (gameStatus === "night") {
                const responses = [
                  `Malam ini terasa dingin mencekam...`,
                  `Semoga malam ini tidak ada korban berjatuhan.`,
                  `Semua warga desa diharap matikan lampu dan tidur nyenyak! 🌙`,
                  `Serigala berkeliaran, berdoalah agar kita selamat.`
                ];
                replyText = responses[Math.floor(Math.random() * responses.length)];
              } else if (gameStatus === "morning") {
                const responses = [
                  `Aduh kasihan sekali... fajar menyingsing dengan kabar duka.`,
                  `Bagaimana ini? Siapa yang mau kita investigasi pertama?`,
                  `Ayo diskusikan gerak-gerik mencurigakan semalam!`,
                  `Aku sempat mendengar suara bising di dekat rumah sebelah kiri.`
                ];
                replyText = responses[Math.floor(Math.random() * responses.length)];
              } else if (gameStatus === "voting") {
                const responses = [
                  `Jangan ragu, suaraku akan kubulatkan untuk tersangka utama!`,
                  `Ayo semuanya berikan suara agar tidak terjadi seri.`,
                  `Kuikuti naluri mayoritas, demi keselamatan bersama!`,
                  `Apakah kita yakin dia pelakunya? Jangan sampai salah gantung!`
                ];
                replyText = responses[Math.floor(Math.random() * responses.length)];
              } else {
                const responses = [
                  `Pasti ada sesuatu yang terlewat dari tadi...`,
                  `Setuju banget sama diskusinya!`,
                  `Menarik sekali polanya. Mari dengarkan pendapat yang lain.`,
                  `Menurutku ada yang sedang pura-pura aktif di chat ini. 👀`
                ];
                replyText = responses[Math.floor(Math.random() * responses.length)];
              }
            }

            // Create bot chat log with a slight time delay simulation
            const botLogRef = doc(collection(db, "rooms", roomId, "logs"));
            await setDoc(botLogRef, {
              sender: bot.name,
              text: replyText,
              type: "chat",
              createdAt: new Date(Date.now() + (i + 1) * 800).toISOString()
            });
          }
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
