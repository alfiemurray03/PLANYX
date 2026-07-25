const CURATED = [
  ['london','London','United Kingdom','GB','LONDON','57'],['edinburgh','Edinburgh','United Kingdom','GB','EDINBURGH',''],
  ['lisbon','Lisbon','Portugal','PT','LISBON',''],['porto','Porto','Portugal','PT','PORTO',''],['madeira','Madeira','Portugal','PT','FUNCHAL',''],
  ['barcelona','Barcelona','Spain','ES','BARCELONA','45'],['madrid','Madrid','Spain','ES','MADRID',''],['tenerife','Tenerife','Spain','ES','TENERIFE','2603'],
  ['paris','Paris','France','FR','PARIS','42'],['rome','Rome','Italy','IT','ROME','33'],['venice','Venice','Italy','IT','VENICE',''],['florence','Florence','Italy','IT','FLORENCE',''],
  ['athens','Athens','Greece','GR','ATHENS','91'],['amsterdam','Amsterdam','Netherlands','NL','AMSTERDAM','59'],['berlin','Berlin','Germany','DE','BERLIN',''],
  ['prague','Prague','Czech Republic','CZ','PRAGUE',''],['dublin','Dublin','Ireland','IE','DUBLIN',''],['dubai','Dubai','United Arab Emirates','AE','DUBAI','173'],
  ['new-york','New York','United States','US','NEW_YORK','16'],['las-vegas','Las Vegas','United States','US','LAS_VEGAS','67'],['orlando','Orlando','United States','US','ORLANDO',''],
  ['tokyo','Tokyo','Japan','JP','TOKYO','193'],['bangkok','Bangkok','Thailand','TH','BANGKOK',''],['singapore','Singapore','Singapore','SG','SINGAPORE',''],
  ['marrakech','Marrakech','Morocco','MA','MARRAKESH',''],['cape-town','Cape Town','South Africa','ZA','CAPE_TOWN',''],['sydney','Sydney','Australia','AU','',''],
  ['reykjavik','Reykjavik','Iceland','IS','',''],['copenhagen','Copenhagen','Denmark','DK','',''],['bali','Bali','Indonesia','ID','',''],
];

const RESTORED = `Abu Dhabi|Albania|Algarve|Alicante|Amalfi Coast|Amman|Amsterdam|Antalya|Antwerp|Aruba|Athens|Auckland|Australia|Austria|Ayia Napa|Azores|Bahamas|Balearic Islands|Bali|Bangkok|Barbados|Barcelona|Bath|Belfast|Belgium|Belgrade|Bergen|Berlin|Bern|Bilbao|Birmingham|Bodrum|Bologna|Bordeaux|Bosnia and Herzegovina|Boston|Bratislava|Brighton|Brisbane|Bruges|Brussels|Bucharest|Budapest|Budva|Bulgaria|Cairo|Cambridge|Canada|Canary Islands|Cancun|Cape Town|Cappadocia|Cardiff|Casablanca|Catania|Chiang Mai|Chicago|Cinque Terre|Cologne|Copenhagen|Corfu|Crete|Croatia|Cyprus|Czech Republic|Delhi|Denmark|Doha|Dominican Republic|Dubai|Dublin|Dubrovnik|Dusseldorf|Edinburgh|Egypt|England|Estonia|Finland|Florence|France|Frankfurt|French Riviera|Fuerteventura|Funchal|Gdansk|Geneva|Germany|Ghent|Glasgow|Gold Coast|Gothenburg|Gozo|Gran Canaria|Granada|Greece|Hamburg|Hanoi|Helsinki|Ho Chi Minh City|Hong Kong|Hungary|Hurghada|Hvar|Ibiza|Iceland|India|Indonesia|Innsbruck|Interlaken|Ireland|Istanbul|Italy|Jamaica|Japan|Johannesburg|Jordan|Kenya|Kos|Kotor|Krakow|Kuala Lumpur|Kyoto|Lake Bled|Lanzarote|Larnaca|Las Vegas|Latvia|Limassol|Lisbon|Lithuania|Liverpool|Ljubljana|London|Los Angeles|Lucerne|Luxembourg|Lyon|Madeira|Madrid|Malaga|Malaysia|Mallorca|Malta|Manchester|Marrakech|Marseille|Melbourne|Menorca|Mexico|Mexico City|Miami|Milan|Monaco|Montenegro|Montreal|Morocco|Mostar|Mumbai|Munich|Mykonos|Nairobi|Naples|Netherlands|New York|New Zealand|Nice|Nicosia|Northern Ireland|Norway|Orlando|Osaka|Oslo|Oxford|Palermo|Paphos|Paris|Petra|Phuket|Pisa|Poland|Ponta Delgada|Porto|Portugal|Prague|Punta Cana|Qatar|Quebec City|Queenstown|Reykjavik|Rhodes|Riga|Romania|Rome|Rotterdam|Salzburg|San Francisco|Santorini|Sarajevo|Sardinia|Scotland|Seoul|Serbia|Seville|Sharm El Sheikh|Sicily|Singapore|Sliema|Slovakia|Slovenia|Sofia|South Africa|South Korea|Spain|Split|St Julian's|Stockholm|Strasbourg|Stuttgart|Sweden|Switzerland|Sydney|Tallinn|Tenerife|Thailand|The Hague|Tirana|Tokyo|Toronto|Toulouse|Tromso|Tulum|Turkiye|United Arab Emirates|United Kingdom|United States|Valencia|Valletta|Vancouver|Venice|Verona|Vienna|Vietnam|Vilnius|Wales|Warsaw|Washington DC|Wroclaw|York|Zagreb|Zakynthos|Zanzibar|Zurich`.split('|');

function slugify(name) {
  return name.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function item({ slug, name, country = 'Worldwide', code = 'GL', providerLocationId = '', index = 0 }) {
  return { id: slug, slug, name, country, code, badge: '', imageUrl: '', enabled: true, featured: index < 8, providerLocationId, searchQuery: `${name}, ${country}`, sortOrder: index };
}

export async function onRequestGet() {
  const curated = new Map(CURATED.map(([slug,name,country,code,headout,gyg]) => [slug, { slug,name,country,code,headout,gyg }]));
  const headout = CURATED.filter(([, , , , headout]) => headout).map(([slug,name,country,code,headout], index) => item({ slug,name,country,code,providerLocationId: headout,index }));
  const getyourguide = RESTORED.map((name, index) => {
    const slug = slugify(name);
    const match = curated.get(slug);
    return item({ slug, name, country: match?.country || 'Worldwide', code: match?.code || 'GL', providerLocationId: match?.gyg || '', index });
  });
  return new Response(JSON.stringify({ success: true, headout, getyourguide }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
