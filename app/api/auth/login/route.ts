import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk, ensureCsrf } from "@/lib/api";
import { getSession } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";

const loginSchema = z.object({
  username: z.string().min(1, "用户名不能为空"),
  password: z.string().min(1, "密码不能为空"),
});

export async function POST(request: NextRequest) {
  if (!(await ensureCsrf(request))) {
    return jsonError("请求来源不合法", { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("请求体格式错误", { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "参数错误";
    return jsonError(message, { status: 422 });
  }

  const { username, password } = parsed.data;
  const session = await getSession();

  const registeredUser = await prisma.$transaction(async (tx) => {
    const userCount = await tx.user.count();
    if (userCount !== 0) {
      return null;
    }

    const passwordHash = await hashPassword(password);
    return tx.user.create({ data: { username, passwordHash } });
  });

  if (registeredUser) {
    session.userId = registeredUser.id;
    session.username = registeredUser.username;
    await session.save();
    return jsonOk({ initialized: true, username: registeredUser.username });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return jsonError("管理员已存在，请使用已创建的账号登录", { status: 403 });
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    return jsonError("用户名或密码错误", { status: 401 });
  }

  session.userId = user.id;
  session.username = user.username;
  await session.save();

  return jsonOk({ username: user.username });
}
