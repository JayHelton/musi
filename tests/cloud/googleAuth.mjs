import {
  authRedirectUrl,
  signInWithGoogle,
  describeAuthError,
} from '../../js/cloud/auth.js';
import { installFakeTransport, restoreTransport } from './transportFake.mjs';

const EXISTING_ERROR_CASES = [
  {
    label: 'offline',
    error: { message: 'network' },
    setup: () => { globalThis.navigator.onLine = false; },
    teardown: () => { globalThis.navigator.onLine = true; },
    expected: 'You are offline. Connect to sign in.',
  },
  {
    label: 'rate limit',
    error: { status: 429, message: 'too many requests' },
    expected: 'Too many attempts. Wait a minute and try again.',
  },
  {
    label: 'signup not allowed',
    error: { message: 'signup_not_allowed' },
    expected: 'This Musi project does not accept new accounts. Ask the owner for access.',
  },
  {
    label: 'expired code',
    error: { message: 'otp expired' },
    expected: 'That code expired. Send a new one.',
  },
  {
    label: 'clock skew',
    error: { message: 'clock skew detected' },
    expected: 'The device clock looks wrong. Check the date and time settings.',
  },
  {
    label: 'storage blocked',
    error: { message: 'localstorage blocked' },
    expected: 'The browser blocked the saved login. Allow storage for this site.',
  },
  {
    label: 'generic fallback',
    error: { message: 'Something else broke' },
    expected: 'Something else broke',
  },
  {
    label: 'empty fallback',
    error: {},
    expected: 'Sign in failed. Try again.',
  },
];

export async function run(test) {
  // The router in js/main.js reads the hash and accepts a tool id such as
  // `musicprefs`. It does not accept `sec-musicprefs`, which is the id of the
  // DOM element. A wrong value here sends the user to the Home screen.
  await test('authRedirectUrl returns the Settings route of the app', async () => {
    const prevLocation = globalThis.location;
    globalThis.location = {
      origin: 'https://jayhelton.github.io',
      pathname: '/musi/',
    };
    try {
      const url = authRedirectUrl();
      if (!url.endsWith('#musicprefs')) {
        throw new Error(`expected hash route, got ${url}`);
      }
      if (url !== 'https://jayhelton.github.io/musi/#musicprefs') {
        throw new Error(`unexpected redirect url: ${url}`);
      }
    } finally {
      globalThis.location = prevLocation;
    }
  });

  await test('authRedirectUrl returns empty string without location', async () => {
    const prevLocation = globalThis.location;
    delete globalThis.location;
    try {
      if (authRedirectUrl() !== '') throw new Error('expected empty string');
    } finally {
      globalThis.location = prevLocation;
    }
  });

  await test('signInWithGoogle asks for google provider with settings redirect', async () => {
    const prevLocation = globalThis.location;
    globalThis.location = {
      origin: 'http://localhost:8080',
      pathname: '/',
    };
    const { client } = installFakeTransport();
    try {
      const result = await signInWithGoogle();
      if (!result.ok) throw new Error('expected ok result');
      const calls = client.auth._oauthCalls;
      if (calls.length !== 1) throw new Error('expected one OAuth call');
      const call = calls[0];
      if (call.provider !== 'google') throw new Error('expected google provider');
      const redirectTo = call.options?.redirectTo || '';
      if (!redirectTo.endsWith('#musicprefs')) {
        throw new Error(`redirectTo missing hash: ${redirectTo}`);
      }
      if (call.options?.queryParams?.prompt !== 'select_account') {
        throw new Error('expected select_account prompt');
      }
    } finally {
      restoreTransport();
      globalThis.location = prevLocation;
    }
  });

  await test('signInWithGoogle returns ok false when provider reports an error', async () => {
    const { client } = installFakeTransport();
    try {
      client.auth.signInWithOAuth = async () => ({
        data: null,
        error: { message: 'unsupported provider: google' },
      });
      const result = await signInWithGoogle();
      if (result.ok) throw new Error('expected failure');
      const described = describeAuthError(result.error);
      if (described.message !== 'Google sign-in is not turned on for this project yet.') {
        throw new Error(`unexpected message: ${described.message}`);
      }
    } finally {
      restoreTransport();
    }
  });

  await test('describeAuthError maps redirect errors to allow-list message', async () => {
    const described = describeAuthError({ message: 'redirect url not allowed' });
    if (!described.message.includes('allow list')) {
      throw new Error(`unexpected redirect message: ${described.message}`);
    }
  });

  for (const entry of EXISTING_ERROR_CASES) {
    await test(`describeAuthError keeps ${entry.label} message`, async () => {
      entry.setup?.();
      try {
        const described = describeAuthError(entry.error);
        if (described.message !== entry.expected) {
          throw new Error(`expected "${entry.expected}" got "${described.message}"`);
        }
      } finally {
        entry.teardown?.();
      }
    });
  }
}
