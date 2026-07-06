import { createClient } from "@supabase/supabase-js";

/**
 * 只读客户端,给 Next.js 页面(Server Components)用。
 * 用 anon key —— 数据库已经通过 RLS 策略设置成公开可读,
 * 所以这个 key 出现在服务器端环境变量里是安全的。
 */
export function createPublicClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "缺少 SUPABASE_URL 或 SUPABASE_ANON_KEY 环境变量,请检查 Vercel 项目的环境变量配置。"
    );
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false },
  });
}

/**
 * 可写客户端,只给 pipeline/ 脚本用(GitHub Actions 里跑)。
 * 用 service_role key —— 这个 key 拥有绕过 RLS 的写权限,绝不能出现在
 * Next.js 前端代码或 Vercel 的环境变量里,只放在 GitHub Actions Secrets 里。
 */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 环境变量,请检查 .env / GitHub Actions Secrets 配置。"
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
