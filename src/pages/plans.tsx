import { Helmet } from '@dr.pogodin/react-helmet';
import StandardBusinessPlans from '@/components/StandardBusinessPlans';

export default function PlansPage() {
  return (
    <>
      <Helmet>
        <title>Standard & Business Plans | Planyx</title>
        <meta name="description" content="Compare Planyx Standard Plans for individuals and separately billed Business Plans for organisations." />
        <link rel="canonical" href="https://planyx.jagroupservices.co.uk/plans" />
      </Helmet>
      <main className="min-h-screen bg-background">
        <section className="border-b border-border bg-gradient-to-b from-primary/10 to-background px-4 py-20 text-center">
          <p className="text-sm font-bold uppercase tracking-wider text-primary">Planyx subscriptions</p>
          <h1 className="mx-auto mt-3 max-w-4xl text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">Standard Plans and Business Plans</h1>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">Standard Plans are private individual subscriptions. Business Plans are a separate Stripe catalogue with organisation-specific sharing, collaboration and workspace permissions.</p>
        </section>
        <div className="px-4 py-16 sm:px-6 lg:px-8"><StandardBusinessPlans comparisons /></div>
      </main>
    </>
  );
}
