const AUTH_CONFIG = window.CAREERAXIS_CONFIG || {};

const AUTHORIZED_ADMIN_EMAILS = Object.freeze([
  'careeraxisacademy@gmail.com',
  'ravitejasiddana@gmail.com'
]);

let supabaseClient = null;
let adminAuthState = {
  user: null,
  authorized: false
};

let adminAuthInitPromise = null;
let authListenerRegistered = false;
let supabaseLoadPromise = null;


/* =========================================================
   LOAD SUPABASE LIBRARY
   ========================================================= */

function loadSupabaseLibrary() {

  if (
    window.supabase &&
    typeof window.supabase.createClient === 'function'
  ) {
    return Promise.resolve();
  }

  if (supabaseLoadPromise) {
    return supabaseLoadPromise;
  }

  supabaseLoadPromise = new Promise(
    (resolve, reject) => {

      const existing =
        document.querySelector(
          'script[data-careeraxis-supabase]'
        );

      if (existing) {

        const timer =
          setInterval(() => {

            if (
              window.supabase &&
              typeof window.supabase.createClient ===
                'function'
            ) {

              clearInterval(timer);
              resolve();

            }

          }, 50);


        setTimeout(() => {

          clearInterval(timer);

          if (
            window.supabase &&
            typeof window.supabase.createClient ===
              'function'
          ) {

            resolve();

          } else {

            reject(
              new Error(
                'Supabase library could not be loaded.'
              )
            );

          }

        }, 10000);

        return;
      }


      const script =
        document.createElement('script');


      script.src =
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';


      script.async = true;


      script.dataset.careeraxisSupabase =
        'true';


      script.onload =
        () => {

          if (
            window.supabase &&
            typeof window.supabase.createClient ===
              'function'
          ) {

            resolve();

          } else {

            reject(
              new Error(
                'Supabase library loaded incorrectly.'
              )
            );

          }

        };


      script.onerror =
        () => {

          reject(
            new Error(
              'Unable to load Supabase library.'
            )
          );

        };


      document.head.appendChild(
        script
      );

    }
  );

  return supabaseLoadPromise;
}


/* =========================================================
   GET SUPABASE CLIENT
   ========================================================= */

function getSupabase() {

  if (supabaseClient) {
    return supabaseClient;
  }


  if (
    !window.supabase ||
    typeof window.supabase.createClient !==
      'function'
  ) {

    return null;

  }


  if (
    !AUTH_CONFIG.supabaseUrl ||
    !AUTH_CONFIG.supabaseAnonKey
  ) {

    return null;

  }


  supabaseClient =
    window.supabase.createClient(

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

function isAuthorizedEmail(
  email
) {

  return AUTHORIZED_ADMIN_EMAILS.includes(

    String(
      email || ''
    )
      .trim()
      .toLowerCase()

  );

}


/* =========================================================
   INITIALIZE ADMIN AUTHENTICATION
   ========================================================= */

async function initAdminAuth() {

  if (adminAuthInitPromise) {
    return adminAuthInitPromise;
  }


  adminAuthInitPromise =
    (async () => {

      /*
       * Make absolutely sure Supabase has loaded
       * before creating the client.
       */

      await loadSupabaseLibrary();


      const sb =
        getSupabase();


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


      /*
       * Safety check.
       *
       * This prevents the exact:
       *
       * Cannot read properties of undefined
       * (reading 'onAuthStateChange')
       *
       * error.
       */

      if (
        !sb.auth ||
        typeof sb.auth.onAuthStateChange !==
          'function'
      ) {

        throw new Error(
          'Supabase Auth is not available. Please refresh the page and try again.'
        );

      }


      /*
       * Register the listener ONLY ONCE.
       *
       * Never call render() from this listener.
       */

      if (!authListenerRegistered) {

        sb.auth.onAuthStateChange(
          (
            _event,
            nextSession
          ) => {

            const nextUser =
              nextSession?.user ||
              null;


            adminAuthState = {

              user: nextUser,

              authorized:
                !!nextUser &&
                isAuthorizedEmail(
                  nextUser.email
                )

            };

          }
        );


        authListenerRegistered =
          true;

      }


      /*
       * Read the existing browser session.
       */

      const {
        data,
        error
      } =
        await sb.auth.getSession();


      if (error) {
        throw error;
      }


      const user =
        data?.session?.user ||
        null;


      adminAuthState = {

        user,

        authorized:
          !!user &&
          isAuthorizedEmail(
            user.email
          )

      };


      return {

        configured: true,

        ...adminAuthState

      };


    })()
      .catch(
        (error) => {

          /*
           * Allow another attempt if initialization
           * fails.
           */

          adminAuthInitPromise =
            null;

          throw error;

        }
      );


  return adminAuthInitPromise;
}


/* =========================================================
   GOOGLE SIGN-IN
   ========================================================= */

async function signInWithGoogle() {

  /*
   * Make sure Supabase is loaded first.
   */

  await loadSupabaseLibrary();


  const sb =
    getSupabase();


  if (!sb) {

    throw new Error(
      'Supabase is not configured yet. Complete SUPABASE-SETUP.md.'
    );

  }


  const redirectOrigin =
    window.location.origin;


  const redirectTo =
    `${redirectOrigin}/?admin=secure`;


  const {
    error
  } =
    await sb.auth.signInWithOAuth({

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

  const sb =
    getSupabase();


  if (sb) {

    await sb.auth.signOut();

  }


  adminAuthState = {

    user: null,

    authorized: false

  };


  sessionStorage.removeItem(
    'careeraxis_admin_otp_verified'
  );


  /*
   * Return to the public homepage.
   */

  window.location.href =
    `${window.location.origin}/#home`;

}


/* =========================================================
   REQUEST ADMIN OTP
   ========================================================= */

async function requestAdminOtp() {

  const sb =
    getSupabase();


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
  } =
    await sb.functions.invoke(
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

async function verifyAdminOtp(
  code
) {

  const sb =
    getSupabase();


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
  } =
    await sb.functions.invoke(
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

    String(
      Date.now()
    )

  );


  return data;
}


/* =========================================================
   CHECK RECENT OTP
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

    Date.now() -
      stamp <
      15 *
      60 *
      1000

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