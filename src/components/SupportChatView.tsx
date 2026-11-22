import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Send,
  Plus,
  ExternalLink,
  Download,
  Bot,
  MessageSquare,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Check,
  CheckCheck,
  Gamepad2,
  Phone,
  Paperclip,
  X,
  Eye,
} from 'lucide-react';
import { apiFetch, safeHref, subscribeToRealtime } from '../lib/api';
import type {
  ChatMessage,
  Conversation,
  EnquiryItem,
  GameItem,
  ServiceCategory,
  UserProfile,
} from '../types/portal';

interface SupportChatViewProps {
  user: UserProfile;
  categories: ServiceCategory[];
  selectedGameIntent: GameItem | null;
  draftMessage: string;
  onDraftChange: (text: string) => void;
  onClearGameIntent: () => void;
  initialCategoryId: string | null;
  onRefreshNotifications: () => void;
}

export const SupportChatView: React.FC<SupportChatViewProps> = ({
  user,
  categories,
  selectedGameIntent,
  draftMessage,
  onDraftChange,
  onClearGameIntent,
  initialCategoryId,
  onRefreshNotifications,
}) => {
  const isStaffOrAdmin = user.role === 'staff' || user.role === 'admin';
  const [subMode, setSubMode] = useState<'chat' | 'enquiry'>('chat');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    initialCategoryId || categories[0]?.id || 'cat_onboarding'
  );
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'pending' | 'resolved'>('all');
  const [creatingNew, setCreatingNew] = useState<boolean>(Boolean(selectedGameIntent));

  const [loadingConvs, setLoadingConvs] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attachment state
  const [pendingAttachmentUrl, setPendingAttachmentUrl] = useState<string | null>(null);
  const [pendingAttachmentName, setPendingAttachmentName] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState<boolean>(false);
  const [viewingAttachmentUrl, setViewingAttachmentUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Formal Enquiry state
  const [enquiries, setEnquiries] = useState<EnquiryItem[]>([]);
  const [enqCategory, setEnqCategory] = useState(categories[0]?.name || 'Game Access & Client Links');
  const [enqSubject, setEnqSubject] = useState('');
  const [enqDetails, setEnqDetails] = useState('');
  const [enqFeedback, setEnqFeedback] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialCategoryId) {
      setSelectedCategoryId(initialCategoryId);
      setCreatingNew(true);
    }
  }, [initialCategoryId]);

  useEffect(() => {
    if (selectedGameIntent) {
      setCreatingNew(true);
      setSubMode('chat');
    }
  }, [selectedGameIntent]);

  const loadConversations = useCallback(async () => {
    try {
      const data = await apiFetch<{ conversations: Conversation[] }>('/api/conversations');
      setConversations(data.conversations);
      setLoadingConvs(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load support conversations.');
      setLoadingConvs(false);
    }
  }, []);

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const data = await apiFetch<{ messages: ChatMessage[] }>(`/api/conversations/${convId}/messages`);
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load messages.');
    }
  }, []);

  const loadEnquiries = useCallback(async () => {
    try {
      const data = await apiFetch<{ enquiries: EnquiryItem[] }>('/api/enquiries');
      setEnquiries(data.enquiries);
    } catch {
      // Ignore silent background failure
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    void loadEnquiries();
  }, [loadConversations, loadEnquiries]);

  // Select first conversation automatically when not creating a new game-intent request
  useEffect(() => {
    if (!creatingNew && !activeConvId && conversations.length > 0) {
      setActiveConvId(conversations[0].id);
    }
  }, [conversations, activeConvId, creatingNew]);

  useEffect(() => {
    if (activeConvId && !creatingNew) {
      void loadMessages(activeConvId);
      apiFetch(`/api/conversations/${activeConvId}/read`, { method: 'POST' }).catch(() => {});
    }
  }, [activeConvId, creatingNew, loadMessages]);

  // Subscribe to real-time events for instant message delivery without waiting for poll
  useEffect(() => {
    const unsub = subscribeToRealtime((event) => {
      void loadConversations();
      const convId = typeof event.data?.conversationId === 'string' ? event.data.conversationId : undefined;
      if (activeConvId && convId === activeConvId) {
        void loadMessages(activeConvId);
        if (event.type === 'NEW_MESSAGE') {
          apiFetch(`/api/conversations/${activeConvId}/read`, { method: 'POST' }).catch(() => {});
        }
      }
      onRefreshNotifications();
    });
    return unsub;
  }, [activeConvId, loadConversations, loadMessages, onRefreshNotifications]);

  // Poll fallback every 10 seconds for resiliency
  useEffect(() => {
    const timer = setInterval(() => {
      void loadConversations();
      if (activeConvId && !creatingNew) {
        void loadMessages(activeConvId);
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [activeConvId, creatingNew, loadConversations, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleAttachmentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, WEBP, GIF).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('File size must be under 8MB.');
      return;
    }
    setUploadingAttachment(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        const res = await apiFetch<{ url: string }>('/api/upload/attachment', {
          method: 'POST',
          body: JSON.stringify({
            imageBase64: base64,
            filename: file.name,
          }),
        });
        setPendingAttachmentUrl(res.url);
        setPendingAttachmentName(file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload attachment.');
      } finally {
        setUploadingAttachment(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftMessage.trim();
    if (!trimmed && !pendingAttachmentUrl) return;
    setSending(true);
    setError(null);

    try {
      if (creatingNew || !activeConvId) {
        const res = await apiFetch<{ conversationId: string }>('/api/conversations', {
          method: 'POST',
          body: JSON.stringify({
            categoryId: selectedCategoryId,
            gameId: selectedGameIntent?.id ?? null,
            subject: selectedGameIntent ? `Game Access: ${selectedGameIntent.name}` : undefined,
            initialMessage: trimmed || 'Sent an attachment',
            attachmentUrl: pendingAttachmentUrl || null,
          }),
        });
        onDraftChange('');
        setPendingAttachmentUrl(null);
        setPendingAttachmentName(null);
        onClearGameIntent();
        setCreatingNew(false);
        setActiveConvId(res.conversationId);
        await loadConversations();
        await loadMessages(res.conversationId);
        onRefreshNotifications();
      } else {
        await apiFetch<{ ok: boolean }>(`/api/conversations/${activeConvId}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            body: trimmed || 'Sent an attachment',
            gameId: selectedGameIntent?.id ?? null,
            attachmentUrl: pendingAttachmentUrl || null,
          }),
        });
        onDraftChange('');
        setPendingAttachmentUrl(null);
        setPendingAttachmentName(null);
        onClearGameIntent();
        await loadMessages(activeConvId);
        await loadConversations();
        onRefreshNotifications();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Message failed to send.');
    } finally {
      setSending(false);
    }
  };

  const handleStaffStatusChange = async (convId: string, status: 'open' | 'pending' | 'resolved') => {
    try {
      await apiFetch(`/api/staff/conversations/${convId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update conversation status.');
    }
  };

  const handleSubmitEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnqFeedback(null);
    try {
      await apiFetch('/api/enquiries', {
        method: 'POST',
        body: JSON.stringify({
          category: enqCategory,
          subject: enqSubject,
          details: enqDetails,
        }),
      });
      setEnqSubject('');
      setEnqDetails('');
      setEnqFeedback('Enquiry submitted and logged with support staff.');
      await loadEnquiries();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit enquiry.');
    }
  };

  const filteredConversations = conversations.filter((c) => statusFilter === 'all' || c.status === statusFilter);
  const activeConversation = conversations.find((c) => c.id === activeConvId) || null;

  return (
    <div className="space-y-5">
      {/* Header & Mode Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Concierge Support Desk</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {isStaffOrAdmin
              ? 'Respond to authenticated player conversations and review enquiry queues.'
              : 'Request external game client links, troubleshoot access, or chat directly with support staff.'}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0D1629] border border-[#1E2E4D] self-start">
          <button
            type="button"
            onClick={() => setSubMode('chat')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              subMode === 'chat' ? 'bg-[#2563EB] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Live Chat</span>
          </button>
          <button
            type="button"
            onClick={() => setSubMode('enquiry')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              subMode === 'enquiry' ? 'bg-[#2563EB] text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Formal Enquiries</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-950/30 flex items-center gap-2 text-xs text-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {subMode === 'chat' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[560px]">
          {/* Left Panel: Conversation List */}
          <aside className="lg:col-span-4 rounded-2xl border border-[#1E2E4D] bg-[#0D1629] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#1E2E4D] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">
                  {isStaffOrAdmin ? 'All Customer Threads' : 'Your Conversations'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingNew(true);
                    setActiveConvId(null);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-xs font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Request</span>
                </button>
              </div>

              <div className="flex items-center gap-1">
                {(['all', 'open', 'pending', 'resolved'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`flex-1 py-1 px-2 rounded text-[11px] font-medium capitalize transition-colors cursor-pointer ${
                      statusFilter === st ? 'bg-[#1D4ED8] text-white' : 'text-slate-400 hover:text-white bg-[#060B18]'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#1E2E4D]">
              {loadingConvs ? (
                <div className="p-6 text-xs text-slate-400">Loading conversations...</div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-6 text-center space-y-2">
                  <p className="text-xs font-semibold text-white">No conversations yet</p>
                  <p className="text-[11px] text-slate-400">
                    Start a new request or click Play on any game card to auto-fill a game setup request.
                  </p>
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const selected = !creatingNew && conv.id === activeConvId;
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => {
                        setCreatingNew(false);
                        setActiveConvId(conv.id);
                      }}
                      className={`w-full text-left p-4 transition-colors cursor-pointer ${
                        selected ? 'bg-[#13213D]' : 'hover:bg-[#101B32]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white truncate">{conv.subject}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {Boolean(conv.unreadCount && conv.unreadCount > 0) && (
                            <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                              {conv.unreadCount}
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0 ${
                              conv.status === 'resolved'
                                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/40'
                                : conv.status === 'pending'
                                  ? 'bg-amber-950/60 text-amber-300 border border-amber-700/40'
                                  : 'bg-[#1D4ED8]/30 text-[#38BDF8] border border-[#38BDF8]/30'
                            }`}
                          >
                            {conv.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                        {isStaffOrAdmin && (
                          <>
                            <span className="text-slate-200 font-medium">{conv.customerName}</span>
                            {conv.customerPhone && (
                              <span className="text-[#38BDF8] text-[10px] flex items-center gap-0.5">
                                <Phone className="w-2.5 h-2.5" />
                                {conv.customerPhone}
                              </span>
                            )}
                            <span aria-hidden="true">·</span>
                          </>
                        )}
                        <span className="truncate">{conv.categoryName}</span>
                        {conv.gameName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#F59E0B] text-[10px] font-medium">{conv.gameName}</span>
                          </>
                        )}
                      </div>
                      {conv.lastMessage && (
                        <p className="text-[11px] text-slate-500 truncate mt-1.5">{conv.lastMessage}</p>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Right Panel: Thread & Composer */}
          <section className="lg:col-span-8 rounded-2xl border border-[#1E2E4D] bg-[#0D1629] flex flex-col overflow-hidden">
            {/* Thread Header */}
            <div className="px-5 py-4 border-b border-[#1E2E4D] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0B1325]">
              {creatingNew || !activeConversation ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {selectedGameIntent ? `New Request: ${selectedGameIntent.name}` : 'New Support Request'}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Select a service category and send your message to receive automated client links or staff assistance.
                    </p>
                  </div>
                  <select
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    aria-label="Service Category"
                    className="px-3 py-1.5 rounded-lg bg-[#060B18] border border-[#1E2E4D] text-xs text-white focus:border-[#38BDF8] focus:outline-none"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white truncate">{activeConversation.subject}</h3>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                      <span>{activeConversation.categoryName}</span>
                      {isStaffOrAdmin && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#38BDF8]">
                            {activeConversation.customerName} ({activeConversation.customerTier})
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {isStaffOrAdmin && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(['open', 'pending', 'resolved'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => handleStaffStatusChange(activeConversation.id, st)}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize cursor-pointer ${
                            activeConversation.status === st
                              ? 'bg-[#2563EB] text-white'
                              : 'bg-[#060B18] border border-[#1E2E4D] text-slate-400 hover:text-white'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Linked Game Banner if present */}
            {activeConversation && activeConversation.gameName && (
              <div className="px-5 py-3 bg-[#0A1224] border-b border-[#1E2E4D] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {activeConversation.gameImagePath ? (
                    <img
                      src={activeConversation.gameImagePath}
                      alt={activeConversation.gameName}
                      className="w-10 h-10 rounded-lg object-cover border border-[#F59E0B]/30 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-[#131F38] border border-[#F59E0B]/30 flex items-center justify-center shrink-0">
                      <Gamepad2 className="w-5 h-5 text-[#F59E0B]" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white truncate">{activeConversation.gameName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F59E0B]/20 text-[#F59E0B] font-semibold border border-[#F59E0B]/30 shrink-0">
                        Linked Game
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">
                      Support and automated credentials linked directly to this gaming platform.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Messages Viewport */}
            <div className="flex-1 p-5 overflow-y-auto space-y-4 max-h-[420px] min-h-[300px] bg-[#060B18]/40">
              {creatingNew || !activeConversation ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-10 px-4 space-y-3">
                  <div className="w-11 h-11 rounded-xl bg-[#131F38] border border-[#2563EB]/40 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-[#38BDF8]" />
                  </div>
                  <div className="max-w-md space-y-1">
                    <p className="text-sm font-semibold text-white">
                      {selectedGameIntent
                        ? `Ready to request ${selectedGameIntent.name}`
                        : 'Vanguard Concierge is ready'}
                    </p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Send your pre-filled message below. Our automated concierge immediately replies with the verified external download and launcher link, and support staff are notified for follow-up.
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((msg) => {
                  const isOwn = msg.senderId === user.id;
                  const isBot = msg.senderRole === 'bot';
                  const isStaff = msg.senderRole === 'staff' || msg.senderRole === 'admin';
                  const safeDownload = safeHref(msg.gameLinkPayload?.downloadUrl);
                  const safePlay = safeHref(msg.gameLinkPayload?.playUrl);

                  return (
                    <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-1 px-1">
                        <span className="font-semibold text-slate-300">{msg.senderName}</span>
                        {isBot && <span className="text-[#F59E0B] font-medium">Automated Concierge</span>}
                        {isStaff && !isOwn && <span className="text-[#38BDF8] font-medium">Support Staff</span>}
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed space-y-3 ${
                          isOwn
                            ? 'bg-[#1D4ED8] text-white rounded-br-sm'
                            : isBot
                              ? 'bg-[#0D1629] border border-[#F59E0B]/40 text-slate-100 rounded-bl-sm'
                              : 'bg-[#131F38] border border-[#1E2E4D] text-slate-100 rounded-bl-sm'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.body}</p>

                        {msg.attachmentUrl && (
                          <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#060B18]/70 max-w-sm">
                            <div className="relative group">
                              <img
                                src={msg.attachmentUrl}
                                alt="Attachment"
                                className="max-h-60 w-auto rounded-lg object-contain cursor-pointer transition-transform duration-200 group-hover:scale-[1.01]"
                                onClick={() => setViewingAttachmentUrl(msg.attachmentUrl!)}
                              />
                              <button
                                type="button"
                                onClick={() => setViewingAttachmentUrl(msg.attachmentUrl!)}
                                className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/80 hover:bg-black text-white text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 cursor-pointer"
                                title="View Full Image"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>View</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {msg.gameLinkPayload && (safeDownload || safePlay) && (
                          <div className="p-3 rounded-xl bg-[#060B18] border border-[#1E2E4D] space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-white">
                                {msg.gameLinkPayload.gameName} Client Access
                              </span>
                              <span className="text-[10px] font-mono text-[#38BDF8]">Verified Link</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {safeDownload && (
                                <a
                                  href={safeDownload}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 rounded-lg bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Download Client</span>
                                </a>
                              )}
                              {safePlay && (
                                <a
                                  href={safePlay}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 rounded-lg bg-[#131F38] hover:bg-[#1B2B4B] border border-[#2563EB]/40 text-[#38BDF8] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  <span>Launch Web Platform</span>
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                        {isOwn && (
                          <div className="flex items-center gap-1 justify-end pt-1 text-[10px] text-blue-200">
                            {msg.isRead ? (
                              <span title="Read by recipient" className="text-sky-300 flex items-center gap-0.5">
                                <CheckCheck className="w-3.5 h-3.5" />
                                <span>Read</span>
                              </span>
                            ) : (
                              <span title="Delivered" className="text-blue-300/70 flex items-center gap-0.5">
                                <Check className="w-3.5 h-3.5" />
                                <span>Sent</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <form onSubmit={handleSend} className="p-4 border-t border-[#1E2E4D] bg-[#0B1325]">
              {selectedGameIntent && (
                <div className="mb-2.5 px-3 py-1.5 rounded-lg bg-[#060B18] border border-[#F59E0B]/30 flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-300">
                    Selected platform: <strong className="text-[#F59E0B]">{selectedGameIntent.name}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={onClearGameIntent}
                    className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Pending attachment preview */}
              {pendingAttachmentUrl && (
                <div className="mb-2.5 px-3 py-2 rounded-xl bg-[#060B18] border border-[#2563EB]/40 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={pendingAttachmentUrl}
                      alt="Attachment Preview"
                      className="w-9 h-9 rounded-lg object-cover border border-white/20 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate text-xs">{pendingAttachmentName || 'Attached image'}</p>
                      <p className="text-[10px] text-emerald-400 font-mono">Ready to send</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingAttachmentUrl(null);
                      setPendingAttachmentName(null);
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
                    title="Remove attachment"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAttachmentSelect}
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploadingAttachment}
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-xl bg-[#060B18] border border-[#1E2E4D] hover:border-[#38BDF8] text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                  title="Attach screenshot or receipt image"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  value={draftMessage}
                  onChange={(e) => onDraftChange(e.target.value)}
                  placeholder={uploadingAttachment ? 'Uploading image...' : 'Type a message (e.g., "I want to play Juwa")...'}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[#060B18] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-sm text-white placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={sending || uploadingAttachment || (!draftMessage.trim() && !pendingAttachmentUrl)}
                  className="px-4 py-2.5 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] disabled:opacity-50 text-[#060B18] text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sending ? 'Sending...' : 'Send'}</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : (
        /* Formal Enquiries Sub-View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSubmitEnquiry}
            className="lg:col-span-5 rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-6 space-y-4 self-start"
          >
            <div>
              <h3 className="text-base font-bold text-white">Submit Structured Enquiry</h3>
              <p className="text-xs text-slate-400 mt-1">
                Log an enquiry for account onboarding, tier reviews, or compliance questions.
              </p>
            </div>

            {enqFeedback && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-700/40 text-xs text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{enqFeedback}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Category</label>
              <select
                value={enqCategory}
                onChange={(e) => setEnqCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-sm text-white focus:border-[#38BDF8] focus:outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Subject</label>
              <input
                type="text"
                required
                minLength={3}
                value={enqSubject}
                onChange={(e) => setEnqSubject(e.target.value)}
                placeholder="Account tier verification request"
                className="w-full px-3.5 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-sm text-white focus:border-[#38BDF8] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Details</label>
              <textarea
                required
                minLength={5}
                rows={4}
                value={enqDetails}
                onChange={(e) => setEnqDetails(e.target.value)}
                placeholder="Describe your question or request (do not include card or banking passwords)..."
                className="w-full px-3.5 py-2 rounded-xl bg-[#060B18] border border-[#1E2E4D] text-sm text-white focus:border-[#38BDF8] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-xs font-bold transition-colors cursor-pointer"
            >
              Submit Enquiry
            </button>
          </form>

          <div className="lg:col-span-7 rounded-2xl border border-[#1E2E4D] bg-[#0D1629] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1E2E4D] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Submitted Enquiries</h3>
              <span className="text-xs font-mono-num text-slate-400">{enquiries.length} total</span>
            </div>
            <div className="divide-y divide-[#1E2E4D]">
              {enquiries.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No enquiries logged yet. Use the form to submit a formal request.
                </div>
              ) : (
                enquiries.map((enq) => (
                  <div key={enq.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">{enq.subject}</span>
                      <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-[#060B18] border border-[#1E2E4D] text-[#38BDF8]">
                        {enq.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{enq.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-num flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(enq.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{enq.details}</p>
                    {enq.staffNotes && (
                      <p className="text-xs text-[#F59E0B] pt-1">Staff Note: {enq.staffNotes}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image attachment viewer modal */}
      {viewingAttachmentUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="relative max-w-4xl w-full bg-[#0D1629] border border-[#1E2E4D] rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-5 py-3 border-b border-[#1E2E4D] flex items-center justify-between bg-[#060B18]">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-[#38BDF8]" />
                Attachment Preview
              </span>
              <button
                type="button"
                onClick={() => setViewingAttachmentUrl(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1E2E4D] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-black/40 overflow-auto flex-1">
              <img
                src={viewingAttachmentUrl}
                alt="Full attachment preview"
                className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
              />
            </div>
            <div className="px-5 py-3 border-t border-[#1E2E4D] bg-[#060B18] flex items-center justify-between">
              <a
                href={viewingAttachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#38BDF8] hover:underline flex items-center gap-1"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open original in new tab
              </a>
              <button
                type="button"
                onClick={() => setViewingAttachmentUrl(null)}
                className="px-4 py-1.5 rounded-lg bg-[#1E2E4D] hover:bg-[#2E4573] text-xs font-semibold text-white cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
