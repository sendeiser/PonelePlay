import { SubscriptionManager } from "@/components/panel/subscription-manager";

interface SubscriptionPageProps {
  params: Promise<{ slug: string }>;
}

export default async function SubscriptionPage({ params }: SubscriptionPageProps) {
  const { slug } = await params;
  return <SubscriptionManager slug={slug} />;
}

