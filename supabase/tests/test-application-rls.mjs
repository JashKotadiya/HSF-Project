// Checks some concepts of row-level security in the application table.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "../../frontend/node_modules/@supabase/supabase-js/dist/index.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const supabaseDir = join(dir, "..");

function loadEnv(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    console.error(`Missing ${path}. Copy supabase/.env.example to supabase/.env and paste the keys.`);
    process.exit(1);
  }
  const env = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    env[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv(join(supabaseDir, ".env"));
const url = env.SUPABASE_URL;
const anonKey = env.SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
for (const [name, value] of [
  ["SUPABASE_URL", url],
  ["SUPABASE_ANON_KEY", anonKey],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
]) {
  if (!value) {
    console.error(`supabase/.env is missing ${name}.`);
    process.exit(1);
  }
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
const password = `Rls-test-${stamp}!`;
const accounts = {
  volunteer: { email: `rls-volunteer-${stamp}@example.com`, id: null },
  other: { email: `rls-other-${stamp}@example.com`, id: null },
  owner: { email: `rls-owner-${stamp}@example.com`, id: null },
};

let passed = 0;
let failed = 0;
const created = { postIds: [], resumePaths: [] };

function report(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function signIn(email) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Could not sign in ${email}: ${error.message}`);
  return client;
}

async function createUser(email, role) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role },
  });
  if (error) throw new Error(`Could not create ${email}: ${error.message}`);
  const id = data.user.id;
  const { error: profileError } = await admin.from("profiles").upsert({ id, role });
  if (profileError) throw new Error(`Could not save profile for ${email}: ${profileError.message}`);
  return id;
}

async function createPost(userId, status) {
  const { data, error } = await admin
    .from("posts")
    .insert({
      user_id: userId,
      title: `RLS test ${status} ${stamp}`,
      content: "Temporary row created by supabase/test-application-rls.mjs",
      status,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not create ${status} project: ${error.message}`);
  created.postIds.push(data.id);
  return data.id;
}

async function cleanup() {
  if (created.resumePaths.length) {
    await admin.storage.from("resumes").remove(created.resumePaths);
  }
  if (created.postIds.length) {
    await admin.from("applications").delete().in("project_id", created.postIds);
    await admin.from("posts").delete().in("id", created.postIds);
  }
  for (const account of Object.values(accounts)) {
    if (account.id) await admin.auth.admin.deleteUser(account.id);
  }
}

try {
  accounts.volunteer.id = await createUser(accounts.volunteer.email, "volunteer");
  accounts.other.id = await createUser(accounts.other.email, "volunteer");
  accounts.owner.id = await createUser(accounts.owner.email, "nonprofit");

  const activeId = await createPost(accounts.owner.id, "Active");
  const closedId = await createPost(accounts.owner.id, "Closed");

  const ownResume = `${accounts.volunteer.id}/${activeId}/resume.pdf`;
  const otherResume = `${accounts.other.id}/private/secret.pdf`;
  for (const path of [ownResume, otherResume]) {
    const { error } = await admin.storage
      .from("resumes")
      .upload(path, new Uint8Array([37, 80, 68, 70]), { contentType: "application/pdf", upsert: true });
    if (error) throw new Error(`Could not upload ${path}: ${error.message}`);
    created.resumePaths.push(path);
  }

  const volunteer = await signIn(accounts.volunteer.email);
  const owner = await signIn(accounts.owner.email);

  const approved = await volunteer.from("applications").insert({
    project_id: activeId,
    volunteer_id: accounts.volunteer.id,
    status: "approved",
    resume_path: ownResume,
  });
  report("volunteer cannot insert an approved application", Boolean(approved.error), approved.error?.message);

  const rejected = await volunteer.from("applications").insert({
    project_id: activeId,
    volunteer_id: accounts.volunteer.id,
    status: "rejected",
    resume_path: ownResume,
  });
  report("volunteer cannot insert a rejected application", Boolean(rejected.error), rejected.error?.message);

  const closed = await volunteer.from("applications").insert({
    project_id: closedId,
    volunteer_id: accounts.volunteer.id,
    status: "pending",
    resume_path: ownResume,
  });
  report("volunteer cannot apply to a closed project", Boolean(closed.error), closed.error?.message);

  const pending = await volunteer.from("applications").insert({
    project_id: activeId,
    volunteer_id: accounts.volunteer.id,
    status: "pending",
    resume_path: ownResume,
    applicant_name: "RLS Test",
    applicant_email: accounts.volunteer.email,
  }).select("id, status, resume_path").single();
  report("volunteer can apply to an active project", !pending.error && pending.data?.status === "pending", pending.error?.message);

  if (pending.data) {
    const retarget = await owner
      .from("applications")
      .update({ resume_path: otherResume })
      .eq("id", pending.data.id)
      .select("resume_path")
      .maybeSingle();
    const unchanged = !retarget.data || retarget.data.resume_path === ownResume;
    report(
      "owner cannot point the application at another resume",
      Boolean(retarget.error) && unchanged,
      retarget.error?.message,
    );

    const decision = await owner
      .from("applications")
      .update({ status: "approved" })
      .eq("id", pending.data.id)
      .select("status")
      .single();
    report("owner can approve the application", !decision.error && decision.data?.status === "approved", decision.error?.message);

    const ownFile = await owner.storage.from("resumes").download(ownResume);
    report("owner can download the applicant's resume", !ownFile.error && ownFile.data != null, ownFile.error?.message);

    const otherFile = await owner.storage.from("resumes").download(otherResume);
    report("owner cannot download another volunteer's resume", Boolean(otherFile.error), "download succeeded");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  failed += 1;
} finally {
  await cleanup();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
