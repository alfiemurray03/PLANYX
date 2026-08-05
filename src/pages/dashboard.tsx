import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ArrowRight, CheckCircle2, Compass, FileEdit, Map } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/lib/auth-context';
import type { ExperienceBuilder } from './builders-hub';

interface DashboardData {
  builders: ExperienceBuilder[];
  drafts: Array<{ id:string; builder_id:string; builder_name:string; last_saved_at:string }>;
  outputs: Array<{ id:string; builder_id:string; title:string; created_at:string }>;
  token_summary?: { plan_name?:string };
}

export default function DashboardPage() {
  const { user } = useAuth(); const [data,setData]=useState<DashboardData|null>(null); const [error,setError]=useState('');
  useEffect(()=>{fetch('/account/api/builders',{credentials:'include'}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error||'Your planning workspace could not be loaded.');setData(body)}).catch(e=>setError(e.message))},[]);
  const featured=(data?.builders||[]).filter(builder=>builder.featured).slice(0,3);
  return <><Helmet><title>Dashboard — Sousa Murray Planeia</title><meta name="robots" content="noindex,nofollow"/></Helmet><DashboardLayout><main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
    <section className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-7 sm:p-9 flex flex-col lg:flex-row lg:items-center justify-between gap-6"><div><p className="text-blue-700 font-semibold flex items-center gap-2"><Compass className="w-4 h-4"/>Your planning studio</p><h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-slate-950">Welcome back, {user?.firstName || 'Planner'}</h1><p className="mt-3 text-slate-600">Continue a plan or start building your next experience.</p></div><Link to="/builders" className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-6 py-3.5 font-semibold inline-flex items-center justify-center gap-2">Explore builders <ArrowRight className="w-4 h-4"/></Link></section>
    {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">{error}</div>}
    <section className="grid sm:grid-cols-3 gap-5">{[
      {label:'Available builders',value:data?.builders.length,Icon:Compass,colour:'bg-blue-100 text-blue-700'},
      {label:'Plans in progress',value:data?.drafts.length,Icon:FileEdit,colour:'bg-amber-100 text-amber-700'},
      {label:'Completed plans',value:data?.outputs.length,Icon:CheckCircle2,colour:'bg-emerald-100 text-emerald-700'},
    ].map(({label,value,Icon,colour})=><div key={label} className="rounded-2xl border border-slate-200 bg-white p-6 flex items-center justify-between"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-3xl font-bold text-slate-950">{data?String(value):'—'}</p></div><div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colour}`}><Icon className="w-6 h-6"/></div></div>)}</section>
    {(data?.drafts.length||0)>0&&<section><div className="flex items-center justify-between mb-4"><h2 className="text-xl font-bold">Continue planning</h2><Link to="/builders" className="text-sm font-semibold text-blue-700">View all</Link></div><div className="grid md:grid-cols-2 gap-4">{data!.drafts.slice(0,4).map(draft=><Link key={draft.id} to={`/builders/${draft.builder_id}`} className="rounded-2xl border border-slate-200 bg-white p-5 flex items-center justify-between hover:border-blue-300"><div><p className="font-semibold text-slate-950">{draft.builder_name}</p><p className="text-sm text-slate-500 mt-1">Saved {new Date(draft.last_saved_at).toLocaleDateString('en-GB')}</p></div><ArrowRight className="w-5 h-5 text-blue-600"/></Link>)}</div></section>}
    <section><div className="flex items-center justify-between mb-4"><div><h2 className="text-xl font-bold">Start with a popular builder</h2><p className="text-sm text-slate-500 mt-1">Guided tools for activities, days out and trips.</p></div></div><div className="grid md:grid-cols-3 gap-5">{(featured.length?featured:(data?.builders||[]).slice(0,3)).map(builder=><Link key={builder.id} to={`/builders/${builder.id}`} className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-blue-300 hover:shadow-lg transition-all"><div className="text-2xl">{builder.icon||'✨'}</div><h3 className="mt-4 font-bold text-lg group-hover:text-blue-700">{builder.name}</h3><p className="mt-2 text-sm text-slate-600 leading-relaxed">{builder.description}</p><span className="mt-5 text-sm font-semibold text-blue-700 flex items-center gap-1">Start planning <ArrowRight className="w-4 h-4"/></span></Link>)}</div></section>
    <section className="rounded-2xl bg-slate-950 text-white p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5"><div className="flex gap-4"><div className="w-11 h-11 rounded-xl bg-blue-500/20 text-blue-300 flex items-center justify-center"><Map/></div><div><h2 className="font-bold text-lg">Find an activity first</h2><p className="text-slate-300 text-sm mt-1">Browse Headout and GetYourGuide ideas, then turn your favourites into a plan.</p></div></div><div className="flex gap-3"><Link to="/headout" className="rounded-xl bg-white/10 hover:bg-white/20 px-4 py-2.5 font-semibold text-sm">Headout</Link><Link to="/getyourguide" className="rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 font-semibold text-sm">GetYourGuide</Link></div></section>
  </main></DashboardLayout></>;
}
