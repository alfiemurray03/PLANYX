import { useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';

export default function AdminGateControlPage() {
  useEffect(() => {
    const stylesheetId = 'gate-control-centre-styles';
    let stylesheet = document.getElementById(stylesheetId) as HTMLLinkElement | null;
    let createdStylesheet = false;

    if (!stylesheet) {
      stylesheet = document.createElement('link');
      stylesheet.id = stylesheetId;
      stylesheet.rel = 'stylesheet';
      stylesheet.href = '/assets/admin-gates.css?v=2';
      document.head.appendChild(stylesheet);
      createdStylesheet = true;
    }

    document.getElementById('gate-control-centre-runtime')?.remove();
    const script = document.createElement('script');
    script.id = 'gate-control-centre-runtime';
    script.src = `/assets/admin-gates.js?v=2&route=${Date.now()}`;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      script.remove();
      const target = document.getElementById('gate-control-app');
      if (target) target.innerHTML = '';
      if (createdStylesheet) stylesheet?.remove();
    };
  }, []);

  return (
    <AdminLayout
      title="Gate Control Centre"
      subtitle="Manage the public Launch Gate, Maintenance Gate and website availability."
    >
      <div id="gate-control-app" className="min-h-[520px]">
        <div className="gate-admin__loading" role="status" aria-live="polite">
          <span aria-hidden="true" />
          <p>Loading Gate Control Centre…</p>
        </div>
      </div>
    </AdminLayout>
  );
}
