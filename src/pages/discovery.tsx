import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowRight, Compass, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const destinations = [
  'london', 'paris', 'rome', 'barcelona', 'amsterdam', 'dubai', 'new-york', 'lisbon',
  'athens', 'prague', 'budapest', 'edinburgh', 'dublin', 'madrid', 'venice', 'florence',
  'berlin', 'vienna', 'copenhagen', 'reykjavik', 'tokyo', 'singapore', 'bangkok', 'bali',
  'marrakech', 'cape-town', 'sydney', 'new-zealand', 'canary-islands', 'malta',
];

const pageCopy: Record<string, { title: string; description: string }> = {
  '/activities': { title: 'Activities & Things to Do', description: 'Discover activities, attractions and experiences, then bring your choices together in a personalised plan.' },
  '/experiences': { title: 'Experiences', description: 'Browse ideas for days out, holidays, celebrations, couples and family experiences.' },
  '/headout': { title: 'Explore with Headout', description: 'Browse bookable attractions and experiences through our Headout affiliate partnership.' },
  '/getyourguide': { title: 'Explore with GetYourGuide', description: 'Find tours, tickets and activities through our GetYourGuide affiliate partnership.' },
  '/booking-partners': { title: 'Booking Partners', description: 'Access selected third-party providers while keeping your plans organised with Sousa Murray Planeia.' },
  '/how-it-works': { title: 'How Sousa Murray Planeia Works', description: 'Discover, choose and organise your experience using guided planning tools.' },
  '/plan-your-trip': { title: 'Plan Your Trip', description: 'Bring destinations, activities, accessibility needs, budgets and booking information into one clear plan.' },
  '/planning-services': { title: 'Planning Services', description: 'Guided tools for practical, personalised everyday and travel planning.' },
  '/accommodation': { title: 'Accommodation', description: 'Organise accommodation ideas, requirements, accessibility information and booking details.' },
  '/transfers': { title: 'Transfers', description: 'Record transfer options and practical arrival and departure information.' },
  '/local-transport': { title: 'Local Transport', description: 'Plan how you will travel around your destination and keep useful transport notes together.' },
  '/travel-documentation-support': { title: 'Travel Documentation Support', description: 'Prepare a checklist of the travel documents and provider information you may need.' },
  '/accessibility-support': { title: 'Accessibility Support', description: 'Plan assistance, access requirements, equipment and questions for providers.' },
  '/selected-partner-hotels': { title: 'Selected Partner Hotels', description: 'Explore selected accommodation partners and record the options that suit your plans.' },
  '/budget-experiences': { title: 'Budget Experiences', description: 'Find ideas that work with your budget and organise expected costs clearly.' },
  '/family-experiences': { title: 'Family Experiences', description: 'Discover age-aware activities and create practical plans for the whole family.' },
  '/couples-experiences': { title: 'Couples Experiences', description: 'Plan date ideas, celebrations, short breaks and memorable shared experiences.' },
  '/about': { title: 'About Sousa Murray Planeia', description: 'A guided planning platform operated by JA Group Services Ltd.' },
  '/faqs': { title: 'Frequently Asked Questions', description: 'Helpful answers about builders, saved plans, providers, accounts and using the platform.' },
};

function titleFromSlug(slug = '') {
  return slug.split('-').filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}

export default function DiscoveryPage() {
  const { slug } = useParams();
  const { pathname } = useLocation();
  const isDestination = pathname.startsWith('/destinations/');
  const isDirectory = pathname === '/destinations' || pathname === '/destinations/';
  const copy = isDestination
    ? { title: titleFromSlug(slug), description: `Explore ideas, activities and practical planning information for ${titleFromSlug(slug)}.` }
    : isDirectory
      ? { title: 'Destinations', description: 'Explore destination ideas and turn your discoveries into a clear personalised plan.' }
      : pageCopy[pathname.replace(/\/$/, '')] ?? { title: titleFromSlug(pathname), description: 'Explore information and planning tools from Sousa Murray Planeia.' };

  const providerUrl = pathname.startsWith('/headout') ? 'https://www.headout.com/' : pathname.startsWith('/getyourguide') ? 'https://www.getyourguide.com/' : null;

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-secondary text-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-sm">
              <Compass className="h-4 w-4" /> Sousa Murray Planeia Discovery
            </div>
            <h1 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl">{copy.title}</h1>
            <p className="mt-5 max-w-2xl text-lg text-white/80">{copy.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90">
                <Link to="/builders">Build Your Plan <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              {providerUrl && <Button asChild size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10"><a href={providerUrl} target="_blank" rel="sponsored noopener noreferrer">Visit Provider</a></Button>}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-background py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {isDirectory ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {destinations.map((destination) => (
                <Link key={destination} to={`/destinations/${destination}/`} className="group rounded-xl border border-border bg-card p-5 transition hover:border-primary/40 hover:shadow-md">
                  <MapPin className="mb-3 h-5 w-5 text-primary" />
                  <h2 className="font-semibold text-foreground group-hover:text-primary">{titleFromSlug(destination)}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Explore destination</p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-3">
              {[
                { icon: Sparkles, title: 'Discover', text: 'Explore useful ideas, attractions, activities and provider options.' },
                { icon: MapPin, title: 'Personalise', text: 'Choose what suits your interests, access requirements, time and budget.' },
                { icon: ShieldCheck, title: 'Plan confidently', text: 'Keep practical details together and check information with providers before booking.' },
              ].map(({ icon: Icon, title, text }) => (
                <Card key={title}><CardContent className="p-6"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10"><Icon className="h-5 w-5 text-primary" /></div><h2 className="font-semibold text-foreground">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{text}</p></CardContent></Card>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
