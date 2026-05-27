import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getConversations, getSettings } from '../api/client';

// Global new-message notification dispatcher.
//
// Mounted once at the Layout level so it polls and fires regardless of which
// page (Dashboard / Rules / Settings / ...) the operator is currently viewing.
// Previously this lived inside the Conversations page, which meant switching
// tabs silently disabled notifications.
//
// "Has there been a new message?" is determined by the per-conversation
// `last_message_id` — the primary key of the latest Message row. This is
// strictly monotonic and only advances when a real message is inserted, so:
//   - Image-only DMs (where `last_message` text is empty) still trigger.
//   - Mode toggles, resolved flips, and profile backfills (which bump
//     `updated_at`) do NOT trigger false notifications.
//
// The master `notification_enabled` switch gates everything; the three
// sub-switches (sound / desktop / title flash) are independent.

// Web Audio sine pip. AudioContext is reused across calls so we don't leak
// contexts (browsers cap concurrent contexts at ~6, after which playback
// silently fails). resume() handles the autoplay-policy "suspended" state
// that follows a fresh page load before any user gesture.
let sharedAudioCtx: AudioContext | null = null;
function playNotificationSound() {
  try {
    if (!sharedAudioCtx) {
      const Ctor = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
      if (!Ctor) return;
      sharedAudioCtx = new Ctor();
    }
    const ctx = sharedAudioCtx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => { /* ignore */ });
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch { /* ignore audio errors */ }
}

function showDesktopNotification(title: string, body: string) {
  // Guarded for environments without the Notification API (older WebView,
  // some embedded browsers). Without the guard, reading `Notification.permission`
  // throws ReferenceError.
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((p) => {
      if (p === 'granted') new Notification(title, { body, icon: '/favicon.ico' });
    });
  }
}

export function useNewMessageNotifications() {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    // Settings change rarely. 10s is plenty to pick up toggle changes from
    // another tab while not hammering the API.
    refetchInterval: 10000,
    // Without this, polling pauses when the browser tab is in the
    // background — i.e. exactly when the operator most needs to know
    // a new DM came in.
    refetchIntervalInBackground: true,
    // Skip the default re-render-on-every-refetch. We only care when
    // `data` actually changes (React Query does structural sharing, so
    // identical responses stay referentially equal). Without this, every
    // poll re-rendered the consumer (Layout) even when nothing happened,
    // cascading down to all child pages and breaking Chinese IME
    // composition in any focused textarea.
    notifyOnChangeProps: ['data'],
  });

  // Wrap in an arrow so React Query doesn't pass its QueryFunctionContext
  // object as the `channel` arg of getConversations.
  const { data: convs = [], dataUpdatedAt } = useQuery({
    queryKey: ['conversations', 'instagram'],
    queryFn: () => getConversations('instagram'),
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
    // Same reasoning: only re-render when the conversation list itself
    // changes, not on every successful poll. `dataUpdatedAt` is still
    // read inside the diff effect's deps — when data changes we get a
    // fresh value alongside it, so correctness is preserved.
    notifyOnChangeProps: ['data'],
  });

  // Tidio inbox poll — only fires when the env-driven `tidio_enabled` flag
  // says so. The structural shape (second useQuery alongside the IG one)
  // was proven safe for Chinese IME in the dry-run PR; here we just flip
  // `enabled` to a real condition. notifyOnChangeProps stays — re-renders
  // every 2s would still break IME otherwise.
  const { data: tidioConvs = [], dataUpdatedAt: tidioAt } = useQuery({
    queryKey: ['conversations', 'tidio'],
    queryFn: () => getConversations('tidio'),
    enabled: !!settings?.tidio_enabled,
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
    notifyOnChangeProps: ['data'],
  });

  // Map: conversation id -> last seen message id. Baseline is established on
  // the first non-empty fetch, so the initial load never fires notifications.
  const lastSeenIdRef = useRef<Map<number, number>>(new Map());
  const hasBaselineRef = useRef(false);

  const [unreadCount, setUnreadCount] = useState(0);
  const titleFlashRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalTitleRef = useRef<string>(document.title);

  // Ask for desktop permission once on mount (master enabled or not — the
  // request itself is harmless; actual notifications are gated below).
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => { /* ignore */ });
    }
  }, []);

  // Reset unread when the operator focuses the window (any tab/page).
  useEffect(() => {
    const onFocus = () => setUnreadCount(0);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Title flash. Driven by unreadCount + the title-flash sub-toggle.
  useEffect(() => {
    const enabled = settings?.notification_enabled && settings?.notification_title_flash;
    if (unreadCount > 0 && enabled) {
      let show = true;
      titleFlashRef.current = setInterval(() => {
        document.title = show ? `(${unreadCount}条新消息) InstaBot` : originalTitleRef.current;
        show = !show;
      }, 1000);
    } else {
      if (titleFlashRef.current) clearInterval(titleFlashRef.current);
      document.title = originalTitleRef.current;
    }
    return () => {
      if (titleFlashRef.current) clearInterval(titleFlashRef.current);
    };
  }, [unreadCount, settings?.notification_enabled, settings?.notification_title_flash]);

  // Core diff: detect new user-origin messages by message-id advance.
  useEffect(() => {
    // dataUpdatedAt is 0 until the query has actually completed at least
    // once. Without this guard the effect runs on the initial render with
    // the default `convs = []`, prematurely marks baseline as established,
    // and then floods notifications when real data arrives (every conv
    // looks "new" because prevId is undefined for all of them).
    if (dataUpdatedAt === 0) return;
    // When Tidio is enabled, also wait for its first non-empty response so
    // its conversations get folded into the baseline. tidioAt stays 0
    // when the Tidio query is disabled, so this guard is a no-op there.
    if (settings?.tidio_enabled && tidioAt === 0) return;

    // Merge both channels into a single iteration. Conversation.id is the
    // primary key (globally unique across channels), so lastSeenIdRef
    // stays a flat Map without needing a channel-scoped key.
    const allConvs = settings?.tidio_enabled ? [...convs, ...tidioConvs] : convs;

    if (!hasBaselineRef.current) {
      for (const c of allConvs) {
        if (c.last_message_id != null) lastSeenIdRef.current.set(c.id, c.last_message_id);
      }
      hasBaselineRef.current = true;
      return;
    }

    // Master switch off: still keep the baseline in sync so re-enabling
    // doesn't dump a backlog of stale "new" notifications.
    if (!settings?.notification_enabled) {
      for (const c of allConvs) {
        if (c.last_message_id != null) lastSeenIdRef.current.set(c.id, c.last_message_id);
      }
      return;
    }

    let newCount = 0;
    for (const c of allConvs) {
      const currentId = c.last_message_id;
      if (currentId == null) continue;
      const prevId = lastSeenIdRef.current.get(c.id);
      // prevId === undefined → brand-new conversation that wasn't in baseline.
      // currentId > prevId → a new message landed in an existing conversation.
      const isNew = prevId === undefined || currentId > prevId;
      // Only notify on inbound (user) messages — outbound bot/operator
      // replies shouldn't ping ourselves.
      if (isNew && c.last_message_role === 'user') {
        newCount++;
        if (settings.notification_sound) playNotificationSound();
        if (settings.notification_desktop) {
          // Build a sensible body: prefer text, fall back to "[图片]" for
          // attachment-only messages so the notification isn't blank.
          const body =
            (c.last_message && c.last_message.trim())
              ? c.last_message
              : (c.last_message_has_attachments ? '[图片]' : '');
          // Channel tag in the title so the operator knows which inbox
          // to look at (IG vs Tidio). Keep it short — desktop notification
          // titles get truncated past ~50 chars.
          const tag = c.channel === 'tidio' ? '[Tidio]' : '[IG]';
          showDesktopNotification(
            `${tag} ${prevId === undefined ? '新对话' : '新消息'} - ${c.external_username || c.external_user_id}`,
            body,
          );
        }
      }
      // Always advance the baseline, even for non-user messages, so we
      // don't re-fire on the same id next tick.
      lastSeenIdRef.current.set(c.id, currentId);
    }

    if (newCount > 0 && settings.notification_title_flash) {
      setUnreadCount((prev) => prev + newCount);
    }
    // tidioConvs / tidioAt are in the deps so a Tidio-only update re-runs
    // the diff (otherwise React only sees convs/dataUpdatedAt unchanged
    // and skips it). settings is in there for the tidio_enabled flip.
  }, [convs, tidioConvs, settings, dataUpdatedAt, tidioAt]);
}
