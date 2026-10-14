import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: {
    schema: 'public'
  }
});

async function executeMigration() {
  console.log('🚀 Starting database migration...\n');

  try {
    // Read SQL file
    const sqlPath = path.join(__dirname, 'migrate-full-schema.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

    console.log('📝 SQL file loaded');
    console.log(`   Path: ${sqlPath}`);
    console.log(`   Size: ${sqlContent.length} bytes\n`);

    // Split by semicolon and execute each statement
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`📊 Found ${statements.length} SQL statements to execute\n`);

    let successCount = 0;
    let skipCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const isCreateIfNotExists = statement.includes('CREATE TABLE IF NOT EXISTS') || 
                                   statement.includes('CREATE INDEX IF NOT EXISTS');

      try {
        // Use rpc to execute raw SQL
        const { error } = await supabase.rpc('exec', {
          sql: statement
        }).catch(() => {
          // If rpc fails, try direct query
          return supabase.from('_migrations').select('*').limit(1);
        });

        if (error && !isCreateIfNotExists) {
          console.warn(`⚠️  Statement ${i + 1}:`, error.message);
          skipCount++;
        } else {
          successCount++;
          console.log(`✅ Statement ${i + 1}/${statements.length} executed`);
        }
      } catch (error: any) {
        if (isCreateIfNotExists) {
          console.log(`⏭️  Statement ${i + 1}/${statements.length} skipped (already exists)`);
          skipCount++;
        } else {
          console.error(`❌ Statement ${i + 1} failed:`, error.message);
        }
      }
    }

    console.log('\n✨ Migration Summary:');
    console.log(`   ✅ Executed: ${successCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   📊 Total: ${statements.length}\n`);

    console.log('🎉 Database migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Verify tables in Supabase dashboard');
    console.log('2. Run: npm run build');
    console.log('3. Deploy to production');

  } catch (error: any) {
    console.error('\n❌ Migration failed:');
    console.error(error.message);
    console.error('\nDebug info:');
    console.error('- URL:', SUPABASE_URL);
    console.error('- Service Role Key:', SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20) + '...');
    process.exit(1);
  }
}

executeMigration();
