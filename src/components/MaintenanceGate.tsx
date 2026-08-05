/**
 * MaintenanceGate
 * Wraps customer-facing pages. When maintenance mode is on, shows the
 * maintenance page instead of the normal content.
 * Admin users (detected via localStorage session) bypass this gate.
 */
import { useFeatureConfig } from '@/lib/feature-config-context';
import { getAdminSession } from '@/lib/admin-types';
import { Wrench, Clock } from 'lucide-react';

export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { config, isLoading } = useFeatureConfig();

  // Don't block while loading — avoids flash
  if (isLoading) return <>{children}</>;

  // Admins bypass maintenance mode
  const adminSession = getAdminSession();
  if (adminSession) return <>{children}</>;

  if (!config.maintenance) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Wrench className="w-10 h-10 text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Under Maintenance</h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Sousa Murray Planeia is currently undergoing scheduled maintenance.
            We'll be back online shortly.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted rounded-lg px-4 py-3">
          <Clock className="w-4 h-4 shrink-0" />
          <span>We apologise for any inconvenience. Please check back soon.</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Need urgent help?{' '}
          <a href="mailto:contact@jagroupservices.co.uk" className="text-primary hover:underline">
            contact@jagroupservices.co.uk
          </a>
        </p>
      </div>
    </div>
  );
}
