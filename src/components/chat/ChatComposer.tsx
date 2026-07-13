'use client';

import React, { useState, useRef, useEffect } from 'react';
import EmojiPicker from '@/components/EmojiPicker';
import { Paperclip, Smile, Send, Mic, Plus } from 'lucide-react';

interface ChatComposerProps {
  inputText: string;
  setInputText: (val: string) => void;
  sending: boolean;
  onSendMessage: (text: string) => void;
  onUploadFile: (file: File) => void;
  recipientDisplayName?: string;
}

export default function ChatComposer({
  inputText,
  setInputText,
  sending,
  onSendMessage,
  onUploadFile,
  recipientDisplayName,
}: ChatComposerProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  // Clear composer content when inputText is reset to empty (after sending)
  useEffect(() => {
    if (inputText === '' && inputRef.current && inputRef.current.innerText !== '') {
      inputRef.current.innerText = '';
    }
  }, [inputText]);

  // Click outside to close emoji picker
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = (inputRef.current?.innerText || '').trim();
    if (!cleanText) return;
    onSendMessage(cleanText);
  };

  const handleEmojiClick = (emoji: string) => {
    if (inputRef.current) {
      inputRef.current.innerText = (inputRef.current.innerText || '') + emoji;
      setInputText(inputRef.current.innerText);
    }
    setShowEmojiPicker(false);
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        // Move caret/cursor to end
        const range = document.createRange();
        const sel = window.getSelection();
        if (sel) {
          range.selectNodeContents(inputRef.current);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    });
  };

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onUploadFile(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    let filePasted = false;

    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            filePasted = true;
            onUploadFile(file);
          }
        }
      }
    }

    if (!filePasted) {
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') || '';
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      selection.deleteFromDocument();
      selection.getRangeAt(0).insertNode(document.createTextNode(text));
      if (inputRef.current) {
        setInputText(inputRef.current.innerText || '');
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        onUploadFile(files[i]);
      }
    }
  };

  return (
    <div className="border-t border-border-primary bg-surface px-3 py-3 sm:px-5 sm:py-4 shrink-0 z-10">
      <form
        onSubmit={handleTextSubmit}
        className="flex items-center gap-2 sm:gap-3"
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleAttachmentChange}
          className="hidden"
        />

        {/* Plus Button Placeholder for Scalability */}
        <button
          type="button"
          disabled
          className="hidden sm:flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-background border border-border-primary text-text-secondary/40 cursor-not-allowed"
          title="Actions Menu (Coming Soon)"
        >
          <Plus className="h-4.5 w-4.5" />
        </button>

        {/* Attachment Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-background border border-border-primary text-text-secondary hover:text-text-primary hover:bg-surface transition-all duration-200 cursor-pointer"
          title="Attach Image/File"
        >
          <Paperclip className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
        </button>

        {/* Emoji Button */}
        <div ref={emojiRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className={`flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full border transition-all duration-200 cursor-pointer ${showEmojiPicker
              ? "bg-primary/10 border-primary text-primary"
              : "bg-background border-border-primary text-text-secondary hover:text-text-primary hover:bg-surface"
              }`}
            title="Add Emoji"
          >
            <Smile className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
          </button>

          {showEmojiPicker && (
            <EmojiPicker
              onSelect={handleEmojiClick}
              onClose={() => setShowEmojiPicker(false)}
            />
          )}
        </div>

        {/* ContentEditable Composer */}
        <div
          ref={inputRef}
          contentEditable
          role="textbox"
          aria-multiline="false"
          onInput={(e) => setInputText(e.currentTarget.innerText || '')}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const cleanText = (inputRef.current?.innerText || '').trim();
              if (cleanText) {
                onSendMessage(cleanText);
              }
            }
          }}
          className="
            flex-1
            min-w-0
            max-h-24
            overflow-y-auto
            rounded-2xl
            border border-border-primary
            bg-background
            px-4 sm:px-5
            py-2 sm:py-2.5
            text-sm
            text-text-primary
            outline-none
            transition-all
            duration-200
            hover:border-text-secondary
            focus:border-primary
            focus:ring-2
            focus:ring-primary/20
            empty:before:content-[attr(placeholder)]
            empty:before:text-text-secondary/50
            empty:before:pointer-events-none
          "
          {...{
            placeholder: recipientDisplayName
              ? `Message ${recipientDisplayName}...`
              : "Write a message..."
          }}
        />

        {/* Voice Message Placeholder for Scalability */}
        <button
          type="button"
          disabled
          className="hidden sm:flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-background border border-border-primary text-text-secondary/40 cursor-not-allowed"
          title="Voice Message (Coming Soon)"
        >
          <Mic className="h-4.5 w-4.5" />
        </button>

        {/* Send Button */}
        <button
          type="submit"
          onMouseDown={(e) => e.preventDefault()}
          disabled={sending || !inputText.trim()}
          className="
            flex
            h-9 w-9
            sm:h-10 sm:w-10
            shrink-0
            items-center
            justify-center
            rounded-full
            bg-primary
            text-white
            shadow-sm
            transition-all
            duration-200
            hover:scale-105
            active:scale-95
            disabled:opacity-40
            disabled:cursor-not-allowed
          "
        >
          <Send className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
        </button>
      </form>
    </div>
  );
}
