// Pure, unit-testable path containment for the bridge (security directive
// §11 path-traversal + §20 path-validation tests). Two checks:
//   1. lexical  — the requested path, resolved against the workspace, must
//      stay inside it (no "..", no absolute escape, no bridge-zone paths).
//   2. real-path — a symlink/junction placed INSIDE the workspace must not
//      smuggle file ops to files OUTSIDE it: resolve the deepest existing
//      component with realpath and re-check containment.
// Deliberately free of bridge state (no tokens, no HTTP) so the §20 test
// suite can exercise the exact production logic from Node directly.

const fs = require("node:fs");
const path = require("node:path");

// Real path of the deepest existing ancestor, with the non-existing tail
// re-appended (write targets may not exist yet). null = unresolvable.
function realPathBestEffort(abs) {
  const missing = [];
  let cur = abs;
  for (let i = 0; i < 64; i++) {
    try {
      const real = fs.realpathSync(cur);
      return missing.length ? path.join(real, ...missing.reverse()) : real;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return null;
      missing.push(path.basename(cur));
      cur = parent;
    }
  }
  return null;
}

// true when child sits at or below parent (case-insensitive on Windows via
// path.win32.relative semantics)
function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * @param {string} workspace  current bridge workspace (root for all file ops)
 * @param {string} p          caller path (absolute or workspace-relative)
 * @param {(p:string)=>string|null} [isGuarded]  returns an error string for
 *        guarded zones (bridge home), null when the path is fine
 */
function checkContained(workspace, p, isGuarded) {
  const ws = path.resolve(workspace);
  const rel = path.relative(ws, p);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, error: `Outside workspace (${ws}). Set a different workspace or clear it.` };
  }
  if (isGuarded) {
    const g = isGuarded(p);
    if (g) return { ok: false, error: g };
  }
  // symlink/junction escape check
  const abs = path.resolve(ws, p);
  const real = realPathBestEffort(abs);
  if (real) {
    if (!isInside(ws, real)) {
      return { ok: false, error: "blocked: symlink/junction escapes the workspace" };
    }
    if (isGuarded) {
      const g2 = isGuarded(real);
      if (g2) return { ok: false, error: g2 };
    }
  }
  return { ok: true, path: p };
}

module.exports = { checkContained, realPathBestEffort, isInside, normalizeHostIp };

// Bridge copy of the app-side guard.normalizeHostIp (separate process/module
// system — duplicated on purpose; both pinned by the §20 suite). Normalizes
// IPv4-mapped IPv6 so [::ffff:7f00:1] can't smuggle loopback past regex lists.
function normalizeHostIp(host) {
  let h = String(host || "").replace(/^\[|\]$/g, "").toLowerCase();
  let m = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (m) {
    const a = parseInt(m[1], 16); const b = parseInt(m[2], 16);
    h = [a >> 8 & 255, a & 255, b >> 8 & 255, b & 255].join(".");
  } else {
    m = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) h = m[1];
  }
  if (h === "0:0:0:0:0:0:0:1") h = "::1";
  return h;
}
