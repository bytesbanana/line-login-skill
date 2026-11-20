import { redirect } from "next/navigation";
import { startLogin } from "../../../lib/line-session";

export async function GET() {
  redirect(await startLogin());
}
