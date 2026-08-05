/**
 * /sign/:token — Public signer page.
 * No authentication required. Signers access this via their unique email link.
 */
import { useState, useEffect, useRef } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  PenLine, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  FileText, Clock, Shield, ChevronDown,
} from 'lucide-react';
import type { SigningField, FieldType } from '@/lib/signing-types';
import { FIELD_TYPE_LABELS } from '@/lib/signing-types';

interface SignerData {
  uuid: string;
  name: string;
  email: string;
  role: string | null;
  status: string;
}

interface RequestData {
  uuid: string;
  title: string;
  message: string | null;
  documentPath: string | null;
  documentName: string | null;
  status: string;
  expiresAt: string | null;
}

export default function PublicSignerPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [request, setRequest] = useState<RequestData | null>(null);
  const [signer, setSigner] = useState<SignerData | null>(null);
  const [fields, setFields] = useState<SigningField[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [waitingForPrevious, setWaitingForPrevious] = useState(false);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedCompleted, setSubmittedCompleted] = useState(false);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const [drawing, setDrawing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!token) return;
    fetch(`/api/signing/sign/${token}`)
      .then(r => r.json())
      .then(data => {
        if (!data.success) {
          if (data.code === 'TOKEN_EXPIRED') setTokenExpired(true);
          else setError(data.error);
        } else if (data.alreadySigned) {
          setAlreadySigned(true);
          setSigner({ uuid: '', name: data.signerName, email: '', role: null, status: 'signed' });
        } else if (data.declined) {
          setDeclined(true);
          setSigner({ uuid: '', name: data.signerName, email: '', role: null, status: 'declined' });
        } else if (data.waitingForPrevious) {
          setWaitingForPrevious(true);
          setSigner({ uuid: '', name: data.signerName, email: '', role: null, status: 'pending' });
        } else {
          setRequest(data.request);
          setSigner(data.signer);
          setFields(data.fields ?? []);
        }
      })
      .catch(() => setError('Failed to load signing request. Please try again.'))
      .finally(() => setLoading(false));
  }, [token]);

  // Canvas drawing for signature/initials
  function startDraw(fieldUuid: string, e: React.MouseEvent<HTMLCanvasElement>) {
    setDrawing(prev => ({ ...prev, [fieldUuid]: true }));
    const canvas = canvasRefs.current[fieldUuid];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }

  function draw(fieldUuid: string, e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing[fieldUuid]) return;
    const canvas = canvasRefs.current[fieldUuid];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = '#1B4F8A';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function endDraw(fieldUuid: string) {
    setDrawing(prev => ({ ...prev, [fieldUuid]: false }));
    const canvas = canvasRefs.current[fieldUuid];
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setFieldValues(prev => ({ ...prev, [fieldUuid]: dataUrl }));
  }

  function clearCanvas(fieldUuid: string) {
    const canvas = canvasRefs.current[fieldUuid];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setFieldValues(prev => { const n = { ...prev }; delete n[fieldUuid]; return n; });
  }

  async function handleSign() {
    // Validate required fields
    const missing = fields.filter(f => f.required && !fieldValues[f.uuid] && f.fieldType !== 'checkbox');
    if (missing.length > 0) {
      setError(`Please complete all required fields: ${missing.map(f => f.label || FIELD_TYPE_LABELS[f.fieldType as FieldType]).join(', ')}`);
      return;
    }
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`/api/signing/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign', fieldValues }),
      });
      const data = await res.json();
      if (data.success) { setSubmitted(true); setSubmittedCompleted(data.completed); }
      else setError(data.error);
    } catch { setError('Failed to submit. Please try again.'); }
    finally { setSubmitting(false); }
  }

  async function handleDecline() {
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`/api/signing/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decline', declineReason }),
      });
      const data = await res.json();
      if (data.success) { setDeclined(true); }
      else setError(data.error);
    } catch { setError('Failed to submit. Please try again.'); }
    finally { setSubmitting(false); }
  }

  const APP_NAME = 'Sousa Murray Planeia';

  if (loading) return (
    <div className="min-h-screen bg-muted/20 flex items-center justify-center">
      <RefreshCw className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  // Error / special states
  const renderState = (icon: React.ReactNode, title: string, body: string, sub?: string) => (
    <div className="min-h-screen bg-muted/20 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">{icon}</div>
        <h1 className="text-xl font-bold text-foreground mb-2">{title}</h1>
        <p className="text-muted-foreground text-sm">{body}</p>
        {sub && <p className="text-xs text-muted-foreground mt-2">{sub}</p>}
        <div className="mt-6 pt-4 border-t border-border text-xs text-muted-foreground">{APP_NAME} · Secure Document Signing</div>
      </div>
    </div>
  );

  if (tokenExpired) return renderState(<Clock className="w-8 h-8 text-amber-500" />, 'Link Expired', 'This signing link has expired. Please contact the document owner to request a new link.');
  if (alreadySigned) return renderState(<CheckCircle2 className="w-8 h-8 text-green-600" />, 'Already Signed', `You have already signed this document, ${signer?.name}. Thank you!`);
  if (declined) return renderState(<XCircle className="w-8 h-8 text-red-500" />, 'Declined', 'You have declined to sign this document. The document owner has been notified.');
  if (waitingForPrevious) return renderState(<Clock className="w-8 h-8 text-blue-500" />, 'Not Your Turn Yet', `Hello ${signer?.name}, this document uses sequential signing. You will receive an email when it is your turn to sign.`);
  if (error && !request) return renderState(<AlertTriangle className="w-8 h-8 text-red-500" />, 'Unable to Load', error);

  if (submitted) return (
    <div className="min-h-screen bg-muted/20 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-5" />
        <h1 className="text-xl font-bold text-foreground mb-2">Document Signed!</h1>
        <p className="text-muted-foreground text-sm mb-2">Thank you, {signer?.name}. Your signature has been recorded.</p>
        {submittedCompleted && <p className="text-sm text-green-700 font-medium">All parties have now signed — the document is complete.</p>}
        <div className="mt-6 pt-4 border-t border-border text-xs text-muted-foreground">{APP_NAME} · Secure Document Signing</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/20">
      <Helmet><title>Sign Document — {request?.title ?? APP_NAME}</title></Helmet>

      {/* Header */}
      <header className="bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <PenLine className="w-4 h-4 text-primary-foreground" />
        </div>
        <div>
          <div className="font-semibold text-sm text-foreground">{APP_NAME}</div>
          <div className="text-xs text-muted-foreground">Secure Document Signing</div>
        </div>
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Shield className="w-3 h-3" /> Secured
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Document info */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start gap-3">
            <FileText className="w-8 h-8 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-foreground">{request?.title}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Hello <strong>{signer?.name}</strong>, you have been asked to sign this document.
                {signer?.role && ` Your role: ${signer.role}.`}
              </p>
              {request?.message && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                  {request.message}
                </div>
              )}
              {request?.expiresAt && (
                <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Expires {new Date(request.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Document preview */}
        {request?.documentPath && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{request.documentName}</span>
            </div>
            {request.documentPath.match(/\.(png|jpg|jpeg)$/i) ? (
              <img src={request.documentPath} alt={request.documentName ?? 'Document'} className="w-full" />
            ) : (
              <div className="p-4 text-center">
                <a href={request.documentPath} target="_blank" rel="noopener noreferrer" className="text-primary text-sm underline">
                  Open document to review before signing
                </a>
              </div>
            )}
          </div>
        )}

        {/* Signing fields */}
        {fields.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-foreground">Complete the following fields</h2>
            {fields.map(field => (
              <div key={field.uuid} className="space-y-1">
                <label className="text-sm font-medium text-foreground flex items-center gap-1">
                  {field.label || FIELD_TYPE_LABELS[field.fieldType as FieldType]}
                  {field.required && <span className="text-red-500">*</span>}
                  <Badge variant="outline" className="text-[10px] h-4 ml-1">{FIELD_TYPE_LABELS[field.fieldType as FieldType]}</Badge>
                </label>

                {(field.fieldType === 'signature' || field.fieldType === 'initials') && (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <canvas
                      ref={el => { canvasRefs.current[field.uuid] = el; }}
                      width={field.fieldType === 'initials' ? 200 : 400}
                      height={field.fieldType === 'initials' ? 80 : 120}
                      className="w-full cursor-crosshair bg-white touch-none"
                      style={{ maxHeight: field.fieldType === 'initials' ? '80px' : '120px' }}
                      onMouseDown={e => startDraw(field.uuid, e)}
                      onMouseMove={e => draw(field.uuid, e)}
                      onMouseUp={() => endDraw(field.uuid)}
                      onMouseLeave={() => endDraw(field.uuid)}
                    />
                    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-t border-border">
                      <span className="text-xs text-muted-foreground">Draw your {field.fieldType} above</span>
                      <button onClick={() => clearCanvas(field.uuid)} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
                    </div>
                  </div>
                )}

                {field.fieldType === 'name' && (
                  <input
                    type="text"
                    value={fieldValues[field.uuid] ?? ''}
                    onChange={e => setFieldValues(prev => ({ ...prev, [field.uuid]: e.target.value }))}
                    placeholder="Enter your full name"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                )}

                {field.fieldType === 'date' && (
                  <input
                    type="date"
                    value={fieldValues[field.uuid] ?? new Date().toISOString().slice(0, 10)}
                    onChange={e => setFieldValues(prev => ({ ...prev, [field.uuid]: e.target.value }))}
                    className="border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                )}

                {field.fieldType === 'checkbox' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fieldValues[field.uuid] === 'true'}
                      onChange={e => setFieldValues(prev => ({ ...prev, [field.uuid]: e.target.checked ? 'true' : 'false' }))}
                      className="w-5 h-5 rounded border-border"
                    />
                    <span className="text-sm text-foreground">I agree / confirm</span>
                  </label>
                )}

                {field.fieldType === 'text' && (
                  <input
                    type="text"
                    value={fieldValues[field.uuid] ?? ''}
                    onChange={e => setFieldValues(prev => ({ ...prev, [field.uuid]: e.target.value }))}
                    placeholder={field.label ?? 'Enter text'}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {/* Actions */}
        {!showDeclineForm ? (
          <div className="flex gap-3">
            <Button
              onClick={handleSign}
              disabled={submitting}
              className="flex-1 gap-2 h-12 text-base"
            >
              {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
              {submitting ? 'Submitting…' : 'Sign Document'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowDeclineForm(true)}
              disabled={submitting}
              className="gap-2 text-red-600 border-red-200 hover:border-red-300 hover:bg-red-50"
            >
              <XCircle className="w-4 h-4" /> Decline
            </Button>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-red-800">Decline to Sign</h3>
            <p className="text-sm text-red-700">Please provide a reason for declining (optional):</p>
            <Textarea
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
              placeholder="Reason for declining…"
              rows={3}
              className="bg-white"
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowDeclineForm(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleDecline} disabled={submitting} className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-2">
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Confirm Decline
              </Button>
            </div>
          </div>
        )}

        {/* Legal notice */}
        <div className="text-center text-xs text-muted-foreground space-y-1 pb-4">
          <p className="flex items-center justify-center gap-1"><Shield className="w-3 h-3" /> Your signature is secured and legally binding.</p>
          <p>By signing, you confirm you have read and agree to the document above.</p>
          <p className="mt-2">{APP_NAME} · Secure Document Signing</p>
        </div>
      </div>
    </div>
  );
}
