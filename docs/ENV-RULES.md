# ENV RULES — সব কিছু H:\chatbot create-এ, C: ড্রাইভে কিছুই না

**নিয়ম:** install, download, cache, temp file, npm/pip package, session, cookie — সবকিছু
`H:\chatbot create` ফোল্ডারের ভেতরে থাকবে। C: ড্রাইভে কোনো ফাইল লেখা/ইনস্টল/ডাউনলোড নিষিদ্ধ।

## কীভাবে ব্যবহার করবেন

- **Git Bash / এই এজেন্টের শেল:** প্রতিটা সেশনে কাজ শুরুর আগে —
  `source "H:\chatbot create\env.sh"`
- **cmd / .bat স্ক্রিপ্ট:** `call "H:\chatbot create\env.bat"`
- **চেক করতে:** `bash scripts/check-env.sh` → সব OK দেখালে সব H:-এ লক করা।

## কোথায় কী জমা হয় (সবই H:\chatbot create-এর ভেতরে)

| জিনিস | জায়গা |
|---|---|
| Node.js প্রোগ্রাম | `tools\nodejs` (পোর্টেবল) |
| Python 3.14 প্রোগ্রাম | `.home\AppData\Local\Python` (পোর্টেবল) |
| npm cache | `.npm\cache` |
| npm গ্লোবাল প্যাকেজ | `.npm-global` |
| pip cache | `.pip\cache` (`pip.ini` + `PIP_CACHE_DIR`) |
| pip user package | `.python-user` |
| Temp ফাইল | `.tmp` (TEMP/TMP/TMPDIR) |
| হোম, AppData, সেশন, কুকি | `.home` (HOME/USERPROFILE/APPDATA/LOCALAPPDATA) |
| git গ্লোবাল কনফিগ | `.gitconfig` (`GIT_CONFIG_GLOBAL`) |
| gh/ssh/অন্য টুলের কনফিগ | `.home\.config` (XDG) |
| ব্রাউজার অটোমেশন | `.cache\ms-playwright` |

## এজেন্টের জন্য স্থায়ী নিয়ম

1. যেকোনো npm/pip/node/git/python কমান্ডের আগে `env.sh` সোর্স করো — এই এজেন্টের শেল
   লগইন শেল নয়, তাই প্রোফাইল অটো লোড হয় না।
2. কোনো ডাউনলোড (`curl -o`, `pip download`, `npm pack` ইত্যাদি) সরাসরি ওয়ার্কস্পেসের
   ভেতরের পাথে সেভ করতে হবে।
3. `git config --global` চালানো নিষিদ্ধ (C:-তে ফাইল হবে) — রিপো-লোকাল কনফিগ বা
   `GIT_CONFIG_GLOBAL` ব্যবহার করো।
4. ব্রাউজার চালাতে হলে user-data-dir সবসময় ওয়ার্কস্পেসের ভেতরে দাও (session/cookie H:-তে থাকবে)।
5. কাজ শেষে `bash scripts/check-env.sh` ও C: ক্লিনলিনেস চেক চালানো ভালো।
