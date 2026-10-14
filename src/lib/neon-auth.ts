import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export interface NeonUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NeonSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Authenticate a user with username/email and password against Neon database
 */
export async function authenticateUser(
  username: string,
  password: string
): Promise<{ user: NeonUser; session: NeonSession } | { error: string }> {
  try {
    // Convert username to email if needed
    let email = username.toLowerCase().trim();
    if (!email.includes('@')) {
      email = `${email}@veltrix.xyz`;
    }

    // Get user from neon_auth.user
    const userResult = await pool.query(
      `SELECT id, email, name, role, "emailVerified", "createdAt", "updatedAt"
       FROM neon_auth.user WHERE email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return { error: 'Invalid credentials' };
    }

    const user = userResult.rows[0] as NeonUser;

    // Get password hash from neon_auth.account
    const accountResult = await pool.query(
      `SELECT password FROM neon_auth.account 
       WHERE "userId" = $1 AND "providerId" = 'credential'`,
      [user.id]
    );

    if (accountResult.rows.length === 0) {
      return { error: 'Invalid credentials' };
    }

    const { password: passwordHash } = accountResult.rows[0];

    // Verify password
    const passwordMatch = await bcrypt.compare(password, passwordHash);
    if (!passwordMatch) {
      return { error: 'Invalid credentials' };
    }

    // Check if user is banned
    const banResult = await pool.query(
      `SELECT 1 FROM neon_auth.user WHERE id = $1 AND role != 'banned'`,
      [user.id]
    );

    if (banResult.rows.length === 0) {
      return { error: 'This account is banned' };
    }

    // Create session
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const sessionResult = await pool.query(
      `INSERT INTO neon_auth.session 
       (id, "userId", token, "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id, "userId", token, "expiresAt", "createdAt"`,
      [generateUUID(), user.id, sessionToken, expiresAt]
    );

    const session = sessionResult.rows[0] as NeonSession;

    return { user, session };
  } catch (err) {
    console.error('[Neon Auth] Error:', err);
    return { error: 'Authentication failed' };
  }
}

/**
 * Get user from session token
 */
export async function getUserFromSession(token: string): Promise<NeonUser | null> {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.role, u."emailVerified", u."createdAt", u."updatedAt"
       FROM neon_auth.user u
       INNER JOIN neon_auth.session s ON u.id = s."userId"
       WHERE s.token = $1 AND s."expiresAt" > NOW()`,
      [token]
    );

    if (result.rows.length === 0) return null;
    return result.rows[0];
  } catch (err) {
    console.error('[Neon Auth] Session lookup failed:', err);
    return null;
  }
}

/**
 * Sign out a user by deleting their session
 */
export async function signOutUser(token: string): Promise<void> {
  try {
    await pool.query(`DELETE FROM neon_auth.session WHERE token = $1`, [token]);
  } catch (err) {
    console.error('[Neon Auth] Sign out failed:', err);
  }
}

/**
 * Create a new user
 */
export async function createUser(
  email: string,
  password: string,
  username: string
): Promise<{ user: NeonUser } | { error: string }> {
  try {
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists
    const existing = await pool.query(
      `SELECT 1 FROM neon_auth.user WHERE email = $1`,
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      return { error: 'User already exists' };
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const userId = generateUUID();
    const userResult = await pool.query(
      `INSERT INTO neon_auth.user 
       (id, email, name, role, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'user', true, NOW(), NOW())
       RETURNING id, email, name, role, "emailVerified", "createdAt", "updatedAt"`,
      [userId, normalizedEmail, username]
    );

    // Create account (password provider)
    await pool.query(
      `INSERT INTO neon_auth.account 
       (id, "userId", "providerId", "accountId", password, "createdAt", "updatedAt")
       VALUES ($1, $2, 'credential', $3, $4, NOW(), NOW())`,
      [generateUUID(), userId, normalizedEmail, passwordHash]
    );

    return { user: userResult.rows[0] };
  } catch (err) {
    console.error('[Neon Auth] User creation failed:', err);
    return { error: 'Failed to create user' };
  }
}

/**
 * Verify TOTP code for user (if enabled)
 */
export async function verifyTotpCode(
  userId: string,
  code: string
): Promise<boolean> {
  try {
    // For now, return true - TOTP verification would go here
    // This is a placeholder for proper TOTP implementation
    return true;
  } catch (err) {
    console.error('[Neon Auth] TOTP verification failed:', err);
    return false;
  }
}

/**
 * Generate a random UUID
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a random session token
 */
function generateSessionToken(): string {
  return generateUUID() + generateUUID();
}
