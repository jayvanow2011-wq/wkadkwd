import { createServerFn } from "@tanstack/react-start";
import { authenticateUser, createUser } from './neon-auth';

/**
 * Server function to authenticate user with username and password
 */
export const authenticate = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; password: string }) => d)
  .handler(async ({ data }) => {
    const result = await authenticateUser(data.username, data.password);
    
    if ('error' in result) {
      return { error: result.error };
    }

    const { user, session } = result;
    
    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      sessionToken: session.token,
    };
  });

/**
 * Server function to create a new user
 */
export const registerUser = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; password: string; email?: string }) => d)
  .handler(async ({ data }) => {
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(data.username)) {
      return { error: 'Username must be 3-20 chars (letters, numbers, _)' };
    }

    if (!data.password || data.password.length < 6) {
      return { error: 'Password must be at least 6 characters' };
    }

    const email = data.email || `${data.username.toLowerCase()}@veltrix.xyz`;
    
    const result = await createUser(email, data.password, data.username);
    
    if ('error' in result) {
      return { error: result.error };
    }

    return {
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
    };
  });
