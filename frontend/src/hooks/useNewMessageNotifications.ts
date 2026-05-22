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
  });

  const { data: convs = [], dataUpdatedAt } = useQuery({
    queryKey: ['conversations'],
    queryFn: getConversations,
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  });

  // Temporary diagnostic: log every time the hook actually re-runs its
  // effect, so we can confirm in DevTools console whether it's firing on
  // non-/conversations pages. Remove once the issue is confirmed fixed.
  // eslint-disable-next-line no-console
  console.debug(
    '[notif-hook] render',
    { route: window.location.pathname, dataUpdatedAt, convCount: convs.length, hasBaseline: undefined },
  );

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
    // eslint-disable-next-line no-console
    console.debug('[notif-hook] diff-effect', {
      route: window.location.pathname,
      dataUpdatedAt,
      convCount: convs.length,
      hasBaseline: hasBaselineRef.current,
      notifEnabled: settings?.notification_enabled,
    });
    // dataUpdatedAt is 0 until the query has actually completed at least
    // once. Without this guard the effect runs on the initial render with
    // the default `convs = []`, prematurely marks baseline as established,
    // and then floods notifications when real data arrives (every conv
    // looks "new" because prevId is undefined for all of them).
    if (dataUpdatedAt === 0) return;

    if (!hasBaselineRef.current) {
      for (const c of convs) {
        if (c.last_message_id != null) lastSeenIdRef.current.set(c.id, c.last_message_id);
      }
      hasBaselineRef.current = true;
      return;
    }

    // Master switch off: still keep the baseline in sync so re-enabling
    // doesn't dump a backlog of stale "new" notifications.
    if (!settings?.notification_enabled) {
      for (const c of convs) {
        if (c.last_message_id != null) lastSeenIdRef.current.set(c.id, c.last_message_id);
      }
      return;
    }

    let newCount = 0;
    for (const c of convs) {
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
          showDesktopNotification(
            `${prevId === undefined ? '新对话' : '新消息'} - ${c.ig_username || c.ig_user_id}`,
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
  }, [convs, settings, dataUpdatedAt]);
}
