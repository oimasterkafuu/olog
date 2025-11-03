import { jsonOk } from "@/lib/api";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return jsonOk({ authenticated: false });
  }

  return jsonOk({
    authenticated: true,
    username: session.username,
  });
}
