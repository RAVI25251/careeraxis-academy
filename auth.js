/* =========================================================
   CareerAxis Academy - Secure Admin Authentication
   Google OAuth + Server-Side Admin Authorization + Admin OTP
   ========================================================= */

const AUTH_CONFIG = window.CAREERAXIS_CONFIG || {};

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
  )
    .then((module) => {

      /*
       * Make the module available globally so that app.js
       * can also use it.
       */
      window.supabase = module;

      return module;
    })
    .catch((error) => {

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
   SERVER-SIDE ADMIN AUTHORIZATION
   ========================================================= */

/*
 * IMPORTANT:
 *
 * Admin authorization is NOT determined by a hardcoded
 * email list anymore.
 *
 * Supabase checks:
 *
 * auth.uid()
 *     ↓
 * admin_users.user_id
 *     ↓
 * role = 'admin'
 *     ↓
 * is_active = true
 */

async function checkServerAdminAuthorization(sb, user) {

  if (!sb || !user) {
    return false;
  }

  if (
    !sb.rpc ||
    typeof sb.rpc !== 'function'
  ) {

    console.error(
      'CareerAxis: Supabase RPC is unavailable.'
    );

    return false;
  }

  try {

    const {
      data,
      error
    } = await sb.rpc(
      'is_current_admin'
    );

    if (error) {

      console.error(
        'CareerAxis: Server-side admin authorization failed.',
        error
      );

      return false;
    }

    return data === true;

  } catch (error) {

    console.error(
      'CareerAxis: Unexpected admin authorization error.',
      error
    );

    return false;
  }
}


/* =========================================================
   UPDATE ADMIN AUTH STATE
   ========================================================= */

async function updateAdminAuthState(sb, user) {

  if (!user) {

    adminAuthState = {
      user: null,
      authorized: false
    };

    return adminAuthState;
  }

  const authorized =
    await checkServerAdminAuthorization(
      sb,
      user
    );

  adminAuthState = {
    user,
    authorized
  };

  return adminAuthState;
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
       VERIFY SUPABASE AUTH
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
        (event, nextSession) => {

          const nextUser =
            nextSession?.user || null;

          /*
           * Do not perform the RPC directly inside the
           * Supabase auth callback.
           *
           * Defer it slightly so the auth state transition
           * can complete safely.
           */

          setTimeout(async () => {

            try {

              await updateAdminAuthState(
                sb,
                nextUser
              );

            } catch (error) {

              console.error(
                'CareerAxis: Failed to update admin auth state.',
                error
              );

              adminAuthState = {
                user: nextUser,
                authorized: false
              };
            }

          }, 0);
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


    /* -----------------------------------------------------
       SERVER-SIDE ADMIN CHECK
       ----------------------------------------------------- */

    await updateAdminAuthState(
      sb,
      user
    );


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
      60 * 60 * 1000
  );
}


/* =========================================================
   PUBLIC AUTH API
   ========================================================= */

window.CareerAxisAuth = {

  getSupabase,

  initAdminAuth,

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