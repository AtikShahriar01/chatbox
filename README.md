# Chatbox — ফোল্ডার গাইড

একটা local-first, multi-model AI chat client + built-in IDE + PC agent — সবকিছু
এই ফোল্ডারের ভেতরেই (C: ড্রাইভে কিছু যায় না)।

## 🚀 চালু করবেন যেভাবে

| ফাইল | কাজ |
|---|---|
| **`start-app.bat`** | প্রতিদিনের ব্যবহার — শুধু এই PC থেকে (localhost) |
| **`start-server.bat`** | LAN মোড — ফোন/অন্য ডিভাইস থেকে `http://<PC-IP>:3000` |
| **`start-dev.bat`** | ডেভেলপমেন্ট (hot reload) — কোড বদলালেই আপডেট |
| **`clean-cache.bat`** | এক ক্লিকে জমা ক্যাশ/লগ পরিষ্কার (~৬০০MB পর্যন্ত ফ্রি) |

ঠিকানা: `http://localhost:3000` · প্রথমবার PIN দিয়ে অ্যাকাউন্ট → তারপর লগইন।
AI চালাতে: **Settings → Model Provider** → আপনার API key (OpenRouter/OpenAI/Claude/
Gemini/Ollama — যেকোনো একটা)। Key শুধু আপনার ব্রাউজারেই থাকে।

## 📁 ফোল্ডার ম্যাপ

```
H:\chatbot create\
├── app\                ← Next.js অ্যাপ (চ্যাট + IDE + Console + API routes)
│   ├── app\            ← পেজ ও API রুট
│   ├── components\     ← UI কম্পোনেন্ট
│   ├── lib\            ← স্টেট, providers, agent engine, security guard
│   └── middleware.js   ← Host/Origin/session গেট (লেয়ার ১)
├── agent-bridge\       ← PC bridge (localhost:8765) — ফাইল/কমান্ড/git/টার্মিনাল
│   └── checkpoints\    ← rollback স্ন্যাপশট (মুছবেন না)
├── tools\              ← পোর্টেবল Node.js (C: ছাড়াই সব চলে)
├── .home\              ← পোর্টেবল Python + আপনার AppData/session/কুকি
├── .auth\              ← লগইন PIN hash + সেশন সিক্রেট (গোপন — git-এ নেই)
├── .selftest\          ← টেস্ট টুল: parser-tests, security-live-tests, mock-provider
├── scripts\            ← check-env.sh (সব H:-তে লক আছে কিনা)
├── docs\               ← SECURIT* ডক + মূল PRD/TRD/UIUX স্পেক
├── .npm\ .npm-global\ .pip\ .tmp\   ← ক্যাশ/টেম্প (clean-cache.bat দিয়ে পরিষ্কার)
├── env.sh / env.bat    ← "সব H:-এ থাকবে" এনভায়রনমেন্ট লক
├── AGENTS.md           ← AI এজেন্টদের জন্য workspace নিয়ম
└── start-*.bat, clean-cache.bat     ← লঞ্চার
```

## 🔒 সিকিউরিটি (সংক্ষেপে)

৫ স্তরের দেয়াল: localhost/LAN-only binding → Host/Origin গেট → সার্ভার-সাইড PIN
সেশন → API rate-limit/size-cap/op-whitelist → bridge token + path confinement +
command denylist + audit log। বিস্তারিত: [docs/SECURITY.md](docs/SECURITY.md),
অডিট: [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md)।

## 🧪 টেস্ট

```bash
source env.sh
node .selftest/parser-tests.mjs        # ১২টা SSE parser টেস্ট
node .selftest/security-live-tests.mjs # ২৫টা লাইভ সিকিউরিটি টেস্ট (সার্ভার চালু থাকলে)
bash scripts/check-env.sh               # সব ডেটা H:-তে লক আছে কিনা
```

## 📦 অন্য PC/ফোল্ডারে নেওয়া (১০০% পোর্টেবল)

ফোল্ডারটা কপি করে যেকোনো ড্রাইভ/মেশিনে (Windows) নিয়ে `start-app.bat` ডাবল-ক্লিক
করলেই চলবে — কোনো ইনস্টলার লাগবে না:

- সব script **নিজের লোকেশন নিজে খুঁজে নেয়** (H:/D:/USB — কোনো drive-এর নাম হার্ডকোড করা নেই)
- নতুন মেশিনে `node_modules` না থাকলে bat ফাইল **নিজে npm install** করে নেয়
- পুরনো path-এ সেট করা workspace থাকলে bridge **নতুন ফোল্ডারে ফিরে আসে** (auto-heal)
- চ্যাট/সেটিংস ব্রাউজার localStorage-এ — নতুন PC-তে চাইলে Settings → Data → Export/Import
- **ফ্রেশ শুরু করতে চাইলে:** `.auth\` ফোল্ডার মুছে দিন (নিজের PIN নিজে বানাবেন)
- লক্ষ্য: Windows → Windows। Linux/Mac-এ নিলে `node_modules` আবার ইনস্টল করতে হবে
