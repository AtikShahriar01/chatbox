# Agent Rules — Chatbox workspace

এই workspace-এ কাজ করা প্রতিটা এজেন্ট (ZCode সহ) নিচের নিয়ম মানবে:

1. **সিকিউরিটি ডিরেক্টিভ:** [docs/SECURITY-DIRECTIVE.md](docs/SECURITY-DIRECTIVE.md) —
   যেকোনো কোড পরিবর্তনের আগে/পরে এই ৪০-সেকশনের নিয়ম অনুসরণ করো
   (authentication, input validation, secrets, AI security, fail-closed ইত্যাদি)।
2. **সিকিউরিটি লেয়ার:** [docs/SECURITY.md](docs/SECURITY.md) — কোন লেয়ার কোথায় আছে
   তার ম্যাপ। নতুন ফিচার যোগ করলে সংশ্লিষ্ট লেয়ার আপডেট করো।
3. **এনভায়রনমেন্ট:** যেকোনো npm/pip/node/git কমান্ডের আগে `source env.sh` —
   সব কিছু H:\chatbot create-এর ভেতরে থাকবে, C: ড্রাইভে কিছুই লিখবে না
   (বিস্তারিত: docs/ENV-RULES.md)।
4. **টেস্ট:** সিকিউরিটি-সংবেদনশীল পরিবর্তনের পরে অবশ্যই চালাও:
   - `node .selftest/parser-tests.mjs`
   - `node .selftest/security-live-tests.mjs` (সার্ভার + bridge চালু অবস্থায়)
5. **নিষিদ্ধ:** `git config --global`, C:-তে ফাইল তৈরি, সিকিউরিটি কন্ট্রোল ডিজেবল
   করে সুবিধা আনা, সিক্রেট hardcode করা।
