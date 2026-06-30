'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { 
  Smile, User, Heart, Leaf, Coffee, Car, Trophy, Lightbulb, HelpCircle, Flag, Clock, Search, X 
} from 'lucide-react';
import { EmojiGroup, EmojiItem } from '@/lib/emoji';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const getCategoryIcon = (groupName: string) => {
  switch (groupName) {
    case 'Smileys & Emotion': return <Smile className="h-4 w-4" />;
    case 'People & Body': return <User className="h-4 w-4" />;
    case 'Animals & Nature': return <Leaf className="h-4 w-4" />;
    case 'Food & Drink': return <Coffee className="h-4 w-4" />;
    case 'Travel & Places': return <Car className="h-4 w-4" />;
    case 'Activities': return <Trophy className="h-4 w-4" />;
    case 'Objects': return <Lightbulb className="h-4 w-4" />;
    case 'Symbols': return <Heart className="h-4 w-4" />;
    case 'Flags': return <Flag className="h-4 w-4" />;
    default: return <HelpCircle className="h-4 w-4" />;
  }
};

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [emojiGroups, setEmojiGroups] = useState<EmojiGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('Recents');
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Performance tuning: render progressively to prevent mount lag
  const [renderLimit, setRenderLimit] = useState(80);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // Load Emojis and Recents
  useEffect(() => {
    // 1. Fetch Emojis from local PWA API endpoint
    fetch('/api/emojis')
      .then((res) => res.json())
      .then((data) => {
        setEmojiGroups(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load emojis:', err);
        setLoading(false);
      });

    // 2. Fetch Recents from Local Storage
    try {
      const saved = localStorage.getItem('herald-recent-emojis');
      if (saved) {
        setRecentEmojis(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to read recents:', e);
    }
  }, []);

  // Progressive rendering trigger: render remaining dataset after mount
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      setRenderLimit(9999);
    }, 300);
    return () => clearTimeout(timer);
  }, [loading]);

  // Handle Emoji Selection
  const handleEmojiSelect = (emojiChar: string) => {
    onSelect(emojiChar);

    // Save/update Recents list
    setRecentEmojis((prev) => {
      const filtered = prev.filter((char) => char !== emojiChar);
      const updated = [emojiChar, ...filtered].slice(0, 36);
      localStorage.setItem('herald-recent-emojis', JSON.stringify(updated));
      return updated;
    });
  };

  // Category tab click - smooth scrolls the list
  const handleCategoryClick = (categoryName: string) => {
    setActiveCategory(categoryName);
    const container = scrollContainerRef.current;
    if (!container) return;

    isScrollingRef.current = true;

    if (categoryName === 'Recents') {
      container.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => { isScrollingRef.current = false; }, 400);
      return;
    }

    const target = document.getElementById(`emoji-section-${categoryName.replace(/\s+/g, '-')}`);
    if (target) {
      container.scrollTo({
        top: target.offsetTop - container.offsetTop,
        behavior: 'smooth'
      });
      setTimeout(() => { isScrollingRef.current = false; }, 400);
    } else {
      isScrollingRef.current = false;
    }
  };

  // Scroll spy to highlight active category tab
  const handleScroll = () => {
    if (isScrollingRef.current || searchQuery) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const containerTop = container.offsetTop;
    const scrollTop = container.scrollTop;

    // Default to Recents if scrolled near top and recents exists
    if (scrollTop < 50 && recentEmojis.length > 0) {
      setActiveCategory('Recents');
      return;
    }

    // Check which category heading is closest to the top of scroll container
    let currentActive = activeCategory;
    for (const group of emojiGroups) {
      const element = document.getElementById(`emoji-section-${group.name.replace(/\s+/g, '-')}`);
      if (element) {
        const offsetTop = element.offsetTop - containerTop;
        if (scrollTop >= offsetTop - 20) {
          currentActive = group.name;
        }
      }
    }
    setActiveCategory(currentActive);
  };

  // Filter emojis by search query (decoupled with transition for performance)
  const filteredResults = React.useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.toLowerCase().trim();
    const results: EmojiItem[] = [];

    for (const group of emojiGroups) {
      for (const emoji of group.emojis) {
        if (emoji.name.toLowerCase().includes(query)) {
          results.push(emoji);
        }
      }
    }
    return results.slice(0, 150); // limit to 150 for peak performance
  }, [searchQuery, emojiGroups]);

  return (
    <div className="absolute bottom-14 left-0 w-72 sm:w-80 rounded-[20px] border border-border-primary bg-card-bg shadow-2xl z-20 overflow-hidden flex flex-col h-[320px] sm:h-[350px] animate-in fade-in slide-in-from-bottom-2 duration-200">
      
      {/* Category Tabs Header */}
      <div className="flex items-center justify-between border-b border-border-primary/65 bg-surface px-2 py-1.5 shrink-0 overflow-x-auto no-scrollbar">
        <div className="flex items-center space-x-1.5 flex-1 overflow-x-auto no-scrollbar">
          {recentEmojis.length > 0 && (
            <button
              type="button"
              onClick={() => handleCategoryClick('Recents')}
              className={`p-2 rounded-lg transition-colors cursor-pointer ${
                activeCategory === 'Recents' 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              title="Recent Emojis"
            >
              <Clock className="h-4 w-4" />
            </button>
          )}
          {emojiGroups.map((group) => (
            <button
              key={group.name}
              type="button"
              onClick={() => handleCategoryClick(group.name)}
              className={`p-2 rounded-lg transition-colors cursor-pointer shrink-0 ${
                activeCategory === group.name 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              title={group.name}
            >
              {getCategoryIcon(group.name)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-surface text-text-secondary hover:text-text-primary cursor-pointer transition-colors ml-1 shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search Input Bar */}
      <div className="px-3 py-2 border-b border-border-primary/50 bg-surface/50 flex items-center space-x-2 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary/70" />
          <input
            type="text"
            placeholder="Search emoji..."
            value={searchQuery}
            onChange={(e) => startTransition(() => setSearchQuery(e.target.value))}
            className="w-full rounded-lg border border-border-primary bg-background py-1.5 pl-8 pr-7 text-xs text-text-primary placeholder-text-secondary/50 outline-none hover:border-text-secondary focus:border-primary transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-text-secondary hover:text-text-primary cursor-pointer p-0.5 rounded-full"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Emoji Tray */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 bg-card-bg"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full space-y-2 py-10">
            <Clock className="h-5 w-5 animate-spin text-primary/50" />
            <span className="text-[10px] text-text-secondary uppercase tracking-widest font-semibold">Loading Emojis</span>
          </div>
        ) : searchQuery ? (
          /* Search Results Grid */
          <div>
            <h4 className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest mb-2 pl-1">
              Search Results
            </h4>
            {filteredResults && filteredResults.length > 0 ? (
              <div className="grid grid-cols-7 gap-1.5">
                {filteredResults.map((emoji) => (
                  <button
                    key={emoji.codePoints}
                    type="button"
                    onClick={() => handleEmojiSelect(emoji.char)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-surface transition-all cursor-pointer hover-scale"
                    title={emoji.name}
                  >
                    {emoji.char}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-text-secondary font-medium">
                No emojis match your search.
              </div>
            )}
          </div>
        ) : (
          /* Grouped Categories List */
          <div className="space-y-4">
            
            {/* Recents Section */}
            {recentEmojis.length > 0 && (
              <div id="emoji-section-Recents">
                <h4 className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest mb-2 pl-1 select-none">
                  Recently Used
                </h4>
                <div className="grid grid-cols-7 gap-1.5">
                  {recentEmojis.map((char, i) => (
                    <button
                      key={`recent-${char}-${i}`}
                      type="button"
                      onClick={() => handleEmojiSelect(char)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-surface transition-all cursor-pointer hover-scale"
                    >
                      {char}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Standard Category Groups */}
            {emojiGroups.map((group) => (
              <div 
                key={group.name} 
                id={`emoji-section-${group.name.replace(/\s+/g, '-')}`}
              >
                <h4 className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest mb-2 pl-1 select-none">
                  {group.name}
                </h4>
                <div className="grid grid-cols-7 gap-1.5">
                  {group.emojis.slice(0, renderLimit).map((emoji) => (
                    <button
                      key={emoji.codePoints}
                      type="button"
                      onClick={() => handleEmojiSelect(emoji.char)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-surface transition-all cursor-pointer hover-scale"
                      title={emoji.name}
                    >
                      {emoji.char}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
