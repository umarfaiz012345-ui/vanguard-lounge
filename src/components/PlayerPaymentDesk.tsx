import React, { useEffect, useState } from 'react';
import {
  CreditCard,
  Upload,
  Clock,
  CheckCircle,
  XCircle,
  ExternalLink,
  DollarSign,
  AlertCircle,
  FileText,
  Shield,
  Eye,
  X,
  RefreshCw,
  Info,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { PaymentMethodInfo, PaymentSubmission } from '../types/portal';

export const PlayerPaymentDesk: React.FC = () => {
  const [methods, setMethods] = useState<PaymentMethodInfo[]>([]);
  const [submissions, setSubmissions] = useState<PaymentSubmission[]>([]);
  const [selectedMethodId, setSelectedMethodId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [playerNotes, setPlayerNotes] = useState<string>('');
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);

  const [loadingMethods, setLoadingMethods] = useState(true);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [viewingReceiptUrl, setViewingReceiptUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchMethods();
    fetchSubmissions();
  }, []);

  const fetchMethods = async () => {
    try {
      setLoadingMethods(true);
      const res = await apiFetch<{ paymentMethods: PaymentMethodInfo[] }>('/api/payments/methods');
      setMethods(res.paymentMethods || []);
      if (res.paymentMethods && res.paymentMethods.length > 0) {
        setSelectedMethodId(res.paymentMethods[0].id);
      }
    } catch {
      setError('Unable to load available payment instructions.');
    } finally {
      setLoadingMethods(false);
    }
  };

  const fetchSubmissions = async () => {
    try {
      setLoadingSubmissions(true);
      const res = await apiFetch<{ submissions: PaymentSubmission[] }>('/api/payments/my-submissions');
      setSubmissions(res.submissions || []);
    } catch {
      // Ignore background refresh error
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image receipt (JPEG, PNG, or WebP).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size must not exceed 10MB.');
      return;
    }

    setReceiptFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setReceiptBase64(reader.result as string);
      setError(null);
    };
    reader.onerror = () => {
      setError('Unable to read the selected image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid payment amount greater than zero.');
      return;
    }

    if (!selectedMethodId) {
      setError('Please select a payment method.');
      return;
    }

    if (!receiptBase64) {
      setError('Please upload your receipt or transfer confirmation screenshot.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Upload receipt image to secure storage
      const uploadRes = await apiFetch<{ url: string }>('/api/upload/receipt', {
        method: 'POST',
        body: JSON.stringify({
          imageBase64: receiptBase64,
          fileName: receiptFileName,
          mimeType: receiptBase64.split(';')[0]?.replace('data:', '') || 'image/jpeg',
        }),
      });

      // 2. Submit payment confirmation for VIP desk review
      await apiFetch<{ ok: boolean; submission: PaymentSubmission }>('/api/payments/submit', {
        method: 'POST',
        body: JSON.stringify({
          methodId: selectedMethodId,
          amount: numAmount,
          currency: 'USD',
          receiptUrl: uploadRes.url,
          playerNotes: playerNotes.trim() || undefined,
        }),
      });

      setSuccess('Payment submission received! Our VIP Review Desk has been notified and will verify your receipt shortly.');
      setAmount('');
      setPlayerNotes('');
      setReceiptBase64(null);
      setReceiptFileName(null);
      fetchSubmissions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedMethod = methods.find((m) => m.id === selectedMethodId);

  return (
    <div className="space-y-8">
      {/* Policy Notice Header */}
      <div className="rounded-2xl border border-[#F59E0B]/30 bg-gradient-to-r from-[#1E2E4D]/60 via-[#0A1224] to-[#1E2E4D]/60 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/30 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-[#F59E0B]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>External Payment Desk</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#F59E0B]/20 text-[#F59E0B] font-semibold border border-[#F59E0B]/30">
                  Manual Verification Only
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                For strict regulatory and platform compliance, all transfers are conducted exclusively through external services (Cash App, Venmo, Zelle, Crypto). We maintain NO internal wallet balances. Each transaction is manually audited by authorized VIP desk staff upon receipt submission.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchSubmissions}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1E2E4D] bg-[#0D1629] text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Status</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Payment Instructions & Submit Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: External Payment Methods */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-5 shadow-xl">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#F59E0B]" />
              <span>1. Choose Transfer Method</span>
            </h2>

            {loadingMethods ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading payment options...</div>
            ) : methods.length === 0 ? (
              <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs">
                No active payment channels configured right now. Please contact Live Chat Support for VIP payment instructions.
              </div>
            ) : (
              <div className="space-y-3">
                {methods.map((method) => {
                  const isSelected = method.id === selectedMethodId;
                  return (
                    <div
                      key={method.id}
                      onClick={() => setSelectedMethodId(method.id)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#F59E0B] bg-[#16223B] shadow-md shadow-[#F59E0B]/10'
                          : 'border-[#1E2E4D] bg-[#080E1C] hover:border-[#2A3F66]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-sm text-white">{method.label}</span>
                        {isSelected && (
                          <span className="text-[10px] uppercase font-bold text-[#F59E0B] px-2 py-0.5 rounded bg-[#F59E0B]/20">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono text-[#F59E0B] break-all mb-1">
                        {method.accountOrAddress}
                      </div>
                      {method.networkOrRouting && (
                        <div className="text-[11px] text-slate-400">
                          Network / Detail: <span className="text-slate-300 font-semibold">{method.networkOrRouting}</span>
                        </div>
                      )}
                      {method.instructions && (
                        <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-[#1E2E4D]">
                          {method.instructions}
                        </div>
                      )}
                      {method.externalUrl && (
                        <div className="mt-3">
                          <a
                            href={method.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F59E0B] hover:text-[#FBBF24] transition-colors"
                          >
                            <span>Open {method.label} Externally</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Submission Form */}
        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-6 shadow-xl">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#F59E0B]" />
              <span>2. Submit Transfer Receipt for Review</span>
            </h2>

            {error && (
              <div className="mb-4 p-3 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">{error}</div>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 text-xs flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1">{success}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Selected Payment Method
                </label>
                <div className="p-3 rounded-xl border border-[#1E2E4D] bg-[#080E1C] text-sm text-white font-medium flex items-center justify-between">
                  <span>{selectedMethod ? selectedMethod.label : 'Select a method from left'}</span>
                  {selectedMethod && (
                    <span className="text-xs font-mono text-[#F59E0B]">{selectedMethod.accountOrAddress}</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Amount Transferred (USD)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 50.00"
                    className="w-full bg-[#080E1C] border border-[#1E2E4D] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F59E0B] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Upload Receipt / Screenshot Proof
                </label>
                <div className="rounded-xl border-2 border-dashed border-[#1E2E4D] hover:border-[#F59E0B]/60 p-4 bg-[#080E1C] text-center transition-colors">
                  <input
                    type="file"
                    id="receipt-file-input"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label htmlFor="receipt-file-input" className="cursor-pointer block">
                    {receiptBase64 ? (
                      <div className="flex flex-col items-center gap-2">
                        <img
                          src={receiptBase64}
                          alt="Receipt Preview"
                          className="max-h-36 rounded-lg object-contain border border-[#1E2E4D]"
                        />
                        <span className="text-xs text-emerald-400 font-medium">
                          {receiptFileName || 'Image attached'} (Click to change)
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 py-2">
                        <Upload className="w-8 h-8 text-slate-500" />
                        <span className="text-xs font-semibold text-slate-300">
                          Click to select receipt screenshot
                        </span>
                        <span className="text-[11px] text-slate-500">
                          PNG, JPG, or WEBP up to 10MB
                        </span>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Player Note / Transaction Reference (Optional)
                </label>
                <textarea
                  rows={2}
                  value={playerNotes}
                  onChange={(e) => setPlayerNotes(e.target.value)}
                  placeholder="e.g. Sent from Cash App tag $player123, transaction ID #..."
                  className="w-full bg-[#080E1C] border border-[#1E2E4D] rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#F59E0B] transition-colors resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !selectedMethodId || !receiptBase64}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#D97706] hover:from-[#FBBF24] hover:to-[#F59E0B] text-[#060B18] font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#F59E0B]/20 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <span>Uploading Proof & Notifying VIP Desk...</span>
                ) : (
                  <>
                    <span>Submit Payment for Verification</span>
                    <Upload className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Submission History Section */}
      <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#F59E0B]" />
            <span>My Payment Submissions</span>
          </h2>
          <span className="text-xs text-slate-400">
            {submissions.length} Total Record{submissions.length === 1 ? '' : 's'}
          </span>
        </div>

        {loadingSubmissions ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading submissions...</div>
        ) : submissions.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-dashed border-[#1E2E4D] bg-[#080E1C]">
            <Info className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400">No payment submissions recorded yet.</p>
            <p className="text-[11px] text-slate-500 mt-1">Transfers you submit above will appear here with live desk review updates.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#080E1C] border-b border-[#1E2E4D] text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Proof</th>
                  <th className="py-3 px-4">Desk Status</th>
                  <th className="py-3 px-4">Staff Review Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2E4D]">
                {submissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-[#131F38]/40 transition-colors">
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {new Date(sub.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-4 font-semibold text-white whitespace-nowrap">
                      {sub.methodLabel}
                    </td>
                    <td className="py-3 px-4 font-bold text-[#F59E0B] whitespace-nowrap">
                      ${sub.amount.toFixed(2)} {sub.currency}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setViewingReceiptUrl(sub.receiptUrl)}
                        className="inline-flex items-center gap-1 text-slate-300 hover:text-white underline cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#F59E0B]" />
                        <span>View Proof</span>
                      </button>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {sub.status === 'approved' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle className="w-3 h-3" />
                          Approved
                        </span>
                      )}
                      {sub.status === 'rejected' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/30">
                          <XCircle className="w-3 h-3" />
                          Declined
                        </span>
                      )}
                      {sub.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          <Clock className="w-3 h-3" />
                          Pending Review
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-300 max-w-xs truncate">
                      {sub.adminNotes || <span className="text-slate-600 italic">None</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Receipt Image Modal */}
      {viewingReceiptUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setViewingReceiptUrl(null)}
        >
          <div
            className="relative max-w-2xl max-h-[90vh] bg-[#0A1224] border border-[#1E2E4D] rounded-2xl p-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setViewingReceiptUrl(null)}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-[#060B18] text-slate-400 hover:text-white border border-[#1E2E4D] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Receipt Proof Screenshot
            </div>
            <img
              src={viewingReceiptUrl}
              alt="Receipt"
              className="max-h-[75vh] w-auto mx-auto object-contain rounded-lg border border-[#1E2E4D]"
            />
          </div>
        </div>
      )}
    </div>
  );
};
