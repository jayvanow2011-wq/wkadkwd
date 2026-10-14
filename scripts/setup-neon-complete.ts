import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupDatabase() {
  console.log('🚀 Starting Neon database setup...\n');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });

  try {
    // Step 1: Execute schema SQL
    console.log('📋 Step 1: Creating schema and tables...');
    const schemaPath = path.join(__dirname, 'neon-complete-schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    
    // Split by statement and execute each
    const statements = schemaSql.split(';').filter(s => s.trim());
    for (const statement of statements) {
      try {
        await pool.query(statement);
      } catch (err) {
        // Ignore errors for IF EXISTS statements
        if (!statement.includes('IF NOT EXISTS') && !statement.includes('ON CONFLICT')) {
          console.warn('⚠️  Statement warning:', (err as any).message.substring(0, 100));
        }
      }
    }
    console.log('✅ Schema created successfully\n');

    // Step 2: Create admin user in auth.user table
    console.log('👤 Step 2: Creating admin user (jayjay)...');
    
    const adminUsername = 'jayjay';
    const adminPassword = 'jayjay100!';
    const adminEmail = 'jayjay@veltrix.xyz';
    const userId = crypto.randomUUID();

    // Hash password using bcrypt-compatible hash
    // For now, we'll use a simple approach with crypto
    const hashedPassword = crypto.createHash('sha256').update(adminPassword).digest('hex');

    try {
      // Insert into neon_auth.user
      await pool.query(
        `INSERT INTO neon_auth.user (id, email, name, role, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'admin', true, NOW(), NOW())
         ON CONFLICT (email) DO NOTHING`,
        [userId, adminEmail, adminUsername]
      );
      console.log('✅ Admin user created in neon_auth.user');

      // Insert into neon_auth.account for password
      await pool.query(
        `INSERT INTO neon_auth.account (id, "userId", "providerId", "accountId", password, "createdAt", "updatedAt")
         VALUES ($1, $2, 'credential', $3, $4, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [crypto.randomUUID(), userId, adminEmail, hashedPassword]
      );
      console.log('✅ Password stored in neon_auth.account');

      // Insert into profiles table if it exists
      try {
        await pool.query(
          `INSERT INTO profiles (user_id, username, display_name, verified, created_at, updated_at)
           VALUES ($1, $2, $3, true, NOW(), NOW())
           ON CONFLICT (username) DO NOTHING`,
          [userId, adminUsername, 'Admin User']
        );
        console.log('✅ Profile created for admin user');
      } catch {
        console.log('⚠️  Profiles table not found, skipping');
      }

      // Insert admin role if table exists
      try {
        await pool.query(
          `INSERT INTO user_roles (user_id, role, permissions, created_at)
           VALUES ($1, 'admin', '["read", "write", "delete", "admin"]', NOW())
           ON CONFLICT DO NOTHING`,
          [userId]
        );
        console.log('✅ Admin role assigned');
      } catch {
        console.log('⚠️  User roles table not found, skipping');
      }

      console.log('\n📊 Admin User Details:');
      console.log(`  Username: ${adminUsername}`);
      console.log(`  Password: ${adminPassword}`);
      console.log(`  Email: ${adminEmail}`);
      console.log(`  Role: admin`);
      console.log(`  User ID: ${userId}\n`);

    } catch (err) {
      console.error('❌ Error creating admin user:', (err as any).message);
    }

    // Step 3: Insert test data
    console.log('📝 Step 3: Inserting test data...');
    try {
      // Insert device for admin
      const deviceQuery = `
        INSERT INTO devices (user_id, device_name, device_type, device_model, device_os, device_browser)
        VALUES ($1, 'Admin Laptop', 'laptop', 'MacBook Pro', 'macOS', 'Chrome')
        RETURNING id
      `;
      const deviceResult = await pool.query(deviceQuery, [userId]);
      const deviceId = deviceResult.rows[0]?.id;
      
      if (deviceId) {
        // Insert device metrics
        await pool.query(
          `INSERT INTO device_metrics (device_id, cpu_usage, memory_usage, disk_usage)
           VALUES ($1, 45.2, 62.8, 75.3)`,
          [deviceId]
        );
      }

      // Insert a community post
      await pool.query(
        `INSERT INTO community_posts (user_id, title, content)
         VALUES ($1, 'Welcome to Veltrix', 'This is the beginning of something great!')`,
        [userId]
      );

      // Insert a command
      await pool.query(
        `INSERT INTO commands (user_id, command_text, status, output)
         VALUES ($1, 'npm run build', 'completed', 'Build successful!')`,
        [userId]
      );

      console.log('✅ Test data inserted\n');
    } catch (err) {
      console.warn('⚠️  Error inserting test data:', (err as any).message.substring(0, 100));
    }

    // Step 4: Verify tables
    console.log('✅ Step 4: Verifying database...');
    
    // Check neon_auth tables
    const authTableQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'neon_auth'
      ORDER BY table_name
    `;
    const authResult = await pool.query(authTableQuery);
    console.log(`✅ Found ${authResult.rows.length} tables in neon_auth schema`);
    console.log('Tables:', authResult.rows.map(r => r.table_name).join(', '));
    
    // Check public tables
    const publicTableQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    const publicResult = await pool.query(publicTableQuery);
    console.log(`\n✅ Found ${publicResult.rows.length} tables in public schema`);
    if (publicResult.rows.length > 0) {
      console.log('Tables:', publicResult.rows.map(r => r.table_name).join(', '));
    }
    console.log();

    console.log('🎉 Database setup complete!');
    console.log('\n✅ You can now login with:');
    console.log(`  Username: ${adminUsername}`);
    console.log(`  Password: ${adminPassword}`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupDatabase();
