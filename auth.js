/* =========================================================
   CareerAxis Academy - Secure Admin Authentication
   Google OAuth + Admin OTP
   ========================================================= */

const AUTH_CONFIG = window.CAREERAXIS_CONFIG || {};

const AUTHORIZED_ADMIN_EMAILS = Object.freeze([
  'careeraxisacademy@gmail.com',
  'ravitejasiddana@gmail.com'
]);

let supabaseClient = null;
let supabaseModulePromise = null;

let adminAuthState = {
  user: null,
  authorized: false
};

let adminAuthInitPromise = null;
let authListenerRegistered = false;


/* =========================================================
   LOAD SUPABASE LIBRARY
   ========================================================= */

async function loadSupabaseLibrary() {

  if (
    window.supabase &&
    typeof window.supabase.createClient === 'function'
  ) {
    return window.supabase;
  }

  if (supabaseModulePromise) {
    return supabaseModulePromise;
  }

  supabaseModulePromise = import(
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
  ).then((module) => {

    /*
      Make the module available globally so that app.js
      can also use it.
    */

    window.supabase = module;

    return module;

  }).catch((error) => {

    console.error(
      'CareerAxis: Failed to load Supabase library.',
      error
    );

    throw new Error(
      'Unable to load Supabase JavaScript library.'
    );
  });

  return supabaseModulePromise;
}


/* =========================================================
   GET SUPABASE CLIENT
   ========================================================= */

async function getSupabase() {

  if (supabaseClient) {
    return supabaseClient;
  }

  if (
    !AUTH_CONFIG.supabaseUrl ||
    !AUTH_CONFIG.supabaseAnonKey
  ) {

    console.error(
      'CareerAxis: Supabase configuration is missing.'
    );

    return null;
  }

  const supabase = await loadSupabaseLibrary();

  if (
    !supabase ||
    typeof supabase.createClient !== 'function'
  ) {

    console.error(
      'CareerAxis: Supabase createClient is unavailable.'
    );

    return null;
  }

  supabaseClient = supabase.createClient(
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


/* =========================================================
   AUTHORIZED ADMIN CHECK
   ========================================================= */

function isAuthorizedEmail(email) {

  return AUTHORIZED_ADMIN_EMAILS.includes(
    String(email || '')
      .trim()
      .toLowerCase()
  );
}


/* =========================================================
   INITIALIZE ADMIN AUTH
   ========================================================= */

async function initAdminAuth() {

  if (adminAuthInitPromise) {
    return adminAuthInitPromise;
  }

  adminAuthInitPromise = (async () => {

    const sb = await getSupabase();

    if (!sb) {

      adminAuthState = {
        user: null,
        authorized: false
      };

      return {
        configured: false,
        ...adminAuthState
      };
    }


    /* -----------------------------------------------------
       Verify Supabase Auth
       ----------------------------------------------------- */

    if (
      !sb.auth ||
      typeof sb.auth.getSession !== 'function'
    ) {

      console.error(
        'CareerAxis: Supabase Auth is unavailable.',
        sb
      );

      throw new Error(
        'Supabase Auth is not available.'
      );
    }


    /* -----------------------------------------------------
       AUTH STATE LISTENER
       ----------------------------------------------------- */

    if (!authListenerRegistered) {

      sb.auth.onAuthStateChange(
        (_event, nextSession) => {

          const nextUser =
            nextSession?.user || null;

          adminAuthState = {
            user: nextUser,
            authorized:
              !!nextUser &&
              isAuthorizedEmail(nextUser.email)
          };

        }
      );

      authListenerRegistered = true;
    }


    /* -----------------------------------------------------
       GET CURRENT SESSION
       ----------------------------------------------------- */

    const {
      data,
      error
    } = await sb.auth.getSession();

    if (error) {
      throw error;
    }

    const user =
      data?.session?.user || null;

    adminAuthState = {
      user,
      authorized:
        !!user &&
        isAuthorizedEmail(user.email)
    };


    return {
      configured: true,
      ...adminAuthState
    };

  })().catch((error) => {

    adminAuthInitPromise = null;

    console.error(
      'CareerAxis Admin Auth initialization failed:',
      error
    );

    throw error;
  });

  return adminAuthInitPromise;
}


/* =========================================================
   GOOGLE SIGN-IN
   ========================================================= */

async function signInWithGoogle() {

  const sb = await getSupabase();

  if (!sb) {

    throw new Error(
      'Supabase is not configured. Please check site-config.js.'
    );
  }

  if (
    !sb.auth ||
    typeof sb.auth.signInWithOAuth !== 'function'
  ) {

    throw new Error(
      'Supabase Auth is not available.'
    );
  }


  const redirectOrigin =
    window.location.origin;

  const redirectTo =
    `${redirectOrigin}/?admin=secure`;


  const {
    error
  } = await sb.auth.signInWithOAuth({

    provider: 'google',

    options: {
      redirectTo
    }

  });


  if (error) {
    throw error;
  }
}


/* =========================================================
   SIGN OUT
   ========================================================= */

async function signOutAdmin() {

  const sb = await getSupabase();

  if (
    sb &&
    sb.auth &&
    typeof sb.auth.signOut === 'function'
  ) {

    await sb.auth.signOut();
  }


  adminAuthState = {
    user: null,
    authorized: false
  };


  sessionStorage.removeItem(
    'careeraxis_admin_otp_verified'
  );


  window.location.href =
    `${window.location.origin}/#home`;
}


/* =========================================================
   REQUEST ADMIN OTP
   ========================================================= */

async function requestAdminOtp() {

  const sb = await getSupabase();

  if (
    !sb ||
    !adminAuthState.authorized
  ) {

    throw new Error(
      'Admin authorization is required before requesting an OTP.'
    );
  }


  const {
    data,
    error
  } = await sb.functions.invoke(
    'admin-otp',
    {
      body: {
        action: 'request'
      }
    }
  );


  if (error) {
    throw error;
  }


  if (!data?.ok) {

    throw new Error(
      data?.message ||
      'OTP request failed.'
    );
  }


  return data;
}


/* =========================================================
   VERIFY ADMIN OTP
   ========================================================= */

async function verifyAdminOtp(code) {

  const sb = await getSupabase();

  if (
    !sb ||
    !adminAuthState.authorized
  ) {

    throw new Error(
      'Admin authorization is required.'
    );
  }


  const {
    data,
    error
  } = await sb.functions.invoke(
    'admin-otp',
    {
      body: {
        action: 'verify',
        otp: code
      }
    }
  );


  if (error) {
    throw error;
  }


  if (!data?.ok) {

    throw new Error(
      data?.message ||
      'OTP verification failed.'
    );
  }


  sessionStorage.setItem(
    'careeraxis_admin_otp_verified',
    String(Date.now())
  );


  return data;
}


/* =========================================================
   CHECK RECENT OTP VERIFICATION
   ========================================================= */

function hasRecentOtpVerification() {

  const stamp =
    Number(
      sessionStorage.getItem(
        'careeraxis_admin_otp_verified'
      ) || 0
    );


  return (
    stamp > 0 &&
    Date.now() - stamp <
      15 * 60 * 1000
  );
}


/* =========================================================
   PUBLIC AUTH API
   ========================================================= */

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


/* =========================================================
   STARTUP
   ========================================================= */

console.log(
  'CareerAxis: Secure authentication module loaded.'
);