import { requireScreen } from "@/lib/screen-guard";
import UsersConsole from "@/components/admin/UsersConsole";

export const metadata = { title: "User & Role Management — Command Centre" };

export default async function AdminUsersPage() {
  await requireScreen("users");
  return <UsersConsole />;
}
