import React, { useMemo, useState } from 'react';
import { Play, ExternalLink, Search, ShieldAlert, Copy, Check, MessageSquare, Sparkles } from 'lucide-react';
import { safeHref } from '../lib/api';
import type { ComplianceState, GameItem, Promotion, ServiceCategory } from '../types/portal';

interface GameGridDashboardProps {
  games: GameItem[];
  categories: ServiceCategory[];
  promotions: Promotion[];
  compliance: ComplianceState | null;
  onPlayGame: (game: GameItem) => void;
  onOpenSupportCategory: (categoryId: string) => void;
}

export const GameGridDashboard: React.FC<GameGridDashboardProps> = ({
  games,
  categories,
  promotions,
  compliance,
  onPlayGame,
  onOpenSupportCategory,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [copiedPromo, setCopiedPromo] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const gameCategories = useMemo(() => {
    const unique = Array.from(new Set(games.map((g) => g.category)));
    return ['All', ...unique];
  }, [games]);

  const filteredGames = useMemo(() => {
    const q = search.trim().toLowerCase();
    return games.filter((g) => {
      const matchesCat = selectedCategory === 'All' || g.category === selectedCategory;
      const matchesSearch =
        !q || g.name.toLowerCase().includes(q) || g.category.toLowerCase().includes(q) || g.description.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [games, search, selectedCategory]);

  const spotlightGame = useMemo(() => {
    return games.find((g) => g.slug === 'juwa-2-0') || games[0] || null;
  }, [games]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedPromo(code);
    setTimeout(() => setCopiedPromo(null), 1800);
  };

  return (
    <div className="space-y-8">
      {/* Compliance & Legal Authorization Notice */}
      {compliance && !compliance.legalAuthorized && (
        <div className="rounded-xl border border-[#F59E0B]/35 bg-[#10192D] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <ShieldAlert className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5 sm:mt-0" />
            <p className="text-xs text-slate-200 leading-relaxed">{compliance.complianceBanner}</p>
          </div>
          <span className="text-[11px] font-semibold text-[#F59E0B] whitespace-nowrap shrink-0">
            Financial Actions Locked
          </span>
        </div>
      )}

      {/* Featured Lounge Hero Showcase */}
      {spotlightGame && (
        <section className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 relative min-h-[240px] lg:min-h-[300px]">
            <img
              src="/src/assets/images/portal_hero_banner_1795217163708.jpg"
              alt="Vanguard Lounge VIP Gaming Floor"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#060B18]/90 via-[#060B18]/45 to-transparent" />
            <div className="absolute inset-0 p-6 sm:p-8 flex flex-col justify-end">
              <p className="text-xs font-medium text-[#38BDF8] mb-1.5">Featured Platform Spotlight</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight [text-wrap:balance]">
                {spotlightGame.name} &amp; 10 Curated Arcade Rooms
              </h2>
              <p className="text-sm text-slate-300 mt-2 max-w-lg">
                Select Play on any platform below to route straight into Support Chat with an automatic external client link delivery.
              </p>
            </div>
          </div>
          <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between bg-[#0B1325] border-t lg:border-t-0 lg:border-l border-[#1E2E4D]">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Active Promotions</span>
                <span className="text-xs font-mono-num text-[#38BDF8]">{promotions.length} available</span>
              </div>
              <div className="space-y-2.5">
                {promotions.slice(0, 3).map((promo) => (
                  <div
                    key={promo.id}
                    className="p-3 rounded-xl bg-[#060B18] border border-[#1E2E4D] flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-semibold text-white">
                        <span className="truncate">{promo.title}</span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span className="text-[#F59E0B] shrink-0">{promo.bonusLabel}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{promo.summary}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(promo.code)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#131F38] hover:bg-[#1B2C4F] border border-[#2563EB]/30 text-[11px] font-mono text-[#38BDF8] flex items-center gap-1.5 shrink-0 cursor-pointer"
                      title="Copy code"
                    >
                      {copiedPromo === promo.code ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{promo.code}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-5 mt-5 border-t border-[#1E2E4D] flex items-center justify-between gap-4">
              <div className="text-xs text-slate-400">
                <span className="text-white font-semibold font-mono-num">{games.length}</span> verified platforms live
              </div>
              <button
                type="button"
                onClick={() => onPlayGame(spotlightGame)}
                className="px-4 py-2 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play {spotlightGame.name}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Filter & Search Toolbar */}
      <section className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Game Platforms</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Click Play to open Support Chat with your game request pre-filled, or launch the external client directly.
            </p>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Juwa, Fire Kirin, Orion..."
              className="w-full pl-10 pr-3.5 py-2 rounded-xl bg-[#0D1629] border border-[#1E2E4D] focus:border-[#38BDF8] focus:outline-none text-sm text-white placeholder:text-slate-500"
            />
          </div>
        </div>

        {/* Interactive Category Segmented Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {gameCategories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#2563EB] text-white'
                    : 'bg-[#0D1629] border border-[#1E2E4D] text-slate-400 hover:text-white hover:border-[#2E4573]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Scrolling Grid of Game Cards */}
        {filteredGames.length === 0 ? (
          <div className="rounded-2xl border border-[#1E2E4D] bg-[#0D1629] p-12 text-center">
            <p className="text-sm font-semibold text-white">No platforms match your filter</p>
            <p className="text-xs text-slate-400 mt-1">Try clearing the search query or selecting All platforms.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredGames.map((game) => {
              const externalLink = safeHref(game.playUrl);
              const imgFailed = failedImages[game.id];

              return (
                <article
                  key={game.id}
                  className="group rounded-2xl border border-[#1E2E4D] bg-[#0D1629] overflow-hidden flex flex-col hover:border-[#38BDF8]/50 transition-colors"
                >
                  {/* 4:3 Artwork Frame with Play Button Overlay & Status Tag */}
                  <div className="relative aspect-[4/3] bg-[#060B18] overflow-hidden">
                    {!imgFailed ? (
                      <img
                        src={game.imagePath}
                        alt={`${game.name} platform artwork`}
                        referrerPolicy="no-referrer"
                        onError={() => setFailedImages((prev) => ({ ...prev, [game.id]: true }))}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#0D1B3E] via-[#0A1328] to-[#060B18] flex flex-col items-center justify-center p-4 text-center">
                        <Sparkles className="w-8 h-8 text-[#F59E0B] mb-2" />
                        <span className="text-sm font-bold text-white">{game.name}</span>
                      </div>
                    )}

                    {/* Measured Gradient Scrim for Legibility */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#060B18] via-[#060B18]/25 to-transparent" />

                    {/* Status Tag (Hot / New / Live) */}
                    {game.statusTag && (
                      <span
                        className={`absolute top-3 left-3 px-2 py-0.5 rounded text-[11px] font-bold tracking-wide border ${
                          game.statusTag === 'Hot'
                            ? 'bg-[#F59E0B]/90 text-[#060B18] border-[#FBBF24]'
                            : game.statusTag === 'New'
                              ? 'bg-[#2563EB]/90 text-white border-[#38BDF8]'
                              : 'bg-[#060B18]/90 text-[#38BDF8] border-[#38BDF8]/60'
                        }`}
                      >
                        {game.statusTag}
                      </span>
                    )}

                    {/* Play Button Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-[#060B18]/45 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
                      <button
                        type="button"
                        onClick={() => onPlayGame(game)}
                        className="px-5 py-2.5 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-xs font-bold flex items-center gap-2 shadow-lg cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Play {game.name}</span>
                      </button>
                    </div>
                  </div>

                  {/* Card Details */}
                  <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-base font-bold text-white truncate">{game.name}</h3>
                        {externalLink && (
                          <a
                            href={externalLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#38BDF8] hover:bg-[#131F38] transition-colors shrink-0"
                            title={`Open ${game.name} external platform`}
                            aria-label={`Open ${game.name} external platform`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                        <span>{game.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num text-slate-300">{game.activePlayers} active</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">{game.description}</p>
                    </div>

                    <div className="pt-2 border-t border-[#1E2E4D] flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onPlayGame(game)}
                        className="flex-1 py-2 px-3 rounded-lg bg-[#F59E0B] hover:bg-[#FBBF24] text-[#060B18] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Play</span>
                      </button>
                      {externalLink && (
                        <a
                          href={externalLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-2 px-3 rounded-lg bg-[#131F38] hover:bg-[#1B2B4B] border border-[#1E2E4D] text-slate-200 text-xs font-medium whitespace-nowrap transition-colors"
                        >
                          Direct Site
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Customer Service Categories Browser */}
      <section className="pt-4 border-t border-[#1E2E4D] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Concierge Service Categories</h2>
            <p className="text-xs text-slate-400">Browse available support lanes and launch a direct conversation.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="rounded-xl border border-[#1E2E4D] bg-[#0D1629] p-4 flex flex-col justify-between gap-3"
            >
              <div>
                <h3 className="text-sm font-semibold text-white">{cat.name}</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{cat.description}</p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[#1E2E4D]">
                <span className="text-[11px] font-mono-num text-slate-400">SLA ~{cat.slaMinutes}m</span>
                <button
                  type="button"
                  onClick={() => onOpenSupportCategory(cat.id)}
                  className="text-xs font-semibold text-[#38BDF8] hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Open Chat</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
