import { Amplify } from 'aws-amplify';
import type { Brand } from '../branding/brands';

/**
 * White-label portals authenticate against their own Cognito app client: the
 * client is what binds a signup to its tenant server-side, so signing up on a
 * client's portal with the default client would file their cases in the wrong
 * warranty network. Client ids are public identifiers — shipping them in the
 * bundle is expected, and they grant nothing on their own.
 */
export function configureAuth(brand?: Brand) {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: import.meta.env['VITE_USER_POOL_ID'] ?? '',
        userPoolClientId:
          brand?.userPoolClientId ?? import.meta.env['VITE_USER_POOL_CLIENT_ID'] ?? '',
      },
    },
  });
}
