import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createAdminUser() {
  console.log("🔧 Creating admin user: jayjay...");

  const adminEmail = "jayjay@veltrix.xyz";
  const adminPassword = "jayjay100!";
  const adminUsername = "jayjay";

  try {
    // Step 1: Create auth user via Supabase Auth
    console.log("  ➜ Creating Supabase auth user...");
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        username: adminUsername,
        full_name: "Admin",
      },
    });

    let userId: string;
    
    if (authError) {
      if (authError.message?.includes("already been registered")) {
        console.log("  ℹ️  User already exists, retrieving...");
        // User already exists, find them
        const { data: users, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) {
          console.error("  ❌ Failed to list users:", listError);
          return;
        }
        const existingUser = users?.users?.find(u => u.email === adminEmail);
        if (!existingUser) {
          console.error("  ❌ Could not find existing user");
          return;
        }
        userId = existingUser.id;
        console.log(`  ✅ Found existing user: ${userId}`);
      } else {
        console.error("  ❌ Auth user creation failed:", authError);
        return;
      }
    } else {
      if (!authData.user) {
        console.error("  ❌ No user returned from auth creation");
        return;
      }
      userId = authData.user.id;
      console.log(`  ✅ Auth user created: ${userId}`);
    }

    // Step 2: Update user record with admin role
    console.log("  ➜ Setting admin role...");
    const { error: updateError } = await supabase
      .schema("neon_auth")
      .from("user")
      .update({
        role: "admin",
        emailVerified: true,
      })
      .eq("id", userId);

    if (updateError) {
      console.error("  ❌ Failed to set admin role:", updateError);
      return;
    }

    console.log("  ✅ Admin role set");

    // Step 3: Create account record for password storage
    console.log("  ➜ Creating account record...");
    const { error: accountError } = await supabase
      .schema("neon_auth")
      .from("account")
      .insert({
        userId,
        providerId: "email",
        accountId: adminEmail,
        password: adminPassword,
      });

    if (accountError && !accountError.message.includes("duplicate")) {
      console.error("  ⚠️  Account record creation:", accountError.message);
    } else if (accountError?.message.includes("duplicate")) {
      console.log("  ℹ️  Account record already exists");
    } else {
      console.log("  ✅ Account record created");
    }

    console.log("\n✨ Admin user created successfully!");
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Username: ${adminUsername}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Role: admin`);
  } catch (error) {
    console.error("❌ Error creating admin user:", error);
    process.exit(1);
  }
}

createAdminUser();
