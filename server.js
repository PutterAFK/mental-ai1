import express from "express";
import cors from "cors";
import axios from "axios";
import * as cheerio from "cheerio";
import dotenv from "dotenv";

// โหลดค่าจาก .env
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   🔐 API KEY (อ่านจาก .env)
========================= */
const API_KEY = process.env.API_KEY;

/* =========================
   🔒 AUTH MIDDLEWARE
========================= */
app.use((req, res, next) => {
  const auth = req.headers.authorization;

  if (!auth || auth !== `Bearer ${API_KEY}`) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  next();
});

/* =========================
   🔗 KNOWLEDGE LINKS
========================= */
const links = [
  "https://mhc8.dmh.go.th/%E0%B8%A3%E0%B8%B2%E0%B8%A2%E0%B8%A5%E0%B8%B0%E0%B9%80%E0%B8%AD%E0%B8%B5%E0%B8%A2%E0%B8%94%E0%B8%AA%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B8%AA%E0%B8%B8%E0%B8%82%E0%B8%A0%E0%B8%B2%E0%B8%9E%E0%B8%88%E0%B8%B4%E0%B8%95.php?MentalhealthID=122",
  "https://hdmall.co.th/blog/health/ways-talking-with-depressed-person-treatment-how-to/",
  "https://www.phyathai.com/th/pytp/article/how-to-act-when-someone-close-to-you-has-depression-ptp",
  "https://ooca.co/blog/talk-to-loved-with-depression/",
  "https://www.istrong.co/single-post/words-for-depression"
];

/* =========================
   🧠 KNOWLEDGE BASE
========================= */
let KNOWLEDGE = [];

/* =========================
   🧵 MEMORY
========================= */
const memory = {};
const MAX_MEMORY = 6;

/* =========================
   📥 LOAD KNOWLEDGE
========================= */
async function loadKnowledge() {
  for (const link of links) {
    try {
      const res = await axios.get(link, { timeout: 10000 });
      const $ = cheerio.load(res.data);

      const text = $("body")
        .text()
        .replace(/\s+/g, " ");

      const chunks = text.match(/.{1,300}/g) || [];

      KNOWLEDGE.push(...chunks);

    } catch (err) {
      console.log("โหลดไม่ได้:", link);
    }
  }

  console.log("โหลดความรู้เสร็จ:", KNOWLEDGE.length, "chunks");
}

/* =========================
   🔍 SEARCH
========================= */
function scoreText(question, text) {
  const words = question.toLowerCase().split(/\s+/);

  let score = 0;

  for (const word of words) {
    if (word.length > 2 && text.toLowerCase().includes(word)) {
      score++;
    }
  }

  return score;
}

function findBestContexts(question, k = 3) {
  const scored = KNOWLEDGE.map(text => ({
    text,
    score: scoreText(question, text)
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, k).map(item => item.text);
}

/* =========================
   🧠 MOOD ANALYSIS
========================= */
function analyzeMood(message) {
  const msg = message.toLowerCase();

  if (msg.includes("อยากตาย") || msg.includes("ไม่อยากอยู่")) {
    return "risk";
  }

  if (msg.includes("เครียด") || msg.includes("กังวล")) {
    return "stress";
  }

  if (msg.includes("เหนื่อย") || msg.includes("หมดแรง")) {
    return "tired";
  }

  if (msg.includes("นอนไม่หลับ")) {
    return "sleep";
  }

  return "normal";
}

/* =========================
   💬 REPLY TEMPLATES
========================= */
const replies = {
  stress: [
    "ผมเข้าใจนะว่าคุณกำลังเครียดอยู่ ลองเล่าเพิ่มได้ไหม",
    "ฟังดูแล้วมันกดดันมากเลย ผมอยู่ตรงนี้นะ"
  ],
  tired: [
    "คุณดูเหนื่อยมากเลย ลองพักสักนิดนะ"
  ],
  sleep: [
    "ลองลดการใช้หน้าจอก่อนนอนดูนะ อาจช่วยได้"
  ],
  normal: [
    "ผมอยู่ตรงนี้นะ อยากเล่าอะไรเพิ่มเติมไหม"
  ]
};

function safetyMessage() {
  return "คุณไม่จำเป็นต้องรับมือเรื่องนี้คนเดียว ลองคุยกับคนที่ไว้ใจได้ หรือผู้ใหญ่ที่คุณเชื่อใจ";
}

/* =========================
   🧠 GENERATE REPLY
========================= */
function generateReply({ message, mood, contexts, user_id }) {
  if (mood === "risk") {
    return safetyMessage();
  }

  const history = memory[user_id] || [];
  const lastMessage = history.slice(-1).join(" ");

  const pool = replies[mood] || replies.normal;
  const baseReply =
    pool[Math.floor(Math.random() * pool.length)];

  let contextInfo = "";
  if (contexts.length > 0) {
    contextInfo =
      " จากข้อมูลที่เกี่ยวข้อง: " +
      contexts[0].slice(0, 80) +
      "...";
  }

  let continuity = "";
  if (lastMessage) {
    continuity =
      " จากที่คุณเล่าก่อนหน้านี้ " +
      lastMessage.slice(0, 40) +
      "...";
  }

  return baseReply + continuity + contextInfo;
}

/* =========================
   🧵 UPDATE MEMORY
========================= */
function updateMemory(user_id, message) {
  if (!memory[user_id]) {
    memory[user_id] = [];
  }

  memory[user_id].push(message);

  if (memory[user_id].length > MAX_MEMORY) {
    memory[user_id].shift();
  }
}

/* =========================
   🚀 API
========================= */
app.post("/chat", (req, res) => {
  const { message, user_id = "default" } = req.body;

  const mood = analyzeMood(message);

  const contexts =
    findBestContexts(message);

  const reply = generateReply({
    message,
    mood,
    contexts,
    user_id
  });

  updateMemory(user_id, message);

  res.json({
    reply
  });
});

/* =========================
   ▶ START SERVER
========================= */
await loadKnowledge();

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `🚀 API running on port ${PORT}`
  );
});