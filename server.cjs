var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_app = require("firebase/app");
var import_firestore = require("firebase/firestore");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_node_crypto = __toESM(require("node:crypto"), 1);

// firebase-applet-config.json
var firebase_applet_config_default = {
  projectId: "project-718c37a0-ae88-403f-9e4",
  appId: "1:949088092915:web:b653628948637b1f792d86",
  apiKey: "AIzaSyD_8SwmYQHhMjvrYlhJZVK26m1cHAHr3Yo",
  authDomain: "project-718c37a0-ae88-403f-9e4.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-bd116a93-5373-4074-84cb-43047a56a9fa",
  storageBucket: "project-718c37a0-ae88-403f-9e4.firebasestorage.app",
  messagingSenderId: "949088092915",
  measurementId: ""
};

// server.ts
import_dotenv.default.config();
var firebaseApp = (0, import_app.initializeApp)(firebase_applet_config_default);
var db = (0, import_firestore.getFirestore)(firebaseApp, firebase_applet_config_default.firestoreDatabaseId);
var JWT_SECRET = process.env.JWT_SECRET || "wolfy_twilight_secrets_987654321";
function hashPassword(password) {
  return import_node_crypto.default.pbkdf2Sync(password, JWT_SECRET, 1e3, 64, "sha512").toString("hex");
}
function generateToken(userId) {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1e3;
  const payload = `${userId}:${expiresAt}`;
  const signature = import_node_crypto.default.createHmac("sha256", JWT_SECRET).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64")}.${signature}`;
}
function verifyToken(token) {
  try {
    const [payloadBase64, signature] = token.split(".");
    if (!payloadBase64 || !signature) return null;
    const payload = Buffer.from(payloadBase64, "base64").toString("utf-8");
    const [userId, expiresAtStr] = payload.split(":");
    const expiresAt = parseInt(expiresAtStr, 10);
    if (Date.now() > expiresAt) return null;
    const expectedSignature = import_node_crypto.default.createHmac("sha256", JWT_SECRET).update(payload).digest("hex");
    if (signature === expectedSignature) {
      return userId;
    }
  } catch (e) {
    return null;
  }
  return null;
}
var BOT_NAMES = ["Budi", "Dewi", "Putra", "Kadek", "Wulan", "Yanto", "Lia", "Andi", "Siti", "Rangga", "Sisca"];
var BOT_AVATARS = ["wolf", "cat", "fox", "panda", "owl", "bear", "rabbit", "lion"];
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json());
  app.use((req, res, next) => {
    console.log(`[${req.method}] ${req.url}`);
    next();
  });
  const authMiddleware = async (req, res, next) => {
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
      const userSnap = await (0, import_firestore.getDoc)((0, import_firestore.doc)(db, "users", userId));
      if (!userSnap.exists()) {
        return res.status(401).json({ error: "Akun user tidak ditemukan" });
      }
      const userData = userSnap.data();
      req.user = {
        userId,
        user_id: userId,
        username: userData.username,
        email: userData.email
      };
      next();
    } catch (err) {
      return res.status(500).json({ error: "Gagal memverifikasi akun" });
    }
  };
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, email, password } = req.body;
      if (!username || !email || !password) {
        return res.status(400).json({ error: "Seluruh kolom harus diisi!" });
      }
      const emailKey = email.trim().toLowerCase();
      const usersRef = (0, import_firestore.collection)(db, "users");
      const userDocs = await (0, import_firestore.getDocs)(usersRef);
      const isExist = userDocs.docs.some((doc2) => doc2.data().email === emailKey);
      if (isExist) {
        return res.status(400).json({ error: "Email sudah terdaftar!" });
      }
      const userId = "u_" + Math.random().toString(36).substring(2, 11);
      const hashedPassword = hashPassword(password);
      const userDocRef = (0, import_firestore.doc)(db, "users", userId);
      await (0, import_firestore.setDoc)(userDocRef, {
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
    } catch (error) {
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
      const usersRef = (0, import_firestore.collection)(db, "users");
      const userDocs = await (0, import_firestore.getDocs)(usersRef);
      const userDoc = userDocs.docs.find((doc2) => doc2.data().email === emailKey);
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
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app.get("/api/auth/profile", authMiddleware, (req, res) => {
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
  app.post("/api/game/create", authMiddleware, async (req, res) => {
    try {
      const { avatarId } = req.body;
      const user = req.user;
      const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
      const roomRef = (0, import_firestore.doc)(db, "rooms", roomId);
      const playerRef = (0, import_firestore.doc)(db, "rooms", roomId, "players", user.userId);
      await (0, import_firestore.setDoc)(roomRef, {
        room_id: roomId,
        game_status: "waiting",
        selected_kill: null,
        protected_player: null,
        day_number: 1,
        winner: null,
        host_id: user.userId,
        game_mode: "solo",
        // default, will update on start
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      await (0, import_firestore.setDoc)(playerRef, {
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
      const logRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
      await (0, import_firestore.setDoc)(logRef, {
        sender: "Sistem",
        text: `Room ${roomId} telah dibuat oleh ${user.username}. Selamat datang!`,
        type: "log",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      res.status(201).json({ roomId });
    } catch (error) {
      console.error("Create room error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/game/join", authMiddleware, async (req, res) => {
    try {
      const { roomId, avatarId } = req.body;
      const user = req.user;
      if (!roomId || roomId.length !== 4) {
        return res.status(400).json({ error: "Room ID tidak valid" });
      }
      const roomRef = (0, import_firestore.doc)(db, "rooms", roomId.toUpperCase());
      const roomSnap = await (0, import_firestore.getDoc)(roomRef);
      if (!roomSnap.exists()) {
        return res.status(404).json({ error: "Room tidak ditemukan" });
      }
      const roomData = roomSnap.data();
      if (roomData.game_status !== "waiting") {
        return res.status(400).json({ error: "Game sudah dimulai atau selesai di room ini." });
      }
      const playerRef = (0, import_firestore.doc)(db, "rooms", roomId.toUpperCase(), "players", user.userId);
      await (0, import_firestore.setDoc)(playerRef, {
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
      const logRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId.toUpperCase(), "logs"));
      await (0, import_firestore.setDoc)(logRef, {
        sender: "Sistem",
        text: `${user.username} bergabung ke desa!`,
        type: "log",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      res.json({ success: true, roomId: roomId.toUpperCase() });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/game/start", authMiddleware, async (req, res) => {
    try {
      const { roomId, isSolo } = req.body;
      const user = req.user;
      const roomRef = (0, import_firestore.doc)(db, "rooms", roomId);
      const roomSnap = await (0, import_firestore.getDoc)(roomRef);
      if (!roomSnap.exists()) return res.status(404).json({ error: "Room tidak ditemukan" });
      const roomData = roomSnap.data();
      if (roomData.host_id !== user.userId) {
        return res.status(403).json({ error: "Hanya host yang bisa memulai permainan!" });
      }
      const playersRef = (0, import_firestore.collection)(db, "rooms", roomId, "players");
      const playersSnap = await (0, import_firestore.getDocs)(playersRef);
      let realPlayers = playersSnap.docs.map((d) => d.data());
      if (isSolo) {
        const targetCount = 8;
        const currentCount = realPlayers.length;
        const botsNeeded = targetCount - currentCount;
        const shuffledNames = [...BOT_NAMES].sort(() => Math.random() - 0.5);
        for (let i = 0; i < botsNeeded; i++) {
          const botId = "bot_" + Math.random().toString(36).substring(2, 11);
          const botName = shuffledNames[i % shuffledNames.length];
          const botAvatar = BOT_AVATARS[Math.floor(Math.random() * BOT_AVATARS.length)];
          const botRef = (0, import_firestore.doc)(db, "rooms", roomId, "players", botId);
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
          await (0, import_firestore.setDoc)(botRef, botData);
          realPlayers.push(botData);
        }
      } else {
        if (realPlayers.length < 4) {
          return res.status(400).json({ error: "Minimal membutuhkan 4 pemain untuk mulai!" });
        }
      }
      let finalAssignments = {};
      if (isSolo) {
        const humanPlayer = realPlayers.find((p) => !p.is_bot);
        if (humanPlayer) {
          const possibleRoles = ["Werewolf", "Doctor", "Seer", "Hunter", "Villager"];
          const humanRole = possibleRoles[Math.floor(Math.random() * possibleRoles.length)];
          finalAssignments[humanPlayer.id] = humanRole;
          let remainingRoles = ["Werewolf", "Doctor", "Seer", "Hunter", "Villager", "Villager", "Villager", "Werewolf"];
          const roleIndex = remainingRoles.indexOf(humanRole);
          if (roleIndex !== -1) {
            remainingRoles.splice(roleIndex, 1);
          }
          for (let i = remainingRoles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = remainingRoles[i];
            remainingRoles[i] = remainingRoles[j];
            remainingRoles[j] = temp;
          }
          const bots = realPlayers.filter((p) => p.is_bot);
          bots.forEach((bot, idx) => {
            finalAssignments[bot.id] = remainingRoles[idx] || "Villager";
          });
        }
      } else {
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
      await (0, import_firestore.runTransaction)(db, async (transaction) => {
        realPlayers.forEach((p) => {
          const assignedRole = finalAssignments[p.id] || "Villager";
          const playerDocRef = (0, import_firestore.doc)(db, "rooms", roomId, "players", p.id);
          transaction.update(playerDocRef, { role: assignedRole });
        });
        transaction.update(roomRef, {
          game_status: "role_reveal",
          game_mode: isSolo ? "solo" : "multi",
          day_number: 1,
          selected_kill: null,
          protected_player: null,
          winner: null,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      });
      const logRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
      await (0, import_firestore.setDoc)(logRef, {
        sender: "Sistem",
        text: "Peta perang telah dibagikan. Peran Anda telah ditentukan secara rahasia!",
        type: "log",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Start game error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/game/reveal-confirm", authMiddleware, async (req, res) => {
    try {
      const { roomId } = req.body;
      const roomRef = (0, import_firestore.doc)(db, "rooms", roomId);
      const roomSnap = await (0, import_firestore.getDoc)(roomRef);
      if (!roomSnap.exists()) return res.status(404).json({ error: "Room tidak ditemukan" });
      await (0, import_firestore.updateDoc)(roomRef, {
        game_status: "night",
        selected_kill: null,
        protected_player: null,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      const playersRef = (0, import_firestore.collection)(db, "rooms", roomId, "players");
      const playersSnap = await (0, import_firestore.getDocs)(playersRef);
      for (const pDoc of playersSnap.docs) {
        await (0, import_firestore.updateDoc)((0, import_firestore.doc)(db, "rooms", roomId, "players", pDoc.id), {
          has_acted: false,
          vote: ""
        });
      }
      const logRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
      await (0, import_firestore.setDoc)(logRef, {
        sender: "Sistem",
        text: "Malam pertama dimulai. Seluruh desa tidur lelap dalam kesunyian...",
        type: "log",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/game/action", authMiddleware, async (req, res) => {
    try {
      const { roomId, targetPlayerId } = req.body;
      const user = req.user;
      const roomRef = (0, import_firestore.doc)(db, "rooms", roomId);
      const roomSnap = await (0, import_firestore.getDoc)(roomRef);
      if (!roomSnap.exists()) return res.status(404).json({ error: "Room tidak ditemukan" });
      const roomData = roomSnap.data();
      if (roomData.game_status !== "night") {
        return res.status(400).json({ error: "Aksi malam hanya bisa dilakukan pada malam hari!" });
      }
      const playerRef = (0, import_firestore.doc)(db, "rooms", roomId, "players", user.userId);
      const playerSnap = await (0, import_firestore.getDoc)(playerRef);
      if (!playerSnap.exists()) return res.status(404).json({ error: "Anda bukan pemain di desa ini" });
      const playerData = playerSnap.data();
      if (!playerData.is_alive) {
        return res.status(400).json({ error: "Anda telah mati dan tidak dapat beraksi!" });
      }
      if (playerData.has_acted) {
        return res.status(400).json({ error: "Anda sudah melakukan aksi malam ini!" });
      }
      const role = playerData.role;
      let insight = null;
      if (role === "Werewolf") {
        if (targetPlayerId !== "sleep") {
          await (0, import_firestore.updateDoc)(roomRef, { selected_kill: targetPlayerId });
        }
      } else if (role === "Doctor") {
        if (targetPlayerId !== "sleep") {
          await (0, import_firestore.updateDoc)(roomRef, { protected_player: targetPlayerId });
        }
      } else if (role === "Seer") {
        if (targetPlayerId !== "sleep") {
          const targetRef = (0, import_firestore.doc)(db, "rooms", roomId, "players", targetPlayerId);
          const targetSnap = await (0, import_firestore.getDoc)(targetRef);
          if (targetSnap.exists()) {
            insight = targetSnap.data().role;
          } else {
            return res.status(404).json({ error: "Kandidat ramalan tidak ditemukan" });
          }
        }
      } else if (role === "Villager" || role === "Hunter") {
      } else {
        return res.status(400).json({ error: "Peran tidak valid" });
      }
      await (0, import_firestore.updateDoc)(playerRef, { has_acted: true });
      if (roomData.game_mode === "solo") {
        const playersRef = (0, import_firestore.collection)(db, "rooms", roomId, "players");
        const playersSnap = await (0, import_firestore.getDocs)(playersRef);
        const allPlayers = playersSnap.docs.map((d) => d.data());
        const alivePlayers = allPlayers.filter((p) => p.is_alive);
        const doctorBot = alivePlayers.find((p) => p.is_bot && p.role === "Doctor" && !p.has_acted);
        if (doctorBot && role !== "Doctor") {
          const protectTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
          await (0, import_firestore.updateDoc)(roomRef, { protected_player: protectTarget.id });
          await (0, import_firestore.updateDoc)((0, import_firestore.doc)(db, "rooms", roomId, "players", doctorBot.id), { has_acted: true });
        }
        const werewolfBot = alivePlayers.find((p) => p.is_bot && p.role === "Werewolf" && !p.has_acted);
        if (werewolfBot && role !== "Werewolf") {
          const nonWolves = alivePlayers.filter((p) => p.role !== "Werewolf");
          if (nonWolves.length > 0) {
            const killTarget = nonWolves[Math.floor(Math.random() * nonWolves.length)];
            await (0, import_firestore.updateDoc)(roomRef, { selected_kill: killTarget.id });
          }
          await (0, import_firestore.updateDoc)((0, import_firestore.doc)(db, "rooms", roomId, "players", werewolfBot.id), { has_acted: true });
        }
        const seerBot = alivePlayers.find((p) => p.is_bot && p.role === "Seer" && !p.has_acted);
        if (seerBot && role !== "Seer") {
          await (0, import_firestore.updateDoc)((0, import_firestore.doc)(db, "rooms", roomId, "players", seerBot.id), { has_acted: true });
        }
        await (0, import_firestore.updateDoc)(roomRef, {
          game_status: "resolve",
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      res.json({ success: true, insight, has_acted: true });
    } catch (error) {
      console.error("Action submit error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/game/resolve", authMiddleware, async (req, res) => {
    try {
      const { roomId } = req.body;
      const roomRef = (0, import_firestore.doc)(db, "rooms", roomId);
      const roomSnap = await (0, import_firestore.getDoc)(roomRef);
      if (!roomSnap.exists()) return res.status(404).json({ error: "Room tidak ditemukan" });
      const roomData = roomSnap.data();
      const playersRef = (0, import_firestore.collection)(db, "rooms", roomId, "players");
      const playersSnap = await (0, import_firestore.getDocs)(playersRef);
      const currentPlayers = playersSnap.docs.map((d) => d.data());
      const alivePlayers = currentPlayers.filter((p) => p.is_alive);
      let currentSelectedKill = roomData.selected_kill;
      let currentProtectedPlayer = roomData.protected_player;
      const doctorBot = alivePlayers.find((p) => p.is_bot && p.role === "Doctor" && !p.has_acted);
      if (doctorBot) {
        const protectTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        currentProtectedPlayer = protectTarget.id;
        await (0, import_firestore.updateDoc)(roomRef, { protected_player: currentProtectedPlayer });
        await (0, import_firestore.updateDoc)((0, import_firestore.doc)(db, "rooms", roomId, "players", doctorBot.id), { has_acted: true });
      }
      const werewolfBot = alivePlayers.find((p) => p.is_bot && p.role === "Werewolf" && !p.has_acted);
      if (werewolfBot && !currentSelectedKill) {
        const nonWolves = alivePlayers.filter((p) => p.role !== "Werewolf");
        if (nonWolves.length > 0) {
          const killTarget = nonWolves[Math.floor(Math.random() * nonWolves.length)];
          currentSelectedKill = killTarget.id;
          await (0, import_firestore.updateDoc)(roomRef, { selected_kill: currentSelectedKill });
        }
        await (0, import_firestore.updateDoc)((0, import_firestore.doc)(db, "rooms", roomId, "players", werewolfBot.id), { has_acted: true });
      }
      const seerBot = alivePlayers.find((p) => p.is_bot && p.role === "Seer" && !p.has_acted);
      if (seerBot) {
        await (0, import_firestore.updateDoc)((0, import_firestore.doc)(db, "rooms", roomId, "players", seerBot.id), { has_acted: true });
      }
      const selectedKill = currentSelectedKill;
      const protectedPlayer = currentProtectedPlayer;
      console.log(`Resolving Room ${roomId}: selectedKill=${selectedKill}, protectedPlayer=${protectedPlayer}`);
      let killedPlayerName = null;
      let hunterShotMsg = "";
      if (selectedKill && selectedKill !== protectedPlayer) {
        const victimRef = (0, import_firestore.doc)(db, "rooms", roomId, "players", selectedKill);
        const victimSnap = await (0, import_firestore.getDoc)(victimRef);
        if (victimSnap.exists()) {
          const victimData = victimSnap.data();
          killedPlayerName = victimData.name;
          await (0, import_firestore.updateDoc)(victimRef, { is_alive: false });
          if (victimData.role === "Hunter" && victimData.is_alive) {
            const aliveWolves = alivePlayers.filter((p) => p.is_alive && p.id !== selectedKill && p.role === "Werewolf");
            const otherAlive = alivePlayers.filter((p) => p.is_alive && p.id !== selectedKill && p.role !== "Hunter");
            let shotTarget = null;
            if (aliveWolves.length > 0) {
              shotTarget = aliveWolves[Math.floor(Math.random() * aliveWolves.length)];
            } else if (otherAlive.length > 0) {
              shotTarget = otherAlive[Math.floor(Math.random() * otherAlive.length)];
            }
            if (shotTarget) {
              await (0, import_firestore.updateDoc)((0, import_firestore.doc)(db, "rooms", roomId, "players", shotTarget.id), { is_alive: false });
              hunterShotMsg = `\u{1F3AF} TEMBAKAN REAKSI HUNTER: Hunter ${killedPlayerName} sebelum mengembuskan nafas terakhir melepas tembakan maut ke ${shotTarget.name} (${shotTarget.role}) hingga tewas seketika!`;
            }
          }
        }
      }
      let logMsg = "";
      if (killedPlayerName) {
        logMsg = `\u{1F480} Kabar Duka: ${killedPlayerName} ditemukan tidak bernyawa pagi ini. Suara kokok ayam menemani air mata warga desa!`;
      } else {
        logMsg = `\u2600\uFE0F Kabar Baik: Fajar tiba dan seluruh desa terbangun lengkap terhindar dari cakar Werewolf!`;
      }
      const logRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
      await (0, import_firestore.setDoc)(logRef, {
        sender: "Sistem",
        text: logMsg,
        type: "log",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (hunterShotMsg) {
        const hunterLogRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
        await (0, import_firestore.setDoc)(hunterLogRef, {
          sender: "Sistem",
          text: hunterShotMsg,
          type: "log",
          createdAt: new Date(Date.now() + 500).toISOString()
        });
      }
      await (0, import_firestore.updateDoc)(roomRef, {
        selected_kill: null,
        protected_player: null
      });
      const latestPlayersSnap = await (0, import_firestore.getDocs)(playersRef);
      const latestCurrentPlayers = latestPlayersSnap.docs.map((d) => d.data());
      for (const p of latestCurrentPlayers) {
        await (0, import_firestore.updateDoc)((0, import_firestore.doc)(db, "rooms", roomId, "players", p.id), {
          has_acted: false,
          vote: ""
        });
      }
      const targetAlivePlayers = latestCurrentPlayers.filter((p) => p.is_alive);
      const wolfCount = targetAlivePlayers.filter((p) => p.role === "Werewolf").length;
      const villagerCount = targetAlivePlayers.filter((p) => p.role !== "Werewolf").length;
      if (wolfCount === 0) {
        await (0, import_firestore.updateDoc)(roomRef, {
          game_status: "end_game",
          winner: "VILLAGERS",
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        const endLogRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
        await (0, import_firestore.setDoc)(endLogRef, {
          sender: "Sistem",
          text: "\u{1F3C6} Seluruh Werewolf telah terbunuh! Keadilan desa tegak, Warga Desa MENANG!",
          type: "log",
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      } else if (wolfCount >= villagerCount) {
        await (0, import_firestore.updateDoc)(roomRef, {
          game_status: "end_game",
          winner: "WEREWOLVES",
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        const endLogRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
        await (0, import_firestore.setDoc)(endLogRef, {
          sender: "Sistem",
          text: "\u{1F3C6} Jumlah Werewolf telah menyamakan jumlah warga! Desa Wolfy jatuh, Werewolf MENANG!",
          type: "log",
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      } else {
        await (0, import_firestore.updateDoc)(roomRef, {
          game_status: "morning",
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        const aliveBots = currentPlayers.filter((p) => p.is_bot && p.is_alive && p.id !== selectedKill);
        if (aliveBots.length > 0) {
          const numMorningComments = Math.min(aliveBots.length, Math.random() > 0.5 ? 2 : 1);
          const morningSelectedBots = aliveBots.sort(() => Math.random() - 0.5).slice(0, numMorningComments);
          const morningBotQuotes = [
            "Astagafirullah! Baru sadar ada korban pagi ini! \u{1F631}",
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
            const botMorningRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
            await (0, import_firestore.setDoc)(botMorningRef, {
              sender: bot.name,
              text: quote,
              type: "chat",
              createdAt: new Date(Date.now() + (i + 1) * 600).toISOString()
            });
          }
        }
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Resolve error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/game/morning-confirm", authMiddleware, async (req, res) => {
    try {
      const { roomId } = req.body;
      const roomRef = (0, import_firestore.doc)(db, "rooms", roomId);
      await (0, import_firestore.updateDoc)(roomRef, {
        game_status: "voting",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      const logRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
      await (0, import_firestore.setDoc)(logRef, {
        sender: "Sistem",
        text: "\u{1F5E3}\uFE0F Waktu Musyawarah & Voting: Diskusikan dan pilih siapa tersangka siluman di balik bencana gantung!",
        type: "log",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/game/vote", authMiddleware, async (req, res) => {
    try {
      const { roomId, targetPlayerId } = req.body;
      const user = req.user;
      const roomRef = (0, import_firestore.doc)(db, "rooms", roomId);
      const roomSnap = await (0, import_firestore.getDoc)(roomRef);
      if (!roomSnap.exists()) return res.status(404).json({ error: "Room tidak ditemukan" });
      const roomData = roomSnap.data();
      if (roomData.game_status !== "voting") {
        return res.status(400).json({ error: "Voting hanya dapat dilakukan pada fase voting desa!" });
      }
      const playerRef = (0, import_firestore.doc)(db, "rooms", roomId, "players", user.userId);
      const playerSnap = await (0, import_firestore.getDoc)(playerRef);
      if (!playerSnap.exists()) return res.status(404).json({ error: "Pemain tidak ditemukan" });
      const playerData = playerSnap.data();
      if (!playerData.is_alive) {
        return res.status(400).json({ error: "Anda sudah mati dan tidak dapat memilih." });
      }
      await (0, import_firestore.updateDoc)(playerRef, {
        vote: targetPlayerId,
        has_acted: true
      });
      const targetRef = (0, import_firestore.doc)(db, "rooms", roomId, "players", targetPlayerId);
      const targetSnap = await (0, import_firestore.getDoc)(targetRef);
      const targetName = targetSnap.exists() ? targetSnap.data().name : "Seseorang";
      const logRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
      await (0, import_firestore.setDoc)(logRef, {
        sender: "Pengadilan Desa",
        text: `\u2696\uFE0F ${user.username} memilih untuk menggantung ${targetName}`,
        type: "log",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (roomData.game_mode === "solo") {
        const playersRef = (0, import_firestore.collection)(db, "rooms", roomId, "players");
        const playersSnap = await (0, import_firestore.getDocs)(playersRef);
        const alivePlayers = playersSnap.docs.map((d) => d.data()).filter((p) => p.is_alive);
        const botComments = [];
        for (const bot of alivePlayers) {
          if (bot.is_bot) {
            const potentialTargets = alivePlayers.filter((p) => p.id !== bot.id);
            if (potentialTargets.length > 0) {
              const randomTarget = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
              await (0, import_firestore.updateDoc)((0, import_firestore.doc)(db, "rooms", roomId, "players", bot.id), {
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
          const { botName, targetName: targetName2 } = activeBots[i];
          const rawQuote = botQuotes[Math.floor(Math.random() * botQuotes.length)];
          const quoteText = rawQuote.replace("{target}", targetName2);
          const botLogRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
          await (0, import_firestore.setDoc)(botLogRef, {
            sender: botName,
            text: quoteText,
            type: "chat",
            createdAt: new Date(Date.now() + (i + 1) * 200).toISOString()
          });
        }
        await (0, import_firestore.updateDoc)(roomRef, { game_status: "morning" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/game/resolve-voting", authMiddleware, async (req, res) => {
    try {
      const { roomId } = req.body;
      const roomRef = (0, import_firestore.doc)(db, "rooms", roomId);
      const roomSnap = await (0, import_firestore.getDoc)(roomRef);
      if (!roomSnap.exists()) return res.status(404).json({ error: "Room tidak ditemukan" });
      const roomData = roomSnap.data();
      const playersRef = (0, import_firestore.collection)(db, "rooms", roomId, "players");
      const playersSnap = await (0, import_firestore.getDocs)(playersRef);
      const currentPlayers = playersSnap.docs.map((d) => d.data());
      const alivePlayers = currentPlayers.filter((p) => p.is_alive);
      const voteMap = {};
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
        const targetRef = (0, import_firestore.doc)(db, "rooms", roomId, "players", executedId);
        const targetSnap = await (0, import_firestore.getDoc)(targetRef);
        if (targetSnap.exists()) {
          const executedData = targetSnap.data();
          executedName = executedData.name;
          executedRole = executedData.role;
          await (0, import_firestore.updateDoc)(targetRef, { is_alive: false });
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
              await (0, import_firestore.updateDoc)((0, import_firestore.doc)(db, "rooms", roomId, "players", shotTarget.id), { is_alive: false });
              hunterShotMsg = `\u{1F3AF} TEMBAKAN REAKSI HUNTER: Hunter ${executedName} sebelum digantung melepaskan tembakan balas dendam terakhir ke dada ${shotTarget.name} (${shotTarget.role}) dengan senapan pemburunya!`;
            }
          }
        }
      }
      let resultMsg = "";
      if (executedName) {
        resultMsg = `\u2696\uFE0F KEPUTUSAN HAKIM DESA: Mayoritas menunjuk ${executedName}. Ia digantung di tengah alun-alun desa! Peran aslinya adalah: *${executedRole}*.`;
      } else {
        resultMsg = `\u2696\uFE0F KEPUTUSAN HAKIM DESA: Voting berakhir seri atau tidak ada suara mayoritas! Algojo pulang tanpa nyawa melayang hari ini.`;
      }
      const logRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
      await (0, import_firestore.setDoc)(logRef, {
        sender: "Sistem",
        text: resultMsg,
        type: "log",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (hunterShotMsg) {
        const hunterLogRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
        await (0, import_firestore.setDoc)(hunterLogRef, {
          sender: "Sistem",
          text: hunterShotMsg,
          type: "log",
          createdAt: new Date(Date.now() + 500).toISOString()
        });
      }
      for (const p of currentPlayers) {
        await (0, import_firestore.updateDoc)((0, import_firestore.doc)(db, "rooms", roomId, "players", p.id), {
          vote: "",
          has_acted: false
        });
      }
      const freshPlayersSnap = await (0, import_firestore.getDocs)((0, import_firestore.collection)(db, "rooms", roomId, "players"));
      const freshPlayers = freshPlayersSnap.docs.map((d) => d.data());
      const freshAlive = freshPlayers.filter((p) => p.is_alive);
      const wolfCount = freshAlive.filter((p) => p.role === "Werewolf").length;
      const villagerCount = freshAlive.filter((p) => p.role !== "Werewolf").length;
      if (wolfCount === 0) {
        await (0, import_firestore.updateDoc)(roomRef, {
          game_status: "end_game",
          winner: "VILLAGERS",
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        const endLogRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
        await (0, import_firestore.setDoc)(endLogRef, {
          sender: "Sistem",
          text: "\u{1F3C6} Seluruh Werewolf telah terasimilasi! Keadilan desa ditegakkan, Warga Desa MENANG!",
          type: "log",
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      } else if (wolfCount >= villagerCount) {
        await (0, import_firestore.updateDoc)(roomRef, {
          game_status: "end_game",
          winner: "WEREWOLVES",
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        const endLogRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
        await (0, import_firestore.setDoc)(endLogRef, {
          sender: "Sistem",
          text: "\u{1F3C6} Jumlah Werewolf berhasil menyamai warga yang tersisa! Desa runtuh sepenuhnya, Werewolf MENANG!",
          type: "log",
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      } else {
        await (0, import_firestore.updateDoc)(roomRef, {
          game_status: "night",
          day_number: roomData.day_number + 1,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        const nextLogRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
        await (0, import_firestore.setDoc)(nextLogRef, {
          sender: "Sistem",
          text: `\u{1F303} Hari ke-${roomData.day_number + 1} dimulai... Semburat fajar tenggelam, seisi desa tertidur mawas diri.`,
          type: "log",
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Resolve voting error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/game/restart", authMiddleware, async (req, res) => {
    try {
      const { roomId } = req.body;
      const roomRef = (0, import_firestore.doc)(db, "rooms", roomId);
      const roomSnap = await (0, import_firestore.getDoc)(roomRef);
      if (!roomSnap.exists()) return res.status(404).json({ error: "Room tidak ditemukan" });
      await (0, import_firestore.updateDoc)(roomRef, {
        game_status: "waiting",
        selected_kill: null,
        protected_player: null,
        day_number: 1,
        winner: null,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      const isSolo = roomSnap.data()?.game_mode === "solo";
      const playersRef = (0, import_firestore.collection)(db, "rooms", roomId, "players");
      const playersSnap = await (0, import_firestore.getDocs)(playersRef);
      for (const pDoc of playersSnap.docs) {
        const pData = pDoc.data();
        if (pData.is_bot && !isSolo) {
          await (0, import_firestore.deleteDoc)((0, import_firestore.doc)(db, "rooms", roomId, "players", pDoc.id));
        } else {
          await (0, import_firestore.updateDoc)((0, import_firestore.doc)(db, "rooms", roomId, "players", pDoc.id), {
            role: "Villager",
            is_alive: true,
            has_acted: false,
            vote: ""
          });
        }
      }
      const logRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
      await (0, import_firestore.setDoc)(logRef, {
        sender: "Sistem",
        text: `Room disetel ulang kembali ke lobby oleh Host!`,
        type: "log",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app.post("/api/game/chat", authMiddleware, async (req, res) => {
    try {
      const { roomId, text } = req.body;
      const user = req.user;
      const logRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
      await (0, import_firestore.setDoc)(logRef, {
        sender: user.username,
        text,
        type: "chat",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      const roomSnap = await (0, import_firestore.getDoc)((0, import_firestore.doc)(db, "rooms", roomId));
      if (roomSnap.exists()) {
        const roomData = roomSnap.data();
        const gameStatus = roomData.game_status || "waiting";
        const playersSnap = await (0, import_firestore.getDocs)((0, import_firestore.collection)(db, "rooms", roomId, "players"));
        const aliveBots = playersSnap.docs.map((d) => d.data()).filter((p) => p.is_bot && p.is_alive);
        if (aliveBots.length > 0) {
          const numReplies = Math.random() > 0.6 ? 2 : 1;
          const selectedBots = aliveBots.sort(() => Math.random() - 0.5).slice(0, numReplies);
          const lowerText = text.toLowerCase();
          for (let i = 0; i < selectedBots.length; i++) {
            const bot = selectedBots[i];
            let replyText = "";
            if (lowerText.includes("siapa") || lowerText.includes("serigala") || lowerText.includes("werewolf") || lowerText.includes("wolf")) {
              const responses = [
                `Loh, jangan-jangan kamu sendiri serigalanya? \u{1F914}`,
                `Aku curiga sama salah satu dari kita, tapi butuh bukti lebih banyak.`,
                `Sumpah, aku warga desa murni! Jangan tuduh aku ya.`,
                `Serigala pasti berkeliaran semalam dan sekarang pura-pura polos! \u{1F43A}`,
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
                `Gantung saja yang banyak diam dan tidak aktif berkontribusi! \u{1F624}`,
                `Betul, keadilan harus ditegakkan demi kedamaian desa!`
              ];
              replyText = responses[Math.floor(Math.random() * responses.length)];
            } else {
              if (gameStatus === "waiting") {
                const responses = [
                  `Ayo kumpul-kumpul! Siap-siap dapet peran apa ya.`,
                  `Semoga dapet peran Werewolf biar seru, eh bercanda deng! \u{1F61C}`,
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
                  `Semua warga desa diharap matikan lampu dan tidur nyenyak! \u{1F319}`,
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
                  `Menurutku ada yang sedang pura-pura aktif di chat ini. \u{1F440}`
                ];
                replyText = responses[Math.floor(Math.random() * responses.length)];
              }
            }
            const botLogRef = (0, import_firestore.doc)((0, import_firestore.collection)(db, "rooms", roomId, "logs"));
            await (0, import_firestore.setDoc)(botLogRef, {
              sender: bot.name,
              text: replyText,
              type: "chat",
              createdAt: new Date(Date.now() + (i + 1) * 800).toISOString()
            });
          }
        }
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
