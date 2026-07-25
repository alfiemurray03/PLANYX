import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ExternalLink, LockKeyhole, MapPinOff, MegaphoneOff, PhoneCall, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const safeguards = [
  { icon: LockKeyhole, title: 'High privacy by default', text: 'Accounts aged 16–17 are private by default. Public discovery and optional sharing are switched off unless a safe, informed choice is available.' },
  { icon: MegaphoneOff, title: 'No optional marketing or profiling by default', text: 'Optional marketing, behavioural profiling and non-essential personalisation are disabled for young-person accounts.' },
  { icon: MapPinOff, title: 'Location protection', text: 'Non-essential precise location is off by default. Planyx does not use a young person’s location to encourage unnecessary sharing.' },
  { icon: UserRoundCheck, title: 'Age-appropriate support', text: 'Privacy and safety explanations should be clear, short and understandable. Safeguarding concerns are handled separately from ordinary customer support.' },
];

export default function YoungPersonSafetyPage() {
  return (
    <>
      <Helmet>
        <title>16+ Safety and Safeguarding — Planyx</title>
        <meta name="description" content="Planyx's strict 16+ account rule and safeguards for young people aged 16 and 17." />
        <link rel="canonical" href="/safety" />
      </Helmet>

      <div className="bg-background">
        <section className="border-b border-border bg-gradient-to-br from-blue-50 via-white to-violet-50 px-5 py-16 dark:from-slate-950 dark:via-slate-950 dark:to-violet-950/30 sm:px-8 lg:px-10 lg:py-24">
          <div className="mx-auto max-w-5xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-blue-700 dark:border-blue-500/30 dark:bg-slate-900/80 dark:text-blue-200"><ShieldCheck className="h-4 w-4" /> Planyx safety</div>
            <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-[-0.045em] text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">Planyx accounts are strictly for people aged 16 or over.</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600 dark:text-slate-300">Nobody under 16 is permitted to register for or use a Planyx account. People aged 16–17 can use the service with enhanced privacy and safeguarding protections.</p>
            <div className="mt-7 flex flex-wrap gap-3"><Button asChild><Link to="/sign-in">Go to secure sign-in</Link></Button><Button asChild variant="outline"><Link to="/contact">Contact Planyx about safety</Link></Button></div>
          </div>
        </section>

        <div className="mx-auto max-w-6xl space-y-12 px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
          <section>
            <p className="text-xs font-black uppercase tracking-[0.13em] text-blue-700 dark:text-blue-300">Account eligibility</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">How the 16+ rule works</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <Card className="border-red-200 dark:border-red-500/30"><CardContent className="p-5"><p className="text-sm font-black text-red-700 dark:text-red-200">Under 16</p><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Registration and customer account access are blocked. Public information pages can still be viewed.</p></CardContent></Card>
              <Card className="border-violet-200 dark:border-violet-500/30"><CardContent className="p-5"><p className="text-sm font-black text-violet-700 dark:text-violet-200">Age 16–17</p><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Account access is permitted, with high-privacy defaults and enhanced young-person safeguards.</p></CardContent></Card>
              <Card className="border-emerald-200 dark:border-emerald-500/30"><CardContent className="p-5"><p className="text-sm font-black text-emerald-700 dark:text-emerald-200">Age 18+</p><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Adult account controls apply, subject to Planyx privacy, security and acceptable-use rules.</p></CardContent></Card>
            </div>
          </section>

          <section>
            <p className="text-xs font-black uppercase tracking-[0.13em] text-violet-700 dark:text-violet-300">Young-person accounts</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">Safeguards for people aged 16 and 17</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">These protections are applied automatically when the age check identifies a 16–17-year-old account.</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">{safeguards.map(({ icon: Icon, title, text }) => <Card key={title}><CardContent className="flex gap-4 p-5"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"><Icon className="h-5 w-5" /></div><div><h3 className="font-black text-slate-950 dark:text-white">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{text}</p></div></CardContent></Card>)}</div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10">
            <div className="grid gap-0 lg:grid-cols-2">
              <div className="p-6 sm:p-8"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-600 text-white"><PhoneCall className="h-5 w-5" /></div><div><p className="text-xs font-black uppercase tracking-wide text-red-700 dark:text-red-200">Immediate danger</p><h2 className="text-2xl font-black text-red-950 dark:text-white">Call 999 now</h2></div></div><p className="mt-4 text-sm leading-7 text-red-900 dark:text-red-100">Do not wait for a Planyx form or chatbot when a child, young person or adult is in immediate danger or a serious offence is happening.</p><a href="tel:999" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-red-600 px-5 font-black text-white hover:bg-red-700">Call 999</a></div>
              <div className="border-t border-red-200 bg-white/70 p-6 dark:border-red-500/30 dark:bg-slate-950/30 sm:p-8 lg:border-l lg:border-t-0"><h3 className="font-black text-slate-950 dark:text-white">Other safeguarding routes</h3><ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300"><li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" /><span>Contact the child or young person’s local council children’s social care team for abuse, neglect or exploitation concerns.</span></li><li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" /><span>Call 101 or report online for a non-emergency crime or police matter.</span></li><li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" /><span>Adults can contact the NSPCC on 0808 800 5000. Children and young people can contact Childline on 0800 1111.</span></li></ul><div className="mt-5 flex flex-wrap gap-2"><Button asChild variant="outline"><a href="https://www.gov.uk/report-child-abuse" target="_blank" rel="noreferrer">GOV.UK guidance <ExternalLink className="ml-2 h-4 w-4" /></a></Button><Button asChild variant="outline"><a href="https://www.childline.org.uk/get-support/" target="_blank" rel="noreferrer">Childline <ExternalLink className="ml-2 h-4 w-4" /></a></Button></div></div>
            </div>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 sm:p-8"><div className="flex items-start gap-3"><AlertTriangle className="mt-1 h-5 w-5 shrink-0" /><div><h2 className="text-xl font-black">Age checks and honesty</h2><p className="mt-2 text-sm leading-7">Giving a false date of birth breaches Planyx rules. Planyx may suspend an account, request a stronger age-assurance check or restrict features where age information appears inaccurate or safety risk requires it. Payment-card ownership is not treated as proof of age.</p></div></div></section>
        </div>
      </div>
    </>
  );
}
