import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Sign in — DisasterLink" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <LoginForm next={next} />;
}
