/**
 * BuilderPlaceholder — shown for builders that are not yet implemented.
 * Accepts `builderName` and `builderId` props via the route state or search params.
 */
import { useLocation, Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Wrench, ArrowLeft } from 'lucide-react';

interface PlaceholderProps {
  builderName: string;
}

export default function BuilderPlaceholder({ builderName }: PlaceholderProps) {
  const location = useLocation();
  // Allow override via location state (e.g. from a dynamic route)
  const name = (location.state as { builderName?: string } | null)?.builderName ?? builderName;

  return (
    <>
      <Helmet>
        <title>{name} — Sousa Murray Planeia</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-6">
            <Wrench className="w-8 h-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">{name}</h1>
          <p className="text-muted-foreground text-sm max-w-sm mb-6">
            This builder is coming soon. We're working hard to bring it to you.
            Check back shortly or explore our available builders in the meantime.
          </p>
          <div className="flex gap-3">
            <Button asChild variant="outline" size="sm">
              <Link to="/builders">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Builders Hub
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/dashboard">Go to Dashboard</Link>
            </Button>
          </div>
        </div>
      </DashboardLayout>
    </>
  );
}
