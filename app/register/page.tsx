import { redirect } from "next/navigation";

export default function RegisterPage({
  searchParams,
}: {
  searchParams?: { ref?: string };
}) {
  const params = new URLSearchParams({ mode: "register" });
  if (searchParams?.ref) params.set("ref", searchParams.ref);

  redirect(`/login?${params.toString()}`);
}
