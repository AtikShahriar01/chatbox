# Security Policy

এই প্রজেক্টের সম্পূর্ণ সিকিউরিটি আর্কিটেকচার, কনট্রোল লিস্ট ও অডিট রিপোর্ট:

- 🛡️ **লেয়ার ম্যাপ:** [docs/SECURITY.md](docs/SECURITY.md)
- 📋 **সিকিউরিটি অডিট (findings + remaining risks):** [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md)
- 📐 **প্রোডাকশন হার্ডেনিং ডিরেক্টিভ (৪০ সেকশন):** [docs/SECURITY-DIRECTIVE.md](docs/SECURITY-DIRECTIVE.md)
- 🤖 **এজেন্ট নিয়ম:** [AGENTS.md](AGENTS.md)

## Vulnerability Reporting

এই অ্যাপ local-first — কোনো public সার্ভিস নেই। দুর্বলতা পেলে সরাসরি
প্রজেক্ট মালিককে জানান (private issue / ইমেইল)। পাবলিক ইস্যুতে বিস্তারিত
exploit পোস্ট করবেন না।

## Known Accepted Risks

- Next.js 14.2.x-এর কিছু advisory শুধু major (v16) মাইগ্রেশনে ফিক্সড —
  আমরা `next/image`, Server Actions, rewrites ব্যবহার করি না; প্রভাবিত পথ বন্ধ।
- `exceljs→uuid`, `pptxgenjs→image-size` — ফিক্স = breaking downgrade;
  ইউজার-ইনপুট-কন্ট্রোলড পথে নেই। বিস্তারিত: docs/SECURITY_AUDIT.md

## Secrets

কোনো সিক্রেট commit হয় না (`.auth/`, `bridge-token.txt`, `.env*` সব
gitignored)। CI-তে কোনো secret ব্যবহৃত হয় না।
