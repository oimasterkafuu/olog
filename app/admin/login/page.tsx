import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "@/components/login-form";

export const metadata = {
  title: "登录后台",
};

export default async function AdminLoginPage() {
  const session = await getSession();
  if (session.userId) {
    redirect("/admin");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-semibold text-slate-900">欢迎使用</h1>
        <p className="mt-2 text-sm text-slate-500">请登录以管理您的博客内容。</p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
