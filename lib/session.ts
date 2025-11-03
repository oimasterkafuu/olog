import { getIronSession, IronSession } from "iron-session";
import type { SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId?: string;
  username?: string;
}

const sessionCookieName = "olog_session";

const sessionOptions: SessionOptions = {
  password: process.env.IRON_SESSION_PASSWORD ?? "",
  cookieName: sessionCookieName,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export { sessionCookieName };
