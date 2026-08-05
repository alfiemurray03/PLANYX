import { useState, useRef } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  ChevronRight, ChevronLeft, Plus, Trash2, Upload,
  PenLine, Users, FileText, Send, CheckCircle2, AlertTriangle,
  GripVertical, X, RefreshCw,
} from 'lucide-react';
import type { FieldType } from '@/lib/signing-types';
import FieldCanvas from '@/components/signing/FieldCanvas';

interface SignerDraft {
  id: string;
  name: string;
  email: string;
  role: string;
  order: number;
}

interface FieldDraft {
  id: string;
  signerId: string;
  fieldType: FieldType;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  label: string;
}

const STEPS = [
  { id: 'details', label: 'Details', icon: FileText },
  { id: 'document', label: 'Document', icon: Upload },
  { id: 'signers', label: 'Signers', icon: Users },
  { id: 'fields', label: 'Fields', icon: PenLine },
  { id: 'review', label: 'Review & Send', icon: Send },
];

export default function NewSigningRequestPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [requestUuid, setRequestUuid] = useState('');

  // Step 1: Details
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [signerOrder, setSignerOrder] = useState<'any' | 'sequential'>('any');
  const [expiresAt, setExpiresAt] = useState('');
  const [reminderDays, setReminderDays] = useState(3);

  // Step 2: Document
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docUploaded, setDocUploaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 3: Signers
  const [signers, setSigners] = useState<SignerDraft[]>([]);
  const [newSignerName, setNewSignerName] = useState('');
  const [newSignerEmail, setNewSignerEmail] = useState('');
  const [newSignerRole, setNewSignerRole] = useState('');

  // Step 4: Fields
  const [fields, setFields] = useState<FieldDraft[]>([]);

  // Step 5: Sending
  const [sent, setSent] = useState(false);

  function addSigner() {
    if (!newSignerName.trim() || !newSignerEmail.trim()) return;
    setSigners(prev => [...prev, {
      id: crypto.randomUUID(),
      name: newSignerName.trim(),
      email: newSignerEmail.trim().toLowerCase(),
      role: newSignerRole.trim(),
      order: prev.length + 1,
    }]);
    setNewSignerName(''); setNewSignerEmail(''); setNewSignerRole('');
  }

  function removeSigner(id: string) {
    setSigners(prev => prev.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i + 1 })));
    setFields(prev => prev.filter(f => f.signerId !== id));
  }

  async function handleCreateAndSave() {
    if (!title.trim()) { setError('Please enter a document title.'); return; }
    setSaving(true); setError('');
    try {
      // Create request
      const res = await fetch('/api/signing/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title, message, signerOrder, expiresAt: expiresAt || undefined, reminderDays }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error); setSaving(false); return; }
      const uuid = data.request.uuid;
      setRequestUuid(uuid);

      // Upload document if provided
      if (docFile) {
        const reader = new FileReader();
        await new Promise<void>((resolve, reject) => {
          reader.onload = async () => {
            const base64 = (reader.result as string).split(',')[1];
            const upRes = await fetch(`/api/signing/requests/${uuid}/upload`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ filename: docFile.name, mimeType: docFile.type, data: base64 }),
            });
            const upData = await upRes.json();
            if (!upData.success) reject(new Error(upData.error));
            else resolve();
          };
          reader.onerror = reject;
          reader.readAsDataURL(docFile);
        });
      }

      // Save signers + fields
      if (signers.length > 0) {
        const patchRes = await fetch(`/api/signing/requests/${uuid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ signers, fields }),
        });
        const patchData = await patchRes.json();
        if (!patchData.success) { setError(patchData.error); setSaving(false); return; }
      }

      setStep(4);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    if (!requestUuid) return;
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/signing/requests/${requestUuid}/send`, {
        method: 'POST', credentials: 'include',
      });
      const data = await res.json();
      if (!data.success) { setError(data.error); setSaving(false); return; }
      setSent(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    await handleCreateAndSave();
    if (requestUuid) navigate(`/signing/${requestUuid}`);
  }

  const canProceed = [
    !!title.trim(),
    true, // document optional
    signers.length > 0,
    true, // fields optional
    true,
  ][step];

  return (
    <DashboardLayout>
      <Helmet><title>New Signing Request — Sousa Murray Planeia</title></Helmet>
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <PenLine className="w-5 h-5 text-primary" /> New Signing Request
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Set up a document for secure online signing</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1 shrink-0">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${i === step ? 'bg-primary text-primary-foreground' : i < step ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                {i < step ? <CheckCircle2 className="w-3 h-3" /> : <s.icon className="w-3 h-3" />}
                {s.label}
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 mb-4 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Step content */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          {/* Step 0: Details */}
          {step === 0 && (
            <>
              <h2 className="font-semibold text-foreground">Document Details</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Document Title <span className="text-red-500">*</span></Label>
                  <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Service Agreement — Acme Ltd" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="message">Message to Signers (optional)</Label>
                  <Textarea id="message" value={message} onChange={e => setMessage(e.target.value)} placeholder="Add a personal message that will appear in the signing email…" rows={3} className="mt-1" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Signing Order</Label>
                    <Select value={signerOrder} onValueChange={v => setSignerOrder(v as 'any' | 'sequential')}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any order (all at once)</SelectItem>
                        <SelectItem value="sequential">Sequential (one by one)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="expires">Expiry Date (optional)</Label>
                    <Input id="expires" type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="mt-1" min={new Date().toISOString().slice(0, 10)} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="reminder">Reminder (days before expiry)</Label>
                  <Input id="reminder" type="number" min={1} max={30} value={reminderDays} onChange={e => setReminderDays(parseInt(e.target.value) || 3)} className="mt-1 w-32" />
                </div>
              </div>
            </>
          )}

          {/* Step 1: Document */}
          {step === 1 && (
            <>
              <h2 className="font-semibold text-foreground">Upload Document</h2>
              <p className="text-sm text-muted-foreground">Upload the document you want signed. Supported formats: PDF, PNG, JPEG (max 20 MB).</p>
              <div
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${docFile ? 'border-green-400 bg-green-50' : 'border-border hover:border-primary/50 hover:bg-muted/20'}`}
              >
                <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setDocFile(f); }} />
                {docFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                    <div className="text-left">
                      <div className="font-semibold text-foreground">{docFile.name}</div>
                      <div className="text-sm text-muted-foreground">{(docFile.size / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setDocFile(null); }}><X className="w-4 h-4" /></Button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-medium text-foreground">Click to upload or drag and drop</p>
                    <p className="text-sm text-muted-foreground mt-1">PDF, PNG, JPEG — max 20 MB</p>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">You can also skip this step and upload the document later from the request detail page.</p>
            </>
          )}

          {/* Step 2: Signers */}
          {step === 2 && (
            <>
              <h2 className="font-semibold text-foreground">Add Signers</h2>
              <p className="text-sm text-muted-foreground">Add the people who need to sign this document.</p>

              {/* Add signer form */}
              <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Full Name <span className="text-red-500">*</span></Label>
                    <Input value={newSignerName} onChange={e => setNewSignerName(e.target.value)} placeholder="Jane Smith" className="mt-1 h-9 text-sm" onKeyDown={e => e.key === 'Enter' && addSigner()} />
                  </div>
                  <div>
                    <Label className="text-xs">Email Address <span className="text-red-500">*</span></Label>
                    <Input type="email" value={newSignerEmail} onChange={e => setNewSignerEmail(e.target.value)} placeholder="jane@example.com" className="mt-1 h-9 text-sm" onKeyDown={e => e.key === 'Enter' && addSigner()} />
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label className="text-xs">Role (optional)</Label>
                    <Input value={newSignerRole} onChange={e => setNewSignerRole(e.target.value)} placeholder="e.g. Client, Contractor" className="mt-1 h-9 text-sm" />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={addSigner} disabled={!newSignerName.trim() || !newSignerEmail.trim()} className="gap-1 h-9">
                      <Plus className="w-4 h-4" /> Add
                    </Button>
                  </div>
                </div>
              </div>

              {/* Signer list */}
              {signers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No signers added yet.</p>
              ) : (
                <div className="space-y-2">
                  {signers.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
                      <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-foreground">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.email}{s.role && ` · ${s.role}`}</div>
                      </div>
                      <button onClick={() => removeSigner(s.id)} className="text-muted-foreground hover:text-red-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Step 3: Fields */}
          {step === 3 && (
            <>
              <h2 className="font-semibold text-foreground">Signing Fields</h2>
              <p className="text-sm text-muted-foreground">
                Select a signer and field type, then click on the document canvas to place the field. Drag placed fields to reposition them.
              </p>

              {signers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Add signers first before placing fields.</p>
                </div>
              ) : (
                <FieldCanvas
                  signers={signers}
                  fields={fields}
                  setFields={setFields}
                  docFile={docFile}
                />
              )}
              <p className="text-xs text-muted-foreground">Field positions are stored as percentages of the document area and will be overlaid when signers view the document.</p>
            </>
          )}

          {/* Step 4: Review & Send */}
          {step === 4 && !sent && (
            <>
              <h2 className="font-semibold text-foreground">Review & Send</h2>
              <div className="space-y-3">
                <div className="bg-muted/30 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Title</span><span className="font-medium text-foreground">{title}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Signing order</span><span className="font-medium text-foreground capitalize">{signerOrder}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Signers</span><span className="font-medium text-foreground">{signers.length}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Fields</span><span className="font-medium text-foreground">{fields.length}</span></div>
                  {expiresAt && <div className="flex justify-between"><span className="text-muted-foreground">Expires</span><span className="font-medium text-foreground">{new Date(expiresAt).toLocaleDateString('en-GB')}</span></div>}
                  {docFile && <div className="flex justify-between"><span className="text-muted-foreground">Document</span><span className="font-medium text-foreground">{docFile.name}</span></div>}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Signers who will receive emails:</p>
                  {signers.map(s => (
                    <div key={s.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                      {s.name} ({s.email}){s.role && ` — ${s.role}`}
                    </div>
                  ))}
                </div>
              </div>
              {!requestUuid && (
                <Button onClick={handleCreateAndSave} disabled={saving} className="w-full gap-2">
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {saving ? 'Saving…' : 'Save & Continue'}
                </Button>
              )}
              {requestUuid && (
                <Button onClick={handleSend} disabled={saving || signers.length === 0} className="w-full gap-2">
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {saving ? 'Sending…' : `Send to ${signers.length} Signer${signers.length !== 1 ? 's' : ''}`}
                </Button>
              )}
            </>
          )}

          {/* Sent confirmation */}
          {step === 4 && sent && (
            <div className="text-center py-8">
              <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">Signing Request Sent!</h2>
              <p className="text-muted-foreground mb-6">
                Signing invitations have been sent to {signers.length} signer{signers.length !== 1 ? 's' : ''}. You'll be notified when they sign.
              </p>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={() => navigate('/signing')}>Back to Dashboard</Button>
                <Button onClick={() => navigate(`/signing/${requestUuid}`)}>View Request</Button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        {!(step === 4 && sent) && (
          <div className="flex justify-between mt-4">
            <Button variant="outline" onClick={() => step === 0 ? navigate('/signing') : setStep(s => s - 1)} className="gap-2">
              <ChevronLeft className="w-4 h-4" /> {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            {step < 4 && (
              <div className="flex gap-2">
                {step === 3 && (
                  <Button variant="outline" onClick={handleSaveDraft} disabled={saving}>
                    Save as Draft
                  </Button>
                )}
                <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed} className="gap-2">
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
