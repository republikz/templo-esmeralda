const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PIN_ITERATIONS = 310000;
const TOKEN_TTL_SECONDS = 60 * 60 * 8;

function base64UrlEncode(value) {
  const bytes = value instanceof Uint8Array ? value : encoder.encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(value || "").length + 3) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function normalizeSecret(value) {
  return String(value || "").trim();
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}

export function normalizeAccessName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export async function hashPin(pin, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(normalizeSecret(pin)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PIN_ITERATIONS }, key, 256);
  return { hash: base64UrlEncode(new Uint8Array(bits)), salt: base64UrlEncode(salt), iterations: PIN_ITERATIONS };
}

export async function verifyPin(pin, user) {
  if (!user?.pinHash || !user?.pinSalt) return false;
  const derived = await hashPin(pin, base64UrlDecode(user.pinSalt));
  return timingSafeEqual(encoder.encode(derived.hash), encoder.encode(String(user.pinHash)));
}

async function sessionKey(env) {
  const secret = normalizeSecret(env.SESSION_SECRET);
  if (secret.length < 32) throw new Error("SESSION_SECRET ausente ou curto demais.");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSessionToken(env, user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: user.id, role: user.role, ver: Number(user.authVersion) || 1, iat: now, exp: now + TOKEN_TTL_SECONDS };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(env), encoder.encode(encoded));
  return { token: `${encoded}.${base64UrlEncode(new Uint8Array(signature))}`, expiresAt: payload.exp * 1000 };
}

export async function verifySessionToken(env, token) {
  const [encoded, signature] = String(token || "").split(".");
  if (!encoded || !signature) return null;
  const valid = await crypto.subtle.verify("HMAC", await sessionKey(env), base64UrlDecode(signature), encoder.encode(encoded));
  if (!valid) return null;
  const payload = JSON.parse(decoder.decode(base64UrlDecode(encoded)));
  if (!payload?.sub || !payload?.exp || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function getBearerToken(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization") || "");
  return match ? match[1].trim() : "";
}

export function publicUser(user) {
  return {
    id: String(user?.id || ""),
    name: String(user?.name || "Jogador"),
    role: user?.role === "admin" ? "admin" : "player",
    createdAt: Number(user?.createdAt) || 0,
    updatedAt: Number(user?.updatedAt) || 0
  };
}

export function sanitizeStateForClient(state) {
  const next = structuredClone(state || {});
  next.users = Array.isArray(next.users) ? next.users.map(publicUser) : [];
  delete next.activeUserId;
  delete next._baseRevision;
  delete next._changedFields;
  return next;
}

export async function migrateCredentials(state) {
  const next = structuredClone(state || {});
  const users = Array.isArray(next.users) ? next.users : [];
  let changed = !Array.isArray(next.users);
  next.users = [];
  for (const source of users) {
    const role = source?.role === "admin" ? "admin" : "player";
    const user = {
      id: String(source?.id || crypto.randomUUID()),
      name: String(source?.name || "Jogador").trim() || "Jogador",
      role,
      createdAt: Number(source?.createdAt) || Date.now(),
      updatedAt: Number(source?.updatedAt) || Number(source?.createdAt) || Date.now(),
      authVersion: Math.max(1, Number(source?.authVersion) || 1),
      pinHash: String(source?.pinHash || ""),
      pinSalt: String(source?.pinSalt || ""),
      pinIterations: Number(source?.pinIterations) || PIN_ITERATIONS
    };
    if ((!user.pinHash || !user.pinSalt) && String(source?.pin || "")) {
      const credential = await hashPin(source.pin);
      user.pinHash = credential.hash;
      user.pinSalt = credential.salt;
      user.pinIterations = credential.iterations;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(source || {}, "pin")) changed = true;
    next.users.push(user);
  }
  return { state: next, changed };
}
