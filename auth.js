const AUTH_CONFIG = window.CAREERAXIS_CONFIG || {};

const AUTHORIZED_ADMIN_EMAILS = Object.freeze([
  'careeraxisacademy@gmail.com',
  'ravitejasiddana@gmail.com'
]);

let supabaseClient = null;
let adminAuthState = { user: null, authorized: false };
let adminAuthInitPromise = null;
let authListenerRegistered = false;

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase || !AUTH_CONFIG.supabaseUrl || !AUTH_CONFIG.supabaseAnonKey) return null;

  supabaseClient = window.supabase.createClient(
    AUTH_CONFIG.supabaseUrl,
    AUTH_CONFIG.supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  return supabaseClient;
}

function isAuthorizedEmail(email) {
  return AUTHORIZED_ADMIN_EMAILS.includes(
    String(email || '').trim().toLowerCase()
  );
}

async function initAdminAuth() {
  // IMPORTANT: initialize only once. The previous version registered a new
  // onAuthStateChange listener every time the admin view rendered. Rendering
  // the admin view from that listener created a render/listener loop that
  // could make the browser tab unresponsive.
  if (adminAuthInitPromise) return adminAuthInitPromise;

  adminAuthInitPromise = (async () => {
    const sb = getSupabase();

    if (!sb) {
      adminAuthState = { user: null, authorized: false };
      return { configured: false, ...adminAuthState };
    }

    if (!authListenerRegistered) {
      sb.auth.onAuthStateChange((_event, nextSession) => {
        const nextUser = nextSession?.user || null;
        adminAuthState = {
          user: nextUser,
          authorized: !!nextUser && isAuthorizedEmail(nextUser.email)
        };
        // Do not call render() here. OAuth callbacks cause a full page load,
        // and calling render from the auth callback can recursively re-enter
        // admin initialization.
      });
      authListenerRegistered = true;
    }

    const { data, error } = await sb.auth.getSession();
    if (error) throw error;

    const user = data?.session?.user || null;
    adminAuthState = {
      user,
      authorized: !!user && isAuthorizedEmail(user.email)
    };

    return { configured: true, ...adminAuthState };
  })().catch((error) => {
    // Allow a later retry if initialization itself failed.
    adminAuthInitPromise = null;
    throw error;
  });

  return adminAuthInitPromise;
}

async function signInWithGoogle() {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured yet. Complete SUPABASE-SETUP.md.');

  // Return to the same origin that started the login. This makes local
  // development predictable while production returns to careeraxisacademy.in.
const redirectOrigin = window.location.origin;
const redirectTo = `${redirectOrigin}/?admin=secure`;

  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo }
  });

  if (error) throw error;
}

async function signOutAdmin() {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
  adminAuthState = { user: null, authorized: false };
  sessionStorage.removeItem('careeraxis_admin_otp_verified');
  location.hash = 'home';
}

async function requestAdminOtp() {
  const sb = getSupabase();
  if (!sb || !adminAuthState.authorized) {
    throw new Error('Admin authorization is required before requesting an OTP.');
  }
  const { data, error } = await sb.functions.invoke('admin-otp', {
    body: { action: 'request' }
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.message || 'OTP request failed.');
  return data;
}

async function verifyAdminOtp(code) {
  const sb = getSupabase();
  if (!sb || !adminAuthState.authorized) {
    throw new Error('Admin authorization is required.');
  }
  const { data, error } = await sb.functions.invoke('admin-otp', {
    body: { action: 'verify', otp: code }
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.message || 'OTP verification failed.');
  sessionStorage.setItem('careeraxis_admin_otp_verified', String(Date.now()));
  return data;
}

function hasRecentOtpVerification() {
  const stamp = Number(
    sessionStorage.getItem('careeraxis_admin_otp_verified') || 0
  );
  return stamp > 0 && Date.now() - stamp < 15 * 60 * 1000;
}

window.CareerAxisAuth = {
  AUTHORIZED_ADMIN_EMAILS,
  getSupabase,
  initAdminAuth,
  isAuthorizedEmail,
  signInWithGoogle,
  signOutAdmin,
  requestAdminOtp,
  verifyAdminOtp,
  hasRecentOtpVerification,
  get state() {
    return adminAuthState;
  }
};
