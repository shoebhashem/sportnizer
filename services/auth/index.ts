import { auth, functions } from '../core/firebase';
import AuthServiceNew from './authServiceNew';

// Create and export a singleton instance of the new auth service
export const authServiceNew = new AuthServiceNew(auth, functions);

// Export the class for type purposes
export { default as AuthServiceNew } from './authServiceNew';
