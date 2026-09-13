# 🔒 Security Layers — Chatbox প্রোডাকশন সিকিউরিটি

**লক্ষ্য:** হ্যাকার, ক্র্যাকার, অন্য কেউ — কেউই এই অ্যাপ বা এই PC-তে অনাকাঙ্ক্ষিতভাবে
ঢুকতে, হ্যাক করতে, কোড বদলাতে বা ব্যবহার করতে পারবে না।

## থ্রেট মডেল — কার থেকে বাঁচানো হচ্ছে

| আক্রমণকারী | ভেক্টর | প্রতিরোধ |
|---|---|---|
| LAN-এর অন্য কেউ | `http://<pc-ip>:3000` খুলে অ্যাপ/ব্রিজ চালানো | localhost-only binding + Host check |
| দুষ্ট ওয়েবসাইট (drive-by) | আপনার ব্রাউজার থেকে localhost-এ CSRF | Origin check + custom header |
| DNS rebinding | evil.com → 127.0.0.1 | Host allowlist |
| XSS (মেসেজের ভেতরে স্ক্রিপ্ট) | API key চুরি / কোড এক্সিকিউশন | CSP + markdown sanitize |
| DoS / resource abuse | বিশাল body, ঝড়ো রিকোয়েস্ট | size cap + rate limit |
| Command injection | commit message / মডেল আউটপুটে শেল কমান্ড | args-array git + denylist |
| বিপজ্জনক bridge op | কেউ নতুন/অজানা route চালানো | op whitelist |
| ভুলে workspace মোছা | খালি POST দিয়ে রিসেট | explicit `clear:true` লাগে |
| Credential চোরাই | .env, SSH key, ব্রাউজার কুকি | bridge denylist + redaction |

## যে সিকিউরিটি লেয়ারগুলো কোডে যোগ করা হয়েছে

### BASIC (মৌলিক)

1. **Localhost-only binding** — `next start -H 127.0.0.1`: সার্ভার শুধু এই PC-র
   ব্রাউজার থেকে শোনে; LAN/ইন্টারনেট থেকে অ্যাপটা অদৃশ্য। (start-app.bat, start-dev.bat)
2. **Host allowlist** (`middleware.js` + `lib/guard.js`) — `localhost/127.0.0.1` ছাড়া
   অন্য Host header মানেই 403। DNS-rebinding বন্ধ।
3. **Same-Origin enforcement** — সব POST/PUT/DELETE-এ `Origin` চেক; অন্য সাইট থেকে
   আসলে 403 (CSRF বন্ধ)।
4. **Security headers** (`next.config.js`): `Content-Security-Policy`,
   `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`,
   `Cross-Origin-Opener/Resource-Policy`, `Permissions-Policy` (শুধু mic self)।
5. **Markdown sanitize** — AI রিপ্লাই `rehype-sanitize` দিয়ে পরিষ্কার; স্ক্রিপ্ট চলতে পারে না।

### ADVANCED (প্রোডাকশন লেয়ার)

6. **Custom client header** (`x-chatbox-client: chatbox-web-1`) — `/api/pc/*`-তে বাধ্যতামূলক।
   Cross-site form/no-cors fetch কাস্টম হেডার দিতে পারে না → drive-by bridge access অসম্ভব।
7. **Bridge op whitelist** (`lib/guard.js: ALLOWED_PC_OPS`) — শুধু জানা ৪৫টা route
   ফরোয়ার্ড হয়; অজানা op মানে 400।
8. **Rate limiting** (sliding window): chat 30/min, web-search 12/min, models 20/min,
   test-connection 15/min, pc 240/min — 429 + Retry-After।
9. **Body size caps** — chat 4MB, বাকি 16–64KB; বড় body মানে 413 (memory-DoS বন্ধ)।
10. **Safe git commit** — bridge-এ নতুন `/git/commit` op, `execFile("git", [...args])`
    (শেল নেই) — commit message-এ command injection অসম্ভব।
11. **Explicit workspace clear** — bridge-এ খালি POST-এ আর workspace মোছে না;
    `clear:true` লাগে (accidental/an wiped বন্ধ)।
12. **Token security** — bridge token শুধু 127.0.0.1, Authorization: Bearer, token
    কখনো ব্রাউজারে যায় না (stream/raw প্রক্সি সার্ভার-সাইডে যোগ করে)।
13. **Path confinement** — সব ফাইল op workspace-এর ভেতরে confine; agent-bridge ফোল্ডার
    নিজেই (token/audit/checkpoints) guarded zone।
14. **Exec denylist** — `.ssh`, `.env`, ব্রাউজার Cookies/Login Data, LSASS, SAM,
    secrets/credentials ফাইল স্পর্শ করলে কমান্ড BLOCK + audit।
15. **Secret redaction** — কমান্ড আউটপুটে API key/`Bearer` token স্বয়ংক্রিয়ভাবে
    `***REDACTED***` হয় (chat route + bridge দুই জায়গায়)।
16. **Audit log** — প্রতিটা bridge action (`agent-bridge/audit.log`) — কে কী করেছে সব লেখা থাকে।
17. **API key স্কোপ** — BYOK: key শুধু আপনার ব্রাউজারের localStorage-এ; সার্ভারে কোথাও
    সেভ হয় না; প্রতি রিকোয়েস্টে শুধু প্রোভাইডারে যায়।

## ডিফেন্স-ইন-ডেপথ — একই জিনিস ৩ স্তরে

```
ব্রাউজার (Origin + custom header)
   ↓
middleware.js        ← Host + Origin (সব রিকোয়েস্ট)
   ↓
lib/guard.js         ← Host + Origin + header + size + rate (প্রতি রুট)
   ↓
/api/pc whitelist    ← শুধু জানা op
   ↓
bridge (127.0.0.1)   ← Bearer token + confine + denylist + audit
```

## ব্যবহারকারীর জন্য ৩টা নিয়ম

1. `start-app.bat` দিয়েই চালান — ওটা এখন লোকালহোস্ট-লকড সার্ভার চালায়।
2. **PC Access মোড** `auto` রাখলে agent সব অটো চালায় — নিজের দায়িত্বে। সাধারণ
   ব্যবহারে `safe` বা `ask` নিরাপদ।
3. API key হারালে/সন্দেহ হলে প্রোভাইডার ড্যাশবোর্ড থেকে revoke করুন — অ্যাপে
   Settings → নতুন key বসানোই যথেষ্ট।

## ডিরেক্টিভ ও অডিট

- সম্পূর্ণ সিকিউরিটি ডিরেক্টিভ: [docs/SECURITY-DIRECTIVE.md](SECURITY-DIRECTIVE.md)
- সর্বশেষ অডিট রিপোর্ট (findings, severity, remaining risks): [docs/SECURITY_AUDIT.md](SECURITY_AUDIT.md)
- §20 টেস্ট পিরামিড (১৭২ চেক): `node .selftest/run-all.mjs` — unit(52) · parser(12) ·
  integration(32) · security-live(25) · security-deep(35) · e2e(16); ম্যাপ: [TESTING.md](TESTING.md)
- SSRF/পাথ-কনফাইনমেন্ট ইউনিট: `app/lib/guard.js` (providerUrlGuard, normalizeHostIp) +
  `agent-bridge/pathguard.js` (real-path confinement)

## LAN Mode — অন্য ডিভাইস থেকে ব্যবহার (start-server.bat)

- `start-server.bat` চালালে সার্ভার `0.0.0.0:3000`-এ শোনে — একই WiFi-র যেকোনো ডিভাইস
  থেকে `http://<PC-র-IP>:3000` দিয়ে খোলা যায়।
- **নিরাপত্তা মডেল:** ঢুকতেই PIN (সার্ভার-সাইড সেশন); Host allowlist শুধু private IP
  (192.168.x / 10.x / 172.16-31.x) অনুমতি দেয় — public hostname/DNS-rebinding এখনও
  403; Origin চেক একইভাবে LAN IP মেনে নেয়; bridge এখনও শুধু 127.0.0.1।
- টেস্ট ম্যাট্রিক্স (লাইভ যাচাই): LAN-IP Host → allow, evil.com Host → 403,
  LAN-IP Origin → 200, evil Origin → 403, session ছাড়া পেজ → /login।
- Public internet-এ (VPS/Vercel) খুলতে চাইলে এই মোড যথেষ্ট নয় — bridge রুট public
  হয়ে যাওয়ার ঝুঁকি; tunneling (Cloudflare Tunnel) + PIN দিয়ে করলেও খুব সতর্কতা দরকার।
